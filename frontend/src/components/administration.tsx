"use client";
import {ArchiveDetails} from "./archive";
import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
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
  Submit,
  Choice,
  Confirm,
  EmptyState,
  Status,
  formValue,
} from "./common";
import type { ViewProps } from "./dashboard";
import { date, labels } from "@/lib/api";
export function Administration({
  state,
  actor,
  action,
  view,
}: ViewProps & { view: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState("viewer"),
    [auto, setAuto] = useState(state.tournament!.auto_approve),
    [registration, setRegistration] = useState(
      state.tournament!.registration_open,
    );
  const admin = actor.role === "admin";
  const t = state.tournament!;
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
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <strong>{u.name}</strong>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{labels[u.role]}</TableCell>
                  <TableCell>{u.active ? "Activo" : "Desactivado"}</TableCell>
                  <TableCell>
                    {u.id !== actor.id && (
                      <Confirm
                        title={
                          u.active ? "Desactivar acceso" : "Reactivar acceso"
                        }
                        description={`${u.name} · ${u.email}`}
                        onConfirm={() =>
                          action("/v1/users/access", {
                            id: u.id,
                            active: !u.active,
                          })
                        }
                      >
                        {u.active ? "Desactivar" : "Reactivar"}
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
              <Choice
                label="Rol"
                value={role}
                onChange={setRole}
                options={[
                  "viewer",
                  "registration",
                  "scheduling",
                  "referee",
                  "admin",
                ].map((v) => ({ value: v, label: labels[v] }))}
              />
              <Submit busy={busy} />
            </FieldGroup>
          </form>
        </Modal>
      </>
    );
  if (view === "archivo")
    return (
      <>
        <div className="view-toolbar">
          <p className="text-muted-foreground">
            Los torneos archivados conservan sus resultados y auditoría.
          </p>
          {admin && (
            <Button onClick={() => setOpen(true)}>
              Cerrar torneo y crear siguiente
            </Button>
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
                {state.archives.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{date(a.starts_on)}</TableCell>
                    <TableCell>Archivado <ArchiveDetails id={a.id}/></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : (
          <EmptyState
            title="Tu historia apenas comienza"
            description="Al cerrar el torneo actual aparecerá aquí. Los datos se conservarán."
          />
        )}
        <Modal
          title="Cerrar torneo y crear siguiente"
          description="El torneo actual quedará archivado. Deben estar finalizados todos sus encuentros."
          open={open}
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const d = new FormData(e.currentTarget);
              try {
                await action("/v1/tournaments/new", {
                  name: formValue(d, "name"),
                  venue: formValue(d, "venue"),
                  starts_on: formValue(d, "start"),
                  ends_on: formValue(d, "end"),
                  archive_current: true,
                });
                setOpen(false);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <TextField name="name" label="Nombre del siguiente torneo" />
              <TextField name="venue" label="Sede" />
              <TextField name="start" label="Fecha de inicio" type="date" />
              <TextField name="end" label="Fecha de cierre" type="date" />
              <Submit busy={busy} label="Archivar actual y crear torneo" />
            </FieldGroup>
          </form>
        </Modal>
      </>
    );
  return (
    <div className="settings-layout">
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
              await action("/v1/settings", {
                name: formValue(d, "name"),
                venue: formValue(d, "venue"),
                starts_on: formValue(d, "start"),
                ends_on: formValue(d, "end"),
                auto_approve: auto,
                registration_open: registration,
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
            <TextField label="Sede" name="venue" defaultValue={t.venue} />
            <FieldGroup className="grid grid-cols-2 gap-4">
              <TextField
                label="Fecha de inicio"
                name="start"
                type="date"
                defaultValue={t.starts_on.slice(0, 10)}
              />
              <TextField
                label="Fecha de cierre"
                name="end"
                type="date"
                defaultValue={t.ends_on.slice(0, 10)}
              />
            </FieldGroup>
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
                <FieldLabel htmlFor="auto-approve">
                  Aprobación automática
                </FieldLabel>
                <FieldDescription>
                  Confirma la categoría tras verificar el correo del capitán.
                </FieldDescription>
              </div>
              <Switch
                id="auto-approve"
                checked={auto}
                onCheckedChange={setAuto}
              />
            </Field>
            <Submit busy={busy} />
          </FieldGroup>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Historial de actividad</h2>
        </div>
        <div className="audit-list">
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
    </div>
  );
}
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
