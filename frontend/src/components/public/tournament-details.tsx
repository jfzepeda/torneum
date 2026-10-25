"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Trophy,
  CheckCircle2,
  Clock,
  Users,
  Gift,
  Target,
  Star,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "../payments";
import { date, place } from "@/lib/api";
import type { State, Highlight } from "@/lib/types";
const highlightIcons: Record<Highlight["icon"], typeof Trophy> = {
  trophy: Trophy,
  gift: Gift,
  target: Target,
  star: Star,
  award: Award,
  users: Users,
};
export function TournamentDetails({
  state,
  slug,
}: {
  state: State;
  slug: string;
}) {
  const t = state.tournament!;
  const courts = state.courts.filter((c) => c.enabled);
  const teams = (id: string) =>
    state.teams.filter((team) => team.category_id === id).length;
  const capacity = state.categories.reduce((n, c) => n + c.capacity, 0);
  const opens = courts.map((c) => c.opens_at).sort()[0];
  const closes = courts
    .map((c) => c.closes_at)
    .sort()
    .at(-1);
  return (
    <>
      <section className="tournament-details">
        <div>
          <h2>Detalles del torneo</h2>
          <p>
            {state.categories.length} categorías, {courts.length} canchas y cupo
            para {capacity} parejas.
          </p>
          <div className="detail-grid">
            <div>
              <CalendarDays />
              <div>
                <h4>
                  {date(t.starts_on)} — {date(t.ends_on)}
                </h4>
                <p>Fechas del torneo</p>
              </div>
            </div>
            <div>
              <Users />
              <div>
                <h4>{state.teams.length} parejas</h4>
                <p>Inscritas de {capacity}</p>
              </div>
            </div>
            <div>
              <CheckCircle2 />
              <div>
                <h4>
                  Inscripciones {t.registration_open ? "abiertas" : "cerradas"}
                </h4>
                <p>
                  {t.auto_approve
                    ? "Aprobación automática"
                    : "Sujetas a aprobación"}
                </p>
              </div>
            </div>
            <div>
              <MapPin />
              <div>
                <h4>{t.venue}</h4>
                <p>{t.city || "Sede"}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="detail-categories">
          <ul>
            {state.categories.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <span>
                    {teams(c.id)}/{c.capacity} parejas
                  </span>
                </div>
                <b>{c.price_cents > 0 ? money(c.price_cents) : "Gratis"}</b>
              </li>
            ))}
          </ul>
          <Button
            className="detail-register"
            disabled={!t.registration_open}
            nativeButton={false}
            render={<Link href={`/${slug}/inscripcion`} />}
          >
            Inscribirme
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
        {!!t.highlights?.length && (
          <div className="detail-highlights">
            {t.highlights.map((h, i) => {
              const Icon = highlightIcons[h.icon];
              return (
                <div key={i}>
                  <h3>
                    <Icon />
                    {h.title}
                  </h3>
                  <p>{h.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="tournament-venue">
        <h2>Sede</h2>
        <div>
          <iframe
            src={`https://www.google.com/maps?q=${encodeURIComponent(place(t))}&output=embed`}
            title="Ubicación de la sede"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="venue-card">
            <h3>Información de la sede</h3>
            <div>
              <MapPin />
              <div>
                <h4>Sede del torneo</h4>
                <p>
                  {t.venue}
                  {t.city && (
                    <>
                      <br />
                      {t.city}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div>
              <Clock />
              <div>
                <h4>Fechas y horario</h4>
                <p>
                  {date(t.starts_on)} — {date(t.ends_on)}
                  {opens && (
                    <>
                      <br />
                      {opens} — {closes}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div>
              <Trophy />
              <div>
                <h4>{courts.length} canchas</h4>
                <p>{courts.map((c) => c.name).join(" · ")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
