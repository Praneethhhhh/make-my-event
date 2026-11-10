import { cookie, cookieValue, reply } from "@/modules/auth/auth-http";
import { secret } from "@/modules/auth/registration-service";
export function GET(request: Request) {
  const previous = cookieValue(request, "mme_csrf");
  const token = /^[a-f0-9]{64}$/.test(previous) ? previous : secret();
  return reply(200, { data: { token } }, cookie("mme_csrf", token, 900));
}
