import Image from "next/image";
import Link from "next/link";
import {
  FileSpreadsheet,
  LayoutGrid,
  Users,
  Wallet,
  ChartColumn,
  Globe,
} from "lucide-react";
import { ClubFinder } from "@/components/club-finder";
import { Hero } from "@/components/ui/hero-1";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { SqueezeCarousel, type SqueezeSlide } from "@/components/ui/carousel-squeeze";
import "@/components/public/public.css";

export const metadata = {
  title: "Torneum · El centro de operaciones de tu torneo de pádel",
  description:
    "Inscripciones, grupos, calendario de canchas, resultados y patrocinadores en un solo lugar. Para clubes que organizan torneos de pádel.",
};

// Un panel por función: el título corto y, en gris, qué resuelve.
const highlights: SqueezeSlide[] = [
  {
    id: "inscripciones",
    title: "Inscripciones en línea o importadas.",
    description:
      "Revisa las solicitudes desde la lista, apruébalas o recházalas una a una o en lote, y corrige la categoría en la misma fila.",
    image: "/landing/inscripciones-pending.png",
    imageAlt: "Inscripciones pendientes de revisión en el panel",
  },
  {
    id: "calendario",
    title: "Calendario por cancha y hora.",
    description:
      "Arrastra cada partido a su cancha. Torneum comprueba choques, horarios y descansos antes de guardar, o genera el calendario completo por ti.",
    image: "/landing/calendario.png",
    imageAlt: "Calendario de partidos por cancha y hora",
  },
  {
    id: "grupos",
    title: "Grupos y cuadro con desempates.",
    description:
      "Captura marcadores y deja que las tablas de grupo y el cuadro de eliminación se actualicen solos, con las reglas de desempate que tú defines.",
    image: "/landing/grupos.png",
    imageAlt: "Tablas de grupos con su clasificación",
  },
  {
    id: "patrocinadores",
    title: "Patrocinadores y sus paquetes.",
    description:
      "Lleva el seguimiento de cada marca y sus mensajes. Los logos confirmados aparecen en el portal público del torneo.",
    image: "/landing/patrocinadores.png",
    imageAlt: "Panel de patrocinadores con sus paquetes",
  },
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
    <div className="landing min-h-dvh">
      <header className="pub-nav">
        <div className="pub-wrap">
          <Link href="/" className="pub-brand" aria-label="Torneum, inicio">
            <span className="brand-mark">t</span>
            <span>torneum.</span>
          </Link>
          <nav className="pub-links" aria-label="Principal">
            <a href="#funciones">Funciones</a>
            <a href="#entrar">Encontrar mi club</a>
          </nav>
        </div>
      </header>

      <main>
        <Hero
          eyebrow="Software para torneos de pádel"
          eyebrowHref="#funciones"
          title="Tu torneo, de la inscripción a la final."
          subtitle="Inscripciones, grupos, calendario de canchas, resultados y patrocinadores en un solo panel para el club. Y un portal con la marca del club donde cada jugador sigue su torneo."
          ctaLabel="Encontrar mi club"
          ctaHref="#entrar"
        />
        <section className="landing-hero-shot" aria-label="El panel del organizador">
          <ContainerScroll titleComponent={null}>
            <Image
              src="/landing/inicio.png"
              alt="Inicio del panel del organizador con el resumen del torneo"
              width={1440}
              height={1323}
              priority
              sizes="(min-width: 1024px) 1024px, 100vw"
              className="mx-auto h-full w-full rounded-xl object-cover object-left-top"
              draggable={false}
            />
          </ContainerScroll>
        </section>

        <section id="funciones" className="landing-highlights pub-dark">
          <div className="pub-wrap">
            <SqueezeCarousel
              slides={highlights}
              label="Lo esencial de Torneum"
              height="clamp(160px, 30cqi, 360px)"
              gap="clamp(6px, 1.4cqi, 16px)"
              radius={12}
              header={
                <>
                  <p className="pub-eyebrow">Funciones</p>
                  <h2 className="pub-display landing-highlights-title">Todo el torneo en un solo panel.</h2>
                </>
              }
            />
          </div>
        </section>

        <section className="pub-wrap landing-extras">
          <h2 className="pub-display">Y todo lo que pasa alrededor del torneo.</h2>
          <div>
            {extras.map(({ icon: Icon, title, text }) => (
              <div key={title} className="pub-card">
                <Icon aria-hidden />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="entrar" className="pub-wrap landing-cta-wrap">
          <div className="landing-cta pub-dark">
            <p className="pub-eyebrow">Jugadores y organizadores</p>
            <h2 className="pub-display">Encuentra tu club</h2>
            <p>Escribe el identificador de tu club para ver su torneo. Si organizas, entra a tu panel desde aquí.</p>
            <div className="landing-finder">
              <ClubFinder />
            </div>
          </div>
        </section>
      </main>

      <footer className="pub-wrap landing-footer">
        <span>
          <strong>torneum.</strong> Cada partido cuenta.
        </span>
        <Link href="/plataforma">Administración de la plataforma</Link>
      </footer>
    </div>
  );
}
