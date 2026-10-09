import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { pool } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { hashPassword, hashToken, newToken } from "../src/auth.js";
import {
  createCheckout,
  processPaymentEvent,
  applyCheckout,
  reconcilePayments,
} from "../src/payments.js";
const enabled = !!process.env.TEST_DATABASE_URL;
const q = async (sql: string, params: unknown[] = []) =>
  (await pool.query(sql, params)).rows;
let app: Awaited<ReturnType<typeof buildApp>>;
let A: Awaited<ReturnType<typeof fixture>>,
  B: Awaited<ReturnType<typeof fixture>>;
const sessions = new Map<string, any>();
const requests: any[] = [];
let canCharge = true;
const fake = {
  accounts: { retrieve: async () => ({ charges_enabled: canCharge }) },
  checkout: {
    sessions: {
      create: async (params: any, opts: any) => {
        requests.push({ params, opts });
        const old = [...sessions.values()].find(
          (s) => s.key === opts.idempotencyKey,
        );
        if (old) return old;
        const s = {
          id: `cs_${randomUUID()}`,
          key: opts.idempotencyKey,
          account: opts.stripeAccount,
          metadata: params.metadata,
          amount_total: params.line_items[0].price_data.unit_amount,
          currency: "mxn",
          mode: "payment",
          status: "open",
          payment_status: "unpaid",
          url: "https://checkout.stripe.com/test",
          payment_intent: `pi_${randomUUID()}`,
        };
        sessions.set(s.id, s);
        return s;
      },
      list: async function* (_params: any, opts: any) {
        for (const s of sessions.values())
          if (s.account === opts.stripeAccount) yield s;
      },
      retrieve: async (id: string, _params: any, opts: any) => {
        const s = sessions.get(id);
        assert.equal(opts.stripeAccount, s.account);
        return s;
      },
    },
  },
} as unknown as Stripe;
async function fixture() {
  const tag = randomUUID();
  const org = (
    await q("INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id", [
      "Payments",
      tag,
    ])
  )[0].id;
  const tournament = (
    await q(
      "INSERT INTO tournaments(organization_id,name,venue,starts_on,ends_on,auto_approve) VALUES($1,'Cup','Court','2026-10-01','2026-10-03',true) RETURNING id",
      [org],
    )
  )[0].id;
  const category = (
    await q(
      "INSERT INTO categories(organization_id,tournament_id,name,capacity,payment_mode,price_cents) VALUES($1,$2,'Open',4,'stripe',50000) RETURNING id",
      [org, tournament],
    )
  )[0].id;
  const user = (
    await q(
      "INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,'Admin',$2,$3,'admin') RETURNING id",
      [org, `${tag}@example.invalid`, hashPassword("test-password-long")],
    )
  )[0].id;
  const token = newToken();
  await q(
    "INSERT INTO sessions(token_hash,organization_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hashToken(token), org, user],
  );
  await q(
    "INSERT INTO tenant_payment_accounts(organization_id,stripe_account_id,charges_enabled) VALUES($1,$2,true)",
    [org, `acct_${tag}`],
  );
  return {
    org,
    tournament,
    category,
    slug: tag,
    cookie: `torneum_session=${token}`,
  };
}
let address = 1;
const post = (url: string, body: any, cookie = "") =>
  app.inject({
    method: "POST",
    url,
    payload: body,
    remoteAddress: `127.0.0.${address++}`,
    headers: { origin: "http://127.0.0.1:3000", cookie },
  });
const register = (o = A) =>
  post("/v1/registrations", {
    slug: o.slug,
    category_id: o.category,
    name: "Pair",
    players: [{ name: randomUUID() }, { name: randomUUID() }],
    captain: 0,
    email: `${randomUUID()}@example.invalid`,
  });
async function paid(o = B) {
  const res = await register(o);
  assert.equal(res.statusCode, 200, res.body);
  const id = res.json().registration_id;
  await createCheckout(id, o.org, fake);
  const p = (
    await q("SELECT * FROM registration_payments WHERE registration_id=$1", [
      id,
    ])
  )[0];
  return { id, p, session: sessions.get(p.checkout_session_id) };
}
const event = (
  type: string,
  object: any,
  account: string,
  id = `evt_${randomUUID()}`,
) => ({ id, type, account, data: { object } }) as Stripe.Event;
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  process.env.DEV_MAILBOX = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  app = await buildApp();
  await app.ready();
  A = await fixture();
  B = await fixture();
});
after(async () => {
  if (enabled) {
    await app.close();
    await pool.end();
  }
});
test(
  "last slot serializes concurrent registrations",
  { skip: !enabled },
  async () => {
    for (let i = 0; i < 3; i++)
      assert.equal((await register()).statusCode, 200);
    const responses = await Promise.all([register(), register()]);
    assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM tournament_registrations WHERE category_id=$1",
          [A.category],
        )
      )[0].count,
      "4",
    );
  },
);
test(
  "email verification and manual approval cannot bypass payment",
  { skip: !enabled },
  async () => {
    const res = await register(B);
    assert.equal(res.statusCode, 200, res.body);
    const token = res.json().development_link.split("#")[1];
    assert.equal((await post("/v1/verify", { token })).statusCode, 200);
    const r = (
      await q("SELECT * FROM tournament_registrations WHERE id=$1", [
        res.json().registration_id,
      ])
    )[0];
    assert.equal(
      (await q("SELECT status FROM teams WHERE id=$1", [r.team_id]))[0].status,
      "pending",
    );
    assert.equal(
      (
        await post(
          "/v1/registrations/review",
          { id: r.team_id, status: "approved", reason: "Approved" },
          B.cookie,
        )
      ).statusCode,
      409,
    );
  },
);
test(
  "one direct charge across concurrent retries and crash recovery",
  { skip: !enabled },
  async () => {
    const r = (
      await q(
        "SELECT * FROM tournament_registrations WHERE organization_id=$1 LIMIT 1",
        [B.org],
      )
    )[0];
    await Promise.all([
      createCheckout(r.id, B.org, fake),
      createCheckout(r.id, B.org, fake),
    ]);
    const rows = await q(
      "SELECT * FROM registration_payments WHERE registration_id=$1",
      [r.id],
    );
    assert.equal(rows.length, 1);
    const prior = rows[0].checkout_session_id;
    await q(
      "UPDATE registration_payments SET checkout_session_id=NULL,checkout_url=NULL WHERE id=$1",
      [rows[0].id],
    );
    await createCheckout(r.id, B.org, fake);
    assert.equal(
      (
        await q(
          "SELECT checkout_session_id FROM registration_payments WHERE id=$1",
          [rows[0].id],
        )
      )[0].checkout_session_id,
      prior,
    );
    const call = requests.find(
      (x) => x.params.metadata.registration_id === r.id,
    );
    assert.deepEqual(call.params.allowed_payment_method_types, ["card"]);
    assert.equal(call.params.line_items[0].price_data.unit_amount, 50000);
    assert.equal(
      call.params.payment_intent_data.application_fee_amount,
      undefined,
    );
    assert.equal(call.opts.stripeAccount, `acct_${B.slug}`);
  },
);
test(
  "duplicate webhook confirms without browser return and queues one notification",
  { skip: !enabled },
  async () => {
    const p = (
      await q(
        "SELECT * FROM registration_payments WHERE organization_id=$1 LIMIT 1",
        [B.org],
      )
    )[0];
    const s = sessions.get(p.checkout_session_id);
    s.payment_status = "paid";
    s.status = "complete";
    const e = event("checkout.session.completed", s, p.stripe_account_id);
    await Promise.all(
      Array.from({ length: 20 }, () => processPaymentEvent(e, fake)),
    );
    await processPaymentEvent(
      event("checkout.session.completed", s, p.stripe_account_id),
      fake,
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          p.registration_id,
        ])
      )[0].status,
      "CONFIRMED",
    );
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM registration_notifications WHERE registration_id=$1",
          [p.registration_id],
        )
      )[0].count,
      "1",
    );
  },
);
test(
  "raw signed webhook works without browser origin; bad signature rejected",
  { skip: !enabled },
  async () => {
    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "ignored.event",
      data: { object: {} },
      account: `acct_${A.slug}`,
    });
    const bad = await app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": "bad",
      },
    });
    assert.equal(bad.statusCode, 400);
    const signature = new Stripe(
      "sk_test_fake",
    ).webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    const good = await app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
    });
    assert.equal(good.statusCode, 200, good.body);
  },
);
test(
  "wrong account and amount cannot confirm",
  { skip: !enabled },
  async () => {
    const { p, session, id } = await paid();
    await assert.rejects(() =>
      applyCheckout(
        { ...session, payment_status: "paid" },
        `acct_${A.slug}`,
        fake,
      ),
    );
    await assert.rejects(() =>
      applyCheckout(
        { ...session, amount_total: 1, payment_status: "paid" },
        p.stripe_account_id,
        fake,
      ),
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [id])
      )[0].status,
      "PENDING_PAYMENT",
    );
  },
);
test(
  "expiry releases slot; stale expiry cannot undo confirmation",
  { skip: !enabled },
  async () => {
    const { id, p, session } = await paid();
    session.status = "expired";
    await processPaymentEvent(
      event("checkout.session.expired", session, p.stripe_account_id),
      fake,
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [id])
      )[0].status,
      "EXPIRED",
    );
    const confirmed = (
      await q(
        "SELECT * FROM registration_payments WHERE organization_id=$1 AND status='paid'",
        [B.org],
      )
    )[0];
    const s = sessions.get(confirmed.checkout_session_id);
    await processPaymentEvent(
      event(
        "checkout.session.expired",
        { ...s, status: "expired", payment_status: "unpaid" },
        confirmed.stripe_account_id,
      ),
      fake,
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          confirmed.registration_id,
        ])
      )[0].status,
      "CONFIRMED",
    );
  },
);
test(
  "partial and full refunds preserve participation",
  { skip: !enabled },
  async () => {
    const p = (
      await q(
        "SELECT * FROM registration_payments WHERE organization_id=$1 AND status='paid'",
        [B.org],
      )
    )[0];
    let refund = 100;
    const provider = {
      ...fake,
      charges: {
        retrieve: async () => ({
          payment_intent: p.payment_intent_id,
          amount_refunded: refund,
        }),
      },
    } as unknown as Stripe;
    await processPaymentEvent(
      event("charge.refunded", { id: "ch_test" }, p.stripe_account_id),
      provider,
    );
    assert.equal(
      (
        await q("SELECT status FROM registration_payments WHERE id=$1", [p.id])
      )[0].status,
      "partially_refunded",
    );
    refund = p.amount_cents;
    await processPaymentEvent(
      event("charge.refunded", { id: "ch_test" }, p.stripe_account_id),
      provider,
    );
    assert.equal(
      (
        await q("SELECT status FROM registration_payments WHERE id=$1", [p.id])
      )[0].status,
      "refunded",
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          p.registration_id,
        ])
      )[0].status,
      "CONFIRMED",
    );
  },
);
test(
  "tenant authorization protects status checkout and payment reports",
  { skip: !enabled },
  async () => {
    const r = (
      await q(
        "SELECT * FROM tournament_registrations WHERE organization_id=$1 LIMIT 1",
        [B.org],
      )
    )[0];
    assert.equal(
      (
        await app.inject({
          url: `/v1/registrations/${r.id}/status`,
          headers: { cookie: A.cookie },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await post(`/v1/registrations/${r.id}/checkout`, {}, A.cookie))
        .statusCode,
      404,
    );
    const listing = await app.inject({
      url: `/v1/tournaments/${B.tournament}/payments`,
      headers: { cookie: A.cookie },
    });
    assert.deepEqual(listing.json().registrations, []);
  },
);
test("loss of capability blocks new checkout", { skip: !enabled }, async () => {
  const o = await fixture();
  const res = await register(o);
  assert.equal(res.statusCode, 200, res.body);
  canCharge = false;
  try {
    await assert.rejects(
      () => createCheckout(res.json().registration_id, o.org, fake),
      /habilitado/,
    );
  } finally {
    canCharge = true;
  }
});

test(
  "free individual and authorized external payments confirm without Stripe",
  { skip: !enabled },
  async () => {
    const o = await fixture();
    await q(
      "UPDATE categories SET payment_mode='free',price_cents=0,participant_count=1 WHERE id=$1",
      [o.category],
    );
    const res = await post("/v1/registrations", {
      slug: o.slug,
      category_id: o.category,
      name: "Solo",
      players: [{ name: "Solo Player" }],
      captain: 0,
      email: `${randomUUID()}@example.invalid`,
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          res.json().registration_id,
        ])
      )[0].status,
      "CONFIRMED",
    );
    await q(
      "UPDATE categories SET payment_mode='external',price_cents=50000,participant_count=2 WHERE id=$1",
      [o.category],
    );
    const external = await register(o);
    assert.equal(external.statusCode, 200, external.body);
    assert.equal(
      (
        await post(
          `/v1/registrations/${external.json().registration_id}/external-payment`,
          { reference: "Cash receipt 001" },
          o.cookie,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          external.json().registration_id,
        ])
      )[0].status,
      "CONFIRMED",
    );
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM registration_payments WHERE organization_id=$1",
          [o.org],
        )
      )[0].count,
      "0",
    );
  },
);
test(
  "two organizations pay concurrently without mixing direct accounts",
  { skip: !enabled },
  async () => {
    const [a, b] = await Promise.all([fixture(), fixture()]);
    const [one, two] = await Promise.all([paid(a), paid(b)]);
    for (const item of [one, two]) {
      item.session.status = "complete";
      item.session.payment_status = "paid";
    }
    await Promise.all([
      processPaymentEvent(
        event(
          "checkout.session.completed",
          one.session,
          one.p.stripe_account_id,
        ),
        fake,
      ),
      processPaymentEvent(
        event(
          "checkout.session.completed",
          two.session,
          two.p.stripe_account_id,
        ),
        fake,
      ),
    ]);
    assert.notEqual(one.p.stripe_account_id, two.p.stripe_account_id);
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM tournament_registrations WHERE id=ANY($1) AND status='CONFIRMED'",
          [[one.id, two.id]],
        )
      )[0].count,
      "2",
    );
  },
);
test(
  "worker recovers payment after missing session persistence and expires unstarted reservations",
  { skip: !enabled },
  async () => {
    const o = await fixture();
    const { id, p, session } = await paid(o);
    session.status = "complete";
    session.payment_status = "paid";
    await q(
      "UPDATE registration_payments SET checkout_session_id=NULL,status='creating',expires_at=now()-interval '6 minutes' WHERE id=$1",
      [p.id],
    );
    await q(
      "UPDATE tournament_registrations SET expires_at=now()-interval '6 minutes' WHERE id=$1",
      [id],
    );
    const unstarted = await register(o);
    const other = unstarted.json().registration_id;
    await q(
      "UPDATE tournament_registrations SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [other],
    );
    const errors: unknown[] = [];
    await reconcilePayments(fake, (e) => errors.push(e));
    assert.deepEqual(errors, []);
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [id])
      )[0].status,
      "CONFIRMED",
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          other,
        ])
      )[0].status,
      "EXPIRED",
    );
  },
);
test(
  "Stripe outage retains reservation and does not block other expired reservations",
  { skip: !enabled },
  async () => {
    const o = await fixture();
    const { id, session } = await paid(o);
    await q(
      "UPDATE tournament_registrations SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
    const res = await register(o);
    const empty = res.json().registration_id;
    await q(
      "UPDATE tournament_registrations SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [empty],
    );
    const outage = {
      ...fake,
      checkout: {
        sessions: {
          ...fake.checkout.sessions,
          retrieve: async () => {
            throw new Error("offline");
          },
        },
      },
    } as unknown as Stripe;
    const errors: unknown[] = [];
    await reconcilePayments(outage, (e) => errors.push(e));
    assert.equal(errors.length, 1);
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [id])
      )[0].status,
      "PENDING_PAYMENT",
    );
    assert.equal(
      (
        await q("SELECT status FROM tournament_registrations WHERE id=$1", [
          empty,
        ])
      )[0].status,
      "EXPIRED",
    );
    session.status = "expired";
    await reconcilePayments(fake);
  },
);
