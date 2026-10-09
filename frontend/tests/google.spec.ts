import { test, expect, type Page } from "@playwright/test";
const tournament = "10000000-0000-4000-8000-000000000001";
const category = "20000000-0000-4000-8000-000000000001";
const team = "30000000-0000-4000-8000-000000000001";
const schema = {
  email_mode: "participant",
  phone_mode: "participant",
  fields: [
    {
      id: "shirt",
      label: "Talla",
      scope: "participant",
      type: "select",
      required: true,
      active: true,
      options: ["S", "M", "L"],
    },
    {
      id: "kit",
      label: "Kit",
      scope: "team",
      type: "boolean",
      required: false,
      active: true,
      options: [],
    },
  ],
};
const registration = {
  name: "Cometas",
  category_id: category,
  captain: 0,
  email: "ana@example.com",
  phone: "5511111111",
  players: [
    {
      name: "Ana López",
      email: "ana@example.com",
      phone: "5511111111",
      answers: { shirt: "M" },
    },
  ],
  extra_answers: { kit: true },
};
const base = {
  organization: { id: "org", slug: "google-e2e", name: "Google test" },
  tournament: {
    id: tournament,
    name: "Copa Google",
    venue: "Cancha",
    starts_on: "2026-10-09",
    ends_on: "2026-10-11",
    status: "draft",
    registration_open: true,
    registration_schema: schema,
  },
  categories: [
    {
      id: category,
      name: "Individual",
      capacity: 50,
      participant_count: 1,
      payment_mode: "free",
      price_cents: 0,
      draw_published: false,
      rules: { sets: 3 },
    },
  ],
  teams: [
    { ...registration, id: team, status: "approved", created_at: "2026-10-09" },
  ],
  matches: [],
  courts: [],
  groups: [],
  standings: [],
  sponsors: [],
  levels: [],
  requests: [],
  messages: [],
  users: [],
  audit: [],
  archives: [],
  integrations: { chatkit: false, gmail: false, smtp: false },
};
async function mockApi(page: Page, { oauth = false, inbox = false } = {}) {
  const writes: { path: string; body: any }[] = [];
  let rows = inbox
    ? [
        {
          id: "40000000-0000-4000-8000-000000000001",
          version: 1,
          source: "google_sheets_public",
          normalized: registration,
          status: "pending",
          errors: [],
          review_required: true,
          collisions: [
            {
              id: team,
              kind: "team",
              source: "organizer",
              score: 98,
              reasons: ["participantes", "correo"],
              data: registration,
            },
          ],
        },
      ]
    : [];
  await page.route("**/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let value: any = { ok: true };
    if (req.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:3000",
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "content-type,idempotency-key",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
      return;
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (path.endsWith("/public/preview"))
        value = {
          columns: [
            { id: "c1", label: "Equipo", index: 0 },
            { id: "c2", label: "Participante", index: 1 },
          ],
          rows: [{ fields: { c1: "Cometas", c2: "Ana López" } }],
          total: 1,
          warnings: [],
        };
      else if (path.endsWith("/public/connect"))
        value = { integration: { id: "source", ...body } };
      else if (path.endsWith("/forms/create"))
        value = {
          integration: { id: "generated", config: { form_id: "form-test" } },
        };
      else if (path.endsWith("/resolve")) rows = [];
      else if (path === "/v1/registrations")
        value = { ok: true, review_pending: true };
    } else if (path === "/v1/session")
      value = {
        actor: {
          id: "admin",
          organization_id: "org",
          organization_slug: "google-e2e",
          role: "admin",
          name: "Admin",
        },
      };
    else if (path === "/v1/state" || path.startsWith("/v1/public/"))
      value = base;
    else if (path.includes("/registration-fields/"))
      value = {
        schema,
        targets: [
          { key: "name", label: "Equipo", type: "text", required: true },
          {
            key: "players[0].name",
            label: "Participante 1",
            type: "text",
            required: true,
          },
        ],
      };
    else if (path.endsWith("/capabilities"))
      value = {
        googleOAuth: { available: oauth },
        publicSheets: { available: true },
        connection: oauth ? "connected" : "disconnected",
      };
    else if (path.includes("/registration-inbox/"))
      value = { items: rows, next_offset: null };
    else if (path.includes("/integrations/google/"))
      value = { integrations: [] };
    await route.fulfill({
      json: value,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:3000",
        "access-control-allow-credentials": "true",
      },
    });
  });
  return writes;
}
test("public registration captures per-player fields and displays a private review receipt", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const writes = await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/google-e2e/inscripcion");
  await page.getByLabel("Nombre del equipo", { exact: true }).fill("Cometas");
  await page
    .getByLabel("Nombre del participante 1", { exact: true })
    .fill("Ana López");
  await page.getByLabel("Correo del participante 1").fill("ana@example.com");
  await page.getByLabel("Teléfono del participante 1").fill("5511111111");
  await page.getByLabel("Talla").selectOption("M");
  await page.getByLabel("Kit", { exact: true }).selectOption("true");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Registrar/ }).click();
  await expect(
    page.getByRole("heading", { name: "Solicitud recibida." }),
  ).toBeVisible();
  const data = writes.find((w) => w.path === "/v1/registrations")!.body;
  expect(data.players[0].answers.shirt).toBe("M");
  expect(data.extra_answers.kit).toBe(true);
  expect(errors).toEqual([]);
});
test("public mapper works with OAuth disabled and saves selected targets", async ({
  page,
}) => {
  const writes = await mockApi(page);
  await page.goto("/google-e2e?view=google");
  await page
    .getByRole("button", { name: "Google Forms / Sheets", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Conectar cuenta de Google",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Nombre de la integración").fill("Respuestas");
  await page
    .getByLabel("Enlace de Google Sheets")
    .fill("https://docs.google.com/spreadsheets/d/test/edit");
  await page.getByRole("button", { name: "Validar y previsualizar" }).click();
  await page.getByLabel("Mapear Equipo", { exact: true }).selectOption("name");
  await page
    .getByLabel("Mapear Participante", { exact: true })
    .selectOption("players[0].name");
  await page.getByRole("button", { name: "Guardar y sincronizar" }).click();
  await expect
    .poll(() => writes.some((w) => w.path.endsWith("/public/connect")))
    .toBeTruthy();
  expect(
    writes.find((w) => w.path.endsWith("/public/connect"))!.body.mapping
      .mappings,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: "c2", target: "players[0].name" }),
    ]),
  );
});
test("yellow review links the original and generated forms use the category schema", async ({
  page,
}) => {
  const writes = await mockApi(page, { oauth: true, inbox: true });
  await page.goto("/google-e2e?view=google");
  await expect(
    page.getByText("Amarillo · revisar", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await expect(page.getByText("98% · Cometas")).toBeVisible();
  await page.getByRole("button", { name: "Elegir como original" }).click();
  await page
    .getByRole("button", { name: "Vincular sin cambiar original" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(writes.find((w) => w.path.endsWith("/resolve"))!.body).toEqual(
    expect.objectContaining({ action: "link", team_id: team, version: 1 }),
  );
  await page
    .getByRole("button", { name: "Google Forms / Sheets", exact: true })
    .click();
  await page
    .getByLabel("Título del formulario")
    .fill("Copa Google · Individual");
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .click();
  await expect
    .poll(() => writes.some((w) => w.path.endsWith("/forms/create")))
    .toBeTruthy();
  expect(
    writes.find((w) => w.path.endsWith("/forms/create"))!.body.category_id,
  ).toBe(category);
});
test("organizer configures an extra field and uses the shared internal registration form", async ({
  page,
}) => {
  const writes = await mockApi(page);
  await page.goto("/google-e2e?view=google");
  await page
    .getByRole("button", { name: "Campos de inscripción", exact: true })
    .click();
  await page.getByRole("button", { name: "Añadir campo" }).click();
  await page
    .getByLabel("Etiqueta", { exact: true })
    .last()
    .fill("Preferencia alimentaria");
  await page.getByRole("button", { name: "Guardar campos" }).click();
  await expect
    .poll(() =>
      writes.some((w) => w.path.endsWith("/registration-fields/save")),
    )
    .toBeTruthy();
  expect(
    writes
      .find((w) => w.path.endsWith("/registration-fields/save"))!
      .body.schema.fields.at(-1).label,
  ).toBe("Preferencia alimentaria");
  await page
    .getByRole("button", { name: "Alta del organizador", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre del equipo", { exact: true }).fill("Cometas");
  await dialog
    .getByLabel("Nombre del participante 1", { exact: true })
    .fill("Ana López");
  await dialog.getByLabel("Correo del participante 1").fill("ana@example.com");
  await dialog.getByLabel("Talla").selectOption("M");
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    writes.find((w) => w.path === "/v1/registrations/internal")!.body.data
      .players[0].answers.shirt,
  ).toBe("M");
});
