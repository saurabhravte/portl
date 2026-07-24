import type { Profile } from "@/stores/session";

type ClerkExternalAccount = {
  provider?: string | null;
  verification?: { status?: string | null } | null;
};

type ClerkUserLike = {
  username?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  unsafeMetadata?: Record<string, unknown> | null;
  externalAccounts?: ClerkExternalAccount[] | null;
};

const PLACEHOLDER_NAMES = new Set(["new member", "user", "resident"]);

/** Contact phone stored on Clerk during email sign-up (not a sign-in factor). */
export function getContactPhoneFromMetadata(
  user: ClerkUserLike | null | undefined,
): string | null {
  const raw = user?.unsafeMetadata?.contactPhone;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function isGoogleAuthUser(user: ClerkUserLike | null | undefined): boolean {
  return (user?.externalAccounts ?? []).some(
    (account) =>
      account.provider === "google" &&
      (account.verification?.status == null ||
        account.verification.status === "verified"),
  );
}

export function hasUsableUsername(
  user: ClerkUserLike | null | undefined,
  profile: Profile | null | undefined,
): boolean {
  const clerkUsername = user?.username?.trim();
  if (clerkUsername && clerkUsername.length >= 3) return true;

  const name = profile?.name?.trim() ?? "";
  if (!name) return false;
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return false;
  // Google often supplies a real full name — still ask for a Portl username handle.
  if (isGoogleAuthUser(user) && !clerkUsername) return false;
  return name.length >= 3;
}

export function needsProfileCompletion(
  user: ClerkUserLike | null | undefined,
  profile: Profile | null | undefined,
): boolean {
  if (!user || !profile) return false;
  if (!isGoogleAuthUser(user)) return false;
  const missingPhone = !profile.phone?.trim();
  const missingUsername = !hasUsableUsername(user, profile);
  return missingPhone || missingUsername;
}
