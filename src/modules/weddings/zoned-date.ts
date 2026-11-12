function dateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function addDay(date: string) {
  const { year, month, day } = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

function offsetAt(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return representedAsUtc - Math.floor(instant / 1000) * 1000;
}

export function localDateTime(instant: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localDateTimeToUtc(value: string, timeZone: string) {
  if (!value.trim()) throw new Error("Enter a date and time.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid date and time.");
  const utc = Date.parse(value + ":00Z");
  if (!Number.isFinite(utc)) throw new Error("Enter a valid date and time.");
  const offsets = new Set(
    [-86400000, 0, 86400000].map((delta) => offsetAt(utc + delta, timeZone)),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(utc - offset).toISOString())
    .filter((instant) => localDateTime(instant, timeZone) === value);
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "This time occurs twice during a clock change. Choose an unambiguous time."
        : "This local time does not exist during a clock change. Choose another time.",
    );
  return candidates[0]!;
}

export function startOfDayInZone(date: string, timeZone: string) {
  const midnight = Date.parse(date + "T00:00:00.000Z");
  const offsets = new Set(
    [-172800000, -86400000, 0, 86400000, 172800000].map((delta) =>
      offsetAt(midnight + delta, timeZone),
    ),
  );
  const candidates = [...offsets]
    .map((offset) => midnight - offset)
    .sort((a, b) => a - b);
  const exact = candidates.find(
    (instant) =>
      localDateTime(new Date(instant).toISOString(), timeZone) ===
      date + "T00:00",
  );
  // A repeated midnight starts at its first occurrence.
  if (exact !== undefined) return new Date(exact);

  // Midnight can be skipped entirely. The offset iteration used previously
  // oscillated across that gap and could return the preceding local date.
  // Find the transition instant between the before/after offset candidates.
  let before = candidates[0]!;
  let after = candidates[candidates.length - 1]!;
  while (after - before > 1) {
    const middle = before + Math.floor((after - before) / 2);
    const localDate = localDateTime(
      new Date(middle).toISOString(),
      timeZone,
    ).slice(0, 10);
    if (localDate < date) before = middle;
    else after = middle;
  }
  return new Date(after);
}

export function endOfDayInZone(date: string, timeZone: string) {
  return new Date(startOfDayInZone(addDay(date), timeZone).valueOf() - 1);
}
