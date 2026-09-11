import { createHash } from "node:crypto";
import { ensure } from "./db.js";
export type Rules = {
  sets: number;
  games: number;
  superTiebreak: boolean;
  goldenPoint: boolean;
};
export type Score = {
  sets: [number, number][];
  reason?: "normal" | "walkover" | "retirement";
  winner?: "home" | "away";
};
export function validateScore(score: Score, rules: Rules): "home" | "away" {
  if (score.reason === "walkover" || score.reason === "retirement") {
    ensure(
      score.winner === "home" || score.winner === "away",
      "Indica el ganador de la finalización especial.",
      400,
    );
    return score.winner;
  }
  const needed = Math.ceil(rules.sets / 2);
  let home = 0,
    away = 0;
  ensure(
    score.sets.length > 0 && score.sets.length <= rules.sets,
    "Cantidad de sets inválida.",
    400,
  );
  for (const [i, [a, b]] of score.sets.entries()) {
    ensure(
      home < needed && away < needed,
      "Hay sets después de decidirse el partido.",
      400,
    );
    ensure(
      Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a !== b,
      "Marcador inválido.",
      400,
    );
    const high = Math.max(a, b),
      low = Math.min(a, b);
    const superSet =
      rules.sets > 1 && rules.superTiebreak && i === rules.sets - 1 && home === away;
    ensure(
      superSet
        ? (high >= 10 && high - low === 2) || (high === 10 && low <= 8)
        : (high === rules.games && low <= rules.games - 2) ||
            (high === rules.games + 1 &&
              (low === rules.games - 1 || low === rules.games)),
      superSet
        ? "Super tie-break inválido."
        : "El set no tiene un marcador final válido.",
      400,
    );
    if (a > b) home++;
    else away++;
  }
  ensure(
    home === needed || away === needed,
    "El partido aún no tiene ganador.",
    400,
  );
  return home > away ? "home" : "away";
}
export function drawTeams(ids: string[], groupSize: number, seed: string) {
  ensure(ids.length >= 4, "Se requieren al menos 4 parejas aprobadas.");
  ensure(new Set(ids).size === ids.length, "Existen parejas duplicadas.");
  let counter = 0;
  const random = () =>
    createHash("sha256")
      .update(seed + ":" + counter++)
      .digest()
      .readUInt32BE(0) / 4294967296;
  const shuffled = [...ids].sort();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const count = Math.ceil(ids.length / groupSize);
  const groups = Array.from({ length: count }, () => [] as string[]);
  shuffled.forEach((id, i) => groups[i % count].push(id));
  ensure(
    groups.every((g) => g.length >= 2),
    "No se pueden formar grupos válidos.",
  );
  return groups;
}
export type Standing = {
  team_id: string;
  played: number;
  won: number;
  lost: number;
  sets_for: number;
  sets_against: number;
  games_for: number;
  games_against: number;
  points: number;
  criterion: string;
  tie: boolean;
};
export function standings(
  ids: string[],
  matches: {
    home_id: string;
    away_id: string;
    winner_id: string | null;
    score: Score | null;
    status: string;
  }[],
): Standing[] {
  const rows = new Map(
    ids.map((id) => [
      id,
      {
        team_id: id,
        played: 0,
        won: 0,
        lost: 0,
        sets_for: 0,
        sets_against: 0,
        games_for: 0,
        games_against: 0,
        points: 0,
        criterion: "Puntos",
        tie: false,
      },
    ]),
  );
  const finished = matches.filter(
    (m) => m.status === "finished" && m.winner_id,
  );
  for (const m of finished) {
    const h = rows.get(m.home_id),
      a = rows.get(m.away_id);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    const winner = m.winner_id === m.home_id ? h : a,
      loser = winner === h ? a : h;
    winner.won++;
    winner.points += 3;
    loser.lost++;
    for (const [x, y] of m.score?.sets || []) {
      h.games_for += x;
      h.games_against += y;
      a.games_for += y;
      a.games_against += x;
      if (x > y) {
        h.sets_for++;
        a.sets_against++;
      } else if (y > x) {
        a.sets_for++;
        h.sets_against++;
      }
    }
  }
  const result = [...rows.values()];
  const cohorts = new Map<number, Standing[]>();
  for (const r of result) {
    const group = cohorts.get(r.points) || [];
    group.push(r);
    cohorts.set(r.points, group);
  }
  const direct = new Map<string, number>();
  for (const group of cohorts.values()) {
    if (group.length === 2) {
      const [a, b] = group;
      const match = finished.find(
        (m) =>
          [m.home_id, m.away_id].includes(a.team_id) &&
          [m.home_id, m.away_id].includes(b.team_id),
      );
      if (match) {
        direct.set(match.winner_id!, 1);
        direct.set(match.winner_id === a.team_id ? b.team_id : a.team_id, 0);
      }
    }
  }
  const compare = (a: Standing, b: Standing) =>
    b.points - a.points ||
    (direct.get(b.team_id) || 0) - (direct.get(a.team_id) || 0) ||
    b.sets_for - b.sets_against - (a.sets_for - a.sets_against) ||
    b.games_for - b.games_against - (a.games_for - a.games_against);
  result.sort((a, b) => compare(a, b) || a.team_id.localeCompare(b.team_id));
  for (const group of cohorts.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      r.criterion = direct.has(r.team_id)
        ? "Enfrentamiento directo"
        : "Diferencia de sets / juegos";
      r.tie = group.some((o) => o !== r && compare(o, r) === 0);
      if (r.tie) r.criterion = "Pendiente: sorteo manual auditado";
    }
  }
  return result;
}
export type Slot = {
  id: string;
  home_id: string | null;
  away_id: string | null;
  court_id: string | null;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
  rest_minutes: number;
};
export function scheduleConflicts(slots: Slot[]) {
  const errors: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    if (!a.starts_at || !a.ends_at) continue;
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j];
      if (!b.starts_at || !b.ends_at) continue;
      const as = +new Date(a.starts_at),
        ae = +new Date(a.ends_at),
        bs = +new Date(b.starts_at),
        be = +new Date(b.ends_at);
      if (a.court_id === b.court_id && as < be && bs < ae)
        errors.push("Solapamiento de cancha");
      const shared = [a.home_id, a.away_id]
        .filter(Boolean)
        .some((id) => id === b.home_id || id === b.away_id);
      const rest = Math.max(a.rest_minutes, b.rest_minutes) * 60000;
      if (shared && as < be + rest && bs < ae + rest)
        errors.push("Una pareja se cruza o no tiene descanso suficiente");
    }
  }
  return [...new Set(errors)];
}
export function prospectScore(factors: {
  local: boolean;
  sport: boolean;
  previous: boolean;
  contact: boolean;
  recent: boolean;
}) {
  const weights = {
    local: 25,
    sport: 25,
    previous: 30,
    contact: 10,
    recent: 10,
  };
  return {
    score: Object.entries(factors).reduce(
      (sum, [key, value]) =>
        sum + (value ? weights[key as keyof typeof weights] : 0),
      0,
    ),
    factors,
  };
}
export function resultsHash(matches: unknown[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...matches]
          .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
          .map((m: any) => ({
            id: m.id,
            score: m.score,
            status: m.status,
            winner_id: m.winner_id,
          })),
      ),
    )
    .digest("hex");
}
export function resolvedStandings(
  ids: string[],
  matches: any[],
  resolution?: { team_order: string[]; results_hash: string },
) {
  const rows = standings(ids, matches);
  if (!resolution || resolution.results_hash !== resultsHash(matches))
    return rows;
  const original = new Map(rows.map((r, i) => [r.team_id, i]));
  return rows
    .sort((a, b) =>
      a.tie &&
      b.tie &&
      a.points === b.points &&
      a.sets_for - a.sets_against === b.sets_for - b.sets_against &&
      a.games_for - a.games_against === b.games_for - b.games_against
        ? resolution.team_order.indexOf(a.team_id) -
          resolution.team_order.indexOf(b.team_id)
        : original.get(a.team_id)! - original.get(b.team_id)!,
    )
    .map((r) =>
      r.tie ? { ...r, tie: false, criterion: "Sorteo manual auditado" } : r,
    );
}
