import { z } from "zod";
export const invitationInput = z.strictObject({
  deliveryMethod: z.enum(["MANUAL", "EMAIL"]),
  role: z.enum(["ADMIN", "ORGANIZER"]).default("ORGANIZER"),
  intendedEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Use at most 254 characters.")
    .email("Enter a valid email address."),
  expiresInHours: z
    .union([z.literal(24), z.literal(48), z.literal(168)])
    .default(48),
  subject: z
    .string()
    .trim()
    .min(1, "Enter an email subject.")
    .max(160, "Use at most 160 characters.")
    .regex(/^[^\r\n\u0000-\u001f\u007f]+$/, "Use a single-line subject.")
    .optional(),
  message: z
    .string()
    .trim()
    .min(1, "Enter a message.")
    .max(4000, "Use at most 4,000 characters.")
    .regex(
      /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/,
      "Remove unsupported control characters.",
    )
    .optional(),
});
export const redemptionInput = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).email(),
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_-]{12}$/,
      "Enter the 12-character code from your email.",
    ),
});
export const memberChangeInput = z.strictObject({
  role: z.enum(["ADMIN", "ORGANIZER"]),
  revision: z.number().int().min(1),
});
export const memberRemoveInput = z.strictObject({
  revision: z.number().int().min(1),
});
export type InvitationInput = z.infer<typeof invitationInput>;
export type MemberDto = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "ORGANIZER";
  isYou: boolean;
  revision: number;
};
export type InvitationDto = {
  deliveryMethod: "MANUAL" | "EMAIL";
  id: string;
  role: "ADMIN" | "ORGANIZER";
  intendedEmail: string | null;
  createdAt: string;
  expiresAt: string;
  status: "PENDING" | "EXPIRED" | "REVOKED" | "ACCEPTED";
  emailStatus: "SENDING" | "ACCEPTED" | "FAILED" | "UNKNOWN" | "NOT_SENT";
};
