import {
  canAdminOverride,
  pollStatus,
  publicationStatus,
  validPollOptions,
} from "../batch4Logic";

const NOW = new Date("2026-07-19T10:00:00Z").getTime();

describe("batch four workflow presentation rules", () => {
  it("distinguishes drafts, schedules, publication and expiry", () => {
    expect(publicationStatus(null, null, NOW)).toBe("draft");
    expect(publicationStatus("2026-07-19T11:00:00Z", null, NOW)).toBe("scheduled");
    expect(publicationStatus("2026-07-19T09:00:00Z", null, NOW)).toBe("published");
    expect(
      publicationStatus("2026-07-19T08:00:00Z", "2026-07-19T09:00:00Z", NOW),
    ).toBe("expired");
  });

  it("treats explicit close and deadline close consistently", () => {
    expect(pollStatus("2026-07-19T11:00:00Z", "2026-07-20T10:00:00Z", null, NOW)).toBe("scheduled");
    expect(pollStatus("2026-07-19T09:00:00Z", "2026-07-20T10:00:00Z", null, NOW)).toBe("open");
    expect(pollStatus("2026-07-19T09:00:00Z", "2026-07-19T09:30:00Z", null, NOW)).toBe("closed");
    expect(pollStatus("2026-07-19T09:00:00Z", "2026-07-20T10:00:00Z", "2026-07-19T09:30:00Z", NOW)).toBe("closed");
  });

  it("limits overrides and validates unique ballot options", () => {
    expect(canAdminOverride("pending")).toBe(true);
    expect(canAdminOverride("expired")).toBe(true);
    expect(canAdminOverride("denied")).toBe(false);
    expect(validPollOptions(["Yes", "No"])).toBe(true);
    expect(validPollOptions(["Yes", "yes"])).toBe(false);
    expect(validPollOptions(["Only one"])).toBe(false);
  });
});
