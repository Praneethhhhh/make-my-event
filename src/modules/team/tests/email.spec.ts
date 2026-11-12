import { test, expect } from "@playwright/test";
import { sendInvitationEmail } from "../invitation-email";
const input = {
  invitationId: "test-id",
  to: "family@example.invalid",
  code: "TestCode23456",
  weddingTitle: "Pavithra & Manish",
  role: "ORGANIZER",
  expiresAt: "2027-02-18T00:00:00Z",
};
const config = { apiKey: "test-key", from: "sender@example.invalid" };
test("Resend adapter uses one stable idempotency key and a private email body", async () => {
  const transport: typeof fetch = async (_url, options) => {
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(
      "membership-invitation/test-id",
    );
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer test-key",
    );
    const body = JSON.parse(String(options?.body));
    expect(body.to).toEqual([input.to]);
    expect(body.text).toContain(input.code);
    expect(body.text).not.toContain("https://");
    return Response.json({ id: "provider-id" });
  };
  expect(await sendInvitationEmail(input, config, transport)).toEqual({
    status: "ACCEPTED",
    providerId: "provider-id",
  });
});
test("provider errors and ambiguous timeouts never claim delivery", async () => {
  expect(
    await sendInvitationEmail(input, config, async () =>
      Response.json({}, { status: 422 }),
    ),
  ).toEqual({ status: "FAILED" });
  expect(
    await sendInvitationEmail(input, config, async () => {
      throw new Error("timeout");
    }),
  ).toEqual({ status: "UNKNOWN" });
});
