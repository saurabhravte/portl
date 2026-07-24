export function publicationStatus(
  publishedAt: string | null,
  expiresAt: string | null,
  now = Date.now(),
) {
  if (!publishedAt) return "draft" as const;
  if (new Date(publishedAt).getTime() > now) return "scheduled" as const;
  if (expiresAt && new Date(expiresAt).getTime() <= now) return "expired" as const;
  return "published" as const;
}

export function pollStatus(
  opensAt: string,
  closesAt: string,
  closedAt: string | null,
  now = Date.now(),
) {
  if (new Date(opensAt).getTime() > now) return "scheduled" as const;
  if (closedAt || new Date(closesAt).getTime() <= now) return "closed" as const;
  return "open" as const;
}

export function canAdminOverride(status: string) {
  return status === "pending" || status === "expired";
}

export function validPollOptions(options: string[]) {
  return (
    options.length >= 2 &&
    options.length <= 6 &&
    new Set(options.map((option) => option.trim().toLocaleLowerCase())).size ===
      options.length &&
    options.every((option) => option.trim().length > 0)
  );
}
