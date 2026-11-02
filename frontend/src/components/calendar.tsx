"use client";
import { useState } from "react";
import {
  CalendarDays,
  Plus,
  Undo2,
  GripVertical,
  Sparkles,
  ArrowRight,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Status,
  Modal,
  TextField,
  DateField,
  Submit,
  Choice,
  Confirm,
  EmptyState,
  formValue,
} from "./common";
import type { ViewProps } from "./dashboard";
import type { Match, Court } from "@/lib/types";
import { date, time } from "@/lib/api";
function Tip({ text, children }: { text: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
type Change = { id: string; court_id: string | null; starts_at: string | null };
export function CalendarView({ state, actor, action }: ViewProps) {
  const [day, setDay] = useState((state.tournament!.starts_on ?? new Date().toLocaleDateString("sv-SE")).slice(0, 10)),
    [drag, setDrag] = useState<Match | null>(null),
    [editing, setEditing] = useState<Match | null>(null),
    [court, setCourt] = useState(state.courts[0]?.id || ""),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Change[] | null>(null),
    [pending, setPending] = useState<Change[] | null>(null),
    [slotHour, setSlotHour] = useState<number | null>(null),
    [category, setCategory] = useState("all"),
    [editCourt, setEditCourt] = useState<Court | null>(null),
    [courtEnabled, setCourtEnabled] = useState(true);
  const can = ["admin", "scheduling"].includes(actor.role);
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Por definir";
  const unplanned = state.matches.filter(
    (m) =>
      m.status === "unscheduled" &&
      m.home_id &&
      m.away_id &&
      (category === "all" || m.category_id === category),
  );
  const scheduled = state.matches.filter(
    (m) =>
      m.starts_at &&
      date(m.starts_at, { year: "numeric", month: "2-digit", day: "2-digit" })
        .split("/")
        .reverse()
        .join("-") === day,
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
  }).format(new Date());
  const nowHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const allHours = Array.from({ length: 15 }, (_, i) => i + 8);
  async function propose(changes: Change[]) {
    try {
      await action("/v1/schedule", {
        tournament_id: state.tournament!.id,
        changes,
        preview: true,
      });
      setPending(changes);
    } catch {}
  }
  function drop(court_id: string | null, hour?: number, target?: Match) {
    if (!drag || !can) return;
    const starts_at =
      hour === undefined
        ? null
        : new Date(
            `${day}T${String(hour).padStart(2, "0")}:00:00-06:00`,
          ).toISOString();
    const changes: Change[] = [
      { id: drag.id, court_id, starts_at: target?.starts_at || starts_at },
    ];
    if (target && target.id !== drag.id)
      changes.push({
        id: target.id,
        court_id: drag.court_id,
        starts_at: drag.starts_at,
      });
    if (target?.id !== drag.id) void propose(changes);
    setDrag(null);
  }
  return (
    <>
      <div className="view-toolbar">
        <div className="toolbar-filters">
          <CalendarDays size={18} />
          <div className="w-48">
            <DatePicker
              value={day}
              onChange={(v) => v && setDay(v)}
              min={state.tournament!.starts_on?.slice(0, 10)}
              max={state.tournament!.ends_on?.slice(0, 10)}
            />
          </div>
          {day !== today && (
            <Button
              variant="ghost"
              size="sm"
              disabled={
                !state.tournament!.starts_on ||
                today < state.tournament!.starts_on.slice(0, 10) ||
                today > state.tournament!.ends_on!.slice(0, 10)
              }
              onClick={() => setDay(today)}
            >
              Hoy
            </Button>
          )}
          <span className="text-muted-foreground text-sm">
            Ciudad de México · UTC−6
          </span>
        </div>
        <div className="flex gap-2">
          <Tip
            text={
              can
                ? "Revierte el último cambio publicado en el calendario."
                : "Solo administración y programación pueden modificar el calendario."
            }
          >
            <span className="inline-flex">
              <Confirm
                title="Deshacer último cambio"
                description="Se revertirá el último cambio publicado en el calendario."
                confirmLabel="Deshacer"
                disabled={!can}
                onConfirm={() =>
                  action("/v1/schedule/undo", {
                    tournament_id: state.tournament!.id,
                  })
                }
              >
                <Undo2 data-icon="inline-start" />
                Deshacer
              </Confirm>
            </span>
          </Tip>
          <Tip text="Añade una cancha con su horario de apertura.">
            <Button
              variant="outline"
              disabled={!can}
              onClick={() => setAdding(true)}
            >
              <Plus data-icon="inline-start" />
              Cancha
            </Button>
          </Tip>
          <Tip text="Propone horarios para todos los partidos pendientes. Podrás revisarlos antes de publicar.">
          <Button
            disabled={!can || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await action("/v1/schedule/auto", {
                  tournament_id: state.tournament!.id,
                  publish: false,
                });
                setPreview(r.changes as Change[]);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkles data-icon="inline-start" />
            {busy ? "Buscando espacios…" : "Generar calendario"}
          </Button>
          </Tip>
        </div>
      </div>
      <div className="calendar-layout">
        <aside
          className="panel unscheduled"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            drop(null);
          }}
        >
          <div className="panel-heading">
            <div>
              <h2>
                Por agendar <span>{unplanned.length}</span>
              </h2>
              <p>{can ? "Arrastra a una cancha disponible o haz clic para elegir horario." : "Solo lectura: no tienes permiso para programar."}</p>
              <div className="mt-3">
              <Choice
                value={category}
                onChange={setCategory}
                options={[
                  { value: "all", label: "Todas" },
                  ...state.categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
              </div>
            </div>
          </div>
          <div className="unscheduled-list">
            {unplanned.map((m) => (
              <button
                className="schedule-card"
                key={m.id}
                draggable={can}
                onDragStart={() => setDrag(m)}
                title="Clic para programar · arrastra a una cancha"
                onClick={() => {
                  setEditing(m);
                  setSlotHour(null);
                  setCourt(state.courts[0]?.id || "");
                }}
              >
                <div>
                  <small>
                    {state.categories.find((c) => c.id === m.category_id)?.name}
                  </small>
                  <GripVertical size={15} aria-hidden />
                </div>
                <strong>{name(m.home_id)}</strong>
                <span>vs {name(m.away_id)}</span>
                <small>
                  {
                    state.categories.find((c) => c.id === m.category_id)
                      ?.duration_minutes
                  }{" "}
                  min · Grupos
                </small>
              </button>
            ))}
            {!unplanned.length && (
              <EmptyState
                title="Agenda completa"
                description="Todos los encuentros definidos tienen horario."
              />
            )}
          </div>
          <p className="drop-instruction">
            Para desprogramar, arrastra un partido de vuelta aquí. El encuentro
            se conserva y puedes volver a asignarlo.
          </p>
        </aside>
        <section className="panel calendar-panel">
          {!state.courts.length && (
            <EmptyState
              title="Aún no hay canchas"
              description="Añade una cancha con el botón «Cancha» para empezar a programar partidos."
            />
          )}
          <div
            className="calendar-grid"
            style={{
              gridTemplateColumns: `64px repeat(${state.courts.length}, minmax(180px, 1fr))`,
            }}
          >
            <div className="calendar-corner">HORA</div>
            {state.courts.map((c) => (
              <div
                className={"court-heading relative" + (c.enabled ? "" : " opacity-50")}
                key={c.id}
              >
                <span className="court-indicator" />
                {c.name}
                <small>
                  {c.enabled ? `${c.opens_at} — ${c.closes_at}` : "Deshabilitada"}
                </small>
                {can && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1 right-1"
                    aria-label={`Editar ${c.name}`}
                    title="Editar cancha"
                    onClick={() => {
                      setEditCourt(c);
                      setCourtEnabled(c.enabled);
                    }}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
            ))}
            {allHours.map((hour) => (
              <div className="calendar-row-contents" key={hour}>
                <div
                  className={"hour-label" + (day === today && hour === nowHour ? " font-bold text-primary" : "")}
                  title={day === today && hour === nowHour ? "Hora actual" : undefined}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
                {state.courts.map((c) => {
                  const matches = scheduled.filter(
                    (m) =>
                      m.court_id === c.id &&
                      Number(
                        new Intl.DateTimeFormat("en-GB", {
                          timeZone: "America/Mexico_City",
                          hour: "2-digit",
                          hour12: false,
                        }).format(new Date(m.starts_at!)),
                      ) === hour,
                  );
                  return (
                    <div
                      className="calendar-slot"
                      key={c.id}
                      onDragOver={(e) => {
                        if (can) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        drop(c.id, hour, matches[0]);
                      }}
                    >
                      {matches.length ? (
                        matches.map((m) => (
                          <div className="relative" key={m.id}>
                          <button
                            className={
                              "schedule-card placed " +
                              (m.status === "finished" ? "completed" : "")
                            }
                            title={`${name(m.home_id)} vs ${name(m.away_id)} · ${time(m.starts_at!)} — ${time(m.ends_at!)} · ${c.name}${m.status === "finished" ? " · Finalizado (no se puede mover)" : ""}`}
                            draggable={can && m.status === "scheduled"}
                            onDragStart={() => setDrag(m)}
                            onClick={() => {
                              setEditing(m);
                              setSlotHour(null);
                              setCourt(m.court_id || c.id);
                            }}
                          >
                            <div>
                              <small>
                                {time(m.starts_at!)} — {time(m.ends_at!)}
                              </small>
                              <Status value={m.status} />
                            </div>
                            <strong>{name(m.home_id)}</strong>
                            <span>{name(m.away_id)}</span>
                          </button>
                          {can && m.status === "scheduled" && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="absolute right-1 bottom-1"
                              aria-label="Desprogramar"
                              title="Desprogramar"
                              onClick={(e) => {
                                e.stopPropagation();
                                void propose([
                                  { id: m.id, court_id: null, starts_at: null },
                                ]);
                              }}
                            >
                              <X />
                            </Button>
                          )}
                          </div>
                        ))
                      ) : (
                        <button
                          className="empty-slot"
                          aria-label={`Agendar en ${c.name} a las ${hour}:00`}
                          title={
                            !can
                              ? "Sin permiso para programar"
                              : !unplanned.length
                                ? "No hay partidos por agendar"
                                : `Agendar «${name(unplanned[0].home_id)} vs ${name(unplanned[0].away_id)}» aquí`
                          }
                          disabled={!can || !unplanned.length}
                          onClick={() => {
                            setEditing(unplanned[0]);
                            setSlotHour(hour);
                            setCourt(c.id);
                          }}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
      <Alert className="mt-5">
        <AlertDescription>
          Arrastra para asignar o intercambiar posiciones. También puedes
          seleccionar un partido para ajustar su horario con teclado o desde el
          móvil. El servidor comprueba cancha, cruces y descansos antes de
          guardar.
        </AlertDescription>
      </Alert>
      <Modal
        title="Programar partido"
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              await propose([
                {
                  id: editing.id,
                  court_id: court,
                  starts_at: new Date(
                    formValue(d, "date") +
                      "T" +
                      formValue(d, "time") +
                      ":00-06:00",
                  ).toISOString(),
                },
              ]);
              setEditing(null);
            }}
          >
            <FieldGroup>
              <p>
                <strong>{name(editing.home_id)}</strong> vs{" "}
                <strong>{name(editing.away_id)}</strong>
              </p>
              <Status value={editing.status} />
              <Choice
                label="Cancha"
                value={court}
                onChange={setCourt}
                options={state.courts.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
              <DateField
                label="Fecha"
                name="date"
                defaultValue={
                  editing.starts_at
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "America/Mexico_City",
                      }).format(new Date(editing.starts_at))
                    : day
                }
              />
              <TextField
                label="Hora (Ciudad de México)"
                type="time"
                name="time"
                defaultValue={
                  editing.starts_at
                    ? new Intl.DateTimeFormat("en-GB", {
                        timeZone: "America/Mexico_City",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(editing.starts_at))
                    : `${String(slotHour ?? 9).padStart(2, "0")}:00`
                }
              />
              {can && ["scheduled", "unscheduled"].includes(editing.status) && (
                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void propose([
                        { id: editing.id, court_id: null, starts_at: null },
                      ]);
                      setEditing(null);
                    }}
                  >
                    Desprogramar
                  </Button>
                  <Submit busy={busy} label="Revisar cambio" />
                </div>
              )}
            </FieldGroup>
          </form>
        )}
      </Modal>
      <Modal
        title="Confirmar programación"
        description="Estos cambios han pasado la validación de conflictos. Se comprobarán nuevamente al publicarlos."
        open={!!pending || !!preview}
        onClose={() => {
          setPending(null);
          setPreview(null);
        }}
      >
        <div className="schedule-preview">
          {(pending || preview || []).map((c) => {
            const m = state.matches.find((m) => m.id === c.id)!;
            return (
              <div key={c.id}>
                <strong>
                  {name(m.home_id)} / {name(m.away_id)}
                </strong>
                <p>
                  {c.starts_at
                    ? `${date(c.starts_at)} · ${time(c.starts_at)} · ${state.courts.find((x) => x.id === c.court_id)?.name}`
                    : "Volver a partidos por agendar"}
                </p>
              </div>
            );
          })}
          {!(pending || preview)?.length && (
            <p>No hay partidos pendientes de programación.</p>
          )}
        </div>
        <Button
          disabled={busy || !(pending || preview)?.length}
          onClick={async () => {
            setBusy(true);
            try {
              await action("/v1/schedule", {
                tournament_id: state.tournament!.id,
                changes: pending || preview,
                preview: false,
              });
              setPending(null);
              setPreview(null);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Publicando…" : "Publicar calendario"}
        </Button>
      </Modal>
      <Modal
        title="Nueva cancha"
        open={adding}
        onClose={() => setAdding(false)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const d = new FormData(e.currentTarget);
            try {
              await action("/v1/courts", {
                name: formValue(d, "name"),
                opens_at: formValue(d, "opens"),
                closes_at: formValue(d, "closes"),
              });
              setAdding(false);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <TextField name="name" label="Nombre de cancha" />
            <TextField
              name="opens"
              label="Abre a las"
              type="time"
              defaultValue="08:00"
            />
            <TextField
              name="closes"
              label="Cierra a las"
              type="time"
              defaultValue="22:00"
            />
            <Submit busy={busy} />
          </FieldGroup>
        </form>
      </Modal>
      <Modal
        title="Editar cancha"
        open={!!editCourt}
        onClose={() => setEditCourt(null)}
      >
        {editCourt && (
          <form
            key={editCourt.id}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const d = new FormData(e.currentTarget);
              try {
                await action("/v1/courts/update", {
                  id: editCourt.id,
                  name: formValue(d, "name"),
                  opens_at: formValue(d, "opens"),
                  closes_at: formValue(d, "closes"),
                  enabled: courtEnabled,
                });
                setEditCourt(null);
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <TextField
                name="name"
                label="Nombre de cancha"
                defaultValue={editCourt.name}
              />
              <TextField
                name="opens"
                label="Abre a las"
                type="time"
                defaultValue={editCourt.opens_at.slice(0, 5)}
              />
              <TextField
                name="closes"
                label="Cierra a las"
                type="time"
                defaultValue={editCourt.closes_at.slice(0, 5)}
              />
              <Field orientation="horizontal">
                <FieldLabel htmlFor="court-enabled">Habilitada</FieldLabel>
                <Switch
                  id="court-enabled"
                  checked={courtEnabled}
                  onCheckedChange={setCourtEnabled}
                />
              </Field>
              <Submit busy={busy} />
            </FieldGroup>
          </form>
        )}
        {editCourt && (
          <div className="flex justify-end border-t pt-4">
            <Confirm
              title={`Eliminar ${editCourt.name}`}
              description="La cancha se eliminará. No se puede eliminar si tiene partidos asignados."
              confirmLabel="Eliminar cancha"
              destructive
              onConfirm={async () => {
                await action("/v1/courts/delete", { id: editCourt.id });
                setEditCourt(null);
              }}
            >
              Eliminar cancha
            </Confirm>
          </div>
        )}
      </Modal>
    </>
  );
}
