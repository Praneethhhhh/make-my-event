import { test, expect } from "@playwright/test";
import { validMutation } from "../../auth/auth-http";
test("local management edits support both loopback names without allowing foreign origins or missing CSRF", () => {
  const priorEnv = process.env.NODE_ENV;
  const priorOrigin = process.env.APP_ORIGIN;
  const token = "a".repeat(64);
  const request = (origin: string, csrf = token) =>
    new Request("http://localhost:3000/api/v1/wedding", {
      method: "PATCH",
      headers: {
        Origin: origin,
        Cookie: `mme_csrf=${token}`,
        "X-CSRF-Token": csrf,
      },
    });
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.APP_ORIGIN;
    expect(validMutation(request("http://127.0.0.1:3000"))).toBe(true);
    expect(validMutation(request("http://localhost:3000"))).toBe(true);
    expect(validMutation(request("https://attacker.example"))).toBe(false);
    expect(validMutation(request("http://127.0.0.1:3000", "bad"))).toBe(false);
    expect(validMutation(request("http://127.0.0.1:4000"))).toBe(false);
    Object.assign(process.env, {
      NODE_ENV: "production",
      APP_ORIGIN: "https://events.example",
    });
    expect(validMutation(request("http://127.0.0.1:3000"))).toBe(false);
    expect(validMutation(request("https://events.example"))).toBe(true);
  } finally {
    if (priorEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: priorEnv });
    if (priorOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = priorOrigin;
  }
});
