"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Choice, Modal, TextField, Submit, EmptyState, formValue } from "./common";
import type { Action, ViewProps } from "./dashboard";

export function CreateTournament({ open, onClose, action, orgName }: { open: boolean; onClose: () => void; action: Action; orgName: string }) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  return <Modal title="Crear torneo" description="El nuevo torneo comparte la configuración del club. Los demás torneos permanecen abiertos." open={open} onClose={onClose}>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      const d = new FormData(e.currentTarget);
      try { await action("/v1/tournaments/new", { name:formValue(d,"name"), venue:formValue(d,"venue"), city:formValue(d,"city"), starts_on:formValue(d,"start"), ends_on:formValue(d,"end") }); onClose(); }
      catch(e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><FieldGroup>
      <TextField label="Nombre del torneo" name="name" />
      <TextField label="Sede / Club" name="venue" defaultValue={orgName} />
      <TextField label="Ciudad" name="city" required={false} />
      <FieldGroup className="grid grid-cols-2 gap-3"><TextField label="Fecha de inicio" name="start" type="date" /><TextField label="Fecha de fin" name="end" type="date" /></FieldGroup>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Submit busy={busy} label="Crear torneo" />
    </FieldGroup></form>
  </Modal>;
}

export function CollaboratorAssignments({ user, state, action }: Pick<ViewProps,"state" | "action"> & { user: ViewProps["state"]["users"][number] }) {
  const [open,setOpen] = useState(false), [selected,setSelected] = useState(user.tournament_ids || []), [busy,setBusy] = useState(false);
  const tournaments = state.management?.tournaments || state.tournaments;
  if (user.role === "admin") return <span>Todos los torneos</span>;
  return <>
    <Button size="sm" variant="outline" onClick={() => {setSelected(user.tournament_ids || []);setOpen(true);}}>Asignar torneos ({user.tournament_ids?.length || 0})</Button>
    <Modal title={`Torneos de ${user.name}`} description="Conserva su cuenta y rol. Desmarcar un torneo retira únicamente ese acceso." open={open} onClose={() => setOpen(false)}>
      <div className="flex flex-col gap-4">
        {tournaments.map(t => <label key={t.id} className="flex items-center gap-3"><input type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(s => e.target.checked ? [...s,t.id] : s.filter(id => id !== t.id))} />{t.name}{t.status === "archived" ? " (archivado)" : ""}</label>)}
        {!tournaments.length && <p>Aún no hay torneos. Puedes asignarlos después de crearlos.</p>}
        <Button disabled={busy} onClick={async () => {setBusy(true);try {await action("/v1/workspaces/collaborators", {user_id:user.id,tournament_ids:selected});setOpen(false);}catch{}finally{setBusy(false);}}}>Guardar asignaciones</Button>
      </div>
    </Modal>
  </>;
}

type Kind = "categories" | "levels" | "sponsors" | "users";
const emptySelection = () => ({ categories: [] as string[], levels: [] as string[], sponsors: [] as string[], users: [] as string[] });
export function ReuseResources({ state, actor, action }: ViewProps) {
  const [source,setSource] = useState("none"), [target,setTarget] = useState("none"), [selection,setSelection] = useState(emptySelection), [skip,setSkip] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const catalog = state.management;
  if (actor.role !== "admin") return <Alert><AlertDescription>Solo los administradores pueden reutilizar recursos entre torneos.</AlertDescription></Alert>;
  if (!catalog || catalog.tournaments.length < 2) return <EmptyState title="Necesitas dos torneos" description="Crea otro torneo desde el sidebar para reutilizar categorías, paquetes, patrocinadores y colaboradores." />;
  const groups: {key:Kind;title:string;items:{id:string;name:string}[]}[] = [
    {key:"categories",title:"Categorías",items:catalog.categories.filter(c => c.tournament_id === source)},
    {key:"levels",title:"Paquetes",items:catalog.levels.filter(l => l.tournament_id === source)},
    {key:"sponsors",title:"Patrocinadores",items:catalog.sponsors.filter(s => s.tournament_id === source)},
    {key:"users",title:"Colaboradores",items:catalog.users.filter(u => u.active && u.role !== "admin" && u.tournament_ids?.includes(source))},
  ];
  const packageIds = [...new Set([...selection.levels,...catalog.sponsors.filter(s => selection.sponsors.includes(s.id)).map(s => s.level_id).filter((id): id is string => !!id)])];
  const count = selection.categories.length + packageIds.length + selection.sponsors.length + selection.users.length;
  const conflicts = catalog.categories.filter(c => selection.categories.includes(c.id) && catalog.categories.some(other => other.tournament_id === target && other.name === c.name));
  return <section className="panel settings-form">
    <h2>Reutilizar de otro torneo</h2>
    <p>Las categorías y paquetes se copian de forma independiente. Los patrocinadores y colaboradores conservan su identidad en el club.</p>
    <FieldGroup>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Choice label="Torneo de origen" value={source} onChange={id => {setSource(id);setSelection(emptySelection());setError("");}} options={[{value:"none",label:"Seleccionar origen"},...catalog.tournaments.map(t => ({value:t.id,label:t.name+(t.status === "archived" ? " (archivado)" : "")}))]} />
        <Choice label="Torneo de destino" value={target} onChange={setTarget} options={[{value:"none",label:"Seleccionar destino"},...catalog.tournaments.filter(t => t.status !== "archived").map(t => ({value:t.id,label:t.name}))]} />
      </FieldGroup>
      {source !== "none" && <div className="grid gap-6 md:grid-cols-2">{groups.map(group => <fieldset key={group.key} className="flex flex-col gap-3"><legend className="mb-3 font-medium">{group.title}</legend>{!group.items.length && <p className="text-sm text-muted-foreground">Sin elementos en este torneo.</p>}{group.items.map(item => <label className="flex items-center gap-3" key={item.id}><input type="checkbox" checked={selection[group.key].includes(item.id)} onChange={e => setSelection(s => ({...s,[group.key]:e.target.checked ? [...s[group.key],item.id] : s[group.key].filter(id => id !== item.id)}))} />{item.name}</label>)}</fieldset>)}</div>}
      {!!count && <Alert><AlertDescription>
        Se copiarán {selection.categories.length} categorías y {packageIds.length} paquetes; se asignarán {selection.sponsors.length} patrocinadores y {selection.users.length} colaboradores a {catalog.tournaments.find(t => t.id === target)?.name || "un destino por seleccionar"}.
        {!!packageIds.length && " Se incluyen los paquetes vinculados a los patrocinadores seleccionados."}
        {" Las categorías comienzan sin participantes ni resultados y con sus ventanas de inscripción sin definir. Revisa sus fechas después de copiar. Los patrocinios comienzan como prospectos; los excluidos permanecen excluidos."}
      </AlertDescription></Alert>}
      {!!conflicts.length && <p role="status">Categorías que ya existen por nombre: {conflicts.map(c => c.name).join(", ")}. No se sobrescribirán.</p>}
      <label className="flex items-center gap-3"><input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />Omitir categorías que ya existen en el destino</label>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button disabled={busy || !count || source === "none" || target === "none" || source === target} onClick={async () => {
        setBusy(true);setError("");
        try { const result = await action("/v1/workspaces/reuse",{source_id:source,target_id:target,...selection,skip_conflicts:skip});setSelection(emptySelection()); const skipped=result.skipped as string[]; if(skipped?.length)toast.info(`Sin duplicar: ${skipped.join(", ")}`); }
        catch(e){setError((e as Error).message);}finally{setBusy(false);}
      }}>{busy ? "Aplicando selección…" : "Copiar y asignar selección"}</Button>
    </FieldGroup>
  </section>;
}
