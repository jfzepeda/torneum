"use client";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { labels } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LoaderCircle } from "lucide-react";
const statusHints: Record<string, string> = {
  verification: "Pendiente de revisión por el organizador.",
  pending: "A la espera de una acción o respuesta.",
  approved: "Aprobada y lista para participar.",
  rejected: "No fue aceptada por el organizador.",
  withdrawn: "El equipo se retiró del torneo.",
  unscheduled: "Todavía no tiene fecha, hora ni cancha.",
  scheduled: "Tiene fecha, hora y cancha asignadas.",
  live: "Se está jugando en este momento.",
  finished: "Terminó y el resultado está registrado.",
  disputed: "El resultado está en revisión por una disputa.",
  suspended: "Detenido temporalmente.",
  failed: "No se pudo completar; revisa el detalle e inténtalo de nuevo.",
  queued: "En cola para enviarse.",
  sending: "Envío en curso.",
};
export function Status({ value }: { value: string }) {
  const badge = (
    <Badge variant="outline" className={cn("status", `status-${value}`)}>
      {["live", "approved", "won"].includes(value) && (
        <span className="status-dot" />
      )}
      {labels[value] || value}
    </Badge>
  );
  const hint = statusHints[value];
  if (!hint) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {badge}
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  required = true,
  min,
  max,
  step,
  placeholder,
  help,
}: {
  help?: string;
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const uid = useId();
  const helpId = `${uid}-help`;
  return (
    <Field>
      <FieldLabel htmlFor={uid}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        )}
      </FieldLabel>
      <Input
        id={uid}
        name={name}
        defaultValue={defaultValue}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-describedby={help ? helpId : undefined}
      />
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </Field>
  );
}
export function Choice({
  value,
  onChange,
  options,
  label,
  name,
  help,
}: {
  help?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  name?: string;
}) {
  const uid = useId();
  const helpId = `${uid}-help`;
  return (
    <Field className="choice-field">
      {label && <FieldLabel htmlFor={uid}>{label}</FieldLabel>}
      <Select
        value={value}
        onValueChange={(v) => v && onChange(v)}
        items={options}
        name={name}
      >
        <SelectTrigger
          id={uid}
          aria-label={label || "Seleccionar filtro"}
          aria-describedby={help ? helpId : undefined}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </Field>
  );
}
export function EmptyState({
  title = "Todavía no hay información",
  description = "Los datos aparecerán aquí conforme avance el torneo.",
  icon,
  action,
}: {
  icon?: React.ReactNode;
  action?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        {icon && (
          <div aria-hidden className="text-muted-foreground [&_svg]:size-6">
            {icon}
          </div>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
export function Modal({
  title,
  description,
  open,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Revisa los datos antes de guardar los cambios."}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  children,
  disabled = false,
  confirmLabel = "Confirmar",
  destructive = false,
}: {
  confirmLabel?: string;
  destructive?: boolean;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <Modal
        title={title}
        description={description}
        open={open}
        onClose={() => !busy && setOpen(false)}
      >
        <DialogFooter>
          <Button
            variant="outline"
            autoFocus
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } catch {
                /* The action displays its error toast. */
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            )}
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </Modal>
    </>
  );
}
export function Submit({
  busy,
  label = "Guardar cambios",
}: {
  busy: boolean;
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={busy || pending} aria-busy={busy || pending}>
      {busy && (
        <LoaderCircle className="animate-spin" data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}
export const formValue = (data: FormData, name: string) =>
  String(data.get(name) || "");
