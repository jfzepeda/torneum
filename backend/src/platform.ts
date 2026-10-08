import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool, transaction, audit, ensure } from "./db.js";
import { hashToken, newToken, verifyPassword, hashPassword } from "./auth.js";
const COOKIE = "torneum_platform";
const reserved = ["plataforma","api","v1","_next","admin","portal","inscripcion","verificar","mi-pareja","static"];
const email = z.email().max(254).transform((v) => v.toLowerCase());
const short = z.string().trim().min(1).max(150);
const slug = z.string().trim().min(3).max(40).regex(/^[a-z0-9](-?[a-z0-9])*$/, "Slug inválido.");
const setCookie = (reply: FastifyReply, token: string) =>
  reply.setCookie(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 28800 });
async function getPlatformAdmin(req: FastifyRequest) {
  const t = req.cookies[COOKIE];
  if (!t) return undefined;
  return (await pool.query(
    "SELECT a.id,a.name,a.email FROM platform_sessions s JOIN platform_admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true",
    [hashToken(t)],
  )).rows[0] as { id: string; name: string; email: string } | undefined;
}
async function requireAdmin(req: FastifyRequest) {
  const a = await getPlatformAdmin(req);
  ensure(a, "Inicia sesión como administrador de plataforma.", 401);
  return a;
}
const view = (a: { id: string; name: string; email: string }) => ({ id: a.id, name: a.name, email: a.email });
const loose = { response: { 200: { type: "object", additionalProperties: true } } };
export function registerPlatform(app: FastifyInstance) {
  app.post("/v1/platform/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } }, schema: loose }, async (req, reply) => {
    const b = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body);
    const u = (await pool.query("SELECT * FROM platform_admins WHERE email=$1 AND active=true", [b.email])).rows[0];
    const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
    ensure(verifyPassword(b.password, u?.password_hash || dummy) && u, "Credenciales inválidas.", 401);
    const token = newToken();
    await pool.query("INSERT INTO platform_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [hashToken(token), u.id]);
    setCookie(reply, token);
    return { admin: view(u) };
  });
  app.post("/v1/platform/logout", { schema: loose }, async (req, reply) => {
    await pool.query("DELETE FROM platform_sessions WHERE token_hash=$1", [hashToken(req.cookies[COOKIE] || "")]);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });
  app.get("/v1/platform/session", { schema: loose }, async (req) => {
    const a = await getPlatformAdmin(req);
    return { admin: a ? view(a) : null };
  });
  app.get("/v1/platform/organizations", { schema: loose }, async (req) => {
    await requireAdmin(req);
    const rows = (await pool.query(
      `SELECT o.id,o.name,o.slug,o.active,o.created_at,
        (SELECT count(*)::int FROM tournaments t WHERE t.organization_id=o.id) tournaments,
        (SELECT count(*)::int FROM users u WHERE u.organization_id=o.id) users
       FROM organizations o ORDER BY o.created_at`,
    )).rows;
    return { organizations: rows };
  });
  app.post("/v1/platform/organizations", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, schema: loose }, async (req) => {
    const admin = await requireAdmin(req);
    const b = z.object({ name: short, slug, admin_name: short, admin_email: email }).parse(req.body);
    ensure(!reserved.includes(b.slug), "Ese slug está reservado.", 400);
    return transaction(async (db) => {
      ensure(!(await db.query("SELECT 1 FROM organizations WHERE slug=$1", [b.slug])).rows[0], "Ese slug ya está en uso.");
      const org = (await db.query("INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id,name,slug", [b.name, b.slug])).rows[0];
      const temporary_password = newToken().slice(0, 16);
      await db.query("INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')", [org.id, b.admin_name, b.admin_email, hashPassword(temporary_password)]);
      await audit(db, org.id, "platform:" + admin.id, "organization.create", org.id, null, { name: b.name, slug: b.slug, admin_email: b.admin_email });
      return { organization: org, admin: { email: b.admin_email, temporary_password } };
    });
  });
  app.post("/v1/platform/organizations/status", { schema: loose }, async (req) => {
    const admin = await requireAdmin(req);
    const b = z.object({ id: z.string().uuid(), active: z.boolean() }).parse(req.body);
    return transaction(async (db) => {
      const r = await db.query("UPDATE organizations SET active=$2 WHERE id=$1", [b.id, b.active]);
      ensure(r.rowCount, "Organización no encontrada.", 404);
      if (!b.active) await db.query("DELETE FROM sessions WHERE organization_id=$1", [b.id]);
      await audit(db, b.id, "platform:" + admin.id, "organization.status", b.id, null, { active: b.active });
      return { ok: true };
    });
  });
}
