"use client";
import { useState } from "react";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { TextField, Choice } from "./common";
import type { Category } from "@/lib/types";
export type ExtraField = {
  id: string;
  label: string;
  scope: "team" | "participant";
  type: "text" | "number" | "date" | "select" | "multiselect" | "boolean";
  required: boolean;
  active: boolean;
  options: string[];
};
export type RegistrationSchema = {
  fields: ExtraField[];
  email_mode: "team" | "participant";
  phone_mode: "team" | "participant";
};
export const defaultSchema: RegistrationSchema = {
  fields: [],
  email_mode: "team",
  phone_mode: "team",
};
export type RegistrationData = {
  name: string;
  category_id: string;
  captain: number;
  email: string;
  phone: string;
  players: {
    name: string;
    email?: string;
    phone?: string;
    answers?: Record<string, unknown>;
  }[];
  extra_answers?: Record<string, unknown>;
};
function ExtraInput({
  field,
  prefix,
  value,
}: {
  field: ExtraField;
  prefix: string;
  value?: unknown;
}) {
  const name = prefix + "." + field.id;
  if (field.type === "select" || field.type === "boolean")
    return (
      <Field>
        <FieldLabel htmlFor={name}>
          {field.label}
          {field.required ? " *" : ""}
        </FieldLabel>
        <select
          id={name}
          name={name}
          defaultValue={value === undefined ? "" : String(value)}
          required={field.required}
          className="rounded-md border bg-background p-2"
        >
          <option value="">Selecciona una opción</option>
          {(field.type === "boolean" ? ["true", "false"] : field.options).map(
            (v) => (
              <option key={v} value={v}>
                {v === "true" && field.type === "boolean"
                  ? "Sí"
                  : v === "false" && field.type === "boolean"
                    ? "No"
                    : v}
              </option>
            ),
          )}
        </select>
      </Field>
    );
  if (field.type === "multiselect")
    return (
      <FieldSet>
        <FieldLegend variant="label">
          {field.label}
          {field.required ? " *" : ""}
        </FieldLegend>
        <FieldGroup data-slot="checkbox-group">
          {field.options.map((option) => (
            <label key={option} className="flex items-start gap-2 py-1">
              <input
                type="checkbox"
                name={name}
                value={option}
                defaultChecked={Array.isArray(value) && value.includes(option)}
              />
              {option}
            </label>
          ))}
        </FieldGroup>
      </FieldSet>
    );
  return (
    <TextField
      name={name}
      label={field.label}
      type={
        field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : "text"
      }
      step={field.type === "number" ? 0.01 : undefined}
      placeholder={
        field.type === "number"
          ? "Ej. 10"
          : field.type === "text"
            ? "Escribe tu respuesta"
            : undefined
      }
      required={field.required}
      defaultValue={value === undefined ? "" : String(value)}
    />
  );
}
export function RegistrationFields({
  schema = defaultSchema,
  categories,
  initial,
  onCategoryChange,
}: {
  schema?: RegistrationSchema;
  categories: Category[];
  initial?: RegistrationData;
  onCategoryChange?: (id: string) => void;
}) {
  const [category, setCategory] = useState(
    initial?.category_id || categories[0]?.id || "",
  );
  const [captain, setCaptain] = useState(String(initial?.captain || 0));
  const count =
    categories.find((c) => c.id === category)?.participant_count || 2;
  return (
    <FieldGroup>
      <TextField
        name="name"
        label="Nombre del equipo"
        placeholder="Ej. Los Smashers"
        defaultValue={initial?.name}
      />
      <Choice
        name="category_id"
        label="Categoría"
        value={category}
        onChange={(v) => {
          setCategory(v);
          setCaptain("0");
          onCategoryChange?.(v);
        }}
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
      />
      {Array.from({ length: count }, (_, i) => (
        <fieldset key={i} className="rounded-md border p-4">
          <legend className="px-2 text-sm font-medium">
            Participante {i + 1}{i === Number(captain) ? " · responsable" : ""}
          </legend>
          <FieldGroup>
            <TextField
              name={`players.${i}.name`}
              label={`Nombre del participante ${i + 1}`}
              placeholder="Nombre y apellido"
              defaultValue={initial?.players[i]?.name}
            />
            {schema.email_mode === "participant" && (
              <TextField
                name={`players.${i}.email`}
                label={`Correo del participante ${i + 1}`}
                type="email"
                placeholder="correo@ejemplo.com"
                defaultValue={initial?.players[i]?.email}
              />
            )}
            {schema.phone_mode === "participant" && (
              <TextField
                name={`players.${i}.phone`}
                label={`Teléfono del participante ${i + 1}`}
                type="tel"
                placeholder="10 dígitos, ej. 55 1234 5678"
                required={false}
                defaultValue={initial?.players[i]?.phone}
              />
            )}
            {schema.fields
              .filter((f) => f.active && f.scope === "participant")
              .map((f) => (
                <ExtraInput
                  key={f.id}
                  field={f}
                  prefix={`players.${i}.answers`}
                  value={initial?.players[i]?.answers?.[f.id]}
                />
              ))}
          </FieldGroup>
        </fieldset>
      ))}
      <Choice
        name="captain"
        label="Responsable de la inscripción"
        value={String(Math.min(Number(captain), count - 1))}
        onChange={setCaptain}
        options={Array.from({ length: count }, (_, i) => ({
          value: String(i),
          label: `Participante ${i + 1}`,
        }))}
      />
      {schema.email_mode === "team" && (
        <TextField
          name="email"
          label="Correo de contacto del equipo"
          type="email"
          placeholder="correo@ejemplo.com"
          defaultValue={initial?.email}
        />
      )}
      {schema.phone_mode === "team" && (
        <TextField
          name="phone"
          label="Teléfono del equipo (opcional)"
          type="tel"
          placeholder="10 dígitos, ej. 55 1234 5678"
          required={false}
          defaultValue={initial?.phone}
        />
      )}
      {schema.fields
        .filter((f) => f.active && f.scope === "team")
        .map((f) => (
          <ExtraInput
            key={f.id}
            field={f}
            prefix="extra_answers"
            value={initial?.extra_answers?.[f.id]}
          />
        ))}
    </FieldGroup>
  );
}
export function registrationFromForm(
  form: FormData,
  schema: RegistrationSchema,
  categories: Category[],
): RegistrationData {
  const string = (key: string) => String(form.get(key) || "").trim();
  const category = string("category_id");
  const count =
    categories.find((c) => c.id === category)?.participant_count || 2;
  function extras(prefix: string, scope: string) {
    const result: Record<string, unknown> = {};
    for (const f of schema.fields.filter(
      (f) => f.active && f.scope === scope,
    )) {
      const key = prefix + "." + f.id;
      let value: unknown =
        f.type === "multiselect" ? form.getAll(key).map(String) : string(key);
      if (value === "" || (Array.isArray(value) && !value.length)) {
        if (f.required) throw new Error(`Falta ${f.label}.`);
        continue;
      }
      if (f.type === "number") value = Number(value);
      if (f.type === "boolean") value = value === "true";
      result[f.id] = value;
    }
    return result;
  }
  return {
    name: string("name"),
    category_id: category,
    captain: Number(string("captain") || 0),
    email: string("email"),
    phone: string("phone"),
    players: Array.from({ length: count }, (_, i) => ({
      name: string(`players.${i}.name`),
      email: string(`players.${i}.email`),
      phone: string(`players.${i}.phone`),
      answers: extras(`players.${i}.answers`, "participant"),
    })),
    extra_answers: extras("extra_answers", "team"),
  };
}
