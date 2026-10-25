import type { Db } from "./db.js";
import { ensure } from "./db.js";
import { resolvedStandings } from "./padel.js";
import type { Actor } from "./auth.js";
export async function getState(db: Db, who: Actor | string, archiveId?:string) {
  const actor = typeof who === "string" ? undefined : who;
  const orgId = typeof who === "string" ? who : who.organization_id;
  const organization = (await db.query("SELECT id,name,slug,brand_color,brand_bg,brand_card,brand_platform FROM organizations WHERE id=$1", [orgId])).rows[0];
  const t = (
    await db.query(
      archiveId?"SELECT * FROM tournaments WHERE id=$1 AND organization_id=$2 AND status='archived'":"SELECT * FROM tournaments WHERE organization_id=$1 AND status<>'archived' ORDER BY created_at DESC LIMIT 1",
      archiveId?[archiveId,orgId]:[orgId],
    )
  ).rows[0];
  if (!t)
    return {
      organization,
      tournament: null,
      categories: [],
      teams: [],
      matches: [],
      courts: [],
      groups: [],
      standings: [],
      sponsors: [],
      levels: [],
      requests: [],
      messages: [],
      users: [],
      audit: [],
      archives: [],
      integrations: { chatkit: false, gmail: false, smtp: false },
    };
  if (actor)
    ensure(
      actor.organization_id === t.organization_id,
      "Organización no autorizada.",
      403,
    );
  const internal = actor && actor.role !== "participant";
  const commercial = actor?.role === "admin";
  const results = await Promise.all([
    db.query("SELECT * FROM categories WHERE tournament_id=$1 ORDER BY name", [
      t.id,
    ]),
    db.query(
      internal
        ? "SELECT * FROM teams WHERE tournament_id=$1 ORDER BY created_at DESC"
        : "SELECT id,name,category_id,(SELECT jsonb_agg(jsonb_build_object('name',p->>'name')) FROM jsonb_array_elements(players) p) players,description,status,image_id FROM teams WHERE tournament_id=$1 AND status='approved' ORDER BY name",
      [t.id],
    ),
    db.query(
      internal
        ? "SELECT * FROM matches WHERE tournament_id=$1 ORDER BY starts_at NULLS LAST,id"
        : "SELECT m.id,m.category_id,m.group_id,m.stage,m.round,m.position,m.home_id,m.away_id,m.court_id,m.starts_at,m.ends_at,CASE WHEN m.status IN ('pending','disputed') THEN 'pending' ELSE m.status END status,CASE WHEN m.status='finished' THEN m.score ELSE NULL END score,m.winner_id,m.finish_reason FROM matches m JOIN categories c ON c.id=m.category_id WHERE m.tournament_id=$1 AND c.draw_published=true ORDER BY m.starts_at NULLS LAST,m.id",
      [t.id],
    ),
    db.query("SELECT * FROM courts WHERE tournament_id=$1 ORDER BY name", [
      t.id,
    ]),
    db.query(
      "SELECT g.*,array_agg(gm.team_id) team_ids FROM groups g JOIN categories c ON c.id=g.category_id JOIN group_members gm ON gm.group_id=g.id WHERE c.tournament_id=$1 GROUP BY g.id ORDER BY g.name",
      [t.id],
    ),
    db.query(
      commercial
        ? "SELECT * FROM sponsors WHERE tournament_id=$1 ORDER BY affinity DESC,name"
        : "SELECT id,name,website,logo_url,level_id,status FROM sponsors WHERE tournament_id=$1 AND status='won'",
      [t.id],
    ),
    db.query(
      "SELECT * FROM sponsor_levels WHERE tournament_id=$1 ORDER BY priority",
      [t.id],
    ),
    internal
      ? db.query(
          "SELECT r.*,t.name team_name FROM change_requests r JOIN teams t ON t.id=r.team_id WHERE t.tournament_id=$1 ORDER BY created_at DESC",
          [t.id],
        )
      : Promise.resolve({ rows: [] }),
    commercial
      ? db.query(
          "SELECT m.*,s.name sponsor_name,s.email,s.phone FROM messages m JOIN sponsors s ON s.id=m.sponsor_id WHERE s.tournament_id=$1 ORDER BY m.created_at DESC",
          [t.id],
        )
      : Promise.resolve({ rows: [] }),
    commercial
      ? db.query(
          "SELECT id,name,email,role,active FROM users WHERE organization_id=$1 ORDER BY name",
          [t.organization_id],
        )
      : Promise.resolve({ rows: [] }),
    internal
      ? db.query(
          "SELECT * FROM audit_events WHERE organization_id=$1 ORDER BY id DESC LIMIT 50",
          [t.organization_id],
        )
      : Promise.resolve({ rows: [] }),
    internal
      ? db.query(
          "SELECT * FROM tournaments WHERE organization_id=$1 AND status='archived' ORDER BY created_at DESC",
          [t.organization_id],
        )
      : Promise.resolve({ rows: [] }),
    commercial
      ? db.query("SELECT 1 FROM oauth_connections WHERE organization_id=$1", [
          t.organization_id,
        ])
      : Promise.resolve({ rows: [] }),
  ]);
  const resolutions = (
    await db.query(
      "SELECT r.* FROM manual_tiebreaks r JOIN groups g ON g.id=r.group_id JOIN categories c ON c.id=g.category_id WHERE c.tournament_id=$1",
      [t.id],
    )
  ).rows;
  const [
    categories,
    teams,
    matches,
    courts,
    groups,
    sponsors,
    levels,
    requests,
    messages,
    users,
    audit,
    archives,
    oauth,
  ] = results;
  return {
    organization,
    tournament: t,
    categories: categories.rows,
    teams: teams.rows,
    matches: matches.rows,
    courts: courts.rows,
    groups: groups.rows,
    standings: groups.rows.map((g) => ({
      group_id: g.id,
      rows: resolvedStandings(
        g.team_ids,
        matches.rows.filter((m) => m.group_id === g.id),
        resolutions.find((r) => r.group_id === g.id),
      ),
    })),
    sponsors: sponsors.rows,
    levels: levels.rows,
    requests: requests.rows,
    messages: messages.rows,
    users: users.rows,
    audit: audit.rows,
    archives: archives.rows,
    integrations: {
      chatkit:
        !!process.env.OPENAI_API_KEY &&
        !!process.env.CHATKIT_PUBLIC_WORKFLOW_ID,
      gmail: !!oauth.rows.length,
      smtp: !!process.env.SMTP_URL,
    },
  };
}
