import assert from "node:assert/strict";
import test from "node:test";
import {
  registration,
  loginInput,
  passwordProblem,
  passwordPersonalInputs,
} from "./account-validation.ts";

test("registration rejects predictable passwords", () => {
  for (const password of [
    "               ",
    "aaaaaaaaaaaaaaa",
    "Password123456!",
    "123456789012345",
    "qwertyuiopasdfgh",
  ])
    assert.ok(passwordProblem(password));
  assert.equal(passwordProblem("violet canoe lantern meadow 72"), "");
  assert.notEqual(
    passwordProblem(
      "violet canoe lantern meadow 72",
      passwordPersonalInputs(
        "Violet Canoe Lantern Meadow 72",
        "family@example.com",
      ),
    ),
    "",
  );
});
test("account boundaries normalize identity and reject invalid or privileged input", () => {
  const input = {
    displayName: "  José O’Neil  ",
    email: "  PERSON@EXAMPLE.COM ",
    password: "violet canoe lantern meadow 72",
  };
  const parsed = registration.parse(input);
  assert.equal(parsed.displayName, "José O’Neil");
  assert.equal(parsed.email, "person@example.com");
  for (const displayName of [" ", "1234", "!!!", "Alice\u0000"])
    assert.equal(
      registration.safeParse({ ...input, displayName }).success,
      false,
    );
  assert.equal(
    registration.safeParse({ ...input, role: "ADMIN" }).success,
    false,
  );
  const oversizedEmail = registration.safeParse({
    ...input,
    email: `${"a".repeat(250)}@example.com`,
  });
  assert.equal(oversizedEmail.success, false);
  assert.equal(
    oversizedEmail.error.issues[0]?.message,
    "Use an email address with at most 254 characters.",
  );
});
test("existing accounts can submit their original password when signing in", () => {
  assert.equal(
    loginInput.safeParse({ email: "old@example.com", password: "old-password" })
      .success,
    true,
  );
});
