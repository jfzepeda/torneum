import createClient from "openapi-fetch";
import type { paths } from "./api-schema";
export const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
export const client = createClient<paths>({
  baseUrl: API,
  credentials: "include",
});
export async function get<T>(path: string, tournamentId?: string | null): Promise<T> {
  const response = await fetch(API + path, {
    credentials: "include",
    cache: "no-store",
    headers: tournamentId ? { "X-Tournament-Id": tournamentId } : {},
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
  tournamentId?: string | null,
): Promise<Record<string, unknown>> {
  const response = await fetch(API + path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tournamentId ? { "X-Tournament-Id": tournamentId } : {}),
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || "No se pudo guardar el cambio.");
  return result;
}
export const place = (t: { venue: string; city?: string }) =>
  [t.venue, t.city].filter(Boolean).join(", ");
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

export function tournamentLink(path: string, tournamentId?: string | null) {
  return tournamentId ? `${path}${path.includes("?") ? "&" : "?"}tournament=${encodeURIComponent(tournamentId)}` : path;
}

const slugify = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "torneo";
/** Slugs legibles por torneo (id → slug). La lista llega del más nuevo al más viejo: el más antiguo conserva el slug base y los repetidos reciben -2, -3… */
export function tournamentSlugs(list: { id: string; name: string }[]) {
  const seen = new Map<string, number>(), out = new Map<string, string>();
  for (const t of [...list].reverse()) {
    const base = slugify(t.name), n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    out.set(t.id, n > 1 ? `${base}-${n}` : base);
  }
  return out;
}
