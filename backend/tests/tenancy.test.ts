import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { hashPassword, hashToken, newToken } from "../src/auth.js";
const enabled = !!process.env.TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3000";
const run = randomBytes(4).toString("hex");
const sharedStaff = `staff-${run}@example.invalid`;
const sharedCaptain = `captain-${run}@example.invalid`;
const pwA = "Password-for-A-123",
  pwB = "Password-for-B-456";
type Org = Awaited<ReturnType<typeof mkOrg>>;
let app: Awaited<ReturnType<typeof buildApp>>, A: Org, B: Org;
let platformCookie = "";
const platformEmail = `platform-${run}@example.invalid`;

async function q(sql: string, params: unknown[] = []) {
  return (await pool.query(sql, params)).rows;
}
async function mkOrg(tag: string, password: string) {
  const slug = `tn-${tag}-${run}`;
  const org = (await q("INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id", [`Club ${tag}`, slug]))[0].id as string;
  const tournament = (await q("INSERT INTO tournaments(organization_id,name,venue,starts_on,ends_on) VALUES($1,$2,'Courts','2026-09-18','2026-09-20') RETURNING id", [org, `Cup ${tag}`]))[0].id as string;
  const category = (await q("INSERT INTO categories(organization_id,tournament_id,name) VALUES($1,$2,'Open') RETURNING id", [org, tournament]))[0].id as string;
  const teams: string[] = [];
  for (let i = 0; i < 2; i++)
    teams.push((await q("INSERT INTO teams(organization_id,tournament_id,category_id,name,players,captain,email,status,verified_at) VALUES($1,$2,$3,$4,$5,0,$6,'approved',now()) RETURNING id", [org, tournament, category, `Team ${tag}${i}`, JSON.stringify([{ name: `P${tag}${i}a` }, { name: `P${tag}${i}b` }]), i === 0 ? sharedCaptain : `t${i}-${tag}-${run}@example.invalid`]))[0].id);
  const group = (await q("INSERT INTO groups(organization_id,category_id,name) VALUES($1,$2,'A') RETURNING id", [org, category]))[0].id as string;
  const court = (await q("INSERT INTO courts(organization_id,tournament_id,name) VALUES($1,$2,'Court 1') RETURNING id", [org, tournament]))[0].id as string;
  const match = (await q("INSERT INTO matches(organization_id,tournament_id,category_id,group_id,home_id,away_id,court_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,'2026-09-18T15:00:00Z','2026-09-18T16:00:00Z','scheduled') RETURNING id", [org, tournament, category, group, teams[0], teams[1], court]))[0].id as string;
  const sponsor = (await q("INSERT INTO sponsors(organization_id,tournament_id,name) VALUES($1,$2,$3) RETURNING id", [org, tournament, `Sponsor ${tag}`]))[0].id as string;
  const message = (await q("INSERT INTO messages(organization_id,sponsor_id,subject,body) VALUES($1,$2,'s','b') RETURNING id", [org, sponsor]))[0].id as string;
  const request = (await q("INSERT INTO change_requests(organization_id,team_id,kind,before_value,after_value,reason) VALUES($1,$2,'name','{}','{}','r') RETURNING id", [org, teams[0]]))[0].id as string;
  const admin = (await q("INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,'Admin',$2,$3,'admin') RETURNING id", [org, sharedStaff, hashPassword(password)]))[0].id as string;
  const victim = (await q("INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,'Ref',$2,$3,'referee') RETURNING id", [org, `ref-${tag}-${run}@example.invalid`, hashPassword(password)]))[0].id as string;
  const token = newToken();
  await q("INSERT INTO sessions(token_hash,organization_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [hashToken(token), org, admin]);
  return { org, slug, tournament, category, teams, group, court, match, sponsor, message, request, admin, victim, cookie: "torneum_session=" + token };
}
const snapshot = async (o: Org) => JSON.stringify(await Promise.all(
  ["teams", "matches", "categories", "sponsors", "messages", "change_requests", "courts", "users", "tournaments"].map((t) => q(`SELECT * FROM ${t} WHERE organization_id=$1 ORDER BY 1`, [o.org])),
));
function post(path: string, body: unknown, cookie: string, extra: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: path, headers: { origin, cookie, "idempotency-key": randomUUID(), ...extra }, payload: body as any });
}
const get = (url: string, cookie = "") => app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
const sessionOrg = async (res: { headers: any }) => {
  const c = ([] as string[]).concat(res.headers["set-cookie"] || []).join(";").match(/torneum_session=([^;]+)/);
  assert.ok(c, "session cookie expected");
  return (await q("SELECT organization_id FROM sessions WHERE token_hash=$1", [hashToken(c![1])]))[0]?.organization_id as string;
};

before(async () => {
  if (!enabled) return;
  assert.ok(process.env.DATABASE_URL === process.env.TEST_DATABASE_URL, "Use a dedicated TEST_DATABASE_URL");
  app = await buildApp();
  await app.ready();
  A = await mkOrg("a", pwA);
  B = await mkOrg("b", pwB);
  await q("INSERT INTO platform_admins(email,name,password_hash) VALUES($1,'Ops',$2)", [platformEmail, hashPassword("Platform-password-123")]);
});
after(async () => {
  if (enabled) {
    await app.close();
    await pool.end();
  }
});

test("state and public views are scoped to one organization", { skip: !enabled }, async () => {
  const s = (await get("/v1/state", A.cookie)).json();
  assert.equal(s.organization.slug, A.slug);
  assert.equal(s.tournament.id, A.tournament);
  assert.deepEqual(s.teams.map((t: any) => t.id).sort(), [...A.teams].sort());
  assert.ok(!JSON.stringify(s).includes(B.tournament));
  const pa = (await get(`/v1/public/${A.slug}`)).json(), pb = (await get(`/v1/public/${B.slug}`)).json();
  assert.equal(pa.tournament.id, A.tournament);
  assert.equal(pb.tournament.id, B.tournament);
  assert.equal((await get(`/v1/public/nope-${run}`)).statusCode, 404);
  const dead = await mkOrg("dead", pwA);
  await q("UPDATE organizations SET active=false WHERE id=$1", [dead.org]);
  assert.equal((await get(`/v1/public/${dead.slug}`)).statusCode, 404);
});

test("admin of A cannot write to B's resources", { skip: !enabled }, async () => {
  const before = await snapshot(B);
  const attempts: [string, unknown][] = [
    ["/v1/registrations/review", { id: B.teams[0], status: "rejected", reason: "x" }],
    ["/v1/results", { id: B.match, score: { sets: [[6, 0], [6, 0]] }, confirmed: true }],
    ["/v1/schedule", { tournament_id: B.tournament, changes: [{ id: B.match, court_id: B.court, starts_at: "2026-09-19T10:00:00Z" }], preview: false }],
    ["/v1/schedule", { tournament_id: A.tournament, changes: [{ id: B.match, court_id: A.court, starts_at: "2026-09-19T10:00:00Z" }], preview: false }],
    ["/v1/schedule", { tournament_id: A.tournament, changes: [{ id: A.match, court_id: B.court, starts_at: "2026-09-19T10:00:00Z" }], preview: false }],
    ["/v1/categories/update", { id: B.category, name: "Hacked", capacity: 16, group_size: 4, qualifiers: 2, duration_minutes: 60, rest_minutes: 30, rules: { sets: 3, games: 6, superTiebreak: true, goldenPoint: true } }],
    ["/v1/sponsors", { id: B.sponsor, name: "Hacked", website: "", email: "", phone: "", logo_url: "", level_id: null, status: "won", notes: "", evidence: [], factors: { local: false, sport: false, previous: false, contact: false, recent: false } }],
    ["/v1/messages/approve", { ids: [B.message], confirmed: true }],
    ["/v1/users/access", { id: B.victim, active: false }],
    ["/v1/requests/review", { id: B.request, approve: true }],
  ];
  for (const [path, body] of attempts) {
    const r = await post(path, body, A.cookie);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${path} -> ${r.statusCode} ${r.body}`);
  }
  assert.equal(await snapshot(B), before);
});

test("registration with slug A cannot target B's category", { skip: !enabled }, async () => {
  const r = await post("/v1/registrations", { slug: A.slug, category_id: B.category, name: "Intruders", players: [{ name: "One X" }, { name: "Two Y" }], captain: 0, email: `intruder-${run}@example.invalid` }, "");
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, r.body);
  assert.equal((await q("SELECT 1 FROM teams WHERE email=$1", [`intruder-${run}@example.invalid`])).length, 0);
});

test("magic link only issues a token for the slug's team", { skip: !enabled }, async () => {
  const saved = { u: process.env.SMTP_URL, f: process.env.MAIL_FROM };
  const smtp = createServer((sock) => {
    let data = false;
    sock.write("220 test\r\n");
    sock.on("data", (d) => {
      for (const line of d.toString().split("\r\n").filter(Boolean)) {
        if (data) { if (line === ".") { data = false; sock.write("250 ok\r\n"); } }
        else if (/^DATA/i.test(line)) { data = true; sock.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) sock.end("221 bye\r\n");
        else if (/^EHLO/i.test(line)) sock.write("250 test\r\n");
        else sock.write("250 ok\r\n");
      }
    });
    sock.on("error", () => {});
  });
  await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
  process.env.SMTP_URL = `smtp://127.0.0.1:${(smtp.address() as any).port}`;
  process.env.MAIL_FROM = "noreply@example.invalid";
  try {
    const r = await post("/v1/magic-link", { slug: A.slug, email: sharedCaptain }, "");
    assert.equal(r.statusCode, 200, r.body);
  } finally {
    smtp.close();
    if (saved.u === undefined) delete process.env.SMTP_URL; else process.env.SMTP_URL = saved.u;
    if (saved.f === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = saved.f;
  }
  const toks = await q("SELECT team_id,organization_id FROM verification_tokens WHERE team_id = ANY($1)", [[A.teams[0], B.teams[0]]]);
  assert.deepEqual(toks.map((t) => t.team_id), [A.teams[0]]);
  assert.equal(toks[0].organization_id, A.org);
});

test("login is scoped by slug when staff email exists in two orgs", { skip: !enabled }, async () => {
  const ok = await post("/v1/login", { slug: A.slug, email: sharedStaff, password: pwA }, "");
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(await sessionOrg(ok), A.org);
  const okB = await post("/v1/login", { slug: B.slug, email: sharedStaff, password: pwB }, "");
  assert.equal(await sessionOrg(okB), B.org);
  assert.equal((await post("/v1/login", { slug: A.slug, email: sharedStaff, password: pwB }, "")).statusCode, 401);
  assert.equal((await post("/v1/login", { slug: B.slug, email: sharedStaff, password: pwA }, "")).statusCode, 401);
});

test("realtime revision is per organization", { skip: !enabled }, async (t) => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as any).port}`;
  assert.equal((await fetch(`${base}/v1/events?org=nope-${run}`)).status, 404);
  const ctl = new AbortController();
  t.after(() => ctl.abort());
  const res = await fetch(`${base}/v1/events?org=${A.slug}`, { signal: ctl.signal });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const until = async (needle: string) => {
    while (!buf.includes(needle)) buf += dec.decode((await reader.read()).value);
    buf = buf.slice(buf.indexOf(needle) + needle.length);
  };
  await until("event: update"); // first tick reports initial revision
  await q("INSERT INTO audit_events(organization_id,actor,action) VALUES($1,'t','noise')", [B.org]);
  await until(": keepalive"); // B activity must not signal A
  await q("INSERT INTO audit_events(organization_id,actor,action) VALUES($1,'t','signal')", [A.org]);
  await until("event: update");
});

test("platform admin API and org deactivation", { skip: !enabled }, async () => {
  assert.equal((await get("/v1/platform/organizations")).statusCode, 401);
  assert.equal((await get("/v1/platform/organizations", A.cookie)).statusCode, 401);
  const login = await post("/v1/platform/login", { email: platformEmail, password: "Platform-password-123" }, "");
  assert.equal(login.statusCode, 200, login.body);
  platformCookie = "torneum_platform=" + String(login.headers["set-cookie"]).match(/torneum_platform=([^;]+)/)![1];
  assert.equal((await get("/v1/platform/organizations", platformCookie)).statusCode, 200);
  const slug = `new-${run}`;
  const body = { name: "New club", slug, admin_name: "Boss", admin_email: sharedStaff }; // email already used in A and B
  const created = await post("/v1/platform/organizations", body, platformCookie);
  assert.equal(created.statusCode, 200, created.body);
  const pw = created.json().admin.temporary_password;
  assert.ok(pw);
  const l = await post("/v1/login", { slug, email: sharedStaff, password: pw }, "");
  assert.equal(l.statusCode, 200, l.body);
  assert.equal((await post("/v1/platform/organizations", body, platformCookie)).statusCode, 409);
  assert.equal((await post("/v1/platform/organizations", { ...body, slug: "plataforma" }, platformCookie)).statusCode, 400);
  // deactivate A
  assert.equal((await get("/v1/session", A.cookie)).json().actor?.organization_id, A.org);
  const off = await post("/v1/platform/organizations/status", { id: A.org, active: false }, platformCookie);
  assert.equal(off.statusCode, 200, off.body);
  assert.equal((await get("/v1/session", A.cookie)).json().actor, null);
  assert.equal((await get("/v1/state", A.cookie)).statusCode, 401);
});
