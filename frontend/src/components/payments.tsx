"use client";
import { useCallback, useEffect, useState } from "react";
import { get, mutate } from "@/lib/api";
import type { State, Category } from "@/lib/types";
import { Button } from "./ui/button";
import { TextField, Submit, Choice, formValue } from "./common";
export type RegistrationPayment = {
  id: string;
  status: string;
  payment_mode: string;
  amount_cents: number;
  expires_at: string | null;
  payment_status: string | null;
  refunded_cents: number | null;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    cents / 100,
  );
const statuses: Record<string, string> = {
  PENDING_PAYMENT: "Pago pendiente",
  CONFIRMED: "Inscripción confirmada",
  EXPIRED: "Reserva vencida",
  PAYMENT_FAILED: "Pago fallido",
  CANCELLED: "Inscripción cancelada",
  paid: "Pagado",
  partially_refunded: "Reembolso parcial",
  refunded: "Reembolsado",
};
export function ParticipantPayment({
  registration,
  refresh,
}: {
  registration: RegistrationPayment;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (registration.status !== "PENDING_PAYMENT") return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [registration.status, refresh]);
  return (
    <section className="panel p-6 space-y-3" aria-live="polite">
      <h2>{statuses[registration.status] || registration.status}</h2>
      <p>
        {money(registration.amount_cents)} MXN ·{" "}
        {registration.payment_mode === "free"
          ? "Sin costo"
          : registration.payment_mode === "external"
            ? "Pago externo con el organizador"
            : "Tarjeta con Stripe"}
      </p>
      {registration.payment_status && (
        <p>
          {statuses[registration.payment_status] || registration.payment_status}
        </p>
      )}
      {!!registration.refunded_cents && (
        <p>
          Reembolsado: {money(registration.refunded_cents)}. El reembolso no
          cancela automáticamente tu participación.
        </p>
      )}
      {registration.status === "PENDING_PAYMENT" && (
        <>
          <p>
            Tu lugar se confirma cuando verificamos el pago.{" "}
            {registration.expires_at &&
              `Reserva hasta ${new Date(registration.expires_at).toLocaleString("es-MX")}.`}
          </p>
          {registration.payment_mode === "stripe" ? (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await mutate(
                    `/v1/registrations/${registration.id}/checkout`,
                    {},
                  );
                  if (typeof r.url === "string") window.location.assign(r.url);
                  else await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Pagar inscripción
            </Button>
          ) : (
            <p>
              Comunícate con el organizador para registrar tu pago antes de que
              venza la reserva.
            </p>
          )}
        </>
      )}
      {registration.status === "EXPIRED" && (
        <p>
          La reserva ha vencido. Solicita al organizador una nueva inscripción.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function CategoryPayment({
  category,
  saved,
}: {
  category: Category;
  saved: () => Promise<void>;
}) {
  const [mode, setMode] = useState(category.payment_mode || "free"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="panel p-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const d = new FormData(e.currentTarget);
        try {
          await mutate(`/v1/categories/${category.id}/payments`, {
            payment_mode: mode,
            price_cents:
              mode === "free"
                ? 0
                : Math.round(Number(formValue(d, "amount")) * 100),
            participant_count: Number(formValue(d, "participants")),
            payment_policy: formValue(d, "policy"),
            registration_starts_at: formValue(d, "opens")
              ? new Date(formValue(d, "opens")).toISOString()
              : null,
            registration_ends_at: formValue(d, "closes")
              ? new Date(formValue(d, "closes")).toISOString()
              : null,
          });
          await saved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        {category.name} · {category.capacity} cupos
      </h3>
      <Choice
        label="Forma de pago"
        value={mode}
        onChange={setMode}
        options={[
          { value: "free", label: "Gratuita" },
          { value: "stripe", label: "Tarjeta · Stripe" },
          { value: "external", label: "Pago externo autorizado" },
        ]}
      />
      {mode !== "free" && (
        <TextField
          label="Precio por inscripción (MXN)"
          name="amount"
          type="number"
          min={0.01}
          step={0.01}
          defaultValue={String((category.price_cents || 0) / 100)}
        />
      )}
      <TextField
        label="Participantes por inscripción (1 = individual)"
        name="participants"
        type="number"
        min={1}
        max={100}
        defaultValue={String(category.participant_count || 2)}
      />
      <TextField
        label="Apertura de inscripción (hora local)"
        name="opens"
        type="datetime-local"
        required={false}
        defaultValue={localDate(category.registration_starts_at)}
      />
      <TextField
        label="Cierre de inscripción (hora local)"
        name="closes"
        type="datetime-local"
        required={false}
        defaultValue={localDate(category.registration_ends_at)}
      />
      <TextField
        label="Políticas de cancelación, reembolso y facturación del organizador"
        name="policy"
        defaultValue={category.payment_policy || ""}
        required={mode !== "free"}
      />
      <p>Los cambios de precio se aplican a inscripciones nuevas.</p>
      {error && <p role="alert">{error}</p>}
      <Submit busy={busy} label="Guardar cobro de categoría" />
    </form>
  );
}
function localDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function PaymentSettings({ state }: { state: State }) {
  const [account, setAccount] = useState<{
    connected: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    configured?: boolean;
  } | null>(null);
  const [registrations, setRegistrations] = useState<
    (RegistrationPayment & { name: string; email: string })[]
  >([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const tournament = state.tournament!.id;
  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      get<NonNullable<typeof account>>("/v1/stripe/status"),
      get<{ registrations: typeof registrations }>(
        `/v1/tournaments/${tournament}/payments`,
      ),
    ]);
    setAccount(a);
    setRegistrations(r.registrations);
  }, [tournament]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  return (
    <section className="space-y-5">
      <div className="panel p-6 space-y-3">
        <h2>Inscripciones y pagos</h2>
        <p>
          Los cobros llegan a la cuenta Stripe del organizador. Torneum no
          agrega comisión. Stripe aplica sus propias tarifas.
        </p>
        <p>
          {account?.connected
            ? account.charges_enabled
              ? "Stripe habilitado para cobrar"
              : "Completa la verificación en Stripe para recibir pagos"
            : "Stripe sin conectar"}
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await mutate("/v1/stripe/connect", {});
              window.location.assign(String(r.url));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {account?.connected ? "Completar verificación" : "Conectar Stripe"}
        </Button>
        {account?.connected && (
          <>
            <a
              className="block underline"
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noreferrer"
            >
              Ingresos y reembolsos en Stripe Dashboard
            </a>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    "¿Desconectar Stripe y detener nuevos cobros?",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await mutate("/v1/stripe/disconnect", {});
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Desconectar Stripe
            </Button>
          </>
        )}
        <Button
          variant="outline"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Actualizar estado
        </Button>
        {error && <p role="alert">{error}</p>}
      </div>
      {state.categories.map((c) => (
        <CategoryPayment key={JSON.stringify(c)} category={c} saved={load} />
      ))}
      <div className="panel p-6 space-y-3">
        <h3>Pagos del torneo</h3>
        {!registrations.length && (
          <p>No hay inscripciones con este flujo de pagos.</p>
        )}
        {registrations.map((r) => (
          <div key={r.id} className="border-b py-3">
            <strong>{r.name}</strong>
            <p>
              {money(r.amount_cents)} · {statuses[r.status]}
              {r.payment_status &&
                ` · ${statuses[r.payment_status] || r.payment_status}`}
            </p>
            {r.status === "PENDING_PAYMENT" &&
              r.payment_mode === "external" && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const reference = window.prompt(
                      "Referencia del pago externo recibido",
                    );
                    if (!reference) return;
                    try {
                      await mutate(
                        `/v1/registrations/${r.id}/external-payment`,
                        { reference },
                      );
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Confirmar pago externo recibido
                </Button>
              )}
          </div>
        ))}
      </div>
    </section>
  );
}
