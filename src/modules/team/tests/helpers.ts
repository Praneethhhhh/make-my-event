import { readFile } from "node:fs/promises";
export async function deliveredEmail(
  email: string,
): Promise<{ subject: string; text: string }> {
  const config = JSON.parse(await readFile(".next/auth-test-db.json", "utf8"));
  const response = await fetch(
    `${config.emailMockUrl}/${encodeURIComponent(email)}`,
  );
  return response.json();
}
export async function deliveredCode(email: string) {
  const body = await deliveredEmail(email);
  const code = /invitation code:\n([A-Za-z0-9_-]{12})/.exec(body.text)?.[1];
  if (!code)
    throw new Error("Mock provider did not receive an invitation code");
  return code;
}
