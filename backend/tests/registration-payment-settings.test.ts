import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentSettingsSchema, paymentMethods, resolvePaymentMethod } from "../src/registration-payment-settings.js";
import { registrationSchema, validateRegistration } from "../src/registration-fields.js";
const settings = paymentSettingsSchema.parse({transfer_enabled: true, cash_enabled: true, stripe_enabled: true, bank: "Banco de prueba", account_holder: "Organizador de prueba", clabe: "012345678901234567", cash_instructions: "Recepción del club"});
test("payment methods respect category, enabled methods and Stripe readiness", () => {
  assert.deepEqual(paymentMethods("choice", settings, true), ["transfer", "cash", "stripe"]);
  assert.deepEqual(paymentMethods("choice", settings, false), ["transfer", "cash"]);
  assert.deepEqual(paymentMethods("external", settings, true), ["transfer", "cash"]);
  assert.deepEqual(paymentMethods("stripe", settings, false), []);
  assert.deepEqual(paymentMethods("free", settings, true), ["free"]);
  assert.deepEqual(paymentMethods("external", paymentSettingsSchema.parse({}), false), ["external"]);
  assert.deepEqual(paymentMethods("choice", paymentSettingsSchema.parse({}), true), []);
});
test("forged free or unavailable payment choices are rejected", () => {
  assert.throws(() => resolvePaymentMethod("choice", settings, true, "free"), /no está disponible/);
  assert.throws(() => resolvePaymentMethod("choice", settings, false, "stripe"), /no está disponible/);
  assert.throws(() => resolvePaymentMethod("stripe", settings, true, "cash"), /no está disponible/);
  assert.equal(resolvePaymentMethod("choice", settings, true, "cash"), "cash");
});
test("bank details are required only when transfers are enabled", () => {
  assert.equal(paymentSettingsSchema.safeParse({}).success, true);
  assert.equal(paymentSettingsSchema.safeParse({transfer_enabled:true}).success, false);
  assert.equal(paymentSettingsSchema.safeParse({...settings, clabe:"123"}).success, false);
  assert.equal(paymentSettingsSchema.safeParse({...settings, cash_instructions:""}).success, false);
  assert.equal(paymentSettingsSchema.safeParse({...settings, manual_payment_hours:0}).success, false);
});
test("form layout defaults to sections and preserves a selected method through validation", () => {
  const schema = registrationSchema.parse({});
  assert.equal(schema.layout, "sections");
  assert.equal(registrationSchema.parse({layout: "steps"}).layout, "steps");
  const data = validateRegistration({category_id: "20000000-0000-4000-8000-000000000001", name:"Equipo", players:[{name:"Ana López"}], phone:"5512345678", payment_method:"cash"}, schema, 1);
  assert.equal(data.payment_method, "cash");
});
