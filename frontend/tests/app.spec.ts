import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const [email, password] = readFileSync("../backend/.admin-credentials", "utf8")
  .trim()
  .split("\n");
test("organizer can sign in and navigate operational views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar al torneo" }).click();
  await expect(
    page.getByRole("heading", { name: "Todo listo para una gran jornada." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "../output/playwright/dashboard-desktop.png",
    fullPage: true,
  });
  for (const [button, heading] of [
    ["Inscripciones", "Inscripciones"],
    ["Categorías", "Categorías"],
    ["Equipos y jugadores", "Equipos y jugadores"],
    ["Grupos y sorteo", "Grupos y sorteo"],
    ["Calendario y canchas", "Calendario y canchas"],
    ["Partidos y resultados", "Partidos y resultados"],
    ["Patrocinadores", "Patrocinadores"],
    ["Configuración", "Configuración"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Categorías", exact: true }).click();
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill("E2E categoría " + Date.now());
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("public portal and mobile registration", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portal");
  await expect(
    page.getByRole("heading", { name: "Copa Torneum 2026" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/playwright/portal-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/inscripcion");
  await page
    .getByLabel("Nombre de la pareja", { exact: true })
    .fill("E2E Duo " + Date.now());
  await page.getByLabel("Jugador 1 · nombre completo").fill("Prueba Uno");
  await page.getByLabel("Jugador 2 · nombre completo").fill("Prueba Dos");
  await page.getByRole("combobox", { name: "Categoría", exact: true }).click();
  await page
    .getByRole("option", { name: "Mixta · Abierta", exact: true })
    .click();
  await page
    .getByLabel("Correo del capitán", { exact: true })
    .fill(`e2e-${Date.now()}@example.invalid`);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Registrar pareja y verificar correo" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Un paso más y están dentro." }),
  ).toBeVisible();
  await page
    .getByText("Verificar inscripción de prueba", { exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /E2E Duo/ })).toBeVisible();
  await expect(
    page.getByText("Pendiente", { exact: true }).first(),
  ).toBeVisible();
});
