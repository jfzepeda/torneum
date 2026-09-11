import { writeFile } from "node:fs/promises";
import { buildApp } from "./app.js";
import { pool } from "./db.js";
const app = await buildApp();
await app.ready();
await writeFile("openapi.json", JSON.stringify(app.swagger(), null, 2));
await app.close();
await pool.end();
