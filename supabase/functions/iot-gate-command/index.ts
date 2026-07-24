import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerSubject, json } from "../_shared/http.ts";
import {
  callerSupabaseEnvSchema,
  parseEnvironment,
  parseJsonBody,
  supabaseEnvSchema,
  uuidSchema,
  z,
} from "../_shared/validation.ts";

const environmentSchema = callerSupabaseEnvSchema.merge(supabaseEnvSchema);

const bodySchema = z.object({
  commandId: uuidSchema,
}).strict();

const profileSchema = z.object({
  id: z.string().trim().min(1).max(256),
  society_id: uuidSchema,
  role: z.enum(["resident", "guard", "admin"]),
}).strict();

const commandSchema = z.object({
  id: uuidSchema,
  society_id: uuidSchema,
  gate_id: uuidSchema,
  device_id: uuidSchema,
  status: z.enum(["pending", "sent", "opened", "failed", "cancelled"]),
  reason: z.string(),
}).strict();

const deviceSchema = z.object({
  id: uuidSchema,
  society_id: uuidSchema,
  provider: z.enum(["mock", "webhook"]),
  webhook_url: z.string().nullable(),
  external_id: z.string().nullable(),
  is_active: z.boolean(),
}).strict();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const callerId = bearerSubject(authorization);
  if (!callerId) return json({ error: "Unauthorized" }, 401);

  const environment = parseEnvironment(environmentSchema);
  if (!environment) return json({ error: "service_not_configured" }, 503);

  const parsedBody = await parseJsonBody(request, bodySchema);
  if (!parsedBody.success) return parsedBody.response;
  const { commandId } = parsedBody.data;

  const callerClient = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: caller } = await callerClient
    .from("profiles")
    .select("id,society_id,role")
    .eq("id", callerId)
    .maybeSingle();
  const parsedCaller = profileSchema.safeParse(caller);
  if (
    !parsedCaller.success ||
    !["guard", "admin"].includes(parsedCaller.data.role)
  ) {
    return json({ error: "Forbidden" }, 403);
  }

  const service = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: commandRow } = await service
    .from("gate_open_commands")
    .select("id,society_id,gate_id,device_id,status,reason")
    .eq("id", commandId)
    .maybeSingle();
  const command = commandSchema.safeParse(commandRow);
  if (!command.success || command.data.society_id !== parsedCaller.data.society_id) {
    return json({ error: "command_not_found" }, 404);
  }
  if (command.data.status !== "pending") {
    return json({ error: "command_not_pending", status: command.data.status }, 409);
  }

  const { data: deviceRow } = await service
    .from("gate_iot_devices")
    .select("id,society_id,provider,webhook_url,external_id,is_active")
    .eq("id", command.data.device_id)
    .maybeSingle();
  const device = deviceSchema.safeParse(deviceRow);
  if (!device.success || !device.data.is_active) {
    await service.rpc("complete_gate_open_command", {
      p_command_id: commandId,
      p_status: "failed",
      p_provider_response: "device_inactive_or_missing",
    });
    return json({ error: "device_unavailable" }, 409);
  }

  await service.rpc("complete_gate_open_command", {
    p_command_id: commandId,
    p_status: "sent",
    p_provider_response: null,
  });

  if (device.data.provider === "mock") {
    await service.rpc("complete_gate_open_command", {
      p_command_id: commandId,
      p_status: "opened",
      p_provider_response: "mock_unlocked",
    });
    return json({ ok: true, status: "opened", provider: "mock" });
  }

  const webhookUrl = device.data.webhook_url;
  if (!webhookUrl) {
    await service.rpc("complete_gate_open_command", {
      p_command_id: commandId,
      p_status: "failed",
      p_provider_response: "missing_webhook_url",
    });
    return json({ error: "missing_webhook_url" }, 500);
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId,
        gateId: command.data.gate_id,
        externalId: device.data.external_id,
        reason: command.data.reason,
        action: "unlock",
      }),
    });
    const bodyText = (await response.text()).slice(0, 500);
    if (!response.ok) {
      await service.rpc("complete_gate_open_command", {
        p_command_id: commandId,
        p_status: "failed",
        p_provider_response: `http_${response.status}:${bodyText}`,
      });
      return json({ error: "provider_failed", status: response.status }, 502);
    }
    await service.rpc("complete_gate_open_command", {
      p_command_id: commandId,
      p_status: "opened",
      p_provider_response: bodyText || "webhook_ok",
    });
    return json({ ok: true, status: "opened", provider: "webhook" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_error";
    await service.rpc("complete_gate_open_command", {
      p_command_id: commandId,
      p_status: "failed",
      p_provider_response: message.slice(0, 500),
    });
    return json({ error: "provider_unreachable" }, 502);
  }
});
