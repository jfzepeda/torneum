"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { get, API } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import type { State } from "@/lib/types";
export function PublicShell({
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
          <Link href={`/${slug}/patrocinadores`}>Patrocinadores</Link>
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
export function usePublic(slug: string) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [chosen, setChosen] = useState<string | null>(() =>
      typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tournament"),
    );
  useBrand(state?.organization);
  const refresh = useCallback(async () => {
    try {
      const q = chosen ? `?tournament_id=${encodeURIComponent(chosen)}` : "";
      setState(await get<State>(`/v1/public/${slug}${q}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, chosen]);
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
  const selectTournament = useCallback((id: string) => {
    setChosen(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tournament", id);
    window.history.replaceState(null, "", url);
  }, []);
  return { state, error, refresh, selectTournament };
}
