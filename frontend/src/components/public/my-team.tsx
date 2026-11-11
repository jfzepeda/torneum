"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
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
export function MyTeam({ slug, torneo }: { slug: string; torneo: string }) {
  const { state, refresh } = usePublic(slug, torneo);
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
  const form = (
    <form
      className="pub-card pub-access-form"
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
      <h2>Entra con tu correo</h2>
      <p>
        Escribe el correo con el que se inscribió la pareja y te enviaremos un
        enlace temporal para entrar, sin contraseña.
      </p>
      {error && (
        <small role="alert" className="text-destructive">
          {error}
        </small>
      )}
      <FieldGroup>
        <TextField label="Correo del capitán" name="email" type="email" />
        <Submit busy={busy} label="Enviarme el enlace" />
        {sent && (
          <Alert>
            <AlertDescription>
              Si existe una inscripción y el correo está habilitado, recibirás el
              enlace de acceso en unos minutos. Revisa también spam.
            </AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
  const categoryName = (id: string) =>
    state?.categories.find((c) => c.id === id)?.name;
  return (
    <PublicShell slug={slug} orgName={state?.organization?.name} torneo={torneo}>
      <main className="pub-main pub-wrap">
        {!team ? (
          <div className="pub-access">
            <section className="pub-dark" data-enter>
              <p className="pub-eyebrow">Espacio del capitán</p>
              <h1>Mi inscripción</h1>
              <p>Todo lo de tu pareja en {state?.tournament?.name || "el torneo"}, en un solo lugar.</p>
              <ul className="pub-checks">
                {[
                  "Consulta tus partidos, horarios y canchas",
                  "Reporta o confirma cada resultado",
                  "Revisa tu pago y solicita cambios",
                ].map((text) => (
                  <li key={text}>
                    <CheckCircle2 size={20} aria-hidden />
                    {text}
                  </li>
                ))}
              </ul>
            </section>
            {form}
          </div>
        ) : (
          <>
            <section className="pub-team-head pub-dark" data-enter>
              <div>
                <p className="pub-eyebrow">
                  {categoryName(team.category_id) || "Tu pareja"}
                </p>
                <h1>{team.name}</h1>
                <p>{team.players.map((p) => p.name).join(" · ")}</p>
              </div>
              <Status value={team.status} />
            </section>
            {registrationPayment && (
              <div className="pub-section pub-stack">
                <ParticipantPayment registration={registrationPayment} refresh={load} />
              </div>
            )}
            <section className="pub-section">
              <header className="pub-section-head">
                <div>
                  <p className="pub-eyebrow">Calendario</p>
                  <h2>Tus partidos</h2>
                  {!ownMatches.length && (
                    <p>Aún no tienen partidos asignados. Aparecerán aquí cuando se publique el sorteo.</p>
                  )}
                </div>
              </header>
              <div className="pub-matches">
                {ownMatches.map((m) => {
                  const rival =
                    state?.teams.find(
                      (t) => t.id === (m.home_id === team.id ? m.away_id : m.home_id),
                    )?.name || "Rival por definir";
                  return (
                    <article className="pub-card pub-match" data-status={m.status} key={m.id}>
                      <header>
                        <span>vs</span>
                        <Status value={m.status} />
                      </header>
                      <div className="pub-score">
                        <div>
                          <strong>{rival}</strong>
                          {m.score && (
                            <span>
                              {m.score.sets.map((s, j) => (
                                <b key={j}>{s.join("–")}</b>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                      <footer>
                        <span>
                          {m.starts_at
                            ? `${date(m.starts_at)} · ${time(m.starts_at)}`
                            : "Horario por anunciar"}
                        </span>
                        <span>
                          {state?.courts.find((c) => c.id === m.court_id)?.name || ""}
                        </span>
                      </footer>
                      {!["finished", "disputed"].includes(m.status) && (
                        <Button variant="outline" onClick={() => setResult(m)}>
                          Reportar o confirmar resultado
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
            <div className="pub-section pub-stack">
              <TeamProfile team={team} action={action} />
            </div>
            <section className="pub-section">
              <header className="pub-section-head">
                <div>
                  <p className="pub-eyebrow">Solicitudes</p>
                  <h2>Solicitar un cambio</h2>
                  <p>El organizador revisará tu solicitud; el estado aparecerá abajo.</p>
                </div>
              </header>
              <div className="pub-stack">
                <form
                  className="pub-card registration-form"
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
                  <div key={r.id} className="pub-card pub-request">
                    <span>{r.reason}</span>
                    <Status value={r.status} />
                  </div>
                ))}
              </div>
            </section>
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
