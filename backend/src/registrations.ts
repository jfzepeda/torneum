import { z } from "zod";
import { transaction, ensure, audit, type Db } from "./db.js";
import { newToken, hashToken } from "./auth.js";
import { registerPayment } from "./payments.js";
import { sendVerification } from "./integrations.js";
import {
  registrationSchema,
  validateRegistration,
  matchRegistration,
  fingerprint,
  type RegistrationInput,
} from "./registration-fields.js";
export async function lockTournament(db: Db, org: string, tournament: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "registration:" + org + ":" + tournament,
  ]);
  const t = (
    await db.query(
      "SELECT * FROM tournaments WHERE id=$1 AND organization_id=$2",
      [tournament, org],
    )
  ).rows[0];
  ensure(t, "Torneo no encontrado.", 404);
  return t;
}
export async function findCollisions(
  db: Db,
  org: string,
  tournament: string,
  data: unknown,
  excludeInbox?: string,
  excludeTeam?: string,
) {
  const teams = (
    await db.query(
      "SELECT id,name,players,email,phone,captain,category_id,extra_answers,registration_source FROM teams WHERE organization_id=$1 AND tournament_id=$2",
      [org, tournament],
    )
  ).rows;
  const pending = (
    await db.query(
      "SELECT id,normalized,source FROM registration_inbox WHERE organization_id=$1 AND tournament_id=$2 AND status='pending' AND team_id IS NULL",
      [org, tournament],
    )
  ).rows;
  return [
    ...teams
      .filter((t) => t.id !== excludeTeam)
      .map((t) => ({
        id: t.id,
        kind: "team",
        source: t.registration_source,
        data: t,
      })),
    ...pending
      .filter((t) => t.id !== excludeInbox)
      .map((t) => ({
        id: t.id,
        kind: "inbox",
        source: t.source,
        data: t.normalized,
      })),
  ]
    .map((t) => ({ ...t, ...matchRegistration(data, t.data) }))
    .filter((t) => t.collision)
    .sort((a, b) => b.score - a.score);
}
export async function checkInput(
  db: Db,
  org: string,
  tournament: string,
  data: unknown,
) {
  const t = (
    await db.query(
      "SELECT * FROM tournaments WHERE id=$1 AND organization_id=$2",
      [tournament, org],
    )
  ).rows[0];
  ensure(t, "Torneo no encontrado.", 404);
  ensure(
    z
      .string()
      .uuid()
      .safeParse((data as any)?.category_id).success,
    "Mapea o selecciona una categoría válida.",
    400,
  );
  const c = (
    await db.query(
      "SELECT * FROM categories WHERE id=$1 AND tournament_id=$2 AND organization_id=$3",
      [(data as any)?.category_id, tournament, org],
    )
  ).rows[0];
  ensure(c, "Selecciona una categoría válida.", 400);
  return {
    data: validateRegistration(
      data,
      registrationSchema.parse(t.registration_schema),
      c.participant_count,
    ),
    category: c,
    tournament: t,
  };
}
export async function createRegistration(
  db: Db,
  org: string,
  tournament: string,
  input: unknown,
  source: string,
) {
  const categoryId = z
    .string()
    .uuid()
    .parse((input as any)?.category_id);
  const c = (
    await db.query(
      "SELECT * FROM categories WHERE id=$1 AND tournament_id=$2 AND organization_id=$3 FOR UPDATE",
      [categoryId, tournament, org],
    )
  ).rows[0];
  ensure(c, "Selecciona una categoría válida.", 400);
  // Validate against the category after acquiring its lock: its roster size or
  // payment policy may have changed while this request was waiting.
  const checked = await checkInput(db, org, tournament, input);
  const b = checked.data,
    t = checked.tournament;
  ensure(
    t.status !== "archived" && t.registration_open && !c.draw_published,
    "Inscripciones cerradas.",
  );
  ensure(
    (!c.registration_starts_at ||
      new Date(c.registration_starts_at).getTime() <= Date.now()) &&
      (!c.registration_ends_at ||
        new Date(c.registration_ends_at).getTime() > Date.now()),
    "Inscripciones fuera de plazo.",
  );
  if (c.payment_mode === "stripe")
    ensure(
      (
        await db.query(
          "SELECT 1 FROM tenant_payment_accounts WHERE organization_id=$1 AND connected AND charges_enabled",
          [org],
        )
      ).rowCount,
      "El organizador todavía no está habilitado para cobrar.",
    );
  const count = (
    await db.query(
      "SELECT count(*) FROM teams WHERE category_id=$1 AND status NOT IN ('rejected','withdrawn')",
      [c.id],
    )
  ).rows[0];
  ensure(Number(count.count) < c.capacity, "La categoría no tiene cupos.");
  ensure(
    !(
      await db.query(
        "SELECT 1 FROM teams WHERE tournament_id=$1 AND lower(email)=$2",
        [tournament, b.email],
      )
    ).rowCount,
    "Ya existe una inscripción con ese correo. Vincula el original o utiliza otro contacto.",
  );
  const dev =
    process.env.DEV_MAILBOX === "true" && process.env.NODE_ENV !== "production";
  ensure(
    dev || (process.env.SMTP_URL && process.env.MAIL_FROM),
    "El servicio de verificación no está configurado.",
    503,
  );
  const team = (
    await db.query(
      "INSERT INTO teams(organization_id,tournament_id,category_id,name,players,captain,email,phone,extra_answers,registration_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [
        org,
        tournament,
        b.category_id,
        b.name,
        JSON.stringify(b.players),
        b.captain,
        b.email,
        b.phone,
        JSON.stringify(b.extra_answers),
        source,
      ],
    )
  ).rows[0];
  const registration = await registerPayment(db, c, team.id);
  const token = newToken();
  await db.query(
    "INSERT INTO verification_tokens VALUES($1,$2,$3,now()+interval '30 minutes',NULL)",
    [hashToken(token), org, team.id],
  );
  if (!dev)
    await db.query(
      "INSERT INTO registration_verification_outbox(team_id,token) VALUES($1,$2)",
      [team.id, token],
    );
  const slug = (
    await db.query("SELECT slug FROM organizations WHERE id=$1", [org])
  ).rows[0].slug;
  await audit(db, org, team.id, "registration.create", team.id, null, {
    source,
    status: "verification",
  });
  return {
    ok: true,
    team_id: team.id,
    registration_id: registration.id,
    development_link: dev
      ? (process.env.FRONTEND_URL || "http://127.0.0.1:3000") +
        "/" +
        slug +
        "/verificar#" +
        token
      : undefined,
  };
}
export async function submitNative(
  db: Db,
  org: string,
  input: RegistrationInput,
  source: "public" | "organizer",
) {
  const category = (
    await db.query(
      "SELECT * FROM categories WHERE id=$1 AND organization_id=$2",
      [input.category_id, org],
    )
  ).rows[0];
  ensure(category, "Categoría no encontrada.", 404);
  await lockTournament(db, org, category.tournament_id);
  const { data, tournament } = await checkInput(
    db,
    org,
    category.tournament_id,
    input,
  );
  ensure(
    tournament.status !== "archived" &&
      tournament.registration_open &&
      !category.draw_published,
    "Inscripciones cerradas.",
  );
  ensure(
    (!category.registration_starts_at ||
      new Date(category.registration_starts_at).getTime() <= Date.now()) &&
      (!category.registration_ends_at ||
        new Date(category.registration_ends_at).getTime() > Date.now()),
    "Inscripciones fuera de plazo.",
  );
  const identity = fingerprint(data);
  const previous = (
    await db.query(
      "SELECT id,status FROM registration_inbox WHERE organization_id=$1 AND tournament_id=$2 AND source=$3 AND external_id=$4",
      [org, category.tournament_id, source, identity],
    )
  ).rows[0];
  if (previous)
    return { ok: true, review_pending: previous.status === "pending" };
  const collisions = await findCollisions(
    db,
    org,
    category.tournament_id,
    data,
  );
  if (collisions.length) {
    await db.query(
      "INSERT INTO registration_inbox(organization_id,tournament_id,source,external_id,payload,normalized,content_hash) VALUES($1,$2,$3,$4,$5,$5,$4)",
      [org, category.tournament_id, source, identity, JSON.stringify(data)],
    );
    await audit(
      db,
      org,
      "registration",
      "registration.review_pending",
      null,
      null,
      { source },
    );
    return { ok: true, review_pending: true };
  }
  const result = await createRegistration(
    db,
    org,
    category.tournament_id,
    data,
    source,
  );
  await db.query(
    "INSERT INTO registration_inbox(organization_id,tournament_id,source,external_id,payload,normalized,content_hash,status,team_id) VALUES($1,$2,$3,$4,$5,$5,$4,'accepted',$6)",
    [
      org,
      category.tournament_id,
      source,
      identity,
      JSON.stringify(data),
      result.team_id,
    ],
  );
  return result;
}
export async function inboxDetail(db: Db, row: any) {
  const collisions = await findCollisions(
    db,
    row.organization_id,
    row.tournament_id,
    row.normalized,
    row.id,
    row.team_id,
  );
  let errors: string[] = [];
  try {
    await checkInput(
      db,
      row.organization_id,
      row.tournament_id,
      row.normalized,
    );
  } catch (e) {
    errors =
      e instanceof z.ZodError
        ? e.issues.map((x) => x.path.join(".") + ": " + x.message)
        : [(e as Error).message];
  }
  return {
    ...row,
    collisions,
    errors,
    review_required: !!row.team_id || collisions.length > 0,
  };
}
export async function sendVerificationOutbox() {
  if (!process.env.SMTP_URL) return;
  await transaction(async (db) => {
    const rows = (
      await db.query(
        `SELECT v.*,t.organization_id,t.email,o.slug FROM registration_verification_outbox v JOIN teams t ON t.id=v.team_id JOIN organizations o ON o.id=t.organization_id AND o.active WHERE v.sent_at IS NULL AND v.next_attempt_at<=now() ORDER BY v.next_attempt_at LIMIT 10 FOR UPDATE OF v SKIP LOCKED`,
      )
    ).rows;
    for (const r of rows)
      try {
        await db.query(
          "UPDATE verification_tokens SET expires_at=now()+interval '30 minutes' WHERE token_hash=$1 AND used_at IS NULL",
          [hashToken(r.token)],
        );
        await sendVerification(
          r.email,
          (process.env.FRONTEND_URL || "http://127.0.0.1:3000") +
            "/" +
            r.slug +
            "/verificar#" +
            r.token,
          `<verification-${r.team_id}@torneum>`,
        );
        await db.query(
          "UPDATE registration_verification_outbox SET sent_at=now(),token='' WHERE team_id=$1",
          [r.team_id],
        );
      } catch {
        await db.query(
          "UPDATE registration_verification_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' WHERE team_id=$1",
          [r.team_id],
        );
      }
  });
}
