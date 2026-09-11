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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { State, Match, Actor, Team, Category } from "@/lib/types";
import { labels, time, date, API } from "@/lib/api";
export function Operations({
  state,
  actor,
  action,
  view,
}: ViewProps & { view: string }) {
  const [category, setCategory] = useState("all"),
    [filter, setFilter] = useState("all"),
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
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Por definir";
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
              ].map((v) => ({
                value: v,
                label: v === "all" ? "Todos los estados" : labels[v],
              }))}
            />
          )}
        </div>
        {view === "categorias" && can("registration") ? (
          <Button onClick={() => {setEditCategory(null);setSetCount("3");setModal(true);}}>
            <Plus data-icon="inline-start" />
            Nueva categoría
          </Button>
        ) : view === "inscripciones" ? (
          <Button nativeButton={false} render={<Link href="/inscripcion" />}>
            <Plus data-icon="inline-start" />
            Inscribir pareja
          </Button>
        ) : null}
      </div>
      {["inscripciones", "equipos"].includes(view) && (
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pareja / jugadores</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Capitán</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.slice(page * 12, page * 12 + 12).map((t) => (
                <TableRow key={t.id}>
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
                    {state.categories.find((c) => c.id === t.category_id)?.name}
                  </TableCell>
                  <TableCell>
                    <strong>{t.players[t.captain || 0]?.name}</strong>
                    <small className="block text-muted-foreground">
                      {t.email}
                    </small>
                  </TableCell>
                  <TableCell>
                    <Status value={t.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(t)}
                    >
                      Ver detalle
                      <ArrowUpRight data-icon="inline-end" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!teams.length && (
            <EmptyState title="No hay parejas con estos filtros" />
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
                {can("registration")&&!c.draw_published&&<div className="form-actions"><Button variant="outline" onClick={()=>{setEditCategory(c);setSetCount(String(c.rules.sets));setModal(true);}}>Editar reglas</Button></div>}
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
              {matches
                .filter((m) =>
                  (name(m.home_id) + " " + name(m.away_id))
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void action("/v1/matches/start", {
                                  id: m.id,
                                }).catch(() => {})
                              }
                            >
                              Iniciar
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
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
          {!matches.length && (
            <EmptyState
              title="El primer partido está por llegar"
              description="Publica un sorteo para generar los encuentros de grupos."
            />
          )}
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
          {state.requests.map((r) => (
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
          {!state.requests.length && (
            <EmptyState
              title="No hay solicitudes pendientes"
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
              onClick={async () => {
                try {
                  await action("/v1/draw", {
                    category_id: preview.category_id,
                    seed: preview.seed,
                    publish: true,
                  });
                  setPreview(null);
                } catch {}
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
