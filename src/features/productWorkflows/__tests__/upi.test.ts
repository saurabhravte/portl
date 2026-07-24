import { buildUpiLink } from "../upi";

describe("UPI payment links", () => {
  it("encodes payee and maintenance metadata safely", () => {
    const link = buildUpiLink({
      upiId: " society@upi ",
      payeeName: "Portl Heights & Co",
      amount: 1250,
      period: "2026-07",
    });
    expect(link).toBe(
      "upi://pay?pa=society%40upi&pn=Portl+Heights+%26+Co&am=1250.00&cu=INR&tn=Maintenance+2026-07",
    );
  });

  it("rejects malformed payees and non-positive amounts", () => {
    expect(() =>
      buildUpiLink({
        upiId: "not-a-vpa",
        payeeName: "Society",
        amount: 100,
        period: "2026-07",
      }),
    ).toThrow("valid UPI ID");
    expect(() =>
      buildUpiLink({
        upiId: "society@upi",
        payeeName: "Society",
        amount: 0,
        period: "2026-07",
      }),
    ).toThrow("greater than zero");
  });
});
