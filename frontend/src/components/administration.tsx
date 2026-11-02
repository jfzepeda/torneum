"use client";
import { CollaboratorAssignments } from "./workspaces";
import { PaymentSettings } from "./payments";
import {ArchiveDetails} from "./archive";
import { useState } from "react";
import { Plus, ShieldCheck, Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Modal,
  TextField,
  DateRangeField,
  Submit,
  Choice,
  Confirm,
  EmptyState,
  Status,
  formValue,
} from "./common";
import type { ViewProps } from "./dashboard";
import { defaultSchema } from "./registration-fields";
import { date, labels } from "@/lib/api";
function BrandSettings({
  state,
  action,
}: Pick<ViewProps, "state" | "action">) {
  const org = state.organization;
  const [color, setColor] = useState(org.brand_color || "#24724b"),
    [bg, setBg] = useState(org.brand_bg || ""),
    [card, setCard] = useState(org.brand_card || ""),
    [platform, setPlatform] = useState(!!org.brand_platform),
    [busy, setBusy] = useState(false);
  const save = async (
    brand_color: string | null,
    brand_bg: string | null,
    brand_card: string | null,
  ) => {
    setBusy(true);
    try {
      await action("/v1/branding", {
        brand_color,
        brand_bg,
        brand_card,
        brand_platform: platform,
      });
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel settings-form">
      <div className="panel-heading">
        <div>
          <h2>Colores del club</h2>
          <p>Se aplica al portal público del torneo.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(color, bg || null, card || null);
        }}
      >
        <FieldGroup>
          <Field orientation="horizontal">
            <div>
              <FieldLabel htmlFor="brand-color">Color principal</FieldLabel>
              <FieldDescription>
                {org.brand_color ? color : "Usando el verde de Torneum."}
              </FieldDescription>
            </div>
            <input
              id="brand-color"
              type="color"
              className="brand-swatch"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
          <Field orientation="horizontal">
            <div>
              <FieldLabel htmlFor="brand-bg">Color de fondo</FieldLabel>
              <FieldDescription>
                {bg || "Usando el fondo de Torneum."} Solo en modo claro.
              </FieldDescription>
            </div>
            <input
              id="brand-bg"
              type="color"
              className="brand-swatch"
              value={bg || "#fafbf9"}
              onChange={(e) => setBg(e.target.value)}
            />
          </Field>
          <Field orientation="horizontal">
            <div>
              <FieldLabel htmlFor="brand-card">Color de tarjetas</FieldLabel>
              <FieldDescription>
                {card || "Usando blanco."} Solo en modo claro.
              </FieldDescription>
            </div>
            <input
              id="brand-card"
              type="color"
              className="brand-swatch"
              value={card || "#ffffff"}
              onChange={(e) => setCard(e.target.value)}
            />
          </Field>
          <Field orientation="horizontal">
            <div>
              <FieldLabel htmlFor="brand-platform">
                Aplicar también a plataforma
              </FieldLabel>
              <FieldDescription>
                Usa el color en este panel de organizador.
              </FieldDescription>
            </div>
            <Switch
              id="brand-platform"
              checked={platform}
              onCheckedChange={setPlatform}
            />
          </Field>
          <div className="flex gap-2">
            <Submit busy={busy} />
            {(org.brand_color || org.brand_bg || org.brand_card) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void save(null, null, null)}
              >
                Restablecer
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
const highlightIcons = [
  { value: "trophy", label: "Trofeo" },
  { value: "gift", label: "Regalo" },
  { value: "target", label: "Objetivo" },
  { value: "star", label: "Estrella" },
  { value: "award", label: "Medalla" },
  { value: "users", label: "Jugadores" },
];
export function Administration({
  state,
  actor,
  action,
  view,
}: ViewProps & { view: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState("viewer"),
    [search, setSearch] = useState(""),
    [archiveSearch, setArchiveSearch] = useState(""),
    [year, setYear] = useState("all"),
    [auto, setAuto] = useState(state.tournament?.auto_approve || false),
    [registration, setRegistration] = useState(
      state.tournament?.registration_open || false,
    ),
    [requireEmail, setRequireEmail] = useState(
      state.tournament?.registration_schema?.require_email ?? false,
    ),
    [icons, setIcons] = useState(() =>
      [0, 1, 2].map((i) => state.tournament?.highlights?.[i]?.icon || "trophy"),
    );
  const admin = actor.role === "admin";
  const q = search.trim().toLowerCase();
  const t = state.tournament;
  if (!admin && view !== "archivo")
    return (
      <Alert>
        <ShieldCheck />
        <AlertTitle>Acceso de administrador</AlertTitle>
        <AlertDescription>
          Tu rol puede consultar y operar sus módulos asignados. Esta sección
          requiere permisos de administración.
        </AlertDescription>
      </Alert>
    );
  if (view === "colaboradores")
    return (
      <>
        <div className="view-toolbar">
          <p className="text-muted-foreground">
            Roles fijos, permisos verificados por el servidor.
          </p>
          <Input
            className="max-w-xs"
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar colaboradores"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={() => setOpen(true)}>
            <Plus data-icon="inline-start" />
            Añadir colaborador
          </Button>
        </div>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Rol
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            role="img"
                            aria-label="Qué puede hacer cada rol"
                            className="inline-flex"
                          />
                        }
                      >
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{ROLE_HELP}</TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Torneos asignados</TableHead>
                <TableHead>Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.users
                .filter(
                  (u) =>
                    !q ||
                    u.name.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q),
                )
                .map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <strong>{u.name}</strong>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {u.id === actor.id ? (
                      labels[u.role]
                    ) : (
                      <Choice
                        value={u.role}
                        onChange={(v) =>
                          void action("/v1/users/role", {
                            id: u.id,
                            role: v,
                          }).catch(() => {})
                        }
                        options={ROLES.map((v) => ({
                          value: v,
                          label: labels[v],
                        }))}
                      />
                    )}
                  </TableCell>
                  <TableCell
                    className={u.active ? "" : "text-muted-foreground"}
                  >
                    {u.active ? "Activo" : "Desactivado"}
                  </TableCell>
                  <TableCell><CollaboratorAssignments user={u} state={state} action={action} /></TableCell>
                  <TableCell>
                    {u.id === actor.id && (
                      <small className="text-muted-foreground">Tú</small>
                    )}
                    {u.id !== actor.id && !u.active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void action("/v1/users/access", {
                            id: u.id,
                            active: true,
                          }).catch(() => {})
                        }
                      >
                        Reactivar
                      </Button>
                    )}
                    {u.id !== actor.id && u.active && (
                      <Confirm
                        title="Desactivar acceso"
                        description={`${u.name} · ${u.email}`}
                        onConfirm={() =>
                          action("/v1/users/access", {
                            id: u.id,
                            active: false,
                          })
                        }
                      >
                        Desactivar
                      </Confirm>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        <Modal
          title="Añadir colaborador"
          open={open}
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const d = new FormData(e.currentTarget);
              try {
                await action("/v1/users", {
                  name: formValue(d, "name"),
                  email: formValue(d, "email"),
                  password: formValue(d, "password"),
                  role,
                });
                setOpen(false);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <TextField name="name" label="Nombre completo" />
              <TextField name="email" label="Correo electrónico" type="email" />
              <TextField
                name="password"
                label="Contraseña inicial (mínimo 12 caracteres)"
                type="password"
              />
              <FieldDescription>{ROLE_HELP}</FieldDescription>
              <Choice
                label="Rol"
                value={role}
                onChange={setRole}
                options={ROLES.map((v) => ({ value: v, label: labels[v] }))}
              />
              <Submit busy={busy} />
            </FieldGroup>
          </form>
        </Modal>
      </>
    );
  if (view === "archivo") {
    const years = [
      ...new Set(
        state.archives.flatMap((a) => (a.starts_on ? [a.starts_on.slice(0, 4)] : [])),
      ),
    ].sort((a, b) => b.localeCompare(a));
    const archives = state.archives.filter(
      (a) =>
        a.name.toLowerCase().includes(archiveSearch.trim().toLowerCase()) &&
        (year === "all" || a.starts_on?.slice(0, 4) === year),
    );
    return (
      <>
        <div className="view-toolbar">
          <p className="text-muted-foreground">
            Los torneos archivados conservan sus resultados y auditoría.
          </p>
          {!!state.archives.length && (
            <div className="flex gap-2">
              <Input
                className="w-56"
                placeholder="Buscar por nombre"
                aria-label="Buscar torneos archivados"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
              />
              <div className="w-32">
                <Choice
                  value={year}
                  onChange={setYear}
                  options={[
                    { value: "all", label: "Todos" },
                    ...years.map((y) => ({ value: y, label: y })),
                  ]}
                />
              </div>
            </div>
          )}
        </div>
        {state.archives.length ? (
          <section className="panel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Torneo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archives.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.starts_on ? date(a.starts_on) : a.dates_label || "Por confirmar"}</TableCell>
                    <TableCell>Archivado <ArchiveDetails id={a.id}/></TableCell>
                  </TableRow>
                ))}
                {!archives.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Ningún torneo coincide con la búsqueda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </section>
        ) : (
          <EmptyState
            title="Tu historia apenas comienza"
            description="Al cerrar el torneo actual aparecerá aquí. Los datos se conservarán."
          />
        )}
      </>
    );
  }
  if (view === "configuracion") return <div className="settings-layout"><BrandSettings state={state} action={action} /><PaymentSettings state={state} scope="club" /></div>;
  if (!t) return <EmptyState title="Selecciona un torneo" description="Los ajustes de un torneo aparecen al seleccionarlo en el sidebar." />;
  return (
    <div className="settings-layout">
      <div className="min-w-0 space-y-6">
      <section className="panel settings-form">
        <div className="panel-heading">
          <div>
            <h2>Información del torneo</h2>
            <p>Estos datos se muestran en el portal público.</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const d = new FormData(e.currentTarget);
            try {
              if (
                requireEmail !==
                (t.registration_schema?.require_email ?? false)
              )
                await action("/v1/registration-fields/save", {
                  tournament_id: t.id,
                  schema: {
                    ...(t.registration_schema || defaultSchema),
                    require_email: requireEmail,
                  },
                });
              await action("/v1/settings", {
                name: formValue(d, "name"),
                venue: formValue(d, "venue"),
                city: formValue(d, "city"),
                starts_on: formValue(d, "start") || null,
                ends_on: formValue(d, "end") || null,
                dates_label: formValue(d, "dates_label"),
                auto_approve: auto,
                registration_open: registration,
                highlights: icons
                  .map((icon, i) => ({
                    icon,
                    title: formValue(d, `highlight-title-${i}`),
                    text: formValue(d, `highlight-text-${i}`),
                  }))
                  .filter((h) => h.title),
              });
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <TextField
              label="Nombre del torneo"
              name="name"
              defaultValue={t.name}
            />
            <FieldGroup className="grid grid-cols-2 gap-4">
              <TextField
                label="Club / Sede"
                name="venue"
                defaultValue={t.venue}
              />
              <TextField
                label="Ciudad"
                name="city"
                required={false}
                defaultValue={t.city}
              />
            </FieldGroup>
            <DateRangeField
              label="Fechas del torneo"
              startName="start"
              endName="end"
              defaultStart={t.starts_on?.slice(0, 10)}
              defaultEnd={t.ends_on?.slice(0, 10)}
              defaultCustom={!t.starts_on}
              defaultLabel={t.dates_label}
            />
            <Field orientation="horizontal">
              <div>
                <FieldLabel htmlFor="registration-open">
                  Inscripciones abiertas
                </FieldLabel>
                <FieldDescription>
                  Permite que nuevas parejas se registren.
                </FieldDescription>
              </div>
              <Switch
                id="registration-open"
                checked={registration}
                onCheckedChange={setRegistration}
              />
            </Field>
            <Field orientation="horizontal">
              <div>
                <FieldLabel htmlFor="require-email">
                  Correo obligatorio
                </FieldLabel>
                <FieldDescription>
                  Exige correo con verificación al inscribirse. Apagado, el
                  correo es opcional y no se verifica.
                </FieldDescription>
              </div>
              <Switch
                id="require-email"
                checked={requireEmail}
                onCheckedChange={setRequireEmail}
              />
            </Field>
            <Field orientation="horizontal">
              <div>
                <FieldLabel htmlFor="auto-approve">
                  Aprobación automática
                </FieldLabel>
                <FieldDescription>
                  Aprueba la participación cuando correo y pago estén confirmados.
                </FieldDescription>
              </div>
              <Switch
                id="auto-approve"
                checked={auto}
                onCheckedChange={setAuto}
              />
            </Field>
            <FieldDescription>
              Destacados del portal (premios, kit, formato…). Deja el título
              vacío para ocultar una tarjeta.
            </FieldDescription>
            {icons.map((icon, i) => (
              <FieldGroup key={i} className="grid grid-cols-[10rem_1fr] gap-4">
                <Choice
                  label={`Ícono ${i + 1}`}
                  value={icon}
                  onChange={(v) =>
                    setIcons(icons.map((x, j) => (j === i ? (v as typeof x) : x)))
                  }
                  options={highlightIcons}
                />
                <TextField
                  label={`Título ${i + 1}`}
                  name={`highlight-title-${i}`}
                  required={false}
                  defaultValue={t.highlights?.[i]?.title}
                />
                <div className="col-span-2">
                  <TextField
                    label={`Descripción ${i + 1}`}
                    name={`highlight-text-${i}`}
                    required={false}
                    defaultValue={t.highlights?.[i]?.text}
                  />
                </div>
              </FieldGroup>
            ))}
            <Submit busy={busy} />
          </FieldGroup>
        </form>
      </section>
      <PaymentSettings state={state} scope="categories" />
      </div>
      <div className="min-w-0 space-y-6">
      <PaymentSettings state={state} scope="tournament" />
      <section className="panel">
        <div className="panel-heading">
          <h2>Historial de actividad</h2>
        </div>
        <div className="audit-list">
          {!state.audit.length && (
            <p className="text-muted-foreground text-sm">
              Aún no hay actividad registrada.
            </p>
          )}
          {state.audit.map((event) => (
            <div key={event.id}>
              <span className="audit-dot" />
              <div>
                <strong>{auditLabel(event.action)}</strong>
                <small>
                  {date(event.created_at, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel p-5"><h2>Archivar torneo</h2><p>Se conserva su historial. Todos los partidos deben haber terminado.</p><Confirm title={`Archivar ${t.name}`} description="Este torneo dejará de aceptar inscripciones. Los demás torneos seguirán abiertos." onConfirm={() => action("/v1/workspaces/archive", {tournament_id:t.id})}>Archivar torneo</Confirm></section>
      </div>
    </div>
  );
}
const ROLES = ["viewer", "registration", "scheduling", "referee", "admin"];
const ROLE_HELP =
  "Visor: solo consulta. Inscripciones: gestiona parejas. Programación: horarios y canchas. Árbitro: registra resultados. Administrador: acceso total.";
function auditLabel(action: string) {
  return (
    (
      {
        "draw.publish": "Sorteo publicado",
        "result.report": "Resultado registrado",
        "schedule.change": "Programación actualizada",
        "schedule.undo": "Programación deshecha",
        "registration.review": "Inscripción revisada",
        "category.create": "Categoría creada",
        "tournament.update": "Torneo actualizado",
        "organization.branding": "Color del club actualizado",
        "registration.create": "Pareja registrada",
        "request.review": "Solicitud resuelta",
        "sponsor.save": "Patrocinador actualizado",
        "message.draft": "Propuesta creada",
        "message.approve": "Propuesta aprobada",
        "message.queue": "Mensaje en cola",
        "message.sent": "Mensaje enviado",
        "user.create": "Colaborador creado",
      } as Record<string, string>
    )[action] || action
  );
}
