import { createApp } from "./app.js";
import { env, assertProductionEnv } from "./config/env.js";
import { prisma } from "./config/db.js";
import { runDailyJobs } from "./jobs/daily.js";
import { log } from "./utils/log.js";

assertProductionEnv();

const app = createApp();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  log("info", `DropZen API listening on http://127.0.0.1:${env.PORT}`);
  runDailyJobs().catch((err) => log("error", "Daily jobs failed", { err }));
});

const jobs = setInterval(() => {
  runDailyJobs().catch((err) => log("error", "Daily jobs failed", { err }));
}, 15 * 60 * 1000);

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `${signal} received, shutting down`);
  clearInterval(jobs);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
