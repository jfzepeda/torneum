import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { pool, transaction, ensure, audit, type Db } from "../db.js";
import {
  getActor,
  requirePermission,
  newToken,
  hashToken,
  type Actor,
} from "../auth.js";
import { encrypt } from "../integrations.js";
import {
  registrationSchema,
  registrationInput,
  mappingSchema,
  registrationTargets,
  canonical,
  fingerprint,
  type Mapping,
} from "../registration-fields.js";
import {
  lockTournament,
  checkInput,
  createRegistration,
  submitNative,
  inboxDetail,
  findCollisions,
} from "../registrations.js";
import {
  publicSheetUrl,
  readPublicSheet,
  parseCsv,
  downloadCsv,
} from "./public-sheets.js";
import {
  googleCapabilities,
  redirectUri,
  exchangeCode,
  formId,
  readForm,
  formsRequest,
  questionItem,
} from "./oauth.js";
import { syncIntegration } from "./sync.js";
const id = z.string().uuid();
const objectResponse = { 200: { type: "object", additionalProperties: true } };
export function registerGoogleRoutes(app: FastifyInstance) {
  function post<T extends z.ZodType>(
    path: string,
    schema: T,
    permission: string,
    handler: (
      body: z.infer<T>,
      actor: Actor,
      reply: FastifyReply,
    ) => Promise<unknown>,
  ) {
    app.post(
      path,
      {
        schema: {
          body: z.toJSONSchema(schema, { target: "draft-7", io: "input" }),
          response: objectResponse,
        },
      },
      async (req, reply) => {
        const a = requirePermission(await getActor(req), permission);
        return handler(schema.parse(req.body), a, reply);
      },
    );
  }
  async function tournament(org: string, tournament: string, db: Db = pool) {
    const t = (
      await db.query(
        "SELECT * FROM tournaments WHERE id=$1 AND organization_id=$2",
        [tournament, org],
      )
    ).rows[0];
    ensure(t, "Torneo no encontrado.", 404);
    return t;
  }
  async function integration(org: string, integrationId: string) {
    const row = (
      await pool.query(
        "SELECT * FROM registration_integrations WHERE id=$1 AND organization_id=$2",
        [integrationId, org],
      )
    ).rows[0];
    ensure(row, "Integración no encontrada.", 404);
    return row;
  }
  function oauthAvailable(reply: FastifyReply) {
    if (googleCapabilities().googleOAuth.available) return true;
    reply.code(503).send({
      code: "GOOGLE_OAUTH_NOT_CONFIGURED",
      message: "Google OAuth no está configurado.",
      alternative: "google_sheets_public",
      error: {
        message: "Google OAuth no está configurado. Usa Google Sheets público.",
      },
    });
    return false;
  }
  app.get(
    "/v1/integrations/google/capabilities",
    { schema: { response: objectResponse } },
    async (req) => {
      const a = requirePermission(await getActor(req), "registrations");
      const connection = (
        await pool.query(
          "SELECT status FROM google_connections WHERE organization_id=$1",
          [a.organization_id],
        )
      ).rows[0];
      return {
        ...googleCapabilities(),
        connection: connection?.status || "disconnected",
      };
    },
  );
  app.get("/v1/integrations/google/:tournamentId", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    const p = z.object({ tournamentId: id }).parse(req.params);
    await tournament(a.organization_id, p.tournamentId);
    return {
      integrations: (
        await pool.query(
          "SELECT * FROM registration_integrations WHERE tournament_id=$1 AND organization_id=$2 ORDER BY created_at",
          [p.tournamentId, a.organization_id],
        )
      ).rows,
    };
  });
  app.get("/v1/integrations/:id/status", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    return integration(
      a.organization_id,
      z.object({ id }).parse(req.params).id,
    );
  });
  app.get("/v1/registration-fields/:tournamentId", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    const p = z.object({ tournamentId: id }).parse(req.params);
    const t = await tournament(a.organization_id, p.tournamentId);
    const cats = (
      await pool.query(
        "SELECT * FROM categories WHERE tournament_id=$1 AND organization_id=$2",
        [p.tournamentId, a.organization_id],
      )
    ).rows;
    const schema = registrationSchema.parse(t.registration_schema);
    return {
      schema,
      targets: registrationTargets(
        schema,
        Math.max(1, ...cats.map((c) => c.participant_count)),
      ),
      categories: cats,
    };
  });
  post(
    "/v1/registration-fields/save",
    z.object({ tournament_id: id, schema: registrationSchema }),
    "admin",
    async (b, a) =>
      transaction(async (db) => {
        const t = await lockTournament(db, a.organization_id, b.tournament_id);
        const previous = registrationSchema.parse(t.registration_schema);
        for (const f of previous.fields) {
          const next = b.schema.fields.find((x) => x.id === f.id);
          ensure(
            next,
            "Desactiva campos existentes en lugar de eliminarlos.",
            400,
          );
          ensure(
            next.type === f.type && next.scope === f.scope,
            "El tipo y ámbito de un campo existente no pueden cambiar; crea otro campo.",
            400,
          );
        }
        await db.query(
          "UPDATE tournaments SET registration_schema=$2 WHERE id=$1",
          [t.id, JSON.stringify(b.schema)],
        );
        await audit(
          db,
          a.organization_id,
          a.id,
          "registration.schema",
          t.id,
          previous,
          b.schema,
        );
        return { ok: true };
      }),
  );
  const previewBody = z.object({
    url: z.string().max(2000),
    header_row: z.number().int().min(1).max(100).default(1),
  });
  for (const action of ["validate", "preview"])
    post(
      "/v1/integrations/google/public/" + action,
      previewBody,
      "admin",
      async (b) => {
        const data = parseCsv(await downloadCsv(b.url), b.header_row);
        return {
          ...data,
          rows: data.rows.slice(0, 10),
          total: data.rows.length,
        };
      },
    );
  async function validateMapping(
    b: { tournament_id: string; mapping: Mapping },
    org: string,
  ) {
    const t = await tournament(org, b.tournament_id);
    const cats = (
      await pool.query(
        "SELECT * FROM categories WHERE tournament_id=$1 AND organization_id=$2",
        [t.id, org],
      )
    ).rows;
    ensure(
      cats.some((c) => c.id === b.mapping.category_id),
      "Categoría inválida.",
      400,
    );
    const targets = registrationTargets(
      registrationSchema.parse(t.registration_schema),
      Math.max(1, ...cats.map((c) => c.participant_count)),
      true,
    );
    ensure(
      new Set(b.mapping.mappings.map((m) => m.target)).size ===
        b.mapping.mappings.length,
      "Un destino solo puede mapearse una vez.",
      400,
    );
    for (const m of b.mapping.mappings) {
      ensure(
        targets.some((t) => t.key === m.target),
        "Destino de mapeo desconocido.",
        400,
      );
      ensure(
        (m.source !== undefined) !== (m.value !== undefined),
        "Selecciona columna o valor fijo.",
        400,
      );
      if (m.source)
        ensure(
          b.mapping.columns.some((c) => c.id === m.source),
          "Columna desconocida.",
          400,
        );
    }
    return t;
  }
  const connect = z.object({
    tournament_id: id,
    name: z.string().trim().min(1).max(150),
    url: z.string().max(2000),
    mapping: mappingSchema,
  });
  post(
    "/v1/integrations/google/public/connect",
    connect,
    "admin",
    async (b, a) => {
      await validateMapping(b, a.organization_id);
      const source = publicSheetUrl(b.url);
      await readPublicSheet(b.url, b.mapping);
      const result = await transaction(async (db) => {
        await lockTournament(db, a.organization_id, b.tournament_id);
        const r = (
          await db.query(
            `INSERT INTO registration_integrations(organization_id,tournament_id,provider,source_key,name,config,mapping) VALUES($1,$2,'google_sheets_public',$3,$4,$5,$6) ON CONFLICT(organization_id,tournament_id,provider,source_key) DO UPDATE SET name=EXCLUDED.name,config=EXCLUDED.config,mapping_version=registration_integrations.mapping_version+CASE WHEN registration_integrations.mapping=EXCLUDED.mapping THEN 0 ELSE 1 END,mapping=EXCLUDED.mapping,enabled=true RETURNING *`,
            [
              a.organization_id,
              b.tournament_id,
              source.key,
              b.name,
              JSON.stringify({ url: source.url }),
              JSON.stringify(b.mapping),
            ],
          )
        ).rows[0];
        return r;
      });
      return { integration: result };
    },
  );
  post(
    "/v1/integrations/mapping",
    z.object({
      id,
      mapping: mappingSchema,
      version: z.number().int().positive(),
    }),
    "admin",
    async (b, a) => {
      const i = await integration(a.organization_id, b.id);
      await validateMapping(
        { tournament_id: i.tournament_id, mapping: b.mapping },
        a.organization_id,
      );
      return transaction(async (db) => {
        await lockTournament(db, a.organization_id, i.tournament_id);
        const r = await db.query(
          "UPDATE registration_integrations SET mapping=$3,mapping_version=mapping_version+1 WHERE id=$1 AND organization_id=$2 AND mapping_version=$4 RETURNING id",
          [i.id, a.organization_id, JSON.stringify(b.mapping), b.version],
        );
        ensure(r.rowCount, "El mapeo cambió. Recarga antes de guardar.");
        return { ok: true };
      });
    },
  );
  post(
    "/v1/integrations/toggle",
    z.object({ id, enabled: z.boolean() }),
    "admin",
    async (b, a) => {
      const r = await pool.query(
        "UPDATE registration_integrations SET enabled=$3 WHERE id=$1 AND organization_id=$2 RETURNING id",
        [b.id, a.organization_id, b.enabled],
      );
      ensure(r.rowCount, "Integración no encontrada.", 404);
      return { ok: true };
    },
  );
  app.post("/v1/integrations/:id/sync", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    const p = z.object({ id }).parse(req.params);
    return syncIntegration(p.id, a.organization_id);
  });
  app.get("/v1/registration-inbox/:tournamentId", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    const p = z.object({ tournamentId: id }).parse(req.params);
    await tournament(a.organization_id, p.tournamentId);
    const query = z
      .object({
        status: z
          .enum(["pending", "accepted", "linked", "discarded"])
          .default("pending"),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const rows = (
      await pool.query(
        "SELECT * FROM registration_inbox WHERE organization_id=$1 AND tournament_id=$2 AND status=$3 ORDER BY created_at,id LIMIT 50 OFFSET $4",
        [a.organization_id, p.tournamentId, query.status, query.offset],
      )
    ).rows;
    const items = [];
    for (const row of rows) items.push(await inboxDetail(pool, row));
    return {
      items,
      next_offset: rows.length === 50 ? query.offset + 50 : null,
    };
  });
  post(
    "/v1/registrations/internal",
    z.object({ tournament_id: id, data: registrationInput }),
    "registrations",
    async (b, a) =>
      transaction(async (db) => {
        await tournament(a.organization_id, b.tournament_id, db);
        await checkInput(db, a.organization_id, b.tournament_id, b.data);
        return submitNative(db, a.organization_id, b.data, "organizer");
      }),
  );
  const resolution = z.object({
    id,
    version: z.number().int().positive(),
    action: z.enum(["accept", "link", "apply", "discard"]),
    team_id: id.optional(),
    data: registrationInput.optional(),
    fields: z.array(z.string().max(150)).max(1000).default([]),
    distinct: z.boolean().default(false),
  });
  post(
    "/v1/registration-inbox/resolve",
    resolution,
    "registrations",
    async (b, a) =>
      transaction(async (db) => {
        const initial = (
          await db.query(
            "SELECT tournament_id FROM registration_inbox WHERE id=$1 AND organization_id=$2",
            [b.id, a.organization_id],
          )
        ).rows[0];
        ensure(initial, "Respuesta no encontrada.", 404);
        await lockTournament(db, a.organization_id, initial.tournament_id);
        const r = (
          await db.query(
            "SELECT * FROM registration_inbox WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [b.id, a.organization_id],
          )
        ).rows[0];
        ensure(
          r.version === b.version && r.status === "pending",
          "La respuesta ya fue revisada o cambió. Recarga la bandeja.",
        );
        const candidate = b.data || r.normalized;
        const collisions = await findCollisions(
          db,
          a.organization_id,
          r.tournament_id,
          candidate,
          r.id,
          r.team_id,
        );
        const originalCollisions = b.data
          ? await findCollisions(
              db,
              a.organization_id,
              r.tournament_id,
              r.normalized,
              r.id,
              r.team_id,
            )
          : collisions;
        if (
          originalCollisions.length ||
          collisions.length ||
          r.team_id ||
          b.action !== "accept" ||
          b.distinct
        )
          requirePermission(a, "admin");
        let teamId = r.team_id;
        let result: any = { ok: true };
        if (b.action === "accept") {
          ensure(
            !r.team_id,
            "La respuesta ya está vinculada; revisa sus cambios.",
          );
          ensure(
            !collisions.length || b.distinct,
            "Resuelve las coincidencias o confirma que es un equipo distinto.",
          );
          result = await createRegistration(
            db,
            a.organization_id,
            r.tournament_id,
            candidate,
            r.source,
          );
          teamId = result.team_id;
        } else if (b.action === "link" || b.action === "apply") {
          teamId = b.team_id || r.team_id;
          ensure(teamId, "Selecciona la inscripción original.", 400);
          const team = (
            await db.query(
              "SELECT * FROM teams WHERE id=$1 AND tournament_id=$2 AND organization_id=$3 FOR UPDATE",
              [teamId, r.tournament_id, a.organization_id],
            )
          ).rows[0];
          ensure(team, "Inscripción no encontrada.", 404);
          if (b.action === "apply") {
            ensure(
              b.fields.length > 0,
              "Selecciona los campos que quieres aplicar.",
              400,
            );
            const merged: any = { ...team };
            for (const field of b.fields) {
              ensure(
                ["name", "phone", "players", "extra_answers"].includes(field),
                "Solo se pueden aplicar nombre, teléfono, participantes o adicionales. Correo/categoría requieren su flujo de verificación/pago.",
                400,
              );
              merged[field] = candidate[field];
            }
            // Preserve the verified contact, captain and category when applying external corrections.
            ensure(
              canonical(merged.players.map((p: any) => p.email || "")) ===
                canonical(team.players.map((p: any) => p.email || "")),
              "Los correos de participantes requieren verificación; conserva los actuales.",
              400,
            );
            const validated = (
              await checkInput(db, a.organization_id, r.tournament_id, merged)
            ).data;
            ensure(
              validated.email === team.email,
              "La corrección no puede cambiar el correo verificado.",
              400,
            );
            await db.query(
              "UPDATE teams SET name=$2,phone=$3,players=$4,extra_answers=$5 WHERE id=$1",
              [
                teamId,
                validated.name,
                validated.phone,
                JSON.stringify(validated.players),
                JSON.stringify(validated.extra_answers),
              ],
            );
            await audit(
              db,
              a.organization_id,
              a.id,
              "registration.correction",
              teamId,
              { name: team.name },
              { fields: b.fields },
            );
          }
        }
        const status =
          b.action === "discard"
            ? "discarded"
            : b.action === "accept"
              ? "accepted"
              : "linked";
        await db.query(
          "UPDATE registration_inbox SET status=$2,team_id=$3,reviewed_by=$4,reviewed_at=now(),version=version+1,updated_at=now(),normalized=$5 WHERE id=$1",
          [r.id, status, teamId, a.id, JSON.stringify(candidate)],
        );
        await audit(
          db,
          a.organization_id,
          a.id,
          "registration.resolve",
          r.id,
          null,
          { action: b.action, team_id: teamId, distinct: b.distinct },
        );
        return result;
      }),
  );
  post(
    "/v1/registration-inbox/bulk-update",
    z.object({
      tournament_id: id,
      items: z
        .array(
          z.object({
            id,
            version: z.number().int().positive(),
            name: z.string().trim().min(1).max(150).optional(),
            category_id: id.optional(),
            email: z.email().max(254).optional(),
            players: registrationInput.shape.players.optional(),
          }),
        )
        .min(1)
        .max(500),
    }),
    "registrations",
    async (b, a) =>
      transaction(async (db) => {
        await lockTournament(db, a.organization_id, b.tournament_id);
        const categories = new Set(
          (
            await db.query(
              "SELECT id FROM categories WHERE tournament_id=$1 AND organization_id=$2",
              [b.tournament_id, a.organization_id],
            )
          ).rows.map((c) => c.id),
        );
        let updated = 0;
        for (const item of b.items) {
          ensure(
            !item.category_id || categories.has(item.category_id),
            "Categoría no encontrada.",
            404,
          );
          const r = await db.query(
            "UPDATE registration_inbox SET normalized=normalized || $5::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND tournament_id=$3 AND version=$4 AND status='pending' RETURNING id",
            [
              item.id,
              a.organization_id,
              b.tournament_id,
              item.version,
              JSON.stringify({
                ...(item.name && { name: item.name }),
                ...(item.category_id && { category_id: item.category_id }),
                ...(item.email && { email: item.email }),
                ...(item.players && { players: item.players }),
              }),
            ],
          );
          updated += r.rowCount ?? 0;
        }
        await audit(
          db,
          a.organization_id,
          a.id,
          "registration.bulk_update",
          b.tournament_id,
          null,
          { requested: b.items.length, updated },
        );
        return { updated, skipped: b.items.length - updated };
      }),
  );
  app.get("/v1/integrations/google/oauth/start", async (req, reply) => {
    const a = requirePermission(await getActor(req), "admin");
    if (!oauthAvailable(reply)) return;
    const state = newToken();
    await pool.query(
      "INSERT INTO google_oauth_states VALUES($1,$2,$3,now()+interval '10 minutes')",
      [hashToken(state), a.organization_id, a.id],
    );
    const query = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/forms.body https://www.googleapis.com/auth/forms.responses.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { url: "https://accounts.google.com/o/oauth2/v2/auth?" + query };
  });
  app.get(
    "/v1/integrations/google/oauth/callback",
    { logLevel: "silent" },
    async (req, reply) => {
      const a = requirePermission(await getActor(req), "admin");
      if (!oauthAvailable(reply)) return;
      const q = z
        .object({
          state: z.string().max(200),
          code: z.string().max(4000).optional(),
          error: z.string().max(100).optional(),
        })
        .parse(req.query);
      const state = await pool.query(
        "DELETE FROM google_oauth_states WHERE state_hash=$1 AND organization_id=$2 AND user_id=$3 AND expires_at>now() RETURNING *",
        [hashToken(q.state), a.organization_id, a.id],
      );
      ensure(state.rowCount, "Autorización caducada o inválida.", 400);
      ensure(q.code && !q.error, "Google no autorizó el acceso.", 400);
      const token = await exchangeCode(q.code);
      await pool.query(
        "INSERT INTO google_connections(organization_id,encrypted_tokens) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET encrypted_tokens=$2,status='connected',updated_at=now()",
        [a.organization_id, encrypt(token)],
      );
      return reply.redirect(
        (process.env.FRONTEND_URL || "http://127.0.0.1:3000") +
          "/" +
          a.organization_slug +
          "?view=google",
      );
    },
  );
  post(
    "/v1/integrations/google/oauth/preview",
    z.object({ form_id: z.string().max(2000) }),
    "admin",
    async (b, a, reply) => {
      if (!oauthAvailable(reply)) return;
      const data = await readForm(a.organization_id, formId(b.form_id));
      return { ...data, rows: data.rows.slice(0, 10), total: data.rows.length };
    },
  );
  post(
    "/v1/integrations/google/oauth/connect",
    z.object({
      tournament_id: id,
      name: z.string().min(1).max(150),
      form_id: z.string().max(2000),
      mapping: mappingSchema,
    }),
    "admin",
    async (b, a, reply) => {
      if (!oauthAvailable(reply)) return;
      await validateMapping(b, a.organization_id);
      const fid = formId(b.form_id);
      await formsRequest(a.organization_id, `forms/${fid}`);
      const i = (
        await pool.query(
          `INSERT INTO registration_integrations(organization_id,tournament_id,provider,source_key,name,config,mapping) VALUES($1,$2,'google_forms_oauth',$3,$4,$5,$6) ON CONFLICT(organization_id,tournament_id,provider,source_key) DO UPDATE SET name=EXCLUDED.name,mapping_version=registration_integrations.mapping_version+CASE WHEN registration_integrations.mapping=EXCLUDED.mapping THEN 0 ELSE 1 END,mapping=EXCLUDED.mapping,enabled=true RETURNING *`,
          [
            a.organization_id,
            b.tournament_id,
            fid,
            b.name,
            JSON.stringify({ form_id: fid }),
            JSON.stringify(b.mapping),
          ],
        )
      ).rows[0];
      return { integration: i };
    },
  );
  post(
    "/v1/integrations/google/forms/create",
    z.object({
      job_id: id,
      tournament_id: id,
      category_id: id,
      title: z.string().trim().min(1).max(150),
    }),
    "admin",
    async (b, a, reply) => {
      if (!oauthAvailable(reply)) return;
      const t = await tournament(a.organization_id, b.tournament_id);
      const c = (
        await pool.query(
          "SELECT * FROM categories WHERE id=$1 AND tournament_id=$2 AND organization_id=$3",
          [b.category_id, t.id, a.organization_id],
        )
      ).rows[0];
      ensure(c, "Categoría inválida.", 400);
      const targets = registrationTargets(
        registrationSchema.parse(t.registration_schema),
        c.participant_count,
      ).filter((x) => !["category_id", "captain"].includes(x.key));
      const client = await pool.connect();
      let locked = false;
      try {
        locked = (
          await client.query(
            "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
            ["form-create:" + b.job_id],
          )
        ).rows[0].locked;
        ensure(locked, "El formulario ya se está creando.");
        const inserted = await client.query(
          "INSERT INTO google_form_jobs(id,organization_id,tournament_id,category_id,config) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
          [
            b.job_id,
            a.organization_id,
            t.id,
            c.id,
            JSON.stringify({ title: b.title, targets }),
          ],
        );
        let job = (
          await client.query(
            "SELECT * FROM google_form_jobs WHERE id=$1 AND organization_id=$2",
            [b.job_id, a.organization_id],
          )
        ).rows[0];
        ensure(job, "Operación no encontrada.", 404);
        ensure(
          job.tournament_id === b.tournament_id &&
            job.category_id === b.category_id &&
            job.config.title === b.title,
          "La clave de creación ya corresponde a otro formulario.",
        );
        if (job.status === "complete") {
          const existing = (
            await client.query(
              "SELECT * FROM registration_integrations WHERE organization_id=$1 AND tournament_id=$2 AND provider='google_forms_oauth' AND source_key=$3",
              [a.organization_id, t.id, job.form_id],
            )
          ).rows[0];
          ensure(
            existing,
            "No se encontró la integración del formulario creado.",
          );
          return {
            integration: existing,
            edit_url: `https://docs.google.com/forms/d/${job.form_id}/edit`,
          };
        }
        if (!job.form_id) {
          ensure(
            inserted.rowCount,
            "La creación anterior quedó indeterminada. Revisa Google y conecta el formulario existente antes de intentar otra creación.",
          );
          const form = await formsRequest(a.organization_id, "forms", {
            info: { title: b.title },
          });
          job.form_id = form.formId;
          await client.query(
            "UPDATE google_form_jobs SET form_id=$2,status='questions' WHERE id=$1",
            [b.job_id, form.formId],
          );
        }
        if (job.status !== "complete")
          await formsRequest(
            a.organization_id,
            `forms/${job.form_id}:setPublishSettings`,
            {
              publishSettings: {
                publishState: {
                  isPublished: false,
                  isAcceptingResponses: false,
                },
              },
            },
          );
        const actual = await formsRequest(
          a.organization_id,
          `forms/${job.form_id}`,
        );
        const savedTargets = job.config.targets;
        const requests = savedTargets
          .map((target: any, index: number) => ({
            createItem: {
              item: questionItem(target, index),
              location: { index },
            },
          }))
          .filter(
            (x: any) =>
              !(actual.items || []).some(
                (item: any) => item.itemId === x.createItem.item.itemId,
              ),
          );
        if (requests.length)
          await formsRequest(
            a.organization_id,
            `forms/${job.form_id}:batchUpdate`,
            {
              requests,
              writeControl: { requiredRevisionId: actual.revisionId },
            },
          );
        const mapping = mappingSchema.parse({
          category_id: c.id,
          columns: savedTargets.map((x: any, i: number) => ({
            id: (i + 1).toString(16).padStart(8, "0"),
            index: i,
            label: x.label,
          })),
          mappings: savedTargets.map((x: any, i: number) => ({
            source: (i + 1).toString(16).padStart(8, "0"),
            target: x.key,
          })),
        });
        const integration = (
          await client.query(
            `INSERT INTO registration_integrations(organization_id,tournament_id,provider,source_key,name,config,mapping) VALUES($1,$2,'google_forms_oauth',$3,$4,$5,$6) ON CONFLICT(organization_id,tournament_id,provider,source_key) DO UPDATE SET name=registration_integrations.name RETURNING *`,
            [
              a.organization_id,
              t.id,
              job.form_id,
              b.title,
              JSON.stringify({
                form_id: job.form_id,
                generated: true,
                category_id: c.id,
                targets: savedTargets,
              }),
              JSON.stringify(mapping),
            ],
          )
        ).rows[0];
        await client.query(
          "UPDATE google_form_jobs SET status='complete' WHERE id=$1",
          [b.job_id],
        );
        return {
          integration,
          edit_url: `https://docs.google.com/forms/d/${job.form_id}/edit`,
        };
      } finally {
        if (locked)
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
            "form-create:" + b.job_id,
          ]);
        client.release();
      }
    },
  );
  post(
    "/v1/integrations/google/forms/publish",
    z.object({ id, published: z.boolean() }),
    "admin",
    async (b, a, reply) => {
      if (!oauthAvailable(reply)) return;
      const i = await integration(a.organization_id, b.id);
      ensure(
        i.provider === "google_forms_oauth",
        "Esta fuente no es un formulario.",
      );
      await formsRequest(
        a.organization_id,
        `forms/${i.config.form_id}:setPublishSettings`,
        {
          publishSettings: {
            publishState: {
              isPublished: b.published,
              isAcceptingResponses: b.published,
            },
          },
        },
      );
      return { ok: true };
    },
  );
  post(
    "/v1/integrations/google/forms/update-preview",
    z.object({ id }),
    "admin",
    async (b, a, reply) => {
      if (!oauthAvailable(reply)) return;
      const i = await integration(a.organization_id, b.id);
      ensure(
        i.config.generated,
        "Solo se actualizan preguntas generadas por Torneum.",
      );
      const t = await tournament(a.organization_id, i.tournament_id);
      const c = (
        await pool.query(
          "SELECT * FROM categories WHERE id=$1 AND organization_id=$2",
          [i.config.category_id, a.organization_id],
        )
      ).rows[0];
      const targets = registrationTargets(
        registrationSchema.parse(t.registration_schema),
        c.participant_count,
      ).filter((x) => !["category_id", "captain"].includes(x.key));
      const form = await formsRequest(
        a.organization_id,
        `forms/${i.config.form_id}`,
      );
      return {
        revision: form.revisionId,
        schema_hash: fingerprint(targets),
        targets,
        current: form.items || [],
      };
    },
  );
  post(
    "/v1/integrations/google/forms/update",
    z.object({
      id,
      revision: z.string().min(1).max(500),
      schema_hash: z.string().length(64),
    }),
    "admin",
    async (b, a, reply) => {
      if (!oauthAvailable(reply)) return;
      const i = await integration(a.organization_id, b.id);
      ensure(
        i.config.generated,
        "Solo se actualizan formularios generados por Torneum.",
      );
      const t = await tournament(a.organization_id, i.tournament_id);
      const c = (
        await pool.query(
          "SELECT * FROM categories WHERE id=$1 AND organization_id=$2",
          [i.config.category_id, a.organization_id],
        )
      ).rows[0];
      const targets = registrationTargets(
        registrationSchema.parse(t.registration_schema),
        c.participant_count,
      ).filter((x) => !["category_id", "captain"].includes(x.key));
      const form = await formsRequest(
        a.organization_id,
        `forms/${i.config.form_id}`,
      );
      ensure(
        form.revisionId === b.revision,
        "El formulario cambió en Google. Vuelve a revisar.",
      );
      ensure(
        fingerprint(targets) === b.schema_hash,
        "Los campos de Torneum cambiaron. Vuelve a revisar.",
      );
      const saved: any[] = i.config.targets;
      const requests: any[] = [];
      const mapping = mappingSchema.parse(i.mapping);
      for (const target of targets) {
        let index = saved.findIndex((x) => x.key === target.key);
        if (index < 0) {
          index = saved.length;
          saved.push(target);
          const item = questionItem(target, index);
          const existingPosition = (form.items || []).findIndex(
            (x: any) => x.itemId === item.itemId,
          );
          if (existingPosition >= 0) {
            ensure(
              form.items[existingPosition].title === target.label,
              "Una pregunta externa ocupa el identificador esperado. Revisa Google antes de continuar.",
            );
            requests.push({
              updateItem: {
                item,
                location: { index: existingPosition },
                updateMask: "title,questionItem",
              },
            });
          } else
            requests.push({
              createItem: {
                item,
                location: {
                  index:
                    (form.items || []).length +
                    requests.filter((x) => x.createItem).length,
                },
              },
            });
          mapping.columns.push({
            id: item.questionItem.question.questionId,
            index,
            label: target.label,
          });
          mapping.mappings.push({
            source: item.questionItem.question.questionId,
            target: target.key,
            values: {},
            separator: ";",
          });
        } else {
          const item = questionItem(target, index);
          const position = (form.items || []).findIndex(
            (x: any) => x.itemId === item.itemId,
          );
          ensure(
            position >= 0,
            "Falta una pregunta administrada por Torneum. Revisa el formulario.",
          );
          requests.push({
            updateItem: {
              item,
              location: { index: position },
              updateMask: "title,questionItem",
            },
          });
          saved[index] = target;
        }
      }
      for (let index = 0; index < saved.length; index++)
        if (!targets.some((t) => t.key === saved[index].key)) {
          const questionId = (index + 1).toString(16).padStart(8, "0");
          const position = (form.items || []).findIndex(
            (x: any) => x.itemId === questionId,
          );
          if (position >= 0) {
            const item = structuredClone(form.items[position]);
            item.questionItem.question.required = false;
            requests.push({
              updateItem: {
                item,
                location: { index: position },
                updateMask: "questionItem.question.required",
              },
            });
          }
        }
      if (requests.length)
        await formsRequest(
          a.organization_id,
          `forms/${i.config.form_id}:batchUpdate`,
          { requests, writeControl: { requiredRevisionId: b.revision } },
        );
      await pool.query(
        "UPDATE registration_integrations SET config=$3,mapping=$4,mapping_version=mapping_version+1 WHERE id=$1 AND organization_id=$2",
        [
          i.id,
          a.organization_id,
          JSON.stringify({ ...i.config, targets: saved }),
          JSON.stringify(mapping),
        ],
      );
      return { ok: true };
    },
  );
}
