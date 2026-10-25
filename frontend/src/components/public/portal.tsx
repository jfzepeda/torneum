"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Choice, Status, EmptyState } from "../common";
import { GroupTables, Bracket } from "../operations";
import { ChatPanel } from "../chat-panel";
import { date, time, place } from "@/lib/api";
import { PublicShell, usePublic } from "./shell";
import { TournamentDetails } from "./tournament-details";
import { PresentedBy, OfficialSponsors, SupportSponsors } from "./sponsor-sections";
export function Portal({ slug }: { slug: string }) {
  const { state, error } = usePublic(slug);
  const [category, setCategory] = useState("all");
  if (!state)
    return (
      <PublicShell slug={slug}>
        <main className="public-main">
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
            <Skeleton className="h-80 w-full" />
          )}
        </main>
      </PublicShell>
    );
  if (!state.tournament)
    return (
      <PublicShell slug={slug} orgName={state?.organization?.name}>
        <EmptyState
          title="No hay torneo activo"
          description="Cuando el club publique un torneo lo verás aquí. Vuelve pronto."
        />
      </PublicShell>
    );
  const t = state.tournament;
  const matches = state.matches.filter(
    (m) => category === "all" || m.category_id === category,
  );
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Por definir";
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name}>
      <main className="public-main">
        <section className="public-hero">
          <div>
            <Badge variant="outline">PÁDEL · EDICIÓN 2026</Badge>
            <h1>{t.name}</h1>
            <p>La pasión se juega en pareja.</p>
            <div className="banner-meta">
              <span>
                <CalendarDays size={16} />
                {date(t.starts_on)} — {date(t.ends_on)}
              </span>
              <span>
                <MapPin size={16} />
                {place(t)}
              </span>
            </div>
            <Button
              size="lg"
              disabled={!t.registration_open}
              nativeButton={false}
              render={<Link href={`/${slug}/inscripcion`} />}
            >
              {t.registration_open
                ? "Inscribir mi pareja"
                : "Inscripciones cerradas"}
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          </div>
          <div className="public-court" aria-hidden="true">
            <div className="court-art">
              <i />
              <i />
              <b />
              <span />
            </div>
          </div>
        </section>
        <PresentedBy state={state} />
        <TournamentDetails state={state} slug={slug} />
        <OfficialSponsors state={state} />
        <Tabs defaultValue="results">
          <div className="view-toolbar">
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
            <div className="public-matches">
              {matches.map((m) => (
                <section className="panel public-match" key={m.id}>
                  <div>
                    <small>
                      {
                        state.categories.find((c) => c.id === m.category_id)
                          ?.name
                      }
                    </small>
                    <Status value={m.status} />
                  </div>
                  <div className="scoreboard">
                    {[m.home_id, m.away_id].map((id, i) => (
                      <div
                        key={i}
                        className={id === m.winner_id ? "winner" : ""}
                      >
                        <strong>
                          {name(id)}
                          {id === m.winner_id && <Trophy size={14} />}
                        </strong>
                        <span>
                          {m.score?.sets.map((s, j) => (
                            <b key={j}>{s[i]}</b>
                          )) || <b>—</b>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <footer>
                    {m.starts_at
                      ? `${date(m.starts_at)} · ${time(m.starts_at)}`
                      : "Horario por anunciar"}
                    <span>
                      {state.courts.find((c) => c.id === m.court_id)?.name ||
                        "Sin cancha"}
                    </span>
                  </footer>
                </section>
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
            <div className="category-grid">
              {state.courts.map((c) => (
                <section className="panel court-agenda" key={c.id}>
                  <div className="mini-court" aria-hidden="true" />
                  <h2>{c.name}</h2>
                  <p>
                    {c.opens_at} — {c.closes_at}
                  </p>
                  {matches
                    .filter((m) => m.court_id === c.id)
                    .map((m) => (
                      <div key={m.id}>
                        <strong>
                          {time(m.starts_at!)} · {date(m.starts_at!)}
                        </strong>
                        <p>
                          {name(m.home_id)} vs {name(m.away_id)}
                        </p>
                        <Status value={m.status} />
                      </div>
                    ))}
                </section>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="assistant">
            <ChatPanel
              agent="public"
              slug={slug}
              enabled={state.integrations.chatkit}
            />
          </TabsContent>
        </Tabs>
        <SupportSponsors state={state} slug={slug} />
      </main>
    </PublicShell>
  );
}
