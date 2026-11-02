"use client";
import {TieBreaks} from "./tiebreak";
import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  ArrowUpRight,
  Shuffle,
  Check,
  Flag,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Status,
  Choice,
  TextField,
  Modal,
  EmptyState,
  Submit,
  Confirm,
  formValue,
} from "./common";
import type { ViewProps, Action } from "./dashboard";

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
import type { State, Match, Actor, Team, Category } from "@/lib/types";
import { labels, time, date, API, tournamentSlugs } from "@/lib/api";
const copy = (text: string, what: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${what} copiado`))
    .catch(() => toast.error("No se pudo copiar"));
export function Operations({
  state,
  actor,
  action,
  view,
  initialFilter,
}: ViewProps & { view: string; initialFilter?: string }) {
  const [category, setCategory] = useState("all"),
    [filter, setFilter] = useState(initialFilter || "all"),
    [matchStatus, setMatchStatus] = useState("all"),
    [court, setCourt] = useState("all"),
    [day, setDay] = useState("all"),
    [requestFilter, setRequestFilter] = useState("pending"),
    [walkover, setWalkover] = useState<Match | null>(null),
    [woWinner, setWoWinner] = useState("home"),
    [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] }),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(false),
    [editCategory,setEditCategory]=useState<Category|null>(null),
    [setCount,setSetCount]=useState("3"),
    [selected, setSelected] = useState<Team | null>(null),
    [result, setResult] = useState<Match | null>(null),
    [busy, setBusy] = useState(false),
    [seed, setSeed] = useState(""),
    [preview, setPreview] = useState<{
      groups: string[][];
      seed: string;
      category_id: string;
    } | null>(null),
    [page, setPage] = useState(0);
  const can = (...roles: string[]) =>
    actor.role === "admin" || roles.includes(actor.role);
  const matches = state.matches.filter(
    (m) => category === "all" || m.category_id === category,
  );
  const teams = state.teams.filter(
    (t) =>
      (category === "all" || t.category_id === category) &&
      (filter === "all" || t.status === filter) &&
      (t.name + " " + t.players.map((p) => p.name).join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const toVerify = state.teams.filter((t) => t.status === "verification");
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Por definir";
  // selection is tied to the current filters/page: changing any of them clears it
  const selectionKey = [category, filter, search, page].join("|");
  const picked = selection.key === selectionKey ? selection.ids : [];
  const setPicked = (ids: string[]) => setSelection({ key: selectionKey, ids });
  const pageTeams = teams.slice(page * 12, page * 12 + 12);
  const review = (t: Team, status: string, reason = "Revisión rápida", category_id?: string) =>
    action("/v1/registrations/review", { id: t.id, status, reason, ...(category_id ? { category_id } : {}) });
  const quick = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const reviewBulk = async (status: string) => {
    await action("/v1/registrations/review-bulk", { ids: picked, status, reason: "Revisión rápida" });
    setPicked([]);
  };
  const shownMatches = matches.filter(
    (m) =>
      (matchStatus === "all" || m.status === matchStatus) &&
      (court === "all" || m.court_id === court) &&
      (day === "all" || (m.starts_at && date(m.starts_at)) === day) &&
      (name(m.home_id) + " " + name(m.away_id)).toLowerCase().includes(search.toLowerCase()),
  );
  const days = [...new Set(matches.filter((m) => m.starts_at).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!)).map((m) => date(m.starts_at!)))];
  const pendingRequests = state.requests.filter((r) => r.status === "pending");
  const requests = state.requests.filter((r) => requestFilter === "all" || r.status === requestFilter);
  const duplicate = (c: Category) =>
    quick(() =>
      action("/v1/categories", {
        name: `${c.name} (copia)`,
        capacity: c.capacity,
        group_size: c.group_size,
        qualifiers: c.qualifiers,
        duration_minutes: c.duration_minutes,
        rest_minutes: c.rest_minutes,
        rules: { sets: c.rules.sets, games: c.rules.games, superTiebreak: c.rules.superTiebreak, goldenPoint: c.rules.goldenPoint },
      }),
    );
  const bulkVerify = async (path: string, message: string, body: Record<string, unknown> = {}) => {
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await action(path, body);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const createCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const d = new FormData(e.currentTarget);
    try {
      await action(editCategory?"/v1/categories/update":"/v1/categories", {
        ...(editCategory?{id:editCategory.id}:{}),
        name: formValue(d, "name"),
        capacity: Number(d.get("capacity")),
        group_size: Number(d.get("group_size")),
        qualifiers: Number(d.get("qualifiers")),
        duration_minutes: Number(d.get("duration")),
        rest_minutes: Number(d.get("rest")),
        rules: { sets:Number(setCount), games:Number(d.get("games")), superTiebreak:d.get("superTiebreak")==="on", goldenPoint:d.get("goldenPoint")==="on" },
      });
      setModal(false);
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="view-toolbar">
        <div className="toolbar-filters">
          <div className="search-field">
            <Search size={15} />
            <Input
              aria-label="Buscar parejas"
              placeholder="Buscar pareja o jugador…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Choice
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "Todas las categorías" },
              ...state.categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          {["inscripciones", "equipos"].includes(view) && (
            <Choice
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(0);
              }}
              options={[
                "all",
                "pending",
                "approved",
                "verification",
                "rejected",
                "withdrawn",
              ].map((v) => ({
                value: v,
                label: v === "all" ? "Todos los estados" : labels[v],
              }))}
            />
          )}
          {view === "resultados" && (
            <>
              <Choice
                value={matchStatus}
                onChange={(v) => {
                  setMatchStatus(v);
                  setPage(0);
                }}
                options={["all", "unscheduled", "scheduled", "live", "finished", "disputed"].map((v) => ({
                  value: v,
                  label: v === "all" ? "Todos los estados" : labels[v],
                }))}
              />
              <Choice
                value={court}
                onChange={(v) => {
                  setCourt(v);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: "Todas las canchas" },
                  ...state.courts.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <Choice
                value={day}
                onChange={(v) => {
                  setDay(v);
                  setPage(0);
                }}
                options={[{ value: "all", label: "Todos los días" }, ...days.map((d) => ({ value: d, label: d }))]}
              />
            </>
          )}
        </div>
        {view === "categorias" && can("registration") ? (
          <Button onClick={() => {setEditCategory(null);setSetCount("3");setModal(true);}}>
            <Plus data-icon="inline-start" />
            Nueva categoría
          </Button>
        ) : view === "inscripciones" ? (
          <Button nativeButton={false} render={<Link href={`/${state.organization.slug}/${state.tournament ? tournamentSlugs(state.tournaments).get(state.tournament.id) : ""}/inscripcion`} />}>
            <Plus data-icon="inline-start" />
            Inscribir pareja
          </Button>
        ) : view === "equipos" && can("registration") ? (
          <div className="flex gap-2">
            <Tip text="Vuelve a enviar el correo a las parejas que aún no verifican su correo.">
            <Button
              variant="outline"
              disabled={busy || !toVerify.length}
              onClick={() =>
                bulkVerify(
                  "/v1/registrations/resend-verification",
                  `¿Reenviar el correo de verificación a ${toVerify.length} pareja(s)?`,
                )
              }
            >
              Reenviar verificación{toVerify.length ? ` (${toVerify.length})` : ""}
            </Button>
            </Tip>
            <Tip text="Marca el correo como verificado sin esperar la confirmación del capitán.">
            <Button
              disabled={busy || !toVerify.length}
              onClick={() =>
                bulkVerify(
                  "/v1/registrations/verify-all",
                  `¿Marcar como verificado el correo de ${toVerify.length} pareja(s) sin que el capitán lo confirme?`,
                )
              }
            >
              <Check data-icon="inline-start" />
              Verificar todos
            </Button>
            </Tip>
          </div>
        ) : null}
      </div>
      {["inscripciones", "equipos"].includes(view) && (
        <section className="panel">
          {can("registration") && picked.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm">{picked.length} seleccionada(s)</span>
              <Confirm
                title="Aprobar inscripciones seleccionadas"
                description={`Se aprobarán ${picked.length} pareja(s). Si alguna no puede aprobarse, no se aplicará ningún cambio.`}
                onConfirm={() => reviewBulk("approved")}
              >
                <Check data-icon="inline-start" />
                Aprobar seleccionadas
              </Confirm>
              <Confirm
                title="Rechazar inscripciones seleccionadas"
                description={`Se rechazarán ${picked.length} pareja(s). Si alguna no puede rechazarse, no se aplicará ningún cambio.`}
                destructive
                confirmLabel="Rechazar"
                onConfirm={() => reviewBulk("rejected")}
              >
                <X data-icon="inline-start" />
                Rechazar seleccionadas
              </Confirm>
              <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
                Limpiar selección
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {can("registration") && (
                  <TableHead>
                    <input
                      aria-label="Seleccionar todas las parejas de la página"
                      type="checkbox"
                      checked={!!pageTeams.length && pageTeams.every((t) => picked.includes(t.id))}
                      onChange={(e) => setPicked(e.target.checked ? pageTeams.map((t) => t.id) : [])}
                    />
                  </TableHead>
                )}
                <TableHead>Pareja / jugadores</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Capitán</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageTeams.map((t) => {
                const cat = state.categories.find((c) => c.id === t.category_id);
                return (
                <TableRow key={t.id}>
                  {can("registration") && (
                    <TableCell>
                      <input
                        aria-label={`Seleccionar a ${t.name}`}
                        type="checkbox"
                        checked={picked.includes(t.id)}
                        onChange={(e) =>
                          setPicked(e.target.checked ? [...picked, t.id] : picked.filter((id) => id !== t.id))
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="team-cell">
                      <Avatar>
                        <AvatarFallback>
                          {t.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <strong>{t.name}</strong>
                        <small>
                          {t.players.map((p) => p.name).join(" · ")}
                        </small>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {can("registration") && cat && !cat.draw_published && ["approved", "rejected", "withdrawn"].includes(t.status) ? (
                      <div className="min-w-40">
                        <Choice
                          value={t.category_id}
                          onChange={(v) => v !== t.category_id && void quick(() => review(t, t.status, "Cambio de categoría", v))}
                          options={state.categories
                            .filter((c) => !c.draw_published)
                            .map((c) => ({ value: c.id, label: c.name }))}
                        />
                      </div>
                    ) : (
                      cat?.name
                    )}
                  </TableCell>
                  <TableCell>
                    <strong>{t.players[t.captain || 0]?.name}</strong>
                    <small className="flex items-center gap-1 text-muted-foreground">
                      {t.email}
                      {t.email && (
                        <Tip text="Copiar correo">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Copiar correo de ${t.name}`}
                            onClick={() => copy(t.email!, "Correo")}
                          >
                            <Copy />
                          </Button>
                        </Tip>
                      )}
                    </small>
                  </TableCell>
                  <TableCell>
                    <Status value={t.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {can("registration") && t.status === "pending" && (
                        <>
                          <Tip text="Aprobar">
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label={`Aprobar a ${t.name}`}
                              disabled={busy}
                              onClick={() => void quick(() => review(t, "approved"))}
                            >
                              <Check />
                            </Button>
                          </Tip>
                          <Tip text="Rechazar">
                            <Confirm
                              title={`Rechazar a ${t.name}`}
                              description="La inscripción quedará rechazada."
                              destructive
                              confirmLabel="Rechazar"
                              disabled={busy}
                              onConfirm={() => review(t, "rejected")}
                            >
                              <X />
                              <span className="sr-only">Rechazar</span>
                            </Confirm>
                          </Tip>
                        </>
                      )}
                      {can("registration") && t.status === "approved" && (
                        <Confirm
                          title={`Retirar a ${t.name}`}
                          description="La pareja quedará retirada del torneo."
                          destructive
                          confirmLabel="Retirar"
                          disabled={busy}
                          onConfirm={() => review(t, "withdrawn", "Retiro rápido")}
                        >
                          Retirar
                        </Confirm>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Ver detalle de ${t.name}`}
                        onClick={() => setSelected(t)}
                      >
                        Ver detalle
                        <ArrowUpRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!teams.length && (
            <EmptyState title="No hay parejas con estos filtros" description="Prueba cambiar la categoría, el estatus o la búsqueda." />
          )}
          <div className="pagination">
            <span>{teams.length} parejas</span>
            <div>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Página anterior"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(teams.length / 12))}
              </span>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Página siguiente"
                disabled={(page + 1) * 12 >= teams.length}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      )}
      {view === "categorias" && (
        <div className="category-grid">
          {state.categories
            .filter((c) => category === "all" || c.id === category)
            .map((c) => (
              <section className="panel category-detail" key={c.id}>
                <div className="panel-heading">
                  <h2>{c.name}</h2>
                  <Status value={c.draw_published ? "live" : "pending"} />
                </div>
                <dl>
                  <div>
                    <dt>Parejas confirmadas</dt>
                    <dd>
                      {
                        state.teams.filter(
                          (t) =>
                            t.category_id === c.id && t.status === "approved",
                        ).length
                      }{" "}
                      / {c.capacity}
                    </dd>
                  </div>
                  <div>
                    <dt>Formato</dt>
                    <dd>Grupos + eliminación</dd>
                  </div>
                  <div>
                    <dt>Grupos</dt>
                    <dd>
                      {c.group_size} parejas · {c.qualifiers} clasifican
                    </dd>
                  </div>
                  <div>
                    <dt>Puntuación</dt>
                    <dd>
                      Mejor de {c.rules.sets} · {c.rules.games} juegos
                    </dd>
                  </div>
                  <div>
                    <dt>Duración y descanso</dt>
                    <dd>
                      {c.duration_minutes} min / {c.rest_minutes} min
                    </dd>
                  </div>
                  <div>
                    <dt>Set decisivo</dt>
                    <dd>
                      {c.rules.superTiebreak
                        ? "Super tie-break"
                        : "Set completo"}
                    </dd>
                  </div>
                </dl>
                {can("registration")&&<div className="form-actions"><Button variant="outline" disabled={busy} onClick={()=>void duplicate(c)}>Duplicar</Button></div>}
                {can("registration")&&!c.draw_published&&<div className="form-actions"><Button variant="outline" onClick={()=>{setEditCategory(c);setSetCount(String(c.rules.sets));setModal(true);}}>Editar reglas</Button>{!state.teams.some((t)=>t.category_id===c.id)&&<Button variant="destructive" disabled={busy} onClick={()=>bulkVerify("/v1/categories/delete",`¿Eliminar la categoría "${c.name}"? Esta acción no se puede deshacer.`,{id:c.id})}>Eliminar</Button>}</div>}
              </section>
            ))}
        </div>
      )}
      {view === "grupos" && (
        <>
          <section className="panel draw-panel">
            <div>
              <h2>Sorteo de grupos</h2>
              <p>
                Genera una vista previa con semilla reproducible. Al publicar,
                se bloquean parejas y categorías.
              </p>
            </div>
            <div className="draw-controls">
              <Input
                aria-label="Semilla del sorteo"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Semilla opcional"
              />
              <Tip text="El sorteo reparte las parejas en grupos al azar. La misma semilla siempre da el mismo resultado; nada se publica hasta confirmar.">
              <Button
                disabled={!can("registration") || category === "all"}
                onClick={async () => {
                  try {
                    const r = await action("/v1/draw", {
                      category_id: category,
                      seed: seed || crypto.randomUUID(),
                      publish: false,
                    });
                    setPreview({
                      ...r,
                      category_id: category,
                    } as typeof preview);
                  } catch {}
                }}
              >
                <Shuffle data-icon="inline-start" />
                Vista previa
              </Button>
              </Tip>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.categories.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={category === c.id ? "default" : "outline"}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
            {category === "all" && (
              <small>Selecciona una categoría para sortear.</small>
            )}
          </section>
          <GroupTables state={state} category={category} />{can("registration")&&<TieBreaks state={state} category={category} action={action}/>}
        </>
      )}
      {view === "estadisticas" && (
        <>
          <div className="metric-strip compact">
            <div className="metric">
              <span>Partidos finalizados</span>
              <strong>
                {matches.filter((m) => m.status === "finished").length}
              </strong>
            </div>
            <div className="metric">
              <span>Sets jugados</span>
              <strong>
                {matches
                  .filter((m) => m.status === "finished")
                  .reduce((n, m) => n + (m.score?.sets.length || 0), 0)}
              </strong>
            </div>
            <div className="metric">
              <span>Juegos disputados</span>
              <strong>
                {matches
                  .filter((m) => m.status === "finished")
                  .reduce(
                    (n, m) =>
                      n +
                      (m.score?.sets.reduce((a, [x, y]) => a + x + y, 0) || 0),
                    0,
                  )}
              </strong>
            </div>
            <div className="metric">
              <span>Parejas en competencia</span>
              <strong>
                {teams.filter((t) => t.status === "approved").length}
              </strong>
            </div>
          </div>
          <GroupTables state={state} category={category} detailed />
        </>
      )}
      {view === "resultados" && (
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partido</TableHead>
                <TableHead>Categoría / etapa</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Marcador</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownMatches
                .slice(page * 12, page * 12 + 12)
                .map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <strong>{name(m.home_id)}</strong>
                      <small className="block text-muted-foreground">
                        vs {name(m.away_id)}
                      </small>
                    </TableCell>
                    <TableCell>
                      {
                        state.categories.find((c) => c.id === m.category_id)
                          ?.name
                      }
                      <small className="block text-muted-foreground">
                        {m.stage === "group"
                          ? "Fase de grupos"
                          : `Eliminación · ronda ${m.round}`}
                      </small>
                    </TableCell>
                    <TableCell>
                      {m.starts_at ? (
                        <>
                          {date(m.starts_at)}
                          <small className="block">{time(m.starts_at)}</small>
                        </>
                      ) : (
                        "Por agendar"
                      )}
                    </TableCell>
                    <TableCell className="score-inline">
                      {m.score?.sets.map((s) => s.join("–")).join("  ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Status value={m.status} />
                    </TableCell>
                    <TableCell>
                      {can("referee") && m.home_id && m.away_id && (
                        <div className="flex gap-2">
                          {m.status === "scheduled" && (
                            <Confirm
                              title="Iniciar partido"
                              description={`${name(m.home_id)} vs ${name(m.away_id)} pasará a estar en curso.`}
                              confirmLabel="Iniciar"
                              onConfirm={() => action("/v1/matches/start", { id: m.id })}
                            >
                              Iniciar
                            </Confirm>
                          )}
                          {m.status !== "finished" && (
                            <Tip text="Registrar walkover (W.O.)">
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Registrar walkover de ${name(m.home_id)} contra ${name(m.away_id)}`}
                                onClick={() => {
                                  setWoWinner("home");
                                  setWalkover(m);
                                }}
                              >
                                W.O.
                              </Button>
                            </Tip>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`${m.status === "finished" ? "Corregir" : "Capturar"} resultado de ${name(m.home_id)} contra ${name(m.away_id)}`}
                            onClick={() => setResult(m)}
                          >
                            {m.status === "finished" ? "Corregir" : "Capturar"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {!matches.length ? (
            <EmptyState
              title="El primer partido está por llegar"
              description="Publica un sorteo para generar los encuentros de grupos."
            />
          ) : (
            !shownMatches.length && (
              <EmptyState title="No hay partidos con estos filtros" description="Prueba cambiar el estado, la cancha, el día o la búsqueda." />
            )
          )}
          <div className="pagination">
            <span>{shownMatches.length} partidos</span>
            <div>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Página anterior"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(shownMatches.length / 12))}
              </span>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Página siguiente"
                disabled={(page + 1) * 12 >= shownMatches.length}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      )}
      {view === "cuadro" && (
        <>
          <div className="flex justify-end mb-5">
            <Confirm
              title="Generar cuadro de eliminación"
              description="Se clasificarán las parejas según los resultados confirmados. Todos los partidos de grupos deben estar finalizados."
              disabled={category === "all" || !can("registration")}
              onConfirm={() => action("/v1/bracket", { category_id: category })}
            >
              Generar cuadro
            </Confirm>
          </div>
          <Bracket state={state} category={category} />
        </>
      )}
      {view === "solicitudes" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {["pending", "applied", "rejected", "all"].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={requestFilter === v ? "default" : "outline"}
                onClick={() => setRequestFilter(v)}
              >
                {v === "all" ? "Todas" : labels[v]}
              </Button>
            ))}
            {can("registration") && pendingRequests.length > 0 && (
              <div className="ml-auto flex gap-2">
                <Confirm
                  title="Rechazar todas las solicitudes pendientes"
                  description={`Se rechazarán ${Math.min(pendingRequests.length, 200)} solicitud(es) pendiente(s).`}
                  destructive
                  confirmLabel="Rechazar todas"
                  onConfirm={() =>
                    action("/v1/requests/review-bulk", { ids: pendingRequests.slice(0, 200).map((r) => r.id), approve: false })
                  }
                >
                  Rechazar todas
                </Confirm>
                <Confirm
                  title="Aprobar todas las solicitudes pendientes"
                  description={`Se aplicarán ${Math.min(pendingRequests.length, 200)} cambio(s) solicitado(s). Si alguno falla, no se aplicará ninguno.`}
                  confirmLabel="Aprobar todas"
                  onConfirm={() =>
                    action("/v1/requests/review-bulk", { ids: pendingRequests.slice(0, 200).map((r) => r.id), approve: true })
                  }
                >
                  Aprobar todas las pendientes ({pendingRequests.length})
                </Confirm>
              </div>
            )}
          </div>
          {requests.map((r) => (
            <section className="panel request-card" key={r.id}>
              <div className="panel-heading">
                <div>
                  <h2>{r.team_name}</h2>
                  <p>{r.reason}</p>
                </div>
                <Status value={r.status} />
              </div>
              <div className="comparison">
                <div>
                  <small>ACTUAL</small>
                  {Object.entries(r.before_value).map(([k, v]) => (
                    <p key={k}>
                      {k}:{" "}
                      {state.categories.find((c) => c.id === v)?.name ||
                        labels[v] ||
                        v ||
                        "—"}
                    </p>
                  ))}
                </div>
                <div>
                  <small>SOLICITADO</small>
                  {r.kind === "withdrawal" ? (
                    <p>Retirar inscripción</p>
                  ) : (
                    Object.entries(r.after_value).map(([k, v]) => (
                      <p key={k}>
                        {k}:{" "}
                        {state.categories.find((c) => c.id === v)?.name ||
                          v ||
                          "—"}
                      </p>
                    ))
                  )}
                </div>
              </div>
              {r.status === "pending" && can("registration") && (
                <div className="form-actions">
                  <Confirm
                    title="Rechazar solicitud"
                    description={r.reason}
                    onConfirm={() =>
                      action("/v1/requests/review", {
                        id: r.id,
                        approve: false,
                      })
                    }
                  >
                    Rechazar
                  </Confirm>
                  <Confirm
                    title="Aplicar cambio solicitado"
                    description={r.reason}
                    onConfirm={() =>
                      action("/v1/requests/review", { id: r.id, approve: true })
                    }
                  >
                    Aprobar y aplicar
                  </Confirm>
                </div>
              )}
            </section>
          ))}
          {!requests.length && (
            <EmptyState
              title={requestFilter === "pending" ? "No hay solicitudes pendientes" : "No hay solicitudes con este filtro"}
              description="Las solicitudes de los capitanes aparecerán aquí con la comparación del cambio."
            />
          )}
        </div>
      )}
      <Modal
        title={editCategory?"Editar categoría":"Nueva categoría"}
        open={modal}
        onClose={() => setModal(false)}
      >
        <form onSubmit={createCategory}>
          <FieldGroup>
            <TextField
              label="Nombre"
              name="name"
              placeholder="Varonil · Avanzada"
              defaultValue={editCategory?.name}
            />
            <FieldGroup className="grid grid-cols-2 gap-4">
              <TextField
                label="Cupo de parejas"
                name="capacity"
                type="number"
                defaultValue={editCategory?.capacity??16}
                min={4}
                max={256}
              />
              <TextField
                label="Parejas por grupo"
                name="group_size"
                type="number"
                defaultValue={editCategory?.group_size??4}
                min={3}
                max={8}
              />
              <TextField
                label="Clasificados por grupo"
                name="qualifiers"
                type="number"
                defaultValue={editCategory?.qualifiers??2}
                min={1}
                max={4}
              />
              <TextField
                label="Duración (min)"
                name="duration"
                type="number"
                defaultValue={editCategory?.duration_minutes??60}
                min={15}
                max={240}
              />
              <TextField
                label="Descanso (min)"
                name="rest"
                type="number"
                defaultValue={editCategory?.rest_minutes??30}
                min={0}
                max={240}
              />
            </FieldGroup>
            <Choice label="Número de sets" value={setCount} onChange={setSetCount} options={[{value:"1",label:"Un set"},{value:"3",label:"Mejor de 3"},{value:"5",label:"Mejor de 5"}]}/>
            <TextField name="games" label="Juegos por set" type="number" defaultValue={editCategory?.rules.games??6} min={4} max={6}/>
            <label className="flex gap-2 text-sm"><input type="checkbox" name="superTiebreak" defaultChecked={editCategory?.rules.superTiebreak??true}/>Super tie-break en el set decisivo</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" name="goldenPoint" defaultChecked={editCategory?.rules.goldenPoint??true}/>Punto de oro</label>
            <Submit busy={busy} />
          </FieldGroup>
        </form>
      </Modal>
      <Modal
        title="Vista previa del sorteo"
        description="Al publicar se crearán los partidos y se bloqueará la composición de los grupos."
        open={!!preview}
        onClose={() => setPreview(null)}
      >
        {preview && (
          <>
            <small>Semilla: {preview.seed}</small>
            <div className="draw-preview">
              {preview.groups.map((g, i) => (
                <div key={i}>
                  <h3>Grupo {String.fromCharCode(65 + i)}</h3>
                  {g.map((id) => (
                    <p key={id}>{name(id)}</p>
                  ))}
                </div>
              ))}
            </div>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await action("/v1/draw", {
                    category_id: preview.category_id,
                    seed: preview.seed,
                    publish: true,
                  });
                  setPreview(null);
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publicar sorteo
            </Button>
          </>
        )}
      </Modal>
      <Modal
        title={selected?.name || "Detalle de pareja"}
        open={!!selected}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <RegistrationReview
            team={selected}
            state={state}
            canEdit={can("registration")}
            action={action}
            close={() => setSelected(null)}
          />
        )}
      </Modal>
      <Modal
        title="Registrar walkover (W.O.)"
        description={walkover ? `${name(walkover.home_id)} vs ${name(walkover.away_id)}. Elige la pareja ganadora.` : undefined}
        open={!!walkover}
        onClose={() => !busy && setWalkover(null)}
      >
        {walkover && (
          <FieldGroup>
            <Choice
              label="Ganador"
              value={woWinner}
              onChange={setWoWinner}
              options={[
                { value: "home", label: name(walkover.home_id) },
                { value: "away", label: name(walkover.away_id) },
              ]}
            />
            <Button
              disabled={busy}
              onClick={() =>
                void quick(async () => {
                  await action("/v1/results", {
                    id: walkover.id,
                    score: { sets: [], reason: "walkover", winner: woWinner },
                    confirmed: true,
                  });
                  setWalkover(null);
                })
              }
            >
              Confirmar W.O.
            </Button>
          </FieldGroup>
        )}
      </Modal>
      {result && (
        <ResultModal
          match={result}
          state={state}
          action={action}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}
function RegistrationReview({
  team,
  state,
  canEdit,
  action,
  close,
}: {
  team: Team;
  state: State;
  canEdit: boolean;
  action: Action;
  close: () => void;
}) {
  const [category, setCategory] = useState(team.category_id),
    [decision, setDecision] = useState("approved"),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const d = new FormData(e.currentTarget);
        try {
          await action("/v1/registrations/review", {
            id: team.id,
            status: decision,
            category_id: category,
            reason: formValue(d, "reason"),
          });
          close();
        } catch {
        } finally {
          setBusy(false);
        }
      }}
    >
      <FieldGroup>
        {team.players.map((p, i) => (
          <p key={i}>
            {p.name} {i === team.captain ? "· Capitán" : ""}
          </p>
        ))}
        <p>
          {team.email} · {team.phone || "Sin teléfono"}
        </p>
        <Status value={team.status} />
        {canEdit && (
          <>
            <Choice
              label="Categoría"
              value={category}
              onChange={setCategory}
              options={state.categories.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
            <Choice
              label="Decisión"
              value={decision}
              onChange={setDecision}
              options={["approved", "rejected", "withdrawn"].map((v) => ({
                value: v,
                label: labels[v],
              }))}
            />
            <TextField
              label="Motivo del cambio"
              name="reason"
              placeholder="Revisión de nivel completada"
            />
            <Submit busy={busy} label="Confirmar revisión" />
          </>
        )}
      </FieldGroup>
    </form>
  );
}
export function GroupTables({
  state,
  category = "all",
  detailed = false,
}: {
  state: State;
  category?: string;
  detailed?: boolean;
}) {
  const groups = state.groups.filter(
    (g) => category === "all" || g.category_id === category,
  );
  return (
    <div className="groups-grid">
      {groups.map((g) => (
        <section className="panel" key={g.id}>
          <div className="panel-heading">
            <h2>Grupo {g.name}</h2>
            <small>
              {state.categories.find((c) => c.id === g.category_id)?.name}
            </small>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Pareja</TableHead>
                <TableHead>PJ</TableHead>
                <TableHead>PG</TableHead>
                <TableHead>PP</TableHead>
                {detailed && (
                  <>
                    <TableHead>Sets +/−</TableHead>
                    <TableHead>Juegos +/−</TableHead>
                    <TableHead>% victoria</TableHead>
                  </>
                )}
                <TableHead>PTS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.standings
                .find((s) => s.group_id === g.id)
                ?.rows.map((r, i) => (
                  <TableRow key={r.team_id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <strong>
                        {state.teams.find((t) => t.id === r.team_id)?.name}
                      </strong>
                      <small className="block text-muted-foreground">
                        {r.played ? r.criterion : "Sin partidos finalizados"}
                      </small>
                    </TableCell>
                    <TableCell>{r.played}</TableCell>
                    <TableCell>{r.won}</TableCell>
                    <TableCell>{r.lost}</TableCell>
                    {detailed && (
                      <>
                        <TableCell>
                          {r.sets_for} / {r.sets_against}
                        </TableCell>
                        <TableCell>
                          {r.games_for} / {r.games_against}
                        </TableCell>
                        <TableCell>
                          {r.played ? Math.round((r.won / r.played) * 100) : 0}%
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <strong>{r.points}</strong>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </section>
      ))}
      {!groups.length && (
        <EmptyState
          title="Los grupos todavía no están definidos"
          description="Las tablas se actualizarán con cada resultado confirmado."
        />
      )}
    </div>
  );
}
export function Bracket({
  state,
  category = "all",
}: {
  state: State;
  category?: string;
}) {
  const categories = state.categories.filter(
    (c) => category === "all" || c.id === category,
  );
  return (
    <div>
      {categories.map((c) => {
        const matches = state.matches.filter(
          (m) => m.category_id === c.id && m.stage === "knockout",
        );
        const rounds = [...new Set(matches.map((m) => m.round))].sort();
        return (
          <section key={c.id} className="bracket-section">
            <h2>{c.name}</h2>
            {matches.length ? (
              <div className="bracket">
                {rounds.map((round, i) => (
                  <div className="bracket-round" key={round}>
                    <div className="eyebrow">
                      {i === rounds.length - 1
                        ? "FINAL"
                        : i === rounds.length - 2
                          ? "SEMIFINALES"
                          : `RONDA ${round}`}
                    </div>
                    <div className="bracket-games">
                      {matches
                        .filter((m) => m.round === round)
                        .sort((a, b) => a.position - b.position)
                        .map((m) => (
                          <div className="bracket-match" key={m.id}>
                            {[m.home_id, m.away_id].map((id, i) => (
                              <div
                                key={i}
                                className={
                                  m.winner_id === id && id ? "winner" : ""
                                }
                              >
                                <span>
                                  {state.teams.find((t) => t.id === id)?.name ||
                                    "Por definir"}
                                </span>
                                <strong>
                                  {m.score?.sets.map((s) => s[i]).join("  ") ||
                                    "—"}
                                </strong>
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="El camino al campeonato está por definirse"
                description="La eliminación se genera al finalizar los grupos y resolver los desempates."
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
export function ResultModal({
  match,
  state,
  action,
  onClose,
}: {
  match: Match;
  state: State;
  action: Action;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [reason, setReason] = useState("normal"),
    [winner, setWinner] = useState("home");
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Pareja";
  return (
    <Modal
      title="Registrar resultado"
      description={`${name(match.home_id)} vs ${name(match.away_id)}. Los sets se capturan en ese orden.`}
      open
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const d = new FormData(e.currentTarget);
          const sets: [number, number][] = [];
          for (let i = 0; i < (state.categories.find(c=>c.id===match.category_id)?.rules.sets||3); i++) {
            const h = formValue(d, "home" + i),
              a = formValue(d, "away" + i);
            if (h !== "" && a !== "") sets.push([Number(h), Number(a)]);
          }
          try {
            await action("/v1/results", {
              id: match.id,
              score: {
                sets,
                reason,
                ...(reason !== "normal" ? { winner } : {}),
              },
              confirmed: true,
            });
            onClose();
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Choice
            label="Finalización"
            value={reason}
            onChange={setReason}
            options={[
              { value: "normal", label: "Partido completo" },
              { value: "walkover", label: "Walkover" },
              { value: "retirement", label: "Retiro" },
            ]}
          />
          {reason === "normal" ? (
            Array.from({length:state.categories.find(c=>c.id===match.category_id)?.rules.sets||3},(_,i)=>i).map((i) => (
              <FieldGroup key={i} className="grid grid-cols-2 gap-3">
                <TextField
                  label={`Set ${i + 1} · ${name(match.home_id)}`}
                  name={"home" + i}
                  type="number"
                  min={0}
                  max={100}
                  required={i < Math.ceil((state.categories.find(c=>c.id===match.category_id)?.rules.sets||3)/2)}
                  defaultValue={match.score?.sets[i]?.[0]}
                />
                <TextField
                  label={`Set ${i + 1} · ${name(match.away_id)}`}
                  name={"away" + i}
                  type="number"
                  min={0}
                  max={100}
                  required={i < Math.ceil((state.categories.find(c=>c.id===match.category_id)?.rules.sets||3)/2)}
                  defaultValue={match.score?.sets[i]?.[1]}
                />
              </FieldGroup>
            ))
          ) : (
            <Choice
              label="Ganador"
              value={winner}
              onChange={setWinner}
              options={[
                { value: "home", label: name(match.home_id) },
                { value: "away", label: name(match.away_id) },
              ]}
            />
          )}
          <Alert>
            <AlertDescription>
              Al confirmar se valida el marcador. Los reportes de capitanes
              requieren coincidencia con el rival; los resultados del árbitro
              actualizan el portal.
            </AlertDescription>
          </Alert>
          <Submit busy={busy} label="Confirmar resultado" />
        </FieldGroup>
      </form>
    </Modal>
  );
}
