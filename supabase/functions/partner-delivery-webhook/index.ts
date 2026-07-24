/**
 * Partner e-commerce delivery webhook.
 * HMAC: X-Portl-Signature = hex(hmac_sha256(secret, rawBody))
 * Body: { societyId, partner, externalId, tower, flatNumber, visitorName?, validMinutes? }
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hmacSha256Hex, timingSafeEqual } from "../_shared/crypto.ts";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, content-type, x-portl-signature",
      },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "service_not_configured" }, 503);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-portl-signature")?.toLowerCase() ?? "";
  if (!signature) return json({ error: "missing_signature" }, 401);

  let body: {
    societyId?: string;
    partner?: string;
    externalId?: string;
    tower?: string;
    flatNumber?: string;
    visitorName?: string;
    validMinutes?: number;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const societyId = body.societyId?.trim();
  const partner = body.partner?.trim().toLowerCase();
  const externalId = body.externalId?.trim();
  const tower = body.tower?.trim();
  const flatNumber = body.flatNumber?.trim();
  if (!societyId || !partner || !externalId || !tower || !flatNumber) {
    return json({ error: "missing_fields" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: keyRow, error: keyError } = await admin
    .from("delivery_partner_keys")
    .select("hmac_secret, is_active")
    .eq("society_id", societyId)
    .eq("partner_slug", partner)
    .maybeSingle();
  if (keyError) return json({ error: keyError.message }, 500);
  if (!keyRow || !keyRow.is_active) return json({ error: "unknown_partner" }, 403);

  const expected = await hmacSha256Hex(keyRow.hmac_secret, rawBody);
  if (!timingSafeEqual(expected, signature)) {
    return json({ error: "invalid_signature" }, 401);
  }

  const { data, error } = await admin.rpc("insert_partner_delivery_preapproval", {
    p_society_id: societyId,
    p_partner_slug: partner,
    p_external_id: externalId,
    p_tower: tower,
    p_flat_number: flatNumber,
    p_visitor_name: body.visitorName ?? `${partner} delivery`,
    p_valid_minutes: body.validMinutes ?? 120,
  });
  if (error) return json({ error: error.message }, 422);
  return json(data);
});
