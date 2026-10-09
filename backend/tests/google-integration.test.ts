import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { hashToken, newToken } from "../src/auth.js";
import { syncIntegration } from "../src/google/sync.js";
import { mappingSchema } from "../src/registration-fields.js";
import { parseCsv } from "../src/google/public-sheets.js";
const enabled = !!process.env.TEST_DATABASE_URL;
const q = async (sql: string, params: unknown[] = []) =>
  (await pool.query(sql, params)).rows;
let app: Awaited<ReturnType<typeof buildApp>>,
  org: string,
  tournament: string,
  category: string,
  otherOrg: string,
  cookie: string,
  staffCookie: string,
  viewerCookie: string;
let requests = 1;
const post = (url: string, body: any, auth = cookie) =>
  app.inject({
    method: "POST",
    url,
    payload: body,
    remoteAddress: `127.3.0.${requests++}`,
    headers: { origin: "http://127.0.0.1:3000", cookie: auth },
  });
const get = (url: string, auth = cookie) =>
  app.inject({ method: "GET", url, headers: { cookie: auth } });
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  process.env.DEV_MAILBOX = "true";
  process.env.NODE_ENV = "test";
  app = await buildApp();
  await app.ready();
  org = (
    await q(
      "INSERT INTO organizations(name,slug) VALUES('Google test',$1) RETURNING id",
      ["google-" + randomUUID()],
    )
  )[0].id;
  otherOrg = (
    await q(
      "INSERT INTO organizations(name,slug) VALUES('Other',$1) RETURNING id",
      ["google-" + randomUUID()],
    )
  )[0].id;
  tournament = (
    await q(
      "INSERT INTO tournaments(organization_id,name,venue,starts_on,ends_on) VALUES($1,'Google cup','Court','2026-10-09','2026-10-11') RETURNING id",
      [org],
    )
  )[0].id;
  category = (
    await q(
      "INSERT INTO categories(organization_id,tournament_id,name,capacity,participant_count) VALUES($1,$2,'Singles',50,1) RETURNING id",
      [org, tournament],
    )
  )[0].id;
  for (const role of ["admin", "registration", "viewer"]) {
    const user = (
      await q(
        "INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,$2,$3,'unused',$2) RETURNING id",
        [org, role, role + "@" + randomUUID() + ".invalid"],
      )
    )[0].id;
    const token = newToken();
    await q(
      "INSERT INTO sessions(token_hash,organization_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [hashToken(token), org, user],
    );
    if (role === "admin") cookie = "torneum_session=" + token;
    if (role === "registration") staffCookie = "torneum_session=" + token;
    if (role === "viewer") viewerCookie = "torneum_session=" + token;
  }
});
after(async () => {
  if (enabled) {
    await app.close();
    await pool.end();
  }
});
async function integration(csv: string) {
  const source = parseCsv(csv);
  const cols = source.columns;
  const mapping = mappingSchema.parse({
    category_id: category,
    columns: cols,
    mappings: [
      { source: cols[0].id, target: "name" },
      { source: cols[1].id, target: "players[0].name" },
      { source: cols[2].id, target: "email" },
      { source: cols[3]?.id, target: "phone" },
    ].filter((m) => m.source),
  });
  const row = (
    await q(
      "INSERT INTO registration_integrations(organization_id,tournament_id,provider,source_key,name,config,mapping) VALUES($1,$2,'google_sheets_public',$3,'Test','{}',$4) RETURNING *",
      [org, tournament, randomUUID(), JSON.stringify(mapping)],
    )
  )[0];
  return { row, source };
}
test(
  "capabilities and public validation stay available without OAuth; RBAC",
  { skip: !enabled },
  async () => {
    assert.equal(
      (await get("/v1/integrations/google/capabilities")).json().publicSheets
        .available,
      true,
    );
    assert.equal(
      (await get("/v1/integrations/google/oauth/start")).statusCode,
      503,
    );
    assert.equal(
      (await get("/v1/integrations/google/oauth/start")).json().code,
      "GOOGLE_OAUTH_NOT_CONFIGURED",
    );
    assert.equal(
      (
        await post("/v1/integrations/google/public/validate", {
          url: "https://example.com",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await get("/v1/integrations/google/capabilities", viewerCookie))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await post(
          "/v1/registration-fields/save",
          { tournament_id: tournament, schema: { fields: [] } },
          staffCookie,
        )
      ).statusCode,
      403,
    );
  },
);
test(
  "sync repeats without writes; acceptance creates one team/payment and public data stays private",
  { skip: !enabled },
  async () => {
    const { row, source } = await integration(
      "Equipo,Nombre,Correo,Teléfono\nNebula,Maria Solis,maria@example.com,5512345678",
    );
    const first = await syncIntegration(row.id, org, async () => source);
    assert.equal(first.created, 1);
    assert.equal(
      (await q("SELECT * FROM teams WHERE tournament_id=$1", [tournament]))
        .length,
      0,
    );
    assert.equal(
      (
        await q(
          "SELECT * FROM tournament_registrations WHERE tournament_id=$1",
          [tournament],
        )
      ).length,
      0,
    );
    assert.equal(
      (await syncIntegration(row.id, org, async () => source)).unchanged,
      1,
    );
    const response = (
      await q("SELECT * FROM registration_inbox WHERE integration_id=$1", [
        row.id,
      ])
    )[0];
    const [a, b] = await Promise.all([
      post("/v1/registration-inbox/resolve", {
        id: response.id,
        version: 1,
        action: "accept",
      }),
      post("/v1/registration-inbox/resolve", {
        id: response.id,
        version: 1,
        action: "accept",
      }),
    ]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
    assert.equal(
      (await q("SELECT * FROM teams WHERE tournament_id=$1", [tournament]))
        .length,
      1,
    );
    assert.equal(
      (
        await q(
          "SELECT * FROM tournament_registrations WHERE tournament_id=$1",
          [tournament],
        )
      ).length,
      1,
    );
    const team = (
      await q("SELECT * FROM teams WHERE tournament_id=$1", [tournament])
    )[0];
    await q("UPDATE teams SET status='approved',players=$2 WHERE id=$1", [
      team.id,
      JSON.stringify([
        {
          name: "Maria Solis",
          email: "private@example.com",
          phone: "secret",
          answers: { medical: "private" },
        },
      ]),
    ]);
    const slug = (
      await q("SELECT slug FROM organizations WHERE id=$1", [org])
    )[0].slug;
    const publicState = (await get("/v1/public/" + slug, "")).json();
    assert.deepEqual(publicState.teams[0].players, [{ name: "Maria Solis" }]);
    assert.equal(
      JSON.stringify(publicState).includes("private@example.com"),
      false,
    );
    assert.equal(
      (await syncIntegration(row.id, org, async () => source)).unchanged,
      1,
    );
  },
);
test(
  "cross-source and native duplicate warnings require admin; linking and repeated sync are idempotent",
  { skip: !enabled },
  async () => {
    const { row, source } = await integration(
      "Equipo,Nombre,Correo\nNébula,María Solis,maria@example.com",
    );
    await syncIntegration(row.id, org, async () => source);
    const r = (
      await q("SELECT * FROM registration_inbox WHERE integration_id=$1", [
        row.id,
      ])
    )[0];
    const list = (await get("/v1/registration-inbox/" + tournament)).json()
      .items;
    assert.ok(list.find((x: any) => x.id === r.id).collisions.length > 0);
    assert.equal(
      (
        await post(
          "/v1/registration-inbox/resolve",
          { id: r.id, version: 1, action: "accept" },
          staffCookie,
        )
      ).statusCode,
      403,
    );
    const team = (
      await q("SELECT * FROM teams WHERE tournament_id=$1", [tournament])
    )[0];
    assert.equal(
      (
        await post("/v1/registration-inbox/resolve", {
          id: r.id,
          version: 1,
          action: "link",
          team_id: team.id,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await syncIntegration(row.id, org, async () => source)).unchanged,
      1,
    );
    assert.equal(
      (await q("SELECT status FROM registration_inbox WHERE id=$1", [r.id]))[0]
        .status,
      "linked",
    );
    const slug = (
      await q("SELECT slug FROM organizations WHERE id=$1", [org])
    )[0].slug;
    const response = await post(
      "/v1/registrations",
      {
        slug,
        category_id: category,
        name: "Nebula",
        players: [{ name: "Maria Solis" }],
        captain: 0,
        email: "maria@example.com",
      },
      "",
    );
    assert.equal(response.json().review_pending, true);
    assert.equal(response.json().collisions, undefined);
  },
);
test(
  "stable response edits reopen review but never overwrite accepted registration",
  { skip: !enabled },
  async () => {
    const { row, source } = await integration(
      "Equipo,Nombre,Correo\nCometa,Ernesto Ruiz,ernesto@example.com",
    );
    source.rows[0].externalId = "stable-1";
    await syncIntegration(row.id, org, async () => source);
    let r = (
      await q("SELECT * FROM registration_inbox WHERE integration_id=$1", [
        row.id,
      ])
    )[0];
    assert.equal(
      (
        await post("/v1/registration-inbox/resolve", {
          id: r.id,
          version: 1,
          action: "accept",
        })
      ).statusCode,
      200,
    );
    const field = source.columns[0].id;
    source.rows[0].fields[field] = "Cometa Azul";
    assert.equal(
      (await syncIntegration(row.id, org, async () => source)).updated,
      1,
    );
    r = (await q("SELECT * FROM registration_inbox WHERE id=$1", [r.id]))[0];
    assert.equal(r.status, "pending");
    assert.equal(
      (await q("SELECT name FROM teams WHERE id=$1", [r.team_id]))[0].name,
      "Cometa",
    );
    assert.equal(
      (
        await post("/v1/registration-inbox/resolve", {
          id: r.id,
          version: r.version,
          action: "apply",
          fields: ["name"],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await q("SELECT name FROM teams WHERE id=$1", [r.team_id]))[0].name,
      "Cometa Azul",
    );
  },
);
test(
  "locks reject overlapping sync; cross-tenant sync cannot read or write source",
  { skip: !enabled },
  async () => {
    const { row, source } = await integration(
      "Equipo,Nombre,Correo\nOrion,Leonardo Prado,leonardo@example.com",
    );
    let unlock!: () => void, entered!: () => void;
    const waiting = new Promise<void>((r) => (entered = r));
    const gate = new Promise<void>((r) => (unlock = r));
    const first = syncIntegration(row.id, org, async () => {
      entered();
      await gate;
      return source;
    });
    await waiting;
    await assert.rejects(
      syncIntegration(row.id, org, async () => source),
      /sincronizando/,
    );
    unlock();
    await first;
    await assert.rejects(
      syncIntegration(row.id, otherOrg, async () => {
        throw new Error("must not read");
      }),
      /no encontrada/,
    );
    assert.equal(
      (
        await q("SELECT status FROM registration_integrations WHERE id=$1", [
          row.id,
        ])
      )[0].status,
      "connected",
    );
  },
);
test(
  "discarded identical responses stay discarded and failures preserve previous data",
  { skip: !enabled },
  async () => {
    const { row, source } = await integration(
      "Equipo,Nombre,Correo\nVega,Claudia Mora,claudia@example.com",
    );
    await syncIntegration(row.id, org, async () => source);
    const r = (
      await q("SELECT * FROM registration_inbox WHERE integration_id=$1", [
        row.id,
      ])
    )[0];
    assert.equal(
      (
        await post("/v1/registration-inbox/resolve", {
          id: r.id,
          version: 1,
          action: "discard",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await syncIntegration(row.id, org, async () => source)).unchanged,
      1,
    );
    assert.equal(
      (await q("SELECT status FROM registration_inbox WHERE id=$1", [r.id]))[0]
        .status,
      "discarded",
    );
    await assert.rejects(
      syncIntegration(row.id, org, async () => {
        throw new Error("Simulated Google outage");
      }),
    );
    assert.equal(
      (await q("SELECT status FROM registration_inbox WHERE id=$1", [r.id]))[0]
        .status,
      "discarded",
    );
  },
);
test(
  "OAuth mocked: encrypted tokens, pagination, refresh, generation retry and revocation isolation",
  { skip: !enabled },
  async () => {
    const { encrypt } = await import("../src/integrations.js");
    const { readForm } = await import("../src/google/oauth.js");
    const originalFetch = globalThis.fetch;
    const envKeys = [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_FORMS_REDIRECT_URI",
      "OAUTH_ENCRYPTION_KEY",
    ];
    const old = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_FORMS_REDIRECT_URI =
      "http://127.0.0.1:4000/v1/integrations/google/oauth/callback";
    process.env.OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    let revoked = false,
      refreshes = 0,
      creates = 0;
    let form: any = {
      formId: "testform12345",
      revisionId: "rev-1",
      info: { title: "Test" },
      items: [
        {
          itemId: "00000001",
          title: "Equipo",
          questionItem: { question: { questionId: "q1" } },
        },
      ],
    };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        refreshes++;
        return new Response(
          JSON.stringify(
            revoked
              ? { error: "invalid_grant" }
              : { access_token: "new-token", expires_in: 3600 },
          ),
          { status: revoked ? 400 : 200 },
        );
      }
      if (url.endsWith("/v1/forms") && init?.method === "POST") {
        creates++;
        form = { ...form, items: [] };
        return new Response(JSON.stringify({ formId: form.formId }));
      }
      if (url.includes(":setPublishSettings")) return new Response("{}");
      if (url.includes(":batchUpdate")) {
        const body = JSON.parse(String(init?.body));
        for (const req of body.requests)
          if (req.createItem) form.items.push(req.createItem.item);
        return new Response("{}");
      }
      if (url.includes("/responses"))
        return new Response(
          JSON.stringify(
            url.includes("pageToken=")
              ? {
                  responses: [
                    {
                      responseId: "r2",
                      answers: {
                        q1: { textAnswers: { answers: [{ value: "B" }] } },
                      },
                    },
                  ],
                }
              : {
                  responses: [
                    {
                      responseId: "r1",
                      answers: {
                        q1: { textAnswers: { answers: [{ value: "A" }] } },
                      },
                    },
                  ],
                  nextPageToken: "next",
                },
          ),
        );
      return new Response(JSON.stringify(form));
    };
    try {
      await q(
        "INSERT INTO google_connections(organization_id,encrypted_tokens) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET encrypted_tokens=$2,status='connected'",
        [
          org,
          encrypt({
            access_token: "expired",
            refresh_token: "refresh",
            expires_at: 0,
          }),
        ],
      );
      const source = await readForm(org, "testform12345");
      assert.equal(source.rows.length, 2);
      assert.equal(source.rows[1].externalId, "r2");
      assert.equal(refreshes, 1);
      const stored = (
        await q(
          "SELECT encrypted_tokens FROM google_connections WHERE organization_id=$1",
          [org],
        )
      )[0];
      assert.equal(stored.encrypted_tokens.includes("new-token"), false);
      const start = await get("/v1/integrations/google/oauth/start");
      assert.equal(start.statusCode, 200);
      assert.equal(
        new URL(start.json().url).searchParams.get("scope")?.includes("gmail"),
        false,
      );
      const job = {
        job_id: randomUUID(),
        tournament_id: tournament,
        category_id: category,
        title: "Generated",
      };
      const created = await post("/v1/integrations/google/forms/create", job);
      assert.equal(created.statusCode, 200, created.body);
      assert.equal(
        (await post("/v1/integrations/google/forms/create", job)).statusCode,
        200,
      );
      assert.equal(creates, 1);
      const integrationId = created.json().integration.id;
      assert.equal(
        (
          await post("/v1/integrations/google/forms/publish", {
            id: integrationId,
            published: true,
          })
        ).statusCode,
        200,
      );
      const preview = await post(
        "/v1/integrations/google/forms/update-preview",
        { id: integrationId },
      );
      assert.equal(preview.statusCode, 200);
      assert.equal(
        (
          await post("/v1/integrations/google/forms/update", {
            id: integrationId,
            revision: "stale",
            schema_hash: preview.json().schema_hash,
          })
        ).statusCode,
        409,
      );
      await q(
        "UPDATE google_connections SET encrypted_tokens=$2 WHERE organization_id=$1",
        [
          org,
          encrypt({
            access_token: "expired",
            refresh_token: "refresh",
            expires_at: 0,
          }),
        ],
      );
      revoked = true;
      await assert.rejects(syncIntegration(integrationId, org), /renovar/);
      assert.equal(
        (
          await q("SELECT status FROM registration_integrations WHERE id=$1", [
            integrationId,
          ])
        )[0].status,
        "reauth_required",
      );
      const publicSource = await integration(
        "Equipo,Nombre,Correo\nAndromeda,Susana Franco,susana@example.com",
      );
      assert.equal(
        (
          await syncIntegration(
            publicSource.row.id,
            org,
            async () => publicSource.source,
          )
        ).created,
        1,
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of envKeys)
        if (old[key] === undefined) delete process.env[key];
        else process.env[key] = old[key];
    }
  },
);
test(
  "staff cannot bypass a collision by editing the incoming identity; malformed categories stay reviewable",
  { skip: !enabled },
  async () => {
    const source = await integration(
      "Equipo,Nombre,Correo\nNebula,Maria Solis,maria@example.com",
    );
    await syncIntegration(source.row.id, org, async () => source.source);
    const row = (
      await q("SELECT * FROM registration_inbox WHERE integration_id=$1", [
        source.row.id,
      ])
    )[0];
    const response = await post(
      "/v1/registration-inbox/resolve",
      {
        id: row.id,
        version: 1,
        action: "accept",
        data: {
          category_id: category,
          name: "Different",
          players: [{ name: "Unknown unrelated person" }],
          email: "new@example.com",
          captain: 0,
        },
      },
      staffCookie,
    );
    assert.equal(response.statusCode, 403);
    await q(
      "UPDATE registration_inbox SET normalized=jsonb_set(normalized,'{category_id}','\"unknown category\"') WHERE id=$1",
      [row.id],
    );
    const list = await get("/v1/registration-inbox/" + tournament);
    assert.equal(list.statusCode, 200);
    assert.match(
      list.json().items.find((x: any) => x.id === row.id).errors[0],
      /categoría válida/,
    );
  },
);
test(
  "acceptance validates the current roster size after waiting for the category lock",
  { skip: !enabled },
  async () => {
    const blocker = await pool.connect();
    let pending: ReturnType<typeof post> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM categories WHERE id=$1 FOR UPDATE", [
        category,
      ]);
      const slug = (
        await q("SELECT slug FROM organizations WHERE id=$1", [org])
      )[0].slug;
      pending = post(
        "/v1/registrations",
        {
          slug,
          category_id: category,
          name: "Lock validation",
          players: [{ name: randomUUID() }],
          email: randomUUID() + "@example.com",
          captain: 0,
        },
        "",
      );
      // Injection starts when awaited/then'ed, so begin it before waiting on pg_stat_activity.
      const started = Promise.resolve(pending);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const locks = await q(
          "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM categories%FOR UPDATE%'",
        );
        if (locks.length) {
          waiting = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(waiting, "registration must wait for the locked category");
      await blocker.query(
        "UPDATE categories SET participant_count=2 WHERE id=$1",
        [category],
      );
      await blocker.query("COMMIT");
      const response = await started;
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(
        (
          await q(
            "SELECT id FROM teams WHERE tournament_id=$1 AND name='Lock validation'",
            [tournament],
          )
        ).length,
        0,
      );
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (pending) await pending;
      await q("UPDATE categories SET participant_count=1 WHERE id=$1", [
        category,
      ]);
    }
  },
);
