"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Choice, Status, TextField, Submit, formValue } from "../common";
import { ResultModal } from "../operations";
import { ParticipantPayment, type RegistrationPayment } from "../payments";
import { TeamProfile } from "../profile";
import { get, mutate, date, time } from "@/lib/api";
import type { Team, Match } from "@/lib/types";
import { PublicShell, usePublic } from "./shell";
export function MyTeam({ slug }: { slug: string }) {
  const { state, refresh } = usePublic(slug);
  const [registrationPayment, setRegistrationPayment] =
    useState<RegistrationPayment | null>(null);
  const [team, setTeam] = useState<Team | null>(null),
    [ownMatches, setOwnMatches] = useState<Match[]>([]),
    [requests, setRequests] = useState<
      { id: string; reason: string; status: string }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [kind, setKind] = useState("category"),
    [category, setCategory] = useState(""),
    [result, setResult] = useState<Match | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await get<{
        team: Team;
        requests: typeof requests;
        matches: Match[];
        registration: RegistrationPayment | null;
      }>("/v1/my-team");
      setTeam(r.team);
      setOwnMatches(r.matches);
      setRegistrationPayment(r.registration);
      setRequests(r.requests);
      setError("");
    } catch (e) {
      const msg = (e as Error).message;
      if (
        msg !== "Inicia sesión como capitán." &&
        msg !== "No se pudo cargar la información."
      ) {
        setError(msg);
      }
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const action = async (path: string, body: unknown) => {
    try {
      const r = await mutate(path, body);
      await Promise.all([refresh(), load()]);
      toast.success("Cambio registrado");
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name}>
      <main className="registration-page wide">
        <div className="eyebrow">ESPACIO DEL CAPITÁN</div>
        <h1>{team?.name || "Gestiona tu pareja."}</h1>
        {!team ? (
          <section className="panel registration-form">
            <p>
              Escribe el correo con el que se inscribió la pareja y te
              enviaremos un enlace temporal para entrar, sin contraseña.
            </p>
            {error && (
              <small role="alert" className="text-destructive">
                {error}
              </small>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const d = new FormData(e.currentTarget);
                try {
                  await mutate("/v1/magic-link", {
                    slug,
                    email: formValue(d, "email"),
                  });
                  setSent(true);
                  setError("");
                  toast.success("Revisa tu correo");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FieldGroup>
                <TextField
                  label="Correo del capitán"
                  name="email"
                  type="email"
                />
                <Submit busy={busy} label="Solicitar enlace" />
                {sent && (
                  <Alert>
                    <AlertDescription>
                      Si existe una inscripción y el correo está habilitado,
                      recibirás el enlace de acceso en unos minutos. Revisa
                      también spam.
                    </AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </form>
          </section>
        ) : (
          <>
            <section className="panel team-profile">
              <div>
                <h2>{team.players.map((p) => p.name).join(" · ")}</h2>
                <p>
                  {
                    state?.categories.find((c) => c.id === team.category_id)
                      ?.name
                  }
                </p>
              </div>
              <Status value={team.status} />
            </section>
            {registrationPayment && (
              <ParticipantPayment
                registration={registrationPayment}
                refresh={load}
              />
            )}
            <h2 className="section-title">Tus partidos</h2>
            {!ownMatches.length && (
              <p className="text-sm text-muted-foreground">
                Aún no tienen partidos asignados. Aparecerán aquí cuando se
                publique el sorteo.
              </p>
            )}
            <div className="public-matches">
              {ownMatches.map((m) => (
                <section className="panel public-match" key={m.id}>
                  <Status value={m.status} />
                  <h3>
                    {state?.teams.find(
                      (t) =>
                        t.id ===
                        (m.home_id === team.id ? m.away_id : m.home_id),
                    )?.name || "Rival por definir"}
                  </h3>
                  <p>
                    {m.starts_at
                      ? `${date(m.starts_at)} · ${time(m.starts_at)}`
                      : "Horario por anunciar"}
                  </p>
                  <p>{m.score?.sets.map((s) => s.join("–")).join("  ")}</p>
                  {!["finished", "disputed"].includes(m.status) && (
                    <Button variant="outline" onClick={() => setResult(m)}>
                      Reportar o confirmar resultado
                    </Button>
                  )}
                </section>
              ))}
            </div>
            <TeamProfile team={team} action={action} />
            <h2 className="section-title">Solicitar un cambio</h2>
            <p className="text-sm text-muted-foreground">
              El organizador revisará tu solicitud; el estado aparecerá abajo.
            </p>
            <form
              className="panel registration-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const d = new FormData(e.currentTarget);
                try {
                  await action("/v1/requests", {
                    kind,
                    after_value:
                      kind === "category"
                        ? { category_id: category || state?.categories[0]?.id }
                        : kind === "description"
                          ? { description: formValue(d, "description") }
                          : {},
                    reason: formValue(d, "reason"),
                  });
                  toast.success("Solicitud enviada al organizador");
                  e.currentTarget?.reset();
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FieldGroup>
                <Choice
                  label="Tipo de cambio"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "category", label: "Cambiar categoría" },
                    { value: "withdrawal", label: "Retirar inscripción" },
                    {
                      value: "description",
                      label: "Actualizar descripción pública",
                    },
                  ]}
                />
                {kind === "category" && (
                  <Choice
                    label="Nueva categoría"
                    value={category || state?.categories[0]?.id || ""}
                    onChange={setCategory}
                    options={
                      state?.categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      })) || []
                    }
                  />
                )}{" "}
                {kind === "description" && (
                  <TextField name="description" label="Descripción pública" />
                )}
                <TextField
                  name="reason"
                  label="Motivo (mínimo 5 caracteres)"
                  placeholder="Cuéntale al organizador por qué lo solicitas"
                />
                <Submit busy={busy} label="Enviar solicitud al organizador" />
              </FieldGroup>
            </form>
            {requests.map((r) => (
              <div key={r.id} className="panel request-summary">
                <span>{r.reason}</span>
                <Status value={r.status} />
              </div>
            ))}
          </>
        )}
        {result && state && (
          <ResultModal
            match={result}
            state={state}
            action={action}
            onClose={() => setResult(null)}
          />
        )}
      </main>
    </PublicShell>
  );
}
