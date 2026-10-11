"use client";
import {Modal} from "./common";
import { useState, useRef, useEffect } from "react";
import Script from "next/script";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { mutate } from "@/lib/api";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
export function ChatPanel({
  agent,
  enabled,
  slug,
}: {
  slug?: string;
  agent: "public" | "admin" | "sponsors";
  enabled: boolean;
}) {
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  if (!enabled)
    return (
      <Alert>
        <Sparkles />
        <AlertTitle>Asistente pendiente de conexión</AlertTitle>
        <AlertDescription>
          Las consultas y acciones manuales están disponibles. El organizador
          debe conectar ChatKit para habilitar este asistente.
        </AlertDescription>
      </Alert>
    );
  return (
    <div aria-label="Asistente del torneo" role="region">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {started ? (
        <>
          <Script
            src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
            strategy="afterInteractive"
          />
          <ConnectedChat agent={agent} slug={slug} onError={setError} />
        </>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {agent === "admin"
              ? "Pregunta por inscripciones, partidos o resultados; las acciones se aplican solo cuando las confirmas."
              : agent === "sponsors"
                ? "Consulta el estado de tus patrocinadores y próximos pasos."
                : "Pregunta por horarios, resultados o grupos del torneo."}
          </p>
          <Button onClick={() => setStarted(true)}>
            <Sparkles data-icon="inline-start" />
            Iniciar asistente
          </Button>
        </div>
      )}
    </div>
  );
}
function ConnectedChat({
  agent,
  slug,
  onError,
}: {
  slug?: string;
  agent: "public" | "admin" | "sponsors";
  onError: (message: string) => void;
}) {
  const [proposal,setProposal]=useState<{id:string;summary:string[]}|null>(null),[busy,setBusy]=useState(false);
  const resolveTool=useRef<((value:Record<string,unknown>)=>void)|null>(null);
  useEffect(()=>()=>{resolveTool.current?.({cancelled:true});},[]);
  const { control } = useChatKit({
    async onClientTool(call){
      try{
        if(['public_state','operational_state','sponsor_state'].includes(call.name))return await mutate('/v1/agent/tools',{agent,slug,tool:call.name});
        if(call.name!=='propose_action')return {error:'Herramienta no permitida'};
        if(resolveTool.current)return {error:'Confirma o cancela la propuesta anterior primero.'};
        const result=await mutate('/v1/agent/prepare',{agent,slug,route:call.params.route,payload:call.params.payload});
        setProposal(result.proposal as {id:string;summary:string[]});
        return await new Promise<Record<string,unknown>>(resolve=>{resolveTool.current=resolve;});
      }catch(e){return {error:e instanceof Error?e.message:'No se pudo preparar la acción'};}
    },
    api: {
      async getClientSecret() {
        try {
          const r = await mutate("/v1/chatkit/session", { agent, slug });
          return r.client_secret as string;
        } catch (e) {
          onError(e instanceof Error ? e.message : "Error de conexión");
          throw e;
        }
      },
    },
  });
  return <><ChatKit control={control} aria-label="Conversación con el asistente" className="h-[550px] w-full"/><Modal title="Revisar acción del asistente" description="Comprueba cada dato. La operación se ejecutará únicamente cuando confirmes." open={!!proposal} onClose={()=>{if(busy)return;resolveTool.current?.({cancelled:true});resolveTool.current=null;setProposal(null);}}><div className="flex flex-col gap-3 text-sm">{proposal?.summary.map((line,i)=><p className="whitespace-pre-wrap" key={i}>{line}</p>)}</div><Button disabled={busy} onClick={async()=>{if(!proposal)return;setBusy(true);try{const result=await mutate('/v1/agent/apply',{proposal_id:proposal.id,confirmed:true});resolveTool.current?.(result);resolveTool.current=null;setProposal(null);}catch(e){onError((e as Error).message);}finally{setBusy(false);}}}>Confirmar acción</Button></Modal></>;
}
