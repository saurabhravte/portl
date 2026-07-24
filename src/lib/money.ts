/**
 * One place for money formatting. Screens previously repeated
 * `₹{Number(x).toLocaleString("en-IN")}` in ~10 places; the currency and
 * locale now live here so a future society-level currency setting only
 * touches this file.
 *
 * Always INR with the Indian rupee symbol (₹) and en-IN grouping.
 */
const LOCALE = "en-IN";
const SYMBOL = "₹";

export function formatMoney(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${SYMBOL}0.00`;
  return `${SYMBOL}${n.toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Active late fee on a maintenance due (`amount` stays immutable). */
export function dueLateFeeAmount(due: {
  late_fee_amount?: number | string | null;
  late_fee_waived_at?: string | null;
}): number {
  if (due.late_fee_waived_at) return 0;
  const n = Number(due.late_fee_amount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Payable total = base amount + active late fee. */
export function duePayableAmount(due: {
  amount: number | string | null | undefined;
  late_fee_amount?: number | string | null;
  late_fee_waived_at?: string | null;
}): number {
  return Number(due.amount ?? 0) + dueLateFeeAmount(due);
}
