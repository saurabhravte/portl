import { addMinutes, format, setHours, setMinutes, startOfDay } from "date-fns";

export type PreApprovalStatus = "scheduled" | "active" | "used" | "expired" | "revoked";
export type VisitorRequestStatus = "pending" | "approved" | "denied" | "expired";
export type TicketWorkflowStatus = "open" | "in_progress" | "resolved" | "closed";

export function canTransitionVisitorRequest(
  from: VisitorRequestStatus,
  to: VisitorRequestStatus,
) {
  return from === "pending" && ["approved", "denied", "expired"].includes(to);
}

export function canTransitionTicket(
  role: "resident" | "admin",
  from: TicketWorkflowStatus,
  to: TicketWorkflowStatus,
) {
  if (role === "resident") {
    return from === "resolved" && (to === "closed" || to === "open");
  }
  return (
    (from === "open" && to === "in_progress") ||
    (from === "in_progress" && to === "resolved")
  );
}

export function getPreApprovalStatus(
  pass: {
    valid_from: string;
    valid_to: string;
    used_at?: string | null;
    revoked_at?: string | null;
  },
  now = new Date(),
): PreApprovalStatus {
  if (pass.revoked_at) return "revoked";
  if (pass.used_at) return "used";
  if (new Date(pass.valid_to) < now) return "expired";
  if (new Date(pass.valid_from) > now) return "scheduled";
  return "active";
}

export function isOverstaying(
  entryAt: string,
  expectedMinutes: number | null | undefined,
  now = new Date(),
) {
  if (!expectedMinutes || expectedMinutes <= 0) return false;
  return now.getTime() - new Date(entryAt).getTime() > expectedMinutes * 60_000;
}

export function isPastExpectedExit(
  expectedExitAt: string | null | undefined,
  now = new Date(),
) {
  return !!expectedExitAt && new Date(expectedExitAt) < now;
}

export interface AmenityAvailability {
  open_time: string;
  close_time: string;
  slot_minutes: number;
  capacity: number;
  blackout_dates?: string[] | null;
}

export interface ExistingBooking {
  starts_at: string;
  ends_at: string;
  status: string;
}

export function buildAmenitySlots(
  amenity: AmenityAvailability,
  bookings: ExistingBooking[],
  from = new Date(),
  limit = 8,
  options?: { includeFull?: boolean },
) {
  const slots: { start: Date; end: Date; remaining: number }[] = [];
  const capacity = Math.max(1, amenity.capacity || 1);
  const holding = new Set(["pending_payment", "pending", "confirmed"]);
  const [openHour, openMinute] = amenity.open_time.split(":").map(Number);
  const [closeHour, closeMinute] = amenity.close_time.split(":").map(Number);
  let day = startOfDay(from);

  for (let dayOffset = 0; dayOffset < 31 && slots.length < limit; dayOffset++) {
    const dateKey = format(day, "yyyy-MM-dd");
    if (!amenity.blackout_dates?.includes(dateKey)) {
      const open = setMinutes(setHours(day, openHour), openMinute);
      const close = setMinutes(setHours(day, closeHour), closeMinute);
      for (
        let start = open;
        addMinutes(start, amenity.slot_minutes) <= close && slots.length < limit;
        start = addMinutes(start, amenity.slot_minutes)
      ) {
        const end = addMinutes(start, amenity.slot_minutes);
        if (start <= from) continue;
        const overlaps = bookings.filter(
          (booking) =>
            holding.has(booking.status) &&
            new Date(booking.starts_at) < end &&
            new Date(booking.ends_at) > start,
        ).length;
        const remaining = capacity - overlaps;
        if (remaining > 0 || options?.includeFull) {
          slots.push({ start, end, remaining: Math.max(0, remaining) });
        }
      }
    }
    day = addMinutes(day, 24 * 60);
  }
  return slots;
}

export function pollQuorum(
  voteCount: number,
  eligibleFlatCount: number,
  quorumPercent: number,
) {
  const required = Math.ceil(
    Math.max(0, eligibleFlatCount) * Math.max(0, quorumPercent) / 100,
  );
  return { required, met: voteCount >= required };
}
