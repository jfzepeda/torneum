import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getActor, requirePermission } from "./auth.js";
import { pool, transaction, ensure, audit } from "./db.js";
import {
  stripeClient,
  createCheckout,
  processPaymentEvent,
  confirmRegistration,
} from "./payments.js";
const front = () => process.env.FRONTEND_URL || "http://127.0.0.1:3000";
const param = z.object({ id: z.uuid() });
export async function registerPaymentRoutes(app: FastifyInstance) {
  app.get("/v1/stripe/status", async (req) => {
    const a = requirePermission(await getActor(req), "settings");
    const saved = (
      await pool.query(
        "SELECT * FROM tenant_payment_accounts WHERE organization_id=$1",
        [a.organization_id],
      )
    ).rows[0];
    if (!saved?.stripe_account_id || !saved.connected)
      return { connected: false, configured: !!process.env.STRIPE_SECRET_KEY };
    const account = await stripeClient().accounts.retrieve(
      saved.stripe_account_id,
    );
    await pool.query(
      "UPDATE tenant_payment_accounts SET charges_enabled=$2,payouts_enabled=$3,details_submitted=$4 WHERE organization_id=$1",
      [
        a.organization_id,
        account.charges_enabled,
        account.payouts_enabled,
        account.details_submitted,
      ],
    );
    return {
      connected: true,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      dashboard_url: "https://dashboard.stripe.com",
      requirements: account.requirements?.currently_due || [],
    };
  });
  app.post("/v1/stripe/connect", async (req) => {
    const a = requirePermission(await getActor(req), "settings");
    const client = stripeClient();
    await transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        a.organization_id,
      ]);
      await db.query(
        "INSERT INTO tenant_payment_accounts(organization_id) VALUES($1) ON CONFLICT DO NOTHING",
        [a.organization_id],
      );
      await db.query(
        "UPDATE tenant_payment_accounts SET stripe_account_id=NULL,connected=true,generation=gen_random_uuid() WHERE organization_id=$1 AND NOT connected",
        [a.organization_id],
      );
    });
    const accountId = await transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        a.organization_id,
      ]);
      await db.query(
        "INSERT INTO tenant_payment_accounts(organization_id) VALUES($1) ON CONFLICT DO NOTHING",
        [a.organization_id],
      );
      const saved = (
        await db.query(
          "SELECT * FROM tenant_payment_accounts WHERE organization_id=$1",
          [a.organization_id],
        )
      ).rows[0];
      ensure(
        saved.connected,
        "La cuenta fue desconectada. Contacta al soporte para volver a vincularla.",
      );
      if (saved.stripe_account_id) return saved.stripe_account_id;
      const account = await client.accounts.create(
        {
          type: "standard",
          country: "MX",
          metadata: { organization_id: a.organization_id },
        },
        { idempotencyKey: `org-${a.organization_id}-${saved.generation}` },
      );
      await db.query(
        "UPDATE tenant_payment_accounts SET stripe_account_id=$2 WHERE organization_id=$1",
        [a.organization_id, account.id],
      );
      return account.id;
    });
    const org = (
      await pool.query("SELECT slug FROM organizations WHERE id=$1", [
        a.organization_id,
      ])
    ).rows[0];
    const url = `${front()}/${org.slug}?stripe=return`;
    const link = await client.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: url,
      refresh_url: url,
    });
    return { url: link.url };
  });
  app.post("/v1/stripe/disconnect", async (req) => {
    const a = requirePermission(await getActor(req), "settings");
    ensure(
      process.env.STRIPE_CONNECT_CLIENT_ID,
      "Falta STRIPE_CONNECT_CLIENT_ID.",
      503,
    );
    await transaction(async (db) => {
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        a.organization_id,
      ]);
      const saved = (
        await db.query(
          "SELECT * FROM tenant_payment_accounts WHERE organization_id=$1 AND connected FOR UPDATE",
          [a.organization_id],
        )
      ).rows[0];
      ensure(saved?.stripe_account_id, "Stripe no está conectado.");
      const pending = (
        await db.query(
          "SELECT 1 FROM tournament_registrations WHERE organization_id=$1 AND status='PENDING_PAYMENT' LIMIT 1",
          [a.organization_id],
        )
      ).rowCount;
      ensure(
        !pending,
        "Espera a que se resuelvan las reservas pendientes antes de desconectar.",
      );
      await stripeClient().oauth.deauthorize({
        client_id: process.env.STRIPE_CONNECT_CLIENT_ID!,
        stripe_user_id: saved.stripe_account_id,
      });
      await db.query(
        "UPDATE tenant_payment_accounts SET connected=false,charges_enabled=false WHERE organization_id=$1",
        [a.organization_id],
      );
    });
    return { ok: true };
  });
  app.post("/v1/categories/:id/payments", async (req) => {
    const a = requirePermission(await getActor(req), "categories");
    const { id } = param.parse(req.params);
    const b = z
      .object({
        price_cents: z.number().int().min(0).max(99999999),
        payment_mode: z.enum(["free", "stripe", "external"]),
        participant_count: z.number().int().min(1).max(100),
        registration_starts_at: z.iso.datetime().nullable(),
        registration_ends_at: z.iso.datetime().nullable(),
        payment_policy: z.string().trim().max(4000),
      })
      .parse(req.body);
    ensure(
      b.payment_mode === "free" ? b.price_cents === 0 : b.price_cents > 0,
      "Revisa el precio y la forma de pago.",
      400,
    );
    await transaction(async (db) => {
      const c = (
        await db.query(
          "SELECT * FROM categories WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [id, a.organization_id],
        )
      ).rows[0];
      ensure(c && !c.draw_published, "Categoría no disponible.");
      if (b.participant_count !== c.participant_count)
        ensure(
          !(
            await db.query("SELECT 1 FROM teams WHERE category_id=$1 LIMIT 1", [
              id,
            ])
          ).rowCount,
          "No puedes cambiar el tamaño del equipo después de registrar participantes.",
        );
      await db.query(
        "UPDATE categories SET price_cents=$2,payment_mode=$3,participant_count=$4,registration_starts_at=$5,registration_ends_at=$6,payment_policy=$7 WHERE id=$1",
        [
          id,
          b.price_cents,
          b.payment_mode,
          b.participant_count,
          b.registration_starts_at,
          b.registration_ends_at,
          b.payment_policy,
        ],
      );
      await audit(db, a.organization_id, a.id, "category.payments", id, c, b);
    });
    return { ok: true };
  });
  app.get("/v1/registrations/:id/status", async (req) => {
    const a = await getActor(req);
    ensure(a, "Inicia sesión.", 401);
    const { id } = param.parse(req.params);
    if (a.role !== "participant") requirePermission(a, "registrations");
    const r = (
      await pool.query(
        `SELECT r.*,p.status payment_status,p.refunded_cents FROM tournament_registrations r
      LEFT JOIN registration_payments p ON p.registration_id=r.id WHERE r.id=$1 AND r.organization_id=$2 AND ($3::uuid IS NULL OR r.team_id=$3)`,
        [id, a.organization_id, a.role === "participant" ? a.team_id : null],
      )
    ).rows[0];
    ensure(r, "Inscripción no encontrada.", 404);
    return r;
  });
  app.post("/v1/registrations/:id/checkout", async (req) => {
    const a = await getActor(req);
    ensure(a, "Inicia sesión.", 401);
    const { id } = param.parse(req.params);
    if (a.role !== "participant") requirePermission(a, "registrations");
    const r = (
      await pool.query(
        "SELECT id FROM tournament_registrations WHERE id=$1 AND organization_id=$2 AND ($3::uuid IS NULL OR team_id=$3)",
        [id, a.organization_id, a.role === "participant" ? a.team_id : null],
      )
    ).rows[0];
    ensure(r, "Inscripción no encontrada.", 404);
    return createCheckout(id, a.organization_id);
  });
  app.post("/v1/registrations/:id/external-payment", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    const { id } = param.parse(req.params);
    const b = z
      .object({ reference: z.string().trim().min(3).max(200) })
      .parse(req.body);
    await transaction(async (db) => {
      const ref = (
        await db.query(
          "SELECT category_id FROM tournament_registrations WHERE id=$1 AND organization_id=$2",
          [id, a.organization_id],
        )
      ).rows[0];
      ensure(ref, "Inscripción no encontrada.", 404);
      await db.query("SELECT id FROM categories WHERE id=$1 FOR UPDATE", [
        ref.category_id,
      ]);
      const r = (
        await db.query(
          "SELECT * FROM tournament_registrations WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      ensure(
        r.payment_mode === "external" &&
          new Date(r.expires_at).getTime() > Date.now(),
        "Pago externo no disponible.",
      );
      await confirmRegistration(db, r);
      await audit(
        db,
        a.organization_id,
        a.id,
        "registration.external-payment",
        id,
        null,
        b,
      );
    });
    return { ok: true };
  });
  app.get("/v1/tournaments/:id/payments", async (req) => {
    const a = requirePermission(await getActor(req), "registrations");
    const { id } = param.parse(req.params);
    return {
      registrations: (
        await pool.query(
          `SELECT r.*,t.name,t.email,p.status payment_status,p.refunded_cents
      FROM tournament_registrations r JOIN teams t ON t.id=r.team_id LEFT JOIN registration_payments p ON p.registration_id=r.id
      WHERE r.tournament_id=$1 AND r.organization_id=$2 ORDER BY r.created_at DESC`,
          [id, a.organization_id],
        )
      ).rows,
    };
  });
  await app.register(async (webhook) => {
    webhook.removeContentTypeParser("application/json");
    webhook.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );
    webhook.post(
      "/v1/webhooks/stripe",
      { config: { rateLimit: false } },
      async (req) => {
        ensure(
          process.env.STRIPE_WEBHOOK_SECRET,
          "Webhook no configurado.",
          503,
        );
        const signature = req.headers["stripe-signature"];
        ensure(typeof signature === "string", "Firma requerida.", 400);
        let event;
        try {
          event = stripeClient().webhooks.constructEvent(
            req.body as Buffer,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET,
          );
        } catch {
          ensure(false, "Firma de Stripe inválida.", 400);
        }
        await processPaymentEvent(event!);
        return { received: true };
      },
    );
  });
}
