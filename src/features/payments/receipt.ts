import { duePayableAmount, formatMoney } from "@/lib/money";
import type { DueRow } from "@/features/community/hooks";
import { format } from "date-fns";

export type ReceiptData = {
  invoiceNumber: string;
  orderTime: string;
  paymentMethod: string;
  paymentStatus: "Successful" | "Paid" | "Waived";
  amount: number;
  period: string;
  flatNumber?: string | null;
  societyName?: string | null;
  paymentId?: string | null;
  orderId?: string | null;
};

/** Readable invoice code from a UUID / Razorpay id, e.g. `A1B2 C3D4 E5F6`. */
export function formatInvoiceNumber(source: string): string {
  const clean = source.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase();
  const padded = clean.padStart(12, "0");
  return `${padded.slice(0, 4)} ${padded.slice(4, 8)} ${padded.slice(8, 12)}`;
}

export function formatOrderTime(iso: string | Date): string {
  return format(
    typeof iso === "string" ? new Date(iso) : iso,
    "hh:mm a, d MMMM, yyyy",
  );
}

export function parseRazorpayNote(note: string | null | undefined): {
  paymentId?: string;
  orderId?: string;
} {
  if (!note) return {};
  const match = note.match(/Razorpay\s+(\S+)\s+\(order\s+(\S+)\)/i);
  if (!match) return {};
  return { paymentId: match[1], orderId: match[2] };
}

export function buildReceiptFromDue(
  due: DueRow,
  extras?: {
    paymentId?: string | null;
    orderId?: string | null;
    paidAt?: string | null;
    societyName?: string | null;
    paymentMethod?: string;
  },
): ReceiptData {
  const fromNote = parseRazorpayNote(due.payment_note);
  const paymentId = extras?.paymentId ?? fromNote.paymentId ?? null;
  const orderId = extras?.orderId ?? fromNote.orderId ?? null;
  const paidAt = extras?.paidAt ?? due.paid_at ?? new Date().toISOString();
  const method =
    extras?.paymentMethod ??
    (paymentId
      ? "Razorpay"
      : due.payment_note?.toLowerCase().includes("cash")
        ? "Cash / Cheque"
        : due.status === "waived"
          ? "Waived"
          : "Portl");

  return {
    invoiceNumber: formatInvoiceNumber(paymentId ?? orderId ?? due.id),
    orderTime: formatOrderTime(paidAt),
    paymentMethod: method,
    paymentStatus: due.status === "waived" ? "Waived" : "Successful",
    amount: duePayableAmount(due),
    period: due.period,
    flatNumber: due.flat?.number ?? null,
    societyName: extras?.societyName ?? null,
    paymentId,
    orderId,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReceiptHtml(receipt: ReceiptData): string {
  const amount = formatMoney(receipt.amount);
  const productLabel = receipt.flatNumber
    ? `${escapeHtml(receipt.period)} Maintenance · Flat ${escapeHtml(receipt.flatNumber)}`
    : `${escapeHtml(receipt.period)} Maintenance`;
  const society = receipt.societyName
    ? `<p style="margin:4px 0 0;color:#6F7387;font-size:12px;">${escapeHtml(receipt.societyName)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payment Receipt</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 20px;
      background: #F6F7FB;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #0F1222;
    }
    .card {
      max-width: 420px;
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      padding: 28px 24px 24px;
      box-shadow: 0 8px 24px rgba(15, 18, 34, 0.08);
    }
    .icon {
      width: 56px; height: 56px; margin: 0 auto 12px;
      border-radius: 14px; background: #EFF6FF; color: #2563EB;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; font-weight: 700;
    }
    h1 { text-align: center; font-size: 22px; margin: 0 0 8px; }
    .divider {
      border: none; border-top: 1.5px dashed #E7E8EF; margin: 18px 0;
    }
    h2 { font-size: 15px; margin: 0 0 12px; }
    .row {
      display: flex; justify-content: space-between; gap: 12px;
      font-size: 13px; margin: 8px 0;
    }
    .label { color: #6F7387; }
    .value { color: #0F1222; font-weight: 600; text-align: right; }
    .colon { color: #A4A8BA; margin: 0 6px; }
    .badge {
      display: inline-block; background: #16A34A; color: #fff;
      border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 700;
    }
    .footer {
      margin-top: 20px; text-align: center; color: #A4A8BA; font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Payment Successful</h1>
    ${society}
    <hr class="divider" />
    <h2>Payment Details</h2>
    <div class="row"><span class="label">Invoice Number</span><span class="colon">:</span><span class="value">${escapeHtml(receipt.invoiceNumber)}</span></div>
    <div class="row"><span class="label">Order Time</span><span class="colon">:</span><span class="value">${escapeHtml(receipt.orderTime)}</span></div>
    <div class="row"><span class="label">Payment Method</span><span class="colon">:</span><span class="value">${escapeHtml(receipt.paymentMethod)}</span></div>
    <div class="row"><span class="label">Payment Status</span><span class="colon">:</span><span class="value"><span class="badge">${escapeHtml(receipt.paymentStatus)}</span></span></div>
    <div class="row"><span class="label">Amount</span><span class="colon">:</span><span class="value">${escapeHtml(amount)}</span></div>
    <hr class="divider" />
    <h2>Product Details</h2>
    <div class="row"><span class="label">${productLabel}</span><span class="value">${escapeHtml(amount)}</span></div>
    <div class="row"><span class="label">Total Amount</span><span class="value">${escapeHtml(amount)}</span></div>
    <div class="footer">Generated by Portl · Amounts in INR (₹)</div>
  </div>
</body>
</html>`;
}
