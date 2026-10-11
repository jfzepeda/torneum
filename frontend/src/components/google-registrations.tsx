"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { get, mutate } from "@/lib/api";
import type { ViewProps } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Choice, Modal, TextField, EmptyState } from "./common";
import {
  RegistrationFields,
  registrationFromForm,
  defaultSchema,
  type RegistrationSchema,
  type RegistrationData,
  type ExtraField,
} from "./registration-fields";
type Column = { id: string; label: string; index: number };
type Target = {
  key: string;
  label: string;
  required: boolean;
  type: string;
  options?: string[];
};
type Mapping = {
  header_row: number;
  columns: Column[];
  category_id: string;
  identity_column?: string;
  mappings: {
    source?: string;
    target: string;
    value?: string;
    values: Record<string, string>;
    separator: string;
  }[];
};
type Integration = {
  id: string;
  name: string;
  provider: string;
  status: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  enabled: boolean;
  mapping: Mapping;
  mapping_version: number;
  config: { url?: string; form_id?: string; generated?: boolean };
};
type Preview = {
  columns: Column[];
  rows: { fields: Record<string, unknown> }[];
  warnings: string[];
  total: number;
};
type Inbox = {
  id: string;
  version: number;
  source: string;
  normalized: RegistrationData;
  status: string;
  team_id?: string;
  errors: string[];
  review_required: boolean;
  collisions: {
    id: string;
    kind: string;
    source: string;
    score: number;
    reasons: string[];
    data: RegistrationData;
  }[];
};
function BulkGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
// span wrapper so the tooltip also shows on disabled buttons
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
const firstWord = (n: string) => n.trim().split(/\s+/)[0] || "";
const NAME_MODES: Record<string, (d: RegistrationData) => string> = {
  captain_full: (d) =>
    (d.players?.[d.captain] || d.players?.[0])?.name.trim() || "",
  first_names: (d) =>
    (d.players || [])
      .map((p) => firstWord(p.name))
      .filter(Boolean)
      .join("-"),
};
export function GoogleRegistrations({ state, actor, action }: ViewProps) {
  const tournament = state.tournament!;
  const admin = actor.role === "admin";
  const [tab, setTab] = useState("inbox"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [schema, setSchema] = useState<RegistrationSchema>(
      tournament.registration_schema || defaultSchema,
    ),
    [targets, setTargets] = useState<Target[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]),
    [items, setItems] = useState<Inbox[]>([]),
    [status, setStatus] = useState("pending"),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null);
  const [checked, setChecked] = useState<string[]>([]),
    [bulkCategory, setBulkCategory] = useState(""),
    [quick, setQuick] = useState<Inbox | null>(null);
  const [caps, setCaps] = useState<{
    googleOAuth: { available: boolean };
    connection: string;
  }>({ googleOAuth: { available: false }, connection: "disconnected" });
  const [selected, setSelected] = useState<Inbox | null>(null),
    [internal, setInternal] = useState(false),
    [link, setLink] = useState(""),
    [distinct, setDistinct] = useState(false),
    [applyFields, setApplyFields] = useState<string[]>([]);
  const [method, setMethod] = useState("google_sheets_public"),
    [url, setUrl] = useState(""),
    [name, setName] = useState(""),
    [header, setHeader] = useState(1),
    [preview, setPreview] = useState<Preview | null>(null),
    [editing, setEditing] = useState<Integration | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    header_row: 1,
    columns: [],
    category_id: state.categories[0]?.id || "",
    mappings: [],
  });
  const [createId, setCreateId] = useState(""),
    [update, setUpdate] = useState<{
      id: string;
      revision: string;
      schema_hash: string;
      targets: Target[];
      current: unknown[];
    } | null>(null);
  const load = useCallback(async () => {
    const [f, i, r, c] = await Promise.all([
      get<{ schema: RegistrationSchema; targets: Target[] }>(
        `/v1/registration-fields/${tournament.id}`,
      ),
      get<{ integrations: Integration[] }>(
        `/v1/integrations/google/${tournament.id}`,
      ),
      get<{ items: Inbox[]; next_offset: number | null }>(
        `/v1/registration-inbox/${tournament.id}?status=${status}&offset=${offset}`,
      ),
      get<typeof caps>("/v1/integrations/google/capabilities"),
    ]);
    setSchema(f.schema);
    setTargets(f.targets);
    setIntegrations(i.integrations);
    setItems(r.items);
    setNext(r.next_offset);
    setCaps(c);
  }, [tournament.id, status, offset]);
  useEffect(() => {
    let active = true;
    void load().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [load]);
  async function run(fn: () => Promise<unknown>, refresh = true) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (refresh) await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function changeMapping(column: Column, target: string) {
    setMapping((m) => ({
      ...m,
      mappings: [
        ...m.mappings.filter(
          (x) => x.source !== column.id && x.target !== target,
        ),
        ...(target
          ? [{ source: column.id, target, values: {}, separator: ";" }]
          : []),
      ],
    }));
  }
  async function inspect() {
    const result = (await mutate(
      `/v1/integrations/google/${method === "google_sheets_public" ? "public" : "oauth"}/preview`,
      method === "google_sheets_public"
        ? { url, header_row: header }
        : { form_id: url },
    )) as unknown as Preview;
    setPreview(result);
    setMapping((m) => ({
      ...m,
      header_row: header,
      columns: result.columns,
      mappings: m.mappings.filter(
        (x) => !x.source || result.columns.some((c) => c.id === x.source),
      ),
    }));
  }
  async function saveMapping() {
    const body = {
      tournament_id: tournament.id,
      name: name || "Respuestas de Google",
      mapping: {
        ...mapping,
        header_row: header,
        columns: preview?.columns || mapping.columns,
      },
    };
    if (editing)
      await mutate("/v1/integrations/mapping", {
        id: editing.id,
        mapping: body.mapping,
        version: editing.mapping_version,
      });
    else {
      const r = await mutate(
        `/v1/integrations/google/${method === "google_sheets_public" ? "public" : "oauth"}/connect`,
        {
          ...body,
          ...(method === "google_sheets_public" ? { url } : { form_id: url }),
        },
      );
      const i = r.integration as Integration;
      await mutate(`/v1/integrations/${i.id}/sync`, {});
    }
    setPreview(null);
    setEditing(null);
    toast.success("Integración guardada.");
  }
  async function resolve(
    item: Inbox,
    decision: string,
    extra: Record<string, unknown> = {},
  ) {
    await mutate("/v1/registration-inbox/resolve", {
      id: item.id,
      version: item.version,
      action: decision,
      ...extra,
    });
  }
  async function bulkUpdate(
    rows: Inbox[],
    patch: (
      d: RegistrationData,
      id: string,
    ) => Partial<
      Pick<RegistrationData, "name" | "category_id" | "email" | "players">
    >,
    label: string,
  ) {
    const changes = rows.flatMap((i) => {
      const p = patch(i.normalized, i.id);
      const changed = Object.entries(p).some(
        ([k, v]) =>
          v &&
          JSON.stringify(v) !==
            JSON.stringify(i.normalized[k as keyof RegistrationData]),
      );
      return changed ? [{ id: i.id, version: i.version, ...p }] : [];
    });
    if (!changes.length) return toast.info("Nada que cambiar.");
    const r = await mutate("/v1/registration-inbox/bulk-update", {
      tournament_id: tournament.id,
      items: changes,
    });
    toast.success(`${label}: ${r.updated} actualizadas, ${r.skipped} omitidas`);
    setChecked([]);
  }
  const checkedRows = items.filter((i) => checked.includes(i.id));
  const selectionFormId = "review-registration";
  if (!["admin", "registration"].includes(actor.role))
    return (
      <EmptyState
        title="Sin acceso"
        description="Esta sección requiere permisos de inscripciones."
      />
    );
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === "inbox" ? "default" : "outline"}
          onClick={() => setTab("inbox")}
        >
          Por revisar
        </Button>
        {admin && (
          <>
            <Button
              variant={tab === "google" ? "default" : "outline"}
              onClick={() => setTab("google")}
            >
              Google Forms / Sheets
            </Button>
            <Button
              variant={tab === "fields" ? "default" : "outline"}
              onClick={() => setTab("fields")}
            >
              Campos de inscripción
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => setInternal(true)}>
          Alta del organizador
        </Button>
        <Tip text="Vuelve a cargar respuestas y fuentes desde el servidor.">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await load();
                toast.success("Datos actualizados");
              }, false)
            }
          >
            {busy ? "Actualizando…" : "Actualizar"}
          </Button>
        </Tip>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {tab === "inbox" && (
        <>
          <Alert>
            <AlertDescription>
              Las respuestas pendientes no reservan cupos ni generan pagos.
              Amarillo indica posibles coincidencias o cambios de una
              inscripción existente.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap items-end gap-3">
            <Choice
              label="Estado"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setOffset(0);
              }}
              options={[
                { value: "pending", label: "Por revisar" },
                { value: "accepted", label: "Aceptadas" },
                { value: "linked", label: "Vinculadas" },
                { value: "discarded", label: "Descartadas" },
              ]}
            />
            {status === "pending" && (
              <Button
                disabled={
                  busy ||
                  !items.some((i) => !i.review_required && !i.errors.length)
                }
                onClick={() =>
                  run(async () => {
                    const ready = items.filter(
                      (i) => !i.review_required && !i.errors.length,
                    ).length;
                    if (
                      !window.confirm(
                        `¿Aceptar ${ready} inscripciones válidas de esta página? Se crearán equipos nuevos.`,
                      )
                    )
                      return;
                    let accepted = 0;
                    const failures: string[] = [];
                    for (const item of items.filter(
                      (i) => !i.review_required && !i.errors.length,
                    ))
                      try {
                        await resolve(item, "accept");
                        accepted++;
                      } catch (e) {
                        failures.push((e as Error).message);
                      }
                    toast.success(`${accepted} inscripciones aceptadas`);
                    if (failures.length) {
                      await load();
                      throw new Error(failures.join(" · "));
                    }
                  })
                }
              >
                Aceptar válidas de esta página (
                {items.filter((i) => !i.review_required && !i.errors.length)
                  .length}
                )
              </Button>
            )}
          </div>
          <FieldLabel htmlFor="status">Ediciones en masa</FieldLabel>
          {status === "pending" && items.length > 0 && (
            <TooltipProvider>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border p-3">
                <BulkGroup label="Selección">
                  <Badge variant="outline">
                    {checked.length} de {items.length}
                  </Badge>
                  <Tip text="Marca o desmarca todas las respuestas de esta página.">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setChecked(
                          checked.length === items.length
                            ? []
                            : items.map((i) => i.id),
                        )
                      }
                    >
                      {checked.length === items.length
                        ? "Limpiar selección"
                        : "Seleccionar todas"}
                    </Button>
                  </Tip>
                </BulkGroup>
                <BulkGroup label="Nombre del equipo">
                  <Tip text="Usa el nombre completo del capitán. Ej.: Juan Pérez López.">
                    <Button
                      variant="outline"
                      disabled={busy || !checked.length}
                      onClick={() =>
                        run(() =>
                          bulkUpdate(
                            checkedRows,
                            (d) => ({ name: NAME_MODES.captain_full(d) }),
                            "Nombres",
                          ),
                        )
                      }
                    >
                      Capitán
                    </Button>
                  </Tip>
                  <Tip text="Une la primera palabra del nombre de cada jugador. Ej.: Juan-Carlos.">
                    <Button
                      variant="outline"
                      disabled={busy || !checked.length}
                      onClick={() =>
                        run(() =>
                          bulkUpdate(
                            checkedRows,
                            (d) => ({ name: NAME_MODES.first_names(d) }),
                            "Nombres",
                          ),
                        )
                      }
                    >
                      Nombres cortos
                    </Button>
                  </Tip>
                </BulkGroup>
                <BulkGroup label="Correo">
                  <Tip text="Rellena solo los correos vacíos con uno genérico único (@sin-correo.example.com). No recibe mensajes.">
                    <Button
                      variant="outline"
                      disabled={busy || !checked.length}
                      onClick={() =>
                        run(() =>
                          bulkUpdate(
                            checkedRows,
                            (d, id) => {
                              const generic = (key: string) =>
                                `${key}-${id.slice(0, 8)}@sin-correo.example.com`;
                              return {
                                email: d.email ? undefined : generic("equipo"),
                                players: d.players.map((p, n) => ({
                                  ...p,
                                  email:
                                    p.email ||
                                    (schema.email_mode === "participant"
                                      ? generic(`jugador${n + 1}`)
                                      : ""),
                                })),
                              };
                            },
                            "Correos",
                          ),
                        )
                      }
                    >
                      Genéricos
                    </Button>
                  </Tip>
                </BulkGroup>
                <BulkGroup label="Categoría">
                  <Choice
                    value={bulkCategory}
                    onChange={setBulkCategory}
                    options={[
                      { value: "", label: "Elegir…" },
                      ...state.categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                    ]}
                  />
                  <Tip text="Mueve las respuestas seleccionadas a la categoría elegida.">
                    <Button
                      variant="outline"
                      disabled={busy || !checked.length || !bulkCategory}
                      onClick={() =>
                        run(() =>
                          bulkUpdate(
                            checkedRows,
                            () => ({ category_id: bulkCategory }),
                            "Categoría",
                          ),
                        )
                      }
                    >
                      Mover
                    </Button>
                  </Tip>
                </BulkGroup>
              </div>
            </TooltipProvider>
          )}
          {!items.length ? (
            <EmptyState
              title="No hay respuestas en este estado"
              description={
                status === "pending"
                  ? "Conecta un Google Form o Sheet en la pestaña Google Forms / Sheets, o usa «Alta del organizador»."
                  : "Cambia el filtro de estado para ver otras respuestas."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Equipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Revisión</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${item.normalized.name || "respuesta sin nombre"}`}
                        disabled={status !== "pending"}
                        checked={checked.includes(item.id)}
                        onChange={(e) =>
                          setChecked((c) =>
                            e.target.checked
                              ? [...c, item.id]
                              : c.filter((x) => x !== item.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {item.normalized.name || "Sin nombre"}
                      <p className="text-muted-foreground">
                        {item.normalized.players
                          ?.map((p) => p.name)
                          .join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell>
                      {state.categories.find(
                        (c) => c.id === item.normalized.category_id,
                      )?.name || "—"}
                    </TableCell>
                    <TableCell>{item.source}</TableCell>
                    <TableCell>
                      <Tip
                        text={
                          item.errors.length
                            ? `Falta o es inválido: ${item.errors.join(" · ")}`
                            : item.review_required
                              ? "Posible duplicado o cambio de una inscripción existente. Ábrela con «Revisar»."
                              : "Sin errores ni coincidencias: se puede aceptar."
                        }
                      >
                        <Badge
                          variant="outline"
                          className={
                            item.review_required ? "status status-pending" : ""
                          }
                        >
                          {item.review_required
                            ? "Amarillo · revisar"
                            : item.errors.length
                              ? "Datos incompletos"
                              : "Lista para aceptar"}
                        </Badge>
                      </Tip>
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Tip text="Cambia el nombre o la categoría sin aceptar.">
                        <Button
                          disabled={busy || status !== "pending"}
                          variant="outline"
                          onClick={() => setQuick(item)}
                        >
                          Editar
                        </Button>
                      </Tip>
                      <Tip text="Compara con inscripciones existentes y decide: aceptar, vincular o descartar.">
                        <Button
                          disabled={busy || status !== "pending"}
                          variant="outline"
                          onClick={() => {
                            setSelected(item);
                            setLink(item.team_id || "");
                            setDistinct(false);
                            setApplyFields([]);
                          }}
                        >
                          Revisar
                        </Button>
                      </Tip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Anterior
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Página {Math.floor(offset / 50) + 1}
            </span>
            <Button
              variant="outline"
              disabled={next === null || busy}
              onClick={() => setOffset(next!)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      {tab === "fields" && admin && (
        <FieldGroup className="panel p-4 sm:p-6">
          <Alert>
            <AlertDescription>
              Los campos se comparten entre Google, el formulario público y las
              altas internas. Kits y tallas registran preferencias, sin
              modificar el importe.
            </AlertDescription>
          </Alert>
          <Choice
            label="Captura de correo"
            value={schema.email_mode}
            onChange={(v) =>
              setSchema((s) => ({
                ...s,
                email_mode: v as "team" | "participant",
              }))
            }
            options={[
              { value: "team", label: "Un correo por equipo" },
              { value: "participant", label: "Correo de cada participante" },
            ]}
          />
          <Choice
            label="Captura de teléfono"
            value={schema.phone_mode}
            onChange={(v) =>
              setSchema((s) => ({
                ...s,
                phone_mode: v as "team" | "participant",
              }))
            }
            options={[
              { value: "team", label: "Un teléfono por equipo" },
              { value: "participant", label: "Teléfono por participante" },
            ]}
          />
          {schema.fields.map((f, index) => (
            <fieldset key={f.id} className="rounded-md border p-4">
              <legend className="px-2 text-sm font-medium">
                {f.label || "Nuevo campo"}
              </legend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`label-${f.id}`}>Etiqueta</FieldLabel>
                  <Input
                    id={`label-${f.id}`}
                    value={f.label}
                    onChange={(e) =>
                      setSchema((s) => ({
                        ...s,
                        fields: s.fields.map((x, i) =>
                          i === index ? { ...x, label: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Choice
                    label="Ámbito"
                    value={f.scope}
                    onChange={(v) =>
                      setSchema((s) => ({
                        ...s,
                        fields: s.fields.map((x, i) =>
                          i === index
                            ? { ...x, scope: v as ExtraField["scope"] }
                            : x,
                        ),
                      }))
                    }
                    options={[
                      { value: "team", label: "Equipo" },
                      { value: "participant", label: "Participante" },
                    ]}
                  />
                  <Choice
                    label="Tipo"
                    value={f.type}
                    onChange={(v) =>
                      setSchema((s) => ({
                        ...s,
                        fields: s.fields.map((x, i) =>
                          i === index
                            ? { ...x, type: v as ExtraField["type"] }
                            : x,
                        ),
                      }))
                    }
                    options={[
                      ["text", "Texto"],
                      ["number", "Número"],
                      ["date", "Fecha"],
                      ["select", "Selección"],
                      ["multiselect", "Selección múltiple"],
                      ["boolean", "Sí / No"],
                    ].map(([value, label]) => ({ value, label }))}
                  />
                </div>
                {["select", "multiselect"].includes(f.type) && (
                  <Field>
                    <FieldLabel htmlFor={`options-${f.id}`}>
                      Opciones (una por línea)
                    </FieldLabel>
                    <textarea
                      id={`options-${f.id}`}
                      className="rounded-md border bg-background p-2"
                      value={f.options.join("\n")}
                      onChange={(e) =>
                        setSchema((s) => ({
                          ...s,
                          fields: s.fields.map((x, i) =>
                            i === index
                              ? { ...x, options: e.target.value.split("\n") }
                              : x,
                          ),
                        }))
                      }
                    />
                  </Field>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setSchema((s) => ({
                        ...s,
                        fields: s.fields.map((x, i) =>
                          i === index
                            ? { ...x, required: e.target.checked }
                            : x,
                        ),
                      }))
                    }
                  />{" "}
                  Obligatorio
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={f.active}
                    onChange={(e) =>
                      setSchema((s) => ({
                        ...s,
                        fields: s.fields.map((x, i) =>
                          i === index ? { ...x, active: e.target.checked } : x,
                        ),
                      }))
                    }
                  />{" "}
                  Activo
                </label>
              </FieldGroup>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setSchema((s) => ({
                  ...s,
                  fields: [
                    ...s.fields,
                    {
                      id: "field_" + crypto.randomUUID().replaceAll("-", ""),
                      label: "Nuevo campo",
                      scope: "team",
                      type: "text",
                      required: false,
                      active: true,
                      options: [],
                    },
                  ],
                }))
              }
            >
              Añadir campo
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await action("/v1/registration-fields/save", {
                    tournament_id: tournament.id,
                    schema,
                  });
                  toast.success("Campos guardados");
                })
              }
            >
              Guardar campos
            </Button>
          </div>
        </FieldGroup>
      )}
      {tab === "google" && admin && (
        <>
          <section className="panel flex flex-col gap-4 p-4 sm:p-6">
            <h2>
              {editing
                ? `Revisar mapeo: ${editing.name}`
                : "Conectar una fuente"}
            </h2>
            {editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setPreview(null);
                  setUrl("");
                  setName("");
                  setMapping((m) => ({ ...m, columns: [], mappings: [] }));
                }}
              >
                Nueva conexión
              </Button>
            )}
            <Button
              disabled={busy || !caps.googleOAuth.available}
              variant="outline"
              onClick={() =>
                run(async () => {
                  const r = await get<{ url: string }>(
                    "/v1/integrations/google/oauth/start",
                  );
                  location.assign(r.url);
                }, false)
              }
            >
              {caps.connection === "connected"
                ? "Reconectar cuenta de Google"
                : "Conectar cuenta de Google"}
            </Button>
            {!caps.googleOAuth.available && (
              <p>
                Conexión con Google no configurada en este servidor. Puedes
                importar mediante Google Sheets público.
              </p>
            )}
            <Choice
              label="Método"
              value={method}
              onChange={(v) => {
                setMethod(v);
                setPreview(null);
                setEditing(null);
                setUrl("");
                setMapping((m) => ({ ...m, mappings: [], columns: [] }));
              }}
              options={[
                {
                  value: "google_sheets_public",
                  label: "Google Sheets público",
                },
                ...(caps.googleOAuth.available
                  ? [
                      {
                        value: "google_forms_oauth",
                        label: "Google Forms privado (OAuth)",
                      },
                    ]
                  : []),
              ]}
            />
            {method === "google_sheets_public" && (
              <Alert>
                <AlertDescription>
                  Los datos de una hoja publicada pueden ser accesibles
                  públicamente. Compartir una hoja no equivale a publicarla en
                  la Web. No publiques información que deba permanecer privada.
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="google-source-name">
                  Nombre de la integración
                </FieldLabel>
                <Input
                  id="google-source-name"
                  placeholder="Ej.: Inscripciones categoría Open"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="google-source-url">
                  {method === "google_sheets_public"
                    ? "Enlace de Google Sheets"
                    : "ID o enlace de edición de Forms"}
                </FieldLabel>
                <Input
                  id="google-source-url"
                  placeholder={
                    method === "google_sheets_public"
                      ? "https://docs.google.com/spreadsheets/d/…"
                      : "ID del formulario o enlace de edición"
                  }
                  disabled={!!editing}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setPreview(null);
                  }}
                />
              </Field>
              {method === "google_sheets_public" && (
                <Field>
                  <FieldLabel htmlFor="google-header-row">
                    Fila de encabezados
                  </FieldLabel>
                  <Input
                    id="google-header-row"
                    type="number"
                    min={1}
                    max={100}
                    value={header}
                    onChange={(e) => {
                      setHeader(Number(e.target.value));
                      setPreview(null);
                    }}
                  />
                </Field>
              )}
            </FieldGroup>
            <Tip
              text={
                url
                  ? "Lee la fuente sin guardar nada para que revises las columnas."
                  : "Pega primero el enlace o ID de la fuente."
              }
            >
              <Button
                disabled={busy || !url}
                onClick={() => run(inspect, false)}
              >
                {busy ? "Validando…" : "Validar y previsualizar"}
              </Button>
            </Tip>
            {preview && (
              <>
                {preview.warnings.map((w) => (
                  <Alert key={w}>
                    <AlertDescription>{w}</AlertDescription>
                  </Alert>
                ))}
                <p>
                  {preview.total} respuestas · vista previa de las primeras 10
                </p>
                <Choice
                  label="Categoría predeterminada"
                  value={mapping.category_id}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, category_id: v }))
                  }
                  options={state.categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                />
                {method === "google_sheets_public" && (
                  <Choice
                    label="Columna con identificador único (opcional)"
                    value={mapping.identity_column || "none"}
                    onChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        identity_column: v === "none" ? undefined : v,
                      }))
                    }
                    options={[
                      { value: "none", label: "Sin identificador estable" },
                      ...preview.columns.map((c) => ({
                        value: c.id,
                        label: c.label || `Columna ${c.index + 1}`,
                      })),
                    ]}
                  />
                )}
                <p>
                  Arrastra un campo sobre una columna o utiliza su selector.
                </p>
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <Badge
                      key={t.key}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", t.key)
                      }
                      variant="outline"
                    >
                      {t.label}
                      {t.required ? " *" : ""}
                    </Badge>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.columns.map((c) => (
                          <TableHead key={c.id}>
                            {c.label || `Columna ${c.index + 1}`}
                          </TableHead>
                        ))}
                      </TableRow>
                      <TableRow>
                        {preview.columns.map((c) => (
                          <TableCell
                            key={c.id}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const target =
                                e.dataTransfer.getData("text/plain");
                              if (targets.some((t) => t.key === target))
                                changeMapping(c, target);
                            }}
                          >
                            <select
                              aria-label={`Mapear ${c.label || c.index + 1}`}
                              className="rounded-md border bg-background p-2"
                              value={
                                mapping.mappings.find((m) => m.source === c.id)
                                  ?.target || ""
                              }
                              onChange={(e) => changeMapping(c, e.target.value)}
                            >
                              <option value="">Ignorar columna</option>
                              {targets.map((t) => (
                                <option key={t.key} value={t.key}>
                                  {t.label}
                                  {t.required ? " *" : ""}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((r, index) => (
                        <TableRow key={index}>
                          {preview.columns.map((c) => (
                            <TableCell key={c.id}>
                              {String(r.fields[c.id] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {mapping.mappings.map((m, index) => (
                  <details key={m.target}>
                    <summary>
                      {targets.find((t) => t.key === m.target)?.label} ·
                      equivalencias de valores
                    </summary>
                    <FieldGroup className="pt-4">
                      <Field>
                        <FieldLabel>
                          Una equivalencia por línea: valor Google = valor
                          Torneum
                        </FieldLabel>
                        <textarea
                          className="rounded-md border bg-background p-2"
                          defaultValue={Object.entries(m.values)
                            .map(([a, b]) => `${a}=${b}`)
                            .join("\n")}
                          onBlur={(e) => {
                            const values = Object.fromEntries(
                              e.target.value
                                .split("\n")
                                .filter((x) => x.includes("="))
                                .map((x) => {
                                  const pos = x.indexOf("=");
                                  return [
                                    x.slice(0, pos).trim(),
                                    x.slice(pos + 1).trim(),
                                  ];
                                }),
                            );
                            setMapping((s) => ({
                              ...s,
                              mappings: s.mappings.map((v, i) =>
                                i === index ? { ...v, values } : v,
                              ),
                            }));
                          }}
                        />
                      </Field>
                      <p>
                        {m.target === "category_id"
                          ? "Selecciona las equivalencias de categoría:"
                          : "Los valores sin equivalencia se conservan."}
                      </p>
                      {m.target === "category_id" &&
                        Array.from(
                          new Set(
                            preview.rows
                              .flatMap((r) => {
                                const v = r.fields[m.source || ""];
                                return Array.isArray(v)
                                  ? v.map(String)
                                  : [String(v ?? "")];
                              })
                              .filter(Boolean),
                          ),
                        ).map((value) => (
                          <Choice
                            key={value}
                            label={value}
                            value={m.values[value] || "none"}
                            onChange={(selected) =>
                              setMapping((s) => ({
                                ...s,
                                mappings: s.mappings.map((v, i) =>
                                  i === index
                                    ? {
                                        ...v,
                                        values: {
                                          ...v.values,
                                          [value]:
                                            selected === "none"
                                              ? value
                                              : selected,
                                        },
                                      }
                                    : v,
                                ),
                              }))
                            }
                            options={[
                              { value: "none", label: "Elegir categoría" },
                              ...state.categories.map((c) => ({
                                value: c.id,
                                label: c.name,
                              })),
                            ]}
                          />
                        ))}
                      <p>
                        Opciones:{" "}
                        {targets
                          .find((t) => t.key === m.target)
                          ?.options?.join(", ") || "Texto libre"}
                        . Selección múltiple separada por punto y coma.
                      </p>
                    </FieldGroup>
                  </details>
                ))}
                <details>
                  <summary>Valores fijos</summary>
                  <FieldGroup className="pt-4">
                    {targets
                      .filter(
                        (t) =>
                          t.key !== "category_id" &&
                          !mapping.mappings.some(
                            (m) => m.source && m.target === t.key,
                          ),
                      )
                      .map((t) => (
                        <Field key={t.key}>
                          <FieldLabel>{t.label}</FieldLabel>
                          <Input
                            value={
                              mapping.mappings.find((m) => m.target === t.key)
                                ?.value || ""
                            }
                            onChange={(e) =>
                              setMapping((s) => ({
                                ...s,
                                mappings: [
                                  ...s.mappings.filter(
                                    (m) => m.target !== t.key,
                                  ),
                                  ...(e.target.value
                                    ? [
                                        {
                                          target: t.key,
                                          value: e.target.value,
                                          values: {},
                                          separator: ";",
                                        },
                                      ]
                                    : []),
                                ],
                              }))
                            }
                          />
                        </Field>
                      ))}
                  </FieldGroup>
                </details>
                <p>
                  Obligatorios sin columna o valor:{" "}
                  {targets
                    .filter(
                      (t) =>
                        t.required &&
                        t.key !== "category_id" &&
                        !mapping.mappings.some((m) => m.target === t.key),
                    )
                    .map((t) => t.label)
                    .join(", ") || "Ninguno"}
                  . Puedes completar respuestas antes de aceptarlas.
                </p>
                <Button disabled={busy} onClick={() => run(saveMapping)}>
                  {editing ? "Guardar mapeo" : "Guardar y sincronizar"}
                </Button>
              </>
            )}
          </section>
          <section className="panel flex flex-col gap-3 p-4 sm:p-6">
            <h2>Fuentes conectadas</h2>
            {!integrations.length && (
              <p className="text-sm text-muted-foreground">
                Aún no hay fuentes. Conecta una arriba para importar
                inscripciones automáticamente.
              </p>
            )}
            {integrations.map((i) => (
              <article
                key={i.id}
                className="rounded-md border p-4 flex flex-col gap-2"
              >
                <strong>{i.name}</strong>
                <p>
                  {i.status} · {i.enabled ? "Sincronización activa" : "Pausada"}{" "}
                  ·{" "}
                  {i.last_sync_at
                    ? new Date(i.last_sync_at).toLocaleString()
                    : "Sin sincronizar"}
                </p>
                {i.last_sync_error && (
                  <Alert variant="destructive">
                    <AlertDescription>{i.last_sync_error}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await mutate(`/v1/integrations/${i.id}/sync`, {});
                        toast.success("Sincronización completada");
                      })
                    }
                  >
                    Sincronizar ahora
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setEditing(i);
                      setMapping(i.mapping);
                      setMethod(i.provider);
                      setUrl(i.config.url || i.config.form_id || "");
                      setName(i.name);
                      setHeader(i.mapping.header_row);
                      setPreview(null);
                    }}
                  >
                    Revisar mapeo
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      run(async () => {
                        await mutate("/v1/integrations/toggle", {
                          id: i.id,
                          enabled: !i.enabled,
                        });
                        toast.success(
                          i.enabled
                            ? "Sincronización pausada"
                            : "Sincronización reanudada",
                        );
                      })
                    }
                  >
                    {i.enabled ? "Pausar" : "Reanudar"}
                  </Button>
                  {i.provider === "google_forms_oauth" && (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            mutate("/v1/integrations/google/forms/publish", {
                              id: i.id,
                              published: true,
                            }),
                          )
                        }
                      >
                        Publicar formulario
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            mutate("/v1/integrations/google/forms/publish", {
                              id: i.id,
                              published: false,
                            }),
                          )
                        }
                      >
                        Cerrar formulario
                      </Button>
                      {i.config.generated && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const r = await mutate(
                                "/v1/integrations/google/forms/update-preview",
                                { id: i.id },
                              );
                              setUpdate({ id: i.id, ...r } as typeof update);
                            }, false)
                          }
                        >
                          Revisar cambios de preguntas
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </section>
          <form
            className="panel flex flex-col gap-4 p-4 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const jobId = createId || crypto.randomUUID();
              setCreateId(jobId);
              void run(async () => {
                const result = await mutate(
                  "/v1/integrations/google/forms/create",
                  {
                    job_id: jobId,
                    tournament_id: tournament.id,
                    category_id: String(d.get("category")),
                    title: String(d.get("title")),
                  },
                );
                toast.success("Borrador creado en Google");
                setCreateId("");
                setUrl(
                  (result.integration as Integration).config.form_id || "",
                );
              });
            }}
          >
            <h2>Crear Google Form desde Torneum</h2>
            <FieldGroup>
              <TextField name="title" label="Título del formulario" />
              <Field>
                <FieldLabel htmlFor="google-create-category">
                  Categoría
                </FieldLabel>
                <select
                  id="google-create-category"
                  name="category"
                  className="rounded-md border bg-background p-2"
                >
                  {state.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>
            <p>
              Se genera un borrador por categoría con el número de participantes
              y los campos configurados. El primer participante será el capitán.
            </p>
            <Button
              type="submit"
              disabled={
                busy ||
                !caps.googleOAuth.available ||
                caps.connection !== "connected"
              }
            >
              Crear borrador
            </Button>
          </form>
        </>
      )}
      <Modal
        open={!!quick}
        onClose={() => setQuick(null)}
        title="Editar respuesta"
        description="Cambia el nombre o la categoría sin aceptar la inscripción."
      >
        {quick && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await bulkUpdate(
                  [quick],
                  () => ({
                    name: String(f.get("name") || "").trim(),
                    category_id: String(f.get("category_id") || ""),
                  }),
                  "Editada",
                );
                setQuick(null);
              });
            }}
          >
            <TextField
              name="name"
              label="Nombre del equipo"
              defaultValue={quick.normalized.name}
            />
            <Choice
              name="category_id"
              label="Categoría"
              value={quick.normalized.category_id}
              onChange={(v) =>
                setQuick({
                  ...quick,
                  normalized: { ...quick.normalized, category_id: v },
                })
              }
              options={state.categories.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
            <Button type="submit" disabled={busy}>
              Guardar
            </Button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Revisar respuesta"
        description="Compara la respuesta con las inscripciones existentes antes de decidir."
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {selected.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  {selected.errors.join(" · ")}
                </AlertDescription>
              </Alert>
            )}
            {selected.collisions.map((c) => (
              <Alert key={c.id}>
                <AlertDescription>
                  <strong>
                    {c.score}% · {c.data.name}
                  </strong>
                  <p>
                    {c.data.players?.map((p) => p.name).join(" · ")} ·{" "}
                    {c.data.email} · {c.data.phone}
                  </p>
                  <p>
                    {c.source} · Coincide: {c.reasons.join(", ")}
                  </p>
                  {c.kind === "team" && admin && (
                    <Button variant="outline" onClick={() => setLink(c.id)}>
                      Elegir como original
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            ))}
            <form
              id={selectionFormId}
              onSubmit={(e) => {
                e.preventDefault();
                const data = registrationFromForm(
                  new FormData(e.currentTarget),
                  schema,
                  state.categories,
                );
                void run(async () => {
                  await resolve(selected, "accept", { data, distinct });
                  setSelected(null);
                });
              }}
            >
              <RegistrationFields
                key={selected.id}
                schema={schema}
                categories={state.categories}
                initial={selected.normalized}
              />
            </form>
            {admin && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={distinct}
                    onChange={(e) => setDistinct(e.target.checked)}
                  />{" "}
                  Confirmo que es una inscripción distinta
                </label>
                <Choice
                  label="Inscripción original"
                  value={link || "none"}
                  onChange={(v) => setLink(v === "none" ? "" : v)}
                  options={[
                    { value: "none", label: "Seleccionar original" },
                    ...state.teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
                <div className="flex flex-col gap-2">
                  <p>
                    Campos a aplicar al original (correo, categoría y pagos se
                    conservan):
                  </p>
                  {[
                    ["name", "Nombre del equipo"],
                    ["phone", "Teléfono"],
                    ["players", "Participantes y sus adicionales"],
                    ["extra_answers", "Adicionales del equipo"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={applyFields.includes(key)}
                        onChange={(e) =>
                          setApplyFields((s) =>
                            e.target.checked
                              ? [...s, key]
                              : s.filter((v) => v !== key),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                form={selectionFormId}
                type="submit"
                disabled={
                  busy ||
                  !!selected.team_id ||
                  (selected.review_required && !admin)
                }
              >
                Aceptar como nueva
              </Button>
              {admin && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy || !link}
                    onClick={() =>
                      run(async () => {
                        await resolve(selected, "link", { team_id: link });
                        setSelected(null);
                      })
                    }
                  >
                    Vincular sin cambiar original
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !link || !applyFields.length}
                    onClick={() =>
                      run(async () => {
                        const form = document.getElementById(
                          selectionFormId,
                        ) as HTMLFormElement;
                        const data = registrationFromForm(
                          new FormData(form),
                          schema,
                          state.categories,
                        );
                        await resolve(selected, "apply", {
                          team_id: link,
                          fields: applyFields,
                          data,
                        });
                        setSelected(null);
                      })
                    }
                  >
                    Aplicar campos seleccionados
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      window.confirm(
                        "¿Descartar esta respuesta? No se creará ninguna inscripción.",
                      ) &&
                      run(async () => {
                        await resolve(selected, "discard");
                        setSelected(null);
                        toast.success("Respuesta descartada");
                      })
                    }
                  >
                    Descartar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={internal}
        onClose={() => setInternal(false)}
        title="Alta del organizador"
        description="Usa las mismas reglas de cupo, pago y verificación del formulario público."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void run(async () => {
              const data = registrationFromForm(
                new FormData(form),
                schema,
                state.categories,
              );
              const r = await action("/v1/registrations/internal", {
                tournament_id: tournament.id,
                data,
              });
              toast.success(
                r.review_pending
                  ? "Solicitud pendiente de revisión"
                  : "Inscripción creada",
              );
              setInternal(false);
            });
          }}
        >
          <FieldGroup>
            <RegistrationFields schema={schema} categories={state.categories} />
            <Button type="submit" disabled={busy}>
              Registrar
            </Button>
          </FieldGroup>
        </form>
      </Modal>
      <Modal
        open={!!update}
        onClose={() => setUpdate(null)}
        title="Actualizar preguntas de Google"
        description="Revisa las preguntas actuales y propuestas. Google rechazará el cambio si alguien edita el formulario entretanto."
      >
        {update && (
          <div className="flex flex-col gap-4">
            <details>
              <summary>Preguntas actuales</summary>
              <ul>
                {(update.current as { title?: string }[]).map((item, index) => (
                  <li key={index}>{item.title || "Pregunta sin título"}</li>
                ))}
              </ul>
            </details>
            <ul>
              {update.targets.map((t) => (
                <li key={t.key}>
                  {t.label} · {t.type}
                  {t.required ? " · obligatoria" : ""}
                </li>
              ))}
            </ul>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await mutate("/v1/integrations/google/forms/update", {
                    id: update.id,
                    revision: update.revision,
                    schema_hash: update.schema_hash,
                  });
                  setUpdate(null);
                })
              }
            >
              Aplicar actualización revisada
            </Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
