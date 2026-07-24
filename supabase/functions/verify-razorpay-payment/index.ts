/**
 * Verifies a Razorpay payment signature and marks a maintenance due paid
 * OR confirms a paid amenity booking.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerSubject } from "../_shared/http.ts";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const callerId = bearerSubject(authorization);
  if (!callerId) return json({ error: "Unauthorized" }, 401);

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!keySecret || !supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "service_not_configured" }, 503);
  }

  let body: {
    dueId?: string;
    bookingId?: string;
    orderId?: string;
    paymentId?: string;
    signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { dueId, bookingId, orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature || (!dueId && !bookingId)) {
    return json({ error: "missing_fields" }, 400);
  }

  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
  if (!timingSafeEqual(expected, signature)) {
    return json({ error: "invalid_signature" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const paymentResponse = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` } },
  );
  if (!paymentResponse.ok) return json({ error: "payment_lookup_failed" }, 502);
  const payment = await paymentResponse.json();
  if (
    payment.order_id !== orderId ||
    !["captured", "authorized"].includes(payment.status)
  ) {
    return json({ error: "payment_mismatch" }, 409);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  if (bookingId) {
    const { data: booking, error: bookingError } = await callerClient
      .from("amenity_bookings")
      .select("id, status, payment_amount, booked_by")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) return json({ error: bookingError.message }, 500);
    if (!booking) return json({ error: "booking_not_found" }, 404);
    if (booking.booked_by !== callerId) return json({ error: "Forbidden" }, 403);
    const expectedPaise = Math.round(Number(booking.payment_amount ?? 0) * 100);
    if (Number(payment.amount) !== expectedPaise) {
      return json({ error: "payment_mismatch" }, 409);
    }
    const { data, error } = await adminClient.rpc("confirm_amenity_booking_payment", {
      p_booking_id: bookingId,
      p_payment_id: paymentId,
      p_order_id: orderId,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, kind: "amenity_booking", result: data });
  }

  const { data: due, error: dueError } = await callerClient
    .from("maintenance_dues")
    .select("id, status, amount, late_fee_amount, late_fee_waived_at")
    .eq("id", dueId!)
    .maybeSingle();
  if (dueError) return json({ error: dueError.message }, 500);
  if (!due) return json({ error: "due_not_found" }, 404);

  const lateFee =
    due.late_fee_waived_at != null ? 0 : Number(due.late_fee_amount ?? 0);
  const expectedPaise = Math.round(
    (Number(due.amount) + (Number.isFinite(lateFee) ? lateFee : 0)) * 100,
  );
  if (Number(payment.amount) !== expectedPaise) {
    return json({ error: "payment_mismatch" }, 409);
  }

  const { error: updateError } = await adminClient
    .from("maintenance_dues")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_note: `Razorpay ${paymentId} (order ${orderId}) by ${callerId}`,
    })
    .eq("id", dueId!)
    .in("status", ["due", "claimed"]);
  if (updateError) return json({ error: updateError.message }, 500);

  return json({ ok: true, kind: "maintenance_due" });
});
