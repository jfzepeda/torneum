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
export function SponsorsPage({ slug }: { slug: string }) {
  const { state, error } = usePublic(slug);
  const tiers = state && sponsorTiers(state);
  const groups = tiers
    ? ([
        ["PRESENTADO POR", tiers.presented, 2 * 160],
        ["PATROCINADORES OFICIALES", tiers.official, 2 * 96],
        ["CON EL APOYO DE", tiers.support, 2 * 56],
      ] as const)
    : [];
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name}>
      <main className="registration-page wide sponsors-page">
        <Link className="back-link" href={`/${slug}/portal`}>
          <ArrowLeft size={15} />
          Volver al torneo
        </Link>
        <h1>Patrocinadores</h1>
        {!state ? (
          error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <Skeleton className="h-80 w-full" />
          )
        ) : groups.every(([, list]) => !list.length) ? (
          <EmptyState
            title="Aún no hay patrocinadores"
            description="Cuando el torneo confirme a sus patrocinadores los verás aquí."
          />
        ) : (
          groups.map(([title, list, height]) =>
            list.length ? (
              <section key={title}>
                <SponsorHeading>{title}</SponsorHeading>
                <div className="sponsor-row">
                  {list.map((s) => (
                    <SponsorLogo
                      key={s.id}
                      sponsor={s}
                      height={height}
                      freeWidth={title === "PRESENTADO POR"}
                    />
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
