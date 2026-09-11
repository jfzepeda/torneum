"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
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
export function Status({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={cn("status", `status-${value}`)}>
      {["live", "approved", "won"].includes(value) && (
        <span className="status-dot" />
      )}
      {labels[value] || value}
    </Badge>
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
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const uid = useId();
  return (
    <Field>
      <FieldLabel htmlFor={uid}>{label}</FieldLabel>
      <Input
        id={uid}
        name={name}
        defaultValue={defaultValue}
        type={type}
        required={required}
        min={min}
        max={max}
        placeholder={placeholder}
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  name?: string;
}) {
  const uid = useId();
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
    </Field>
  );
}
export function EmptyState({
  title = "Todavía no hay información",
  description = "Los datos aparecerán aquí conforme avance el torneo.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
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
}: {
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
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
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
            Confirmar
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
  return (
    <Button type="submit" disabled={busy}>
      {busy && (
        <LoaderCircle className="animate-spin" data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}
export const formValue = (data: FormData, name: string) =>
  String(data.get(name) || "");
