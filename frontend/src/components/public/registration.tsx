"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Submit } from "../common";
import {
  RegistrationFields,
  registrationFromForm,
  defaultSchema,
} from "../registration-fields";
import { money } from "../payments";
import { mutate } from "@/lib/api";
import { PublicShell, usePublic } from "./shell";
export function Registration({ slug }: { slug: string }) {
  const { state, error } = usePublic(slug);
  const [category, setCategory] = useState(""),
    [reviewPending, setReviewPending] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false),
    [devLink, setDevLink] = useState("");
  const selected = state?.categories.find(
    (c) =>
      c.id ===
      (category || state.categories.find((c) => !c.draw_published)?.id),
  );
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name}>
      <main className="registration-page">
        <Link className="back-link" href={`/${slug}/portal`}>
          <ArrowLeft size={15} />
          Volver al torneo
        </Link>
        <div className="eyebrow">EL PRIMER PASO HACIA LA CANCHA</div>
        <h1>Registra tu participación.</h1>
        <p>
          Un solo integrante (el capitán) llena el formulario por la pareja.
          Después recibirá un correo para verificar la inscripción y, si tiene
          costo, completar el pago. Toma unos 2 minutos.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {done ? (
          <section className="panel registration-success">
            <CheckCircle2 size={38} />
            <h2>
              {reviewPending
                ? "Solicitud recibida."
                : "Un paso más y están dentro."}
            </h2>
            <p>
              {reviewPending
                ? "El organizador revisará la solicitud antes de completar el alta."
                : "Verifica el correo del capitán con el enlace enviado. Después podrás gestionar la inscripción y completar el pago si tiene costo. Si no lo ves, revisa spam o correo no deseado."}
            </p>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/${slug}/portal`} />}
            >
              Volver al torneo
            </Button>
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
        ) : (
          <form
            className="panel registration-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const d = new FormData(e.currentTarget);
              try {
                const r = await mutate("/v1/registrations", {
                  slug,
                  ...registrationFromForm(
                    d,
                    state?.tournament?.registration_schema || defaultSchema,
                    state?.categories || [],
                  ),
                });
                setReviewPending(Boolean(r.review_pending));
                setDevLink((r.development_link as string) || "");
                setDone(true);
                toast.success("Inscripción enviada");
                window.scrollTo({ top: 0, behavior: "smooth" });
              } catch (e) {
                setMessage(
                  `${(e as Error).message} Revisa los datos e inténtalo de nuevo.`,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              {state && (
                <RegistrationFields
                  schema={
                    state?.tournament?.registration_schema || defaultSchema
                  }
                  categories={state.categories.filter((c) => !c.draw_published)}
                  onCategoryChange={setCategory}
                />
              )}
              <p className="text-sm text-muted-foreground">
                Costo de inscripción:{" "}
                <strong>
                  {selected?.price_cents
                    ? `${money(selected.price_cents)} MXN`
                    : "Gratis"}
                </strong>
                {selected?.payment_policy
                  ? ` · ${selected.payment_policy}`
                  : ""}
              </p>
              <Alert>
                <AlertDescription>
                  La inscripción incluye los datos de los participantes. El
                  responsable debe contar con su autorización. La categoría está
                  sujeta a revisión del organizador.
                </AlertDescription>
              </Alert>
              <label className="consent">
                <input type="checkbox" required />
                Acepto las políticas del organizador y confirmo que los
                participantes autorizan el registro y la publicación de sus
                nombres y resultados.
              </label>
              {message && (
                <Alert variant="destructive">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              <Submit busy={busy} label="Registrar y verificar correo" />
            </FieldGroup>
          </form>
        )}
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
      .then(() => location.replace(`/${slug}/mi-pareja`))
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
