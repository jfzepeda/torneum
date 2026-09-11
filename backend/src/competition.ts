import type { Db } from "./db.js";
import { audit, ensure } from "./db.js";
import type { Actor } from "./auth.js";
import {
  drawTeams,
  resolvedStandings,
  validateScore,
  scheduleConflicts,
  type Score,
  type Slot,
} from "./padel.js";
export async function draw(
  db: Db,
  actor: Actor,
  categoryId: string,
  seed: string,
  publish: boolean,
) {
  const c = (
    await db.query(
      "SELECT * FROM categories WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [categoryId, actor.organization_id],
    )
  ).rows[0];
  ensure(c, "Categoría no encontrada.", 404);
  ensure(!c.draw_published, "El sorteo publicado está bloqueado.");
  const teams = (
    await db.query(
      "SELECT id FROM teams WHERE category_id=$1 AND status='approved' ORDER BY id",
      [c.id],
    )
  ).rows.map((t) => t.id);
  const groups = drawTeams(teams, c.group_size, seed);
  if (!publish) return { groups, seed };
  await db.query(
    "UPDATE categories SET draw_seed=$2,draw_published=true WHERE id=$1",
    [c.id, seed],
  );
  for (const [index, ids] of groups.entries()) {
    const g = (
      await db.query(
        "INSERT INTO groups(organization_id,category_id,name) VALUES($1,$2,$3) RETURNING id",
        [actor.organization_id, c.id, String.fromCharCode(65 + index)],
      )
    ).rows[0];
    for (const id of ids)
      await db.query("INSERT INTO group_members VALUES($1,$2,$3)", [
        actor.organization_id,
        g.id,
        id,
      ]);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        await db.query(
          "INSERT INTO matches(organization_id,tournament_id,category_id,group_id,home_id,away_id) VALUES($1,$2,$3,$4,$5,$6)",
          [actor.organization_id, c.tournament_id, c.id, g.id, ids[i], ids[j]],
        );
  }
  await audit(db, actor.organization_id, actor.id, "draw.publish", c.id, null, {
    seed,
    groups,
  });
  return { groups, seed };
}
export async function bracket(db: Db, actor: Actor, categoryId: string) {
  const c = (
    await db.query(
      "SELECT * FROM categories WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [categoryId, actor.organization_id],
    )
  ).rows[0];
  ensure(c, "Categoría no encontrada.", 404);
  ensure(c.draw_published, "Publica el sorteo antes de clasificar.");
  const existing = await db.query(
    "SELECT id FROM matches WHERE category_id=$1 AND stage='knockout'",
    [c.id],
  );
  ensure(!existing.rowCount, "El cuadro ya existe.");
  const groups = (
    await db.query("SELECT * FROM groups WHERE category_id=$1 ORDER BY name", [
      c.id,
    ])
  ).rows;
  const qualified: string[][] = [];
  for (const g of groups) {
    const ids = (
      await db.query("SELECT team_id FROM group_members WHERE group_id=$1", [
        g.id,
      ])
    ).rows.map((r) => r.team_id);
    const matches = (
      await db.query("SELECT * FROM matches WHERE group_id=$1", [g.id])
    ).rows;
    ensure(
      matches.every((m) => m.status === "finished"),
      "Finaliza todos los partidos de grupos.",
    );
    const resolution = (
      await db.query("SELECT * FROM manual_tiebreaks WHERE group_id=$1", [g.id])
    ).rows[0];
    const table = resolvedStandings(ids, matches, resolution);
    ensure(
      !table.some((r) => r.tie),
      "Hay un empate pendiente de resolución manual.",
    );
    qualified.push(table.slice(0, c.qualifiers).map((r) => r.team_id));
  }
  // Cross groups: A1 vs B2, B1 vs A2. Higher qualifiers alternate opposite group order.
  const entrants: string[] = [];
  for (let rank = 0; rank < c.qualifiers; rank++) {
    const order = qualified;
    for (const group of order) if (group[rank]) entrants.push(group[rank]);
  }
  ensure(entrants.length >= 2, "Faltan clasificados.");
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  const seeded: (string | null)[] = [
    ...entrants,
    ...Array(size - entrants.length).fill(null),
  ];
  let round = 1;
  for (let count = size / 2; count >= 1; count /= 2, round++) {
    for (let p = 0; p < count; p++) {
      const home = round === 1 ? seeded[p] : null;
      const away = round === 1 ? seeded[size - 1 - p] : null;
      await db.query(
        "INSERT INTO matches(organization_id,tournament_id,category_id,stage,round,position,home_id,away_id,status,winner_id,finish_reason) VALUES($1,$2,$3,'knockout',$4,$5,$6,$7,$8,$9,$10)",
        [
          actor.organization_id,
          c.tournament_id,
          c.id,
          round,
          p,
          home,
          away,
          round === 1 && home && !away ? "finished" : "unscheduled",
          round === 1 && home && !away ? home : null,
          round === 1 && home && !away ? "bye" : null,
        ],
      );
    }
  }
  const byes = (
    await db.query(
      "SELECT * FROM matches WHERE category_id=$1 AND stage='knockout' AND finish_reason='bye'",
      [c.id],
    )
  ).rows;
  for (const m of byes) await advance(db, m);
  await audit(
    db,
    actor.organization_id,
    actor.id,
    "bracket.create",
    c.id,
    null,
    { entrants },
  );
  return { ok: true };
}
async function advance(db: Db, m: any) {
  if (m.stage !== "knockout") return;
  const side = m.position % 2 === 0 ? "home_id" : "away_id";
  await db.query(
    `UPDATE matches SET ${side}=$1 WHERE category_id=$2 AND stage='knockout' AND round=$3 AND position=$4`,
    [m.winner_id, m.category_id, m.round + 1, Math.floor(m.position / 2)],
  );
}
export async function reportResult(
  db: Db,
  actor: Actor,
  id: string,
  score: Score,
  resolve: boolean,
) {
  const m = (
    await db.query(
      "SELECT m.*,c.rules FROM matches m JOIN categories c ON c.id=m.category_id WHERE m.id=$1 AND m.organization_id=$2 FOR UPDATE OF m",
      [id, actor.organization_id],
    )
  ).rows[0];
  ensure(m, "Partido no encontrado.", 404);
  ensure(m.home_id && m.away_id, "El partido aún no tiene ambas parejas.");
  const side = validateScore(score, m.rules);
  const winner = side === "home" ? m.home_id : m.away_id;
  if (actor.role === "participant") {
    ensure(
      [m.home_id, m.away_id].includes(actor.team_id),
      "No participas en este partido.",
      403,
    );
    ensure(
      !["finished", "disputed"].includes(m.status),
      "El resultado requiere resolución del organizador.",
    );
    const prior = (
      await db.query(
        "SELECT * FROM result_reports WHERE match_id=$1 AND team_id<>$2 ORDER BY created_at DESC LIMIT 1",
        [m.id, actor.team_id],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO result_reports(organization_id,match_id,team_id,score) VALUES($1,$2,$3,$4)",
      [actor.organization_id, m.id, actor.team_id, JSON.stringify(score)],
    );
    const same =
      prior &&
      JSON.stringify(prior.score.sets) === JSON.stringify(score.sets) &&
      (prior.score.reason || "normal") === (score.reason || "normal") &&
      prior.score.winner === score.winner;
    const status = prior ? (same ? "finished" : "disputed") : "pending";
    await db.query(
      "UPDATE matches SET status=$2,score=$3,winner_id=$4,finish_reason=$5 WHERE id=$1",
      [
        m.id,
        status,
        JSON.stringify(score),
        status === "finished" ? winner : null,
        score.reason || "normal",
      ],
    );
    if (status === "finished") await advance(db, { ...m, winner_id: winner });
  } else {
    ensure(resolve, "Confirma explícitamente el resultado.", 400);
    if (m.status === "finished" && m.stage === "knockout") {
      const next = (
        await db.query(
          "SELECT * FROM matches WHERE category_id=$1 AND stage='knockout' AND round=$2 AND position=$3",
          [m.category_id, m.round + 1, Math.floor(m.position / 2)],
        )
      ).rows[0];
      ensure(
        !next || next.status === "unscheduled",
        "Deshaz primero la fase posterior antes de corregir.",
      );
    }
    await db.query(
      "UPDATE matches SET status='finished',score=$2,winner_id=$3,finish_reason=$4,real_ended_at=now() WHERE id=$1",
      [m.id, JSON.stringify(score), winner, score.reason || "normal"],
    );
    await db.query(
      "INSERT INTO result_reports(organization_id,match_id,user_id,score) VALUES($1,$2,$3,$4)",
      [actor.organization_id, m.id, actor.id, JSON.stringify(score)],
    );
    await advance(db, { ...m, winner_id: winner });
  }
  await audit(
    db,
    actor.organization_id,
    actor.id,
    "result.report",
    m.id,
    { score: m.score, status: m.status },
    score,
  );
  return { ok: true };
}
export async function changeSchedule(
  db: Db,
  actor: Actor,
  tournamentId: string,
  changes: { id: string; court_id: string | null; starts_at: string | null }[],
  preview = false,
) {
  const tournament = (
    await db.query(
      "SELECT * FROM tournaments WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [tournamentId, actor.organization_id],
    )
  ).rows[0];
  ensure(tournament, "Torneo no encontrado.", 404);
  const before = (
    await db.query(
      "SELECT m.*,c.rest_minutes,c.duration_minutes FROM matches m JOIN categories c ON c.id=m.category_id WHERE m.tournament_id=$1 ORDER BY m.id",
      [tournamentId],
    )
  ).rows;
  const courts = (
    await db.query(
      "SELECT * FROM courts WHERE tournament_id=$1 AND enabled=true",
      [tournamentId],
    )
  ).rows;
  ensure(
    new Set(changes.map((c) => c.id)).size === changes.length,
    "Partido duplicado.",
    400,
  );
  const after = before.map((m) => ({ ...m }));
  for (const change of changes) {
    const m = after.find((m) => m.id === change.id);
    ensure(m, "Partido no encontrado.", 404);
    ensure(
      ["unscheduled", "scheduled"].includes(m.status),
      "Solo se pueden mover partidos sin iniciar.",
    );
    ensure(m.home_id && m.away_id, "Faltan parejas en este partido.");
    if (change.starts_at) {
      const court = courts.find((c) => c.id === change.court_id);
      ensure(court, "Cancha no disponible.");
      const start = new Date(change.starts_at);
      const end = new Date(+start + m.duration_minutes * 60000);
      ensure(Number.isFinite(+start), "Fecha inválida.", 400);
      const parts = (d: Date) => {
        const f = new Intl.DateTimeFormat("sv-SE", {
          timeZone: tournament.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d);
        return { date: f.slice(0, 10), time: f.slice(11, 16) };
      };
      const s = parts(start),
        e = parts(end);
      const dateStr = (v: Date | string) =>
        typeof v === "string" ? v.slice(0, 10) : v.toLocaleDateString("sv-SE");
      ensure(
        s.date >= dateStr(tournament.starts_on) &&
          s.date <= dateStr(tournament.ends_on) &&
          s.date === e.date,
        "Fecha fuera del torneo.",
      );
      ensure(
        s.time >= court.opens_at && e.time <= court.closes_at,
        "Fuera del horario de la cancha.",
      );
      Object.assign(m, {
        court_id: change.court_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: "scheduled",
      });
    } else
      Object.assign(m, {
        court_id: null,
        starts_at: null,
        ends_at: null,
        status: "unscheduled",
      });
  }
  const conflicts = scheduleConflicts(after as Slot[]);
  ensure(!conflicts.length, conflicts.join(". "));
  if (preview)
    return { changes: after.filter((m) => changes.some((c) => c.id === m.id)) };
  for (const m of after.filter((m) => changes.some((c) => c.id === m.id)))
    await db.query(
      "UPDATE matches SET court_id=$2,starts_at=$3,ends_at=$4,status=$5 WHERE id=$1",
      [m.id, m.court_id, m.starts_at, m.ends_at, m.status],
    );
  const compact = (rows: any[]) =>
    rows.map(({ id, court_id, starts_at, ends_at, status }) => ({
      id,
      court_id,
      starts_at,
      ends_at,
      status,
    }));
  await db.query(
    "INSERT INTO schedule_history(organization_id,tournament_id,actor,before_value,after_value) VALUES($1,$2,$3,$4,$5)",
    [
      actor.organization_id,
      tournamentId,
      actor.id,
      JSON.stringify(compact(before)),
      JSON.stringify(compact(after)),
    ],
  );
  await audit(
    db,
    actor.organization_id,
    actor.id,
    "schedule.change",
    tournamentId,
    compact(before),
    compact(after),
  );
  return { ok: true };
}
export async function autoSchedule(
  db: Db,
  actor: Actor,
  tournamentId: string,
  publish: boolean,
) {
  const t = (
    await db.query(
      "SELECT * FROM tournaments WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [tournamentId, actor.organization_id],
    )
  ).rows[0];
  ensure(t, "Torneo no encontrado.", 404);
  const courts = (
    await db.query(
      "SELECT * FROM courts WHERE tournament_id=$1 AND enabled=true ORDER BY name",
      [t.id],
    )
  ).rows;
  ensure(courts.length, "Crea al menos una cancha.");
  const rows = (
    await db.query(
      "SELECT m.*,c.duration_minutes,c.rest_minutes FROM matches m JOIN categories c ON c.id=m.category_id WHERE m.tournament_id=$1 ORDER BY m.stage,m.round,m.id",
      [t.id],
    )
  ).rows;
  const slots = rows.filter((m) => m.starts_at);
  const changes: any[] = [];
  const date =
    t.starts_on instanceof Date
      ? t.starts_on.toLocaleDateString("sv-SE")
      : String(t.starts_on).slice(0, 10);
  const last =
    t.ends_on instanceof Date
      ? t.ends_on.toLocaleDateString("sv-SE")
      : String(t.ends_on).slice(0, 10);
  // Scan UTC candidates, then apply tournament-local date and court-hour validation.
  const from = Date.parse(date + "T00:00:00Z"),
    until = Date.parse(last + "T23:59:00Z") + 86400000;
  ensure(until-from<=93*86400000,"El generador admite torneos de hasta 90 días.");
  const formatter = new Intl.DateTimeFormat("sv-SE",{timeZone:t.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
  const cache=new Map<string,{date:string;time:string}>();
  const localTime=(iso:string)=>{let v=cache.get(iso);if(!v){const text=formatter.format(new Date(iso));v={date:text.slice(0,10),time:text.slice(11,16)};cache.set(iso,v);}return v;};
  for (const m of rows.filter(
    (m) => m.status === "unscheduled" && m.home_id && m.away_id,
  )) {
    let placed = false;
    for (let time = from; time <= until && !placed; time += 15 * 60000) {
      for (const c of courts) {
        const candidate = {
          ...m,
          court_id: c.id,
          starts_at: new Date(time).toISOString(),
          ends_at: new Date(time + m.duration_minutes * 60000).toISOString(),
        };
        if (scheduleConflicts([...slots, candidate]).length) continue;
        const start = localTime(candidate.starts_at);
        const end = localTime(candidate.ends_at);
        if (start.date < date || start.date > last || start.date !== end.date || start.time < c.opens_at || end.time > c.closes_at) continue;
        changes.push({id:m.id,court_id:c.id,starts_at:candidate.starts_at});
        slots.push(candidate);
        placed=true;
        break;
      }
    }
    ensure(placed, "No hay espacio suficiente: amplía fechas o canchas.");
  }
  if (publish && changes.length)
    return changeSchedule(db, actor, t.id, changes);
  return { changes };
}
