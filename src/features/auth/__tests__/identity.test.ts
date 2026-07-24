import {
  getVerifiedPrimaryIdentity,
  isValidIdentity,
  normalizeIdentity,
} from "../identity";

describe("auth identity helpers", () => {
  it("normalizes and validates E.164 phone numbers", () => {
    expect(normalizeIdentity("phone", "+91 98765-43210")).toBe("+919876543210");
    expect(isValidIdentity("phone", "+91 98765-43210")).toBe(true);
    expect(isValidIdentity("phone", "9876543210")).toBe(false);
  });

  it("normalizes and validates email addresses", () => {
    expect(normalizeIdentity("email", " Person@Example.COM ")).toBe(
      "person@example.com",
    );
    expect(isValidIdentity("email", "person@example.com")).toBe(true);
    expect(isValidIdentity("email", "person@example")).toBe(false);
  });

  it("never returns an unverified Clerk identifier", () => {
    expect(
      getVerifiedPrimaryIdentity({
        primaryPhoneNumber: {
          phoneNumber: "+919876543210",
          verification: { status: "unverified" },
        },
        primaryEmailAddress: {
          emailAddress: "verified@example.com",
          verification: { status: "verified" },
        },
      }),
    ).toEqual({ type: "email", value: "verified@example.com" });

    expect(
      getVerifiedPrimaryIdentity({
        primaryPhoneNumber: {
          phoneNumber: "+919876543210",
          verification: { status: "unverified" },
        },
      }),
    ).toBeNull();
  });

  it("supports both invite identities and prefers a verified primary phone", () => {
    expect(
      getVerifiedPrimaryIdentity({
        primaryPhoneNumber: {
          phoneNumber: "+919876543210",
          verification: { status: "verified" },
        },
        primaryEmailAddress: {
          emailAddress: "PERSON@EXAMPLE.COM",
          verification: { status: "verified" },
        },
      }),
    ).toEqual({ type: "phone", value: "+919876543210" });
    expect(
      getVerifiedPrimaryIdentity({
        primaryEmailAddress: {
          emailAddress: "PERSON@EXAMPLE.COM",
          verification: { status: "verified" },
        },
      }),
    ).toEqual({ type: "email", value: "person@example.com" });
  });
});
