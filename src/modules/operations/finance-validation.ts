import { z } from "zod";
import { id, revision } from "./operations-validation";
const amount = z
  .number()
  .int()
  .positive()
  .max(10_000_000_000, "Amount exceeds the supported limit.");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Remove control characters.",
    );
export const costInput = z
  .object({
    description: text(160).min(1, "Enter an expense description."),
    category: text(80).min(1, "Enter a category."),
    vendorId: id.nullable().default(null),
    amountPaise: amount,
    currency: z.literal("INR"),
    notes: text(2000).default(""),
    creationKey: z.uuid(),
  })
  .strict();
export const settlementInput = z
  .object({
    weddingTimeZone: z.string().min(1).max(100),
    expenseId: id,
    expenseSource: z.enum(["expenses", "vendorCharges"]),
    amountPaise: amount,
    currency: z.literal("INR"),
    paidAt: z.iso.datetime({ offset: true }),
    paymentMethod: z.enum(["CASH", "UPI", "BANK", "OTHER"]),
    notes: text(2000).default(""),
    creationKey: z.uuid(),
  })
  .strict();
export const correctionInput = z
  .object({
    source: z.enum([
      "expenses",
      "vendorCharges",
      "vendorPayments",
      "expensePayments",
      "legacyExpenses",
    ]),
    revision,
    reason: text(500).min(1, "Enter a reason for removing this entry."),
    creationKey: z.uuid(),
  })
  .strict();
export const paidCostInput = costInput.extend({
  weddingTimeZone: settlementInput.shape.weddingTimeZone,
  paidAt: settlementInput.shape.paidAt,
  paymentMethod: settlementInput.shape.paymentMethod,
});
