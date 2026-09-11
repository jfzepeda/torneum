import { readdir, readFile } from "node:fs/promises";
import { pool, transaction } from "./db.js";
export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(918230)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (
      await readdir(new URL("../migrations/", import.meta.url))
    )
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const exists = await db.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (!exists.rowCount) {
        await db.query(
          await readFile(
            new URL("../migrations/" + name, import.meta.url),
            "utf8",
          ),
        );
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        console.log("Applied", name);
      }
    }
  });
}
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
) {
  await migrate();
  await pool.end();
}
