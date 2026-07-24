import { z } from "npm:zod@4.4.3";
import { json } from "./http.ts";

export { z };

export const DEFAULT_BODY_LIMIT = 32 * 1024;
export const PROVIDER_BODY_LIMIT = 256 * 1024;

export type ValidationDetail = {
  field: string;
  code: string;
};

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; response: Response };

const contentLengthSchema = z.coerce.number().int().nonnegative();

function validationDetails(error: z.ZodError): ValidationDetail[] {
  return error.issues.slice(0, 20).map((issue) => ({
    field: issue.path.length ? issue.path.map(String).join(".") : "body",
    code: issue.code,
  }));
}

export function invalidResponse(
  error: "invalid_json" | "invalid_request" | "payload_too_large",
  details?: ValidationDetail[],
): Response {
  return json(
    details?.length ? { error, details } : { error },
    error === "payload_too_large" ? 413 : 400,
    { "Content-Type": "application/json" },
  );
}

async function readBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  limit = DEFAULT_BODY_LIMIT,
): Promise<ParseResult<z.output<T>>> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const parsed = contentLengthSchema.safeParse(declared);
    if (!parsed.success) return { success: false, response: invalidResponse("invalid_request") };
    if (parsed.data > limit) {
      return { success: false, response: invalidResponse("payload_too_large") };
    }
  }
  const bytes = await readBytes(request.body, limit);
  if (!bytes) return { success: false, response: invalidResponse("payload_too_large") };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { success: false, response: invalidResponse("invalid_json") };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      response: invalidResponse("invalid_request", validationDetails(parsed.error)),
    };
  }
  return { success: true, data: parsed.data };
}

export async function parseJsonResponse<T extends z.ZodType>(
  response: Response,
  schema: T,
  limit = PROVIDER_BODY_LIMIT,
): Promise<z.output<T> | null> {
  const declared = response.headers.get("content-length");
  if (declared) {
    const parsed = contentLengthSchema.safeParse(declared);
    if (!parsed.success || parsed.data > limit) return null;
  }
  const bytes = await readBytes(response.body, limit);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const secret = z.string().trim().min(1).max(4096);
const url = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Unsupported URL protocol");

export const supabaseEnvSchema = z.object({
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: secret,
});

export const callerSupabaseEnvSchema = z.object({
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: secret,
});

export const pushWorkerEnvSchema = supabaseEnvSchema.extend({
  SEND_PUSH_WEBHOOK_SECRET: secret,
});

export const privacyWorkerEnvSchema = supabaseEnvSchema.extend({
  PRIVACY_WORKER_SECRET: secret,
  PRIVACY_ARTIFACT_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30),
  CLERK_SECRET_KEY: secret,
});

export const retentionWorkerEnvSchema = supabaseEnvSchema.extend({
  PRIVACY_WORKER_SECRET: secret,
});

export const revokeGuardEnvironmentSchema = z.object({
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: secret,
  SUPABASE_SERVICE_ROLE_KEY: secret,
  CLERK_SECRET_KEY: secret,
});

export const privacyRequestBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_export") }).strict(),
  z.object({ action: z.literal("cancel_deletion") }).strict(),
  z.object({ action: z.literal("request_deletion") }).strict(),
  z.object({
    action: z.literal("artifact_url"),
    artifactId: z.uuid(),
  }).strict(),
]);

export const retentionRequestBodySchema = z.object({
  dryRun: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(1000).optional().default(200),
}).strict();

export const revokeGuardSessionBodySchema = z.object({
  guardId: z.string().trim().min(1).max(256),
  deviceSessionId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const clerkSessionsSchema = z.array(
  z.object({
    id: z.string().trim().min(1).max(256),
    status: z.enum(["active", "ended", "expired", "revoked", "abandoned"]),
  }).strict(),
).max(100);

export function parseEnvironment<T extends z.ZodType>(
  schema: T,
  environment: Record<string, string | undefined> = Deno.env.toObject(),
): z.output<T> | null {
  const parsed = schema.safeParse(environment);
  return parsed.success ? parsed.data : null;
}

export const uuidSchema = z.uuid();
export const attemptsSchema = z.number().int().min(0).max(100);

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(4096),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(100),
    z.record(z.string().max(100), jsonValueSchema),
  ])
);

export const boundedPayloadSchema = z.record(
  z.string().max(100),
  jsonValueSchema,
).refine((payload) => JSON.stringify(payload).length <= 4096, {
  message: "Payload exceeds provider limit",
});
