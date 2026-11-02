import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  Handshake,
  LayoutGrid,
  Trophy,
  Users,
  Wallet,
  ChartColumn,
  Globe,
} from "lucide-react";
import { ClubFinder } from "@/components/club-finder";

export const metadata = {
  title: "Torneum · El centro de operaciones de tu torneo de pádel",
  description:
    "Inscripciones, grupos, calendario de canchas, resultados y patrocinadores en un solo lugar. Para clubes que organizan torneos de pádel.",
};

// Las capturas son de página completa a 1440 px; el marco recorta desde arriba.
function Shot({ src, alt, height, priority }: { src: string; alt: string; height: number; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[0_24px_60px_-28px_rgb(32_39_34/0.35)]">
      <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </div>
      <Image
        src={`/landing/${src}.png`}
        alt={alt}
        width={1440}
        height={height}
        priority={priority}
        sizes="(min-width: 1024px) 720px, 100vw"
        className="aspect-[16/10] w-full object-cover object-top"
      />
    </div>
  );
}

const features = [
  {
    eyebrow: "Inscripciones",
    title: "Aprueba parejas sin abrir una sola ficha.",
    text: "Revisa las solicitudes desde la lista, apruébalas o recházalas una a una o en lote, y corrige la categoría en la misma fila. Las parejas reciben su enlace para seguir su torneo.",
    shot: "inscripciones",
    height: 1480,
    alt: "Lista de parejas inscritas con acciones de aprobar y rechazar",
  },
  {
    eyebrow: "Calendario y canchas",
    title: "Toda la jornada en una cuadrícula.",
    text: "Arrastra cada partido a su cancha y su hora. Torneum comprueba choques, horarios de cancha y descansos antes de guardar, o genera el calendario completo por ti.",
    shot: "calendario",
    height: 1978,
    alt: "Calendario de partidos por cancha y hora",
  },
  {
    eyebrow: "Resultados y cuadro",
    title: "Del primer saque a la final.",
    text: "Captura marcadores, registra W.O. y deja que las tablas de grupo y el cuadro de eliminación se actualicen solos. Los desempates se aplican con las reglas que tú defines.",
    shot: "cuadro",
    height: 1404,
    alt: "Cuadro de eliminación del torneo",
  },
  {
    eyebrow: "Patrocinadores",
    title: "Tus patrocinadores, también organizados.",
    text: "Lleva el seguimiento de cada marca, sus paquetes y sus mensajes. Los logos de los patrocinadores confirmados aparecen en el portal público del torneo.",
    shot: "patrocinadores",
    height: 2226,
    alt: "Panel de patrocinadores con estados y paquetes",
  },
];

const highlights = [
  { icon: ClipboardCheck, title: "Inscripciones", text: "en línea o importadas" },
  { icon: CalendarDays, title: "Calendario", text: "por cancha y hora" },
  { icon: Trophy, title: "Grupos y cuadro", text: "con desempates" },
  { icon: Handshake, title: "Patrocinadores", text: "y sus paquetes" },
];

const extras = [
  { icon: FileSpreadsheet, title: "Importa desde Google Forms", text: "Trae las respuestas de tu formulario y acepta las válidas de una vez." },
  { icon: LayoutGrid, title: "Grupos y sorteo", text: "Arma los grupos por categoría y publica el sorteo cuando esté listo." },
  { icon: Wallet, title: "Pagos por categoría", text: "Define cuotas y confirma pagos externos sin salir de la lista." },
  { icon: Users, title: "Colaboradores", text: "Invita a tu equipo con el rol justo para cada quien." },
  { icon: ChartColumn, title: "Estadísticas", text: "Avance por categoría, partidos jugados y canchas en uso." },
  { icon: Globe, title: "Portal público", text: "Tus jugadores consultan horarios y resultados con la marca de tu club." },
];

export default function Page() {
  return (
    <div className="landing min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="brand" aria-label="Torneum, inicio">
          <span className="brand-mark">t</span>torneum<span className="brand-period">.</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <a href="#funciones" className="hidden hover:text-foreground sm:inline">Funciones</a>
          <a href="#entrar" className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/85">
            Entrar
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-10 pb-16 text-center sm:pt-16">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">Torneos de pádel</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
            Tu torneo, de la inscripción a la final.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
            Torneum reúne inscripciones, grupos, calendario de canchas, resultados y patrocinadores en un solo centro de
            operaciones. Menos hojas de cálculo, más pádel.
          </p>
          <div className="mt-8 flex justify-center">
            <ClubFinder />
          </div>
          <div className="mx-auto mt-14 max-w-5xl">
            <Shot src="inicio" height={1323} priority alt="Inicio del panel del organizador con el resumen del torneo" />
          </div>
        </section>

        <section className="border-y bg-card">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 text-center md:grid-cols-4">
            {highlights.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex flex-col items-center gap-2">
                <Icon className="size-5 text-primary" aria-hidden />
                <dt className="font-semibold">{title}</dt>
                <dd className="text-sm text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="funciones" className="mx-auto flex max-w-6xl scroll-mt-6 flex-col gap-24 px-5 py-24">
          {features.map((f, i) => (
            <article key={f.shot} className="grid items-center gap-10 lg:grid-cols-[2fr_3fr]">
              <div className={i % 2 ? "lg:order-2" : undefined}>
                <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">{f.eyebrow}</p>
                <h2 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-balance">{f.title}</h2>
                <p className="mt-4 text-pretty text-muted-foreground">{f.text}</p>
              </div>
              <Shot src={f.shot} height={f.height} alt={f.alt} />
            </article>
          ))}
        </section>

        <section className="bg-muted">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="max-w-xl text-3xl font-bold tracking-tight text-balance">Y todo lo que pasa alrededor.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="entrar" className="mx-auto flex max-w-6xl scroll-mt-6 flex-col items-center px-5 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance">Encuentra tu club</h2>
          <p className="mt-3 max-w-lg text-muted-foreground">
            Escribe el identificador de tu club para ver su torneo. Si organizas, entra a tu panel desde aquí.
          </p>
          <div className="mt-8 flex w-full justify-center">
            <ClubFinder />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>Torneum · Cada partido cuenta.</span>
          <Link href="/plataforma" className="hover:text-foreground">Administración de la plataforma</Link>
        </div>
      </footer>
    </div>
  );
}
