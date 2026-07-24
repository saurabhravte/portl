/**
 * Creates a Razorpay order for a maintenance due OR a paid amenity booking.
 * Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (never exposed to the app).
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerSubject } from "../_shared/http.ts";

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
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const callerId = bearerSubject(authorization);
  if (!callerId) return json({ error: "Unauthorized" }, 401);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!keyId || !keySecret || !supabaseUrl || !anonKey) {
    return json({ error: "service_not_configured" }, 503);
  }

  let body: { dueId?: string; bookingId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  let amountPaise = 0;
  let receipt = "";
  let notes: Record<string, string> = { payerId: callerId };
  let societyName = "Portl";
  let descriptionKind: "due" | "amenity" = "due";

  if (body.bookingId && typeof body.bookingId === "string") {
    descriptionKind = "amenity";
    const { data: booking, error } = await callerClient
      .from("amenity_bookings")
      .select(
        "id, status, payment_amount, booked_by, amenity:amenities(name, price, society:societies(name))",
      )
      .eq("id", body.bookingId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!booking) return json({ error: "booking_not_found" }, 404);
    if (booking.booked_by !== callerId) return json({ error: "Forbidden" }, 403);
    if (booking.status !== "pending_payment") {
      return json({ error: "booking_not_payable" }, 409);
    }
    const amenity = booking.amenity as {
      name?: string;
      price?: number;
      society?: { name?: string } | null;
    } | null;
    const amount = Number(booking.payment_amount ?? amenity?.price ?? 0);
    amountPaise = Math.round(amount * 100);
    receipt = `amenity_${booking.id}`.slice(0, 40);
    notes = {
      ...notes,
      kind: "amenity_booking",
      bookingId: booking.id,
      amenityName: amenity?.name ?? "Amenity",
    };
    societyName = amenity?.society?.name ?? "Portl";
  } else if (body.dueId && typeof body.dueId === "string") {
    const { data: due, error } = await callerClient
      .from("maintenance_dues")
      .select(
        "id, period, amount, late_fee_amount, late_fee_waived_at, status, society:societies(name)",
      )
      .eq("id", body.dueId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!due) return json({ error: "due_not_found" }, 404);
    if (due.status !== "due") return json({ error: "due_not_payable" }, 409);
    const lateFee =
      due.late_fee_waived_at != null
        ? 0
        : Number(due.late_fee_amount ?? 0);
    amountPaise = Math.round((Number(due.amount) + (Number.isFinite(lateFee) ? lateFee : 0)) * 100);
    receipt = `due_${due.id}`.slice(0, 40);
    notes = {
      ...notes,
      kind: "maintenance_due",
      dueId: due.id,
      period: due.period,
    };
    societyName =
      (due as { society?: { name?: string } | null }).society?.name ?? "Portl";
  } else {
    return json({ error: "dueId_or_bookingId_required" }, 400);
  }

  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return json({ error: "invalid_amount" }, 422);
  }

  const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    }),
  });
  if (!rzpResponse.ok) {
    const detail = await rzpResponse.text().catch(() => "");
    console.error("razorpay order failed", rzpResponse.status, detail);
    return json({ error: "razorpay_order_failed" }, 502);
  }
  const order = await rzpResponse.json();

  return json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    societyName,
    kind: descriptionKind,
  });
});
