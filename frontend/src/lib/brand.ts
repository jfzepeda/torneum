"use client";
import { useEffect } from "react";
import type { State } from "./types";
const isLight = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};
// Aplica los colores del club en <html> para que también los hereden modales y popovers.
export function useBrand(org: State["organization"] | undefined, apply = true) {
  const color = apply ? org?.brand_color : null,
    bg = apply ? org?.brand_bg : null,
    card = apply ? org?.brand_card : null;
  useEffect(() => {
    const root = document.documentElement;
    if (color) {
      root.dataset.brand = "";
      root.style.setProperty("--brand", color);
      root.style.setProperty("--brand-fg", isLight(color) ? "#111" : "#fff");
    }
    if (bg) {
      root.dataset.brandBg = isLight(bg) ? "light" : "dark";
      root.style.setProperty("--brand-bg", bg);
    }
    if (card) {
      root.dataset.brandCard = isLight(card) ? "light" : "dark";
      root.style.setProperty("--brand-card", card);
    }
    return () => {
      delete root.dataset.brand;
      delete root.dataset.brandBg;
      delete root.dataset.brandCard;
      for (const p of ["--brand", "--brand-fg", "--brand-bg", "--brand-card"])
        root.style.removeProperty(p);
    };
  }, [color, bg, card]);
}
