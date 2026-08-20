import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data/postgres");

const port = Number(process.env.PG_PORT || 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: process.env.PG_USER || "dropzen",
  password: process.env.PG_PASSWORD || "dropzen",
  port,
  persistent: true,
});

async function main() {
  try {
    await pg.initialise();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/already|exist/i.test(message)) {
      console.warn("Postgres initialise:", message);
    }
  }
  await pg.start();
  try {
    await pg.createDatabase("dropzen");
  } catch {
    /* already exists */
  }
  console.log(`Embedded PostgreSQL running on port ${port}`);
  console.log(`DATABASE_URL=postgresql://dropzen:dropzen@127.0.0.1:${port}/dropzen`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit(0);
});
