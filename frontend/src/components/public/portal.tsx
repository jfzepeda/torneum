"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Choice, Status, EmptyState } from "../common";
import { GroupTables, Bracket } from "../operations";
import { ChatPanel } from "../chat-panel";
import { date, time, place, tournamentDates } from "@/lib/api";
import { PublicShell, usePublic } from "./shell";
import { TournamentDetails, TournamentVenue } from "./tournament-details";
import { PresentedBy, OfficialSponsors, SupportSponsors } from "./sponsor-sections";
export function Portal({ slug, torneo }: { slug: string; torneo: string }) {
  const { state, error } = usePublic(slug, torneo);
  const base = `/${slug}/${torneo}`;
  const [category, setCategory] = useState("all");
  if (!state)
    return (
      <PublicShell slug={slug} torneo={torneo}>
        <main className="pub-main pub-wrap">
          {error === "Club no encontrado" ? (
            <EmptyState
              title="Club no encontrado"
              description="Revisa la dirección o pide el enlace correcto a tu club."
            />
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <Skeleton className="h-[560px] w-full rounded-[22px]" />
          )}
        </main>
      </PublicShell>
    );
  if (!state.tournament)
    return (
      <PublicShell slug={slug} orgName={state?.organization?.name} torneo={torneo}>
        <main className="pub-main pub-wrap">
          <EmptyState
            title="No hay torneo activo"
            description="Cuando el club publique un torneo lo verás aquí. Vuelve pronto."
          />
        </main>
      </PublicShell>
    );
  const t = state.tournament;
  const matches = state.matches.filter(
    (m) => category === "all" || m.category_id === category,
  );
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Por definir";
  const capacity = state.categories.reduce((n, c) => n + c.capacity, 0);
  const courts = state.courts.filter((c) => c.enabled).length;
  const year = t.starts_on?.slice(0, 4);
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name} torneo={torneo}>
      <main className="pub-main pub-wrap">
        <section className="pub-hero pub-dark" data-enter>
          <div className="pub-court" aria-hidden="true">
            <i />
          </div>
          <div>
            <p className="pub-eyebrow">
              Torneo de pádel{year ? ` · ${year}` : ""}
            </p>
            <h1>{t.name}</h1>
            <p className="pub-hero-lead">
              <strong>{tournamentDates(t)}</strong> en <strong>{place(t)}</strong>.{" "}
              {state.categories.length} categorías y cupo para {capacity} parejas.
            </p>
            <div className="pub-actions">
              <Button
                size="lg"
                disabled={!t.registration_open}
                nativeButton={false}
                render={<Link href={`${base}/inscripcion`} />}
              >
                {t.registration_open ? "Inscribir mi pareja" : "Inscripciones cerradas"}
                <ArrowUpRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<a href="#partidos" />}
              >
                Ver partidos
                <ArrowDown data-icon="inline-end" />
              </Button>
            </div>
          </div>
          <dl className="pub-hero-stats">
            <div>
              <dt>Parejas</dt>
              <dd>
                {state.teams.length}
                <small> / {capacity}</small>
              </dd>
            </div>
            <div>
              <dt>Categorías</dt>
              <dd>{state.categories.length}</dd>
            </div>
            <div>
              <dt>Canchas</dt>
              <dd>{courts || "—"}</dd>
            </div>
            <div>
              <dt>Inscripciones</dt>
              <dd className={t.registration_open ? "is-accent" : undefined}>
                {t.registration_open ? "Abiertas" : "Cerradas"}
              </dd>
            </div>
          </dl>
        </section>
        <PresentedBy state={state} />
        <TournamentDetails state={state} base={base} />
        <section className="pub-section" id="partidos">
          <header className="pub-section-head">
            <div>
              <p className="pub-eyebrow">En juego</p>
              <h2>Partidos y resultados</h2>
              <p>Marcadores, grupos y horarios se actualizan solos durante el torneo.</p>
            </div>
          </header>
          <Tabs defaultValue="results">
            <div className="pub-toolbar">
              <TabsList>
                <TabsTrigger value="results">Partidos</TabsTrigger>
                <TabsTrigger value="groups">Clasificación</TabsTrigger>
                <TabsTrigger value="bracket">Cuadro</TabsTrigger>
                <TabsTrigger value="schedule">Canchas y agenda</TabsTrigger>
                <TabsTrigger value="assistant">Asistente</TabsTrigger>
              </TabsList>
              <Choice
                value={category}
                onChange={setCategory}
                options={[
                  { value: "all", label: "Todas las categorías" },
                  ...state.categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
            </div>
            <TabsContent value="results">
              <div className="pub-matches">
                {matches.map((m) => (
                  <article className="pub-card pub-match" data-status={m.status} key={m.id}>
                    <header>
                      <span>
                        {state.categories.find((c) => c.id === m.category_id)?.name}
                      </span>
                      <Status value={m.status} />
                    </header>
                    <div className="pub-score">
                      {[m.home_id, m.away_id].map((id, i) => (
                        <div key={i} className={id && id === m.winner_id ? "is-winner" : undefined}>
                          <strong>
                            {name(id)}
                            {id && id === m.winner_id && <Trophy size={15} aria-label="Ganador" />}
                          </strong>
                          <span>
                            {m.score?.sets.map((s, j) => <b key={j}>{s[i]}</b>) || <b>—</b>}
                          </span>
                        </div>
                      ))}
                    </div>
                    <footer>
                      <span>
                        {m.starts_at
                          ? `${date(m.starts_at)} · ${time(m.starts_at)}`
                          : "Horario por anunciar"}
                      </span>
                      <span>
                        {state.courts.find((c) => c.id === m.court_id)?.name || "Sin cancha"}
                      </span>
                    </footer>
                  </article>
                ))}
              </div>
              {!matches.length && (
                <EmptyState
                  title={
                    category === "all"
                      ? "El sorteo está por anunciarse"
                      : "Esta categoría aún no tiene partidos"
                  }
                  description="Vuelve pronto para conocer los grupos y el calendario. La página se actualiza sola."
                />
              )}
            </TabsContent>
            <TabsContent value="groups">
              <GroupTables state={state} category={category} detailed />
            </TabsContent>
            <TabsContent value="bracket">
              <Bracket state={state} category={category} />
            </TabsContent>
            <TabsContent value="schedule">
              <div className="pub-agenda">
                {state.courts.map((c) => {
                  const list = matches.filter((m) => m.court_id === c.id && m.starts_at);
                  return (
                    <section className="pub-card" key={c.id}>
                      <header>
                        <h3>{c.name}</h3>
                        <p>
                          {c.opens_at} — {c.closes_at}
                        </p>
                      </header>
                      {list.map((m) => (
                        <div key={m.id}>
                          <time>{time(m.starts_at!)}</time>
                          <span>
                            {name(m.home_id)} vs {name(m.away_id)}
                            <br />
                            <small className="text-muted-foreground">{date(m.starts_at!)}</small>
                          </span>
                          <Status value={m.status} />
                        </div>
                      ))}
                      {!list.length && (
                        <p className="text-sm text-muted-foreground">Sin partidos programados.</p>
                      )}
                    </section>
                  );
                })}
              </div>
            </TabsContent>
            <TabsContent value="assistant">
              <ChatPanel agent="public" slug={slug} enabled={state.integrations.chatkit} />
            </TabsContent>
          </Tabs>
        </section>
        <TournamentVenue state={state} />
        <OfficialSponsors state={state} />
        <SupportSponsors state={state} base={base} />
      </main>
    </PublicShell>
  );
}
