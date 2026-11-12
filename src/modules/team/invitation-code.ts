import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
export function codeSecret() {
  const value = process.env.INVITATION_CODE_SECRET ?? "";
  const secret = Buffer.from(value, "base64");
  if (secret.length !== 32 || secret.toString("base64") !== value)
    throw new Error("Invitation code secret is not configured");
  return secret;
}
export function createInvitationCode(email: string) {
  const secret = codeSecret();
  const code = randomBytes(9).toString("base64url");
  const codeVerifier = invitationVerifier(email, code);
  const nonce = randomBytes(12);
  const key = createHmac("sha256", secret)
    .update("membership-code-encryption:v1")
    .digest();
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return {
    code,
    codeVerifier,
    encryptedCode: {
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      keyVersion: 1,
    },
  };
}
export function decryptInvitationCode(value: {
  ciphertext: string;
  nonce: string;
  tag: string;
  keyVersion: number;
}) {
  if (value.keyVersion !== 1)
    throw new Error("Unsupported invitation key version");
  const key = createHmac("sha256", codeSecret())
    .update("membership-code-encryption:v1")
    .digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
export function invitationVerifier(email: string, code: string) {
  return createHmac("sha256", codeSecret())
    .update(`membership-code:${email}:${code}`)
    .digest("hex");
}
