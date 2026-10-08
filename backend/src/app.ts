import Fastify, {
  type FastifyRequest,
  type FastifyReply,
  type FastifyInstance,
} from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import { z } from "zod";
import {registerAgentActions,type ApplicationRoute} from "./agents.js";
import sharp from "sharp";
import {
  pool,
  transaction,
  audit,
  ensure,
  DomainError,
  type Db,
} from "./db.js";
import {
  getActor,
  requirePermission,
  hashToken,
  newToken,
  verifyPassword,
  hashPassword,
  resolveOrg,
  type Actor,
} from "./auth.js";
import { getState } from "./state.js";
import {
  draw,
  bracket,
  reportResult,
  changeSchedule,
  autoSchedule,
} from "./competition.js";
import { sendVerification, encrypt } from "./integrations.js";
import { prospectScore, standings, resultsHash } from "./padel.js";
import {researchSponsors} from "./research.js";
import { registerRealtime } from "./realtime.js";
import { registerPaymentRoutes } from "./payment-routes.js";
import { registerPayment } from "./payments.js";
import { registerPlatform } from "./platform.js";
const id = z.string().uuid(),
  slug = z.string().trim().toLowerCase().min(1).max(60),
  short = z.string().trim().min(1).max(150),
  email = z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase());
const safeUrl = z.union([
  z.literal(""),
  z.url().refine((v) => v.startsWith("https://"), "Usa una URL HTTPS."),
]);
const players = z.array(z.object({ name: short })).length(2);
const score = z.object({
  sets: z
    .array(
      z.tuple([
        z.number().int().min(0).max(100),
        z.number().int().min(0).max(100),
      ]),
    )
    .max(5),
  reason: z.enum(["normal", "walkover", "retirement"]).optional(),
  winner: z.enum(["home", "away"]).optional(),
});
const rules = z.object({
  sets: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  games: z.number().int().min(4).max(6),
  superTiebreak: z.boolean(),
  goldenPoint: z.boolean(),
});
const front = () => process.env.FRONTEND_URL || "http://127.0.0.1:3000";
function setSession(reply: FastifyReply, token: string) {
  reply.setCookie("torneum_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 28800,
  });
}
export async function buildApp() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV !== "test"
        ? {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "res.headers.set-cookie",
            ],
          }
        : false,
    bodyLimit: 128 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(cookie);
  await app.register(cors, { origin: front(), credentials: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      info: { title: "Torneum API", version: "1.0.0" },
      servers: [{ url: "/" }],
    },
  });
  app.addHook("onRequest", async (req) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== front() &&
      req.url.split("?")[0] !== "/v1/webhooks/stripe"
    )
      throw new DomainError(403, "Origen no autorizado.");
  });
  app.setErrorHandler((error: any, req, reply) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : error.statusCode ||
          (["23505", "23503", "23514"].includes(error.code) ? 409 : 500);
    if (status >= 500)
      req.log.error({ err: error, requestId: req.id }, "Request failed");
    reply
      .code(status)
      .send({
        error: {
          code: status,
          message:
            status >= 500
              ? "El servicio no está disponible. Reintenta más tarde."
              : error instanceof z.ZodError
                ? error.issues.map((i) => i.message).join(". ")
                : status === 409 && error.code
                  ? "La operación entra en conflicto con los datos existentes."
                  : error.message,
          requestId: req.id,
        },
      });
  });
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: { type: "object", properties: { status: { type: "string" } } },
        },
      },
    },
    async () => {
      await pool.query("SELECT 1");
      return { status: "ok" };
    },
  );
  app.get(
    "/v1/session",
    {
      schema: {
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (req) => ({ actor: (await getActor(req)) || null }),
  );
  app.get(
    "/v1/state",
    {
      schema: {
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (req) => {
      const a = await getActor(req);
      ensure(a, "Inicia sesión para continuar.", 401);
      return getState(pool, a);
    },
  );
  app.get(
    "/v1/public/:slug",
    {
      schema: {
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (req) => {
      const p = z.object({ slug }).parse(req.params);
      return getState(pool, (await resolveOrg(pool, p.slug)).id);
    },
  );
  app.get('/v1/archive/:id',async req=>{const actor=await getActor(req);ensure(actor&&actor.role!=='participant','Se requiere una sesión de colaborador.',403);const params=z.object({id}).parse(req.params);return getState(pool,actor,params.id);});
  app.get("/v1/openapi", async () => app.swagger());
  type Handler<T> = (
    body: T,
    actor: Actor | undefined,
    db: Db,
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<unknown>;
  const actionRegistry=new Map<string,ApplicationRoute>();
  function post<T extends z.ZodType>(
    path: string,
    schema: T,
    permission: string | null,
    handler: Handler<z.infer<T>>,
  ) {
    actionRegistry.set(path,{schema,permission,handler});
    app.post(
      path,
      {
        config:{rateLimit:{max:path==='/v1/login'?10:path==='/v1/sponsors/research'?3:path==='/v1/registrations'?15:120,timeWindow:'1 minute'}},
        schema: {
          body: z.toJSONSchema(schema, { target: "draft-7", io: "input" }),
          response: { 200: { type: "object", additionalProperties: true } },
        },
      },
      async (req, reply) => {
        const body = schema.parse(req.body);
        const actor = await getActor(req);
        if (permission) requirePermission(actor, permission);
        return transaction(async (db) => {
          const key = req.headers["idempotency-key"];
          if (actor && key) {
            ensure(
              typeof key === "string" && key.length <= 100,
              "Clave de idempotencia inválida.",
              400,
            );
            await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
              actor.id + key,
            ]);
            const old = (
              await db.query(
                "SELECT * FROM idempotency_keys WHERE organization_id=$1 AND actor=$2 AND key=$3",
                [actor.organization_id, actor.id, key],
              )
            ).rows[0];
            const requestHash = hashToken(path + JSON.stringify(body));
            if (old) {
              ensure(
                old.request_hash === requestHash,
                "La clave ya se utilizó con otra operación.",
              );
              return old.response;
            }
            const response = await handler(body, actor, db, req, reply);
            await db.query(
              "INSERT INTO idempotency_keys(organization_id,actor,key,request_hash,response) VALUES($1,$2,$3,$4,$5)",
              [
                actor.organization_id,
                actor.id,
                key,
                requestHash,
                JSON.stringify(response),
              ],
            );
            return response;
          }
          return handler(body, actor, db, req, reply);
        });
      },
    );
  }
  post(
    "/v1/login",
    z.object({ slug, email, password: z.string().min(1).max(200) }),
    null,
    async (b, _a, db, req, reply) => {
      const org = await resolveOrg(db, b.slug);
      const u = (
        await db.query(
          "SELECT * FROM users WHERE organization_id=$1 AND lower(email)=lower($2) AND active=true",
          [org.id, b.email],
        )
      ).rows[0];
      const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
      ensure(
        verifyPassword(b.password, u?.password_hash || dummy) && u,
        "Correo o contraseña incorrectos.",
        401,
      );
      const token = newToken();
      await db.query(
        "INSERT INTO sessions(token_hash,organization_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
        [hashToken(token), u.organization_id, u.id],
      );
      setSession(reply, token);
      return { ok: true };
    },
  );
  post("/v1/logout", z.object({}), null, async (_b, _a, db, req, reply) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      hashToken(req.cookies.torneum_session || ""),
    ]);
    reply.clearCookie("torneum_session", { path: "/" });
    return { ok: true };
  });
  post(
    "/v1/registrations",
    z.object({
      slug,
      category_id: id,
      name: short,
      players: z.array(z.object({ name: short })).min(1).max(100),
      captain: z.number().int().min(0).max(99),
      email,
      phone: z.string().max(30).default(""),
    }),
    null,
    async (b, _a, db) => {
      const org = await resolveOrg(db, b.slug);
      const c = (
        await db.query(
          "SELECT c.*,t.registration_open FROM categories c JOIN tournaments t ON t.id=c.tournament_id WHERE c.id=$1 AND c.organization_id=$2 AND t.status<>'archived' FOR UPDATE OF c",
          [b.category_id, org.id],
        )
      ).rows[0];
      ensure(
        c && c.registration_open && !c.draw_published,
        "Inscripciones cerradas.",
      );
      ensure(
        b.players.length === c.participant_count && b.captain < b.players.length && new Set(b.players.map(p => p.name.toLowerCase())).size === b.players.length,
        "Revisa el número de participantes y sus nombres distintos.",
        400,
      );
      ensure((!c.registration_starts_at || new Date(c.registration_starts_at).getTime() <= Date.now()) && (!c.registration_ends_at || new Date(c.registration_ends_at).getTime() > Date.now()), "Inscripciones fuera de plazo.");
      if (c.payment_mode === 'stripe') {
        const account = (await db.query('SELECT 1 FROM tenant_payment_accounts WHERE organization_id=$1 AND connected AND charges_enabled', [org.id])).rowCount;
        ensure(account, "El organizador todavía no está habilitado para cobrar.");
      }
      const count = (
        await db.query(
          "SELECT count(*) FROM teams WHERE category_id=$1 AND status NOT IN ('rejected','withdrawn')",
          [c.id],
        )
      ).rows[0];
      ensure(Number(count.count) < c.capacity, "La categoría no tiene cupos.");
      ensure(
        process.env.SMTP_URL ||
          (process.env.DEV_MAILBOX === "true" &&
            process.env.NODE_ENV !== "production"),
        "El servicio de verificación no está configurado.",
        503,
      );
      const team = (
        await db.query(
          "INSERT INTO teams(organization_id,tournament_id,category_id,name,players,captain,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
          [
            c.organization_id,
            c.tournament_id,
            c.id,
            b.name,
            JSON.stringify(b.players),
            b.captain,
            b.email,
            b.phone,
          ],
        )
      ).rows[0];
      const registration = await registerPayment(db, c, team.id);
      const token = newToken();
      await db.query(
        "INSERT INTO verification_tokens VALUES($1,$2,$3,now()+interval '30 minutes',NULL)",
        [hashToken(token), c.organization_id, team.id],
      );
      const url = front() + "/" + org.slug + "/verificar#" + token;
      let development_link: string | undefined;
      if (
        process.env.DEV_MAILBOX === "true" &&
        process.env.NODE_ENV !== "production"
      )
        development_link = url;
      else await sendVerification(b.email, url);
      await audit(
        db,
        c.organization_id,
        team.id,
        "registration.create",
        team.id,
        null,
        { status: "verification" },
      );
      return { ok: true, development_link, registration_id: registration.id };
    },
  );
  post(
    "/v1/verify",
    z.object({ token: z.string().min(30).max(100) }),
    null,
    async (b, _a, db, _req, reply) => {
      const v = (
        await db.query(
          "SELECT v.*,t.tournament_id FROM verification_tokens v JOIN teams t ON t.id=v.team_id WHERE v.token_hash=$1 AND v.used_at IS NULL AND v.expires_at>now() FOR UPDATE OF v",
          [hashToken(b.token)],
        )
      ).rows[0];
      ensure(v, "Enlace inválido, utilizado o caducado.", 400);
      await db.query(
        "UPDATE verification_tokens SET used_at=now() WHERE token_hash=$1",
        [hashToken(b.token)],
      );
      await db.query(
        "UPDATE teams SET verified_at=now(),status=CASE WHEN status='verification' THEN CASE WHEN (SELECT auto_approve FROM tournaments WHERE id=$2) AND NOT EXISTS(SELECT 1 FROM tournament_registrations WHERE team_id=teams.id AND status<>'CONFIRMED') THEN 'approved' ELSE 'pending' END ELSE status END WHERE id=$1",
        [v.team_id, v.tournament_id],
      );
      const token = newToken();
      await db.query(
        "INSERT INTO sessions(token_hash,organization_id,team_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
        [hashToken(token), v.organization_id, v.team_id],
      );
      setSession(reply, token);
      return { ok: true };
    },
  );
  post("/v1/magic-link", z.object({ slug, email }), null, async (b, _a, db) => {
    const org = await resolveOrg(db, b.slug);
    const t = (
      await db.query(
        "SELECT team.* FROM teams team JOIN tournaments t ON t.id=team.tournament_id WHERE team.organization_id=$1 AND team.email=$2 AND t.status<>'archived'",
        [org.id, b.email],
      )
    ).rows[0];
    if (t && process.env.SMTP_URL) {
      const token = newToken();
      await db.query(
        "INSERT INTO verification_tokens VALUES($1,$2,$3,now()+interval '30 minutes',NULL)",
        [hashToken(token), t.organization_id, t.id],
      );
      await sendVerification(t.email, front() + "/" + org.slug + "/verificar#" + token);
    }
    return { ok: true };
  });
  app.get("/v1/my-team", async (req) => {
    const a = await getActor(req);
    ensure(a?.team_id, "Se requiere una sesión de capitán.", 401);
    const team = (
      await pool.query(
        "SELECT * FROM teams WHERE id=$1 AND organization_id=$2",
        [a.team_id, a.organization_id],
      )
    ).rows[0];
    const requests = (
      await pool.query(
        "SELECT * FROM change_requests WHERE team_id=$1 ORDER BY created_at DESC",
        [a.team_id],
      )
    ).rows;
    const matches=(await pool.query('SELECT * FROM matches WHERE (home_id=$1 OR away_id=$1) AND organization_id=$2 ORDER BY starts_at NULLS LAST',[a.team_id,a.organization_id])).rows;
    const registration = (await pool.query('SELECT r.*,p.status payment_status,p.refunded_cents FROM tournament_registrations r LEFT JOIN registration_payments p ON p.registration_id=r.id WHERE r.team_id=$1 AND r.organization_id=$2', [a.team_id,a.organization_id])).rows[0] || null;
    return { team, requests, matches, registration };
  });
  post(
    "/v1/registrations/review",
    z.object({
      id,
      status: z.enum(["approved", "rejected", "withdrawn"]),
      category_id: id.optional(),
      reason: short,
    }),
    "registrations",
    async (b, a, db) => {
      const t = (
        await db.query(
          "SELECT t.*,c.draw_published FROM teams t JOIN categories c ON c.id=t.category_id WHERE t.id=$1 AND t.organization_id=$2 FOR UPDATE OF t",
          [b.id, a!.organization_id],
        )
      ).rows[0];
      ensure(t, "Pareja no encontrada.", 404);
      ensure(t.verified_at, "El capitán debe verificar su correo.");
      ensure(!t.draw_published, "La etapa está bloqueada después del sorteo.");
      const c = (
        await db.query(
          "SELECT * FROM categories WHERE id=$1 AND tournament_id=$2 FOR UPDATE",
          [b.category_id || t.category_id, t.tournament_id],
        )
      ).rows[0];
      ensure(c && !c.draw_published, "Categoría no disponible.");
      const used = (
        await db.query(
          "SELECT count(*) FROM teams WHERE category_id=$1 AND id<>$2 AND status NOT IN ('rejected','withdrawn')",
          [c.id, t.id],
        )
      ).rows[0];
      ensure(
        b.status !== "approved" || Number(used.count) < c.capacity,
        "No hay cupo.",
      );
      await db.query("UPDATE teams SET status=$2,category_id=$3 WHERE id=$1", [
        b.id,
        b.status,
        c.id,
      ]);
      await audit(
        db,
        a!.organization_id,
        a!.id,
        "registration.review",
        b.id,
        { status: t.status, category_id: t.category_id },
        b,
      );
      return { ok: true };
    },
  );
  post(
    "/v1/categories",
    z.object({
      name: short,
      capacity: z.number().int().min(4).max(256),
      group_size: z.number().int().min(3).max(8),
      qualifiers: z.number().int().min(1).max(4),
      duration_minutes: z.number().int().min(15).max(240),
      rest_minutes: z.number().int().min(0).max(240),
      rules,
    }),
    "categories",
    async (b, a, db) => {
      ensure(
        b.qualifiers < b.group_size,
        "Clasificados debe ser menor que el tamaño del grupo.",
        400,
      );
      const t = await active(db, a!);
      const row = (
        await db.query(
          "INSERT INTO categories(organization_id,tournament_id,name,capacity,group_size,qualifiers,duration_minutes,rest_minutes,rules) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
          [
            a!.organization_id,
            t.id,
            b.name,
            b.capacity,
            b.group_size,
            b.qualifiers,
            b.duration_minutes,
            b.rest_minutes,
            JSON.stringify(b.rules),
          ],
        )
      ).rows[0];
      await audit(
        db,
        a!.organization_id,
        a!.id,
        "category.create",
        row.id,
        null,
        b,
      );
      return { ok: true };
    },
  );
  post('/v1/categories/update',z.object({id,name:short,capacity:z.number().int().min(4).max(256),group_size:z.number().int().min(3).max(8),qualifiers:z.number().int().min(1).max(4),duration_minutes:z.number().int().min(15).max(240),rest_minutes:z.number().int().min(0).max(240),rules}),'categories',async(b,a,db)=>{const c=(await db.query('SELECT * FROM categories WHERE id=$1 AND organization_id=$2 FOR UPDATE',[b.id,a!.organization_id])).rows[0];ensure(c&&!c.draw_published,'Las reglas están bloqueadas después del sorteo.');ensure(b.qualifiers<b.group_size,'Clasificados debe ser menor al grupo.',400);const count=(await db.query("SELECT count(*) FROM teams WHERE category_id=$1 AND status NOT IN ('rejected','withdrawn')",[c.id])).rows[0];ensure(Number(count.count)<=b.capacity,'El cupo no puede ser menor que las inscripciones existentes.');await db.query('UPDATE categories SET name=$2,capacity=$3,group_size=$4,qualifiers=$5,duration_minutes=$6,rest_minutes=$7,rules=$8 WHERE id=$1',[c.id,b.name,b.capacity,b.group_size,b.qualifiers,b.duration_minutes,b.rest_minutes,JSON.stringify(b.rules)]);await audit(db,a!.organization_id,a!.id,'category.update',c.id,c,b);return {ok:true};});
  post(
    "/v1/draw",
    z.object({ category_id: id, seed: short, publish: z.boolean() }),
    "categories",
    (b, a, db) => draw(db, a!, b.category_id, b.seed, b.publish),
  );
  post(
    "/v1/groups/tiebreak",
    z.object({
      group_id: id,
      team_order: z.array(id).min(2).max(8),
      reason: z.string().min(5).max(1000),
    }),
    "categories",
    async (b, a, db) => {
      const g = (
        await db.query(
          "SELECT g.* FROM groups g JOIN categories c ON c.id=g.category_id WHERE g.id=$1 AND g.organization_id=$2 FOR UPDATE OF c",
          [b.group_id, a!.organization_id],
        )
      ).rows[0];
      ensure(g, "Grupo no encontrado.", 404);
      ensure(
        !(
          await db.query(
            "SELECT 1 FROM matches WHERE category_id=$1 AND stage='knockout' LIMIT 1",
            [g.category_id],
          )
        ).rowCount,
        "El cuadro ya está generado.",
      );
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
        "Finaliza todos los encuentros del grupo.",
      );
      const table = standings(ids, matches);
      ensure(
        table.some((r) => r.tie),
        "No hay empates pendientes.",
      );
      ensure(
        b.team_order.length === ids.length &&
          new Set(b.team_order).size === ids.length &&
          b.team_order.every((id) => ids.includes(id)),
        "Incluye todas las parejas una vez.",
        400,
      );
      for (const [i, teamId] of b.team_order.entries()) {
        const old = table[i],
          next = table.find((r) => r.team_id === teamId)!;
        ensure(
          old.team_id === teamId ||
            (old.tie &&
              next.tie &&
              old.points === next.points &&
              old.sets_for - old.sets_against ===
                next.sets_for - next.sets_against &&
              old.games_for - old.games_against ===
                next.games_for - next.games_against),
          "Solo puedes reordenar parejas empatadas.",
        );
      }
      await db.query(
        "INSERT INTO manual_tiebreaks(organization_id,group_id,team_order,results_hash,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(group_id) DO UPDATE SET team_order=$3,results_hash=$4,reason=$5,actor_id=$6,created_at=now()",
        [
          a!.organization_id,
          g.id,
          b.team_order,
          resultsHash(matches),
          b.reason,
          a!.id,
        ],
      );
      await audit(
        db,
        a!.organization_id,
        a!.id,
        "group.tiebreak",
        g.id,
        table.map((r) => r.team_id),
        b,
      );
      return { ok: true };
    },
  );
  post("/v1/bracket", z.object({ category_id: id }), "categories", (b, a, db) =>
    bracket(db, a!, b.category_id),
  );
  post(
    "/v1/results",
    z.object({ id, score, confirmed: z.boolean() }),
    null,
    (b, a, db) => {
      ensure(a, "Inicia sesión.", 401);
      if (a.role !== "participant") requirePermission(a, "results");
      return reportResult(db, a, b.id, b.score, b.confirmed);
    },
  );
  post("/v1/matches/start", z.object({ id }), "results", async (b, a, db) => {
    const r = await db.query(
      "UPDATE matches SET status='live',real_started_at=now() WHERE id=$1 AND organization_id=$2 AND status='scheduled' RETURNING id",
      [b.id, a!.organization_id],
    );
    ensure(r.rowCount, "El partido debe estar programado.");
    await audit(db, a!.organization_id, a!.id, "match.start", b.id, null, null);
    return { ok: true };
  });
  post(
    "/v1/schedule",
    z.object({
      tournament_id: id,
      changes: z
        .array(
          z.object({
            id,
            court_id: id.nullable(),
            starts_at: z.iso.datetime({ offset: true }).nullable(),
          }),
        )
        .min(1)
        .max(1000),
      preview: z.boolean().default(false),
    }),
    "schedule",
    (b, a, db) => changeSchedule(db, a!, b.tournament_id, b.changes, b.preview),
  );
  post(
    "/v1/schedule/auto",
    z.object({ tournament_id: id, publish: z.boolean() }),
    "schedule",
    (b, a, db) => autoSchedule(db, a!, b.tournament_id, b.publish),
  );
  post(
    "/v1/schedule/undo",
    z.object({ tournament_id: id }),
    "schedule",
    async (b, a, db) => {
      await db.query(
        "SELECT id FROM tournaments WHERE id=$1 AND organization_id=$2 FOR UPDATE",
        [b.tournament_id, a!.organization_id],
      );
      const h = (
        await db.query(
          "SELECT * FROM schedule_history WHERE tournament_id=$1 AND organization_id=$2 AND undone=false ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
          [b.tournament_id, a!.organization_id],
        )
      ).rows[0];
      ensure(h, "No hay operaciones que deshacer.");
      const changed = h.before_value.filter((m: any) => {
        const after = h.after_value.find((x: any) => x.id === m.id);
        return JSON.stringify(m) !== JSON.stringify(after);
      });
      await changeSchedule(
        db,
        a!,
        b.tournament_id,
        changed.map((m: any) => ({
          id: m.id,
          court_id: m.court_id,
          starts_at: m.starts_at,
        })),
        true,
      );
      for (const m of changed)
        await db.query(
          "UPDATE matches SET court_id=$2,starts_at=$3,ends_at=$4,status=$5 WHERE id=$1",
          [m.id, m.court_id, m.starts_at, m.ends_at, m.status],
        );
      await db.query("UPDATE schedule_history SET undone=true WHERE id=$1", [
        h.id,
      ]);
      await audit(
        db,
        a!.organization_id,
        a!.id,
        "schedule.undo",
        h.id,
        h.after_value,
        h.before_value,
      );
      return { ok: true };
    },
  );
  post(
    "/v1/courts",
    z.object({
      name: short,
      opens_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closes_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
    "courts",
    async (b, a, db) => {
      ensure(b.closes_at > b.opens_at, "Horario de cancha inválido.", 400);
      const t = await active(db, a!);
      const c = (
        await db.query(
          "INSERT INTO courts(organization_id,tournament_id,name,opens_at,closes_at) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [a!.organization_id, t.id, b.name, b.opens_at, b.closes_at],
        )
      ).rows[0];
      await audit(db, a!.organization_id, a!.id, "court.create", c.id, null, b);
      return { ok: true };
    },
  );
  post(
    "/v1/requests",
    z.object({
      kind: z.enum(["category", "withdrawal", "description"]),
      after_value: z.object({
        category_id: id.optional(),
        description: z.string().max(500).optional(),
      }),
      reason: z.string().min(5).max(1000),
    }),
    "own",
    async (b, a, db) => {
      const team = (
        await db.query("SELECT * FROM teams WHERE id=$1", [a!.team_id])
      ).rows[0];
      ensure(
        b.kind !== "category" || b.after_value.category_id,
        "Selecciona la categoría.",
        400,
      );
      await db.query(
        "INSERT INTO change_requests(organization_id,team_id,kind,before_value,after_value,reason) VALUES($1,$2,$3,$4,$5,$6)",
        [
          a!.organization_id,
          a!.team_id,
          b.kind,
          JSON.stringify({
            category_id: team.category_id,
            status: team.status,
            description: team.description,
          }),
          JSON.stringify(b.after_value),
          b.reason,
        ],
      );
      return { ok: true };
    },
  );
  post(
    "/v1/requests/review",
    z.object({ id, approve: z.boolean() }),
    "requests",
    async (b, a, db) => {
      const r = (
        await db.query(
          "SELECT * FROM change_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [b.id, a!.organization_id],
        )
      ).rows[0];
      ensure(
        r && r.status === "pending",
        "Solicitud ya resuelta o inexistente.",
      );
      if (b.approve) {
        const t = (
          await db.query(
            "SELECT t.*,c.draw_published FROM teams t JOIN categories c ON c.id=t.category_id WHERE t.id=$1 FOR UPDATE OF t",
            [r.team_id],
          )
        ).rows[0];
        ensure(
          !t.draw_published || r.kind === "description",
          "La categoría está bloqueada.",
        );
        ensure(
          t.category_id === r.before_value.category_id &&
            t.status === r.before_value.status,
          "La pareja cambió; revisa una nueva solicitud.",
        );
        if (r.kind === "category") {
          const c = (
            await db.query(
              "SELECT * FROM categories WHERE id=$1 AND tournament_id=$2 FOR UPDATE",
              [r.after_value.category_id, t.tournament_id],
            )
          ).rows[0];
          ensure(c && !c.draw_published, "Categoría no disponible.");
          const n = (
            await db.query(
              "SELECT count(*) FROM teams WHERE category_id=$1 AND status NOT IN ('rejected','withdrawn')",
              [c.id],
            )
          ).rows[0];
          ensure(Number(n.count) < c.capacity, "No hay cupos.");
          await db.query("UPDATE teams SET category_id=$2 WHERE id=$1", [
            t.id,
            c.id,
          ]);
        } else if (r.kind === "withdrawal")
          await db.query("UPDATE teams SET status='withdrawn' WHERE id=$1", [
            t.id,
          ]);
        else
          await db.query("UPDATE teams SET description=$2 WHERE id=$1", [
            t.id,
            r.after_value.description || "",
          ]);
      }
      await db.query(
        "UPDATE change_requests SET status=$2,resolved_by=$3 WHERE id=$1",
        [b.id, b.approve ? "applied" : "rejected", a!.id],
      );
      await audit(db, a!.organization_id, a!.id, "request.review", b.id, r, b);
      return { ok: true };
    },
  );
  post(
    "/v1/settings",
    z.object({
      name: short,
      venue: short,
      starts_on: z.iso.date(),
      ends_on: z.iso.date(),
      auto_approve: z.boolean(),
      registration_open: z.boolean(),
    }),
    "admin",
    async (b, a, db) => {
      ensure(b.ends_on >= b.starts_on, "Fechas inválidas.", 400);
      const t = await active(db, a!);
      const scheduled = await db.query(
        "SELECT 1 FROM matches WHERE tournament_id=$1 AND starts_at IS NOT NULL LIMIT 1",
        [t.id],
      );
      const oldStart = t.starts_on.toLocaleDateString("sv-SE"),
        oldEnd = t.ends_on.toLocaleDateString("sv-SE");
      ensure(
        !scheduled.rowCount ||
          (b.starts_on === oldStart && b.ends_on === oldEnd),
        "Desprograma los partidos antes de cambiar las fechas.",
      );
      await db.query(
        "UPDATE tournaments SET name=$2,venue=$3,starts_on=$4,ends_on=$5,auto_approve=$6,registration_open=$7 WHERE id=$1",
        [
          t.id,
          b.name,
          b.venue,
          b.starts_on,
          b.ends_on,
          b.auto_approve,
          b.registration_open,
        ],
      );
      await audit(
        db,
        a!.organization_id,
        a!.id,
        "tournament.update",
        t.id,
        t,
        b,
      );
      return { ok: true };
    },
  );
  post(
    "/v1/tournaments/new",
    z.object({
      name: short,
      venue: short,
      starts_on: z.iso.date(),
      ends_on: z.iso.date(),
      archive_current: z.literal(true),
    }),
    "admin",
    async (b, a, db) => {
      ensure(b.ends_on >= b.starts_on, "Fechas inválidas.", 400);
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        a!.organization_id,
      ]);
      const current = await active(db, a!);
      const unfinished = await db.query(
        "SELECT 1 FROM matches WHERE tournament_id=$1 AND status<>'finished' LIMIT 1",
        [current.id],
      );
      ensure(!unfinished.rowCount, "Hay partidos sin finalizar.");
      await db.query(
        "UPDATE tournaments SET status='archived',registration_open=false WHERE id=$1",
        [current.id],
      );
      const t = (
        await db.query(
          "INSERT INTO tournaments(organization_id,name,venue,starts_on,ends_on) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [a!.organization_id, b.name, b.venue, b.starts_on, b.ends_on],
        )
      ).rows[0];
      await audit(
        db,
        a!.organization_id,
        a!.id,
        "tournament.archive",
        current.id,
        null,
        { next: t.id },
      );
      return { ok: true };
    },
  );
  post(
    "/v1/users",
    z.object({
      name: short,
      email,
      password: z.string().min(12).max(128),
      role: z.enum([
        "admin",
        "registration",
        "scheduling",
        "referee",
        "viewer",
      ]),
    }),
    "admin",
    async (b, a, db) => {
      ensure(
        !(
          await db.query(
            "SELECT 1 FROM users WHERE organization_id=$1 AND lower(email)=lower($2)",
            [a!.organization_id, b.email],
          )
        ).rowCount,
        "Ya existe un usuario con ese correo.",
        409,
      );
      const u = (
        await db.query(
          "INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [
            a!.organization_id,
            b.name,
            b.email,
            hashPassword(b.password),
            b.role,
          ],
        )
      ).rows[0];
      await audit(db, a!.organization_id, a!.id, "user.create", u.id, null, {
        name: b.name,
        role: b.role,
      });
      return { ok: true };
    },
  );
  post(
    "/v1/users/access",
    z.object({ id, active: z.boolean() }),
    "admin",
    async (b, a, db) => {
      ensure(b.id !== a!.id, "No puedes desactivar tu propia sesión.");
      const r = await db.query(
        "UPDATE users SET active=$3 WHERE id=$1 AND organization_id=$2",
        [b.id, a!.organization_id, b.active],
      );
      ensure(r.rowCount, "Usuario no encontrado.", 404);
      if (!b.active)
        await db.query("DELETE FROM sessions WHERE user_id=$1 AND organization_id=$2",
          [b.id, a!.organization_id],
        );
      await audit(db, a!.organization_id, a!.id, "user.access", b.id, null, {
        active: b.active,
      });
      return { ok: true };
    },
  );
  await registerCommercial(post, app);
  app.post('/v1/images',{bodyLimit:3*1024*1024,config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req)=>{const a=await getActor(req);ensure(a&&(a.role==='admin'||a.role==='participant'),'Sesión requerida.',403);const body=z.object({data:z.string().max(2800000),team_id:id.optional()}).parse(req.body);const teamId=a.team_id||body.team_id;ensure(teamId,'Selecciona una pareja.',400);const bytes=Buffer.from(body.data,'base64');ensure(bytes.length<=2*1024*1024,'La imagen supera 2 MB.',400);let image:Buffer;try{const source=sharp(bytes,{limitInputPixels:16000000});const meta=await source.metadata();ensure(['png','jpeg','webp'].includes(meta.format||''),'Solo se admiten PNG, JPEG o WebP.',400);image=await source.rotate().resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();}catch{throw new DomainError(400,'Imagen inválida o demasiado grande.');}return transaction(async db=>{const team=(await db.query('SELECT id FROM teams WHERE id=$1 AND organization_id=$2 FOR UPDATE',[teamId,a.organization_id])).rows[0];ensure(team,'Pareja no encontrada.',404);const stored=(await db.query('INSERT INTO images(organization_id,team_id,content) VALUES($1,$2,$3) RETURNING id',[a.organization_id,team.id,image])).rows[0];await db.query('UPDATE teams SET image_id=$2 WHERE id=$1',[team.id,stored.id]);await audit(db,a.organization_id,a.id,'team.image',team.id,null,{image_id:stored.id});return {image_id:stored.id};});});
  app.get('/v1/images/:id',async(req,reply)=>{const params=z.object({id}).parse(req.params);const image=(await pool.query("SELECT i.content,i.mime_type FROM images i JOIN teams t ON t.id=i.team_id WHERE i.id=$1 AND t.status='approved'",[params.id])).rows[0];ensure(image,'Imagen no disponible.',404);return reply.type(image.mime_type).header('Cache-Control','public, max-age=3600').send(image.content);});
  post('/v1/my-team/profile',z.object({description:z.string().max(500),notifications:z.boolean()}),'own',async(b,a,db)=>{await db.query('UPDATE teams SET description=$2,notifications=$3 WHERE id=$1 AND organization_id=$4',[a!.team_id,b.description,b.notifications,a!.organization_id]);await audit(db,a!.organization_id,a!.id,'team.profile',a!.team_id!,null,b);return {ok:true};});
  registerAgentActions(post,actionRegistry);
  registerRealtime(app);
  registerPlatform(app);
  await registerPaymentRoutes(app);
  return app;
}
async function active(db: Db, a: Actor) {
  const t = (
    await db.query(
      "SELECT * FROM tournaments WHERE organization_id=$1 AND status<>'archived' FOR UPDATE",
      [a.organization_id],
    )
  ).rows[0];
  ensure(t, "No hay torneo activo.", 404);
  return t;
}
type Post = <T extends z.ZodType>(
  path: string,
  schema: T,
  permission: string | null,
  handler: (
    body: z.infer<T>,
    actor: Actor | undefined,
    db: Db,
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<unknown>,
) => void;
async function registerCommercial(post: Post, app: FastifyInstance) {
  post('/v1/sponsors/research',z.object({city:short,audience:z.string().min(10).max(1000)}),'admin',async(b,a,db)=>{const result=await researchSponsors(b.city,b.audience);await audit(db,a!.organization_id,a!.id,'sponsors.research',null,null,{city:b.city,count:result.prospects.length});return result;});
  post(
    "/v1/levels",
    z.object({
      name: short,
      amount: z.number().min(0),
      benefits: z.string().max(2000),
      zones: z.array(z.enum(["portal", "calendar", "bracket"])).min(1),
      priority: z.number().int().min(1).max(20),
      logo_size: z.number().int().min(40).max(400),
    }),
    "admin",
    async (b, a, db) => {
      const t = await active(db, a!);
      await db.query(
        "INSERT INTO sponsor_levels(organization_id,tournament_id,name,amount,benefits,zones,priority,logo_size) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          a!.organization_id,
          t.id,
          b.name,
          b.amount,
          b.benefits,
          b.zones,
          b.priority,
          b.logo_size,
        ],
      );
      return { ok: true };
    },
  );
  const sponsorInput = z.object({
    id: id.optional(),
    name: short,
    website: safeUrl,
    email: z.union([email, z.literal("")]),
    phone: z.string().max(30),
    logo_url: safeUrl,
    level_id: id.nullable(),
    status: z.enum([
      "prospect",
      "reviewed",
      "negotiation",
      "won",
      "lost",
      "excluded",
    ]),
    notes: z.string().max(5000),
    evidence: z
      .array(
        z.object({
          url: z.url().refine((v) => v.startsWith("https://")),
          note: z.string().min(5).max(1000),
          date: z.iso.date(),
          confidence: z.enum(["high", "medium", "low"]),
        }),
      )
      .max(30),
    factors: z.object({
      local: z.boolean(),
      sport: z.boolean(),
      previous: z.boolean(),
      contact: z.boolean(),
      recent: z.boolean(),
    }),
  });
  post("/v1/sponsors", sponsorInput, "admin", async (b, a, db) => {
    const t = await active(db, a!);
    if (b.level_id)
      ensure(
        (
          await db.query(
            "SELECT 1 FROM sponsor_levels WHERE id=$1 AND tournament_id=$2",
            [b.level_id, t.id],
          )
        ).rowCount,
        "Nivel inválido.",
        400,
      );
    ensure(
      !b.factors.previous || b.evidence.length,
      "Incluye evidencia del patrocinio previo.",
      400,
    );
    const affinity = prospectScore(b.factors).score;
    let sponsorId = b.id;
    if (sponsorId) {
      const old = (
        await db.query(
          "SELECT * FROM sponsors WHERE id=$1 AND tournament_id=$2 FOR UPDATE",
          [sponsorId, t.id],
        )
      ).rows[0];
      ensure(old, "Patrocinador no encontrado.", 404);
      await db.query(
        "UPDATE sponsors SET name=$2,website=$3,email=$4,phone=$5,logo_url=$6,level_id=$7,status=$8,notes=$9,evidence=$10,affinity=$11 WHERE id=$1",
        [
          sponsorId,
          b.name,
          b.website,
          b.email,
          b.phone,
          b.logo_url,
          b.level_id,
          b.status,
          b.notes,
          JSON.stringify(b.evidence),
          affinity,
        ],
      );
    } else {
      sponsorId = (
        await db.query(
          "INSERT INTO sponsors(organization_id,tournament_id,name,website,email,phone,logo_url,level_id,status,notes,evidence,affinity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
          [
            a!.organization_id,
            t.id,
            b.name,
            b.website,
            b.email,
            b.phone,
            b.logo_url,
            b.level_id,
            b.status,
            b.notes,
            JSON.stringify(b.evidence),
            affinity,
          ],
        )
      ).rows[0].id;
    }
    if (b.status === "excluded")
      await db.query(
        "UPDATE messages SET status='cancelled' WHERE sponsor_id=$1 AND status IN ('draft','approved','queued','failed')",
        [sponsorId],
      );
    await audit(
      db,
      a!.organization_id,
      a!.id,
      "sponsor.save",
      sponsorId!,
      null,
      { name: b.name, status: b.status, affinity },
    );
    return { ok: true, id: sponsorId };
  });
  post(
    "/v1/messages",
    z.object({
      sponsor_id: id,
      subject: short,
      body: z.string().min(10).max(10000),
      channel: z.enum(["manual", "gmail"]),
    }),
    "admin",
    async (b, a, db) => {
      const s = (
        await db.query(
          "SELECT * FROM sponsors WHERE id=$1 AND organization_id=$2",
          [b.sponsor_id, a!.organization_id],
        )
      ).rows[0];
      ensure(s && s.status !== "excluded", "Contacto no disponible.");
      ensure(s.email, "Falta correo empresarial.");
      await db.query(
        "INSERT INTO messages(organization_id,sponsor_id,subject,body,channel) VALUES($1,$2,$3,$4,$5)",
        [a!.organization_id, s.id, b.subject, b.body, b.channel],
      );
      await audit(db, a!.organization_id, a!.id, "message.draft", s.id, null, {
        subject: b.subject,
      });
      return { ok: true };
    },
  );
  post(
    "/v1/messages/approve",
    z.object({ ids: z.array(id).min(1).max(100), confirmed: z.literal(true) }),
    "admin",
    async (b, a, db) => {
      for (const messageId of [...new Set(b.ids)]) {
        const m = (
          await db.query(
            "SELECT m.*,s.status sponsor_status FROM messages m JOIN sponsors s ON s.id=m.sponsor_id WHERE m.id=$1 AND m.organization_id=$2 FOR UPDATE OF m",
            [messageId, a!.organization_id],
          )
        ).rows[0];
        ensure(
          m && m.status === "draft" && m.sponsor_status !== "excluded",
          "El mensaje no puede aprobarse.",
        );
        await db.query(
          "UPDATE messages SET status='approved',approved_by=$2,approved_at=now() WHERE id=$1",
          [messageId, a!.id],
        );
        await audit(
          db,
          a!.organization_id,
          a!.id,
          "message.approve",
          messageId,
          null,
          { status: "approved" },
        );
      }
      return { ok: true };
    },
  );
  post(
    "/v1/messages/queue",
    z.object({ ids: z.array(id).min(1).max(100), confirmed: z.literal(true) }),
    "admin",
    async (b, a, db) => {
      ensure(
        (
          await db.query(
            "SELECT 1 FROM oauth_connections WHERE organization_id=$1",
            [a!.organization_id],
          )
        ).rowCount,
        "Conecta Gmail antes de enviar.",
        503,
      );
      for (const messageId of [...new Set(b.ids)]) {
        const m = (
          await db.query(
            "SELECT m.*,s.status sponsor_status FROM messages m JOIN sponsors s ON s.id=m.sponsor_id WHERE m.id=$1 AND m.organization_id=$2 FOR UPDATE OF m",
            [messageId, a!.organization_id],
          )
        ).rows[0];
        ensure(
          m &&
            m.status === "approved" &&
            m.channel === "gmail" &&
            m.sponsor_status !== "excluded",
          "Mensaje sin aprobación o canal incorrecto.",
        );
        await db.query("UPDATE messages SET status='queued' WHERE id=$1", [
          m.id,
        ]);
        await audit(
          db,
          a!.organization_id,
          a!.id,
          "message.queue",
          m.id,
          null,
          { status: "queued" },
        );
      }
      return { ok: true };
    },
  );
  post("/v1/messages/cancel", z.object({ id }), "admin", async (b, a, db) => {
    const r = await db.query(
      "UPDATE messages SET status='cancelled' WHERE id=$1 AND organization_id=$2 AND status IN ('draft','approved','queued','failed') RETURNING id",
      [b.id, a!.organization_id],
    );
    ensure(r.rowCount, "Este mensaje ya no puede cancelarse.");
    await audit(
      db,
      a!.organization_id,
      a!.id,
      "message.cancel",
      b.id,
      null,
      null,
    );
    return { ok: true };
  });
  post("/v1/gmail/connect", z.object({}), "admin", async (_b, a, db) => {
    ensure(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI &&
        process.env.OAUTH_ENCRYPTION_KEY,
      "Gmail OAuth no está configurado.",
      503,
    );
    const state = newToken();
    await db.query(
      "INSERT INTO oauth_states VALUES($1,$2,$3,now()+interval '10 minutes')",
      [hashToken(state), a!.organization_id, a!.id],
    );
    const query = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.send",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { url: "https://accounts.google.com/o/oauth2/v2/auth?" + query };
  });
  app.get("/v1/gmail/callback", async (req, reply) => {
    const a = requirePermission(await getActor(req), "admin");
    const q = z
      .object({ state: short, code: z.string().min(1).max(2000) })
      .parse(req.query);
    await transaction(async (db) => {
      const state = (
        await db.query(
          "DELETE FROM oauth_states WHERE state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING *",
          [hashToken(q.state), a.id],
        )
      ).rows[0];
      ensure(state, "Estado OAuth inválido.", 400);
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
          code: q.code,
          grant_type: "authorization_code",
        }),
      });
      ensure(response.ok, "No se pudo conectar Gmail.", 502);
      const tokens = (await response.json()) as any;
      ensure(
        tokens.refresh_token,
        "Gmail no concedió acceso persistente.",
        400,
      );
      tokens.expires_at = Date.now() + tokens.expires_in * 1000;
      await db.query(
        "INSERT INTO oauth_connections VALUES($1,$2,now()) ON CONFLICT(organization_id) DO UPDATE SET encrypted_tokens=$2,updated_at=now()",
        [a.organization_id, encrypt(tokens)],
      );
      await audit(db, a.organization_id, a.id, "gmail.connect", null, null, {
        connected: true,
      });
    });
    const o = (
      await pool.query("SELECT slug FROM organizations WHERE id=$1", [
        a.organization_id,
      ])
    ).rows[0];
    return reply.redirect(front() + "/" + o.slug + "?view=patrocinadores");
  });
  post(
    "/v1/chatkit/session",
    z.object({ agent: z.enum(["public", "admin", "sponsors"]), slug: slug.optional() }),
    null,
    async (b, a, db) => {
      const guestOrg = !a && b.agent === "public" && b.slug ? (await resolveOrg(db, b.slug)).id : undefined;
      if (b.agent === "admin")
        ensure(
          a && a.role !== "participant",
          "Sesión administrativa requerida.",
          403,
        );
      if (b.agent === "sponsors") requirePermission(a, "admin");
      const workflow =
        process.env[`CHATKIT_${b.agent.toUpperCase()}_WORKFLOW_ID`];
      ensure(
        process.env.OPENAI_API_KEY && workflow,
        "Este asistente aún no está configurado.",
        503,
      );
      const response = await fetch(
        "https://api.openai.com/v1/chatkit/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "chatkit_beta=v1",
          },
          body: JSON.stringify({
            workflow: { id: workflow },
            user: a
              ? `${b.agent}:${a.organization_id}:${a.id}`
              : `public:${guestOrg || ""}:${newToken()}`,
          }),
        },
      );
      ensure(response.ok, "No se pudo iniciar el asistente.", 502);
      const session = (await response.json()) as { client_secret: string };
      return { client_secret: session.client_secret };
    },
  );
  // Tools reuse session identity and application services. A workflow cannot supply its own role or actor.
  post(
    "/v1/agent/tools",
    z.object({
      agent: z.enum(["public", "admin", "sponsors"]),
      tool: z.enum(["public_state", "operational_state", "sponsor_state"]),
      slug: slug.optional(),
    }),
    null,
    async (b, a, db) => {
      if (b.tool === "public_state") {
        if (a) return getState(db, a.organization_id);
        ensure(b.slug, "Indica el club.", 400);
        return getState(db, (await resolveOrg(db, b.slug)).id);
      }
      ensure(
        b.agent !== "public",
        "El agente público no puede usar herramientas internas.",
        403,
      );
      if (b.tool === "sponsor_state") requirePermission(a, "admin");
      else
        ensure(
          a && a.role !== "participant",
          "Sesión administrativa requerida.",
          403,
        );
      await audit(db, a!.organization_id, a!.id, "agent.tool", null, null, {
        agent: b.agent,
        tool: b.tool,
      });
      return getState(db, a!);
    },
  );
}
