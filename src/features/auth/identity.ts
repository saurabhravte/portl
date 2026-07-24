import {
  emailSchema,
  formatValidationError,
  phoneSchema,
} from "@/lib/validation";
import { z } from "zod";

export type IdentityType = "email" | "phone";

export interface VerifiedIdentity {
  type: IdentityType;
  value: string;
}

type ClerkVerification = { status?: string | null } | null;
type ClerkIdentifier = {
  emailAddress?: string;
  phoneNumber?: string;
  verification?: ClerkVerification;
};
type ClerkUserIdentity = {
  primaryEmailAddress?: ClerkIdentifier | null;
  primaryPhoneNumber?: ClerkIdentifier | null;
};

export function normalizeIdentity(type: IdentityType, value: string): string {
  const trimmed = value.trim();
  return type === "phone" ? trimmed.replace(/[^\d+]/g, "") : trimmed.toLowerCase();
}

export function isValidIdentity(type: IdentityType, value: string): boolean {
  return (type === "phone" ? phoneSchema : emailSchema).safeParse(value).success;
}

/** Only returns identifiers that Clerk reports as verified. */
export function getVerifiedPrimaryIdentity(
  user: ClerkUserIdentity,
): VerifiedIdentity | null {
  const phone = user.primaryPhoneNumber;
  if (phone?.phoneNumber && phone.verification?.status === "verified") {
    return { type: "phone", value: phone.phoneNumber };
  }

  const email = user.primaryEmailAddress;
  if (email?.emailAddress && email.verification?.status === "verified") {
    return { type: "email", value: email.emailAddress.toLowerCase() };
  }

  return null;
}

export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) return formatValidationError(error, fallback);
  if (error && typeof error === "object") {
    const direct = (error as { message?: unknown }).message;
    if (typeof direct === "string" && direct) return direct;

    const errors = (error as { errors?: { message?: string }[] }).errors;
    if (errors?.[0]?.message) return errors[0].message;
  }
  return fallback;
}
