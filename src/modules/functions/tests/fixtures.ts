import type { APIRequestContext } from "@playwright/test";
import { account, mutation, origin } from "../../auth/tests/fixtures";
export const profile = {
  title: "Pavithra & Manish’s Wedding",
  coupleNames: { first: "Pavithra", second: "Manish" },
  startsOn: "2027-02-18",
  endsOn: "2027-02-21",
  timeZone: "Asia/Kolkata",
};
export const ceremony = {
  name: "Haldi",
  color: "forest",
  startsAt: "2027-02-19T04:30:00.000Z",
  endsAt: "2027-02-19T06:30:00.000Z",
  venue: { name: "Family courtyard", latitude: 12.9, longitude: 77.6 },
};
export async function write(
  api: APIRequestContext,
  path: string,
  data: unknown,
  method = "POST",
) {
  const csrf = await api.get("/api/v1/auth/csrf");
  if (
    path.startsWith("functions") &&
    !path.endsWith("/archive") &&
    ["POST", "PATCH"].includes(method) &&
    data &&
    typeof data === "object" &&
    !("weddingRevision" in data)
  ) {
    const current = await api.get("/api/v1/wedding");
    data = {
      ...data,
      weddingRevision: current.ok()
        ? (await current.json()).data.wedding.revision
        : 1,
    };
  }
  return api.fetch("/api/v1/" + path, {
    method,
    data,
    headers: { Origin: origin, "X-CSRF-Token": (await csrf.json()).data.token },
  });
}
export async function onboard(api: APIRequestContext, email = account.email) {
  await mutation(api, "register", { ...account, email }, email);
  const response = await write(api, "weddings", profile);
  if (response.status() !== 201) throw new Error("Test onboarding failed");
  return (await response.json()).data.wedding;
}
