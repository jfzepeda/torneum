import { z } from "zod";
import type { Actor } from "./auth.js";
import type { RouteRegistrar } from "./agents.js";
import { ensure, audit, type Db } from "./db.js";
import { accessibleTournaments, requireTournament } from "./workspace-access.js";

export async function managementState(db: Db, actor: Actor) {
  const tournaments = await accessibleTournaments(db, actor);
  const ids = tournaments.map(t => t.id);
  const admin = actor.role === "admin";
  const [categories, sponsors, levels, users, requests, messages, oauth] = await Promise.all([
    admin ? db.query("SELECT * FROM categories WHERE tournament_id=ANY($1::uuid[]) ORDER BY name", [ids]) : { rows: [] },
    admin ? db.query("SELECT * FROM sponsors WHERE organization_id=$1 ORDER BY name", [actor.organization_id]) : { rows: [] },
    admin ? db.query("SELECT * FROM sponsor_levels WHERE organization_id=$1 ORDER BY priority,name", [actor.organization_id]) : { rows: [] },
    admin ? db.query(`SELECT u.id,u.name,u.email,u.role,u.active,COALESCE(array_agg(c.tournament_id) FILTER(WHERE c.tournament_id IS NOT NULL),'{}') tournament_ids
      FROM users u LEFT JOIN tournament_collaborators c ON c.user_id=u.id WHERE u.organization_id=$1 GROUP BY u.id ORDER BY u.name`, [actor.organization_id]) : { rows: [] },
    db.query("SELECT r.*,t.name team_name,t.tournament_id FROM change_requests r JOIN teams t ON t.id=r.team_id WHERE t.tournament_id=ANY($1::uuid[]) ORDER BY r.created_at DESC", [ids]),
    admin ? db.query("SELECT m.*,s.name sponsor_name,s.email,s.phone,s.tournament_id FROM messages m JOIN sponsors s ON s.id=m.sponsor_id WHERE m.organization_id=$1 ORDER BY m.created_at DESC", [actor.organization_id]) : { rows: [] },
    admin ? db.query("SELECT 1 FROM oauth_connections WHERE organization_id=$1", [actor.organization_id]) : { rows: [] },
  ]);
  return { tournaments, categories: categories.rows, sponsors: sponsors.rows, levels: levels.rows, users: users.rows,
    requests: requests.rows, messages: messages.rows, archives: tournaments.filter(t => t.status === "archived"),
    integrations: { chatkit: !!process.env.OPENAI_API_KEY && !!process.env.CHATKIT_PUBLIC_WORKFLOW_ID, gmail: !!oauth.rows.length, smtp: !!process.env.SMTP_URL } };
}

export function registerWorkspaces(post: RouteRegistrar) {
  const id = z.string().uuid();
  post("/v1/tournaments/new", z.object({
    name: z.string().trim().min(1).max(150), venue: z.string().trim().min(1).max(150),
    city: z.string().trim().max(150).default(""), starts_on: z.iso.date().nullable().default(null), ends_on: z.iso.date().nullable().default(null), dates_label: z.string().trim().max(80).default(""),
  }), "admin", async (b, a, db) => {
    ensure(!!b.starts_on === !!b.ends_on && (!b.starts_on || b.ends_on! >= b.starts_on), "Fechas inválidas.", 400);
    const t = (await db.query("INSERT INTO tournaments(organization_id,name,venue,city,starts_on,ends_on,dates_label) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [a!.organization_id,b.name,b.venue,b.city,b.starts_on,b.ends_on,b.dates_label])).rows[0];
    await audit(db, a!.organization_id, a!.id, "tournament.create", t.id, null, b);
    return { id: t.id };
  });
  post("/v1/workspaces/archive", z.object({ tournament_id: id }), "admin", async (b,a,db) => {
    await requireTournament(db,a!,b.tournament_id,true);
    await db.query("SELECT id FROM tournaments WHERE id=$1 FOR UPDATE", [b.tournament_id]);
    ensure(!(await db.query("SELECT 1 FROM matches WHERE tournament_id=$1 AND status<>'finished' LIMIT 1", [b.tournament_id])).rowCount, "Hay partidos sin finalizar.");
    await db.query("UPDATE tournaments SET status='archived',registration_open=false WHERE id=$1", [b.tournament_id]);
    await audit(db,a!.organization_id,a!.id,"tournament.archive",b.tournament_id,null,null);
    return { ok: true };
  });
  post("/v1/workspaces/collaborators", z.object({ user_id: id, tournament_ids: z.array(id).max(500) }), "admin", async (b,a,db) => {
    const user = (await db.query("SELECT * FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE", [b.user_id,a!.organization_id])).rows[0];
    ensure(user && user.role !== "admin", "Selecciona un colaborador. Los administradores acceden a todos los torneos.",400);
    for (const t of b.tournament_ids) await requireTournament(db,a!,t);
    await db.query("DELETE FROM tournament_collaborators WHERE user_id=$1", [user.id]);
    await db.query("INSERT INTO tournament_collaborators(organization_id,tournament_id,user_id) SELECT $1,unnest($2::uuid[]),$3 ON CONFLICT DO NOTHING", [a!.organization_id,b.tournament_ids,user.id]);
    await audit(db,a!.organization_id,a!.id,"user.tournaments",user.id,null,b);
    return { ok: true };
  });
  post("/v1/workspaces/reuse", z.object({
    source_id: id, target_id: id, categories: z.array(id).max(200).default([]), levels: z.array(id).max(200).default([]),
    sponsors: z.array(id).max(200).default([]), users: z.array(id).max(200).default([]), skip_conflicts: z.boolean().default(false),
  }), "admin", async (b,a,db) => {
    ensure(b.source_id !== b.target_id, "Selecciona dos torneos distintos.",400);
    await requireTournament(db,a!,b.source_id);
    await requireTournament(db,a!,b.target_id,true);
    // Consistent lock order serializes simultaneous imports and copies in both directions.
    await db.query("SELECT id FROM tournaments WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[b.source_id,b.target_id]]);
    const selected = async (table: "categories" | "sponsor_levels" | "sponsors", ids: string[]) => {
      const rows = (await db.query(`SELECT * FROM ${table} WHERE tournament_id=$1 AND id=ANY($2::uuid[])`, [b.source_id,ids])).rows;
      ensure(rows.length === new Set(ids).size,"La selección contiene recursos de otro torneo.",400);
      return rows;
    };
    const categories = await selected("categories",b.categories);
    const sponsors = await selected("sponsors",b.sponsors);
    const levels = await selected("sponsor_levels",[...new Set([...b.levels,...sponsors.map(s => s.level_id).filter(Boolean)])]);
    const users = (await db.query("SELECT u.id FROM users u JOIN tournament_collaborators c ON c.user_id=u.id WHERE c.tournament_id=$1 AND u.id=ANY($2::uuid[]) AND u.active", [b.source_id,b.users])).rows;
    ensure(users.length === new Set(b.users).size,"Selecciona colaboradores activos del torneo de origen.",400);
    const copied = { categories: 0, levels: 0, sponsors: 0, users: 0 };
    const skipped: string[] = [];
    const levelMap = new Map<string,string>();
    for (const l of levels) {
      const existing = (await db.query("SELECT id FROM sponsor_levels WHERE tournament_id=$1 AND copied_from_id=$2", [b.target_id,l.id])).rows[0];
      if (existing) { levelMap.set(l.id,existing.id); continue; }
      const copy = (await db.query(`INSERT INTO sponsor_levels(organization_id,tournament_id,name,amount,benefits,zones,priority,logo_size,copied_from_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [a!.organization_id,b.target_id,l.name,l.amount,l.benefits,l.zones,l.priority,l.logo_size,l.id])).rows[0];
      levelMap.set(l.id,copy.id); copied.levels++;
    }
    for (const c of categories) {
      const exists = (await db.query("SELECT id,copied_from_id FROM categories WHERE tournament_id=$1 AND (name=$2 OR copied_from_id=$3)", [b.target_id,c.name,c.id])).rows[0];
      if (exists) {
        ensure(exists.copied_from_id === c.id || b.skip_conflicts, `Ya existe la categoría «${c.name}». Activa omitir conflictos o cambia su nombre.`,409);
        skipped.push(c.name); continue;
      }
      await db.query(`INSERT INTO categories(organization_id,tournament_id,name,capacity,group_size,qualifiers,duration_minutes,rest_minutes,rules,price_cents,payment_mode,participant_count,payment_policy,copied_from_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [a!.organization_id,b.target_id,c.name,c.capacity,c.group_size,c.qualifiers,c.duration_minutes,c.rest_minutes,JSON.stringify(c.rules),c.price_cents,c.payment_mode,c.participant_count,c.payment_policy,c.id]);
      copied.categories++;
    }
    for (const s of sponsors) {
      const copy = await db.query(`INSERT INTO sponsors(organization_id,tournament_id,contact_id,name,website,email,phone,logo_url,level_id,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tournament_id,contact_id) DO NOTHING`,
        [a!.organization_id,b.target_id,s.contact_id,s.name,s.website,s.email,s.phone,s.logo_url,s.level_id ? levelMap.get(s.level_id) : null,s.status === "excluded" ? "excluded" : "prospect"]);
      copied.sponsors += copy.rowCount || 0;
    }
    for (const u of users) {
      const copy = await db.query("INSERT INTO tournament_collaborators(organization_id,tournament_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [a!.organization_id,b.target_id,u.id]);
      copied.users += copy.rowCount || 0;
    }
    await audit(db,a!.organization_id,a!.id,"tournament.reuse",b.target_id,null,{ ...b,copied,skipped });
    return { copied, skipped };
  });
}
