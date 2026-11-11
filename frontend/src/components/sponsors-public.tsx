"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./common";
import {
  PublicShell,
  SponsorHeading,
  SponsorLogo,
  sponsorTiers,
  usePublic,
} from "./public";
export function SponsorsPage({ slug, torneo }: { slug: string; torneo: string }) {
  const { state, error } = usePublic(slug, torneo);
  const tiers = state && sponsorTiers(state);
  const groups = tiers
    ? ([
        ["presented", "PRESENTADO POR", tiers.presented, 200],
        ["official", "PATROCINADORES OFICIALES", tiers.official, 130],
        ["support", "CON EL APOYO DE", tiers.support, 80],
      ] as const)
    : [];
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name} torneo={torneo}>
      <main className="pub-main pub-wrap">
        <section className="pub-page-head pub-dark" data-enter>
          <Link className="pub-back" href={`/${slug}/${torneo}`}>
            <ArrowLeft size={16} />
            Volver al torneo
          </Link>
          <p className="pub-eyebrow">{state?.tournament?.name || "Torneo"}</p>
          <h1>Patrocinadores</h1>
          <p>Las marcas que hacen posible cada partido de este torneo.</p>
        </section>
        {!state ? (
          error ? (
            <Alert variant="destructive" className="mt-8">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <Skeleton className="mt-8 h-80 w-full" />
          )
        ) : groups.every(([, , list]) => !list.length) ? (
          <div className="pub-section">
            <EmptyState
              title="Aún no hay patrocinadores"
              description="Cuando el torneo confirme a sus patrocinadores los verás aquí."
            />
          </div>
        ) : (
          groups.map(([tier, title, list, height]) =>
            list.length ? (
              <section key={tier} className="pub-sponsor-tier" data-tier={tier}>
                <SponsorHeading>{title}</SponsorHeading>
                <div className="pub-sponsor-grid">
                  {list.map((s) => (
                    <div key={s.id} className="pub-card pub-sponsor-tile">
                      <SponsorLogo sponsor={s} height={height} freeWidth={tier === "presented"} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null,
          )
        )}
      </main>
    </PublicShell>
  );
}
