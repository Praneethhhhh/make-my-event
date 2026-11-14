import { z } from "zod";
import { colorValues } from "@/modules/functions/function-colors";

export const id = z.string().regex(/^[a-f0-9]{24}$/, "Choose a valid record.");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Remove control characters.",
    );
const title = text(160).min(1, "Enter a name or title.");
const optionalId = id.nullable().default(null);
export const revision = z.number().int().positive();
const instant = z.iso
  .datetime({ offset: true })
  .refine(
    (v) => Number.isFinite(Date.parse(v)),
    "Enter a valid date and time.",
  );
export const mentionInput = z
  .object({
    userId: id,
    field: z.enum(["title", "description"]),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict();
export const taskInput = z
  .object({
    weddingTimeZone: z.string().min(1).max(100),
    title,
    description: text(4000).default(""),
    functionId: optionalId,
    assigneeType: z.literal("USER"),
    assigneeUserId: id,
    assigneeVendorId: z.null().default(null),
    vendorId: optionalId,
    mentions: z.array(mentionInput).max(40).default([]),
    creationKey: z.uuid(),
    status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]),
    priority: z.enum(["LOW", "NORMAL", "HIGH"]),
    dueAt: instant.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ends = { title: 0, description: 0 };
    for (const mention of [...value.mentions].sort(
      (a, b) => a.start - b.start,
    )) {
      const raw = value[mention.field].slice(mention.start, mention.end);
      if (
        mention.end > value[mention.field].length ||
        mention.start < ends[mention.field] ||
        !/^@[^\r\n]{1,120}$/.test(raw)
      )
        ctx.addIssue({
          code: "custom",
          path: ["mentions"],
          message: "Choose the mentioned people again before saving.",
        });
      ends[mention.field] = mention.end;
    }
  });
export const vendorInput = z
  .object({
    name: title,
    category: text(80).min(1, "Enter a category."),
    phones: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\+?[\d() .-]{5,30}$/, "Enter a valid phone number.")
          .refine((value) => {
            const digits = value.replace(/\D/g, "").length;
            return digits >= 7 && digits <= 15;
          }, "Use a phone number with 7 to 15 digits."),
      )
      .min(1, "Add a contact number.")
      .max(5),
    color: z.enum(colorValues, { error: "Choose a card color." }),
    internalNotes: text(4000).default(""),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();
export const commentInput = z
  .object({
    body: text(4000).min(1, "Write a comment."),
    mentionedUserIds: z.array(id).max(20).default([]),
    mentionRanges: z
      .array(mentionInput.omit({ field: true }))
      .max(40)
      .default([]),
    creationKey: z.uuid(),
  })
  .strict();
const money = z
  .number()
  .int()
  .positive()
  .max(100_000_000_00, "Amount exceeds the supported limit.");
const financial = {
  description: title,
  amountPaise: money,
  currency: z.literal("INR"),
  functionId: optionalId,
  creationKey: z.uuid(),
};
export const expenseInput = z
  .object({
    ...financial,
    category: text(80).min(1),
    paidAt: instant,
    notes: text(2000).default(""),
  })
  .strict();
export const chargeInput = z.object({ ...financial, vendorId: id }).strict();
export const paymentInput = z
  .object({
    vendorId: id,
    chargeId: id,
    amountPaise: money,
    currency: z.literal("INR"),
    paidAt: instant,
    paymentMethod: z.enum(["CASH", "UPI", "BANK", "OTHER"]),
    notes: text(2000).default(""),
    creationKey: z.uuid(),
  })
  .strict();
export const voidInput = z
  .object({ revision, reason: text(500).min(1, "Explain this correction.") })
  .strict();
export const readInput = z.object({ read: z.boolean() }).strict();
export type TaskInput = z.infer<typeof taskInput>;
export type VendorInput = z.infer<typeof vendorInput>;
export type OperationsRecord = {
  id: string;
  revision: number;
  [key: string]: unknown;
};
