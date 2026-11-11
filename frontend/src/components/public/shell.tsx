"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./public.css";
import { get, API, tournamentSlugs } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import type { State } from "@/lib/types";
export function PublicShell({
  children,
  slug,
  orgName,
  torneo,
}: {
  children: React.ReactNode;
  slug: string;
  orgName?: string;
  torneo?: string;
}) {
  const base = torneo ? `/${slug}/${torneo}` : `/${slug}`;
  const path = usePathname();
  const links = [
    [base, "El torneo"],
    [`${base}/patrocinadores`, "Patrocinadores"],
    [`${base}/mi-pareja`, "Mi inscripción"],
  ];
  const nav = links.map(([href, label]) => (
    <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
      {label}
    </Link>
  ));
  return (
    <div className="public-shell">
      <header className="pub-nav">
        <div className="pub-wrap">
          <Link href={base} className="pub-brand">
            <span className="brand-mark">t</span>
            <span>{orgName || "torneum"}</span>
          </Link>
          <nav className="pub-links" aria-label="Torneo">
            {nav}
          </nav>
        </div>
      </header>
      {children}
      <footer className="pub-footer pub-dark">
        <div className="pub-wrap">
          <div>
            <strong>{orgName || "torneum"}</strong>
            <p>Cada partido cuenta.</p>
          </div>
          <nav aria-label="Pie de página">
            {nav}
            <Link className="pub-footer-cta" href={`${base}/inscripcion`}>
              Inscribir mi pareja ↗
            </Link>
          </nav>
          <small>
            Torneo organizado con <Link href="/">torneum.</Link>
          </small>
        </div>
      </footer>
    </div>
  );
}
/** Estado público de un torneo concreto. Con `torneo` (slug de la URL) nunca se muestra el torneo por defecto: si no existe, es un error. */
export function usePublic(slug: string, torneo: string) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    chosenId = useRef<string | null>(null);
  useBrand(state?.organization);
  const refresh = useCallback(async () => {
    try {
      const fetchFor = (id: string | null) =>
        get<State>(`/v1/public/${slug}${id ? `?tournament_id=${id}` : ""}`);
      let next = await fetchFor(chosenId.current);
      if (!chosenId.current) {
        const slugs = tournamentSlugs(next.tournaments);
        const match = next.tournaments.find((t) => slugs.get(t.id) === torneo);
        if (!match) {
          setState(null);
          setError("Torneo no encontrado");
          return;
        }
        chosenId.current = match.id;
        if (next.tournament?.id !== match.id) next = await fetchFor(match.id);
      }
      setState(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, torneo]);
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
