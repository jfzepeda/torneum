import { pool, ensure, DomainError } from "../db.js";
import { encrypt, decrypt } from "../integrations.js";
import type { SourceData } from "./public-sheets.js";
import type { Target } from "../registration-fields.js";
export const redirectUri = () =>
  process.env.GOOGLE_FORMS_REDIRECT_URI?.trim() ||
  process.env.GOOGLE_REDIRECT_URI?.trim() ||
  "";
export function googleCapabilities() {
  const configured = !!(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    redirectUri()
  );
  const key = Buffer.from(process.env.OAUTH_ENCRYPTION_KEY || "", "base64");
  return {
    googleOAuth: { configured, available: configured && key.length === 32 },
    publicSheets: { available: true },
  };
}
export function requireGoogle() {
  ensure(
    googleCapabilities().googleOAuth.available,
    "Google OAuth no está configurado.",
    503,
  );
}
export const formId = (input: string) => {
  const id =
    input
      .trim()
      .match(
        /^https:\/\/docs\.google\.com\/forms\/d\/([\w-]+)(?:\/edit)?\/?$/,
      )?.[1] || input.trim();
  ensure(
    /^[\w-]{10,200}$/.test(id),
    "Usa el ID o enlace de edición del formulario (no el enlace público abreviado).",
    400,
  );
  return id;
};
export async function exchangeCode(code: string) {
  requireGoogle();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      code,
      grant_type: "authorization_code",
    }),
  });
  ensure(response.ok, "Google no autorizó la conexión.", 400);
  const token: any = await response.json();
  ensure(
    token.refresh_token,
    "Google no concedió acceso persistente. Reconecta con consentimiento.",
    400,
  );
  token.expires_at = Date.now() + Number(token.expires_in) * 1000;
  return token;
}
async function accessToken(org: string) {
  requireGoogle();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const connection = (
      await client.query(
        "SELECT * FROM google_connections WHERE organization_id=$1 FOR UPDATE",
        [org],
      )
    ).rows[0];
    ensure(connection, "Conecta una cuenta de Google.", 409);
    ensure(
      connection.status !== "reauth_required",
      "Reconecta tu cuenta de Google.",
      409,
    );
    const token = decrypt(connection.encrypted_tokens);
    if (!token.expires_at || token.expires_at < Date.now() + 60000) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
        }),
      });
      if (!response.ok) {
        const body: any = await response.json().catch(() => ({}));
        if (body.error === "invalid_grant") {
          await client.query(
            "UPDATE google_connections SET status='reauth_required' WHERE organization_id=$1",
            [org],
          );
          await client.query("COMMIT");
        }
        throw new DomainError(
          409,
          "No se pudo renovar Google. Reconecta si se revocó el acceso.",
        );
      }
      const next: any = await response.json();
      Object.assign(token, next, {
        refresh_token: next.refresh_token || token.refresh_token,
        expires_at: Date.now() + Number(next.expires_in) * 1000,
      });
      await client.query(
        "UPDATE google_connections SET encrypted_tokens=$2,updated_at=now() WHERE organization_id=$1",
        [org, encrypt(token)],
      );
    }
    await client.query("COMMIT");
    return token.access_token as string;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function formsRequest(
  org: string,
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<any> {
  const token = await accessToken(org);
  const response = await fetch("https://forms.googleapis.com/v1/" + path, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    await pool.query(
      "UPDATE google_connections SET status='reauth_required' WHERE organization_id=$1",
      [org],
    );
    throw new DomainError(409, "Reconecta tu cuenta de Google.");
  }
  ensure(
    response.ok,
    response.status === 403
      ? "Google no permite acceder a este formulario."
      : "Google no pudo completar la operación.",
    response.status === 403 ? 403 : 502,
  );
  return response.json();
}
export async function readForm(org: string, id: string): Promise<SourceData> {
  const form = await formsRequest(org, `forms/${formId(id)}`);
  const columns = (form.items || [])
    .flatMap((item: any) =>
      item.questionItem
        ? [
            {
              id: item.questionItem.question.questionId,
              label: item.title || "",
              index: 0,
            },
          ]
        : item.questionGroupItem
          ? (item.questionGroupItem.questions || []).map((q: any) => ({
              id: q.questionId,
              label: `${item.title || ""} · ${q.rowQuestion?.title || ""}`,
              index: 0,
            }))
          : [],
    )
    .map((c: any, index: number) => ({ ...c, index }));
  const rows: SourceData["rows"] = [];
  let page = "";
  do {
    const data = await formsRequest(
      org,
      `forms/${id}/responses?pageSize=500${page ? "&pageToken=" + encodeURIComponent(page) : ""}`,
    );
    for (const r of data.responses || []) {
      rows.push({
        externalId: r.responseId,
        fields: Object.fromEntries(
          Object.entries(r.answers || {}).map(([k, v]: [string, any]) => [
            k,
            (v.textAnswers?.answers || []).map((a: any) => a.value),
          ]),
        ),
      });
    }
    page = data.nextPageToken || "";
    ensure(
      rows.length <= 20000,
      "Demasiadas respuestas para una sincronización.",
      400,
    );
  } while (page);
  return {
    columns,
    rows,
    warnings: [],
    title: form.info?.title,
    revision: form.revisionId,
  };
}
export function questionItem(target: Target, index: number) {
  const question: any = {
    questionId: (index + 1).toString(16).padStart(8, "0"),
    required: target.required,
  };
  if (["select", "multiselect", "boolean"].includes(target.type))
    question.choiceQuestion = {
      type: target.type === "multiselect" ? "CHECKBOX" : "RADIO",
      options: (target.type === "boolean"
        ? ["Sí", "No"]
        : target.options || []
      ).map((value) => ({ value })),
    };
  else if (target.type === "date")
    question.dateQuestion = { includeYear: true };
  else question.textQuestion = { paragraph: false };
  return {
    itemId: (index + 1).toString(16).padStart(8, "0"),
    title: target.label,
    questionItem: { question },
  };
}
