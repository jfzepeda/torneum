import createClient from "openapi-fetch";
import type { paths } from "./api-schema";
export const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
export const client = createClient<paths>({
  baseUrl: API,
  credentials: "include",
});
export async function get<T>(path: string): Promise<T> {
  const response = await fetch(API + path, {
    credentials: "include",
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 404 && path.startsWith("/v1/public/"))
    throw new Error("Club no encontrado");
  if (!response.ok)
    throw new Error(
      result.error?.message || "No se pudo cargar la información.",
    );
  return result;
}
export async function mutate(
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(API + path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || "No se pudo guardar el cambio.");
  return result;
}
export const date = (
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Intl.DateTimeFormat("es-MX", {
    ...options,
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
export const time = (value: string) =>
  date(value, { hour: "2-digit", minute: "2-digit" });
export const labels: Record<string, string> = {
  verification: "Por verificar",
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
  unscheduled: "Por agendar",
  scheduled: "Programado",
  live: "En curso",
  finished: "Finalizado",
  disputed: "En disputa",
  suspended: "Suspendido",
  prospect: "Prospecto",
  reviewed: "Revisado",
  negotiation: "Negociación",
  won: "Confirmado",
  lost: "No concretado",
  excluded: "Excluido",
  draft: "Borrador",
  queued: "En cola",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Fallido",
  cancelled: "Cancelado",
  applied: "Aplicada",
  admin: "Administrador",
  registration: "Inscripciones",
  scheduling: "Programación",
  referee: "Árbitro",
  viewer: "Solo lectura",
  participant: "Capitán",
};
