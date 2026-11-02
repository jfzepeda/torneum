"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { get, tournamentSlugs } from "@/lib/api";
import type { State } from "@/lib/types";
import { EmptyState } from "../common";
import { PublicShell } from "./shell";

/** Rutas sin torneo (`/club/portal`, enlaces de correos…): llevan a `/club/torneo[/pagina]` con el torneo por defecto o el de `?torneo=`. */
export function LegacyRedirect({ slug, page }: { slug: string; page: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
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
  }, [slug, page, router]);
  return (
    <PublicShell slug={slug}>
      {error && <EmptyState title={error} description="Revisa la dirección o pide el enlace correcto a tu club." />}
    </PublicShell>
  );
}
