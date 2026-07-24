// imagekit-auth
// Returns short-lived ImageKit *client-side upload* credentials (token,
// expire, signature) to an authenticated Portl society member. The ImageKit
// PRIVATE key is used only here on the server and never ships in the app.
//
// Contract: https://imagekit.io/docs/api-reference/upload-file/client-side-file-upload
//   signature = HMAC-SHA1( token + expire, privateKey )  (hex)
//
// The caller is verified exactly like revoke-guard-session: the Clerk bearer
// token identifies the profile, and we require an active society membership.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerSubject } from "../_shared/http.ts";
import { uuidSchema, z } from "../_shared/validation.ts";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });

const profileSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    society_id: uuidSchema,
    role: z.enum(["resident", "guard", "admin"]),
  })
  .strict();

// Folder must resolve to the caller's own society: /portl/<society>/<bucket>
const folderSchema = z.enum(["visitors", "tickets", "notices", "polls"]);

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha1Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return toHex(sig);
}

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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const IMAGEKIT_PRIVATE_KEY = Deno.env.get("IMAGEKIT_PRIVATE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !IMAGEKIT_PRIVATE_KEY) {
    return json({ error: "service_not_configured" }, 503);
  }

  // Optional body: { folder } — used only to scope/return the upload folder.
  let folder: z.infer<typeof folderSchema> = "visitors";
  try {
    const body = await request.json();
    const parsed = folderSchema.safeParse(body?.folder);
    if (parsed.success) folder = parsed.data;
  } catch {
    // no body / not JSON — default folder
  }

  // Verify the caller is a real society member (RLS-scoped client).
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: caller } = await callerClient
    .from("profiles")
    .select("id,society_id,role")
    .eq("id", callerId)
    .maybeSingle();
  const parsedProfile = profileSchema.safeParse(caller);
  if (!parsedProfile.success) return json({ error: "Forbidden" }, 403);

  // Mint upload credentials (valid ~5 minutes).
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 5 * 60;
  const signature = await hmacSha1Hex(IMAGEKIT_PRIVATE_KEY, token + expire);

  return json({
    token,
    expire,
    signature,
    // The app pins uploads under the caller's society so RLS-equivalent
    // isolation holds on the storage side too.
    folder: `/portl/${parsedProfile.data.society_id}/${folder}`,
  });
});
