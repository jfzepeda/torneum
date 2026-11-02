"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  Layers,
  Shuffle,
  CalendarDays,
  Flag,
  Trophy,
  ChartNoAxesCombined,
  Inbox,
  Handshake,
  UserRoundCog,
  Settings,
  Archive,
  ArrowUpRight,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  LogOut,
  MapPin,
  Activity,
  CheckCheck,
  ArrowRight,
  Sun,
  Moon,
  PanelLeft,
  Download,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { get, mutate, labels, date, tournamentDates, time, place, API, tournamentLink, tournamentSlugs } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import type { State, Actor, Match } from "@/lib/types";
import {
  Status,
  TextField,
  Submit,
  EmptyState,
  formValue,
  Choice,
} from "./common";
import { Operations } from "./operations";
import { CalendarView } from "./calendar";
import { Sponsors } from "./sponsors";
import { CreateTournament, ReuseResources } from "./workspaces";
import { Administration } from "./administration";
const GoogleRegistrations = dynamic(() => import("./google-registrations").then(m => m.GoogleRegistrations));
const ChatPanel = dynamic(
  () => import("./chat-panel").then((m) => m.ChatPanel),
  { ssr: false },
);
export type Action = (
  path: string,
  body: unknown,
) => Promise<Record<string, unknown>>;
export type ViewProps = { state: State; actor: Actor; action: Action };
const nav = [
  {
    title: "TORNEO",
    items: [
      ["inicio", "Inicio", LayoutDashboard],
      ["inscripciones", "Inscripciones", Inbox],
      ["google", "Importar y revisar", Inbox],
      ["categorias", "Categorías", Layers],
      ["equipos", "Equipos y jugadores", Users],
      ["grupos", "Grupos y sorteo", Shuffle],
      ["calendario", "Calendario y canchas", CalendarDays],
      ["resultados", "Partidos y resultados", Flag],
      ["cuadro", "Cuadro de eliminación", Trophy],
      ["estadisticas", "Estadísticas", ChartNoAxesCombined],
      ["patrocinadores", "Patrocinadores", Handshake],
      ["ajustes", "Ajustes del torneo", Settings],
    ],
  },
  {
    title: "GESTIÓN",
    items: [
      ["solicitudes", "Solicitudes", Inbox],
      ["colaboradores", "Colaboradores", UserRoundCog],
      ["configuracion", "Configuración del club", Settings],
      ["recursos", "Reutilizar recursos", Layers],
      ["archivo", "Torneos archivados", Archive],
    ],
  },
] as const;
const globalViews = ["solicitudes", "colaboradores", "configuracion", "archivo", "recursos"];
export function Dashboard({ slug }: { slug: string }) {
  const [state, setState] = useState<State | null>(null),
    [actor, setActor] = useState<Actor | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [view, setView] = useState("inicio"),
    [viewStatus, setViewStatus] = useState(""),
    [chat, setChat] = useState(false),
    [search, setSearch] = useState(""),
    [creating, setCreating] = useState(false);
  const requestVersion = useRef(0);
  const selectedId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const tournamentId = new URLSearchParams(location.search).get("tournament");
    selectedId.current = tournamentId;
    try {
      const session = await get<{ actor: Actor | null }>("/v1/session");
      if (version !== requestVersion.current) return;
      const currentActor = session.actor;

      if (
        currentActor &&
        currentActor.organization_slug &&
        currentActor.organization_slug !== slug
      ) {
        setActor(null);
        setState(null);
        setError("");
        return;
      }

      setActor(currentActor);

      if (!currentActor || currentActor.role === "participant") {
        setState(null);
        setError("");
        return;
      }

      const response = await get<State>("/v1/state", tournamentId);
      if (version !== requestVersion.current) return;
      setState(response);
      if (!tournamentId && response.tournament) {
        selectedId.current = response.tournament.id;
        const url = new URL(location.href);
        url.searchParams.set("tournament", response.tournament.id);
        history.replaceState(null, "", url);
      }
      setError("");
    } catch (e) {
      if (version === requestVersion.current) setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      if (version === requestVersion.current) setLoaded(true);
    }
  }, [slug]);
  useEffect(() => {
    void refresh();
    const desired = new URLSearchParams(location.search).get("view");
    if (desired) setView(desired);
    setViewStatus(new URLSearchParams(location.search).get("status") || "");
    const onPopState = () => {
      setView(new URLSearchParams(location.search).get("view") || "inicio");
      setViewStatus(new URLSearchParams(location.search).get("status") || "");
      setState(null); setLoaded(false); void refresh();
    };
    window.addEventListener("popstate", onPopState);
    const events = new EventSource(API + `/v1/events?org=${slug}`);
    events.addEventListener("update", () => void refresh());
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      requestVersion.current++;
      window.removeEventListener("popstate", onPopState);
      events.close();
      clearInterval(interval);
    };
  }, [refresh, slug]);
  const go = (target: string, status = "") => {
    setView(target);
    setViewStatus(status);
    setSearch("");
    history.pushState(null, "", tournamentLink(`/${slug}?view=${target}${status ? `&status=${status}` : ""}`, selectedId.current));
  };
  const selectTournament = (id: string) => {
    requestVersion.current++;
    selectedId.current = id || null;
    history.pushState(null, "", tournamentLink(`/${slug}?view=${view}`, id));
    setState(null); setLoaded(false); setChat(false);
    void refresh();
  };
  const action: Action = async (path, body) => {
    const context = globalViews.includes(view) ? null : state?.tournament?.id;
    try {
      const r = await mutate(path, body, context);
      if (path === "/v1/tournaments/new" && r.id) {
        setCreating(false); selectTournament(String(r.id));
      } else if (path === "/v1/workspaces/archive" && (body as {tournament_id?: string}).tournament_id === selectedId.current) {
        selectTournament("");
      } else {
        await refresh();
      }
      if (!(body as { preview?: boolean })?.preview && (body as { publish?: boolean })?.publish !== false) toast.success("Cambio guardado");
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
      throw e;
    }
  };
  useBrand(state?.organization, !!state?.organization?.brand_platform);
  if (!loaded)
    return (
      <main className="loading-page" aria-busy="true" aria-label="Cargando torneo">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  if (!actor || actor.role === "participant")
    return (
      <Login
        slug={slug}
        onLogin={refresh}
        error={error}
        participant={actor?.role === "participant"}
      />
    );
  if (!state) return <main className="loading-page"><Alert variant="destructive"><AlertDescription>{error || "No se pudo cargar la organización."}</AlertDescription></Alert><Button onClick={() => selectTournament("")}>Volver a mis torneos</Button></main>;
  const global = globalViews.includes(view);
  const pending = state.teams.filter((t) => t.status === "pending").length;
  const selected = nav.flatMap((g) => [...g.items]).find((i) => i[0] === view);
  const title = selected?.[1] || "Inicio";
  const publicLink = (path: string) => {
    const s = state.tournament ? tournamentSlugs(state.tournaments).get(state.tournament.id) : "";
    return s ? `/${slug}/${s}${path}` : `/${slug}`;
  };
  const props = { state: global && state.management ? { ...state, ...state.management, tournament: null } : state, actor, action };
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "15rem" } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader>
          <Link href={`/${slug}/panel`} className="brand">
            <span className="brand-mark">t</span>torneum
            <span className="brand-period">.</span>
          </Link>
          <small className="text-muted-foreground">{state.organization.name}</small>
          <Choice label="Torneo que gestionas" value={state.tournament?.id || "none"} onChange={selectTournament} options={state.tournaments.length ? state.tournaments.map(t => ({value:t.id,label:t.name})) : [{value:"none",label:"Sin torneos asignados"}]} />
          {actor.role === "admin" && <Button variant="outline" size="sm" onClick={() => setCreating(true)}><Plus data-icon="inline-start" />Crear torneo</Button>}
        </SidebarHeader>
        <SidebarContent>
          {nav.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map(([key, label, Icon]) => (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton
                      aria-label={label}
                      isActive={view === key}
                      onClick={() => go(key)}
                    >
                      <Icon />
                      <span>{label}</span>
                      {key === "inscripciones" && pending > 0 && (
                        <span
                          className="nav-count"
                          aria-label={`${pending} por aprobar`}
                          title={`${pending} por aprobar`}
                        >
                          {pending}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <Button variant="outline" onClick={() => setChat(true)}>
            <Sparkles data-icon="inline-start" />
            Asistente del torneo
            <ArrowUpRight data-icon="inline-end" />
          </Button>
          <div className="user-row">
            <Avatar>
              <AvatarFallback>
                {actor.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <strong>{actor.name}</strong>
              <small>{labels[actor.role]}</small>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cerrar sesión"
                    onClick={() =>
                      void action("/v1/logout", {}).catch(() => {})
                    }
                  />
                }
              >
                <LogOut />
              </TooltipTrigger>
              <TooltipContent>Cerrar sesión</TooltipContent>
            </Tooltip>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Espacio de trabajo</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <span
              className="connection"
              title="Los datos se actualizan automáticamente en tiempo real"
              role="status"
            >
              <span />
              Sincronizado
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cambiar tema"
                    onClick={() =>
                      document.documentElement.classList.toggle("dark")
                    }
                  />
                }
              >
                <Sun />
              </TooltipTrigger>
              <TooltipContent>Cambiar entre tema claro y oscuro</TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={publicLink("")} />}
            >
              Ver portal público
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          </div>
        </header>
        <main className="workspace">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">CENTRO DE OPERACIONES</div>
              <h1>
                {view === "inicio"
                  ? "Todo listo para una gran jornada."
                  : title}
              </h1>
              <p>
                {view === "inicio"
                  ? "Tu torneo, bajo control. Esto es lo que está pasando."
                  : descriptions[view] ||
                    "Administra cada detalle de tu torneo."}
              </p>
            </div>
            {view === "inicio" && state.tournament ? (
              <Button
                nativeButton={false}
                render={<Link href={publicLink("/inscripcion")} />}
              >
                <Plus data-icon="inline-start" />
                Nueva inscripción
              </Button>
            ) : (
              <Badge variant="outline">{global ? "Todo el club" : state.tournament?.name || "Sin torneo"}</Badge>
            )}
          </div>
          <div key={global ? view : `${state.tournament?.id}:${view}:${viewStatus}`}>
          {!global && !state.tournament ? <EmptyState title="Crea tu primer torneo" description={actor.role === "admin" ? "Usa Crear torneo en el sidebar. La configuración del club ya está disponible." : "El administrador debe asignarte un torneo para comenzar."} /> : view === "recursos" ? <ReuseResources {...props} /> : view === "inicio" ? (
            <Overview {...props} go={go} />
          ) : [
              "inscripciones",
              "equipos",
              "categorias",
              "grupos",
              "resultados",
              "cuadro",
              "estadisticas",
              "solicitudes",
            ].includes(view) ? (
            <Operations {...props} view={view} initialFilter={viewStatus || undefined} />
          ) : view === "google" ? (
            <GoogleRegistrations {...props} />
          ) : view === "calendario" ? (
            <CalendarView {...props} />
          ) : view === "patrocinadores" ? (
            <Sponsors {...props} />
          ) : (
            <Administration {...props} view={view} />
          )}
          </div>
          <footer className="workspace-footer">
            <span>Torneum · Cada partido cuenta.</span>
            <span>{global ? state.organization.name : state.tournament ? place(state.tournament) : ""}</span>
          </footer>
        </main>
      </SidebarInset>
      <CreateTournament open={creating} onClose={() => setCreating(false)} action={action} orgName={state.organization.name} />
      <Sheet open={chat} onOpenChange={setChat}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Asistente del torneo</SheetTitle>
            <SheetDescription>
              Consultas según tus permisos de {labels[actor.role].toLowerCase()}
              .
            </SheetDescription>
          </SheetHeader>
          <div className="p-5">
            <ChatPanel
              agent="admin"
              slug={slug}
              enabled={state.integrations.chatkit}
            />
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
const descriptions: Record<string, string> = {
  inscripciones:
    "Revisa las parejas registradas y resuelve sus solicitudes de categoría.",
  categorias: "Formatos, cupos y reglas de puntuación para cada competencia.",
  equipos: "Las parejas y jugadores que dan vida al torneo.",
  grupos: "Un sorteo transparente. Una competencia bien organizada.",
  calendario: "Cada partido, en su cancha y a su hora.",
  resultados: "Captura marcadores, confirma resultados y resuelve disputas.",
  cuadro: "El camino desde los grupos hasta el campeonato.",
  estadisticas: "El rendimiento de las parejas, partido a partido.",
  solicitudes: "Revisa y resuelve los cambios solicitados por los capitanes.",
  patrocinadores: "Construye alianzas que hagan crecer tu torneo.",
  colaboradores: "El equipo detrás de una buena organización.",
  configuracion: "Marca, conexiones y cuenta de cobro compartidas por el club.",
  ajustes: "Información e inscripción de este torneo.",
  recursos: "Reutiliza la configuración y el equipo de otros torneos del club.",
  archivo: "La historia de tus torneos, en un solo lugar.",
};
function Login({
  slug,
  onLogin,
  error,
  participant,
}: {
  slug: string;
  onLogin: () => Promise<void>;
  error: string;
  participant?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href={`/${slug}/portal`} className="brand">
          <span className="brand-mark">t</span>torneum.
        </Link>
        <div>
          <div className="eyebrow">MENOS GESTIÓN. MÁS JUEGO.</div>
          <h1>
            Un gran torneo
            <br />
            empieza aquí.
          </h1>
          <p>
            Desde la primera inscripción hasta el último punto.
            <br />
            Todo tu torneo, en un mismo lugar.
          </p>
          <div className="court-art" aria-hidden="true">
            <i />
            <i />
            <b />
            <span />
          </div>
        </div>
        <small>HECHO PARA QUIENES HACEN POSIBLE EL DEPORTE.</small>
      </section>
      <section className="login-form">
        <div className="eyebrow">ESPACIO DEL ORGANIZADOR</div>
        <h2>Bienvenido a Torneum</h2>
        <p>Inicia sesión para gestionar tu torneo.</p>
        {participant && (
          <Alert>
            <AlertDescription>
              Ya tienes una sesión de capitán.{" "}
              <Link href={`/${slug}/mi-pareja`}>Ir a mi pareja</Link>.
            </AlertDescription>
          </Alert>
        )}
        {(message || error) && (
          <Alert variant="destructive">
            <AlertDescription>{message || error}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const d = new FormData(e.currentTarget);
            try {
              await mutate("/v1/login", {
                slug,
                email: formValue(d, "email"),
                password: formValue(d, "password"),
              });
              await onLogin();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <TextField
              label="Correo electrónico"
              name="email"
              type="email"
              placeholder="tu@club.com"
            />
            <TextField
              label="Contraseña"
              name="password"
              type="password"
            />
            <Submit busy={busy} label="Entrar al torneo" />
          </FieldGroup>
        </form>
        <div className="login-links">
          <Link href={`/${slug}/portal`}>
            Consultar el torneo
            <ArrowUpRight size={14} />
          </Link>
          <Link href={`/${slug}/inscripcion`}>
            Inscribir mi pareja
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <small>Acceso reservado para organizadores y colaboradores.</small>
      </section>
    </main>
  );
}
function Overview({ state, go }: ViewProps & { go: (view: string, status?: string) => void }) {
  const t = state.tournament!;
  const approved = state.teams.filter((x) => x.status === "approved").length,
    pending = state.teams.filter((x) => x.status === "pending").length,
    finished = state.matches.filter((x) => x.status === "finished").length,
    unplanned = state.matches.filter((x) => x.status === "unscheduled").length,
    pendingRequests = state.requests.filter((r) => r.status === "pending").length;
  const upcoming = state.matches
    .filter((m) => ["scheduled", "live"].includes(m.status))
    .slice(0, 5);
  return (
    <>
      <section className="tournament-banner">
        <div>
          <Badge variant="outline">
            INSCRIPCIONES {t.registration_open ? "ABIERTAS" : "CERRADAS"}
          </Badge>
          <h2>{t.name}</h2>
          <div className="banner-meta">
            <span>
              <CalendarDays size={15} />
              {tournamentDates(t, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span>
              <MapPin size={15} />
              {place(t)}
            </span>
          </div>
        </div>
        <div className="banner-court" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
        <Button variant="outline" onClick={() => go("configuracion")}>
          Gestionar torneo
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </section>
      <div className="metric-strip">
        {[
          {
            label: "Parejas inscritas",
            value: state.teams.length,
            sub: `${approved} confirmadas`,
            view: "inscripciones",
            icon: Users,
          },
          {
            label: "Por aprobar",
            value: pending,
            sub: "Revisar inscripciones",
            view: "inscripciones",
            status: "pending",
            icon: Inbox,
          },
          {
            label: "Partidos completados",
            value: `${finished} / ${state.matches.length}`,
            sub: "Ver resultados",
            view: "resultados",
            icon: Flag,
          },
          {
            label: "Canchas disponibles",
            value: state.courts.length,
            sub: `${unplanned} partidos por agendar`,
            view: "calendario",
            icon: CalendarDays,
          },
        ].map((m) => (
          <button
            key={m.label}
            className="metric"
            title={`${m.label}: ${m.sub}`}
            onClick={() => go(m.view, m.status)}
          >
            <div>
              <span>{m.label}</span>
              <m.icon size={17} />
            </div>
            <strong>{m.value}</strong>
            <small>
              {m.sub}
              <ArrowUpRight size={13} />
            </small>
          </button>
        ))}
      </div>
      <div className="overview-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>La próxima jornada</h2>
              <p>Partidos programados y en curso</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => go("calendario")}>
              Ver calendario
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          {upcoming.length ? (
            <div className="match-list">
              {upcoming.map((m) => (
                <MatchRow
                  key={m.id}
                  match={m}
                  state={state}
                  onClick={() => go("resultados")}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="La agenda está por comenzar"
              description="Genera el calendario para asignar canchas y horarios a tus partidos."
            />
          )}
          <div className="panel-bottom">
            <span>
              <CalendarDays size={15} />
              Horario de Ciudad de México
            </span>
            <Button variant="link" size="sm" onClick={() => go("calendario")}>
              Organizar jornada
            </Button>
          </div>
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <h2>Necesita tu atención</h2>
              <p>Lo importante, primero</p>
            </div>
            <span className="attention-count">
              {pending +
                state.requests.filter((r) => r.status === "pending").length +
                (unplanned ? 1 : 0)}
            </span>
          </div>
          {pending + unplanned + pendingRequests === 0 && (
            <p className="px-1 py-3 text-sm text-muted-foreground">
              Todo en orden: no hay pendientes por ahora.
            </p>
          )}
          <button
            className="attention-item"
            onClick={() => go("inscripciones", "pending")}
          >
            <span className="attention-icon">
              <Users size={18} />
            </span>
            <div>
              <strong>{pending} inscripciones por aprobar</strong>
              <p>Confirma categoría y participación.</p>
            </div>
            <ChevronRight size={16} />
          </button>
          <button className="attention-item" onClick={() => go("calendario")}>
            <span className="attention-icon neutral">
              <CalendarDays size={18} />
            </span>
            <div>
              <strong>{unplanned} partidos sin horario</strong>
              <p>Completa la agenda de la competencia.</p>
            </div>
            <ChevronRight size={16} />
          </button>
          <button className="attention-item" onClick={() => go("solicitudes")}>
            <span className="attention-icon neutral">
              <Inbox size={18} />
            </span>
            <div>
              <strong>
                {state.requests.filter((r) => r.status === "pending").length}{" "}
                solicitudes pendientes
              </strong>
              <p>Cambios enviados por los capitanes.</p>
            </div>
            <ChevronRight size={16} />
          </button>
          <div className="quiet-note">
            <CheckCheck size={17} />
            <span>
              Cada cambio queda registrado
              <br />
              en el historial del torneo.
            </span>
          </div>
        </section>
      </div>
      <section className="panel category-progress">
        <div className="panel-heading">
          <div>
            <h2>Así van tus categorías</h2>
            <p>Un vistazo a cada competencia</p>
          </div>
          <Button variant="ghost" onClick={() => go("categorias")}>
            Ver categorías
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
        {state.categories.length === 0 && (
          <EmptyState
            title="Aún no hay categorías"
            description="Crea la primera categoría para empezar a recibir inscripciones."
          />
        )}
        <div className="category-progress-grid">
          {state.categories.map((c, i) => {
            const teams = state.teams.filter(
              (t) => t.category_id === c.id && t.status === "approved",
            ).length;
            return (
              <button key={c.id} onClick={() => go("categorias")}>
                <div className="category-top">
                  <span className="category-number">0{i + 1}</span>
                  <Status value={c.draw_published ? "live" : "pending"} />
                </div>
                <h3>{c.name}</h3>
                <div className="capacity-label">
                  <span>Parejas confirmadas</span>
                  <strong>
                    {teams}
                    <em> / {c.capacity}</em>
                  </strong>
                </div>
                <progress
                  max={c.capacity}
                  value={teams}
                  aria-label={`${teams} de ${c.capacity} parejas confirmadas`}
                />
                <small>
                  {c.draw_published
                    ? "Fase de grupos"
                    : "Inscripciones abiertas"}
                  <ArrowUpRight size={14} />
                </small>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
export function MatchRow({
  match: m,
  state,
  onClick,
}: {
  match: Match;
  state: State;
  onClick?: () => void;
}) {
  const name = (id: string | null) =>
    state.teams.find((t) => t.id === id)?.name || "Por definir";
  return (
    <button className="match-row" onClick={onClick} disabled={!onClick}>
      <div className="match-time">
        <strong>{m.starts_at ? time(m.starts_at) : "—"}</strong>
        <small>{m.starts_at ? date(m.starts_at) : "Sin horario"}</small>
      </div>
      <div className="match-pair">
        <strong>
          {name(m.home_id)}
          <span>vs</span>
          {name(m.away_id)}
        </strong>
        <small>
          {state.categories.find((c) => c.id === m.category_id)?.name} ·{" "}
          {state.courts.find((c) => c.id === m.court_id)?.name ||
            "Cancha por asignar"}
        </small>
      </div>
      <Status value={m.status} />
      <ChevronRight size={15} />
    </button>
  );
}
