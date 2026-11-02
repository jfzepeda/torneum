import { z } from "zod";
import type { FastifyRequest } from "fastify";
import type { Actor } from "./auth.js";
import { pool, ensure, type Db } from "./db.js";

export async function accessibleTournaments(db: Db, actor: Actor | string) {
  const org = typeof actor === "string" ? actor : actor.organization_id;
  return (await db.query(
    `SELECT t.* FROM tournaments t WHERE t.organization_id=$1
     AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM tournament_collaborators c WHERE c.tournament_id=t.id AND c.user_id=$2))
     ORDER BY t.created_at DESC,t.id`,
    [org, typeof actor === "string" || actor.role === "admin" ? null : actor.id],
  )).rows;
}

export async function requireTournament(db: Db, actor: Actor, id: string, writable = false) {
  z.string().uuid().parse(id);
  const t = (await db.query(
    `SELECT t.* FROM tournaments t WHERE t.id=$1 AND t.organization_id=$2
     AND ($3::boolean OR EXISTS(SELECT 1 FROM tournament_collaborators c WHERE c.tournament_id=t.id AND c.user_id=$4))`,
    [id, actor.organization_id, actor.role === "admin", actor.id],
  )).rows[0];
  ensure(t, "Torneo no encontrado o sin acceso.", 404);
  if (writable) ensure(t.status !== "archived", "El torneo está archivado.");
  return t;
}

export async function activeTournament(db: Db, actor: Actor) {
  const tournaments = actor.tournament_id ? [await requireTournament(db, actor, actor.tournament_id, true)]
    : (await accessibleTournaments(db, actor)).filter(t => t.status !== "archived");
  ensure(tournaments.length === 1, tournaments.length ? "Selecciona el torneo que quieres gestionar." : "No hay torneo activo.", 400);
  await db.query("SELECT id FROM tournaments WHERE id=$1 FOR UPDATE", [tournaments[0].id]);
  return tournaments[0];
}

// Resource ownership is checked even when an endpoint receives only a resource ID.
const resources = {
  tournaments: "SELECT id AS tournament_id FROM tournaments WHERE id=$1 AND organization_id=$2",
  categories: "SELECT tournament_id FROM categories WHERE id=$1 AND organization_id=$2",
  teams: "SELECT tournament_id FROM teams WHERE id=$1 AND organization_id=$2",
  matches: "SELECT tournament_id FROM matches WHERE id=$1 AND organization_id=$2",
  courts: "SELECT tournament_id FROM courts WHERE id=$1 AND organization_id=$2",
  groups: "SELECT c.tournament_id FROM groups g JOIN categories c ON c.id=g.category_id WHERE g.id=$1 AND g.organization_id=$2",
  requests: "SELECT t.tournament_id FROM change_requests r JOIN teams t ON t.id=r.team_id WHERE r.id=$1 AND r.organization_id=$2",
  sponsors: "SELECT tournament_id FROM sponsors WHERE id=$1 AND organization_id=$2",
  levels: "SELECT tournament_id FROM sponsor_levels WHERE id=$1 AND organization_id=$2",
  messages: "SELECT s.tournament_id FROM messages m JOIN sponsors s ON s.id=m.sponsor_id WHERE m.id=$1 AND m.organization_id=$2",
  integrations: "SELECT tournament_id FROM registration_integrations WHERE id=$1 AND organization_id=$2",
  inbox: "SELECT tournament_id FROM registration_inbox WHERE id=$1 AND organization_id=$2",
  registrations: "SELECT tournament_id FROM tournament_registrations WHERE id=$1 AND organization_id=$2",
} as const;
type Resource = keyof typeof resources;

export async function authorizeWorkspaceAction(db: Db, actor: Actor, path: string, body: Record<string, any>, params: Record<string, any> = {}, writable = true) {
  if (actor.role === "participant") return;
  // Global management actions identify their own tournament, independently of the sidebar.
  const global = /^\/v1\/(requests|sponsors|levels|messages|workspaces|archive|users)(\/|$)/.test(path);
  const refs: [Resource, unknown][] = [];
  const add = (type: Resource, value: unknown) => { if (value != null) refs.push([type, value]); };
  for (const data of [body, params]) {
    add("tournaments", data.tournament_id ?? data.tournamentId);
    add("categories", data.category_id);
    add("teams", data.team_id);
    add("groups", data.group_id);
    add("sponsors", data.sponsor_id);
    add("levels", data.level_id);
    add("integrations", data.integration_id);
  }
  const resource: Resource | undefined = path.startsWith("/v1/categories/") ? "categories"
    : path === "/v1/registrations/review" ? "teams"
    : path.startsWith("/v1/courts/") ? "courts"
    : path.startsWith("/v1/levels/") ? "levels"
    : path.startsWith("/v1/registrations/:") ? "registrations"
    : path === "/v1/results" || path.startsWith("/v1/matches/") ? "matches"
    : path === "/v1/requests/review" ? "requests"
    : path === "/v1/sponsors" ? "sponsors"
    : path.startsWith("/v1/messages/") ? "messages"
    : path.startsWith("/v1/integrations/") ? "integrations"
    : path === "/v1/registration-inbox/resolve" ? "inbox"
    : path.startsWith("/v1/tournaments/:") || path.startsWith("/v1/archive/") ? "tournaments" : undefined;
  if (resource) { add(resource, body.id); add(resource, params.id); }
  if (path.startsWith("/v1/messages/")) for (const id of body.ids || []) add("messages", id);
  if (path === "/v1/schedule") for (const change of body.changes || []) { add("matches", change.id); add("courts", change.court_id); }
  if (path === "/v1/registrations/review-bulk") for (const id of body.ids || []) add("teams", id);
  if (path === "/v1/requests/review-bulk") for (const id of body.ids || []) add("requests", id);
  if (path === "/v1/registration-inbox/bulk-discard") for (const id of body.ids || []) add("inbox", id);
  if (path === "/v1/registration-inbox/bulk-update") for (const item of body.items || []) { add("inbox", item.id); add("categories", item.category_id); }
  for (const [type, raw] of refs) {
    const id = z.string().uuid().parse(raw);
    const row = (await db.query(resources[type], [id, actor.organization_id])).rows[0];
    ensure(row, "Recurso no encontrado.", 404);
    const t = await requireTournament(db, actor, row.tournament_id, writable);
    if (!global && actor.tournament_id) ensure(t.id === actor.tournament_id, "El recurso pertenece a otro torneo.", 409);
  }
}

export async function authorizeWorkspaceRequest(req: FastifyRequest, actor: Actor) {
  const path = req.routeOptions.url || req.url.split("?")[0];
  if (actor.role === "participant" || ["/v1/session", "/v1/logout", "/v1/login", "/v1/verify", "/v1/magic-link"].includes(path)) return;
  const requested = req.headers["x-tournament-id"] || (req.query as any)?.tournament_id;
  if (requested) {
    actor.tournament_id = z.string().uuid().parse(requested);
    await requireTournament(pool, actor, actor.tournament_id);
  }
  await authorizeWorkspaceAction(pool, actor, path, (req.body || {}) as any, (req.params || {}) as any, req.method !== "GET");
}
