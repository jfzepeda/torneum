import { buildApp } from "./app.js";
import { pool } from "./db.js";
import { processOutbox } from "./integrations.js";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const app = await buildApp();
await app.listen({
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "127.0.0.1",
});
const worker =
  process.env.OUTBOX_ENABLED === "true"
    ? setInterval(
        () => processOutbox().catch((error) => app.log.error(error)),
        15000,
      )
    : undefined;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (worker) clearInterval(worker);
    await app.close();
    await pool.end();
    process.exit(0);
  });
