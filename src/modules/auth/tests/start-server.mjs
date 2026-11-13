import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
const capturedEmails = new Map();
let releaseHeldDelivery;
const emailMock = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/__delivery-status") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ processing: !!releaseHeldDelivery }));
    return;
  }
  if (request.method === "GET" && request.url === "/__delivery-release") {
    releaseHeldDelivery?.();
    releaseHeldDelivery = undefined;
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(
        capturedEmails.get(decodeURIComponent(request.url.slice(1))) ?? null,
      ),
    );
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body || "{}");
  capturedEmails.set(input.to?.[0], input);
  if (input.to?.[0] === "held-delivery@example.invalid") {
    await new Promise((resolve) => {
      releaseHeldDelivery = resolve;
    });
  }
  response.writeHead(input.to?.[0] === "fail@example.invalid" ? 422 : 200, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify({ id: "test-provider-id" }));
});
await new Promise((resolve) => emailMock.listen(0, "127.0.0.1", resolve));
const mockAddress = emailMock.address();

const replica = await MongoMemoryReplSet.create({
  binary: { version: "8.2.6" },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
await mkdir(".next", { recursive: true });
await writeFile(
  ".next/auth-test-db.json",
  JSON.stringify({
    uri: replica.getUri("auth_tests"),
    emailMockUrl: `http://127.0.0.1:${mockAddress.port}`,
  }),
);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: replica.getUri("auth_tests"),
      APP_ORIGIN: "http://127.0.0.1:3100",
      TRUSTED_CLIENT_IP_HEADER: "x-auth-test-ip",
      VERCEL: "",
      MME_EMAIL_TEST: "1",
      MME_EMAIL_TEST_URL: `http://127.0.0.1:${mockAddress.port}`,
      RESEND_API_KEY:
        process.env.MME_TEST_DISABLE_EMAIL === "1" ? "" : "test-not-a-real-key",
      RESEND_FROM_EMAIL:
        process.env.MME_TEST_DISABLE_EMAIL === "1" ? "" : "qa@example.invalid",
      INVITATION_CODE_SECRET: Buffer.alloc(32, 7).toString("base64"),
      INVITATION_EMAIL_DAILY_LIMIT: "100",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill();
  emailMock.close();
  await replica.stop();
  await rm(".next/auth-test-db.json", { force: true });
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
server.on("exit", () => void stop());
