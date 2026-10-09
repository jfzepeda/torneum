import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  publicSheetUrl,
  parseCsv,
  downloadCsv,
} from "../src/google/public-sheets.js";
import {
  registrationSchema,
  validateRegistration,
  matchRegistration,
  fingerprint,
  mappingSchema,
  mapResponse,
  registrationTargets,
} from "../src/registration-fields.js";
import { googleCapabilities, questionItem } from "../src/google/oauth.js";
const schema = registrationSchema.parse({
  fields: [
    {
      id: "shirt",
      label: "Talla",
      scope: "participant",
      type: "select",
      options: ["S", "M", "L"],
      required: true,
    },
    { id: "kit", label: "Kit", scope: "team", type: "boolean" },
  ],
});
const body = {
  category_id: randomUUID(),
  name: "Los Pádel",
  captain: 0,
  email: "TEAM@example.com",
  players: [
    { name: "José Álvarez", answers: { shirt: "M" } },
    { name: "Ana López", answers: { shirt: "S" } },
  ],
  extra_answers: { kit: false },
};
test("Google URL allowlist rejects arbitrary hosts, credentials, ports and routes", () => {
  for (const url of [
    "http://docs.google.com/spreadsheets/d/abc/edit",
    "https://docs.google.com.evil.test/spreadsheets/d/abc/edit",
    "https://u:p@docs.google.com/spreadsheets/d/abc/edit",
    "https://docs.google.com:444/spreadsheets/d/abc/edit",
    "https://docs.google.com/document/d/abc/edit",
    "file:///etc/passwd",
  ])
    assert.throws(() => publicSheetUrl(url));
  assert.equal(
    publicSheetUrl("https://docs.google.com/spreadsheets/d/abc/edit#gid=42")
      .key,
    "abc:42",
  );
  assert.match(
    publicSheetUrl(
      "https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv",
    ).url,
    /\/e\/abc\/pub/,
  );
});
test("CSV supports quoted commas, newlines, BOM, incomplete and duplicate headers", () => {
  const data = parseCsv(
    '\uFEFFNombre,Nota,Correo,Correo\r\n"José, Ana","dos\nlíneas",a@b.com\r\n',
  );
  assert.equal(data.rows.length, 1);
  assert.equal(Object.values(data.rows[0].fields)[0], "José, Ana");
  assert.equal(Object.values(data.rows[0].fields)[1], "dos\nlíneas");
  assert.equal(new Set(data.columns.map((c) => c.id)).size, 4);
  assert.equal(parseCsv("").rows.length, 0);
  assert.throws(() => parseCsv("A,B\nx,y,z"));
  assert.throws(() => parseCsv('A,B\n"bad'));
});
test("CSV identities survive row and unique header reorder; schema drift needs review", () => {
  const a = parseCsv("Nombre,Correo\nAna,a@b.com\nEva,e@b.com");
  const b = parseCsv("Correo,Nombre\ne@b.com,Eva\na@b.com,Ana", 1, a.columns);
  assert.equal(a.rows[0].externalId, b.rows[1].externalId);
  assert.throws(() => parseCsv("Nombre,Email\nAna,a@b.com", 1, a.columns));
});
test("download rejects HTML, unauthorized redirects, oversize and timeout", async () => {
  const url = "https://docs.google.com/spreadsheets/d/abc/edit";
  for (const response of [
    new Response("<html>login</html>", {
      headers: { "content-type": "text/html" },
    }),
    new Response("", {
      status: 302,
      headers: { location: "https://evil.test/" },
    }),
    new Response("", {
      headers: { "content-length": String(11 * 1024 * 1024) },
    }),
  ])
    await assert.rejects(downloadCsv(url, async () => response));
  await assert.rejects(
    downloadCsv(url, async () => {
      throw new Error("timeout");
    }),
  );
  assert.equal(
    await downloadCsv(url, async () => new Response("A\nx")),
    "A\nx",
  );
});
test("shared validation handles per-player contact and required typed extras", () => {
  const r = validateRegistration(body, schema, 2);
  assert.equal(r.email, "team@example.com");
  assert.equal(r.extra_answers.kit, false);
  assert.throws(() =>
    validateRegistration({ ...body, players: [{ name: "Ana" }] }, schema, 1),
  );
  assert.throws(() =>
    validateRegistration(
      { ...body, extra_answers: { kit: "maybe" } },
      schema,
      2,
    ),
  );
  const individual = registrationSchema.parse({
    ...schema,
    email_mode: "participant",
  });
  const valid = validateRegistration(
    {
      ...body,
      players: body.players.map((p, i) => ({
        ...p,
        email: `p${i}@example.com`,
      })),
    },
    individual,
    2,
  );
  assert.equal(valid.email, "p0@example.com");
});
test("collisions normalize accents, ignore order/extras, flag exact contact and explain score", () => {
  const other = {
    ...body,
    players: [{ name: "ana lopez" }, { name: "jose alvarez" }],
    extra_answers: { kit: true },
  };
  assert.equal(matchRegistration(body, other).collision, true);
  assert.equal(matchRegistration(body, other).score, 100);
  assert.equal(
    matchRegistration(body, {
      name: "Different",
      players: [{ name: "Unrelated" }],
      email: body.email,
    }).exactEmail,
    true,
  );
  assert.equal(
    matchRegistration({ name: "Club" }, { name: "Club" }).collision,
    false,
  );
  assert.equal(
    matchRegistration(body, {
      name: "Zebra",
      players: [{ name: "Xyz" }, { name: "Wqz" }],
      email: "other@example.com",
    }).collision,
    false,
  );
  const a = {
    name: "Same",
    email: "a@b.com",
    phone: "123",
    players: [{ name: "abcdefghij" }],
  };
  const b = { ...a, email: "x@y.com", players: [{ name: "abcdexxxxx" }] };
  assert.equal(matchRegistration(a, b).collision, false);
});
test("mapper uses stable targets, equivalences, booleans and semicolon multiselects", () => {
  const s = registrationSchema.parse({
    fields: [
      {
        id: "kit",
        label: "Kit",
        scope: "team",
        type: "multiselect",
        options: ["A", "B"],
      },
    ],
  });
  const m = mappingSchema.parse({
    category_id: body.category_id,
    mappings: [
      { source: "name", target: "players[0].name" },
      {
        source: "options",
        target: "extra_answers.kit",
        values: { Alpha: "A", Beta: "B" },
      },
      { target: "name", value: "Team" },
    ],
  });
  const r = mapResponse(
    { name: "Ana", options: "Alpha;Beta" },
    m,
    registrationTargets(s, 1),
  );
  assert.deepEqual(r.data.extra_answers.kit, ["A", "B"]);
  assert.equal(r.data.players[0].name, "Ana");
  assert.equal(r.data.name, "Team");
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});
test("OAuth is optional and question IDs are stable", () => {
  const keys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_FORMS_REDIRECT_URI",
    "OAUTH_ENCRYPTION_KEY",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(googleCapabilities().googleOAuth.available, false);
    assert.equal(googleCapabilities().publicSheets.available, true);
    process.env.GOOGLE_CLIENT_ID = "partial";
    assert.equal(googleCapabilities().googleOAuth.available, false);
  } finally {
    for (const key of keys)
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
  }
  assert.equal(
    questionItem(
      { key: "name", label: "Nombre", required: true, type: "text" },
      0,
    ).questionItem.question.questionId,
    "00000001",
  );
});
test("80 percent is inclusive with two independent signals; extras never raise the score", () => {
  const base = {
    name: "Team",
    email: "one@example.com",
    phone: "5550000000",
    players: [{ name: "abcdefghijklmn" }],
  };
  const at = {
    ...base,
    email: "two@example.com",
    players: [{ name: "abcdefghijklmz" }],
  };
  assert.equal(matchRegistration(base, at).score, 80);
  assert.equal(matchRegistration(base, at).collision, true);
  const below = {
    ...at,
    players: [{ name: "abcdefghijklzz" }],
    extra_answers: { kit: true },
  };
  assert.equal(matchRegistration(base, below).collision, false);
});
