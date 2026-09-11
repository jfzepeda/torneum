import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateScore,
  drawTeams,
  standings,
  scheduleConflicts,
  prospectScore,
} from "../src/padel.js";
import { permits, hashPassword, verifyPassword } from "../src/auth.js";
const rules = { sets: 3, games: 6, superTiebreak: true, goldenPoint: true };
test("pádel: resultado normal, tie-break y super tie-break válidos", () => {
  assert.equal(
    validateScore(
      {
        sets: [
          [6, 3],
          [7, 6],
        ],
      },
      rules,
    ),
    "home",
  );
  assert.equal(
    validateScore(
      {
        sets: [
          [6, 3],
          [4, 6],
          [10, 8],
        ],
      },
      rules,
    ),
    "home",
  );
  assert.equal(
    validateScore(
      {
        sets: [
          [4, 6],
          [6, 3],
          [12, 14],
        ],
      },
      rules,
    ),
    "away",
  );
});
test("pádel: rechaza sets incompletos, negativos y posteriores al ganador", () => {
  for (const sets of [
    [
      [6, 5],
      [6, 3],
    ],
    [[6, 3]],
    [
      [6, 3],
      [6, 4],
      [10, 8],
    ],
    [
      [6, -1],
      [6, 3],
    ],
    [
      [6, 3],
      [4, 6],
      [11, 8],
    ],
  ])
    assert.throws(() =>
      validateScore({ sets: sets as [number, number][] }, rules),
    );
});
test("walkover exige ganador explícito", () => {
  assert.throws(() => validateScore({ sets: [], reason: "walkover" }, rules));
  assert.equal(
    validateScore({ sets: [], reason: "walkover", winner: "away" }, rules),
    "away",
  );
});
test("sorteo determinista, equilibrado y sin duplicados", () => {
  const ids = Array.from({ length: 13 }, (_, i) => String(i));
  const groups = drawTeams(ids, 4, "seed");
  assert.deepEqual(groups, drawTeams([...ids].reverse(), 4, "seed"));
  assert.equal(groups.flat().length, new Set(groups.flat()).size);
  assert.ok(
    Math.max(...groups.map((g) => g.length)) -
      Math.min(...groups.map((g) => g.length)) <=
      1,
  );
  assert.throws(() => drawTeams(["a", "a", "b", "c"], 4, "seed"));
});
test("clasificación usa solo resultados finalizados y explica empates", () => {
  const matches = [
    {
      home_id: "a",
      away_id: "b",
      winner_id: "a",
      status: "finished",
      score: {
        sets: [
          [6, 2],
          [6, 3],
        ] as [number, number][],
      },
    },
    {
      home_id: "a",
      away_id: "c",
      winner_id: "c",
      status: "pending",
      score: {
        sets: [
          [0, 6],
          [0, 6],
        ] as [number, number][],
      },
    },
  ];
  const table = standings(["a", "b", "c"], matches);
  assert.equal(table[0].team_id, "a");
  assert.equal(table[0].points, 3);
  assert.equal(table[0].games_for, 12);
  assert.equal(table.find((r) => r.team_id === "c")!.played, 0);
});
test("empate circular mantiene orden determinista y exige sorteo manual", () => {
  const ms = [
    ["a", "b"],
    ["b", "c"],
    ["c", "a"],
  ].map(([home_id, away_id]) => ({
    home_id,
    away_id,
    winner_id: home_id,
    status: "finished",
    score: {
      sets: [
        [6, 3],
        [6, 3],
      ] as [number, number][],
    },
  }));
  const table = standings(["c", "a", "b"], ms);
  assert.deepEqual(
    table.map((r) => r.team_id),
    ["a", "b", "c"],
  );
  assert.ok(table.every((r) => r.tie));
});
test("conflictos de cancha y descanso; límites exactos permitidos", () => {
  const a = {
    id: "a",
    home_id: "h",
    away_id: "a",
    court_id: "1",
    starts_at: "2026-09-18T14:00:00Z",
    ends_at: "2026-09-18T15:00:00Z",
    rest_minutes: 30,
  };
  const b = {
    ...a,
    id: "b",
    home_id: "b",
    away_id: "c",
    starts_at: "2026-09-18T14:30:00Z",
    ends_at: "2026-09-18T15:30:00Z",
  };
  assert.ok(scheduleConflicts([a, b]).length);
  assert.ok(
    scheduleConflicts([
      a,
      { ...b, court_id: "2", home_id: "h", starts_at: "2026-09-18T15:15:00Z" },
    ]).length,
  );
  assert.deepEqual(
    scheduleConflicts([
      a,
      {
        ...b,
        court_id: "2",
        home_id: "h",
        starts_at: "2026-09-18T15:30:00Z",
        ends_at: "2026-09-18T16:30:00Z",
      },
    ]),
    [],
  );
});
test("roles: árbitro no modifica patrocinadores; capitán no administra", () => {
  assert.equal(permits("referee", "results"), true);
  assert.equal(permits("referee", "admin"), false);
  assert.equal(permits("participant", "categories"), false);
  assert.equal(permits("viewer", "schedule"), false);
  assert.equal(permits("admin", "admin"), true);
});
test("contraseñas: hashes con sal, comparación constante, sin texto plano", () => {
  const p = "A long local test password";
  const a = hashPassword(p),
    b = hashPassword(p);
  assert.notEqual(a, b);
  assert.equal(verifyPassword(p, a), true);
  assert.equal(verifyPassword("wrong", a), false);
  assert.ok(!a.includes(p));
});
test("prospectos: puntuación explicable sin inventar evidencia", () => {
  assert.equal(
    prospectScore({
      local: true,
      sport: true,
      previous: false,
      contact: false,
      recent: false,
    }).score,
    50,
  );
});
test('single-set categories do not accidentally become super tie-break matches',()=>{assert.equal(validateScore({sets:[[6,2]]},{...rules,sets:1}),'home');});
