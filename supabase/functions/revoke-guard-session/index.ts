import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerSubject } from "../_shared/http.ts";
import {
  clerkSessionsSchema,
  parseEnvironment,
  parseJsonBody,
  parseJsonResponse,
  revokeGuardEnvironmentSchema,
  revokeGuardSessionBodySchema,
  uuidSchema,
  z,
} from "../_shared/validation.ts";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
const profileSchema = z.object({
  id: z.string().trim().min(1).max(256),
  society_id: uuidSchema,
  role: z.enum(["resident", "guard", "admin"]),
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
  const environment = parseEnvironment(revokeGuardEnvironmentSchema);
  if (!environment) return json({ error: "service_not_configured" }, 503);
  const parsedBody = await parseJsonBody(request, revokeGuardSessionBodySchema);
  if (!parsedBody.success) return parsedBody.response;
  const { guardId, deviceSessionId, reason } = parsedBody.data;

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
  const parsedAdmin = profileSchema.safeParse(caller);
  if (!parsedAdmin.success || parsedAdmin.data.role !== "admin") {
    return json({ error: "Forbidden" }, 403);
  }
  const admin = parsedAdmin.data;

  const service = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data: guard } = await service
    .from("profiles")
    .select("id,society_id,role")
    .eq("id", guardId)
    .single();
  const parsedGuard = profileSchema.safeParse(guard);
  if (
    !parsedGuard.success ||
    parsedGuard.data.role !== "guard" ||
    parsedGuard.data.society_id !== admin.society_id
  ) {
    return json({ error: "Guard not found in your society" }, 404);
  }

  const sessionsResponse = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(guardId)}/sessions`, {
    headers: { Authorization: `Bearer ${environment.CLERK_SECRET_KEY}` },
  });
  if (!sessionsResponse.ok) return json({ error: "Could not list Clerk sessions" }, 502);
  const sessions = await parseJsonResponse(sessionsResponse, clerkSessionsSchema);
  if (!sessions) return json({ error: "Could not validate Clerk sessions" }, 502);
  let revoked = 0;
  for (const session of sessions) {
    if (session.status !== "active") continue;
    const response = await fetch(`https://api.clerk.com/v1/sessions/${encodeURIComponent(session.id)}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${environment.CLERK_SECRET_KEY}` },
    });
    if (response.ok) revoked += 1;
  }
  const { error } = await service
    .from("guard_device_sessions")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: admin.id,
      revoke_reason: reason,
    })
    .eq("id", deviceSessionId)
    .eq("guard_id", guardId)
    .eq("society_id", admin.society_id);
  if (error) return json({ error: "Clerk revoked, but device audit update failed" }, 500);
  return json({ revokedClerkSessions: revoked, deviceSessionId });
});
