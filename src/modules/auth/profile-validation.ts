import { z } from "zod";
import { accountFields } from "./account-validation";
const revision = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const profileInput = z.strictObject({
  displayName: accountFields.displayName,
  revision,
});
export const passwordChangeInput = z
  .strictObject({
    currentPassword: accountFields.password,
    newPassword: accountFields.password,
    confirmPassword: accountFields.password,
    revision,
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword)
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    if (value.newPassword === value.currentPassword)
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choose a different password.",
      });
  });
export type AccountProfile = {
  id: string;
  displayName: string;
  email: string;
  revision: number;
};
