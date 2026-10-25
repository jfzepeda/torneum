import { pool, transaction, type Db } from "./db.js";
import { hashPassword } from "./auth.js";
import { draw, changeSchedule, reportResult } from "./competition.js";
import { randomBytes } from "node:crypto";
async function seedPlatformAdmin(db: Db) {
  if ((await db.query("SELECT 1 FROM platform_admins LIMIT 1")).rowCount) return;
  const password = randomBytes(18).toString("base64url");
  await db.query(
    "INSERT INTO platform_admins(email,name,password_hash) VALUES('admin@plataforma.local','Plataforma',$1)",
    [hashPassword(password)],
  );
  return password;
}
async function writeCredentials(club: string | null, platform?: string) {
  if (!club && !platform) return;
  const { writeFile, readFile } = await import("node:fs/promises");
  const old = (await readFile(".admin-credentials", "utf8").catch(() => "")).trim();
  await writeFile(
    ".admin-credentials",
    (club ? `admin@torneum.local\n${club}\n` : old ? old + "\n" : "") +
      (platform ? `admin@plataforma.local\n${platform}\n` : ""),
    { mode: 0o600 },
  );
  console.log(
    "Credenciales locales guardadas en backend/.admin-credentials (0600).",
  );
}
export async function seed(demo = false) {
  return transaction(async (db) => {
    const platformPassword = await seedPlatformAdmin(db);
    if (
      (await db.query("SELECT 1 FROM organizations WHERE slug='club-torneum'"))
        .rowCount
    ) {
      await writeCredentials(null, platformPassword);
      return;
    }
    const org = (
      await db.query(
        "INSERT INTO organizations(name,slug) VALUES('Club Torneum','club-torneum') RETURNING id",
      )
    ).rows[0];
    const password =
      process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
    await writeCredentials(
      process.env.ADMIN_PASSWORD ? null : password,
      platformPassword,
    );
    const user = (
      await db.query(
        "INSERT INTO users(organization_id,name,email,password_hash,role) VALUES($1,'Organizador','admin@torneum.local',$2,'admin') RETURNING id",
        [org.id, hashPassword(password)],
      )
    ).rows[0];
    const actor = {
      id: user.id,
      organization_id: org.id,
      role: "admin" as const,
      name: "Organizador",
    };
    const t = (
      await db.query(
        "INSERT INTO tournaments(organization_id,name,venue,city,starts_on,ends_on) VALUES($1,$2,'Club de Pádel','Ciudad de México','2026-09-18','2026-09-20') RETURNING id",
        [org.id, demo ? "Copa Torneum 2026" : "Mi primer torneo"],
      )
    ).rows[0];
    for (let i = 1; i <= 4; i++)
      await db.query(
        "INSERT INTO courts(organization_id,tournament_id,name) VALUES($1,$2,$3)",
        [org.id, t.id, i === 1 ? "Cancha central" : `Cancha ${i}`],
      );
    const categories = [];
    for (const name of [
      "Varonil · Intermedia",
      "Femenil · Intermedia",
      "Mixta · Abierta",
    ])
      categories.push(
        (
          await db.query(
            "INSERT INTO categories(organization_id,tournament_id,name) VALUES($1,$2,$3) RETURNING id",
            [org.id, t.id, name],
          )
        ).rows[0],
      );
    for (const [name, amount, priority, benefits] of [
      [
        "Principal",
        25000,
        1,
        "Presencia principal, naming de cancha y entrega de premios",
      ],
      ["Oficial", 12000, 2, "Logo en portal, calendario y cuadro"],
      ["Colaborador", 5000, 3, "Presencia en portal público"],
    ] as const)
      await db.query(
        "INSERT INTO sponsor_levels(organization_id,tournament_id,name,amount,priority,benefits,zones) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          org.id,
          t.id,
          name,
          amount,
          priority,
          benefits,
          priority < 3 ? ["portal", "calendar", "bracket"] : ["portal"],
        ],
      );
    if (!demo) return;
    const pairs = [
      ["Alejandro Ruiz", "Diego Mendoza"],
      ["Carlos Vega", "Andrés Flores"],
      ["Fernando Silva", "Pablo Torres"],
      ["Javier Ríos", "Luis Herrera"],
      ["Miguel Ortega", "Daniel Cruz"],
      ["Rodrigo Reyes", "Santiago León"],
      ["Ricardo Soto", "Emiliano Paz"],
      ["Gabriel Lara", "Sebastián Gil"],
      ["Valentina Mora", "Camila Ortiz"],
      ["Mariana Luna", "Sofía Vidal"],
      ["Regina Castro", "Fernanda Sol"],
      ["Isabella Peña", "Lucía Ramos"],
      ["Ana Beltrán", "Paula Campos"],
      ["Elena Santos", "Julia Gómez"],
      ["Andrea Pérez", "Renata Díaz"],
      ["Natalia Costa", "Daniela Rey"],
      ["Victoria Salas", "Mateo Ruiz"],
      ["Carolina Vega", "Nicolás Díaz"],
      ["Patricia Sol", "Tomás Silva"],
      ["Gabriela Gil", "Bruno Pérez"],
    ];
    for (const [i, names] of pairs.entries()) {
      const category = categories[i < 8 ? 0 : i < 16 ? 1 : 2];
      await db.query(
        "INSERT INTO teams(organization_id,tournament_id,category_id,name,players,captain,email,status,verified_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,now())",
        [
          org.id,
          t.id,
          category.id,
          names.map((n) => n.split(" ").at(-1)).join(" / "),
          JSON.stringify(names.map((name) => ({ name }))),
          `demo${i + 1}@example.invalid`,
          i < 16 ? "approved" : "pending",
        ],
      );
    }
    await draw(db, actor, categories[0].id, "torneum-demo-2026", true);
    await draw(db, actor, categories[1].id, "torneum-demo-fem-2026", true);
    const matches = (
      await db.query(
        "SELECT id FROM matches WHERE tournament_id=$1 ORDER BY id",
        [t.id],
      )
    ).rows;
    const courts = (
      await db.query(
        "SELECT id FROM courts WHERE tournament_id=$1 ORDER BY name",
        [t.id],
      )
    ).rows;
    // Sequential slots guarantee demonstration schedule respects every pair's rest.
    for (const [i, m] of matches.slice(0, 10).entries()) {
      const start = new Date(
        Date.UTC(2026, 8, 18, 14 + Math.floor(i / 4) * 2, (i % 4) * 0),
      );
      try {
        await changeSchedule(db, actor, t.id, [
          {
            id: m.id,
            court_id: courts[i % 4].id,
            starts_at: start.toISOString(),
          },
        ]);
      } catch {
        /* Keep conflicting demonstrations unscheduled, never force an invalid schedule. */
      }
    }
    for (const m of matches.slice(0, 4))
      await reportResult(
        db,
        actor,
        m.id,
        {
          sets: [
            [6, 3],
            [6, 4],
          ],
          reason: "normal",
        },
        true,
      );
    await db.query(
      "INSERT INTO sponsors(organization_id,tournament_id,name,website,email,status,notes) VALUES($1,$2,'Ejemplo · Marca deportiva','','','prospect','Dato de demostración; sustituir por un prospecto con evidencia real.')",
      [org.id, t.id],
    );
    console.log("Datos de demostración cargados; ningún contacto real.");
  });
}
if (process.argv[1]?.endsWith("seed.ts")) {
  await seed(process.argv.includes("--demo"));
  await pool.end();
}
