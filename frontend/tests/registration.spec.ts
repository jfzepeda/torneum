import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const tournamentId = "10000000-0000-4000-8000-000000000001";
const settings = {transfer_enabled:true, cash_enabled:true, stripe_enabled:true, bank:"Banco de prueba", account_holder:"Club de prueba · Datos ilustrativos", clabe:"012345678901234567", account_number:"0123456789", transfer_instructions:"Datos de prueba. Escribe el nombre del jugador en el concepto y entrega tu comprobante en recepción.", cash_instructions:"Recepción del club de prueba.\nLunes a viernes, de 9:00 a 18:00 h.", manual_payment_hours:48};
const state = {
  organization:{id:"org", name:"Club de prueba", slug:"registro-demo"},
  tournaments:[{id:tournamentId,name:"Torneo Invernal 2026"}],
  tournament:{id:tournamentId,name:"Torneo Invernal 2026",venue:"Club de prueba",city:"Colima",starts_on:"2026-11-28",ends_on:"2026-12-07",dates_label:"",status:"draft",registration_open:true,registration_schema:{layout:"sections",phone_mode:"participant",email_mode:"team",fields:[]},payment_settings:settings,highlights:[{title:"Grip + hidratación",text:"Incluye · Datos de prueba"}]},
  categories:["6ta", "4ta", "Suma 4", "5ta", "3ra", "Femenil B"].map((name,i)=>({id:`20000000-0000-4000-8000-00000000000${i+1}`,name,participant_count:2,payment_mode:"choice",price_cents:160000,capacity:24,registration_count:8,draw_published:false,rules:{sets:3},payment_policy:"El lugar se confirma al recibir el pago."})),
  stripe_ready:true, teams:[],matches:[],courts:[],groups:[],standings:[],sponsors:[],levels:[],requests:[],messages:[],users:[],audit:[],archives:[],integrations:{},
};
async function mock(page:Page, options:{steps?:boolean; stripe?:boolean; closed?:boolean; admin?:boolean; failure?:boolean; custom?:boolean} = {}) {
  const data = structuredClone(state);
  if(options.steps) data.tournament.registration_schema.layout = "steps";
  if(options.stripe === false) data.stripe_ready = false;
  if(options.closed) data.tournament.registration_open = false;
  if(options.custom) (data.tournament.registration_schema.fields as unknown[]) = [{id:"shirt",label:"Talla de camiseta",scope:"participant",type:"select",active:true,required:true,options:["S","M","L"]}];
  const writes:{path:string;body:any}[]=[];
  await page.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body:unknown={};
    if(route.request().method()==="POST") {
      writes.push({path,body:route.request().postDataJSON()});
      if(options.failure) {await route.fulfill({status:409,json:{error:{message:"La categoría no tiene cupos."}}});return;}
      if(path==="/v1/registrations") body={ok:true,access_link:"/registro-demo/verificar#test-token"};
      else body={ok:true};
    } else if (path==="/v1/session") body={actor:options.admin?{id:"admin",organization_id:"org",organization_slug:"registro-demo",name:"Admin",role:"admin"}:null};
    else if(path.startsWith("/v1/public/") || path==="/v1/state") body=data;
    else if(path==="/v1/stripe/status") body={connected:false};
    await route.fulfill({json:body});
  });
  await page.goto(options.admin?"/registro-demo/panel?view=formulario":"/registro-demo/torneo-invernal-2026/inscripcion");
  return writes;
}
async function players(page: Page) {
  await page.getByRole("textbox",{name:"Nombre completo",exact:true}).nth(0).fill("Ana López");
  await page.getByRole("textbox",{name:"Nombre completo",exact:true}).nth(1).fill("María Pérez");
  await page.getByRole("textbox",{name:"Teléfono del participante 1",exact:true}).fill("5512345678");
  await page.getByRole("textbox",{name:"Teléfono del participante 2",exact:true}).fill("5587654321");
}
test("sections, payment choice, copy, validation, and desktop/mobile layout",async({page,context})=>{
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  await page.emulateMedia({reducedMotion:"reduce"});
  const writes=await mock(page);
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole("radio",{name:/^6ta/}).check();
  await page.getByRole("radio",{name:/Transferencia bancaria/}).check();
  await page.getByRole("button",{name:"Copiar CLABE"}).click();
  await expect(page.getByRole("button",{name:"Copiado",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Enviar inscripción",exact:true}).click();
  expect(writes).toHaveLength(0);
  await players(page);
  await page.getByRole("checkbox",{name:/Acepto las políticas/}).check();
  await mkdir("../.impeccable/review",{recursive:true});
  await page.getByText("CLABE copiada",{exact:true}).waitFor({state:"hidden"});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"../.impeccable/review/desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"../.impeccable/review/mobile.png",fullPage:true});
  for (const width of [320, 390, 640, 768]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const players = page.locator(".registration-players > fieldset");
    const first = await players.nth(0).boundingBox(), second = await players.nth(1).boundingBox();
    expect(first && second && second.y >= first.y + first.height).toBeTruthy();
    const cards = await page.locator(".registration-categories .registration-option").all();
    for (const card of cards) {
      const box = await card.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width).toBeTruthy();
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("radio",{name:/Efectivo en el club/}).check();
  await page.getByRole("button",{name:"Enviar inscripción",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Inscripción recibida."})).toBeVisible();
  expect(writes[0].body.payment_method).toBe("cash");
  expect(writes[0].body.name).toBe("Ana López / María Pérez");
  expect(writes[0].body.players).toHaveLength(2);
});
test("steps preserve players when going back and exclude unavailable Stripe",async({page})=>{
  const writes=await mock(page,{steps:true,stripe:false,custom:true});
  await page.getByRole("radio",{name:/^6ta/}).check();
  await page.getByRole("button",{name:"Continuar",exact:true}).click();
  await players(page);
  await page.getByLabel("Talla de camiseta",{exact:false}).nth(0).selectOption("M");
  await page.getByLabel("Talla de camiseta",{exact:false}).nth(1).selectOption("L");
  await page.getByRole("button",{name:"Continuar",exact:true}).click();
  await expect(page.getByRole("radio",{name:/Tarjeta con Stripe/})).toHaveCount(0);
  await page.getByRole("button",{name:"Volver",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Nombre completo",exact:true}).nth(0)).toHaveValue("Ana López");
  await page.getByRole("button",{name:"Continuar",exact:true}).click();
  await page.getByRole("radio",{name:/Transferencia bancaria/}).check();
  await page.getByRole("checkbox",{name:/Acepto las políticas/}).check();
  await page.getByRole("button",{name:"Enviar inscripción",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Inscripción recibida."})).toBeVisible();
  expect(writes[0].body.players[0].answers.shirt).toBe("M");
  expect(writes[0].body.payment_method).toBe("transfer");
});
test("closed registration never exposes a submit action",async({page})=>{
  await mock(page,{closed:true});
  await expect(page.getByRole("heading",{name:"Las inscripciones están cerradas"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Enviar inscripción/})).toHaveCount(0);
});
test("server error keeps player data and allows retry",async({page})=>{
  await mock(page,{failure:true});
  await page.getByRole("radio",{name:/^6ta/}).check();
  await players(page);
  await page.getByRole("radio",{name:/Tarjeta con Stripe/}).check();
  await page.getByRole("checkbox",{name:/Acepto las políticas/}).check();
  await page.getByRole("button",{name:"Enviar inscripción",exact:true}).click();
  await expect(page.locator("form [role=alert]")).toContainText("La categoría no tiene cupos");
  await expect(page.getByRole("textbox",{name:"Nombre completo",exact:true}).nth(0)).toHaveValue("Ana López");
});
test("organizer edits fields and bank settings without Google",async({page})=>{
  const writes=await mock(page,{admin:true});
  await expect(page.getByRole("button",{name:"Añadir campo"})).toBeVisible();
  await page.getByRole("button",{name:"Añadir campo"}).click();
  await page.getByLabel("Etiqueta",{exact:true}).fill("Club de origen");
  await page.getByRole("button",{name:"Guardar campos"}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].body.schema.fields[0].label).toBe("Club de origen");
  await page.getByRole("button",{name:"Medios y datos de pago"}).click();
  await page.getByRole("textbox",{name:"Banco",exact:true}).fill("Banco actualizado");
  await page.getByRole("button",{name:"Guardar datos de pago"}).click();
  await expect.poll(()=>writes.length).toBe(2);
  expect(writes[1].body.bank).toBe("Banco actualizado");
  expect(writes[1].body.clabe).toBe("012345678901234567");
  await page.setViewportSize({width:1440,height:1000});
  await page.getByText("Datos de pago guardados",{exact:true}).waitFor({state:"hidden"});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"../.impeccable/review/admin.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"../.impeccable/review/admin-mobile.png",fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
