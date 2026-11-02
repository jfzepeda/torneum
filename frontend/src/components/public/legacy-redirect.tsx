"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { get, tournamentSlugs } from "@/lib/api";
import type { State } from "@/lib/types";
import { EmptyState } from "../common";
import { PublicShell } from "./shell";

/** Rutas sin torneo (`/club/portal`, enlaces de correos…): llevan a `/club/torneo[/pagina]` con el torneo por defecto o el de `?torneo=`. */
export function LegacyRedirect({ slug, page, panelQuery }: { slug: string; page: string; panelQuery?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // `/club?view=…&tournament=…` era el panel: esos enlaces guardados siguen llegando al panel.
    if (panelQuery && ["view", "tournament", "status", "stripe"].some((k) => params.has(k))) {
      router.replace(`/${slug}/panel${location.search}${location.hash}`);
      return;
    }
    const wanted = params.get("torneo");
    params.delete("torneo");
    const rest = params.size ? `?${params}` : "";
    get<State>(`/v1/public/${slug}`)
      .then((state) => {
        const slugs = tournamentSlugs(state.tournaments);
        const target =
          (wanted && state.tournaments.find((t) => slugs.get(t.id) === wanted)) ||
          state.tournament;
        if (!target) return setError("No hay torneo activo");
        router.replace(`/${slug}/${slugs.get(target.id)}${page ? "/" + page : ""}${rest}${location.hash}`);
      })
      .catch((e) => setError((e as Error).message));
  }, [slug, page, panelQuery, router]);
  return (
    <PublicShell slug={slug}>
      {error && <EmptyState title={error} description="Revisa la dirección o pide el enlace correcto a tu club." />}
    </PublicShell>
  );
}
