import {
  buildAmenitySlots,
  canTransitionTicket,
  canTransitionVisitorRequest,
  getPreApprovalStatus,
  isOverstaying,
  isPastExpectedExit,
  pollQuorum,
} from "../logic";

describe("workflow transitions", () => {
  it("allows each pending visitor decision exactly once", () => {
    expect(canTransitionVisitorRequest("pending", "approved")).toBe(true);
    expect(canTransitionVisitorRequest("pending", "denied")).toBe(true);
    expect(canTransitionVisitorRequest("pending", "expired")).toBe(true);
    expect(canTransitionVisitorRequest("approved", "denied")).toBe(false);
    expect(canTransitionVisitorRequest("expired", "approved")).toBe(false);
  });

  it("separates resident and admin ticket transitions", () => {
    expect(canTransitionTicket("admin", "open", "in_progress")).toBe(true);
    expect(canTransitionTicket("admin", "in_progress", "resolved")).toBe(true);
    expect(canTransitionTicket("resident", "resolved", "closed")).toBe(true);
    expect(canTransitionTicket("resident", "resolved", "open")).toBe(true);
    expect(canTransitionTicket("resident", "open", "resolved")).toBe(false);
  });
});

describe("pre-approval status", () => {
  const now = new Date("2026-07-19T10:00:00.000Z");
  const pass = {
    valid_from: "2026-07-19T09:00:00.000Z",
    valid_to: "2026-07-19T11:00:00.000Z",
  };

  it("prioritises revoked and used lifecycle states", () => {
    expect(getPreApprovalStatus({ ...pass, revoked_at: now.toISOString() }, now)).toBe(
      "revoked",
    );
    expect(getPreApprovalStatus({ ...pass, used_at: now.toISOString() }, now)).toBe(
      "used",
    );
  });

  it("distinguishes scheduled, active and expired passes", () => {
    expect(getPreApprovalStatus(pass, now)).toBe("active");
    expect(
      getPreApprovalStatus(
        { ...pass, valid_from: "2026-07-19T10:30:00.000Z" },
        now,
      ),
    ).toBe("scheduled");
    expect(
      getPreApprovalStatus(
        { ...pass, valid_to: "2026-07-19T09:30:00.000Z" },
        now,
      ),
    ).toBe("expired");
  });
});

describe("occupancy aging", () => {
  const now = new Date("2026-07-19T10:00:00.000Z");

  it("flags visits beyond their expected duration", () => {
    expect(isOverstaying("2026-07-19T08:00:00.000Z", 60, now)).toBe(true);
    expect(isOverstaying("2026-07-19T09:30:00.000Z", 60, now)).toBe(false);
    expect(isPastExpectedExit("2026-07-19T09:59:00.000Z", now)).toBe(true);
  });
});

describe("amenity availability", () => {
  it("honours capacity, blackouts and opening hours", () => {
    const bookedStart = new Date(2026, 6, 19, 9);
    const bookedEnd = new Date(2026, 6, 19, 10);
    const slots = buildAmenitySlots(
      {
        open_time: "09:00",
        close_time: "11:00",
        slot_minutes: 60,
        capacity: 2,
        blackout_dates: ["2026-07-20"],
      },
      [
        {
          starts_at: bookedStart.toISOString(),
          ends_at: bookedEnd.toISOString(),
          status: "confirmed",
        },
      ],
      new Date(2026, 6, 19, 8),
      2,
    );
    expect(slots[0]).toMatchObject({ remaining: 1 });
    expect(slots.every((slot) => slot.start.getDate() !== 20)).toBe(true);
  });
});

describe("poll quorum", () => {
  it("rounds required flats up", () => {
    expect(pollQuorum(5, 11, 50)).toEqual({ required: 6, met: false });
    expect(pollQuorum(6, 11, 50)).toEqual({ required: 6, met: true });
  });
});
