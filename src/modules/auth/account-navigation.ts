import { cookies } from "next/headers";
import { sessionCookieName } from "./auth-http";
import { currentUser } from "./registration-service";

export async function accountNavigation() {
  const token = (await cookies()).get(sessionCookieName)?.value ?? "";
  try {
    const user = await currentUser(token);
    if (!user)
      return {
        state: "guest",
        href: "/register",
        label: "Create an account",
      } as const;
    return {
      state: "authenticated",
      href: "/weddings",
      label: "Your weddings",
    } as const;
  } catch {
    // Keep the public landing page available without guessing that a session is signed out.
    return {
      state: "unavailable",
      href: "/sign-in",
      label: "Your account",
    } as const;
  }
}
