import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerSubject, json as jsonResponse } from "../_shared/http.ts";
import {
  callerSupabaseEnvSchema,
  clerkSessionsSchema,
  parseEnvironment,
  parseJsonBody,
  parseJsonResponse,
  privacyRequestBodySchema,
  supabaseEnvSchema,
  uuidSchema,
  z,
} from "../_shared/validation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  jsonResponse(body, status, cors);
const profileSchema = z.object({
  id: z.string().trim().min(1).max(256),
  society_id: uuidSchema,
  role: z.enum(["resident", "guard", "admin"]),
}).strict();
const artifactSchema = z.object({
  id: uuidSchema,
  storage_path: z.string().trim().min(1).max(1024).nullable(),
  status: z.enum(["pending", "ready", "failed", "expired"]),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();
const deletionPolicySchema = z.coerce.number().int().min(0).max(365);
const signedUrlPolicySchema = z.coerce.number().int().min(60).max(3600);

async function clerkSessions(userId: string, secret: string) {
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/sessions`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!response.ok) throw new Error("clerk_sessions_unavailable");
  const sessions = await parseJsonResponse(response, clerkSessionsSchema);
  if (!sessions) throw new Error("clerk_sessions_invalid");
  return sessions;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const callerId = bearerSubject(authorization);
  if (!callerId) return json({ error: "unauthorized" }, 401);
  const environment = parseEnvironment(callerSupabaseEnvSchema);
  if (!environment) return json({ error: "service_not_configured" }, 503);
  const parsedBody = await parseJsonBody(request, privacyRequestBodySchema);
  if (!parsedBody.success) return parsedBody.response;
  const body = parsedBody.data;

  const caller = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: profile, error: profileError } = await caller
    .from("profiles")
    .select("id,society_id,role")
    .eq("id", callerId)
    .maybeSingle();
  const parsedProfile = profileSchema.safeParse(profile);
  if (profileError || !parsedProfile.success) {
    return json({ error: "unauthorized" }, 401);
  }
  const validatedProfile = parsedProfile.data;

  const action = body.action;
  if (action === "request_export") {
    const { data, error } = await caller.rpc("request_personal_data_export");
    const requestId = uuidSchema.safeParse(data);
    return error || !requestId.success
      ? json({ error: "export_request_failed" }, 500)
      : json({ requestId: requestId.data });
  }
  if (action === "cancel_deletion") {
    const { data, error } = await caller.rpc("cancel_account_deletion");
    const cancelled = z.boolean().safeParse(data);
    return error || !cancelled.success
      ? json({ error: "deletion_cancel_failed" }, 500)
      : json({ cancelled: cancelled.data });
  }
  if (action === "request_deletion") {
    const serviceEnvironment = parseEnvironment(supabaseEnvSchema);
    const configured = deletionPolicySchema.safeParse(
      Deno.env.get("ACCOUNT_DELETION_GRACE_DAYS"),
    );
    const clerkSecret = z.string().trim().min(1).max(4096).safeParse(
      Deno.env.get("CLERK_SECRET_KEY"),
    );
    if (!serviceEnvironment || !configured.success || !clerkSecret.success) {
      return json({ error: "deletion_policy_not_configured" }, 503);
    }
    const service = createClient(
      serviceEnvironment.SUPABASE_URL,
      serviceEnvironment.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data, error } = await service.rpc("request_account_deletion_for", {
      p_profile_id: validatedProfile.id,
      p_default_grace_days: configured.data,
    });
    if (error) return json({ error: "deletion_request_failed" }, 400);
    const requestId = uuidSchema.safeParse(data);
    if (!requestId.success) return json({ error: "deletion_request_failed" }, 500);
    try {
      const sessions = await clerkSessions(validatedProfile.id, clerkSecret.data);
      await Promise.all(
        sessions
          .filter((session) => session.status === "active")
          .map((session) =>
            fetch(
              `https://api.clerk.com/v1/sessions/${encodeURIComponent(session.id)}/revoke`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${clerkSecret.data}` },
              },
            ).then((response) => {
              if (!response.ok) throw new Error("clerk_revoke_failed");
            })
          ),
      );
      return json({ requestId: requestId.data, sessionsRevoked: true });
    } catch {
      return json({ requestId: requestId.data, error: "session_revocation_failed" }, 502);
    }
  }
  if (action === "artifact_url") {
    const { data: artifact } = await caller
      .from("export_artifacts")
      .select("id,storage_path,status,expires_at")
      .eq("id", body.artifactId)
      .maybeSingle();
    const parsedArtifact = artifactSchema.safeParse(artifact);
    if (
      !parsedArtifact.success ||
      parsedArtifact.data.status !== "ready" ||
      !parsedArtifact.data.storage_path ||
      !parsedArtifact.data.expires_at ||
      new Date(parsedArtifact.data.expires_at) <= new Date()
    ) return json({ error: "artifact_unavailable" }, 404);
    const serviceEnvironment = parseEnvironment(supabaseEnvSchema);
    if (!serviceEnvironment) return json({ error: "service_not_configured" }, 503);
    const service = createClient(
      serviceEnvironment.SUPABASE_URL,
      serviceEnvironment.SUPABASE_SERVICE_ROLE_KEY,
    );
    const configured = signedUrlPolicySchema.safeParse(
      Deno.env.get("SIGNED_URL_TTL_SECONDS"),
    );
    if (!configured.success) {
      return json({ error: "signed_url_policy_not_configured" }, 503);
    }
    const remaining = Math.floor(
      (new Date(parsedArtifact.data.expires_at).getTime() - Date.now()) / 1000,
    );
    const { data, error } = await service.storage
      .from("privacy-artifacts")
      .createSignedUrl(
        parsedArtifact.data.storage_path,
        Math.min(configured.data, remaining),
      );
    const signedUrl = z.url().safeParse(data?.signedUrl);
    return error || !signedUrl.success
      ? json({ error: "signed_url_failed" }, 500)
      : json({ url: signedUrl.data });
  }
  return json({ error: "invalid_request" }, 400);
});
