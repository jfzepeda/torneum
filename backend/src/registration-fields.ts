import { z } from "zod";
import { createHash } from "node:crypto";
import { ensure } from "./db.js";

const key = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
export const fieldSchema = z.object({
  id: key,
  label: z.string().trim().min(1).max(150),
  scope: z.enum(["team", "participant"]),
  type: z.enum(["text", "number", "date", "select", "multiselect", "boolean"]),
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(150)).max(100).default([]),
});
export const registrationSchema = z
  .object({
    fields: z.array(fieldSchema).max(50).default([]),
    email_mode: z.enum(["team", "participant"]).default("team"),
    phone_mode: z.enum(["team", "participant"]).default("team"),
  })
  .superRefine((s, c) => {
    if (new Set(s.fields.map((f) => f.id)).size !== s.fields.length)
      c.addIssue({
        code: "custom",
        message: "Los identificadores de campos deben ser únicos.",
      });
    for (const f of s.fields)
      if (
        ["select", "multiselect"].includes(f.type) &&
        (!f.options.length || new Set(f.options).size !== f.options.length)
      )
        c.addIssue({
          code: "custom",
          message: `Revisa las opciones de ${f.label}.`,
        });
  });
export type RegistrationSchema = z.infer<typeof registrationSchema>;
const answers = z.record(
  key,
  z.union([
    z.string().max(2000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(150)).max(100),
  ]),
);
export const registrationInput = z.object({
  category_id: z.string().uuid(),
  name: z.string().trim().min(1).max(150),
  players: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(150),
        email: z.string().trim().max(254).default(""),
        phone: z.string().trim().max(30).default(""),
        answers: answers.default({}),
      }),
    )
    .min(1)
    .max(100),
  captain: z.number().int().min(0).max(99).default(0),
  email: z.string().trim().max(254).default(""),
  phone: z.string().trim().max(30).default(""),
  extra_answers: answers.default({}),
});
export type RegistrationInput = z.infer<typeof registrationInput>;
export function validateRegistration(
  input: unknown,
  schema: RegistrationSchema,
  count: number,
): RegistrationInput {
  const r = registrationInput.parse(input);
  ensure(
    r.players.length === count && r.captain < count,
    "Revisa el número de participantes y el capitán.",
    400,
  );
  ensure(
    new Set(r.players.map((p) => normalize(p.name))).size === count,
    "Los participantes deben tener nombres distintos.",
    400,
  );
  r.email = (
    schema.email_mode === "participant" ? r.players[r.captain].email : r.email
  ).toLowerCase();
  if (schema.phone_mode === "participant") r.phone = r.players[r.captain].phone;
  ensure(
    z.email().safeParse(r.email).success,
    "Falta un correo de contacto válido.",
    400,
  );
  for (const p of r.players) {
    p.email = p.email.toLowerCase();
    ensure(
      (!p.email && schema.email_mode !== "participant") ||
        z.email().safeParse(p.email).success,
      "Revisa los correos de participantes.",
      400,
    );
  }
  function check(values: Record<string, unknown>, scope: string) {
    for (const id of Object.keys(values))
      ensure(
        schema.fields.some((f) => f.id === id && f.scope === scope),
        "Campo adicional desconocido.",
        400,
      );
    for (const f of schema.fields.filter(
      (f) => f.active && f.scope === scope,
    )) {
      const v = values[f.id];
      const empty =
        v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      ensure(!f.required || !empty, `Falta ${f.label}.`, 400);
      if (empty) continue;
      const valid =
        f.type === "number"
          ? typeof v === "number" && Number.isFinite(v)
          : f.type === "boolean"
            ? typeof v === "boolean"
            : f.type === "multiselect"
              ? Array.isArray(v) && v.every((x) => f.options.includes(x))
              : f.type === "select"
                ? typeof v === "string" && f.options.includes(v)
                : f.type === "date"
                  ? typeof v === "string" &&
                    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
                    !Number.isNaN(Date.parse(v)) &&
                    new Date(v).toISOString().slice(0, 10) === v
                  : typeof v === "string";
      ensure(valid, `Valor inválido para ${f.label}.`, 400);
    }
  }
  check(r.extra_answers, "team");
  for (const p of r.players) check(p.answers, "participant");
  return r;
}
export const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = next;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}
export function matchRegistration(a: any, b: any) {
  const an = (a.players || [])
    .map((p: any) => normalize(p.name))
    .filter(Boolean)
    .sort() as string[];
  const bn = (b.players || [])
    .map((p: any) => normalize(p.name))
    .filter(Boolean)
    .sort() as string[];
  const pairs = an
    .flatMap((x, i) => bn.map((y, j) => ({ i, j, s: similarity(x, y) })))
    .sort((a, b) => b.s - a.s || a.i - b.i || a.j - b.j);
  const usedA = new Set<number>(),
    usedB = new Set<number>();
  let total = 0;
  for (const p of pairs)
    if (!usedA.has(p.i) && !usedB.has(p.j)) {
      usedA.add(p.i);
      usedB.add(p.j);
      total += p.s;
    }
  const roster = total / Math.max(an.length, bn.length, 1);
  const contact = (x: any) =>
    String(x.email || x.players?.[x.captain || 0]?.email || "")
      .trim()
      .toLowerCase();
  const phone = (x: any) =>
    String(x.phone || x.players?.[x.captain || 0]?.phone || "").replace(
      /\D/g,
      "",
    );
  const signals = [
    {
      key: "participantes",
      weight: 70,
      present: !!an.length && !!bn.length,
      value: roster,
    },
    {
      key: "equipo",
      weight: 10,
      present: !!a.name && !!b.name,
      value: similarity(normalize(a.name), normalize(b.name)),
    },
    {
      key: "correo",
      weight: 15,
      present: !!contact(a) && !!contact(b),
      value: contact(a) === contact(b) ? 1 : 0,
    },
    {
      key: "teléfono",
      weight: 5,
      present: !!phone(a) && !!phone(b),
      value: phone(a) === phone(b) ? 1 : 0,
    },
  ].filter((x) => x.present);
  const score = signals.length
    ? (100 * signals.reduce((n, x) => n + x.weight * x.value, 0)) /
      signals.reduce((n, x) => n + x.weight, 0)
    : 0;
  const exactEmail = !!contact(a) && contact(a) === contact(b);
  const exactRoster = !!an.length && canonical(an) === canonical(bn);
  return {
    score: Math.round(score),
    collision:
      exactEmail ||
      exactRoster ||
      (signals.length >= 2 && an.length > 0 && bn.length > 0 && score >= 80),
    reasons: signals.filter((x) => x.value >= 0.8).map((x) => x.key),
    exactEmail,
    exactRoster,
  };
}
export type Target = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};
export function registrationTargets(
  s: RegistrationSchema,
  count: number,
  includeInactive = false,
): Target[] {
  const t: Target[] = [
    { key: "name", label: "Nombre del equipo", type: "text", required: true },
    { key: "category_id", label: "Categoría", type: "select", required: true },
    {
      key: "captain",
      label: "Índice del capitán (0 = primero)",
      type: "number",
      required: false,
    },
    {
      key: "email",
      label: "Correo del equipo",
      type: "text",
      required: s.email_mode === "team",
    },
    {
      key: "phone",
      label: "Teléfono del equipo",
      type: "text",
      required: false,
    },
  ];
  for (let i = 0; i < count; i++)
    for (const [k, label, required] of [
      ["name", "Nombre", true],
      ["email", "Correo", s.email_mode === "participant"],
      ["phone", "Teléfono", false],
    ] as const)
      t.push({
        key: `players[${i}].${k}`,
        label: `Participante ${i + 1} · ${label}`,
        type: "text",
        required,
      });
  for (const f of s.fields.filter((f) => f.active || includeInactive))
    for (const prefix of f.scope === "team"
      ? ["extra_answers"]
      : Array.from({ length: count }, (_, i) => `players[${i}].answers`))
      t.push({
        key: `${prefix}.${f.id}`,
        label: `${prefix.startsWith("players") ? "Participante " + (Number(prefix.match(/\d+/)?.[0]) + 1) + " · " : ""}${f.label}`,
        type: f.type,
        required: f.required,
        options: f.options,
      });
  return t;
}
export const mappingSchema = z.object({
  header_row: z.number().int().min(1).max(100).default(1),
  columns: z
    .array(
      z.object({
        id: z.string().max(200),
        label: z.string().max(500),
        index: z.number().int().min(0),
      }),
    )
    .max(1000)
    .default([]),
  mappings: z
    .array(
      z.object({
        source: z.string().max(200).optional(),
        target: z.string().max(150),
        value: z.string().max(2000).optional(),
        values: z.record(z.string(), z.string()).default({}),
        separator: z.string().min(1).max(5).default(";"),
      }),
    )
    .max(1000)
    .default([]),
  identity_column: z.string().max(200).optional(),
  category_id: z.string().uuid(),
});
export type Mapping = z.infer<typeof mappingSchema>;
export function mapResponse(
  fields: Record<string, unknown>,
  mapping: Mapping,
  targets: Target[],
) {
  const out: any = {
    name: "",
    category_id: mapping.category_id,
    captain: 0,
    email: "",
    phone: "",
    players: [],
    extra_answers: {},
  };
  const errors: string[] = [];
  for (const m of mapping.mappings) {
    const def = targets.find((t) => t.key === m.target);
    if (!def) {
      errors.push(`Destino desconocido: ${m.target}`);
      continue;
    }
    let value: any = m.source === undefined ? m.value : fields[m.source];
    if (value === undefined || value === "") continue;
    if (Array.isArray(value) && def.type !== "multiselect")
      value = value.join("; ");
    if (def.type === "multiselect")
      value = (
        Array.isArray(value) ? value : String(value).split(m.separator)
      ).map((v) => {
        const text = String(v).trim();
        return Object.hasOwn(m.values, text) ? m.values[text] : text;
      });
    else {
      value = String(value).trim();
      value = Object.hasOwn(m.values, value) ? m.values[value] : value;
      if (def.type === "number") value = Number(value);
      if (def.type === "boolean") {
        const v = normalize(value);
        value = ["si", "true", "1", "yes"].includes(v)
          ? true
          : ["no", "false", "0"].includes(v)
            ? false
            : value;
      }
    }
    const p = m.target.match(
      /^players\[(\d+)\]\.(name|email|phone|answers\.([\w-]+))$/,
    );
    if (p) {
      const i = Number(p[1]);
      out.players[i] ??= { name: "", email: "", phone: "", answers: {} };
      if (p[3]) out.players[i].answers[p[3]] = value;
      else out.players[i][p[2]] = value;
    } else if (m.target.startsWith("extra_answers."))
      out.extra_answers[m.target.slice(14)] = value;
    else out[m.target] = value;
  }
  for (let i = 0; i < out.players.length; i++)
    out.players[i] ??= { name: "", email: "", phone: "", answers: {} };
  return { data: out, errors };
}
