export interface UpiPayment {
  upiId: string;
  payeeName: string;
  amount: number;
  period: string;
}

export function buildUpiLink(payment: UpiPayment) {
  const upiId = payment.upiId.trim();
  if (!upiId || !upiId.includes("@")) throw new Error("A valid UPI ID is required.");
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const params = new URLSearchParams({
    pa: upiId,
    pn: payment.payeeName.trim(),
    am: payment.amount.toFixed(2),
    cu: "INR",
    tn: `Maintenance ${payment.period.trim()}`,
  });
  return `upi://pay?${params.toString()}`;
}
