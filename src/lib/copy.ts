/**
 * Centralised UI copy. Screens should read from here (or from live data)
 * instead of embedding string literals so content stays editable in one place.
 */
import type { OnboardingArtKey } from "@/features/auth/OnboardingArt";

export const APP = {
  name: "Portl",
  tagline: "The society gate, in your pocket.",
} as const;

export const ONBOARDING = {
  skip: "Skip",
  slides: [
    {
      key: "welcome" as OnboardingArtKey,
      title: `Welcome to ${APP.name}`,
      body: "Your society's gate, visitors, notices and payments — all in one calm, simple place.",
      cta: "Next",
    },
    {
      key: "approve" as OnboardingArtKey,
      title: "Approve visitors in one tap",
      body: "When a guard logs someone at the gate, the request reaches you instantly. Approve or deny without getting up.",
      cta: "Next",
    },
    {
      key: "notify" as OnboardingArtKey,
      title: "Stay in the loop",
      body: "Turn on notifications so you never miss a visitor, a delivery, or a community alert.",
      cta: "Get Started",
    },
  ],
} as const;

export const AUTH = {
  pendingVerifyTitle: "Verify a contact when you're ready",
  pendingVerifyBody:
    "Add and verify an email or phone so your society can match you to its invitation. You can do this now or later from Profile.",
  verifyNow: "Verify now",
  verifyLater: "I'll verify later",
  noSocietyTitle: "Waiting for a society invite",
  noSocietyBody:
    "Your account is ready. Ask your society admin to invite this verified email or phone, then check again.",
  checkAgain: "Check again",
  signOut: "Sign out",
} as const;

export const PROFILE = {
  title: "Profile",
  phone: "Phone",
  email: "Email",
  address: "Address",
  notAdded: "Not added",
  myDocuments: "My documents",
  bankingDocuments: "Account & billing",
  statements: "Statements",
  claims: "Payments",
  settings: "Settings",
  appearance: "Appearance",
  household: "Household",
  privacy: "Privacy",
  signOut: "Sign out",
  signOutConfirm: "You'll need to sign in again to use Portl.",
  cancel: "Cancel",
  editProfile: "Edit profile",
  openSettings: "Open settings",
} as const;

export const NOTICES = {
  title: "Notices",
  create: "Create notice",
  all: "All notices",
  search: "Search",
  searchPlaceholder: "Search notice title or body",
  empty: "No notices published",
  edit: "Edit",
  pin: "Pin",
  unpin: "Unpin",
  whoRead: "Who read",
  hideReaders: "Hide readers",
  delete: "Delete",
  deleteConfirm: "Readership history will also be removed.",
  missingText: "A notice needs a title and a body.",
  saveFailed: "Couldn't save notice",
  publishNow: "Publish now",
  draft: "Draft",
  scheduled: "Scheduled",
  saveDraft: "Save draft",
  saveNotice: "Save notice",
  saveChanges: "Save changes",
  cancelEditing: "Cancel editing",
  titleLabel: "Title",
  bodyLabel: "Body",
  titlePlaceholder: "e.g. Water shutdown on Sunday",
  addAttachment: "Add private attachment",
  replaceAttachment: "Replace attachment",
  notScheduled: "Not scheduled",
  noReads: "No reads yet.",
} as const;

export const CONTACT = {
  sectionTitle: "Contact details",
  verifyHint:
    "Verifying one contact is how your society matches you to its invitation. You can skip this and verify anytime from Profile.",
  addAndVerify: "Add and verify",
  addAnother: "Add another contact",
  sendCode: "Send code",
  verify: "Verify",
  cancel: "Cancel",
  useDifferent: "Use a different contact",
  codeSentTo: (value: string) => `Enter the code we sent to ${value}.`,
  verified: "Verified",
  unverified: "Unverified",
} as const;
