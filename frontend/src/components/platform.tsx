"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TextField, Submit, Modal, formValue } from "./common";
import { get, mutate, date } from "@/lib/api";

type Org = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
  tournaments: number;
  users: number;
};
type Created = { slug: string; email: string; password: string };

const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function Platform() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null),
    [loaded, setLoaded] = useState(false),
    [orgs, setOrgs] = useState<Org[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [slugTouched, setSlugTouched] = useState(false),
    [created, setCreated] = useState<Created | null>(null);
  const load = useCallback(async () => {
    try {
      const s = await get<{ admin: { email: string } | null }>(
        "/v1/platform/session",
      );
      setAdmin(s.admin);
      if (s.admin) {
        const r = await get<{ organizations: Org[] }>(
          "/v1/platform/organizations",
        );
        setOrgs(r.organizations);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!loaded)
    return (
      <main className="loading-page">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (!admin)
    return (
      <main className="loading-page">
        <Link href="/" className="brand">
          <span className="brand-mark">t</span>torneum.
        </Link>
        <div className="eyebrow">PLATAFORMA</div>
        <h2>Administración de la plataforma</h2>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const d = new FormData(e.currentTarget);
            try {
              await mutate("/v1/platform/login", {
                email: formValue(d, "email"),
                password: formValue(d, "password"),
              });
              setError("");
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <TextField label="Correo electrónico" name="email" type="email" />
            <TextField label="Contraseña" name="password" type="password" />
            <Submit busy={busy} label="Entrar" />
          </FieldGroup>
        </form>
      </main>
    );
  return (
    <main className="loading-page">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="brand">
          <span className="brand-mark">t</span>torneum.
        </Link>
        <div className="flex items-center gap-3">
          <small>{admin.email}</small>
          <Button
            variant="outline"
            onClick={async () => {
              await mutate("/v1/platform/logout", {}).catch(() => {});
              setAdmin(null);
              setOrgs([]);
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
      <h2>Clubes</h2>
      <section className="panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead>Identificador</TableHead>
              <TableHead>Torneos</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead>Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.name}</TableCell>
                <TableCell>
                  <Link href={`/${o.slug}`}>{o.slug}</Link>
                </TableCell>
                <TableCell>{o.tournaments}</TableCell>
                <TableCell>{o.users}</TableCell>
                <TableCell>{date(o.created_at)}</TableCell>
                <TableCell>
                  <Switch
                    checked={o.active}
                    aria-label={`${o.active ? "Suspender" : "Activar"} ${o.name}`}
                    onCheckedChange={async (active) => {
                      try {
                        await mutate("/v1/platform/organizations/status", {
                          id: o.id,
                          active,
                        });
                        await load();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <h2>Nuevo club</h2>
      <section className="panel p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const d = new FormData(e.currentTarget);
            try {
              const r = (await mutate("/v1/platform/organizations", {
                name: formValue(d, "name"),
                slug: formValue(d, "slug"),
                admin_name: formValue(d, "admin_name"),
                admin_email: formValue(d, "admin_email"),
              })) as {
                organization: { slug: string };
                admin: { email: string; temporary_password: string };
              };
              setCreated({
                slug: r.organization.slug,
                email: r.admin.email,
                password: r.admin.temporary_password,
              });
              setName("");
              setSlug("");
              setSlugTouched(false);
              e.currentTarget.reset();
              await load();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <label className="flex flex-col gap-1 text-sm">
              Nombre del club
              <input
                className="border-input h-9 rounded-md border bg-transparent px-3"
                name="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Identificador (URL)
              <input
                className="border-input h-9 rounded-md border bg-transparent px-3"
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </label>
            <TextField label="Nombre del administrador" name="admin_name" />
            <TextField
              label="Correo del administrador"
              name="admin_email"
              type="email"
            />
            <Submit busy={busy} label="Crear club" />
          </FieldGroup>
        </form>
      </section>
      <Modal
        title="Club creado"
        description="Esta contraseña temporal solo se muestra una vez. Compártela de forma segura."
        open={!!created}
        onClose={() => setCreated(null)}
      >
        {created && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Administrador: <strong>{created.email}</strong>
            </p>
            <p className="flex items-center gap-2">
              Contraseña temporal: <code>{created.password}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(created.password);
                  toast.success("Contraseña copiada");
                }}
              >
                <Copy data-icon="inline-start" />
                Copiar
              </Button>
            </p>
            <Link href={`/${created.slug}`}>Ir a /{created.slug}</Link>
          </div>
        )}
      </Modal>
    </main>
  );
}
