"use client";
import "./registration.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { RegistrationCheckout } from "./registration-checkout";
import { PaymentInstructions, type PaymentMethod } from "../registration-payment-settings";
import { get, mutate, tournamentSlugs } from "@/lib/api";
import { PublicShell, usePublic } from "./shell";
// Marca local para disuadir inscripciones repetidas desde el mismo navegador (no es una garantía).
const registeredCookie = (tournamentId: string) => `torneum_inscrito_${tournamentId}`;
const hasRegistered = (tournamentId: string) =>
  document.cookie.split("; ").some((c) => c.startsWith(registeredCookie(tournamentId) + "="));
export function Registration({ slug, torneo }: { slug: string; torneo: string }) {
  const { state, error } = usePublic(slug, torneo);
  const base = `/${slug}/${torneo}`;
  const [staff, setStaff] = useState(false),
    [already, setAlready] = useState(false);
  const tournamentId = state?.tournament?.id;
  useEffect(() => {
    // El organizador usa este formulario para dar de alta varias parejas: no se le bloquea.
    void get<{ actor: { role: string } | null }>("/v1/session")
      .then((r) => setStaff(!!r.actor && r.actor.role !== "participant"))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (tournamentId) setAlready(hasRegistered(tournamentId));
  }, [tournamentId]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("free"),
    [reviewPending, setReviewPending] = useState(false),
    [accessLink, setAccessLink] = useState(""),
    [done, setDone] = useState(false),
    [devLink, setDevLink] = useState("");
  const title = state?.tournament?.name || "Inscripción al torneo";
  const year = title.match(/\b(20\d{2})$/)?.[1];
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name} torneo={torneo}>
      <main className="registration-page registration-enrollment">
        <Link className="back-link" href={base}>
          <ArrowLeft size={15} />
          Volver al torneo
        </Link>
        <header className="registration-intro">
          <h1>{year ? title.slice(0, -4).trim() : title}{year && <span>{year}</span>}</h1>
          <p>Elige tu categoría. Registra a tu equipo. Nos vemos en la cancha.</p>
        </header>
        {!state && !error && <p role="status">Cargando las inscripciones…</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {already && !staff && !done ? (
          <section className="panel registration-success">
            <CheckCircle2 size={38} />
            <h2>Ya registraste una pareja en este torneo.</h2>
            <p>
              Desde este dispositivo ya se envió una inscripción. Para revisarla,
              cambiar datos o completar el pago, entra a Mi pareja. Si necesitas
              inscribir a otra pareja, contacta al organizador.
            </p>
            <Button nativeButton={false} render={<Link href={`${base}/mi-pareja`} />}>
              Ir a mi pareja
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={base} />}
            >
              Volver al torneo
            </Button>
          </section>
        ) : done ? (
          <section className="panel registration-success">
            <CheckCircle2 size={38} />
            <h2>
              {reviewPending
                ? "Solicitud recibida."
                : accessLink ? "Inscripción recibida." : "Un paso más y están dentro."}
            </h2>
            <p>
              {reviewPending
                ? "El organizador revisará la solicitud antes de completar el alta."
                : accessLink ? "Continúa para gestionar tu inscripción y completar el pago si tiene costo. El enlace de acceso es de un solo uso y vence en 30 minutos." : "Verifica el correo del capitán con el enlace enviado. Después podrás gestionar la inscripción y completar el pago si tiene costo. Si no lo ves, revisa spam o correo no deseado."}
            </p>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={base} />}
            >
              Volver al torneo
            </Button>
            {accessLink && <Button nativeButton={false} render={<a href={accessLink} />}>Gestionar inscripción</Button>}
            {!reviewPending && (paymentMethod === "transfer" || paymentMethod === "cash") && <PaymentInstructions method={paymentMethod} settings={state?.tournament?.payment_settings || {}} />}
            {devLink && (
              <Alert>
                <AlertTitle>Entorno local de pruebas</AlertTitle>
                <AlertDescription>
                  No se envió un correo. Usa este enlace de verificación de
                  desarrollo.
                </AlertDescription>
                <Button
                  className="mt-3"
                  nativeButton={false}
                  render={<a href={devLink} />}
                >
                  Verificar inscripción de prueba
                </Button>
              </Alert>
            )}
          </section>
        ) : state?.tournament ? (
          <RegistrationCheckout state={state} slug={slug} onComplete={(r, method) => {
            setPaymentMethod(method);
            setAccessLink((r.access_link as string) || "");
            setReviewPending(Boolean(r.review_pending));
            setDevLink((r.development_link as string) || "");
            setDone(true);
            if (tournamentId && !staff)
              document.cookie = `${registeredCookie(tournamentId)}=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
            toast.success("Inscripción enviada");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }} />
        ) : null}
      </main>
    </PublicShell>
  );
}
export function Verification({ slug }: { slug: string }) {
  const [status, setStatus] = useState("Verificando tu correo…");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = location.hash.slice(1);
    history.replaceState(null, "", `/${slug}/verificar`);
    if (!token) {
      setStatus("El enlace no contiene un token de verificación.");
      return;
    }
    void mutate("/v1/verify", { token })
      .then(async (r) => {
        // Lleva al capitán al torneo en el que se inscribió; si no se resuelve, a la ruta sin torneo (redirige al torneo por defecto).
        const torneo = await get<{ tournaments: { id: string; name: string }[] }>(`/v1/public/${slug}`)
          .then((s) => tournamentSlugs(s.tournaments).get(String(r.tournament_id || "")))
          .catch(() => undefined);
        location.replace(torneo ? `/${slug}/${torneo}/mi-pareja` : `/${slug}/mi-pareja`);
      })
      .catch((e) => setStatus(e.message));
  }, []);
  return (
    <PublicShell slug={slug}>
      <main className="registration-page">
        <h1>Verificación de inscripción</h1>
        <Alert role="status" aria-live="polite">
          <AlertDescription>{status}</AlertDescription>
        </Alert>
        {!status.startsWith("Verificando") && (
          <p>
            Si el enlace venció, entra a Mi pareja y solicita uno nuevo con el
            correo del capitán.
          </p>
        )}
        <Link href={`/${slug}/mi-pareja`}>Ir a mi pareja</Link>
      </main>
    </PublicShell>
  );
}
