import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  classifyExpoError,
  classifyHttp,
  classifyNetwork,
  expoReceiptsResponseSchema,
  EXPO_RECEIPTS_URL,
  pushReceiptRowsSchema,
  retryAt,
  safeErrorMessage,
  secretsMatch,
  type Failure,
} from "../_shared/push.ts";
import {
  parseEnvironment,
  parseJsonResponse,
  pushWorkerEnvSchema,
  z,
} from "../_shared/validation.ts";

type TicketRow = z.output<typeof pushReceiptRowsSchema>[number];

Deno.serve(async (request) => {
  const environment = parseEnvironment(pushWorkerEnvSchema);
  if (!environment) {
    return Response.json({ error: "service_not_configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied =
    request.headers.get("x-webhook-secret") ??
    (authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
  if (
    !supplied ||
    !secretsMatch(supplied, environment.SEND_PUSH_WEBHOOK_SECRET)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );
  const worker = crypto.randomUUID();
  const { data: pending, error } = await supabase.rpc("claim_push_receipts", {
    p_worker: worker,
    p_limit: 1000,
    p_lease_seconds: 600,
  });
  if (error) {
    return Response.json({ error: "could not claim receipt work" }, { status: 500 });
  }
  const parsedRows = pushReceiptRowsSchema.safeParse(pending ?? []);
  if (!parsedRows.success) {
    return Response.json({ error: "invalid_receipt_work" }, { status: 500 });
  }
  const rows = parsedRows.data;
  if (!rows.length) return Response.json({ processed: 0 });
  let databaseFailures = 0;
  let completed = 0;
  const retry = async (row: TicketRow, failure: Failure) => {
    const { error: retryError } = await supabase.rpc("retry_push_receipt", {
      p_ticket_id: row.ticket_id,
      p_worker: worker,
      p_error_class: failure.errorClass,
      p_error_message: safeErrorMessage(failure),
      p_next_attempt_at: retryAt(row.attempts),
      p_dead: !failure.retryable,
    });
    if (retryError) databaseFailures += 1;
  };
  const retryAll = async (failure: Failure) => {
    for (const row of rows) await retry(row, failure);
  };

  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: rows.map((row) => row.ticket_id) }),
    });
    if (!response.ok) {
      await retryAll(classifyHttp(response.status));
    } else {
      const payload = await parseJsonResponse(
        response,
        expoReceiptsResponseSchema,
      );
      if (!payload) {
        await retryAll({
          retryable: true,
          errorClass: "receipt",
          code: "malformed_expo_response",
          message: "Expo returned an invalid receipt response",
        });
        return Response.json(
          { processed: rows.length, completed, databaseFailures },
          { status: databaseFailures ? 500 : 200 },
        );
      }
      const receipts = payload.data;
      for (const row of rows) {
        const receipt = receipts[row.ticket_id];
        if (!receipt) {
          await retry(row, {
            retryable: true,
            errorClass: "receipt",
            code: "receipt_unavailable",
            message: "Expo receipt is not available yet",
          });
          continue;
        }
        if (receipt.status === "ok") {
          const { data: saved, error: saveError } = await supabase.rpc(
            "complete_push_receipt",
            {
              p_ticket_id: row.ticket_id,
              p_worker: worker,
              p_status: "ok",
              p_error_class: null,
              p_error_code: null,
              p_error_message: null,
            },
          );
          if (saveError || saved !== true) databaseFailures += 1;
          else completed += 1;
          continue;
        }

        const failure = classifyExpoError(
          "receipt",
          receipt.details?.error,
          receipt.message,
        );
        if (failure.code === "DeviceNotRegistered") {
          const { error: invalidationError } = await supabase.rpc(
            "invalidate_push_token",
            {
              p_outbox_id: row.outbox_id,
              p_expected_token: row.expo_push_token,
            },
          );
          if (invalidationError) {
            databaseFailures += 1;
            await retry(row, {
              retryable: true,
              errorClass: "receipt",
              code: "token_invalidation_failed",
              message: "Could not invalidate stale push token",
            });
            continue;
          }
        }
        if (failure.retryable) {
          await retry(row, failure);
        } else {
          const { data: saved, error: saveError } = await supabase.rpc(
            "complete_push_receipt",
            {
              p_ticket_id: row.ticket_id,
              p_worker: worker,
              p_status: "dead",
              p_error_class: failure.errorClass,
              p_error_code: failure.code,
              p_error_message: safeErrorMessage(failure),
            },
          );
          if (saveError || saved !== true) databaseFailures += 1;
          else completed += 1;
        }
      }
    }
  } catch (fetchError) {
    await retryAll(classifyNetwork(fetchError));
  }

  return Response.json(
    { processed: rows.length, completed, databaseFailures },
    { status: databaseFailures ? 500 : 200 },
  );
});
