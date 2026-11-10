import { z } from "zod";
import { ensure } from "./db.js";

export const paymentSettingsSchema = z.object({
  transfer_enabled: z.boolean().default(false),
  cash_enabled: z.boolean().default(false),
  stripe_enabled: z.boolean().default(false),
  bank: z.string().trim().max(100).default(""),
  account_holder: z.string().trim().max(200).default(""),
  account_number: z.string().trim().max(30).default(""),
  clabe: z.string().trim().default(""),
  transfer_instructions: z.string().trim().max(2000).default(""),
  cash_instructions: z.string().trim().max(2000).default(""),
  manual_payment_hours: z.number().int().min(1).max(720).default(48),
}).superRefine((s, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (s.clabe && !/^\d{18}$/.test(s.clabe)) issue("clabe", "La CLABE debe tener 18 dígitos.");
  if (s.account_number && !/^\d{6,30}$/.test(s.account_number)) issue("account_number", "La cuenta debe contener entre 6 y 30 dígitos.");
  if (s.transfer_enabled && (!s.bank || !s.account_holder || !s.clabe))
    issue("clabe", "Completa banco, titular y CLABE para aceptar transferencias.");
  if (s.cash_enabled && !s.cash_instructions)
    issue("cash_instructions", "Indica dónde y cuándo se recibe el efectivo.");
});

export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;
export type PaymentMethod = "free" | "stripe" | "external" | "transfer" | "cash";

export function paymentMethods(mode: string, settings: PaymentSettings, stripeReady: boolean): PaymentMethod[] {
  if (mode === "free") return ["free"];
  if (mode === "stripe") return stripeReady ? ["stripe"] : [];
  const methods: PaymentMethod[] = [];
  if (settings.transfer_enabled) methods.push("transfer");
  if (settings.cash_enabled) methods.push("cash");
  if (mode === "choice" && settings.stripe_enabled && stripeReady) methods.push("stripe");
  // Preserve existing external-payment categories until their organizer configures methods.
  if (mode === "external" && !methods.length) methods.push("external");
  return methods;
}

export function resolvePaymentMethod(mode: string, settings: PaymentSettings, stripeReady: boolean, requested?: PaymentMethod): PaymentMethod {
  const available = paymentMethods(mode, settings, stripeReady);
  const method = requested || available[0];
  ensure(method && available.includes(method), "El medio de pago no está disponible. Revisa las opciones de la categoría.", 400);
  return method;
}
