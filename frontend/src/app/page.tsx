"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function Page() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  return (
    <main className="loading-page">
      <Link href="/" className="brand">
        <span className="brand-mark">t</span>torneum.
      </Link>
      <h1>Encuentra tu club</h1>
      <p>Escribe el identificador de tu club para ver el torneo.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const s = slug.trim().toLowerCase();
          if (s) router.push(`/${encodeURIComponent(s)}/portal`);
        }}
      >
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="mi-club"
          aria-label="Identificador del club"
        />
        <Button type="submit">Entrar</Button>
      </form>
      <Link href="/plataforma">Administración de la plataforma</Link>
    </main>
  );
}
