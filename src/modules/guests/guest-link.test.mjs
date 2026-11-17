import { test } from "node:test";
import assert from "node:assert/strict";
import { privateGuestUrl } from "./guest-link.ts";
test("guest links support blank development origin and require an explicit production origin", () => {
  const saved = { origin: process.env.APP_ORIGIN, mode: process.env.NODE_ENV };
  try {
    process.env.NODE_ENV = "development";
    process.env.APP_ORIGIN = "";
    assert.equal(
      privateGuestUrl("sample"),
      "http://127.0.0.1:3000/invite#token=sample",
    );
    process.env.NODE_ENV = "production";
    assert.throws(() => privateGuestUrl("sample"), /APP_ORIGIN is required/);
    process.env.APP_ORIGIN = "https://events.example/";
    assert.equal(
      privateGuestUrl("sample"),
      "https://events.example/invite#token=sample",
    );
  } finally {
    if (saved.origin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = saved.origin;
    if (saved.mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.mode;
  }
});
