"use client";
import { ParticipantPayment, money, type RegistrationPayment } from "./payments";
import {TeamProfile} from "./profile";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Trophy,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Choice,
  Status,
  TextField,
  Submit,
  EmptyState,
  formValue,
} from "./common";
import { GroupTables, Bracket, ResultModal } from "./operations";
import { ChatPanel } from "./chat-panel";
import { get, mutate, date, time, API } from "@/lib/api";
import type { State, Team, Match } from "@/lib/types";
function PublicShell({
  children,
  slug,
  orgName,
}: {
  children: React.ReactNode;
  slug: string;
  orgName?: string;
}) {
  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link href={`/${slug}/portal`} className="brand">
          <span className="brand-mark">t</span>
          {orgName || "torneum"}.
        </Link>
        <nav>
          <Link href={`/${slug}/portal`}>El torneo</Link>
          <Link href={`/${slug}/mi-pareja`}>Mi pareja</Link>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/${slug}`} />}
          >
            Organizador
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </nav>
      </header>
      {children}
      <footer className="public-footer">
        <strong>torneum.</strong>
        <span>Cada partido cuenta.</span>
        <Link href={`/${slug}/inscripcion`}>Participar en el torneo ↗</Link>
      </footer>
    </div>
  );
}
function usePublic(slug: string) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setState(await get<State>(`/v1/public/${slug}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);
  useEffect(() => {
    void refresh();
    const events = new EventSource(API + `/v1/events?org=${slug}`);
    events.addEventListener("update", () => void refresh());
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, [refresh]);
  return { state, error, refresh };
}
export function Portal({ slug }: { slug: string }) {
  const { state, error } = usePublic(slug);
  const [category, setCategory] = useState("all"),
    [zone, setZone] = useState("portal");
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
        <EmptyState title="No hay torneo activo" />
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
                {t.venue}
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
        <Tabs
          defaultValue="results"
          onValueChange={(value) =>
            setZone(
              value === "schedule"
                ? "calendar"
                : value === "bracket"
                  ? "bracket"
                  : "portal",
            )
          }
        >
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
                title="El sorteo está por anunciarse"
                description="Vuelve pronto para conocer los grupos y el calendario."
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
            <ChatPanel agent="public" slug={slug} enabled={state.integrations.chatkit} />
          </TabsContent>
        </Tabs>
        <SponsorStrip state={state} zone={zone} />
      </main>
    </PublicShell>
  );
}
function SponsorStrip({ state, zone }: { state: State; zone: string }) {
  const sponsors = state.sponsors
    .filter(
      (s) =>
        s.status === "won" &&
        state.levels.find((l) => l.id === s.level_id)?.zones.includes(zone),
    )
    .sort(
      (a, b) =>
        (state.levels.find((l) => l.id === a.level_id)?.priority || 99) -
        (state.levels.find((l) => l.id === b.level_id)?.priority || 99),
    );
  if (!sponsors.length) return null;
  return (
    <section className="sponsor-strip">
      <div className="eyebrow">QUIENES HACEN POSIBLE ESTE TORNEO</div>
      <div>
        {sponsors.map((s) => (
          <a
            href={s.website || undefined}
            target="_blank"
            rel="noreferrer"
            key={s.id}
            style={{
              maxWidth:
                state.levels.find((l) => l.id === s.level_id)?.logo_size || 120,
            }}
          >
            {s.logo_url ? (
              <img
                src={s.logo_url}
                alt={s.name}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <strong>{s.name}</strong>
          </a>
        ))}
      </div>
    </section>
  );
}
export function Registration({ slug }: { slug: string }) {
  const { state, error } = usePublic(slug);
  const [category, setCategory] = useState(""),
    [captain, setCaptain] = useState("0"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false),
    [devLink, setDevLink] = useState("");
  const selected = state?.categories.find(c=>c.id === (category || state.categories[0]?.id));
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name}>
      <main className="registration-page">
        <Link className="back-link" href={`/${slug}/portal`}>
          <ArrowLeft size={15} />
          Volver al torneo
        </Link>
        <div className="eyebrow">EL PRIMER PASO HACIA LA CANCHA</div>
        <h1>Registra tu participación.</h1>
        <p>
          Una persona registra a los participantes. Verifica el correo para continuar al pago.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {done ? (
          <section className="panel registration-success">
            <CheckCircle2 size={38} />
            <h2>Un paso más y están dentro.</h2>
            <p>
              Verifica el correo del capitán con el enlace enviado. Después
              podrás gestionar la inscripción y completar el pago si tiene costo.
            </p>
            {devLink && (
              <Alert>
                <AlertTitle>Entorno local de pruebas</AlertTitle>
                <AlertDescription>
                  No se envió un correo. Usa este enlace de verificación de
                  desarrollo.
                </AlertDescription>
                <Button
                  className="mt-3"
                  nativeButton={false}
                  render={<a href={devLink} />}
                >
                  Verificar inscripción de prueba
                </Button>
              </Alert>
            )}
          </section>
        ) : (
          <form
            className="panel registration-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const d = new FormData(e.currentTarget);
              try {
                const r = await mutate("/v1/registrations", {
                  slug,
                  name: formValue(d, "name"),
                  players: Array.from({length:selected?.participant_count || 2},(_,i)=>({name:formValue(d,`player${i+1}`)})),
                  captain: Math.min(Number(captain),(selected?.participant_count || 2)-1),
                  email: formValue(d, "email"),
                  phone: formValue(d, "phone"),
                  category_id: category || state?.categories[0]?.id,
                });
                setDevLink((r.development_link as string) || "");
                setDone(true);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <TextField
                name="name"
                label="Nombre de la inscripción"
                placeholder="Apellido / Apellido"
              />
              <FieldGroup className="grid sm:grid-cols-2 gap-5">
                {Array.from({length:selected?.participant_count || 2},(_,i)=><TextField key={i} name={`player${i+1}`} label={`Participante ${i+1} · nombre completo`}/>)}
              </FieldGroup>
              <Choice
                label="Responsable de la inscripción"
                value={captain}
                onChange={setCaptain}
                options={Array.from({length:selected?.participant_count || 2},(_,i)=>({value:String(i),label:`Participante ${i+1}`}))}
              />
              <Choice
                label="Categoría"
                value={category || state?.categories[0]?.id || ""}
                onChange={setCategory}
                options={
                  state?.categories
                    .filter((c) => !c.draw_published)
                    .map((c) => ({ value: c.id, label: c.name })) || []
                }
              />
              <p>{money(selected?.price_cents || 0)} MXN · {selected?.payment_mode === "free" ? "Inscripción gratuita" : selected?.payment_mode === "external" ? "Pago externo con el organizador" : "Pago con tarjeta en Stripe"}</p>
              <p>{selected?.payment_policy}</p>
              <TextField name="email" label="Correo del capitán" type="email" />
              <TextField
                name="phone"
                label="Teléfono del capitán (opcional)"
                type="tel"
                required={false}
              />
              <Alert>
                <AlertDescription>
                  La inscripción incluye los datos de los participantes. El
                  responsable debe contar con su autorización. La categoría está
                  sujeta a revisión del organizador.
                </AlertDescription>
              </Alert>
              <label className="consent">
                <input type="checkbox" required />
                Acepto las políticas del organizador y confirmo que los participantes autorizan el registro y la
                publicación de sus nombres y resultados.
              </label>
              {message && (
                <Alert variant="destructive">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              <Submit busy={busy} label="Registrar y verificar correo" />
            </FieldGroup>
          </form>
        )}
      </main>
    </PublicShell>
  );
}
export function Verification({ slug }: { slug: string }) {
  const [status, setStatus] = useState("Verificando tu correo…");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = location.hash.slice(1);
    history.replaceState(null, "", `/${slug}/verificar`);
    if (!token) {
      setStatus("El enlace no contiene un token de verificación.");
      return;
    }
    void mutate("/v1/verify", { token })
      .then(() => location.replace(`/${slug}/mi-pareja`))
      .catch((e) => setStatus(e.message));
  }, []);
  return (
    <PublicShell slug={slug}>
      <main className="registration-page">
        <h1>Verificación de inscripción</h1>
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
        <Link href={`/${slug}/mi-pareja`}>Ir a mi pareja</Link>
      </main>
    </PublicShell>
  );
}
export function MyTeam({ slug }: { slug: string }) {
  const { state, refresh } = usePublic(slug);
  const [registrationPayment,setRegistrationPayment] = useState<RegistrationPayment | null>(null);
  const [team, setTeam] = useState<Team | null>(null),
    [ownMatches,setOwnMatches]=useState<Match[]>([]),
    [requests, setRequests] = useState<
      { id: string; reason: string; status: string }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [kind, setKind] = useState("category"),
    [category, setCategory] = useState(""),
    [result, setResult] = useState<Match | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await get<{ team: Team; requests: typeof requests; matches:Match[]; registration: RegistrationPayment | null }>(
        "/v1/my-team",
      );
      setTeam(r.team);setOwnMatches(r.matches);setRegistrationPayment(r.registration);
      setRequests(r.requests);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const action = async (path: string, body: unknown) => {
    try {
      const r = await mutate(path, body);
      await Promise.all([refresh(), load()]);
      toast.success("Cambio registrado");
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name}>
      <main className="registration-page wide">
        <div className="eyebrow">ESPACIO DEL CAPITÁN</div>
        <h1>{team?.name || "Gestiona tu pareja."}</h1>
        {!team ? (
          <section className="panel registration-form">
            <p>Solicita un enlace temporal al correo del capitán.</p>
            {error && <small>{error}</small>}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const d = new FormData(e.currentTarget);
                try {
                  await mutate("/v1/magic-link", {
                    slug,
                    email: formValue(d, "email"),
                  });
                  setSent(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FieldGroup>
                <TextField
                  label="Correo del capitán"
                  name="email"
                  type="email"
                />
                <Submit busy={busy} label="Solicitar enlace" />
                {sent && (
                  <Alert>
                    <AlertDescription>
                      Si existe una inscripción y el correo está habilitado,
                      recibirás el enlace de acceso.
                    </AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </form>
          </section>
        ) : (
          <>
            <section className="panel team-profile">
              <div>
                <h2>{team.players.map((p) => p.name).join(" · ")}</h2>
                <p>
                  {
                    state?.categories.find((c) => c.id === team.category_id)
                      ?.name
                  }
                </p>
              </div>
              <Status value={team.status} />
            </section>
            {registrationPayment && <ParticipantPayment registration={registrationPayment} refresh={load}/>}
            <h2 className="section-title">Tus partidos</h2>
            <div className="public-matches">
              {ownMatches
                .map((m) => (
                  <section className="panel public-match" key={m.id}>
                    <Status value={m.status} />
                    <h3>
                      {state?.teams.find(
                        (t) =>
                          t.id ===
                          (m.home_id === team.id ? m.away_id : m.home_id),
                      )?.name || "Rival por definir"}
                    </h3>
                    <p>
                      {m.starts_at
                        ? `${date(m.starts_at)} · ${time(m.starts_at)}`
                        : "Horario por anunciar"}
                    </p>
                    <p>{m.score?.sets.map((s) => s.join("–")).join("  ")}</p>
                    {!["finished", "disputed"].includes(m.status) && (
                      <Button variant="outline" onClick={() => setResult(m)}>
                        Reportar / confirmar resultado
                      </Button>
                    )}
                  </section>
                ))}
            </div>
            <TeamProfile team={team} action={action}/><h2 className="section-title">Solicitar un cambio</h2>
            <form
              className="panel registration-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const d = new FormData(e.currentTarget);
                try {
                  await action("/v1/requests", {
                    kind,
                    after_value:
                      kind === "category"
                        ? { category_id: category || state?.categories[0]?.id }
                        : kind === "description"
                          ? { description: formValue(d, "description") }
                          : {},
                    reason: formValue(d, "reason"),
                  });
                  e.currentTarget?.reset();
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FieldGroup>
                <Choice
                  label="Tipo de cambio"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "category", label: "Cambiar categoría" },
                    { value: "withdrawal", label: "Retirar inscripción" },
                    {
                      value: "description",
                      label: "Actualizar descripción pública",
                    },
                  ]}
                />
                {kind === "category" && (
                  <Choice
                    label="Nueva categoría"
                    value={category || state?.categories[0]?.id || ""}
                    onChange={setCategory}
                    options={
                      state?.categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      })) || []
                    }
                  />
                )}{" "}
                {kind === "description" && (
                  <TextField name="description" label="Descripción pública" />
                )}
                <TextField name="reason" label="Motivo (mínimo 5 caracteres)" />
                <Submit busy={busy} label="Enviar solicitud al organizador" />
              </FieldGroup>
            </form>
            {requests.map((r) => (
              <div key={r.id} className="panel request-summary">
                <span>{r.reason}</span>
                <Status value={r.status} />
              </div>
            ))}
          </>
        )}
        {result && state && (
          <ResultModal
            match={result}
            state={state}
            action={action}
            onClose={() => setResult(null)}
          />
        )}
      </main>
    </PublicShell>
  );
}
