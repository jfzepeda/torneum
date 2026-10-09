import { parse } from "csv-parse/sync";
import { DomainError, ensure } from "../db.js";
import { fingerprint, type Mapping } from "../registration-fields.js";
export type Column = { id: string; label: string; index: number };
export type SourceResponse = {
  externalId: string;
  fields: Record<string, unknown>;
};
export type SourceData = {
  columns: Column[];
  rows: SourceResponse[];
  warnings: string[];
  title?: string;
  revision?: string;
};
const maxBytes = 10 * 1024 * 1024;
export function publicSheetUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DomainError(400, "Enlace de Google Sheets inválido.");
  }
  ensure(
    url.protocol === "https:" &&
      url.hostname === "docs.google.com" &&
      !url.port &&
      !url.username &&
      !url.password,
    "Usa un enlace HTTPS de docs.google.com sin credenciales.",
    400,
  );
  const match = url.pathname.match(
    /^\/spreadsheets\/d\/(e\/)?([a-zA-Z0-9_-]+)(?:\/(edit|export|pub|pubhtml))?\/?$/,
  );
  ensure(match, "Ruta de Google Sheets inválida.", 400);
  const gid =
    url.searchParams.get("gid") ||
    new URLSearchParams(url.hash.slice(1)).get("gid") ||
    "";
  ensure(!gid || /^\d+$/.test(gid), "Pestaña inválida.", 400);
  const published = !!match[1];
  const csv = new URL(
    `https://docs.google.com/spreadsheets/d/${published ? "e/" : ""}${match[2]}/${published ? "pub" : "export"}`,
  );
  csv.searchParams.set(published ? "output" : "format", "csv");
  if (gid) csv.searchParams.set("gid", gid);
  if (published) csv.searchParams.set("single", "true");
  return {
    url: csv.toString(),
    key: `${published ? "published:" : ""}${match[2]}:${gid || "0"}`,
  };
}
function allowedRedirect(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    (url.hostname === "docs.google.com" ||
      /^doc-[a-z0-9-]+-sheets\.googleusercontent\.com$/.test(url.hostname))
  );
}
export async function downloadCsv(
  input: string,
  fetcher: typeof fetch = fetch,
) {
  let url = new URL(publicSheetUrl(input).url);
  const signal = AbortSignal.timeout(15000);
  try {
    for (let i = 0; i < 4; i++) {
      const response = await fetcher(url, {
        signal,
        redirect: "manual",
        headers: { accept: "text/csv" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        ensure(location, "Redirección inválida.", 400);
        url = new URL(location, url);
        ensure(
          allowedRedirect(url),
          "Google redirigió a un destino no permitido.",
          400,
        );
        continue;
      }
      ensure(
        response.ok,
        "No se puede acceder a la hoja. Comprueba que permite lectura pública.",
        400,
      );
      ensure(
        !/text\/html/i.test(response.headers.get("content-type") || ""),
        "Google devolvió HTML; la hoja no es un CSV público.",
        400,
      );
      ensure(
        Number(response.headers.get("content-length") || 0) <= maxBytes,
        "La hoja supera 10 MiB.",
        400,
      );
      const reader = response.body?.getReader();
      ensure(reader, "Respuesta vacía de Google.", 400);
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          ensure(size <= maxBytes, "La hoja supera 10 MiB.", 400);
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      const text = Buffer.concat(chunks).toString("utf8");
      ensure(
        !/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(text),
        "Google devolvió una página HTML.",
        400,
      );
      return text;
    }
    throw new DomainError(400, "Demasiadas redirecciones de Google.");
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(
      502,
      "No se pudo descargar la hoja en el tiempo disponible.",
    );
  }
}
export function parseCsv(
  text: string,
  headerRow = 1,
  saved: Column[] = [],
): SourceData {
  let matrix: string[][];
  try {
    matrix = parse(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
      max_record_size: maxBytes,
    });
  } catch {
    throw new DomainError(400, "CSV inválido. Revisa comillas y formato.");
  }
  if (
    !matrix.length ||
    matrix.every((row) => row.every((value) => !value.trim()))
  )
    return { columns: [], rows: [], warnings: ["La hoja está vacía."] };
  ensure(
    headerRow >= 1 && headerRow <= matrix.length,
    "Fila de encabezados inválida.",
    400,
  );
  const labels = matrix[headerRow - 1].map((v) => v.trim());
  ensure(labels.length <= 1000, "Demasiadas columnas.", 400);
  const columns = labels.map((label, index) => ({
    label,
    index,
    id:
      label && labels.filter((x) => x === label).length === 1
        ? "h:" + fingerprint(label)
        : `p:${index}:${fingerprint(label)}`,
  }));
  for (const old of saved) {
    const current = columns.find((c) => c.id === old.id);
    ensure(
      current && current.label === old.label,
      "Las columnas cambiaron; revisa el mapeo.",
      409,
    );
  }
  const rows = matrix
    .slice(headerRow)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((row) => {
      ensure(
        row.length <= columns.length,
        "Una fila tiene columnas adicionales sin encabezado.",
        400,
      );
      const fields: Record<string, unknown> = Object.fromEntries(
        columns.map((c) => [c.id, (row[c.index] ?? "").trim()]),
      );
      return { fields, externalId: "hash:" + fingerprint(fields) };
    });
  return { columns, rows, warnings: [] };
}
export async function readPublicSheet(
  url: string,
  mapping?: Mapping,
): Promise<SourceData> {
  const data = parseCsv(
    await downloadCsv(url),
    mapping?.header_row || 1,
    mapping?.columns,
  );
  if (mapping?.identity_column) {
    ensure(
      data.columns.some((c) => c.id === mapping.identity_column),
      "La columna de identidad ya no existe.",
      409,
    );
    const ids = new Set<string>();
    for (const row of data.rows) {
      const key = String(row.fields[mapping.identity_column] ?? "").trim();
      ensure(
        key && !ids.has(key),
        "La columna de identidad contiene valores vacíos o repetidos.",
        409,
      );
      ids.add(key);
      row.externalId = "key:" + key;
    }
  } else
    data.warnings.push(
      "Sin identificador estable: filas idénticas se consideran una respuesta y las ediciones requieren revisión.",
    );
  return data;
}
