import {
  adminOverrideSchema,
  amenitySchema,
  auditExportSchema,
  authIdentitySchema,
  bookingDecisionSchema,
  bookingSchema,
  bulkFlatImportSchema,
  dueRaiseSchema,
  formatValidationError,
  gateCodeSchema,
  guardShiftSchema,
  inviteIdentitySchema,
  inviteSchema,
  newVisitorSchema,
  noticeCreateSchema,
  parseInput,
  pollCreateSchema,
  preApprovalSchema,
  privacyActionSchema,
  pushTokenSchema,
  slaAgeLabel,
  slaBreached,
  ticketAssignmentSchema,
  ticketSchema,
  ticketStatusSchema,
} from "../validation";
import { z } from "zod";

const UUID_A = "123e4567-e89b-42d3-a456-426614174000";
const UUID_B = "223e4567-e89b-42d3-a456-426614174000";

describe("newVisitorSchema", () => {
  const base = {
    name: "Ramesh",
    type: "delivery",
    flatId: "123e4567-e89b-12d3-a456-426614174000",
  };

  it("accepts a minimal valid visitor", () => {
    expect(newVisitorSchema.parse(base)).toMatchObject({ name: "Ramesh" });
  });

  it("trims and rejects blank names", () => {
    expect(() => newVisitorSchema.parse({ ...base, name: "  " })).toThrow();
  });

  it("rejects unknown visitor types", () => {
    expect(() => newVisitorSchema.parse({ ...base, type: "alien" })).toThrow();
  });

  it("rejects a non-uuid flat id", () => {
    expect(() => newVisitorSchema.parse({ ...base, flatId: "42" })).toThrow();
  });

  it("accepts optional phone and vehicle number", () => {
    const parsed = newVisitorSchema.parse({
      ...base,
      phone: "+91 98765 43210",
      vehicleNo: "MP09 AB 1234",
    });
    expect(parsed.vehicleNo).toBe("MP09 AB 1234");
  });
});

describe("gateCodeSchema", () => {
  it("accepts exactly 6 digits", () => {
    expect(gateCodeSchema.parse("123456")).toBe("123456");
  });
  it.each(["12345", "1234567", "12a456", ""])("rejects %p", (v) => {
    expect(() => gateCodeSchema.parse(v)).toThrow();
  });
});

describe("preApprovalSchema", () => {
  it("requires validity window ordering", () => {
    const from = new Date("2026-07-17T10:00:00Z");
    const to = new Date("2026-07-17T09:00:00Z");
    expect(() =>
      preApprovalSchema.parse({
        visitorName: "Aunt",
        type: "guest",
        validFrom: from,
        validTo: to,
      }),
    ).toThrow();
  });
});

describe("ticketSchema", () => {
  it("requires a short title", () => {
    expect(() =>
      ticketSchema.parse({ category: "Plumbing", title: "" }),
    ).toThrow();
    expect(
      ticketSchema.parse({ category: "Plumbing", title: "Tap leaking" }),
    ).toMatchObject({ title: "Tap leaking" });
  });
});

describe("inviteSchema", () => {
  it("normalises and validates phone length", () => {
    expect(() => inviteSchema.parse({ phone: "12345", role: "resident" })).toThrow();
    expect(
      inviteSchema.parse({ phone: "+91 98765 43210", role: "resident" }),
    ).toBeTruthy();
  });
});

describe("auth and identity schemas", () => {
  it("normalizes email and E.164 phone identities", () => {
    expect(authIdentitySchema.parse({ type: "email", value: " USER@Example.COM " }))
      .toEqual({ type: "email", value: "user@example.com" });
    expect(authIdentitySchema.parse({ type: "phone", value: "+91 98765 43210" }))
      .toEqual({ type: "phone", value: "+919876543210" });
  });

  it.each(["9876543210", "+0123456789", "+1234567", "+1234567890123456"])(
    "rejects non-E.164 phone %p",
    (value) => expect(authIdentitySchema.safeParse({ type: "phone", value }).success).toBe(false),
  );
});

describe("notice and poll schemas", () => {
  it("rejects an expiry before publication", () => {
    expect(
      noticeCreateSchema.safeParse({
        title: "Water shutdown",
        body: "Supply will stop briefly.",
        publishedAt: new Date("2026-07-20T10:00:00Z"),
        expiresAt: new Date("2026-07-20T09:00:00Z"),
      }).success,
    ).toBe(false);
  });

  it("trims poll options and rejects duplicates and invalid quorum", () => {
    const base = {
      question: "Choose a colour",
      options: ["Blue", " blue "],
      closesAt: new Date(Date.now() + 60_000),
    };
    expect(pollCreateSchema.safeParse(base).success).toBe(false);
    expect(pollCreateSchema.safeParse({ ...base, options: ["Blue", "Green"], quorumPercent: 101 }).success)
      .toBe(false);
  });
});

describe("amenity and scheduling schemas", () => {
  it("enforces amenity numeric ranges", () => {
    expect(amenitySchema.safeParse({ name: "Gym", capacity: 0 }).success).toBe(false);
    expect(amenitySchema.safeParse({ name: "Gym", slot_minutes: 30, capacity: 20 }).success)
      .toBe(true);
  });

  it("orders booking and shift windows", () => {
    const startsAt = new Date("2026-07-20T10:00:00Z");
    const endsAt = new Date("2026-07-20T09:00:00Z");
    expect(bookingSchema.safeParse({ amenityId: UUID_A, startsAt, endsAt }).success).toBe(false);
    expect(
      guardShiftSchema.safeParse({
        guardId: UUID_A,
        gateId: UUID_B,
        startsAt,
        endsAt,
      }).success,
    ).toBe(false);
  });

  it("requires a rejection reason", () => {
    expect(
      bookingDecisionSchema.safeParse({
        bookingId: UUID_A,
        decision: "rejected",
        reason: " ",
      }).success,
    ).toBe(false);
  });
});

describe("admin and privacy mutation schemas", () => {
  it("validates due periods and bounded amounts", () => {
    expect(dueRaiseSchema.safeParse({ period: "2026-13", amount: 1 }).success).toBe(false);
    expect(dueRaiseSchema.safeParse({ period: "2026-07", amount: 0 }).success).toBe(false);
    expect(dueRaiseSchema.safeParse({ period: "2026-07", amount: 2500 }).success).toBe(true);
  });

  it("rejects invalid invite role/flat combinations", () => {
    expect(
      inviteIdentitySchema.safeParse({
        identityType: "email",
        identityValue: "guard@example.com",
        role: "guard",
        flatId: UUID_A,
      }).success,
    ).toBe(false);
  });

  it("bounds flat imports and export filters", () => {
    expect(
      bulkFlatImportSchema.safeParse({
        rows: [],
        idempotencyKey: UUID_A,
        dryRun: true,
      }).success,
    ).toBe(false);
    expect(
      auditExportSchema.safeParse({
        format: "xml",
        filters: {},
      }).success,
    ).toBe(false);
  });

  it("accepts only known privacy actions and artifact UUIDs", () => {
    expect(privacyActionSchema.safeParse({ action: "erase_now" }).success).toBe(false);
    expect(
      privacyActionSchema.safeParse({ action: "artifact_url", artifactId: "bad" }).success,
    ).toBe(false);
    expect(privacyActionSchema.safeParse({ action: "request_export" }).success).toBe(true);
  });
});

describe("ticket, push and privileged gate schemas", () => {
  it("validates ticket status and assignment identifiers", () => {
    expect(ticketStatusSchema.safeParse({ id: UUID_A, status: "deleted" }).success).toBe(false);
    expect(ticketAssignmentSchema.safeParse({ id: UUID_A, staffId: null }).success).toBe(true);
  });

  it("validates Expo push token shape", () => {
    expect(pushTokenSchema.safeParse("ExpoPushToken[device-token]").success).toBe(true);
    expect(pushTokenSchema.safeParse("token").success).toBe(false);
  });

  it("requires a meaningful admin override reason", () => {
    expect(adminOverrideSchema.safeParse({ requestId: UUID_A, reason: "no" }).success)
      .toBe(false);
  });

  it("formats Zod failures without exposing raw issue JSON", () => {
    const result = z.strictObject({ name: z.string().min(2, "Enter a name.") }).safeParse({
      name: "",
      extra: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationError(result.error)).toContain("Enter a name.");
      expect(formatValidationError(result.error)).not.toContain("secret");
    }
    expect(() => parseInput(z.string().min(2, "Too short."), "")).toThrow("Too short.");
  });
});

describe("SLA helpers (24h first-response)", () => {
  const HOUR = 60 * 60 * 1000;

  it("slaBreached is false once a first response exists", () => {
    const created = new Date(Date.now() - 30 * HOUR).toISOString();
    const responded = new Date(Date.now() - 29 * HOUR).toISOString();
    expect(slaBreached(created, responded)).toBe(false);
  });

  it("slaBreached is true after 24h with no response", () => {
    const created = new Date(Date.now() - 25 * HOUR).toISOString();
    expect(slaBreached(created, null)).toBe(true);
  });

  it("slaBreached is false inside the window", () => {
    const created = new Date(Date.now() - 2 * HOUR).toISOString();
    expect(slaBreached(created, null)).toBe(false);
  });

  it("slaAgeLabel renders a compact age", () => {
    const created = new Date(Date.now() - 3 * HOUR).toISOString();
    expect(slaAgeLabel(created)).toMatch(/h/);
  });
});
