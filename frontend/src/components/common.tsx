"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DatePicker,
  DateRangePicker,
  DateTimePicker,
} from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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
import { CircleAlert, LoaderCircle } from "lucide-react";
import { formatError } from "@/lib/validation";
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
  const errorId = `${uid}-error`;
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  // Marca el campo como inválido para el navegador: bloquea el envío y enfoca el primer error.
  const validate = (el: HTMLInputElement) => {
    const msg = formatError(type, el.value);
    el.setCustomValidity(msg);
    return msg;
  };
  useEffect(() => {
    if (ref.current) validate(ref.current);
  });
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={uid}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        )}
      </FieldLabel>
      <Input
        ref={ref}
        id={uid}
        name={name}
        defaultValue={defaultValue}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        maxLength={type === "tel" ? 18 : undefined}
        required={required}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={[help && helpId, error && errorId].filter(Boolean).join(" ") || undefined}
        onBlur={(e) => setError(validate(e.currentTarget))}
        onChange={(e) => {
          const msg = validate(e.currentTarget);
          // Callado mientras escribe; si ya hay un error visible, se corrige o se limpia en vivo.
          if (error) setError(msg);
        }}
        onInvalid={(e) => setError(e.currentTarget.validationMessage)}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </Field>
  );
}
export function DateField({
  label,
  name,
  defaultValue,
  required = true,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  min?: string;
  max?: string;
}) {
  const uid = useId();
  return (
    <Field>
      <FieldLabel htmlFor={uid}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        )}
      </FieldLabel>
      <DatePicker
        id={uid}
        name={name}
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
      />
    </Field>
  );
}
export function DateRangeField({
  label,
  startName,
  endName,
  defaultStart,
  defaultEnd,
  defaultCustom = false,
  defaultLabel = "",
}: {
  label: string;
  startName: string;
  endName: string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultCustom?: boolean;
  defaultLabel?: string;
}) {
  const uid = useId();
  const [custom, setCustom] = useState(defaultCustom);
  const [text, setText] = useState(defaultLabel);
  return (
    <Field>
      <FieldLabel htmlFor={uid}>{label}</FieldLabel>
      {custom ? (
        <>
          <Input
            id={uid}
            name="dates_label"
            value={text}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
            placeholder="Fechas por confirmar"
          />
          <div className="flex flex-wrap gap-1">
            {["Fechas por confirmar", "Inicios de més", "El próximo mes"].map(
              (t) => (
                <Button
                  key={t}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setText(t)}
                >
                  {t}
                </Button>
              ),
            )}
          </div>
        </>
      ) : (
        <DateRangePicker
          id={uid}
          startName={startName}
          endName={endName}
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
        />
      )}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto self-start p-0"
        onClick={() => setCustom(!custom)}
      >
        {custom
          ? "Elegir fechas en el calendario"
          : "Fechas por confirmar o texto personalizado"}
      </Button>
    </Field>
  );
}
export function DateTimeField({
  label,
  name,
  defaultValue,
  required = true,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const uid = useId();
  return (
    <Field>
      <FieldLabel htmlFor={uid}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        )}
      </FieldLabel>
      <DateTimePicker
        id={uid}
        name={name}
        defaultValue={defaultValue}
        required={required}
      />
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
    <Button
      type="submit"
      disabled={busy || pending}
      aria-busy={busy || pending}
    >
      {busy && (
        <LoaderCircle className="animate-spin" data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}
export const formValue = (data: FormData, name: string) =>
  String(data.get(name) || "");
