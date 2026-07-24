import { bearerSubject, boundedInteger, json } from "./http.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("extracts Clerk subject from a bearer JWT without trusting it", () => {
  const payload = btoa(JSON.stringify({ sub: "user_test" }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  assert(bearerSubject(`Bearer header.${payload}.signature`) === "user_test", "subject");
  assert(bearerSubject("Bearer malformed") === null, "malformed token rejected");
});

Deno.test("bounds worker-controlled batch sizes", () => {
  assert(boundedInteger(5000, 200, 1, 1000) === 1000, "upper bound");
  assert(boundedInteger("bad", 200, 1, 1000) === 200, "fallback");
});

Deno.test("builds JSON responses with explicit status and CORS", async () => {
  const response = json({ ok: true }, 202);
  assert(response.status === 202, "status");
  assert(response.headers.get("access-control-allow-origin") === "*", "cors");
  assert((await response.json()).ok === true, "body");
});
