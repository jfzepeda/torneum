"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { State } from "@/lib/types";
// Tier = prioridad del paquete: 1 "presented by" (máx. 2), 2 oficiales, 3+ apoyo.
export function sponsorTiers(state: State) {
  const tier = (s: State["sponsors"][number]) =>
    state.levels.find((l) => l.id === s.level_id)?.priority ?? 0;
  const won = state.sponsors
    .filter((s) => s.status === "won" && tier(s) > 0)
    .sort((a, b) => tier(a) - tier(b) || a.name.localeCompare(b.name));
  return {
    presented: won.filter((s) => tier(s) === 1).slice(0, 2),
    official: won.filter((s) => tier(s) === 2),
    support: won.filter((s) => tier(s) >= 3),
  };
}
// Alto fijo; el ancho sigue la proporción del logo entre 1:1 y 4:3, recortando el resto.
export function SponsorLogo({
  sponsor,
  height,
  freeWidth,
}: {
  sponsor: State["sponsors"][number];
  height: number;
  freeWidth?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const style = { "--logo-h": `${height}px` } as React.CSSProperties;
  const cls = freeWidth ? "sponsor-logo sponsor-logo-free" : "sponsor-logo";
  const content =
    sponsor.logo_url && !failed ? (
      <img
        className={cls}
        style={style}
        src={sponsor.logo_url}
        alt={sponsor.name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    ) : (
      <span className={`${cls} sponsor-logo-text`} style={style}>
        {sponsor.name}
      </span>
    );
  return sponsor.website ? (
    <a
      href={sponsor.website}
      target="_blank"
      rel="noreferrer"
      title={sponsor.name}
    >
      {content}
    </a>
  ) : (
    content
  );
}
export function SponsorHeading({ children }: { children: React.ReactNode }) {
  return <div className="sponsor-heading">{children}</div>;
}
export function PresentedBy({ state }: { state: State }) {
  const { presented } = sponsorTiers(state);
  if (!presented.length) return null;
  return (
    <section className="sponsor-presented">
      <SponsorHeading>PRESENTADO POR</SponsorHeading>
      <div className="sponsor-row">
        {presented.map((s) => (
          <SponsorLogo key={s.id} sponsor={s} height={240} freeWidth />
        ))}
      </div>
    </section>
  );
}
const MARQUEE_SPEED = 56; // px por segundo
export function OfficialSponsors({ state }: { state: State }) {
  const { official } = sponsorTiers(state);
  const n = official.length;
  const marquee = useRef<HTMLDivElement>(null);
  // Arranca en la segunda copia para poder deslizar hacia ambos lados.
  const copies = Math.max(3, Math.ceil(12 / Math.max(n, 1)) + 1);
  useEffect(() => {
    const el = marquee.current;
    if (!el || !n) return;
    const loop = () => el.scrollWidth / copies;
    let pos = loop(),
      last = performance.now(),
      idleUntil = 0,
      hover = false,
      frame = 0;
    el.scrollLeft = pos;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const width = loop();
      // Si el usuario desplazó la cinta, continúa desde donde la dejó.
      if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;
      if (!reduced && !hover && now > idleUntil)
        pos += (MARQUEE_SPEED * Math.min(now - last, 100)) / 1000;
      // Mantiene la posición dentro de la copia central; las copias son idénticas.
      if (pos >= 2 * width) pos -= width;
      else if (pos < width) pos += width;
      if (Math.abs(el.scrollLeft - pos) >= 0.5) el.scrollLeft = pos;
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const touch = () => (idleUntil = performance.now() + 2000);
    const enter = () => (hover = true),
      leave = () => (hover = false);
    // Arrastre con mouse (el táctil y el trackpad usan el scroll nativo).
    let dragX: number | null = null,
      moved = 0;
    const down = (e: PointerEvent) => {
      touch();
      if (e.pointerType !== "mouse") return;
      dragX = e.clientX;
      moved = 0;
    };
    const move = (e: PointerEvent) => {
      if (dragX === null) return;
      el.scrollLeft -= e.clientX - dragX;
      moved += Math.abs(e.clientX - dragX);
      dragX = e.clientX;
      touch();
    };
    const up = () => (dragX = null);
    // Un arrastre no debe abrir el enlace del patrocinador.
    const click = (e: MouseEvent) => {
      if (moved > 5) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", touch, { passive: true });
    el.addEventListener("touchstart", touch, { passive: true });
    el.addEventListener("touchmove", touch, { passive: true });
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", touch);
      el.removeEventListener("touchstart", touch);
      el.removeEventListener("touchmove", touch);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, [n, copies]);
  if (!n) return null;
  return (
    <section className="sponsor-official">
      <SponsorHeading>PATROCINADORES OFICIALES</SponsorHeading>
      <div className="sponsor-marquee" ref={marquee}>
        <div className="sponsor-track">
          {Array.from({ length: copies }, (_, c) =>
            official.map((s) => (
              <div
                className="sponsor-card"
                key={`${c}-${s.id}`}
                aria-hidden={c !== 1 || undefined}
              >
                <SponsorLogo sponsor={s} height={150} />
              </div>
            )),
          )}
        </div>
      </div>
    </section>
  );
}
export function SupportSponsors({
  state,
  slug,
}: {
  state: State;
  slug: string;
}) {
  const { support } = sponsorTiers(state);
  if (!support.length) return null;
  return (
    <section className="sponsor-support">
      <SponsorHeading>
        <Link href={`/${slug}/patrocinadores`}>CON EL APOYO DE</Link>
      </SponsorHeading>
      <div className="sponsor-row">
        {support.map((s) => (
          <SponsorLogo key={s.id} sponsor={s} height={64} />
        ))}
      </div>
    </section>
  );
}
