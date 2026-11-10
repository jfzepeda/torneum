"use client";
import { useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { Submit } from "../common";
import { RegistrationFields, registrationFromForm, defaultSchema } from "../registration-fields";
import { availablePaymentMethods, PaymentInstructions, paymentLabels, type PaymentMethod } from "../registration-payment-settings";
import { money } from "../payments";
import { tournamentDates, mutate } from "@/lib/api";
import type { State, Category } from "@/lib/types";

function closedReason(category: Category) {
  if (category.draw_published) return "Inscripciones cerradas";
  if (category.registration_starts_at && new Date(category.registration_starts_at).getTime() > Date.now()) return "Próximamente";
  if (category.registration_ends_at && new Date(category.registration_ends_at).getTime() <= Date.now()) return "Plazo cerrado";
  if (category.registration_count !== undefined && category.registration_count >= category.capacity) return "Cupo completo";
  return "";
}
export function RegistrationCheckout({ state, slug, onComplete }: {
  state: State; slug: string;
  onComplete: (result: Record<string, unknown>, method: PaymentMethod) => void;
}) {
  const tournament = state.tournament!;
  const schema = tournament.registration_schema || defaultSchema;
  const settings = tournament.payment_settings || {};
  const steps = schema.layout === "steps";
  const [step, setStep] = useState(1), [category, setCategory] = useState(""), [payment, setPayment] = useState<PaymentMethod | "">("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const selected = state.categories.find(c => c.id === category);
  const methods = availablePaymentMethods(selected, settings, !!state.stripe_ready);
  const method = payment && methods.includes(payment) ? payment : methods.length === 1 ? methods[0] : "";
  const open = tournament.registration_open && tournament.status !== "archived";
  const noCategories = !state.categories.some(c => !closedReason(c));
  function go(next: number) {
    setStep(next); setError("");
    requestAnimationFrame(() => document.getElementById(`registration-step-${next}`)?.focus());
  }
  function validSection(section?: number) {
    const fields = form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`${section ? `[data-registration-step="${section}"] ` : ""}input, ${section ? `[data-registration-step="${section}"] ` : ""}select, ${section ? `[data-registration-step="${section}"] ` : ""}textarea`);
    const invalid = Array.from(fields || []).find(field => !field.checkValidity());
    if (!invalid) return true;
    const invalidStep = Number(invalid.closest("[data-registration-step]")?.getAttribute("data-registration-step") || 1);
    if (steps && step !== invalidStep) {
      setStep(invalidStep);
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
    } else { invalid.focus(); invalid.reportValidity(); }
    return false;
  }
  function advance() {
    if (!validSection(step)) return;
    if (step === 2) {
      try { registrationFromForm(new FormData(form.current!), schema, state.categories); }
      catch (e) { setError((e as Error).message); return; }
    }
    go(step + 1);
  }
  if (!open || noCategories) return <div className="registration-empty"><h2>{!open ? "Las inscripciones están cerradas" : "No hay categorías disponibles"}</h2><p>{!open ? "Consulta los detalles del torneo o contacta al organizador para conocer la próxima apertura." : "Las categorías pueden estar completas, fuera de plazo o con el sorteo publicado. Vuelve a consultar más adelante."}</p></div>;
  const startingPrice = Math.min(...state.categories.filter(c => !closedReason(c)).map(c => c.price_cents / Math.max(c.participant_count || 2, 1)));
  return <div className="registration-layout">
    <div className="registration-facts">
      <div><strong>{selected ? selected.price_cents ? money(selected.price_cents / Math.max(selected.participant_count || 2, 1)) : "Sin costo" : startingPrice ? `Desde ${money(startingPrice)}` : "Desde $0"}</strong><span>Por jugador · MXN</span></div>
      <div><strong>{tournament.highlights?.[0]?.title || tournament.venue || "Sede por confirmar"}</strong><span>{tournament.highlights?.[0]?.text || tournament.city || tournamentDates(tournament)}</span></div>
    </div>
    <p className="registration-dates">{tournamentDates(tournament)}</p>
    <form ref={form} className="registration-checkout" noValidate onSubmit={async e => {
      e.preventDefault();
      if (busy) return;
      if (steps && step < 3) { advance(); return; }
      if (!validSection()) return;
      if (!selected || closedReason(selected)) { setError("Elige una categoría disponible."); if (steps) setStep(1); return; }
      if (!method) { setError("Elige un medio de pago disponible."); return; }
      setBusy(true); setError("");
      try {
        const data = registrationFromForm(new FormData(e.currentTarget), schema, state.categories);
        const result = await mutate("/v1/registrations", {slug, ...data, payment_method: method});
        onComplete(result, method);
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      {steps && <nav className="registration-progress" aria-label="Progreso de la inscripción">{["Categoría", "Jugadores", "Pago"].map((label, i) => <button key={label} type="button" aria-current={step === i + 1 ? "step" : undefined} disabled={i + 1 > step || busy} onClick={() => go(i + 1)}><span>{step > i + 1 ? <Check size={16} /> : i + 1}</span>{label}</button>)}</nav>}
      <fieldset data-registration-step="1" hidden={steps && step !== 1} className="registration-section" disabled={busy}>
        <legend id="registration-step-1" tabIndex={-1}><span>1</span>Elige tu categoría</legend>
        <div className="registration-categories">
          {state.categories.map(c => {
            const reason = closedReason(c);
            const count = c.participant_count || 2;
            return <label key={c.id} className="registration-option" data-disabled={!!reason}>
              <input type="radio" name="category_id" value={c.id} required checked={category === c.id} disabled={!!reason} onChange={() => { setCategory(c.id); setPayment(""); setError(""); }} />
              <span><strong>{c.name}</strong><span>{c.price_cents ? `${money(c.price_cents / count)} por jugador` : "Sin costo"}</span><small>{reason || `${count === 1 ? "Individual" : `${count} jugadores`} · ${c.registration_count === undefined ? `${c.capacity} lugares` : `${Math.max(0, c.capacity - c.registration_count)} lugares disponibles`}`}</small></span>
            </label>;
          })}
        </div>
      </fieldset>
      <fieldset data-registration-step="2" hidden={steps && step !== 2} className="registration-section" disabled={busy}>
        <legend id="registration-step-2" tabIndex={-1}><span>2</span>{selected?.participant_count === 1 ? "Tus datos" : "Tu pareja"}</legend>
        <p className="registration-help">Una persona registra al equipo completo.</p>
        <RegistrationFields schema={schema} categories={state.categories} selectedCategory={category} playersOnly />
        <p className="registration-help">{schema.require_email ? "El correo es obligatorio. Te enviaremos un enlace para verificar la inscripción." : "El correo es opcional. Al terminar recibirás un enlace para gestionar tu inscripción."}</p>
      </fieldset>
      <fieldset data-registration-step="3" hidden={steps && step !== 3} className="registration-section" disabled={busy}>
        <legend id="registration-step-3" tabIndex={-1}><span>3</span>{method === "free" ? "Confirma tu inscripción" : "¿Cómo vas a pagar?"}</legend>
        {!selected ? <p>Elige primero una categoría para ver su precio y medios de pago.</p> : <>
          <div className="registration-total"><span>Total por {selected.participant_count === 1 ? "inscripción" : "equipo"}<small>{selected.participant_count || 2} {(selected.participant_count || 2) === 1 ? "jugador" : "jugadores"}</small></span><strong>{selected.price_cents ? `${money(selected.price_cents)} MXN` : "Sin costo"}</strong></div>
          {methods.length > 0 && method !== "free" && <div className="registration-payment-options">{methods.map(value => {
            return <label key={value} className="registration-option"><input type="radio" name="payment_method" value={value} required checked={method === value} onChange={() => setPayment(value)} /><span><strong>{paymentLabels[value]}</strong><small>{value === "stripe" ? "Continúa a pagar después del registro" : value === "transfer" ? "Consulta la cuenta y envía tu comprobante" : "El organizador confirma tu pago"}</small></span></label>;
          })}</div>}
          {!methods.length && <Alert><AlertDescription>El organizador aún no tiene un medio de pago disponible para esta categoría. Contacta al club antes de inscribirte.</AlertDescription></Alert>}
          {method && method !== "transfer" && method !== "cash" && <PaymentInstructions method={method} settings={settings} />}
          {(method === "transfer" || method === "cash") && <p className="registration-help">Tendrás {settings.manual_payment_hours || 48} horas desde el registro para que el organizador confirme el pago.</p>}
          {selected.payment_policy && <div className="registration-policy"><h3>Políticas del organizador</h3><p className="whitespace-pre-wrap">{selected.payment_policy}</p></div>}
        </>}
        <label className="consent"><input type="checkbox" required name="consent" /><span>Acepto las políticas del organizador y confirmo que los participantes autorizan el registro y la publicación de sus nombres y resultados.</span></label>
      </fieldset>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error} Revisa los datos e inténtalo de nuevo.</AlertDescription></Alert>}
      <div className="registration-actions">
        {steps && step > 1 && <Button type="button" variant="outline" disabled={busy} onClick={() => go(step - 1)}>Volver</Button>}
        {steps && step < 3 ? <Button type="submit">Continuar <ArrowRight size={16} /></Button> : <Submit busy={busy} label={schema.require_email ? "Enviar inscripción y verificar correo" : "Enviar inscripción"} />}
      </div>
    </form>
    {(settings.transfer_enabled || settings.cash_enabled) && <section className="registration-bank-section" aria-labelledby="payment-information">
      <h2 id="payment-information">Datos de pago</h2>
      <div className="registration-bank-grid">
        {settings.transfer_enabled && <PaymentInstructions method="transfer" settings={settings} />}
        {settings.cash_enabled && <PaymentInstructions method="cash" settings={settings} />}
      </div>
    </section>}
  </div>;
}
