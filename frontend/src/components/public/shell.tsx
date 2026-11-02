"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link href={base} className="brand">
          <span className="brand-mark">t</span>
          {orgName || "torneum"}.
        </Link>
        <nav>
          <Link href={base}>El torneo</Link>
          <Link href={`${base}/patrocinadores`}>Patrocinadores</Link>
          <Link href={`${base}/mi-pareja`}>Mi inscripción</Link>
        </nav>
      </header>
      {children}
      <footer className="public-footer">
        <strong>torneum.</strong>
        <span>Cada partido cuenta.</span>
        <Link href={`${base}/inscripcion`}>Participar en el torneo ↗</Link>
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
