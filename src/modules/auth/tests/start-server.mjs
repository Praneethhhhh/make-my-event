import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";

const replica = await MongoMemoryReplSet.create({
  binary: { version: "8.2.6" },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
await mkdir(".next", { recursive: true });
await writeFile(
  ".next/auth-test-db.json",
  JSON.stringify({ uri: replica.getUri("auth_tests") }),
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
  await replica.stop();
  await rm(".next/auth-test-db.json", { force: true });
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
server.on("exit", () => void stop());
