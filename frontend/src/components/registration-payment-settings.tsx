"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { TextField, Submit } from "./common";
import type { ViewProps } from "./dashboard";
import type { Category } from "@/lib/types";

export type PaymentMethod = "free" | "stripe" | "transfer" | "cash" | "external";
export type TournamentPayments = {
  transfer_enabled?: boolean;
  cash_enabled?: boolean;
  stripe_enabled?: boolean;
  bank?: string;
  account_holder?: string;
  account_number?: string;
  clabe?: string;
  transfer_instructions?: string;
  cash_instructions?: string;
  manual_payment_hours?: number;
};
export const paymentLabels: Record<PaymentMethod, string> = {
  free: "Sin costo", stripe: "Tarjeta con Stripe", transfer: "Transferencia bancaria", cash: "Efectivo en el club", external: "Con el organizador",
};
export function availablePaymentMethods(category: Category | undefined, settings: TournamentPayments, stripeReady: boolean): PaymentMethod[] {
  if (!category) return [];
  if (category.payment_mode === "free") return ["free"];
  if (category.payment_mode === "stripe") return stripeReady ? ["stripe"] : [];
  const methods: PaymentMethod[] = [];
  if (settings.transfer_enabled) methods.push("transfer");
  if (settings.cash_enabled) methods.push("cash");
  if (category.payment_mode === "choice" && settings.stripe_enabled && stripeReady) methods.push("stripe");
  if (category.payment_mode === "external" && !methods.length) methods.push("external");
  return methods;
}
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <Button type="button" variant="outline" size="sm" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); toast.success(`${label} copiada`); }
    catch { toast.error("No se pudo copiar. Selecciona el número y cópialo manualmente."); }
  }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : `Copiar ${label}`}</Button>;
}
export function PaymentInstructions({ method, settings }: {method: PaymentMethod; settings: TournamentPayments}) {
  if (method === "transfer") return <div className="registration-payment-details space-y-4">
    <h3>Datos para tu transferencia</h3>
    <dl className="space-y-3">
      <div><dt className="text-sm text-muted-foreground">Banco</dt><dd className="font-semibold">{settings.bank}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Titular</dt><dd className="font-semibold">{settings.account_holder}</dd></div>
      <div><dt className="text-sm text-muted-foreground">CLABE interbancaria</dt><dd className="font-semibold"><span className="bank-number">{settings.clabe}</span> {settings.clabe && <CopyValue value={settings.clabe} label="CLABE" />}</dd></div>
      {settings.account_number && <div><dt className="text-sm text-muted-foreground">Número de cuenta</dt><dd className="font-semibold"><span className="bank-number">{settings.account_number}</span> <CopyValue value={settings.account_number} label="cuenta" /></dd></div>}
    </dl>
    {settings.transfer_instructions && <p className="whitespace-pre-wrap">{settings.transfer_instructions}</p>}
    <p>El organizador confirmará tu pago. Enviar el formulario no confirma la transferencia.</p>
  </div>;
  if (method === "cash") return <div className="registration-payment-details space-y-4"><h3>Paga en efectivo</h3><p className="whitespace-pre-wrap">{settings.cash_instructions}</p><p>Tu pago quedará pendiente hasta que el organizador confirme que lo recibió.</p></div>;
  if (method === "stripe") return <div className="registration-payment-details space-y-4"><h3>Pago seguro con Stripe</h3><p>Después de enviar la inscripción, entra a Mi inscripción para pagar con tarjeta. Si el torneo solicita verificar tu correo, recibirás primero un enlace de acceso.</p></div>;
  if (method === "external") return <p>Contacta al organizador para acordar cómo pagar. Tu inscripción quedará pendiente de pago.</p>;
  return <p>Esta categoría es gratuita. No necesitas realizar ningún pago.</p>;
}
export function TournamentPaymentSettings({ state, action }: ViewProps) {
  const tournament = state.tournament!;
  const settings = tournament.payment_settings || {};
  const [transfer, setTransfer] = useState(!!settings.transfer_enabled), [cash, setCash] = useState(!!settings.cash_enabled);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="panel p-5 sm:p-7 space-y-6" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    const data = new FormData(e.currentTarget), text = (name: string) => String(data.get(name) || "").trim();
    try {
      await action(`/v1/tournaments/${tournament.id}/payment-settings`, {
        transfer_enabled: transfer, cash_enabled: cash, stripe_enabled: data.has("stripe_enabled"),
        bank: text("bank"), account_holder: text("account_holder"), account_number: text("account_number"), clabe: text("clabe"),
        transfer_instructions: text("transfer_instructions"), cash_instructions: text("cash_instructions"), manual_payment_hours: Number(text("manual_payment_hours")),
      });
      toast.success("Datos de pago guardados");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <div><h2>Cómo pueden pagar los jugadores</h2><p className="text-sm text-muted-foreground mt-2">Configura los datos públicos de este torneo. En Categorías, elige «Métodos del torneo» para ofrecer las opciones habilitadas y define el precio por equipo.</p></div>
    <fieldset className="space-y-4 border-b pb-6">
      <legend className="mb-4"><label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} />Aceptar transferencias</label></legend>
      <div hidden={!transfer} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="Banco" name="bank" defaultValue={settings.bank} required={transfer} /><TextField label="Titular de la cuenta" name="account_holder" defaultValue={settings.account_holder} required={transfer} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="CLABE (18 dígitos)" name="clabe" defaultValue={settings.clabe} required={transfer} /><TextField label="Número de cuenta" name="account_number" defaultValue={settings.account_number} required={false} /></div>
        <label className="grid gap-2 text-sm">Instrucciones para la transferencia<textarea name="transfer_instructions" className="rounded-md border bg-background p-3" rows={3} maxLength={2000} defaultValue={settings.transfer_instructions} placeholder="Concepto del pago y dónde enviar el comprobante." /></label>
      </div>
    </fieldset>
    <fieldset className="space-y-4 border-b pb-6">
      <legend className="mb-4"><label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} />Aceptar efectivo</label></legend>
      <div hidden={!cash}><label className="grid gap-2 text-sm">Dónde y cuándo pagar<textarea name="cash_instructions" className="rounded-md border bg-background p-3" rows={3} maxLength={2000} defaultValue={settings.cash_instructions} required={cash} placeholder="Recepción, dirección y horarios de atención." /></label></div>
    </fieldset>
    <div className="space-y-2"><label className="flex items-center gap-3 font-semibold"><input type="checkbox" name="stripe_enabled" defaultChecked={settings.stripe_enabled} />Ofrecer tarjeta con Stripe</label><p className="text-sm text-muted-foreground">Solo se mostrará cuando la cuenta del club esté conectada y habilitada para cobrar. Conéctala desde Configuración del club.</p></div>
    <TextField name="manual_payment_hours" label="Plazo para pagar en efectivo o transferencia (horas)" type="number" min={1} max={720} defaultValue={settings.manual_payment_hours || 48} help="La reserva vence si no se confirma el pago dentro de este plazo. Los cambios solo aplican a nuevas inscripciones." />
    <p className="text-sm text-muted-foreground">Los datos bancarios e instrucciones serán visibles para los participantes.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Submit busy={busy} label="Guardar datos de pago" />
  </form>;
}
