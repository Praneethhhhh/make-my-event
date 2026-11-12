import { AccountForm } from "@/modules/auth/account-form";
import { accountNavigation } from "@/modules/auth/account-navigation";
import { redirect } from "next/navigation";
export default async function RegisterPage() {
  const navigation = await accountNavigation();
  if (navigation.state === "authenticated") redirect(navigation.href);
  return <AccountForm />;
}
