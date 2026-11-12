import { z } from "zod";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as english from "@zxcvbn-ts/language-en";

const estimator = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs,
  translations: english.translations,
});

export function passwordProblem(password: string, personal: string[] = []) {
  if (password.length < 15 || password.length > 128)
    return "Use 15 to 128 characters.";
  if (!password.trim()) return "Choose a password with words or characters.";
  if (estimator.check(password, personal).score < 3)
    return "Choose a less predictable password. Try several unrelated words.";
  return "";
}

export function passwordPersonalInputs(displayName: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return [
    displayName.trim().normalize("NFC"),
    normalizedEmail,
    normalizedEmail.split("@")[0] ?? "",
  ];
}

export const accountFields = {
  displayName: z
    .string()
    .trim()
    .normalize("NFC")
    .min(1, "Enter your name.")
    .max(120, "Use at most 120 characters.")
    .refine(
      (value) => /\p{L}/u.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value),
      "Enter a name containing letters, without control characters.",
    ),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Use an email address with at most 254 characters.")
    .pipe(z.email("Enter a valid email address.")),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Use at most 128 characters."),
};
export const loginInput = z.strictObject({
  email: accountFields.email,
  password: accountFields.password,
});
export const registration = z
  .strictObject(accountFields)
  .superRefine((value, context) => {
    const problem = passwordProblem(
      value.password,
      passwordPersonalInputs(value.displayName, value.email),
    );
    if (problem)
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: problem,
      });
  });
export const userDto = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  displayName: z.string(),
  email: z.email(),
});
export const userResponse = z.object({ data: z.object({ user: userDto }) });
export const currentUserResponse = z.object({
  data: z.object({
    user: userDto,
    membership: z
      .object({
        weddingId: z.string().regex(/^[a-f0-9]{24}$/),
        role: z.enum(["ADMIN", "ORGANIZER"]),
      })
      .nullable(),
  }),
});
