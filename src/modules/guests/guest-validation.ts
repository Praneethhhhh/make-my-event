import { z } from "zod";
export const guestId = z
  .string()
  .regex(/^[a-f0-9]{24}$/, "Choose a valid record.");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .refine(
      (v) => !/[\p{Cc}\p{Cf}]/u.test(v.replace(/[\r\n\t]/g, "")),
      "Remove control characters.",
    );
export const selectedFunction = z.strictObject({
  functionId: guestId,
  maxAttendees: z
    .number({ error: "Enter a whole number of people." })
    .int("Use a whole number of people.")
    .min(1, "Invite at least one person.")
    .max(200, "Invite no more than 200 people in one invitation."),
  deadlineOverrideAt: z.iso.datetime({ offset: true }).nullable().default(null),
  revision: z.number().int().min(1).optional(),
});
export const guestInput = z.strictObject({
  displayName: text(160)
    .min(1, "Enter a guest or family name.")
    .refine((v) => !/[\r\n\t]/.test(v), "Keep the recipient name on one line."),
  personalMessage: text(500).default(""),
  functions: z
    .array(selectedFunction)
    .min(1, "Choose at least one function.")
    .max(100)
    .refine(
      (v) => new Set(v.map((f) => f.functionId)).size === v.length,
      "Select each function only once.",
    ),
  creationKey: z.uuid(),
});
export const guestEdit = guestInput.extend({
  revision: z.number().int().min(1),
});
export const guestAction = z.strictObject({
  revision: z.number().int().min(1),
  creationKey: z.uuid(),
});
export const responseInput = z
  .strictObject({
    status: z.enum(["ACCEPTED", "DECLINED"]),
    attendeeCount: z
      .number({ error: "Enter a whole number of people." })
      .int("Use a whole number of people.")
      .min(0, "Use zero for a declined response.")
      .max(200, "Please choose fewer people or contact your hosts."),
    revision: z.number().int().min(1),
    creationKey: z.uuid(),
  })
  .refine(
    (v) =>
      v.status === "DECLINED" ? v.attendeeCount === 0 : v.attendeeCount >= 1,
    {
      message: "Choose a valid number of people for this response.",
      path: ["attendeeCount"],
    },
  );
export const correctionInput = responseInput.safeExtend({
  reason: text(500).min(1, "Enter a reason for this correction."),
});
export type GuestInput = z.infer<typeof guestInput>;
export type GuestEdit = z.infer<typeof guestEdit>;
export type GuestResponse = z.infer<typeof responseInput>;
