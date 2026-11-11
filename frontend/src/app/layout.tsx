import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import type { Viewport } from "next";
import { Big_Shoulders, Inter_Tight } from "next/font/google";
// Tipografía de las interfaces públicas (ver components/public/public.css).
const display = Big_Shoulders({ subsets: ["latin"], weight: ["400", "700", "800", "900"], variable: "--font-display-public" });
const body = Inter_Tight({ subsets: ["latin"], variable: "--font-body-public" });
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#161c18" },
  ],
};
export const metadata = {
  title: "Torneum · Gestión de torneos",
  description: "El centro de operaciones de tu torneo de pádel.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>
        <TooltipProvider>
          {children}
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
