import Stripe from "stripe";
import { pool, transaction, ensure, audit, type Db } from "./db.js";
import nodemailer from "nodemailer";

export const stripeClient = () => {
  ensure(process.env.STRIPE_SECRET_KEY, "Stripe no está configurado.", 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 15000,
  });
};
const front = () => process.env.FRONTEND_URL || "http://127.0.0.1:3000";

export async function registerPayment(db: Db, category: any, teamId: string) {
  const free = category.payment_mode === "free";
  const r = (
    await db.query(
      `INSERT INTO tournament_registrations
    (organization_id,tournament_id,category_id,team_id,status,payment_mode,amount_cents,expires_at,confirmed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN NULL ELSE now()+interval '30 minutes' END,CASE WHEN $8 THEN now() ELSE NULL END) RETURNING *`,
      [
        category.organization_id,
        category.tournament_id,
        category.id,
        teamId,
        free ? "CONFIRMED" : "PENDING_PAYMENT",
        category.payment_mode,
        category.price_cents,
        free,
      ],
    )
  ).rows[0];
  if (free)
    await db.query(
      "INSERT INTO registration_notifications(registration_id) VALUES($1)",
      [r.id],
    );
  return r;
}

export async function confirmRegistration(db: Db, registration: any) {
  if (registration.status === "CONFIRMED") return;
  ensure(
    registration.status === "PENDING_PAYMENT",
    "La reserva ya no está activa.",
  );
  await db.query(
    "UPDATE tournament_registrations SET status='CONFIRMED',confirmed_at=now() WHERE id=$1",
    [registration.id],
  );
  await db.query(
    `UPDATE teams SET status=CASE WHEN verified_at IS NULL THEN 'verification'
    WHEN (SELECT auto_approve FROM tournaments WHERE id=teams.tournament_id) THEN 'approved' ELSE 'pending' END WHERE id=$1`,
    [registration.team_id],
  );
  await db.query(
    "INSERT INTO registration_notifications(registration_id) VALUES($1) ON CONFLICT DO NOTHING",
    [registration.id],
  );
  await audit(
    db,
    registration.organization_id,
    "stripe",
    "registration.confirmed",
    registration.id,
    null,
    { status: "CONFIRMED" },
  );
}

// All transitions lock the category first, then registration and payment.
export async function applyCheckout(
  session: Stripe.Checkout.Session,
  account: string,
  client = stripeClient(),
) {
  const payment = (
    await pool.query(
      "SELECT p.*,r.category_id FROM registration_payments p JOIN tournament_registrations r ON r.id=p.registration_id WHERE p.id=$1 AND p.stripe_account_id=$2",
      [session.metadata?.payment_id, account],
    )
  ).rows[0];
  ensure(payment, "Intento de pago desconocido.", 400);
  return transaction(async (db) => {
    await db.query("SELECT id FROM categories WHERE id=$1 FOR UPDATE", [
      payment.category_id,
    ]);
    const r = (
      await db.query(
        "SELECT * FROM tournament_registrations WHERE id=$1 FOR UPDATE",
        [payment.registration_id],
      )
    ).rows[0];
    const p = (
      await db.query(
        "SELECT * FROM registration_payments WHERE id=$1 FOR UPDATE",
        [payment.id],
      )
    ).rows[0];
    ensure(
      session.metadata?.registration_id === r.id &&
        session.amount_total === p.amount_cents &&
        session.currency === "mxn" &&
        session.mode === "payment",
      "El pago no coincide con la inscripción.",
      400,
    );
    ensure(
      !p.checkout_session_id || p.checkout_session_id === session.id,
      "Sesión de pago incorrecta.",
      400,
    );
    await db.query(
      "UPDATE registration_payments SET checkout_session_id=$2,checkout_url=$3 WHERE id=$1",
      [p.id, session.id, session.url],
    );
    if (session.payment_status === "paid") {
      if (!["paid", "partially_refunded", "refunded"].includes(p.status)) {
        await db.query(
          "UPDATE registration_payments SET status='paid',payment_intent_id=$2 WHERE id=$1",
          [
            p.id,
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          ],
        );
        await confirmRegistration(db, r);
      }
    } else if (session.status === "expired" && r.status === "PENDING_PAYMENT") {
      await db.query(
        "UPDATE registration_payments SET status='expired' WHERE id=$1",
        [p.id],
      );
      await db.query(
        "UPDATE tournament_registrations SET status='EXPIRED' WHERE id=$1",
        [r.id],
      );
      await db.query("UPDATE teams SET status='withdrawn' WHERE id=$1", [
        r.team_id,
      ]);
    }
    return {
      status:
        session.payment_status === "paid"
          ? "CONFIRMED"
          : session.status === "expired" && r.status === "PENDING_PAYMENT"
            ? "EXPIRED"
            : r.status,
      url: session.url,
    };
  });
}

export async function createCheckout(
  registrationId: string,
  organizationId: string,
  client = stripeClient(),
) {
  // Persist the attempt before calling Stripe; retries use exactly the same key and parameters.
  const payment = await transaction(async (db) => {
    const ref = (
      await db.query(
        "SELECT category_id FROM tournament_registrations WHERE id=$1 AND organization_id=$2",
        [registrationId, organizationId],
      )
    ).rows[0];
    ensure(ref, "Inscripción no encontrada.", 404);
    await db.query("SELECT id FROM categories WHERE id=$1 FOR UPDATE", [
      ref.category_id,
    ]);
    const r = (
      await db.query(
        "SELECT * FROM tournament_registrations WHERE id=$1 FOR UPDATE",
        [registrationId],
      )
    ).rows[0];
    ensure(
      r.status === "PENDING_PAYMENT" && r.payment_mode === "stripe",
      "Esta inscripción no requiere Checkout.",
    );
    let p = (
      await db.query(
        "SELECT * FROM registration_payments WHERE registration_id=$1",
        [r.id],
      )
    ).rows[0];
    if (p) return p;
    ensure(new Date(r.expires_at).getTime() > Date.now(), "La reserva caducó.");
    const a = (
      await db.query(
        "SELECT * FROM tenant_payment_accounts WHERE organization_id=$1 AND connected",
        [organizationId],
      )
    ).rows[0];
    ensure(a?.stripe_account_id, "El organizador no tiene Stripe conectado.");
    const live = await client.accounts.retrieve(a.stripe_account_id);
    ensure(
      live.charges_enabled,
      "El organizador no está habilitado para cobrar.",
    );
    p = (
      await db.query(
        `INSERT INTO registration_payments(registration_id,organization_id,stripe_account_id,amount_cents,expires_at)
      VALUES($1,$2,$3,$4,date_trunc('second',now())+interval '31 minutes') RETURNING *`,
        [r.id, organizationId, a.stripe_account_id, r.amount_cents],
      )
    ).rows[0];
    await db.query(
      "UPDATE tournament_registrations SET expires_at=$2 WHERE id=$1",
      [r.id, p.expires_at],
    );
    return p;
  });
  if (payment.checkout_session_id) {
    const session = await client.checkout.sessions.retrieve(
      payment.checkout_session_id,
      {},
      { stripeAccount: payment.stripe_account_id },
    );
    return applyCheckout(session, payment.stripe_account_id, client);
  }
  const org = (
    await pool.query("SELECT slug FROM organizations WHERE id=$1", [
      organizationId,
    ])
  ).rows[0];
  const session = await client.checkout.sessions.create(
    {
      mode: "payment",
      allowed_payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "mxn",
            unit_amount: payment.amount_cents,
            product_data: { name: "Inscripción al torneo" },
          },
        },
      ],
      metadata: { payment_id: payment.id, registration_id: registrationId },
      payment_intent_data: { metadata: { registration_id: registrationId } },
      expires_at: Math.floor(new Date(payment.expires_at).getTime() / 1000),
      success_url: `${front()}/${org.slug}/mi-pareja?payment=return`,
      cancel_url: `${front()}/${org.slug}/mi-pareja?payment=cancelled`,
    },
    {
      stripeAccount: payment.stripe_account_id,
      idempotencyKey: `registration-${payment.id}`,
    },
  );
  await pool.query(
    "UPDATE registration_payments SET checkout_session_id=$2,checkout_url=$3,status=CASE WHEN status='creating' THEN 'pending' ELSE status END WHERE id=$1",
    [payment.id, session.id, session.url],
  );
  return applyCheckout(session, payment.stripe_account_id, client);
}

export async function processPaymentEvent(
  event: Stripe.Event,
  client = stripeClient(),
) {
  // Effects are idempotent under row locks; record the receipt only after they succeed.
  // A crash between effect and receipt safely replays, without holding a pool connection while waiting.
  if (
    (
      await pool.query(
        "SELECT 1 FROM payment_webhook_events WHERE event_id=$1",
        [event.id],
      )
    ).rowCount
  )
    return;
  const account = event.account;
  if (account) {
    if (event.type.startsWith("checkout.session.")) {
      const snapshot = event.data.object as Stripe.Checkout.Session;
      const known = (
        await pool.query(
          "SELECT 1 FROM registration_payments WHERE id::text=$1 AND stripe_account_id=$2",
          [snapshot.metadata?.payment_id || "", account],
        )
      ).rowCount;
      if (known) {
        const current = await client.checkout.sessions.retrieve(
          snapshot.id,
          {},
          { stripeAccount: account },
        );
        await applyCheckout(current, account, client);
      }
    } else if (event.type === "charge.refunded") {
      const charge = await client.charges.retrieve(
        (event.data.object as Stripe.Charge).id,
        {},
        { stripeAccount: account },
      );
      const intent =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      await pool.query(
        `UPDATE registration_payments SET refunded_cents=GREATEST(refunded_cents,$3),
          status=CASE WHEN GREATEST(refunded_cents,$3)>=amount_cents THEN 'refunded' ELSE 'partially_refunded' END
          WHERE stripe_account_id=$1 AND payment_intent_id=$2 AND status IN ('paid','partially_refunded','refunded')`,
        [account, intent, charge.amount_refunded],
      );
      // If refund arrives before checkout confirmation, retry after the session event records the intent.
      const known = (
        await pool.query(
          "SELECT 1 FROM registration_payments WHERE stripe_account_id=$1 AND payment_intent_id=$2",
          [account, intent],
        )
      ).rowCount;
      if (!known && intent) {
        const pi = await client.paymentIntents.retrieve(
          intent,
          {},
          { stripeAccount: account },
        );
        const ours = (
          await pool.query(
            "SELECT 1 FROM registration_payments WHERE registration_id::text=$1 AND stripe_account_id=$2",
            [pi.metadata?.registration_id || "", account],
          )
        ).rowCount;
        if (ours)
          ensure(
            false,
            "La confirmación del pago todavía está pendiente.",
            503,
          );
      }
    } else if (event.type === "account.updated") {
      const current = await client.accounts.retrieve(account);
      await pool.query(
        "UPDATE tenant_payment_accounts SET charges_enabled=$2,payouts_enabled=$3,details_submitted=$4,updated_at=now() WHERE stripe_account_id=$1",
        [
          account,
          current.charges_enabled,
          current.payouts_enabled,
          current.details_submitted,
        ],
      );
    } else if (event.type === "account.application.deauthorized") {
      await pool.query(
        "UPDATE tenant_payment_accounts SET connected=false,charges_enabled=false,updated_at=now() WHERE stripe_account_id=$1",
        [account],
      );
    }
  }
  await pool.query(
    "INSERT INTO payment_webhook_events(event_id,stripe_account_id,event_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [event.id, account, event.type],
  );
}

let working = false;
export async function reconcilePayments(
  client?: Stripe,
  onError: (error: unknown) => void = console.error,
) {
  if (working) return;
  working = true;
  try {
    const due = (
      await pool.query(
        "SELECT * FROM tournament_registrations WHERE status='PENDING_PAYMENT' AND expires_at<=now() ORDER BY expires_at LIMIT 100",
      )
    ).rows;
    for (const r of due) {
      try {
        const p = (
          await pool.query(
            "SELECT * FROM registration_payments WHERE registration_id=$1",
            [r.id],
          )
        ).rows[0];
        if (p) {
          // Never release a potentially payable session on a local timer or Stripe outage.
          const provider = client || stripeClient();
          if (
            !p.checkout_session_id &&
            new Date(p.expires_at).getTime() + 300000 < Date.now()
          ) {
            // Recover a session created before a crash, even after its idempotency cache expires.
            let recovered: Stripe.Checkout.Session | undefined;
            for await (const session of provider.checkout.sessions.list(
              {
                created: {
                  gte: Math.floor(new Date(p.created_at).getTime() / 1000) - 60,
                },
                limit: 100,
              },
              { stripeAccount: p.stripe_account_id },
            )) {
              if (session.metadata?.payment_id === p.id) {
                recovered = session;
                break;
              }
            }
            if (recovered)
              await applyCheckout(recovered, p.stripe_account_id, provider);
            else
              await transaction(async (db) => {
                await db.query(
                  "SELECT id FROM categories WHERE id=$1 FOR UPDATE",
                  [r.category_id],
                );
                const current = (
                  await db.query(
                    "SELECT * FROM registration_payments WHERE id=$1 FOR UPDATE",
                    [p.id],
                  )
                ).rows[0];
                if (
                  current.checkout_session_id ||
                  current.status !== "creating"
                )
                  return;
                await db.query(
                  "UPDATE registration_payments SET status='expired' WHERE id=$1",
                  [p.id],
                );
                await db.query(
                  "UPDATE tournament_registrations SET status='EXPIRED' WHERE id=$1 AND status='PENDING_PAYMENT'",
                  [r.id],
                );
                await db.query(
                  "UPDATE teams SET status='withdrawn' WHERE id=$1",
                  [r.team_id],
                );
              });
          } else await createCheckout(r.id, r.organization_id, provider);
        } else {
          await transaction(async (db) => {
            await db.query("SELECT id FROM categories WHERE id=$1 FOR UPDATE", [
              r.category_id,
            ]);
            const updated = await db.query(
              "UPDATE tournament_registrations SET status='EXPIRED' WHERE id=$1 AND status='PENDING_PAYMENT' AND expires_at<=now() AND NOT EXISTS(SELECT 1 FROM registration_payments WHERE registration_id=$1) RETURNING team_id",
              [r.id],
            );
            if (updated.rowCount)
              await db.query(
                "UPDATE teams SET status='withdrawn' WHERE id=$1",
                [r.team_id],
              );
          });
        }
      } catch (error) {
        onError(error);
      }
    }
  } finally {
    working = false;
  }
}

export async function sendRegistrationNotifications() {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) return;
  await transaction(async (db) => {
    const rows = (
      await db.query(`SELECT n.*,t.email,t.name FROM registration_notifications n
      JOIN tournament_registrations r ON r.id=n.registration_id JOIN teams t ON t.id=r.team_id
      WHERE n.sent_at IS NULL AND n.next_attempt_at<=now() ORDER BY n.next_attempt_at LIMIT 10 FOR UPDATE OF n SKIP LOCKED`)
    ).rows;
    for (const n of rows) {
      try {
        await nodemailer
          .createTransport(process.env.SMTP_URL)
          .sendMail({
            from: process.env.MAIL_FROM,
            to: n.email,
            messageId: `<registration-${n.registration_id}@torneum>`,
            subject: "Inscripción confirmada · Torneum",
            text: `La inscripción de ${n.name} está confirmada. Referencia: ${n.registration_id}. La verificación del correo y la revisión deportiva del organizador se gestionan por separado.`,
          });
        await db.query(
          "UPDATE registration_notifications SET sent_at=now() WHERE registration_id=$1",
          [n.registration_id],
        );
      } catch {
        await db.query(
          "UPDATE registration_notifications SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' WHERE registration_id=$1",
          [n.registration_id],
        );
      }
    }
  });
}
