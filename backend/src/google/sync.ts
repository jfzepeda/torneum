import { pool, transaction, ensure, audit } from "../db.js";
import {
  mappingSchema,
  registrationSchema,
  registrationTargets,
  mapResponse,
  fingerprint,
} from "../registration-fields.js";
import { lockTournament } from "../registrations.js";
import { readPublicSheet, type SourceData } from "./public-sheets.js";
import { readForm } from "./oauth.js";
export async function syncIntegration(
  id: string,
  org: string,
  read?: (integration: any) => Promise<SourceData>,
) {
  const lock = await pool.connect();
  let locked = false;
  try {
    locked = (
      await lock.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
        "google-sync:" + id,
      ])
    ).rows[0].locked;
    ensure(locked, "La integración ya se está sincronizando.", 409);
    const integration = (
      await lock.query(
        "SELECT i.*,t.registration_schema FROM registration_integrations i JOIN tournaments t ON t.id=i.tournament_id JOIN organizations o ON o.id=i.organization_id AND o.active WHERE i.id=$1 AND i.organization_id=$2",
        [id, org],
      )
    ).rows[0];
    ensure(integration, "Integración no encontrada.", 404);
    await lock.query(
      "UPDATE registration_integrations SET status='syncing' WHERE id=$1 AND organization_id=$2",
      [id, org],
    );
    const mapping = mappingSchema.parse(integration.mapping);
    const schema = registrationSchema.parse(integration.registration_schema);
    const categories = (
      await lock.query(
        "SELECT id,participant_count FROM categories WHERE tournament_id=$1 AND organization_id=$2",
        [integration.tournament_id, org],
      )
    ).rows;
    const count = Math.max(1, ...categories.map((c) => c.participant_count));
    const source = read
      ? await read(integration)
      : integration.provider === "google_sheets_public"
        ? await readPublicSheet(integration.config.url, mapping)
        : await readForm(org, integration.config.form_id);
    for (const m of mapping.mappings)
      if (m.source)
        ensure(
          source.columns.some((c) => c.id === m.source),
          "Las preguntas o columnas cambiaron; revisa el mapeo.",
          409,
        );
    const result = {
      received: source.rows.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      warnings: source.warnings,
    };
    await transaction(async (db) => {
      await lockTournament(db, org, integration.tournament_id);
      const current = (
        await db.query(
          "SELECT mapping_version FROM registration_integrations WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      ensure(
        current.mapping_version === integration.mapping_version,
        "El mapeo cambió durante la sincronización. Reintenta.",
        409,
      );
      for (const row of source.rows) {
        const mapped = mapResponse(
          row.fields,
          mapping,
          registrationTargets(schema, count, true),
        );
        ensure(!mapped.errors.length, mapped.errors.join(" "), 400);
        const hash = fingerprint(row.fields);
        const previous = (
          await db.query(
            "SELECT * FROM registration_inbox WHERE integration_id=$1 AND external_id=$2",
            [id, row.externalId],
          )
        ).rows[0];
        if (
          previous &&
          previous.content_hash === hash &&
          previous.mapping_version === integration.mapping_version
        ) {
          result.unchanged++;
          continue;
        }
        if (previous) {
          await db.query(
            "UPDATE registration_inbox SET payload=$2,normalized=$3,content_hash=$4,mapping_version=$5,version=version+1,status='pending',updated_at=now() WHERE id=$1",
            [
              previous.id,
              JSON.stringify(row.fields),
              JSON.stringify(mapped.data),
              hash,
              integration.mapping_version,
            ],
          );
          result.updated++;
        } else {
          await db.query(
            "INSERT INTO registration_inbox(organization_id,tournament_id,integration_id,source,external_id,payload,normalized,content_hash,mapping_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [
              org,
              integration.tournament_id,
              id,
              integration.provider,
              row.externalId,
              JSON.stringify(row.fields),
              JSON.stringify(mapped.data),
              hash,
              integration.mapping_version,
            ],
          );
          result.created++;
        }
      }
      await db.query(
        "UPDATE registration_integrations SET status='connected',last_sync_at=now(),last_sync_error=NULL,last_result=$2 WHERE id=$1",
        [id, JSON.stringify(result)],
      );
      await audit(db, org, "google", "integration.sync", id, null, result);
    });
    return result;
  } catch (e) {
    if (locked) {
      const connection = (
        await lock.query(
          "SELECT status FROM google_connections WHERE organization_id=$1",
          [org],
        )
      ).rows[0];
      await lock.query(
        "UPDATE registration_integrations SET status=CASE WHEN provider='google_forms_oauth' AND $3 THEN 'reauth_required' ELSE 'error' END,last_sync_at=now(),last_sync_error=$4 WHERE id=$1 AND organization_id=$2",
        [
          id,
          org,
          connection?.status === "reauth_required",
          (e as Error).message.slice(0, 500),
        ],
      );
    }
    throw e;
  } finally {
    if (locked)
      await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [
        "google-sync:" + id,
      ]);
    lock.release();
  }
}
let running = false;
export async function syncDueIntegrations() {
  if (running) return;
  running = true;
  try {
    const value = Number(process.env.GOOGLE_FORMS_SYNC_INTERVAL_MINUTES || 5);
    const minutes = Number.isFinite(value) && value >= 1 ? value : 5;
    const rows = (
      await pool.query(
        "SELECT i.id,i.organization_id FROM registration_integrations i JOIN organizations o ON o.id=i.organization_id AND o.active JOIN tournaments t ON t.id=i.tournament_id AND t.status<>'archived' WHERE i.enabled AND i.status<>'reauth_required' AND (i.last_sync_at IS NULL OR i.last_sync_at<now()-($1 * interval '1 minute')) ORDER BY i.last_sync_at NULLS FIRST LIMIT 20",
        [minutes],
      )
    ).rows;
    for (const row of rows)
      try {
        await syncIntegration(row.id, row.organization_id);
      } catch {
        /* Each integration stores its own controlled error. */
      }
  } finally {
    running = false;
  }
}
