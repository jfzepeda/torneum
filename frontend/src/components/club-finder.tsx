"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Lleva al portal público del club o, para organizadores, a su panel.
export function ClubFinder({ id }: { id?: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const go = (organizer: boolean) => {
    const s = slug.trim().toLowerCase();
    if (s) router.push(`/${encodeURIComponent(s)}${organizer ? "" : "/portal"}`);
  };
  return (
    <form
      id={id}
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        go(false);
      }}
    >
      <Input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="identificador-del-club"
        aria-label="Identificador del club"
        className="h-10 bg-card"
      />
      <Button type="submit" size="lg" className="h-10 px-4">
        Ver torneo
      </Button>
      <Button type="button" size="lg" variant="outline" className="h-10 px-4" onClick={() => go(true)}>
        Soy organizador
      </Button>
    </form>
  );
}
