import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { hashPassword, hashToken, newToken } from "../src/auth.js";
const enabled = !!process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof buildApp>>,
  org: string,
  slug: string,
  tournament: string,
  category: string,
  adminCookie: string,
  refCookie: string,
  viewerCookie: string;
const origin = "http://127.0.0.1:3000";
async function post(
  path: string,
  body: unknown,
  cookie = adminCookie,
  extra: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: path,
    headers: { origin, cookie, ...extra },
    payload: body as any,
  });
}
before(async () => {
  if (!enabled) return;
  assert.ok(
    process.env.DATABASE_URL === process.env.TEST_DATABASE_URL,
    "Use a dedicated TEST_DATABASE_URL",
  );
  app = await buildApp();
  await app.ready();
  slug = "it-" + randomBytes(6).toString("hex");
  org = (
    await pool.query(
      "INSERT INTO organizations(name,slug) VALUES('Integration test',$1) RETURNING id",
      [slug],
    )
  ).rows[0].id;
  tournament = (
    await pool.query(
      "INSERT INTO tournaments(organization_id,name,venue,starts_on,ends_on) VALUES($1,'Test cup','Test courts','2026-09-18','2026-09-20') RETURNING id",
      [org],
    )
  ).rows[0].id;
  category = (
    await pool.query(
      "INSERT INTO categories(organization_id,tournament_id,name) VALUES($1,$2,'Test category') RETURNING id",
      [org, tournament],
    )
  ).rows[0].id;
  for (const role of ["admin", "referee", "viewer"]) {
    const u = (
      await pool.query(
        "INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$2) RETURNING id",
        [
          org,
          role,
          role + "-" + org + "@example.invalid",
          hashPassword("Integration-password-123"),
        ],
      )
    ).rows[0];
    const token = newToken();
    await pool.query(
      "INSERT INTO sessions(token_hash,organization_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [hashToken(token), org, u.id],
    );
    if (role === "admin") adminCookie = "torneum_session=" + token;
    if (role === "referee") refCookie = "torneum_session=" + token;
    if (role === "viewer") viewerCookie = "torneum_session=" + token;
  }
});
after(async () => {
  if (enabled) {
    await app.close();
    await pool.end();
  }
});
test(
  "full tournament, authorization, conflict rollback and captain dispute",
  { skip: !enabled },
  async () => {
    assert.equal(
      (
        await post(
          "/v1/categories",
          {
            name: "Unauthorized",
            capacity: 16,
            group_size: 4,
            qualifiers: 2,
            duration_minutes: 60,
            rest_minutes: 30,
            rules: {
              sets: 3,
              games: 6,
              superTiebreak: true,
              goldenPoint: true,
            },
          },
          refCookie,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await post(
          "/v1/agent/tools",
          { agent: "public", tool: "operational_state" },
          adminCookie,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/logout",
          headers: { origin: "https://evil.invalid", cookie: adminCookie },
          payload: {},
        })
      ).statusCode,
      403,
    );
    const captainCookies: string[] = [];
    const teamIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await post(
        "/v1/registrations",
        {
          slug,
          category_id: category,
          name: "Team " + i,
          players: [
            { name: "Player " + i + " A" },
            { name: "Player " + i + " B" },
          ],
          captain: 0,
          email: `captain-${org}-${i}@example.invalid`,
          phone: "",
        },
        "",
      );
      assert.equal(response.statusCode, 200, response.body);
      const token = response.json().development_link.split("#")[1];
      const verified = await post("/v1/verify", { token }, "");
      assert.equal(verified.statusCode, 200, verified.body);
      captainCookies.push(
        verified.headers["set-cookie"]!.toString().split(";")[0],
      );
      assert.equal((await post("/v1/verify", { token }, "")).statusCode, 400);
      const team = (
        await pool.query("SELECT * FROM teams WHERE organization_id=$1 AND email=$2", [
          org,
          `captain-${org}-${i}@example.invalid`,
        ])
      ).rows[0];
      teamIds.push(team.id);
      assert.equal(
        (
          await post("/v1/registrations/review", {
            id: team.id,
            status: "approved",
            reason: "Verified skill level",
          })
        ).statusCode,
        200,
      );
    }
    const before = await post("/v1/draw", {
      category_id: category,
      seed: "test-seed",
      publish: false,
    });
    assert.equal(before.statusCode, 200, before.body);
    assert.equal(
      (
        await pool.query("SELECT * FROM groups WHERE category_id=$1", [
          category,
        ])
      ).rowCount,
      0,
    );
    const key = randomUUID();
    const draw = await post(
      "/v1/draw",
      { category_id: category, seed: "test-seed", publish: true },
      adminCookie,
      { "idempotency-key": key },
    );
    assert.equal(draw.statusCode, 200, draw.body);
    assert.deepEqual(
      (
        await post(
          "/v1/draw",
          { category_id: category, seed: "test-seed", publish: true },
          adminCookie,
          { "idempotency-key": key },
        )
      ).json(),
      draw.json(),
    );
    assert.equal(
      (
        await post(
          "/v1/draw",
          { category_id: category, seed: "different", publish: true },
          adminCookie,
          { "idempotency-key": key },
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await post("/v1/registrations/review", {
          id: teamIds[0],
          status: "rejected",
          reason: "After draw",
        })
      ).statusCode,
      409,
    );
    const matches = (
      await pool.query(
        "SELECT * FROM matches WHERE category_id=$1 ORDER BY id",
        [category],
      )
    ).rows;
    assert.equal(matches.length, 6);
    await post("/v1/courts", {
      name: "Test Court",
      opens_at: "08:00",
      closes_at: "22:00",
    });
    const court = (
      await pool.query("SELECT id FROM courts WHERE tournament_id=$1", [
        tournament,
      ])
    ).rows[0].id;
    assert.equal(
      (
        await post("/v1/schedule", {
          tournament_id: tournament,
          changes: [
            {
              id: matches[0].id,
              court_id: court,
              starts_at: "2026-09-18T14:00:00Z",
            },
          ],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await post("/v1/schedule", {
          tournament_id: tournament,
          changes: [
            {
              id: matches[1].id,
              court_id: court,
              starts_at: "2026-09-18T14:00:00Z",
            },
          ],
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await pool.query("SELECT starts_at FROM matches WHERE id=$1", [
          matches[1].id,
        ])
      ).rows[0].starts_at,
      null,
    );
    assert.equal(
      (await post("/v1/schedule/undo", { tournament_id: tournament }))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await pool.query("SELECT starts_at FROM matches WHERE id=$1", [
          matches[0].id,
        ])
      ).rows[0].starts_at,
      null,
    );
    const m = matches[0],
      hi = teamIds.indexOf(m.home_id),
      ai = teamIds.indexOf(m.away_id);
    const unrelated = teamIds.findIndex(
      (t) => t !== m.home_id && t !== m.away_id,
    );
    assert.equal(
      (
        await post(
          "/v1/results",
          {
            id: m.id,
            score: {
              sets: [
                [6, 2],
                [6, 3],
              ],
            },
            confirmed: true,
          },
          captainCookies[unrelated],
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await post(
          "/v1/results",
          {
            id: m.id,
            score: {
              sets: [
                [6, 2],
                [6, 3],
              ],
            },
            confirmed: true,
          },
          captainCookies[hi],
        )
      ).statusCode,
      200,
    );
    const publicState = (await app.inject({ url: "/v1/public/" + slug })).json();
    assert.ok(publicState.teams.every((t: any) => !("email" in t)));
    assert.equal(
      publicState.matches.find((x: any) => x.id === m.id).score,
      null,
    );
    assert.equal(
      (
        await post(
          "/v1/results",
          {
            id: m.id,
            score: {
              sets: [
                [2, 6],
                [3, 6],
              ],
            },
            confirmed: true,
          },
          captainCookies[ai],
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await pool.query("SELECT status FROM matches WHERE id=$1", [m.id]))
        .rows[0].status,
      "disputed",
    );
    assert.equal(
      (
        await post(
          "/v1/results",
          {
            id: m.id,
            score: {
              sets: [
                [6, 2],
                [6, 3],
              ],
            },
            confirmed: true,
          },
          viewerCookie,
        )
      ).statusCode,
      403,
    );
    for (const m of matches)
      assert.equal(
        (
          await post(
            "/v1/results",
            {
              id: m.id,
              score: {
                sets: [
                  [6, 2],
                  [6, 3],
                ],
              },
              confirmed: true,
            },
            refCookie,
          )
        ).statusCode,
        200,
      );
    const generated = await post("/v1/bracket", { category_id: category });
    assert.equal(generated.statusCode, 200, generated.body);
    const final = (
      await pool.query(
        "SELECT * FROM matches WHERE category_id=$1 AND stage='knockout'",
        [category],
      )
    ).rows[0];
    assert.ok(final.home_id && final.away_id);
    assert.equal(
      (
        await post("/v1/results", {
          id: final.id,
          score: {
            sets: [
              [6, 2],
              [6, 3],
            ],
          },
          confirmed: true,
        })
      ).statusCode,
      200,
    );
    assert.ok(
      (
        await pool.query("SELECT winner_id FROM matches WHERE id=$1", [
          final.id,
        ])
      ).rows[0].winner_id,
    );
  },
);

test('commercial approval and agent confirmations cannot bypass roles',{skip:!enabled},async()=>{
 const sponsor=(await pool.query("INSERT INTO sponsors(organization_id,tournament_id,name,email) VALUES($1,$2,'Test sponsor','business@example.invalid') RETURNING id",[org,tournament])).rows[0];
 const payload={sponsor_id:sponsor.id,subject:'Invitation for test cup',body:'A fully editable proposal for review, not an actual send.',channel:'manual'};
 assert.equal((await post('/v1/agent/prepare',{agent:'public',route:'/v1/messages',payload})).statusCode,403);
 assert.equal((await post('/v1/agent/prepare',{agent:'sponsors',route:'/v1/messages',payload},refCookie)).statusCode,403);
 const proposed=await post('/v1/agent/prepare',{agent:'sponsors',route:'/v1/messages',payload});assert.equal(proposed.statusCode,200,proposed.body);const proposal=proposed.json().proposal;
 assert.ok(proposal.summary.some((s:string)=>s.includes('Test sponsor')));
 assert.equal((await pool.query('SELECT 1 FROM messages WHERE sponsor_id=$1',[sponsor.id])).rowCount,0);
 assert.equal((await post('/v1/agent/apply',{proposal_id:proposal.id,confirmed:true},viewerCookie)).statusCode,409);
 assert.equal((await post('/v1/agent/apply',{proposal_id:proposal.id,confirmed:true})).statusCode,200);
 assert.equal((await post('/v1/agent/apply',{proposal_id:proposal.id,confirmed:true})).statusCode,409);
 const message=(await pool.query('SELECT * FROM messages WHERE sponsor_id=$1',[sponsor.id])).rows[0];assert.equal(message.status,'draft');assert.equal(message.approved_by,null);
 assert.equal((await post('/v1/messages/approve',{ids:[message.id],confirmed:true},refCookie)).statusCode,403);
 assert.equal((await post('/v1/messages/approve',{ids:[message.id],confirmed:true})).statusCode,200);
 assert.equal((await post('/v1/messages/queue',{ids:[message.id],confirmed:true})).statusCode,503);
 assert.equal((await post('/v1/messages/cancel',{id:message.id})).statusCode,200);
 assert.equal((await pool.query('SELECT status FROM messages WHERE id=$1',[message.id])).rows[0].status,'cancelled');
});
test('automatic schedule previews are pure and concurrent conflicting writes serialize',{skip:!enabled},async()=>{
 const c=(await pool.query("INSERT INTO categories(organization_id,tournament_id,name) VALUES($1,$2,'Schedule test') RETURNING id",[org,tournament])).rows[0];
 const ids:string[]=[];for(let i=0;i<4;i++)ids.push((await pool.query("INSERT INTO teams(organization_id,tournament_id,category_id,name,players,captain,email,status,verified_at) VALUES($1,$2,$3,$4,$5,0,$6,'approved',now()) RETURNING id",[org,tournament,c.id,'Schedule duo '+i,JSON.stringify([{name:'A'+i},{name:'B'+i}]),`schedule-${org}-${i}@example.invalid`])).rows[0].id);
 const drawn=await post('/v1/draw',{category_id:c.id,seed:'schedule',publish:true});assert.equal(drawn.statusCode,200,drawn.body);
 const started=Date.now();const preview=await post('/v1/schedule/auto',{tournament_id:tournament,publish:false});assert.equal(preview.statusCode,200,preview.body);assert.ok(Date.now()-started<10000);assert.equal(preview.json().changes.length,6);
 assert.equal((await pool.query('SELECT 1 FROM matches WHERE category_id=$1 AND starts_at IS NOT NULL',[c.id])).rowCount,0);
 const changes=preview.json().changes;const a=changes[0];const b={...changes[1],court_id:a.court_id,starts_at:a.starts_at};const results=await Promise.all([post('/v1/schedule',{tournament_id:tournament,changes:[a]}),post('/v1/schedule',{tournament_id:tournament,changes:[b]})]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
});
