"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

/* ---------- utilidades de fecha (strings ISO "YYYY-MM-DD", sin zonas) ---------- */

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
const addMonths = (iso: string, n: number) => {
  const d = toDate(`${iso.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toISO(d);
};
export const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
    new Date(),
  );

const monthFmt = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const longFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const clean = (s: string) => s.replace(/\./g, "");

/* ---------- cuadrícula de un mes ---------- */

type DayState = {
  min?: string;
  max?: string;
  today: string;
  start?: string;
  end?: string;
  onPick: (iso: string) => void;
  onHover?: (iso: string) => void;
};

function MonthGrid({
  month,
  nav,
  s,
}: {
  month: string;
  nav: React.ReactNode;
  s: DayState;
}) {
  const first = toDate(month);
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: count }, (_, i) => addDays(month, i)),
  ];
  return (
    <div className="w-[17rem] max-w-full">
      <div className="mb-2 flex items-center justify-between">
        {nav}
        <span className="text-sm font-medium capitalize">
          {monthFmt.format(first)}
        </span>
        <span className="size-7" />
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => s.onHover?.("")}>
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const disabled = (s.min && d < s.min) || (s.max && d > s.max);
          const isStart = d === s.start;
          const isEnd = d === s.end;
          const inRange = !!s.start && !!s.end && d > s.start && d < s.end;
          return (
            <button
              key={d}
              type="button"
              disabled={!!disabled}
              onClick={() => s.onPick(d)}
              onMouseEnter={() => s.onHover?.(d)}
              aria-label={longFmt.format(toDate(d))}
              aria-pressed={isStart || isEnd}
              className={cn(
                "relative h-9 text-sm tabular-nums outline-none transition-colors",
                "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-30",
                !disabled && !isStart && !isEnd && "hover:bg-muted",
                inRange && "bg-primary/10",
                s.start && s.end && isStart && s.end !== s.start && "rounded-r-none",
                s.start && s.end && isEnd && s.end !== s.start && "rounded-l-none",
                !(isStart || isEnd) && !inRange && "rounded-lg",
                (isStart || isEnd) &&
                  "rounded-lg bg-primary font-medium text-primary-foreground",
                d === s.today &&
                  !(isStart || isEnd) &&
                  "font-semibold text-primary underline underline-offset-4",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({
  dir,
  onClick,
}: {
  dir: -1 | 1;
  onClick: () => void;
}) {
  const Icon = dir < 0 ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={dir < 0 ? "Mes anterior" : "Mes siguiente"}
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}

/* ---------- piezas comunes del trigger / popup ---------- */

const triggerClass =
  "flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function PickerPopup({
  trigger,
  children,
  open,
  onOpenChange,
  id,
  disabled,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        className={triggerClass}
      >
        <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" />
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-[100]">
          <Popover.Popup className="max-w-[calc(100vw-1rem)] rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* Input oculto: aporta `name` al FormData y permite la validación `required`. */
function FormValue({
  name,
  value,
  required,
}: {
  name?: string;
  value: string;
  required?: boolean;
}) {
  if (!name) return null;
  return (
    <input
      name={name}
      value={value}
      required={required}
      readOnly
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
    />
  );
}

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

/* ---------- fecha única ---------- */

export function DatePicker({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  required = true,
  disabled,
  placeholder = "Elige una fecha",
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const v = value ?? inner;
  const today = todayISO();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(`${(v || today).slice(0, 7)}-01`);
  const set = (d: string) => {
    setInner(d);
    onChange?.(d);
  };
  const outOfRange = (min && today < min) || (max && today > max);
  return (
    <div className="relative">
      <PickerPopup
        id={id}
        disabled={disabled}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setView(`${(v || today).slice(0, 7)}-01`);
        }}
        trigger={
          v ? (
            <span className="capitalize">{clean(longFmt.format(toDate(v)))}</span>
          ) : (
            <Placeholder>{placeholder}</Placeholder>
          )
        }
      >
        <MonthGrid
          month={view}
          nav={<NavButton dir={-1} onClick={() => setView(addMonths(view, -1))} />}
          s={{
            min,
            max,
            today,
            start: v,
            end: v,
            onPick: (d) => {
              set(d);
              setOpen(false);
            },
          }}
        />
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!!outOfRange}
            onClick={() => {
              set(today);
              setOpen(false);
            }}
          >
            Hoy
          </Button>
          <div className="flex gap-1">
            <NavButton dir={1} onClick={() => setView(addMonths(view, 1))} />
            {!required && v && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  set("");
                  setOpen(false);
                }}
              >
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </PickerPopup>
      <FormValue name={name} value={v} required={required} />
    </div>
  );
}

/* ---------- rango: inicio y fin en un solo control ---------- */

export function DateRangePicker({
  id,
  startName,
  endName,
  defaultStart = "",
  defaultEnd = "",
  onChange,
  min,
  required = true,
}: {
  id?: string;
  startName: string;
  endName: string;
  defaultStart?: string;
  defaultEnd?: string;
  onChange?: (start: string, end: string) => void;
  min?: string;
  required?: boolean;
}) {
  const today = todayISO();
  const [start, setStart] = React.useState(defaultStart);
  const [end, setEnd] = React.useState(defaultEnd);
  const [picking, setPicking] = React.useState(false); // inicio elegido, falta el fin
  const [hover, setHover] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(`${(start || today).slice(0, 7)}-01`);

  const commit = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
    onChange?.(s, e);
  };
  const pick = (d: string) => {
    if (!picking) {
      commit(d, "");
      setPicking(true);
    } else if (d < start) {
      commit(d, "");
    } else {
      commit(start, d);
      setPicking(false);
      setOpen(false);
    }
  };
  const preset = (s: string, e: string) => {
    commit(s, e);
    setPicking(false);
    setOpen(false);
  };
  const dow = (toDate(today).getUTCDay() + 6) % 7; // 0 = lunes
  const saturday = addDays(today, 5 - dow >= 0 ? 5 - dow : 6);
  const previewEnd = picking ? (hover >= start ? hover : "") : end;
  const nights = start && end ? Math.round((+toDate(end) - +toDate(start)) / 864e5) + 1 : 0;

  return (
    <div className="relative">
      <PickerPopup
        id={id}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setPicking(false);
            setView(`${(start || today).slice(0, 7)}-01`);
          }
        }}
        trigger={
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {start ? (
              <span className="capitalize">{clean(shortFmt.format(toDate(start)))}</span>
            ) : (
              <Placeholder>Inicio</Placeholder>
            )}
            <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {end ? (
              <span className="capitalize">{clean(shortFmt.format(toDate(end)))}</span>
            ) : (
              <Placeholder>Fin</Placeholder>
            )}
            {nights > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {nights} {nights === 1 ? "día" : "días"}
              </span>
            )}
          </span>
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {picking ? "Ahora elige la fecha de fin" : "Elige la fecha de inicio"}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          {[view, addMonths(view, 1)].map((m, i) => (
            <MonthGrid
              key={m}
              month={m}
              nav={
                i === 0 ? (
                  <NavButton dir={-1} onClick={() => setView(addMonths(view, -1))} />
                ) : (
                  <span className="size-7" />
                )
              }
              s={{
                min,
                today,
                start,
                end: previewEnd,
                onPick: pick,
                onHover: picking ? setHover : undefined,
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t pt-2">
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => preset(today, today)}>
              Hoy
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => preset(saturday, addDays(saturday, 1))}>
              Fin de semana
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => preset(today, addDays(today, 6))}>
              7 días
            </Button>
          </div>
          <NavButton dir={1} onClick={() => setView(addMonths(view, 1))} />
        </div>
      </PickerPopup>
      <FormValue name={startName} value={start} required={required} />
      <FormValue name={endName} value={end} required={required} />
    </div>
  );
}

/* ---------- fecha + hora (valor "YYYY-MM-DDTHH:mm", como datetime-local) ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[&>option]:bg-popover";

export function DateTimePicker({
  id,
  name,
  defaultValue = "",
  required = true,
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const today = todayISO();
  const [v, setV] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const date = v.slice(0, 10);
  const [hh, mm] = (v.slice(11, 16) || "09:00").split(":").map(Number);
  const [view, setView] = React.useState(`${(date || today).slice(0, 7)}-01`);
  const minutes = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), mm])].sort((a, b) => a - b);
  const join = (d: string, h: number, m: number) => `${d}T${pad(h)}:${pad(m)}`;

  return (
    <div className="relative">
      <PickerPopup
        id={id}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setView(`${(date || today).slice(0, 7)}-01`);
        }}
        trigger={
          v ? (
            <span>
              <span className="capitalize">{clean(longFmt.format(toDate(date)))}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="tabular-nums">{v.slice(11, 16)}</span>
            </span>
          ) : (
            <Placeholder>Elige fecha y hora</Placeholder>
          )
        }
      >
        <MonthGrid
          month={view}
          nav={<NavButton dir={-1} onClick={() => setView(addMonths(view, -1))} />}
          s={{
            today,
            start: date,
            end: date,
            onPick: (d) => setV(join(d, hh, mm)),
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <select
            aria-label="Hora"
            className={selectClass}
            value={hh}
            onChange={(e) => setV(join(date || today, Number(e.target.value), mm))}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{pad(h)}</option>
            ))}
          </select>
          <span>:</span>
          <select
            aria-label="Minutos"
            className={selectClass}
            value={mm}
            onChange={(e) => setV(join(date || today, hh, Number(e.target.value)))}
          >
            {minutes.map((m) => (
              <option key={m} value={m}>{pad(m)}</option>
            ))}
          </select>
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const n = new Date();
                const t = new Intl.DateTimeFormat("en-GB", {
                  timeZone: "America/Mexico_City",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(n);
                setV(`${today}T${t}`);
              }}
            >
              Ahora
            </Button>
            {!required && v && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setV(""); setOpen(false); }}>
                Limpiar
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Listo
            </Button>
          </div>
        </div>
      </PickerPopup>
      <FormValue name={name} value={v} required={required} />
    </div>
  );
}
