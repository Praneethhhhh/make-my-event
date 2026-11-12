import { test, expect } from "@playwright/test";
import { startOfDayInZone, endOfDayInZone, localDateTime } from "../zoned-date";

test("midnight DST gaps start at the first valid local instant", () => {
  const start = startOfDayInZone("2018-11-04", "America/Sao_Paulo");
  expect(start.toISOString()).toBe("2018-11-04T03:00:00.000Z");
  expect(localDateTime(start.toISOString(), "America/Sao_Paulo")).toBe(
    "2018-11-04T01:00",
  );
  expect(endOfDayInZone("2018-11-03", "America/Sao_Paulo").toISOString()).toBe(
    "2018-11-04T02:59:59.999Z",
  );
  expect(endOfDayInZone("2018-11-04", "America/Sao_Paulo").toISOString()).toBe(
    "2018-11-05T01:59:59.999Z",
  );
});

test("repeated midnights start at their first occurrence", () => {
  expect(startOfDayInZone("2026-11-01", "America/Havana").toISOString()).toBe(
    "2026-11-01T04:00:00.000Z",
  );
  expect(endOfDayInZone("2026-11-01", "America/Havana").toISOString()).toBe(
    "2026-11-02T04:59:59.999Z",
  );
});

test("ordinary non-UTC dates retain inclusive and adjacent boundaries", () => {
  expect(startOfDayInZone("2027-02-18", "Asia/Kolkata").toISOString()).toBe(
    "2027-02-17T18:30:00.000Z",
  );
  expect(endOfDayInZone("2027-02-18", "Asia/Kolkata").valueOf() + 1).toBe(
    startOfDayInZone("2027-02-19", "Asia/Kolkata").valueOf(),
  );
});
