import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  parseEnvironment,
  parseJsonBody,
  retentionRequestBodySchema,
  retentionWorkerEnvSchema,
  uuidSchema,
  z,
} from "../_shared/validation.ts";

const equal = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let value = 0;
  for (let index = 0; index < left.length; index++) {
    value |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return value === 0;
};
const retentionResultSchema = z.object({
  run_id: uuidSchema,
  scanned: z.number().int().min(0).max(1000),
  affected: z.number().int().min(0).max(1000),
  dry_run: z.boolean(),
}).strict();
const evidenceSchema = z.object({
  evidence: z.object({
    candidate_ids: z.array(uuidSchema).max(1000),
  }).passthrough(),
}).strict();
const artifactRowsSchema = z.array(z.object({
  id: uuidSchema,
  storage_path: z.string().trim().min(1).max(1024).nullable(),
}).strict()).max(1000);
const orphanRowsSchema = z.array(z.object({
  bucket: z.enum(["society-media", "privacy-artifacts"]),
  path: z.string().trim().min(1).max(1024),
}).strict()).max(1000);

Deno.serve(async (request) => {
  const environment = parseEnvironment(retentionWorkerEnvSchema);
  if (!environment) {
    return Response.json({ error: "service_not_configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-webhook-secret") ?? "";
  if (
    request.method !== "POST" ||
    !equal(environment.PRIVACY_WORKER_SECRET, supplied)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsedBody = await parseJsonBody(request, retentionRequestBodySchema);
  if (!parsedBody.success) return parsedBody.response;
  const { dryRun, limit } = parsedBody.data;
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: scan, error: scanError } = await supabase.rpc(
    "run_privacy_retention_cleanup",
    { p_limit: limit, p_dry_run: true },
  );
  const parsedScan = retentionResultSchema.safeParse(scan);
  if (scanError || !parsedScan.success) {
    return Response.json({ error: "retention_scan_failed" }, { status: 500 });
  }
  const { data: evidence } = await supabase.from("cleanup_job_runs")
    .select("evidence").eq("id", parsedScan.data.run_id).single();
  const parsedEvidence = evidenceSchema.safeParse(evidence);
  if (!parsedEvidence.success) {
    return Response.json({ error: "retention_evidence_invalid" }, { status: 500 });
  }
  const candidateIds = parsedEvidence.data.evidence.candidate_ids;
  const { data: expired } = candidateIds.length
    ? await supabase.from("export_artifacts").select("id,storage_path").in("id", candidateIds)
    : { data: [] };
  const parsedExpired = artifactRowsSchema.safeParse(expired ?? []);
  if (!parsedExpired.success) {
    return Response.json({ error: "retention_artifacts_invalid" }, { status: 500 });
  }
  const expiredPaths = parsedExpired.data
    .map((row) => row.storage_path)
    .filter((path): path is string => !!path);
  if (!dryRun && expiredPaths.length) {
    const { error } = await supabase.storage.from("privacy-artifacts").remove(expiredPaths);
    if (error) return Response.json({ error: "artifact_cleanup_failed" }, { status: 500 });
  }
  const cleanupResult = dryRun
    ? { data: parsedScan.data, error: null }
    : await supabase.rpc("run_privacy_retention_cleanup", {
        p_limit: limit,
        p_dry_run: false,
      });
  const retention = retentionResultSchema.safeParse(cleanupResult.data);
  if (cleanupResult.error || !retention.success) {
    return Response.json({ error: "retention_cleanup_failed" }, { status: 500 });
  }

  const { data: orphanData, error: orphanError } = await supabase.rpc(
    "list_orphan_media",
    { p_limit: limit },
  );
  if (orphanError) return Response.json({ error: "orphan_scan_failed" }, { status: 500 });
  const parsedOrphans = orphanRowsSchema.safeParse(orphanData);
  if (!parsedOrphans.success) {
    return Response.json({ error: "orphan_scan_invalid" }, { status: 500 });
  }
  const orphans = parsedOrphans.data;
  let removed = 0;
  if (!dryRun) {
    for (const bucket of ["society-media", "privacy-artifacts"]) {
      const paths = orphans.filter((row) => row.bucket === bucket).map((row) => row.path);
      if (!paths.length) continue;
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) return Response.json({ error: "orphan_cleanup_failed" }, { status: 500 });
      removed += paths.length;
    }
  }
  await supabase.from("cleanup_job_runs").insert({
    job_type: "orphan_media",
    dry_run: dryRun,
    scanned_count: orphans.length,
    affected_count: removed,
    evidence: { candidates: orphans },
  });
  return Response.json({
    dryRun,
    expiredArtifacts: retention.data,
    orphanCandidates: orphans.length,
    orphanRemoved: removed,
  });
});
