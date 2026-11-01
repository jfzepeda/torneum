// Prevalidación de formato en el cliente. Debe reflejar las reglas del backend
// (nationalPhone en registration-fields.ts y z.email()); el servidor sigue siendo la autoridad.

/** Teléfono nacional: 10 dígitos, con o sin +52. Devuelve los 10 dígitos o null. */
export const nationalPhone = (value: string): string | null =>
  /^(?:\+?52)?(\d{10})$/.exec(value.replace(/[\s().-]/g, ""))?.[1] ?? null;

// Mismo patrón que z.email() de Zod 4.
const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Mensaje de error de formato para un campo, o "" si es válido o está vacío (lo vacío lo cubre `required`). */
export function formatError(type: string, raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (type === "tel" && !nationalPhone(value))
    return "Ingresa un teléfono de 10 dígitos, ej. 55 1234 5678.";
  if (type === "email" && !EMAIL.test(value))
    return "Ingresa un correo válido, ej. nombre@dominio.com.";
  return "";
}
