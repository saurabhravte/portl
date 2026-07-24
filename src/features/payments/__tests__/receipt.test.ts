import {
  buildReceiptFromDue,
  formatInvoiceNumber,
  parseRazorpayNote,
} from "@/features/payments/receipt";
import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it("formats INR with rupee symbol and two decimals", () => {
    expect(formatMoney(37.99)).toBe("₹37.99");
    expect(formatMoney(1500)).toBe("₹1,500.00");
  });
});

describe("receipt helpers", () => {
  it("formats invoice numbers in grouped blocks", () => {
    expect(formatInvoiceNumber("S564F5677G6412")).toBe("64F5 677G 6412");
    expect(formatInvoiceNumber("ABCD1234EFGH")).toBe("ABCD 1234 EFGH");
  });

  it("parses Razorpay payment notes", () => {
    expect(
      parseRazorpayNote("Razorpay pay_abc (order order_xyz) by user"),
    ).toEqual({ paymentId: "pay_abc", orderId: "order_xyz" });
  });

  it("builds receipt data with INR-ready amount", () => {
    const receipt = buildReceiptFromDue(
      {
        id: "11111111-2222-3333-4444-555555555555",
        period: "2026-07",
        amount: 1999.5,
        status: "paid",
        paid_at: "2025-06-20T01:09:00.000Z",
        claimed_at: null,
        payment_note: "Razorpay pay_abc (order order_xyz) by user",
        flat: { number: "A-1201" },
      },
      { societyName: "Green Heights", paymentMethod: "Razorpay" },
    );
    expect(receipt.paymentMethod).toBe("Razorpay");
    expect(receipt.paymentStatus).toBe("Successful");
    expect(receipt.amount).toBe(1999.5);
    expect(formatMoney(receipt.amount)).toContain("₹");
    expect(receipt.flatNumber).toBe("A-1201");
    expect(receipt.societyName).toBe("Green Heights");
  });

  it("includes active late fee in receipt amount", () => {
    const receipt = buildReceiptFromDue({
      id: "11111111-2222-3333-4444-555555555555",
      period: "2026-07",
      amount: 1000,
      late_fee_amount: 50,
      late_fee_waived_at: null,
      status: "paid",
      paid_at: "2025-06-20T01:09:00.000Z",
      claimed_at: null,
      payment_note: null,
      flat: { number: "A-1201" },
    });
    expect(receipt.amount).toBe(1050);
  });
});
