import { test, expect } from "@playwright/test";
import { parseRupees } from "../finance-money";
import {
  activeMentionQuery,
  moveMentions,
  trimmedMentions,
} from "../mention-ranges";

test("committed multiword mentions do not reopen while continuing a sentence", () => {
  const text = "Ask @Pavithra Manish to confirm tomorrow";
  const mentions = [{ userId: "person", start: 4, end: 20 }];
  expect(activeMentionQuery(text, text.length, mentions)).toBeNull();
  expect(activeMentionQuery(text, 12, mentions)).toBeNull();
  const next = text + " and @మని";
  expect(activeMentionQuery(next, next.length, mentions)).toEqual({
    start: text.length + 5,
    end: next.length,
    text: "మని",
  });
  expect(activeMentionQuery("First line\n@Pavi", 16, [])?.text).toBe("Pavi");
  expect(activeMentionQuery("email@example.invalid", 21, [])).toBeNull();
});
test("rupee input preserves exact paise and rejects rounding, exponent and unsupported amounts", () => {
  expect(parseRupees("1234.50")).toBe(123450);
  expect(parseRupees("0.01")).toBe(1);
  expect(parseRupees("100000000")).toBe(10_000_000_000);
  for (const value of [
    "",
    "0",
    "-1",
    "1.001",
    "1e3",
    "Infinity",
    "100000000.01",
    "1,000",
  ])
    expect(() => parseRupees(value)).toThrow();
});
test("mention ranges shift around edits and drop edited tags without retargeting people", () => {
  const before = "Hello @Manish today";
  const ranges = [{ userId: "person", start: 6, end: 13 }];
  expect(moveMentions(before, "Hi! " + before, ranges)).toEqual([
    { userId: "person", start: 10, end: 17 },
  ]);
  expect(moveMentions(before, before + "!", ranges)).toEqual(ranges);
  expect(moveMentions(before, "Hello @Pavithra today", ranges)).toEqual([]);
  expect(moveMentions(before, "Hello  today", ranges)).toEqual([]);
  expect(
    trimmedMentions("  @Manish ", [{ userId: "person", start: 2, end: 9 }]),
  ).toEqual([{ userId: "person", start: 0, end: 7 }]);
});
