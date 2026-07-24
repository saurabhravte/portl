/**
 * Shared validation schemas (review §5.4 — "validation schemas shared with
 * payloads"). Hooks validate mutation inputs against these, so a screen
 * can never send a payload the DB would reject for shape reasons.
 */
import { z, type ZodType } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const uuidSchema = z.uuid("A valid identifier is required.");
export const userIdSchema = z
  .string()
  .trim()
  .min(3, "A valid user identifier is required.")
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "A valid user identifier is required.");
export const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  message: "Enter a valid date and time.",
});
export const shortTextSchema = z.string().trim().min(1, "This field is required.").max(120);
export const longTextSchema = z.string().trim().max(5000, "Text is too long.");
export const roleSchema = z.enum(["resident", "guard", "admin"]);
export const identityTypeSchema = z.enum(["email", "phone"]);
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^\d+]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number in E.164 format."));
export const optionalPhoneSchema = z.preprocess(
  emptyToUndefined,
  phoneSchema.optional(),
);
export const optionalUuidSchema = z.preprocess(
  emptyToUndefined,
  uuidSchema.optional(),
);
/** Strong password: 8+ chars, upper, lower, number, special. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must include a special character (e.g. !@#$%).",
  );

export type PasswordStrengthRule = {
  key: "length" | "lower" | "upper" | "number" | "special";
  label: string;
  ok: boolean;
};

export function getPasswordStrength(password: string): {
  rules: PasswordStrengthRule[];
  isStrong: boolean;
} {
  const rules: PasswordStrengthRule[] = [
    { key: "length", label: "At least 8 characters", ok: password.length >= 8 },
    { key: "lower", label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { key: "upper", label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { key: "number", label: "One number", ok: /[0-9]/.test(password) },
    {
      key: "special",
      label: "One special character (!@#$%…)",
      ok: /[^A-Za-z0-9]/.test(password),
    },
  ];
  return { rules, isStrong: rules.every((rule) => rule.ok) };
}

export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

export function formatValidationError(error: unknown, fallback = "Check the highlighted details."): string {
  if (!(error instanceof z.ZodError)) return fallback;
  const messages = error.issues
    .map((issue) => issue.message.trim())
    .filter((message, index, all) => message && all.indexOf(message) === index);
  return messages.slice(0, 3).join("\n") || fallback;
}

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new Error(formatValidationError(result.error));
}

export const authIdentitySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("email"), value: emailSchema }),
  z.strictObject({ type: z.literal("phone"), value: phoneSchema }),
]);
export const emailPasswordSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});
export const resetPasswordSchema = z.strictObject({
  password: passwordSchema,
});
export const onboardingIdentitySchema = z.strictObject({
  identityType: identityTypeSchema,
  identityValue: z.string().trim().min(1).max(254),
}).superRefine((value, context) => {
  const schema = value.identityType === "email" ? emailSchema : phoneSchema;
  const result = schema.safeParse(value.identityValue);
  if (!result.success) {
    context.addIssue({
      code: "custom",
      path: ["identityValue"],
      message: result.error.issues[0]?.message ?? "Enter a valid identity.",
    });
  }
});

export const visitorTypeSchema = z.enum(["guest", "delivery", "cab", "service"]);
export const requestStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export const decisionSchema = z.enum(["approved", "denied"]);

export const newVisitorSchema = z.strictObject({
  name: z.string().trim().min(2, "Enter the visitor's name").max(80),
  phone: optionalPhoneSchema,
  vehicleNo: z.preprocess(emptyToUndefined, z.string().trim().max(16).optional()),
  type: visitorTypeSchema,
  flatId: uuidSchema,
  photoUrl: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(2048).refine(
      (value) => value.startsWith("society-media:") || z.url().safeParse(value).success,
      "Photo reference is invalid.",
    ).optional(),
  ),
});
export type NewVisitorInput = z.infer<typeof newVisitorSchema>;

export const preApprovalSchema = z
  .strictObject({
    visitorName: z.string().trim().min(2, "Who are you expecting?").max(80),
    type: visitorTypeSchema,
    validFrom: z.date(),
    validTo: z.date(),
  })
  .refine((v) => v.validTo > v.validFrom, {
    message: "Pass must end after it starts",
  });

export const gateCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "The gate code is always 6 digits.");

export const groupCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/, "Enter a valid group code."));

export const ticketSchema = z.strictObject({
  category: z.string().trim().min(2, "Choose a category.").max(80),
  title: z.string().trim().min(3, "One line about the problem.").max(160),
  description: z.string().trim().max(2000).optional().default(""),
  photos: z.array(z.string().trim().min(1).max(2048)).max(4).default([]),
});

export const inviteSchema = z.strictObject({
  phone: phoneSchema,
  name: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(120).optional()),
  role: roleSchema.default("resident"),
  flatId: uuidSchema.nullable().optional(),
});

export const inviteIdentitySchema = z
  .strictObject({
    identityType: identityTypeSchema,
    identityValue: z.string().trim().min(1).max(254),
    name: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(120).optional()),
    role: roleSchema,
    flatId: uuidSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    const result = (value.identityType === "email" ? emailSchema : phoneSchema).safeParse(
      value.identityValue,
    );
    if (!result.success) {
      context.addIssue({
        code: "custom",
        path: ["identityValue"],
        message: result.error.issues[0]?.message ?? "Enter a valid identity.",
      });
    }
    if (value.role === "resident" && value.flatId === undefined) return;
    if (value.role !== "resident" && value.flatId) {
      context.addIssue({
        code: "custom",
        path: ["flatId"],
        message: "Only residents can be linked to a flat.",
      });
    }
  });

const uuidListSchema = z.array(uuidSchema).max(500).refine(
  (items) => new Set(items).size === items.length,
  "Remove duplicate selections.",
);
const attachmentListSchema = z.array(z.string().trim().min(1).max(2048)).max(10);

export const noticeAudienceSchema = z.enum(["all", "residents", "guards", "admins"]);
export const noticeCreateSchema = z
  .strictObject({
    title: z.string().trim().min(3, "Enter a notice title.").max(160),
    body: z.string().trim().min(1, "Enter the notice text.").max(5000),
    audience: noticeAudienceSchema.default("all"),
    publishedAt: z.date().nullable().optional(),
    expiresAt: z.date().nullable().optional(),
    attachments: attachmentListSchema.default([]),
    targetTowerIds: uuidListSchema.default([]),
    targetFlatIds: uuidListSchema.default([]),
  })
  .refine(
    (value) =>
      !value.expiresAt ||
      !value.publishedAt ||
      value.expiresAt.getTime() > value.publishedAt.getTime(),
    { path: ["expiresAt"], message: "Expiry must be after publication." },
  );

export const noticeUpdateSchema = z.strictObject({
  title: z.string().trim().min(3).max(160).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  audience: noticeAudienceSchema.optional(),
  published_at: isoDateTimeSchema.nullable().optional(),
  expires_at: isoDateTimeSchema.nullable().optional(),
  attachments: attachmentListSchema.optional(),
  target_tower_ids: uuidListSchema.optional(),
  target_flat_ids: uuidListSchema.optional(),
});

export const pollCreateSchema = z
  .strictObject({
    question: z.string().trim().min(3, "Enter a poll question.").max(300),
    options: z.array(z.string().trim().min(1).max(120)).min(2).max(12),
    opensAt: z.date().optional(),
    closesAt: z.date(),
    quorumPercent: z.number().finite().min(0).max(100).default(0),
    isAnonymous: z.boolean().default(false),
    attachments: attachmentListSchema.default([]),
    targetTowerIds: uuidListSchema.default([]),
    targetFlatIds: uuidListSchema.default([]),
  })
  .superRefine((value, context) => {
    const opensAt = value.opensAt ?? new Date();
    if (value.closesAt <= opensAt) {
      context.addIssue({ code: "custom", path: ["closesAt"], message: "Poll must close after it opens." });
    }
    const normalized = value.options.map((option) => option.toLocaleLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", path: ["options"], message: "Poll options must be unique." });
    }
  });
export const pollUpdateSchema = z.strictObject({
  question: z.string().trim().min(3).max(300).optional(),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(12).optional(),
  opens_at: isoDateTimeSchema.optional(),
  closes_at: isoDateTimeSchema.optional(),
  quorum_percent: z.number().finite().min(0).max(100).optional(),
  is_anonymous: z.boolean().optional(),
  attachments: attachmentListSchema.optional(),
  target_tower_ids: uuidListSchema.optional(),
  target_flat_ids: uuidListSchema.optional(),
});
export const voteSchema = z.strictObject({
  pollId: uuidSchema,
  optionIndex: z.number().int().min(0).max(11),
});

export const lostFoundSchema = z.strictObject({
  kind: z.enum(["lost", "found"]),
  title: shortTextSchema,
  description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  photoRef: z.preprocess(emptyToUndefined, z.string().trim().max(512).optional()),
  locationNote: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  contactNote: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
});

export const marketplaceListingSchema = z.strictObject({
  title: shortTextSchema,
  description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  category: z.enum(["general", "furniture", "electronics", "services", "other"]).default("general"),
  price: z.number().finite().min(0).max(10_000_000).nullable().optional(),
  photoRef: z.preprocess(emptyToUndefined, z.string().trim().max(512).optional()),
});

export const carpoolRideSchema = z.strictObject({
  origin: shortTextSchema,
  destination: shortTextSchema,
  departAt: z.date(),
  seatsTotal: z.number().int().min(1).max(8),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  vehicleLabel: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
});

export const carpoolClaimSchema = z.strictObject({
  rideId: uuidSchema,
  seats: z.number().int().min(1).max(4).default(1),
});

export const societyEventSchema = z.strictObject({
  id: uuidSchema.optional(),
  title: shortTextSchema,
  description: z.preprocess(emptyToUndefined, z.string().trim().max(4000).optional()),
  location: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  startsAt: z.date(),
  endsAt: z.date(),
  capacity: z.number().int().min(1).max(10000).nullable().optional(),
  coverPhoto: z.preprocess(emptyToUndefined, z.string().trim().max(512).optional()),
}).refine((v) => v.endsAt > v.startsAt, {
  message: "Event must end after it starts.",
  path: ["endsAt"],
});

export const eventRsvpSchema = z.strictObject({
  eventId: uuidSchema,
  response: z.enum(["going", "maybe", "declined"]),
});

export const residentIdVerifySchema = z.strictObject({
  code: z.string().trim().min(3).max(128),
});

export const domesticHelperSchema = z.strictObject({
  name: shortTextSchema,
  role: z.enum(["maid", "cook", "driver", "other"]).default("maid"),
  phone: optionalPhoneSchema,
});

export const domesticCheckInSchema = z.strictObject({
  code: z.preprocess(emptyToUndefined, z.string().trim().max(64).optional()),
  helperId: optionalUuidSchema,
  method: z.enum(["manual", "qr", "code"]).default("manual"),
}).refine((v) => !!(v.code || v.helperId), {
  message: "Provide a helper or check-in code.",
  path: ["code"],
});

export const amenitySchema = z.strictObject({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2, "Enter an amenity name.").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  open_time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, "Enter a valid opening time.").optional(),
  close_time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, "Enter a valid closing time.").optional(),
  slot_minutes: z.number().int().min(5).max(1440).optional(),
  capacity: z.number().int().min(1).max(10000).optional(),
  price: z.number().finite().min(0).max(10_000_000).optional(),
  cancellation_cutoff_minutes: z.number().int().min(0).max(43200).optional(),
  late_cancel_penalty: z.number().finite().min(0).max(10_000_000).optional(),
  no_show_penalty: z.number().finite().min(0).max(10_000_000).optional(),
  checkin_grace_minutes: z.number().int().min(0).max(180).optional(),
  requires_approval: z.boolean().optional(),
  rules: z.string().trim().max(5000).nullable().optional(),
  blackout_dates: z.array(z.iso.date()).max(366).optional(),
  is_active: z.boolean().optional(),
});
export const bookingSchema = z
  .strictObject({ amenityId: uuidSchema, startsAt: z.date(), endsAt: z.date() })
  .refine((value) => value.endsAt > value.startsAt, {
    path: ["endsAt"],
    message: "Booking must end after it starts.",
  });
export const bookingSeriesSchema = z.strictObject({
  amenityId: uuidSchema,
  startsAt: z.date(),
  weeks: z.number().int().min(2).max(12).default(4),
});
export const bookingWaitlistSchema = z
  .strictObject({ amenityId: uuidSchema, startsAt: z.date(), endsAt: z.date() })
  .refine((value) => value.endsAt > value.startsAt, {
    path: ["endsAt"],
    message: "Waitlist slot must end after it starts.",
  });
export const cancelBookingSchema = z.strictObject({
  bookingId: uuidSchema,
  acceptPenalty: z.boolean().default(false),
});
export const bookingDecisionSchema = z.strictObject({
  bookingId: uuidSchema,
  decision: z.enum(["confirmed", "rejected"]),
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
}).refine((value) => value.decision !== "rejected" || !!value.reason, {
  path: ["reason"],
  message: "Give a reason for rejecting the booking.",
});

export const gateSchema = z.strictObject({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2, "Enter a gate name.").max(80),
  isActive: z.boolean().default(true),
});
export const guardShiftSchema = z
  .strictObject({
    id: uuidSchema.optional(),
    guardId: userIdSchema,
    gateId: uuidSchema.nullable().optional(),
    startsAt: z.date(),
    endsAt: z.date(),
    status: z.enum(["scheduled", "checked_in", "completed", "missed", "cancelled"]).default("scheduled"),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    path: ["endsAt"],
    message: "Shift must end after it starts.",
  });
export const revokeGuardSessionSchema = z.strictObject({
  sessionId: uuidSchema,
  guardId: userIdSchema,
  reason: z.string().trim().min(3, "Give a revocation reason.").max(500),
});
export const guardDeviceSchema = z.strictObject({
  deviceId: uuidSchema,
  deviceName: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  gateId: uuidSchema.nullable().optional(),
  pushToken: z.string().trim().min(10).max(4096).nullable().optional(),
});
export const guardShiftStatusSchema = z.strictObject({
  shiftId: uuidSchema,
  status: z.enum(["checked_in", "completed"]),
});

export const sosAlertSchema = z.strictObject({
  kind: z.enum(["sos", "panic"]),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(280).optional()),
});

export const favoriteVisitorSchema = z.strictObject({
  name: shortTextSchema,
  type: visitorTypeSchema,
  phone: optionalPhoneSchema,
  vehicleNo: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
});

export const residentVehicleSchema = z.strictObject({
  plate: z
    .string()
    .trim()
    .min(3, "Enter a valid plate.")
    .max(20)
    .transform((v) => v.toUpperCase()),
  label: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  autoApprove: z.boolean().default(false),
});

export const parcelSchema = z.strictObject({
  flatId: uuidSchema,
  description: shortTextSchema,
  shelfLabel: z.preprocess(emptyToUndefined, z.string().trim().max(30).optional()),
  photoRef: z.preprocess(emptyToUndefined, z.string().trim().max(512).optional()),
});

export const recurringPassSchema = z
  .strictObject({
    name: shortTextSchema,
    type: visitorTypeSchema,
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day."),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    active: z.boolean().default(true),
  })
  .refine((v) => v.endMinute > v.startMinute, {
    path: ["endMinute"],
    message: "End time must be after start time.",
  });

export const groupPassSchema = z
  .strictObject({
    label: shortTextSchema,
    type: visitorTypeSchema.default("guest"),
    maxUses: z.number().int().min(1).max(500),
    validFrom: z.date(),
    validTo: z.date(),
  })
  .refine((v) => v.validTo > v.validFrom, {
    path: ["validTo"],
    message: "End must be after start.",
  });

export const requestHandlingSchema = z.strictObject({
  requestId: uuidSchema,
  handling: z.enum(["normal", "leave_at_gate"]),
});

export const idSchema = z.strictObject({ id: uuidSchema });
export const towerSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });
export const flatSchema = z.strictObject({
  towerId: uuidSchema,
  number: z.string().trim().min(1).max(40),
});
export const profileUpdateSchema = z.strictObject({
  id: userIdSchema,
  role: roleSchema.optional(),
  flatId: uuidSchema.nullable().optional(),
}).refine((value) => value.role !== undefined || value.flatId !== undefined, {
  message: "Choose a profile change.",
});
export const staffSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  phone: optionalPhoneSchema,
});
export const staffCheckInSchema = z
  .strictObject({
    code: z.preprocess(emptyToUndefined, z.string().trim().max(32).optional()),
    staffId: optionalUuidSchema,
    method: z.enum(["manual", "qr", "code"]).default("manual"),
  })
  .refine((v) => !!(v.code || v.staffId), {
    message: "Provide a staff member or check-in code.",
    path: ["code"],
  });

export const adminCapabilitySchema = z.enum([
  "manage_society",
  "manage_members",
  "manage_gates",
  "manage_community",
  "manage_dues",
  "manage_documents",
  "view_audit",
]);
export const setAdminCapabilitiesSchema = z.strictObject({
  profileId: userIdSchema,
  capabilities: z.array(adminCapabilitySchema).max(20),
});

export const societyDocumentSchema = z.strictObject({
  title: z.string().trim().min(2).max(160),
  category: z
    .enum(["general", "bylaws", "minutes", "circular", "form", "other"])
    .default("general"),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  storageRef: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) => value.startsWith("society-media:") || z.url().safeParse(value).success,
      "Document reference is invalid.",
    ),
  fileName: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  mimeType: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  visibility: z.enum(["society", "admins"]).default("society"),
});
export const serviceProviderSchema = z.strictObject({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  phone: z.preprocess(emptyToUndefined, phoneSchema.nullable().optional()),
  photo_url: z.string().trim().max(2048).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  is_verified: z.boolean().optional(),
  is_available: z.boolean().optional(),
  availability_text: z.string().trim().max(500).nullable().optional(),
});
export const dueRaiseSchema = z.strictObject({
  period: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a YYYY-MM period."),
  amount: z.number().finite().positive("Amount must be positive.").max(100_000_000),
});
export const dueClaimSchema = z.strictObject({
  id: uuidSchema,
  note: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
});
export const flatImportRowSchema = z.strictObject({
  line: z.number().int().positive().max(100000),
  tower: z.string().trim().min(1).max(80),
  flat: z.string().trim().min(1).max(40),
});
export const bulkFlatImportSchema = z.strictObject({
  rows: z.array(flatImportRowSchema).min(1).max(500),
  idempotencyKey: uuidSchema,
  dryRun: z.boolean(),
  allOrNothing: z.boolean().default(true),
});
export const auditFilterSchema = z.strictObject({
  search: z.string().trim().max(200).optional(),
  action: z.string().trim().max(120).optional(),
  targetType: z.string().trim().max(120).optional(),
  after: z.strictObject({ created_at: isoDateTimeSchema, id: uuidSchema }).nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const auditExportSchema = z.strictObject({
  format: z.enum(["csv", "json"]),
  filters: z.record(z.string().max(80), z.string().trim().max(200)).optional(),
});
export const privacyActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("request_export") }),
  z.strictObject({ action: z.literal("request_deletion") }),
  z.strictObject({ action: z.literal("cancel_deletion") }),
  z.strictObject({ action: z.literal("artifact_url"), artifactId: uuidSchema }),
]);
export const ticketCommentSchema = z.strictObject({
  ticketId: uuidSchema,
  body: z.string().trim().min(1, "Write a comment first.").max(2000),
});
export const ticketStatusSchema = z.strictObject({
  id: uuidSchema,
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
});
export const ticketAssignmentSchema = z.strictObject({
  id: uuidSchema,
  staffId: uuidSchema.nullable(),
});
export const pushTokenSchema = z.string().trim().regex(
  /^Expo(?:nent)?PushToken\[[^\]\s]{8,}\]$/,
  "Push token is invalid.",
).max(4096);
export const visitorDecisionSchema = z.strictObject({
  requestId: uuidSchema,
  decision: decisionSchema,
});
export const adminOverrideSchema = z.strictObject({
  requestId: uuidSchema,
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500),
});
export const requestIdSchema = z.strictObject({ requestId: uuidSchema });
export const logIdSchema = z.strictObject({ logId: uuidSchema });
export const visitorIdSchema = z.strictObject({ visitorId: uuidSchema });
export const revokePreApprovalSchema = z.strictObject({
  id: uuidSchema,
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
});

export const privilegedRpcResultSchema = z.strictObject({ ok: z.literal(true) }).passthrough();
export const raiseVisitorResultSchema = z.strictObject({
  requestId: uuidSchema,
  status: requestStatusSchema,
  duplicate: z.boolean().optional(),
  watchlist: z.array(z.unknown()).optional(),
});

export const visitorWatchlistSchema = z
  .strictObject({
    kind: z.enum(["blacklist", "watchlist"]),
    name: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(120).optional()),
    phone: optionalPhoneSchema,
    vehicleNo: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
    reason: z.string().trim().min(3, "Give a short reason.").max(280),
    isActive: z.boolean().default(true),
  })
  .refine((v) => !!(v.name || v.phone || v.vehicleNo), {
    message: "Add a name, phone, or vehicle number.",
    path: ["name"],
  });

export const cctvCameraSchema = z.strictObject({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2, "Enter a camera name.").max(80),
  streamUrl: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url("Enter a valid stream URL.")),
  streamKind: z.enum(["hls", "embed", "snapshot"]).default("hls"),
  gateId: optionalUuidSchema,
  isActive: z.boolean().default(true),
});

export const gateIotDeviceSchema = z
  .strictObject({
    id: uuidSchema.optional(),
    gateId: uuidSchema,
    provider: z.enum(["mock", "webhook"]),
    label: z.string().trim().min(2).max(80),
    externalId: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
    webhookUrl: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(2048)
        .pipe(z.url("Enter a valid webhook URL."))
        .optional(),
    ),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.provider !== "webhook" || !!v.webhookUrl, {
    message: "Webhook provider needs a URL.",
    path: ["webhookUrl"],
  });

export const gateOpenRequestSchema = z.strictObject({
  gateId: uuidSchema,
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(280),
});

export const lookupWatchlistSchema = z.strictObject({
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(32).optional()),
  name: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  vehicleNo: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
});
export const adminOverrideResultSchema = z.strictObject({
  gate_log_id: uuidSchema,
  visitor_name: z.string().trim().min(1).max(80),
});
export const retryVisitorResultSchema = z.strictObject({
  requestId: uuidSchema,
  status: requestStatusSchema,
});
export const markEntryResultSchema = z.strictObject({
  gateLogId: uuidSchema,
  requestId: uuidSchema,
});
export const markExitResultSchema = z.strictObject({
  gateLogId: uuidSchema,
  exited: z.literal(true),
});
export const redeemGateCodeResultSchema = z.strictObject({
  ok: z.literal(true).optional(),
  visitor_name: z.string().trim().min(1).max(80),
  type: visitorTypeSchema,
  flat_number: z.string().trim().min(1).max(40),
  gate_log_id: uuidSchema,
});

/** SLA aging for the admin complaint queue (ticket #9): the plan's
 *  first-response target is <24h. */
export function slaAgeLabel(createdAt: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "open <1h";
  if (hours < 24) return `open ${hours}h`;
  return `open ${Math.floor(hours / 24)}d`;
}

export function slaBreached(
  createdAt: string,
  firstResponseAt: string | null,
  now: Date = new Date(),
): boolean {
  if (firstResponseAt) return false;
  return now.getTime() - new Date(createdAt).getTime() > 24 * 3_600_000;
}
