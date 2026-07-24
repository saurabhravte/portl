import { createClient } from "jsr:@supabase/supabase-js@2";
import { secretsMatch } from "../_shared/push.ts";
import {
  jsonValueSchema,
  parseEnvironment,
  privacyWorkerEnvSchema,
  uuidSchema,
  z,
} from "../_shared/validation.ts";

const encodeHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
const csv = (value: unknown) => {
  const text = value == null
    ? ""
    : typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};
const profileIdSchema = z.string().trim().min(1).max(256);
const personalRowsSchema = z.array(z.object({
  id: uuidSchema,
  society_id: uuidSchema,
  profile_id: profileIdSchema,
}).strict()).max(10);
const auditJobsSchema = z.array(z.object({
  id: uuidSchema,
  society_id: uuidSchema,
  actor_id: profileIdSchema,
  format: z.enum(["csv", "json"]),
  filters: z.object({
    action: z.string().trim().min(1).max(128).optional(),
  }).passthrough().refine((value) => JSON.stringify(value).length <= 4096),
  artifact_id: uuidSchema,
  created_at: z.iso.datetime({ offset: true }),
}).strict()).max(5);
const deletionRowsSchema = z.array(z.object({
  id: uuidSchema,
  society_id: uuidSchema,
  profile_id: profileIdSchema,
}).strict()).max(10);
const snapshotRecordSchema = z.record(z.string().max(100), jsonValueSchema);
const snapshotSchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  profile: snapshotRecordSchema.nullable(),
  visitor_requests: z.array(snapshotRecordSchema).max(10_000),
  bookings: z.array(snapshotRecordSchema).max(10_000),
  notifications: z.array(snapshotRecordSchema).max(10_000),
}).strict().refine((value) => JSON.stringify(value).length <= 10 * 1024 * 1024);
const visitorRowsSchema = z.array(z.object({
  visitor_id: uuidSchema,
}).strict()).max(10_000);
const mediaRowsSchema = z.array(z.object({
  photo_url: z.string().trim().min(1).max(1024),
}).strict()).max(10_000);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const environment = parseEnvironment(privacyWorkerEnvSchema);
  if (!environment) {
    return Response.json({ error: "service_not_configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-webhook-secret") ?? "";
  if (!supplied || !secretsMatch(environment.PRIVACY_WORKER_SECRET, supplied)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const ttlHours = environment.PRIVACY_ARTIFACT_TTL_HOURS;
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );
  const metrics = { personalExports: 0, auditExports: 0, deletions: 0, failures: 0 };
  const expiresAt = () => new Date(Date.now() + ttlHours * 3_600_000).toISOString();

  const { data: personal } = await supabase
    .from("personal_data_export_requests")
    .select("id,society_id,profile_id")
    .eq("status", "pending")
    .order("requested_at")
    .limit(10);
  const parsedPersonal = personalRowsSchema.safeParse(personal ?? []);
  if (!parsedPersonal.success) {
    return Response.json({ error: "invalid_personal_export_work" }, { status: 500 });
  }
  for (const requestRow of parsedPersonal.data) {
    const { data: claimed } = await supabase
      .from("personal_data_export_requests")
      .update({ status: "processing" })
      .eq("id", requestRow.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
      const { data: snapshot, error } = await supabase.rpc(
        "build_personal_export_snapshot",
        { p_profile_id: requestRow.profile_id },
      );
      const parsedSnapshot = snapshotSchema.safeParse(snapshot);
      if (error || !parsedSnapshot.success) throw new Error("snapshot_failed");
      const bytes = new TextEncoder().encode(JSON.stringify(parsedSnapshot.data));
      const hash = encodeHex(await crypto.subtle.digest("SHA-256", bytes));
      const artifactId = crypto.randomUUID();
      const path = `${requestRow.society_id}/personal/${artifactId}.json`;
      const { error: uploadError } = await supabase.storage
        .from("privacy-artifacts")
        .upload(path, bytes, { contentType: "application/json", upsert: false });
      if (uploadError) throw new Error("upload_failed");
      const { error: artifactError } = await supabase.from("export_artifacts").insert({
        id: artifactId,
        society_id: requestRow.society_id,
        owner_id: requestRow.profile_id,
        kind: "personal_json",
        storage_path: path,
        status: "ready",
        expires_at: expiresAt(),
        byte_size: bytes.byteLength,
        sha256: hash,
        completed_at: new Date().toISOString(),
      });
      if (artifactError) {
        await supabase.storage.from("privacy-artifacts").remove([path]);
        throw new Error("artifact_write_failed");
      }
      await supabase.from("personal_data_export_requests").update({
        status: "ready",
        artifact_id: artifactId,
        completed_at: new Date().toISOString(),
      }).eq("id", requestRow.id);
      await supabase.from("notifications").insert({
        user_id: requestRow.profile_id,
        type: "privacy_export",
        payload: {
          title: "Your data export is ready",
          body: "Open Profile to download it before it expires.",
          url: "/(resident)/profile",
        },
      });
      metrics.personalExports++;
    } catch {
      metrics.failures++;
      await supabase.from("personal_data_export_requests").update({
        status: "failed",
        error_code: "worker_failed",
      }).eq("id", requestRow.id);
    }
  }

  const { data: auditJobs } = await supabase
    .from("admin_export_jobs")
    .select("id,society_id,actor_id,format,filters,artifact_id,created_at")
    .eq("status", "pending")
    .order("created_at")
    .limit(5);
  const parsedAuditJobs = auditJobsSchema.safeParse(auditJobs ?? []);
  if (!parsedAuditJobs.success) {
    return Response.json({ error: "invalid_audit_export_work" }, { status: 500 });
  }
  for (const job of parsedAuditJobs.data) {
    const { data: claimed } = await supabase.from("admin_export_jobs")
      .update({ status: "processing" }).eq("id", job.id).eq("status", "pending")
      .select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const rows: Record<string, unknown>[] = [];
      let offset = 0;
      for (;;) {
        let query = supabase.from("admin_audit_events").select("*")
          .eq("society_id", job.society_id)
          .lte("created_at", job.created_at)
          .order("created_at").order("id")
          .range(offset, offset + 999);
        const action = typeof job.filters?.action === "string" ? job.filters.action : null;
        if (action) query = query.eq("action", action);
        const { data, error } = await query;
        if (error) throw new Error("audit_read_failed");
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
        offset += data.length;
      }
      const content = job.format === "json"
        ? JSON.stringify({ generated_at: new Date().toISOString(), rows })
        : [
            "id,created_at,actor_id,actor_role,action,target_type,target_id,correlation_id,before_state,after_state",
            ...rows.map((row) => [
              row.id, row.created_at, row.actor_id, row.actor_role, row.action,
              row.target_type, row.target_id, row.correlation_id,
              row.before_state, row.after_state,
            ].map(csv).join(",")),
          ].join("\n");
      const bytes = new TextEncoder().encode(content);
      const extension = job.format === "json" ? "json" : "csv";
      const path = `${job.society_id}/audit/${job.artifact_id}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("privacy-artifacts")
        .upload(path, bytes, {
          contentType: job.format === "json" ? "application/json" : "text/csv",
          upsert: false,
        });
      if (uploadError) throw new Error("upload_failed");
      const hash = encodeHex(await crypto.subtle.digest("SHA-256", bytes));
      await supabase.from("export_artifacts").update({
        storage_path: path,
        status: "ready",
        expires_at: expiresAt(),
        byte_size: bytes.byteLength,
        sha256: hash,
        completed_at: new Date().toISOString(),
      }).eq("id", job.artifact_id);
      await supabase.from("admin_export_jobs").update({
        status: "ready",
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      metrics.auditExports++;
    } catch {
      metrics.failures++;
      await supabase.from("admin_export_jobs").update({
        status: "failed", error_code: "worker_failed",
      }).eq("id", job.id);
      await supabase.from("export_artifacts").update({
        status: "failed", error_code: "worker_failed",
      }).eq("id", job.artifact_id);
    }
  }

  const { data: deletions } = await supabase
    .from("account_deletion_requests")
    .select("id,society_id,profile_id")
    .in("status", ["pending", "held", "failed"])
    .lte("execute_after", new Date().toISOString())
    .order("execute_after")
    .limit(10);
  const parsedDeletions = deletionRowsSchema.safeParse(deletions ?? []);
  if (!parsedDeletions.success) {
    return Response.json({ error: "invalid_deletion_work" }, { status: 500 });
  }
  for (const deletion of parsedDeletions.data) {
    const { count: holds } = await supabase.from("privacy_legal_holds")
      .select("id", { count: "exact", head: true })
      .eq("society_id", deletion.society_id)
      .is("released_at", null)
      .or(`profile_id.is.null,profile_id.eq.${deletion.profile_id}`);
    if (holds) {
      await supabase.from("account_deletion_requests")
        .update({ status: "held" }).eq("id", deletion.id);
      continue;
    }
    const { data: claimed } = await supabase.from("account_deletion_requests")
      .update({ status: "processing" }).eq("id", deletion.id).in("status", ["pending", "held", "failed"])
      .select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const { data: visitorRows } = await supabase.from("visitor_requests")
        .select("visitor_id").eq("raised_by", deletion.profile_id);
      const parsedVisitorRows = visitorRowsSchema.safeParse(visitorRows ?? []);
      if (!parsedVisitorRows.success) throw new Error("visitor_rows_invalid");
      const visitorIds = parsedVisitorRows.data.map((row) => row.visitor_id);
      if (visitorIds.length) {
        const { data: media } = await supabase.from("visitors")
          .select("photo_url").in("id", visitorIds).not("photo_url", "is", null);
        const parsedMedia = mediaRowsSchema.safeParse(media ?? []);
        if (!parsedMedia.success) throw new Error("media_rows_invalid");
        const paths = parsedMedia.data.map((row) =>
          String(row.photo_url).replace(/^society-media:/, "")
        );
        if (paths.length) await supabase.storage.from("society-media").remove(paths);
        await supabase.from("visitors").update({ phone: null, photo_url: null })
          .in("id", visitorIds);
      }
      await supabase.from("push_tokens").delete().eq("user_id", deletion.profile_id);
      await supabase.from("profiles").update({
        name: `Deleted user ${deletion.id.slice(0, 8)}`,
        phone: null,
        email: null,
        expo_push_token: null,
        flat_id: null,
      }).eq("id", deletion.profile_id);
      const clerk = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(deletion.profile_id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${environment.CLERK_SECRET_KEY}` },
        },
      );
      if (!clerk.ok && clerk.status !== 404) throw new Error("clerk_delete_failed");
      await supabase.from("account_deletion_requests").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", deletion.id);
      metrics.deletions++;
    } catch {
      metrics.failures++;
      await supabase.from("account_deletion_requests").update({
        status: "failed", error_code: "worker_failed",
      }).eq("id", deletion.id);
    }
  }

  return Response.json(metrics, { status: metrics.failures ? 207 : 200 });
});
