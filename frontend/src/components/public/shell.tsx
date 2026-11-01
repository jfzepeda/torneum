"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { get, API, tournamentSlugs } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import { Choice } from "../common";
import type { State } from "@/lib/types";
export function PublicShell({
  children,
  slug,
  orgName,
  picker,
}: {
  children: React.ReactNode;
  slug: string;
  orgName?: string;
  picker?: {
    value: string;
    slug: string;
    options: { value: string; label: string }[];
    onChange: (id: string) => void;
  };
}) {
  const q = picker?.slug ? `?torneo=${picker.slug}` : "";
  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link href={`/${slug}/portal`} className="brand">
          <span className="brand-mark">t</span>
          {orgName || "torneum"}.
        </Link>
        <nav>
          {picker && picker.options.length > 1 && (
            <div className="w-48">
              <Choice
                value={picker.value}
                onChange={picker.onChange}
                options={picker.options}
              />
            </div>
          )}
          <Link href={`/${slug}/portal${q}`}>El torneo</Link>
          <Link href={`/${slug}/patrocinadores${q}`}>Patrocinadores</Link>
          <Link href={`/${slug}/mi-pareja${q}`}>Mi inscripción</Link>
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
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("torneo"),
    ),
    chosenId = useRef<string | null>(null);
  useBrand(state?.organization);
  const refresh = useCallback(async () => {
    try {
      const fetchFor = (id: string | null) =>
        get<State>(`/v1/public/${slug}${id ? `?tournament_id=${id}` : ""}`);
      let next = await fetchFor(chosenId.current);
      if (chosen && !chosenId.current) {
        const slugs = tournamentSlugs(next.tournaments);
        const match = next.tournaments.find((t) => slugs.get(t.id) === chosen);
        if (match) {
          chosenId.current = match.id;
          if (next.tournament?.id !== match.id) next = await fetchFor(match.id);
        }
      }
      setState(next);
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
  const slugOf = useCallback(
    (id: string) => tournamentSlugs(state?.tournaments || []).get(id) || "",
    [state?.tournaments],
  );
  const selectTournament = useCallback(
    (id: string) => {
      const tournamentSlug = slugOf(id);
      chosenId.current = id;
      setChosen(tournamentSlug);
      const url = new URL(window.location.href);
      url.searchParams.set("torneo", tournamentSlug);
      window.history.replaceState(null, "", url);
    },
    [slugOf],
  );
  return { state, error, refresh, selectTournament, slugOf };
}
