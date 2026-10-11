"use client";
import {Research} from "./research";
import { useState } from "react";
import { Plus, Mail, ExternalLink, FileText, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Status,
  Modal,
  TextField,
  Submit,
  Choice,
  Confirm,
  EmptyState,
  formValue,
} from "./common";
import { ChatPanel } from "./chat-panel";
import type { ViewProps } from "./dashboard";
import type { Sponsor, Message } from "@/lib/types";
import { labels } from "@/lib/api";
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
const copy = (text: string, what: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${what} copiado`))
    .catch(() => toast.error("No se pudo copiar"));
export function Sponsors({ state, actor, action }: ViewProps) {
  const [editing, setEditing] = useState<Sponsor | true | null>(null),
    [proposal, setProposal] = useState<Sponsor | null>(null),
    [level, setLevel] = useState("none"),
    [status, setStatus] = useState("prospect"),
    [busy, setBusy] = useState(false),
    [channel, setChannel] = useState("manual"),
    [preview, setPreview] = useState<Message | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [newLevel, setNewLevel] = useState(false);
  if (actor.role !== "admin")
    return (
      <Alert>
        <AlertDescription>
          La gestión comercial requiere permisos de administrador.
        </AlertDescription>
      </Alert>
    );
  const draft = typeof editing === "object" ? editing : null;
  const edit = (s: Sponsor | true) => {
    setEditing(s);
    setLevel(s === true ? "none" : s.level_id || "none");
    setStatus(s === true ? "prospect" : s.status);
  };
  return (
    <Tabs defaultValue="partners">
      <div className="view-toolbar">
        <TabsList>
          <TabsTrigger value="partners">Patrocinadores</TabsTrigger>
          <TabsTrigger value="levels">Paquetes</TabsTrigger>
          <TabsTrigger value="messages">Propuestas y envíos</TabsTrigger>
          <TabsTrigger value="agent">Asistente</TabsTrigger>
        </TabsList>
        <Button onClick={() => edit(true)}>
          <Plus data-icon="inline-start" />
          Nuevo prospecto
        </Button>
      </div>
      <TabsContent value="partners">
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Afinidad</TableHead>
                <TableHead>Evidencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.sponsors.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <strong>{s.name}</strong>
                    <small className="flex items-center gap-1 text-muted-foreground">
                      {s.email || "Sin contacto verificado"}
                      {s.email && (
                        <Tip text="Copiar correo">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Copiar correo de ${s.name}`}
                            onClick={() => copy(s.email!, "Correo")}
                          >
                            <Copy />
                          </Button>
                        </Tip>
                      )}
                    </small>
                  </TableCell>
                  <TableCell>
                    {state.levels.find((l) => l.id === s.level_id)?.name ||
                      "Por definir"}
                  </TableCell>
                  <TableCell>
                    <Tip text="Puntuación de 0 a 100 según presencia local, deporte, antecedentes, contacto y fuente reciente.">
                      <span>{s.affinity} / 100</span>
                    </Tip>
                  </TableCell>
                  <TableCell>{s.evidence.length} {s.evidence.length === 1 ? "fuente" : "fuentes"}</TableCell>
                  <TableCell>
                    <Status value={s.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => edit(s)}>
                        Detalle
                      </Button>
                      <Tip
                        text={
                          s.status === "excluded"
                            ? "Este prospecto está excluido."
                            : !s.email
                              ? "Agrega un correo en el detalle para crear una propuesta."
                              : "Redactar una propuesta de patrocinio."
                        }
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={s.status === "excluded" || !s.email}
                          onClick={() => setProposal(s)}
                        >
                          Propuesta
                        </Button>
                      </Tip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!state.sponsors.length && (
            <EmptyState
              title="La próxima alianza empieza aquí"
              description="Registra un prospecto y conserva las fuentes que respaldan su afinidad."
            />
          )}
        </section>
      </TabsContent>
      <TabsContent value="levels">
        <div className="view-toolbar">
          <p>La visibilidad pública se hereda del paquete asignado.</p>
          <Button variant="outline" onClick={() => setNewLevel(true)}>
            Crear paquete
          </Button>
        </div>
        {!state.levels.length && (
          <EmptyState
            title="Aún no hay paquetes"
            description="Crea un paquete con monto y beneficios para asignarlo a tus prospectos."
          />
        )}
        <div className="category-grid">
          {state.levels.map((l) => (
            <section className="panel level-card" key={l.id}>
              <div className="eyebrow">PATROCINIO</div>
              <h2>{l.name}</h2>
              <strong className="level-amount">
                {Number(l.amount).toLocaleString("es-MX", {
                  style: "currency",
                  currency: "MXN",
                  maximumFractionDigits: 0,
                })}
                <small> MXN</small>
              </strong>
              <p>{l.benefits}</p>
              <small>
                Aparece en:{" "}
                {l.zones
                  .map(
                    (z) =>
                      ({
                        portal: "Portal",
                        calendar: "Calendario",
                        bracket: "Cuadro",
                      })[z] || z,
                  )
                  .join(", ")}
              </small>
            </section>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="messages">
        <div className="view-toolbar">
          <span aria-live="polite">{selected.length} {selected.length === 1 ? "seleccionado" : "seleccionados"}</span>
          <div className="flex flex-wrap gap-2">
            <Confirm
              disabled={!selected.length}
              title="Aprobar propuestas seleccionadas"
              description={state.messages
                .filter((m) => selected.includes(m.id))
                .map((m) => m.sponsor_name + ": " + m.subject)
                .join(" · ")}
              onConfirm={async () => {
                await action("/v1/messages/approve", {
                  ids: selected,
                  confirmed: true,
                });
                setSelected([]);
              }}
            >
              Aprobar selección
            </Confirm>
            <Confirm
              disabled={!selected.length || !state.integrations.gmail}
              title="Enviar lote por Gmail"
              description="Solo los mensajes aprobados de esta selección se podrán encolar. Se aplicará una cadencia mínima de 15 segundos por organización."
              onConfirm={async () => {
                await action("/v1/messages/queue", {
                  ids: selected,
                  confirmed: true,
                });
                setSelected([]);
              }}
            >
              Enviar selección
            </Confirm>
            <Button
              variant="outline"
              title="Abre Google para autorizar el envío desde tu cuenta de Gmail"
              onClick={async () => {
                try {
                  const r = await action("/v1/gmail/connect", {});
                  location.assign(r.url as string);
                } catch {}
              }}
            >
              <Mail data-icon="inline-start" />
              {state.integrations.gmail ? "Reconectar Gmail" : "Conectar Gmail"}
            </Button>
          </div>
        </div>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    aria-label="Seleccionar todas las propuestas"
                    type="checkbox"
                    checked={!!state.messages.length && selected.length === state.messages.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? state.messages.map((m) => m.id) : [])
                    }
                  />
                </TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <input
                      aria-label={`Seleccionar propuesta para ${m.sponsor_name}`}
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, m.id]
                            : s.filter((id) => id !== m.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {m.sponsor_name}
                    <small className="block">{m.email}</small>
                  </TableCell>
                  <TableCell>{m.subject}</TableCell>
                  <TableCell>
                    <Status value={m.status} />
                    {m.error && (
                      <small className="block text-destructive">
                        {m.error}
                      </small>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreview(m)}
                      >
                        Vista previa
                      </Button>
                      {["draft", "approved", "queued", "failed"].includes(
                        m.status,
                      ) && (
                        <Confirm
                          title="Cancelar mensaje"
                          description={m.subject}
                          onConfirm={() =>
                            action("/v1/messages/cancel", { id: m.id })
                          }
                        >
                          Cancelar
                        </Confirm>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!state.integrations.gmail && (
            <small className="block p-3 text-muted-foreground">
              Conecta Gmail para enviar lotes automáticamente; sin él solo podrás abrir correos manuales.
            </small>
          )}
          {!state.messages.length && (
            <EmptyState
              title="No hay propuestas todavía"
              description="Crea una propuesta desde la empresa que quieras contactar."
            />
          )}
        </section>
      </TabsContent>
      <TabsContent value="agent"><Research action={action}/>
        <ChatPanel agent="sponsors" slug={state.organization?.slug} enabled={state.integrations.chatkit} />
      </TabsContent>
      <Modal
        title={draft ? "Editar prospecto" : "Nuevo prospecto"}
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const d = new FormData(e.currentTarget);
            const url = formValue(d, "source");
            try {
              await action("/v1/sponsors", {
                ...(draft ? { id: draft.id } : {}),
                name: formValue(d, "name"),
                website: formValue(d, "website"),
                email: formValue(d, "email"),
                phone: formValue(d, "phone"),
                logo_url: formValue(d, "logo"),
                level_id: level === "none" ? null : level,
                status,
                notes: formValue(d, "notes"),
                evidence: url
                  ? [
                      {
                        url,
                        note: formValue(d, "evidence"),
                        date: new Date().toISOString().slice(0, 10),
                        confidence: "medium",
                      },
                    ]
                  : draft?.evidence || [],
                factors: {
                  local: d.get("local") === "on",
                  sport: d.get("sport") === "on",
                  previous: d.get("previous") === "on",
                  contact: !!formValue(d, "email"),
                  recent: !!url,
                },
              });
              setEditing(null);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <TextField name="name" label="Empresa" defaultValue={draft?.name} />
            <FieldGroup className="grid grid-cols-2 gap-4">
              <TextField
                name="website"
                label="Sitio web (HTTPS)"
                type="url"
                required={false}
                defaultValue={draft?.website}
              />
              <TextField
                name="email"
                label="Correo empresarial público"
                type="email"
                required={false}
                defaultValue={draft?.email}
              />
              <TextField
                name="phone"
                label="Teléfono empresarial"
                required={false}
                defaultValue={draft?.phone}
              />
              <TextField
                name="logo"
                label="URL de logo (HTTPS)"
                type="url"
                required={false}
                defaultValue={draft?.logo_url}
              />
            </FieldGroup>
            <Choice
              label="Paquete sugerido"
              value={level}
              onChange={setLevel}
              options={[
                { value: "none", label: "Por definir" },
                ...state.levels.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
            <Choice
              label="Estado comercial"
              value={status}
              onChange={setStatus}
              options={[
                "prospect",
                "reviewed",
                "negotiation",
                "won",
                "lost",
                "excluded",
              ].map((v) => ({ value: v, label: labels[v] }))}
            />
            <TextField
              name="notes"
              label="Notas"
              required={false}
              defaultValue={draft?.notes}
            />
            <TextField
              name="source"
              label="Fuente de evidencia (URL)"
              type="url"
              required={false}
            />
            <TextField
              name="evidence"
              label="Qué acredita la fuente"
              required={false}
            />
            {draft?.evidence.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-sm"
              >
                {s.note} ↗
              </a>
            ))}
            <div className="flex flex-wrap gap-4 text-sm">
              {[
                ["local", "Presencia local"],
                ["sport", "Afinidad deportiva"],
                ["previous", "Patrocinio previo"],
              ].map(([id, label]) => (
                <label key={id} className="flex gap-2 items-center">
                  <input name={id} type="checkbox" />
                  {label}
                </label>
              ))}
            </div>
            <small className="text-muted-foreground">
              Puntuación: presencia local 25, deporte 25, antecedentes 30,
              contacto 10 y fuente reciente 10. Marca las casillas que apliquen.
            </small>
            <Submit busy={busy} />
          </FieldGroup>
        </form>
      </Modal>
      <Modal
        title={`Propuesta para ${proposal?.name || ""}`}
        open={!!proposal}
        onClose={() => setProposal(null)}
      >
        {proposal && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const d = new FormData(e.currentTarget);
              try {
                await action("/v1/messages", {
                  sponsor_id: proposal.id,
                  subject: formValue(d, "subject"),
                  body: formValue(d, "body"),
                  channel,
                });
                setProposal(null);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <TextField
                name="subject"
                label="Asunto"
                defaultValue={`Invitación a patrocinar ${state.tournament!.name}`}
              />
              <Field>
                <FieldLabel htmlFor="proposal-body">
                  Mensaje editable
                </FieldLabel>
                <textarea
                  id="proposal-body"
                  className="text-area"
                  name="body"
                  rows={9}
                  required
                  defaultValue={`Hola, equipo de ${proposal.name}:\n\nLes invitamos a formar parte de ${state.tournament!.name}, que se realizará en ${state.tournament!.venue}.\n\nNos gustaría presentarles el paquete ${state.levels.find((l) => l.id === proposal.level_id)?.name || "de patrocinio que mejor se adapte a sus objetivos"}. ${state.levels.find((l) => l.id === proposal.level_id)?.benefits || ""}\n\n¿Podemos compartirles los detalles?\n\n${actor.name}\nOrganización del torneo`}
                />
              </Field>
              <Choice
                label="Canal"
                value={channel}
                onChange={setChannel}
                options={[
                  { value: "manual", label: "Correo manual (mailto)" },
                  { value: "gmail", label: "Gmail conectado" },
                ]}
              />
              <Submit busy={busy} label="Guardar borrador" />
            </FieldGroup>
          </form>
        )}
      </Modal>
      <Modal
        title="Vista previa por destinatario"
        description={preview?.email}
        open={!!preview}
        onClose={() => setPreview(null)}
      >
        {preview && (
          <>
            <h3>{preview.subject}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {preview.body}
            </p>
            <Status value={preview.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(preview.body, "Mensaje")}
            >
              <Copy data-icon="inline-start" />
              Copiar mensaje
            </Button>
            {preview.status === "approved" && preview.channel === "manual" && (
              <div className="flex gap-3">
                <Button
                  nativeButton={false}
                  render={
                    <a
                      href={`mailto:${preview.email}?subject=${encodeURIComponent(preview.subject)}&body=${encodeURIComponent(preview.body)}`}
                    />
                  }
                >
                  Abrir correo
                </Button>
                {preview.phone && (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={
                      <a
                        href={`https://wa.me/${preview.phone.replace(/\D/g, "")}?text=${encodeURIComponent(preview.body)}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    Abrir WhatsApp
                  </Button>
                )}
              </div>
            )}
            <small className="text-muted-foreground">
              Abrir un enlace manual no acredita que el mensaje haya sido
              enviado.
            </small>
          </>
        )}
      </Modal>
      <Modal
        title="Nuevo paquete"
        open={newLevel}
        onClose={() => setNewLevel(false)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const d = new FormData(e.currentTarget);
            try {
              await action("/v1/levels", {
                name: formValue(d, "name"),
                amount: Number(d.get("amount")),
                benefits: formValue(d, "benefits"),
                zones: ["portal", "calendar", "bracket"],
                priority: Number(d.get("priority")),
                logo_size: 120,
              });
              setNewLevel(false);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <TextField name="name" label="Nombre del paquete" />
            <TextField
              name="amount"
              label="Monto de referencia (MXN)"
              type="number"
              min={0}
            />
            <TextField name="benefits" label="Beneficios incluidos" />
            <TextField
              name="priority"
              label="Prioridad (1 = principal)"
              type="number"
              min={1}
              max={20}
              defaultValue={1}
            />
            <Submit busy={busy} />
          </FieldGroup>
        </form>
      </Modal>
    </Tabs>
  );
}
