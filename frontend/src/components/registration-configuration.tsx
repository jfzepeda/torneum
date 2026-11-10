"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Choice } from "./common";
import { defaultSchema, type RegistrationSchema, type ExtraField } from "./registration-fields";
import type { ViewProps } from "./dashboard";
import { TournamentPaymentSettings } from "./registration-payment-settings";

export function RegistrationConfiguration(props: ViewProps) {
  const [tab, setTab] = useState("fields");
  if (props.actor.role !== "admin") return <p>Solo el administrador puede configurar el formulario.</p>;
  return <section className="space-y-6">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Configuración de inscripción">
      <Button variant={tab === "fields" ? "default" : "outline"} onClick={() => setTab("fields")}>Formulario y campos</Button>
      <Button variant={tab === "payments" ? "default" : "outline"} onClick={() => setTab("payments")}>Medios y datos de pago</Button>
    </div>
    {tab === "fields" ? <RegistrationFormSettings {...props} /> : <TournamentPaymentSettings {...props} />}
  </section>;
}

export function RegistrationFormSettings({ state, action, onSaved }: ViewProps & {onSaved?: () => Promise<void>}) {
  const tournament = state.tournament!;
  const [schema, setSchema] = useState<RegistrationSchema>(tournament.registration_schema || defaultSchema);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <FieldGroup className="panel p-4 sm:p-6">
          <Alert>
            <AlertDescription>
              Configura lo que pides a los jugadores, sin conectar Google. Estos campos también se usan en las altas internas y las importaciones. Tallas y kits no modifican el precio.
            </AlertDescription>
          </Alert>
          <Choice
            label="Presentación del formulario público"
            value={schema.layout || "sections"}
            onChange={(v) => setSchema((s) => ({ ...s, layout: v as "sections" | "steps" }))}
            options={[{value: "sections", label: "Una página con secciones (predeterminado)"}, {value: "steps", label: "Tres pasos con Continuar y Volver"}]}
          />
          <Choice
            label="Solicitar correo obligatorio"
            value={String(schema.require_email ?? false)}
            onChange={(v) => setSchema((s) => ({ ...s, require_email: v === "true" }))}
            options={[{ value: "false", label: "No, correo opcional y sin verificación" }, { value: "true", label: "Sí, correo obligatorio con verificación" }]}
          />
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
                  await onSaved?.();
                  toast.success("Campos guardados");
                })
              }
            >
              Guardar campos
            </Button>
          </div>
        </FieldGroup>
  </div>;
}
