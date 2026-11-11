"use client"

import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

// Adaptado de 21st (hero-1): Button de base-ui con `render` en vez de `asChild`,
// colores por tokens (sin violeta), sin variantes dark y con la tipografía display pública.
interface HeroProps {
  eyebrow?: string
  eyebrowHref?: string
  title: string
  subtitle: string
  ctaLabel?: string
  ctaHref?: string
}

export function Hero({
  eyebrow = "Innovate Without Limits",
  eyebrowHref = "#",
  title,
  subtitle,
  ctaLabel = "Explore Now",
  ctaHref = "#",
}: HeroProps) {
  return (
    <section
      id="hero"
      className="relative isolate mx-auto w-full overflow-hidden px-6 pt-24 text-center md:px-8 md:pt-32
      min-h-[calc(100dvh-68px)]
      bg-[linear-gradient(to_bottom,#fff,#ffffff_50%,#ececed_88%)]"
    >
      {/* Grid BG */}
      <div
        className="absolute -z-10 inset-0 h-[600px] w-full opacity-80
        bg-[linear-gradient(to_right,#ececed_1px,transparent_1px),linear-gradient(to_bottom,#ececed_1px,transparent_1px)]
        bg-[size:6rem_5rem]
        [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"
      />

      {/* Radial Accent */}
      <div
        className="absolute left-1/2 -z-10 top-[calc(100%-90px)] lg:top-[calc(100%-150px)]
        h-[500px] w-[700px] md:h-[500px] md:w-[1100px] lg:h-[750px] lg:w-[140%]
        -translate-x-1/2 rounded-[100%] bg-white
        bg-[radial-gradient(closest-side,#fff_82%,var(--pub-dark,#000))]
        animate-fade-up"
      />

      {/* Eyebrow */}
      {eyebrow && (
        <a href={eyebrowHref} className="group inline-flex min-h-11 items-center">
          <span
            className="mx-auto flex w-fit items-center justify-center rounded-3xl border-2 border-border
            bg-white/70 px-5 py-2 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            {eyebrow}
            <ChevronRight className="ml-2 inline size-4 text-[var(--pub-accent-ink)] transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </a>
      )}

      {/* Title */}
      <h1
        className="pub-display animate-fade-in mx-auto max-w-[14ch] -translate-y-4 text-balance
        bg-gradient-to-br from-foreground from-30% to-foreground/45
        bg-clip-text py-6 text-[4rem] font-black uppercase leading-[0.86] text-transparent opacity-0
        sm:text-[5.5rem] md:text-[7rem] lg:text-[8.5rem]"
      >
        {title}
      </h1>

      {/* Subtitle */}
      <p
        className="animate-fade-in mx-auto mb-12 max-w-[60ch] -translate-y-4 text-balance
        text-lg text-muted-foreground opacity-0 md:text-xl [animation-delay:120ms]"
      >
        {subtitle}
      </p>

      {/* CTA */}
      {ctaLabel && (
        <div className="flex justify-center">
          <Button
            nativeButton={false}
            render={<a href={ctaHref} />}
            className="z-20 -mt-5 h-12 w-fit rounded-xl px-7 text-base font-semibold md:w-56"
          >
            {ctaLabel}
          </Button>
        </div>
      )}

      {/* Torneum: el horizonte se funde con el blanco de la página, sin borde recortado. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-[var(--background)]" />

      {/* Bottom Fade */}
      <div
        className="animate-fade-up relative mt-32 opacity-0 [perspective:2000px]
        after:absolute after:inset-0 after:z-50
        after:[background:linear-gradient(to_top,var(--background)_10%,transparent)]"
      />
    </section>
  )
}
