import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { FastifyRequest } from "fastify";
import { pool, DomainError } from "./db.js";
export type Role =
  | "admin"
  | "registration"
  | "scheduling"
  | "referee"
  | "viewer"
  | "participant";
export type Actor = {
  id: string;
  organization_id: string;
  role: Role;
  name: string;
  team_id?: string;
};
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(stored, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const grants: Record<Role, string[]> = {
  admin: ["*"],
  registration: ["registrations", "categories", "requests"],
  scheduling: ["schedule", "courts"],
  referee: ["results"],
  viewer: [],
  participant: ["own"],
};
export function permits(role: Role, permission: string) {
  return (
    grants[role]?.includes("*") || grants[role]?.includes(permission) || false
  );
}
export function requirePermission(
  actor: Actor | undefined,
  permission: string,
) {
  if (!actor) throw new DomainError(401, "Inicia sesión para continuar.");
  if (!permits(actor.role, permission))
    throw new DomainError(403, "Tu rol no permite esta operación.");
  return actor;
}
export async function getActor(
  req: FastifyRequest,
): Promise<Actor | undefined> {
  const token = req.cookies.torneum_session;
  if (!token) return;
  const { rows } = await pool.query(
    `SELECT s.organization_id,s.user_id,s.team_id,u.name,u.role,t.name team_name FROM sessions s LEFT JOIN users u ON u.id=s.user_id AND u.active=true LEFT JOIN teams t ON t.id=s.team_id WHERE token_hash=$1 AND expires_at>now()`,
    [hashToken(token)],
  );
  const s = rows[0];
  if (!s || (!s.role && !s.team_id)) return;
  return {
    id: s.user_id || s.team_id,
    organization_id: s.organization_id,
    role: s.role || "participant",
    name: s.name || s.team_name,
    team_id: s.team_id || undefined,
  };
}
