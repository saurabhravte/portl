import {
  parseEnvironment,
  parseJsonBody,
  parseJsonResponse,
  privacyRequestBodySchema,
  pushWorkerEnvSchema,
  retentionRequestBodySchema,
  revokeGuardEnvironmentSchema,
  revokeGuardSessionBodySchema,
  uuidSchema,
  z,
} from "./validation.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const bodySchema = z.object({
  id: uuidSchema,
  status: z.enum(["pending", "ready"]),
  limit: z.number().int().min(1).max(1000),
}).strict();

Deno.test("rejects malformed JSON without echoing input", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: '{"secret":"do-not-echo"',
  });
  const result = await parseJsonBody(request, bodySchema);
  assert(!result.success, "malformed JSON must fail");
  if (!result.success) {
    const text = await result.response.text();
    assert(result.response.status === 400, "malformed status");
    assert(!text.includes("do-not-echo"), "input is not echoed");
  }
});

Deno.test("rejects oversized request and provider bodies", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ value: "x".repeat(100) }),
  });
  const result = await parseJsonBody(request, z.object({ value: z.string() }), 16);
  assert(!result.success, "oversized request must fail");
  if (!result.success) assert(result.response.status === 413, "oversized status");

  const response = new Response(JSON.stringify({ value: "x".repeat(100) }));
  const parsed = await parseJsonResponse(
    response,
    z.object({ value: z.string() }),
    16,
  );
  assert(parsed === null, "oversized provider body must fail");
});

Deno.test("returns safe field details for strict schemas and bounds", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "not-a-uuid",
      status: "unknown",
      limit: 1001,
      token: "secret",
    }),
  });
  const result = await parseJsonBody(request, bodySchema);
  assert(!result.success, "invalid fields must fail");
  if (!result.success) {
    const payload = await result.response.json();
    assert(payload.error === "invalid_request", "consistent error");
    const fields = payload.details.map((detail: { field: string }) => detail.field);
    assert(fields.includes("id"), "uuid field identified");
    assert(fields.includes("status"), "status field identified");
    assert(fields.includes("limit"), "limit field identified");
    assert(!JSON.stringify(payload).includes("secret"), "unknown value not echoed");
  }
});

Deno.test("validates worker environment URLs and nonempty secrets", () => {
  assert(
    parseEnvironment(pushWorkerEnvSchema, {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-secret",
      SEND_PUSH_WEBHOOK_SECRET: "webhook-secret",
    }) !== null,
    "valid environment",
  );
  assert(
    parseEnvironment(pushWorkerEnvSchema, {
      SUPABASE_URL: "not-a-url",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SEND_PUSH_WEBHOOK_SECRET: "webhook-secret",
    }) === null,
    "invalid environment",
  );
  assert(
    parseEnvironment(revokeGuardEnvironmentSchema, {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CLERK_SECRET_KEY: "",
    }) === null,
    "empty Clerk secret",
  );
});

Deno.test("enforces edge request UUIDs, limits and unknown keys", () => {
  assert(
    !privacyRequestBodySchema.safeParse({
      action: "artifact_url",
      artifactId: "invalid",
    }).success,
    "artifact UUID",
  );
  assert(
    !privacyRequestBodySchema.safeParse({
      action: "request_export",
      unexpected: true,
    }).success,
    "privacy unknown key",
  );
  assert(
    !retentionRequestBodySchema.safeParse({ limit: 0 }).success,
    "lower limit",
  );
  assert(
    !retentionRequestBodySchema.safeParse({ limit: 1001 }).success,
    "upper limit",
  );
  assert(
    !revokeGuardSessionBodySchema.safeParse({
      guardId: "user_guard",
      deviceSessionId: "invalid",
      reason: "valid reason",
    }).success,
    "device session UUID",
  );
});
