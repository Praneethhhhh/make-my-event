import { z } from "zod";

const personName = z
  .string()
  .trim()
  .normalize("NFC")
  .min(1, "Enter a partner or host name.")
  .max(120, "Use at most 120 characters.")
  .refine(
    (value) => /\p{L}/u.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value),
    "Use a name containing letters, without control characters.",
  );

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Select a valid date.");

const timeZone = z
  .string()
  .trim()
  .min(1, "Select a valid time zone.")
  .max(64, "Select a valid time zone.")
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Select a valid time zone.");

export const weddingInput = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, "Enter a wedding title.")
      .max(120, "Use at most 120 characters."),
    coupleNames: z.strictObject({ first: personName, second: personName }),
    tradition: z
      .enum([
        "HINDU",
        "SIKH",
        "MUSLIM",
        "CHRISTIAN",
        "INTERFAITH",
        "CIVIL",
        "OTHER",
      ])
      .optional(),
    startsOn: dateOnly,
    endsOn: dateOnly,
    timeZone,
    description: z
      .string()
      .trim()
      .max(500, "Use at most 500 characters.")
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.endsOn < value.startsOn)
      context.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "End date must be on or after the start date.",
      });
  });

export const weddingDto = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  title: z.string(),
  coupleNames: z.object({ first: z.string(), second: z.string() }),
  tradition: z.string().nullable(),
  startsOn: z.string(),
  endsOn: z.string(),
  timeZone: z.string(),
  description: z.string().nullable(),
  status: z.literal("ACTIVE"),
  revision: z.number().int().min(1),
});
