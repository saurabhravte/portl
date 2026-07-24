import { Alert, Linking } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUpiLink } from "@/features/productWorkflows/upi";
import type { DueRow } from "@/features/community/hooks";
import { duePayableAmount } from "@/lib/money";
import type { ThemeColors } from "@/theme/tokens";

/**
 * Razorpay checkout for maintenance dues.
 *
 * Flow (secrets never touch the app):
 *  1. Edge function `create-razorpay-order` creates the order server-side.
 *  2. Native Razorpay sheet opens with the order id + public key id.
 *  3. Edge function `verify-razorpay-payment` verifies the HMAC signature
 *     and marks the due paid via the service role.
 *
 * `react-native-razorpay` is a native module — it works in dev-client /
 * EAS builds, not Expo Go. In Expo Go (or if no key is configured) we fall
 * back to the existing UPI intent + "I've paid" claim flow.
 */

export const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? "";

type RazorpayModule = {
  open: (options: Record<string, unknown>) => Promise<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }>;
};

function loadRazorpay(): RazorpayModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-razorpay");
    return (mod?.default ?? mod) as RazorpayModule;
  } catch {
    return null; // Expo Go / module not linked
  }
}

export function isRazorpayAvailable() {
  return !!RAZORPAY_KEY_ID && !!loadRazorpay();
}

export interface CheckoutContext {
  supabase: SupabaseClient;
  due: DueRow;
  user: { name?: string | null; email?: string | null; phone?: string | null };
  colors: ThemeColors;
  /** Existing fallback: UPI intent app-to-app payment. */
  upi?: { upiId: string; payeeName: string } | null;
}

export type PayDueResult =
  | {
      status: "paid";
      paymentId: string;
      orderId: string;
      paidAt: string;
      societyName?: string;
    }
  | { status: "fallback" }
  | { status: "cancelled" };

export async function payDueWithRazorpay({
  supabase,
  due,
  user,
  colors,
  upi,
}: CheckoutContext): Promise<PayDueResult> {
  const RazorpayCheckout = loadRazorpay();

  if (!RazorpayCheckout || !RAZORPAY_KEY_ID) {
    // Graceful fallback to the UPI deep link used before.
    if (upi?.upiId) {
      await Linking.openURL(
        buildUpiLink({
          upiId: upi.upiId,
          payeeName: upi.payeeName,
          amount: duePayableAmount(due),
          period: due.period,
        }),
      ).catch(() =>
        Alert.alert(
          "No UPI app found",
          "Install any UPI app (GPay, PhonePe, Paytm) or pay by cash/cheque, then tap \"I've paid\".",
        ),
      );
      return { status: "fallback" };
    }
    Alert.alert(
      "Payments not configured",
      "Online payment isn't set up for this society yet. Pay by cash/cheque and tap \"I've paid\".",
    );
    return { status: "fallback" };
  }

  // 1. Server-side order
  const { data: order, error } = await supabase.functions.invoke(
    "create-razorpay-order",
    { body: { dueId: due.id } },
  );
  if (error || !order?.orderId) {
    Alert.alert(
      "Couldn’t start payment",
      error?.message ?? "Check your connection and try again.",
    );
    return { status: "cancelled" };
  }

  // 2. Native checkout sheet
  try {
    const result = await RazorpayCheckout.open({
      key: RAZORPAY_KEY_ID,
      order_id: order.orderId,
      amount: order.amount, // paise, informational — order is authoritative
      currency: "INR",
      name: order.societyName ?? "Portl",
      description: `Maintenance · ${due.period}`,
      prefill: {
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        contact: user.phone ?? undefined,
      },
      theme: { color: colors.primary },
    });

    // 3. Server-side signature verification
    const { data: verified, error: verifyError } =
      await supabase.functions.invoke("verify-razorpay-payment", {
        body: {
          dueId: due.id,
          orderId: result.razorpay_order_id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        },
      });
    if (verifyError || !verified?.ok) {
      Alert.alert(
        "Payment received — verification pending",
        "We received the payment but couldn't verify it yet. It will reflect once your admin's dashboard syncs.",
      );
      return { status: "cancelled" };
    }
    return {
      status: "paid",
      paymentId: result.razorpay_payment_id,
      orderId: result.razorpay_order_id,
      paidAt: new Date().toISOString(),
      societyName: order.societyName ?? undefined,
    };
  } catch (e: any) {
    // code 0/2 = user cancelled the sheet — stay quiet.
    if (e?.code !== 0 && e?.code !== 2 && e?.description) {
      Alert.alert("Payment failed", String(e.description));
    }
    return { status: "cancelled" };
  }
}

export interface AmenityCheckoutContext {
  supabase: SupabaseClient;
  booking: {
    id: string;
    payment_amount: number | null;
    amenity: { name: string };
  };
  user: { name?: string | null; email?: string | null; phone?: string | null };
  colors: ThemeColors;
}

export async function payAmenityWithRazorpay({
  supabase,
  booking,
  user,
  colors,
}: AmenityCheckoutContext): Promise<PayDueResult> {
  const RazorpayCheckout = loadRazorpay();
  if (!RazorpayCheckout || !RAZORPAY_KEY_ID) {
    Alert.alert(
      "Payments not configured",
      "Online amenity checkout needs a Razorpay-enabled build. Ask your admin to confirm payment offline if needed.",
    );
    return { status: "fallback" };
  }

  const { data: order, error } = await supabase.functions.invoke(
    "create-razorpay-order",
    { body: { bookingId: booking.id } },
  );
  if (error || !order?.orderId) {
    Alert.alert(
      "Couldn’t start payment",
      error?.message ?? "Check your connection and try again.",
    );
    return { status: "cancelled" };
  }

  try {
    const result = await RazorpayCheckout.open({
      key: RAZORPAY_KEY_ID,
      order_id: order.orderId,
      amount: order.amount,
      currency: "INR",
      name: order.societyName ?? "Portl",
      description: `Amenity · ${booking.amenity.name}`,
      prefill: {
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        contact: user.phone ?? undefined,
      },
      theme: { color: colors.primary },
    });

    const { data: verified, error: verifyError } =
      await supabase.functions.invoke("verify-razorpay-payment", {
        body: {
          bookingId: booking.id,
          orderId: result.razorpay_order_id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        },
      });
    if (verifyError || !verified?.ok) {
      Alert.alert(
        "Payment received — verification pending",
        "We received the payment but couldn't verify it yet. Pull to refresh your bookings shortly.",
      );
      return { status: "cancelled" };
    }
    return {
      status: "paid",
      paymentId: result.razorpay_payment_id,
      orderId: result.razorpay_order_id,
      paidAt: new Date().toISOString(),
      societyName: order.societyName ?? undefined,
    };
  } catch (e: any) {
    if (e?.code !== 0 && e?.code !== 2 && e?.description) {
      Alert.alert("Payment failed", String(e.description));
    }
    return { status: "cancelled" };
  }
}
