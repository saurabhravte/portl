import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  classifyExpoError,
  classifyHttp,
  classifyNetwork,
  EXPO_SEND_URL,
  expoTicketsResponseSchema,
  pushOutboxRowsSchema,
  retryAt,
  safeErrorMessage,
  secretsMatch,
  type Failure,
} from "../_shared/push.ts";
import {
  parseEnvironment,
  parseJsonResponse,
  pushWorkerEnvSchema,
  type z,
} from "../_shared/validation.ts";

type OutboxRow = z.output<typeof pushOutboxRowsSchema>[number];

Deno.serve(async (req) => {
  const environment = parseEnvironment(pushWorkerEnvSchema);
  if (!environment) {
    return Response.json({ error: "service_not_configured" }, { status: 503 });
  }
  const authorization = req.headers.get("authorization") ?? "";
  const suppliedSecret =
    req.headers.get("x-webhook-secret") ??
    (authorization.startsWith("Bearer ") ? authorization.slice(7) : "");

  if (
    !suppliedSecret ||
    !secretsMatch(suppliedSecret, environment.SEND_PUSH_WEBHOOK_SECRET)
  ) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );
  const worker = crypto.randomUUID();
  const { data, error: claimError } = await supabase.rpc("claim_push_outbox", {
    p_worker: worker,
    p_limit: 100,
    p_lease_seconds: 120,
  });
  if (claimError) {
    return Response.json({ error: "could not claim push work" }, { status: 500 });
  }
  const parsedRows = pushOutboxRowsSchema.safeParse(data ?? []);
  if (!parsedRows.success) {
    return Response.json({ error: "invalid_push_work" }, { status: 500 });
  }
  const rows = parsedRows.data;
  if (!rows.length) return Response.json({ processed: 0, accepted: 0 });

  let databaseFailures = 0;
  let accepted = 0;
  const retry = async (row: OutboxRow, failure: Failure) => {
    const { error } = await supabase.rpc("retry_push_outbox", {
      p_outbox_id: row.id,
      p_worker: worker,
      p_error_class: failure.errorClass,
      p_error_code: failure.code,
      p_error_message: safeErrorMessage(failure),
      p_next_attempt_at: retryAt(row.attempts),
      p_dead: !failure.retryable,
    });
    if (error) databaseFailures += 1;
  };

  const valid: OutboxRow[] = rows;

  if (valid.length) {
    try {
      const response = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          valid.map((row) => ({ ...row.payload, to: row.expo_push_token })),
        ),
      });
      if (!response.ok) {
        const failure = classifyHttp(response.status);
        for (const row of valid) await retry(row, failure);
      } else {
        const body = await parseJsonResponse(response, expoTicketsResponseSchema);
        if (!body || body.data.length !== valid.length) {
          const failure: Failure = {
            retryable: true,
            errorClass: "ticket",
            code: "malformed_expo_response",
            message: "Expo returned an invalid ticket response",
          };
          for (const row of valid) await retry(row, failure);
          return Response.json(
            { processed: rows.length, accepted, databaseFailures },
            { status: databaseFailures ? 500 : 200 },
          );
        }
        const tickets = body.data;
        for (let index = 0; index < valid.length; index += 1) {
          const row = valid[index];
          const ticket = tickets[index];
          if (ticket.status === "ok") {
            const { data: completed, error } = await supabase.rpc(
              "complete_push_outbox",
              { p_outbox_id: row.id, p_worker: worker, p_ticket_id: ticket.id },
            );
            if (error || completed !== true) databaseFailures += 1;
            else accepted += 1;
          } else {
            await retry(
              row,
              classifyExpoError(
                "ticket",
                ticket.details?.error,
                ticket.message,
              ),
            );
          }
        }
      }
    } catch (error) {
      const failure = classifyNetwork(error);
      for (const row of valid) await retry(row, failure);
    }
  }
  return Response.json(
    { processed: rows.length, accepted, databaseFailures },
    { status: databaseFailures ? 500 : 200 },
  );
});
