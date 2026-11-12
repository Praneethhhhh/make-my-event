type EmailResult = {
  status: "ACCEPTED" | "FAILED" | "UNKNOWN";
  providerId?: string;
};
export async function sendInvitationEmail(
  input: {
    invitationId: string;
    to: string;
    code: string;
    weddingTitle: string;
    role: string;
    expiresAt: string;
    subject?: string | undefined;
    message?: string | undefined;
    appOrigin?: string;
  },
  config = {
    apiKey: process.env.RESEND_API_KEY!,
    from: process.env.RESEND_FROM_EMAIL!,
  },
  transport: typeof fetch = fetch,
): Promise<EmailResult> {
  try {
    const response = await transport(
      process.env.MME_EMAIL_TEST === "1"
        ? process.env.MME_EMAIL_TEST_URL!
        : "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `membership-invitation/${input.invitationId}`,
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          from: config.from,
          to: [input.to],
          subject:
            input.subject ??
            `You’re invited to help plan ${input.weddingTitle}`,
          text: `${input.message ?? `You’ve been invited to ${input.weddingTitle} as ${input.role === "ADMIN" ? "an administrator" : "an organizer"}. We’d love your help planning our celebration.`}\n\nYour private, single-use invitation code:\n${input.code}\n\nExpires: ${input.expiresAt}\nRegister or sign in with ${input.to}, then open Join with code under Your weddings. ${input.appOrigin ? `Open the app: ${input.appOrigin}/weddings/join` : ""}\nEmail matching alone does not grant access. Keep this code private. If you were not expecting it, ignore this email.`,
        }),
      },
    );
    if (!response.ok)
      return { status: response.status >= 500 ? "UNKNOWN" : "FAILED" };
    const body = await response.json();
    return typeof body.id === "string"
      ? { status: "ACCEPTED", providerId: body.id }
      : { status: "UNKNOWN" };
  } catch {
    return { status: "UNKNOWN" };
  }
}
