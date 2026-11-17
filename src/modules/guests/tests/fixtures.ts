import type { APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { onboard, ceremony, write } from "../../functions/tests/fixtures";
import { scopedGet, origin } from "../../auth/tests/fixtures";
export { write, scopedGet, origin };
export async function setup(api: APIRequestContext, email?: string) {
  const wedding = await onboard(api, email);
  const fn = (await (await write(api, "functions", ceremony)).json()).data
    .function;
  const second = (
    await (
      await write(api, "functions", {
        ...ceremony,
        name: "Sangeet",
        color: "copper",
        startsAt: "2027-02-20T12:30:00.000Z",
        endsAt: "2027-02-20T15:30:00.000Z",
      })
    ).json()
  ).data.function;
  return { wedding, fn, second };
}
export const recipient = (functions: { id: string }[]) => ({
  displayName: "Elon Musk & family",
  personalMessage: "We would love to celebrate with you.",
  functions: functions.map((f) => ({
    functionId: f.id,
    maxAttendees: 4,
    deadlineOverrideAt: null,
  })),
  creationKey: randomUUID(),
});
export async function invite(
  api: APIRequestContext,
  functions: { id: string }[],
) {
  const payload = recipient(functions),
    r = await write(api, "guests", payload);
  if (r.status() !== 201) throw new Error(JSON.stringify(await r.json()));
  const { id } = (await r.json()).data;
  return (await (await scopedGet(api, `/api/v1/guests/${id}`)).json()).data;
}
export async function reveal(
  api: APIRequestContext,
  guest: { id: string; revision: number },
) {
  const r = await write(api, `guests/${guest.id}/links/reveal`, {
    revision: guest.revision,
    creationKey: randomUUID(),
  });
  if (!r.ok()) throw new Error(JSON.stringify(await r.json()));
  return (await r.json()).data.url as string;
}
export async function publicWrite(
  api: APIRequestContext,
  path: string,
  data: unknown,
  id?: string,
  method = "POST",
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  return api.fetch("/api/v1/guest/" + path, {
    method,
    data,
    headers: {
      Origin: origin,
      "X-CSRF-Token": (await csrf.json()).data.token,
      "x-auth-test-ip": "guest-tests",
      ...(id ? { "X-Guest-Id": id } : {}),
    },
  });
}
export async function open(api: APIRequestContext, url: string) {
  return publicWrite(api, "access/exchange", {
    token: new URLSearchParams(new URL(url).hash.slice(1)).get("token"),
  });
}
export const readGuest = (api: APIRequestContext, id: string) =>
  api.get("/api/v1/guest/functions", { headers: { "X-Guest-Id": id } });
export const rsvp = (
  api: APIRequestContext,
  guestId: string,
  id: string,
  revision: number,
  count = 3,
  status = "ACCEPTED",
  creationKey = randomUUID(),
) =>
  publicWrite(
    api,
    `function-invitations/${id}/rsvp`,
    { status, attendeeCount: count, revision, creationKey },
    guestId,
    "PUT",
  );
