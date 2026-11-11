"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Trophy,
  Clock,
  Users,
  Gift,
  Target,
  Star,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "../payments";
import { place, tournamentDates } from "@/lib/api";
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
  base,
}: {
  state: State;
  base: string;
}) {
  const t = state.tournament!;
  const teams = (id: string) =>
    state.teams.filter((team) => team.category_id === id).length;
  return (
    <section className="pub-section" id="categorias">
      <header className="pub-section-head">
        <div>
          <p className="pub-eyebrow">Categorías</p>
          <h2>Elige dónde competir</h2>
          <p>
            {t.auto_approve
              ? "Tu lugar queda confirmado al terminar la inscripción."
              : "El organizador revisa cada inscripción antes de confirmar el lugar."}
          </p>
        </div>
        <Button
          size="lg"
          disabled={!t.registration_open}
          nativeButton={false}
          render={<Link href={`${base}/inscripcion`} />}
        >
          {t.registration_open ? "Inscribir mi pareja" : "Inscripciones cerradas"}
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </header>
      <ul className="pub-categories">
        {state.categories.map((c) => {
          const n = teams(c.id);
          return (
            <li key={c.id} className="pub-card">
              <div>
                <strong>{c.name}</strong>
                <b>
                  {c.price_cents > 0 ? (
                    <>
                      {money(c.price_cents / Math.max(c.participant_count || 1, 1))}
                      <small> / jugador</small>
                    </>
                  ) : (
                    "Gratis"
                  )}
                </b>
              </div>
              <div
                className="pub-meter"
                role="img"
                aria-label={`${n} de ${c.capacity} lugares ocupados`}
                style={{ "--fill": `${Math.min(100, (n / Math.max(c.capacity, 1)) * 100)}%` } as React.CSSProperties}
              >
                <span />
              </div>
              <small>
                {n} de {c.capacity} parejas ·{" "}
                {c.capacity > n ? `${c.capacity - n} lugares libres` : "Cupo lleno"}
              </small>
            </li>
          );
        })}
      </ul>
      {!!t.highlights?.length && (
        <div className="pub-highlights">
          {t.highlights.map((h, i) => {
            const Icon = highlightIcons[h.icon] || Trophy;
            return (
              <div key={i} className="pub-card">
                <Icon aria-hidden />
                <div>
                  <h3>{h.title}</h3>
                  <p>{h.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function TournamentVenue({ state }: { state: State }) {
  const t = state.tournament!;
  const courts = state.courts.filter((c) => c.enabled);
  const opens = courts.map((c) => c.opens_at).sort()[0];
  const closes = courts
    .map((c) => c.closes_at)
    .sort()
    .at(-1);
  return (
    <section className="pub-venue pub-dark" id="sede">
      <div className="pub-venue-info">
        <div>
          <p className="pub-eyebrow">Sede</p>
          <h2>{t.venue}</h2>
        </div>
        <ul>
          {t.city && (
            <li>
              <MapPin size={20} aria-hidden />
              <div>
                <strong>{t.city}</strong>
                <span>Ciudad</span>
              </div>
            </li>
          )}
          <li>
            <CalendarDays size={20} aria-hidden />
            <div>
              <strong>{tournamentDates(t)}</strong>
              <span>Fechas del torneo</span>
            </div>
          </li>
          {opens && (
            <li>
              <Clock size={20} aria-hidden />
              <div>
                <strong>
                  {opens} — {closes}
                </strong>
                <span>Horario de juego</span>
              </div>
            </li>
          )}
          {courts.length > 0 && (
            <li>
              <Trophy size={20} aria-hidden />
              <div>
                <strong>{courts.length} canchas</strong>
                <span>{courts.map((c) => c.name).join(" · ")}</span>
              </div>
            </li>
          )}
        </ul>
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place(t))}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Cómo llegar
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </div>
      <iframe
        src={`https://www.google.com/maps?q=${encodeURIComponent(place(t))}&output=embed`}
        title="Ubicación de la sede"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  );
}
