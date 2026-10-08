import { parseArgs } from "node:util";
import { pool } from "./db.js";
import { newToken, hashPassword } from "./auth.js";
const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
const email = values.email?.trim().toLowerCase();
if (!email || !values.name) {
  console.error("Uso: pnpm platform:admin --email <correo> --name <nombre>");
  process.exit(1);
}
const password = newToken().slice(0, 16);
await pool.query(
  "INSERT INTO platform_admins(email,name,password_hash) VALUES($1,$2,$3) ON CONFLICT (email) DO UPDATE SET name=$2,password_hash=$3,active=true",
  [email, values.name, hashPassword(password)],
);
await pool.query("DELETE FROM platform_sessions WHERE admin_id=(SELECT id FROM platform_admins WHERE email=$1)", [email]);
console.log(`Administrador de plataforma: ${email}\nContraseña temporal: ${password}`);
await pool.end();
