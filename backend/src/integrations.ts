import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { pool, transaction, ensure, audit } from "./db.js";
export async function sendVerification(email: string, url: string, messageId?: string) {
  ensure(
    process.env.SMTP_URL && process.env.MAIL_FROM,
    "El correo de verificación no está configurado.",
    503,
  );
  await nodemailer
    .createTransport(process.env.SMTP_URL)
    .sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Verifica tu inscripción · Torneum",
      messageId,
      text: `Confirma tu correo y gestiona tu pareja: ${url}\nEste enlace caduca en 30 minutos y solo puede usarse una vez.`,
    });
}
function encryptionKey() {
  ensure(
    process.env.OAUTH_ENCRYPTION_KEY,
    "Falta la clave de cifrado OAuth.",
    503,
  );
  const key = Buffer.from(process.env.OAUTH_ENCRYPTION_KEY, "base64");
  ensure(key.length === 32, "La clave OAuth debe contener 32 bytes.", 503);
  return key;
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(data), decipher.final()]).toString(),
  );
}
export async function sendGmail(
  org: string,
  to: string,
  subject: string,
  body: string,
) {
  const connection = (
    await pool.query(
      "SELECT encrypted_tokens FROM oauth_connections WHERE organization_id=$1",
      [org],
    )
  ).rows[0];
  ensure(connection, "Gmail no está conectado.", 503);
  let token = decrypt(connection.encrypted_tokens);
  if (!token.expires_at || token.expires_at < Date.now() + 60000) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    ensure(response.ok, "No se pudo renovar Gmail.", 502);
    token = { ...token, ...((await response.json()) as object) };
    token.expires_at = Date.now() + token.expires_in * 1000;
    await pool.query(
      "UPDATE oauth_connections SET encrypted_tokens=$2,updated_at=now() WHERE organization_id=$1",
      [org, encrypt(token)],
    );
  }
  ensure(!/[\r\n]/.test(to + subject), "Cabecera de correo inválida.", 400);
  const mime = `To: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body).toString("base64")}`;
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
    },
  );
  ensure(response.ok, `Gmail rechazó el envío (${response.status}).`, 502);
}
let processing = false;
export async function processOutbox() {
  if (processing) return;
  processing = true;
  try {
    await transaction(async (db) => {
      // A DB advisory lock serializes workers and enforces provider cadence across processes.
      const lock = (
        await db.query("SELECT pg_try_advisory_xact_lock(918231) locked")
      ).rows[0];
      if (!lock.locked) return;
      // One message per organization per tick, so one club's queue never blocks the others.
      const due = (
        await db.query(
          "SELECT DISTINCT ON (m.organization_id) m.*,s.email,s.status sponsor_status FROM messages m JOIN sponsors s ON s.id=m.sponsor_id WHERE m.status='queued' AND m.next_attempt_at<=now() AND m.approved_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM messages recent WHERE recent.organization_id=m.organization_id AND recent.sent_at>now()-interval '15 seconds') ORDER BY m.organization_id,m.created_at",
        )
      ).rows;
      for (const m of due) {
      if (m.sponsor_status === "excluded") {
        await db.query(
          "UPDATE messages SET status='cancelled',error='Contacto excluido' WHERE id=$1",
          [m.id],
        );
        continue;
      }
      await db.query(
        "UPDATE messages SET status='sending',attempts=attempts+1 WHERE id=$1",
        [m.id],
      );
      try {
        await sendGmail(m.organization_id, m.email, m.subject, m.body);
        await db.query(
          "UPDATE messages SET status='sent',sent_at=now(),error=NULL WHERE id=$1",
          [m.id],
        );
        await audit(
          db,
          m.organization_id,
          "worker",
          "message.sent",
          m.id,
          null,
          { status: "sent" },
        );
      } catch (error) {
        // An ambiguous transport outcome is never retried automatically: avoids duplicate commercial email.
        await db.query(
          "UPDATE messages SET status='failed',error=$2 WHERE id=$1",
          [m.id, error instanceof Error ? error.message : "Fallo de envío"],
        );
      }
      }
    });
  } finally {
    processing = false;
  }
}
export interface WhatsAppAdapter {
  send(to: string, body: string): Promise<{ providerId: string }>;
}
export const whatsapp: WhatsAppAdapter = {
  async send() {
    throw new Error("La API de WhatsApp queda fuera de la primera versión.");
  },
};
