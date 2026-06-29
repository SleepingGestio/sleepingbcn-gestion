import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { ALL_MENUS, type MenuKey } from "@/hooks/use-permissions";
import { roleColor } from "@/lib/role-colors";
import { cn } from "@/lib/utils";

type Rol = { id_rol: number; nombre: string; acceso_app: string | null };
type RolPermiso = { id_rol: number; menu: string; pot_veure: boolean; pot_editar: boolean };

function deriveAccesoApp(perms: { menu: string; pot_veure: boolean }[]): string | null {
  const viewable = perms.filter((p) => p.pot_veure).map((p) => p.menu);
  if (viewable.length === 0) return null;
  if (viewable.some((m) => m !== "mi_dia")) return "gestor";
  return "worker";
}

export function RolesAdmin() {
  // One-time rename: Admin → AdminAPP for id_rol=1
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("roles").select("id_rol, nombre").eq("id_rol", 1).maybeSingle();
      if (data && (data as Rol).nombre !== "AdminAPP") {
        await supabase.from("roles").update({ nombre: "AdminAPP" }).eq("id_rol", 1);
      }
    })();
  }, []);

  const rolesQ = useQuery({
    queryKey: ["roles-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id_rol, nombre, acceso_app")
        .order("id_rol");
      if (error) throw error;
      return (data ?? []) as Rol[];
    },
  });

  const permisosQ = useQuery({
    queryKey: ["rol-permisos-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rol_permisos")
        .select("id_rol, menu, pot_veure, pot_editar");
      if (error) throw error;
      return (data ?? []) as RolPermiso[];
    },
  });

  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rolesQ.data?.length ?? 0} rols</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nou rol
        </Button>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {(rolesQ.data ?? []).map((rol) => (
          <RoleRow
            key={rol.id_rol}
            rol={rol}
            permisos={(permisosQ.data ?? []).filter((p) => p.id_rol === rol.id_rol)}
            onChanged={() => { permisosQ.refetch(); rolesQ.refetch(); }}
          />
        ))}
      </Accordion>

      {creating && (
        <NewRoleDialog
          onClose={() => setCreating(false)}
          onCreated={() => { rolesQ.refetch(); permisosQ.refetch(); }}
        />
      )}
    </div>
  );
}

function RoleRow({
  rol, permisos, onChanged,
}: { rol: Rol; permisos: RolPermiso[]; onChanged: () => void }) {
  const isAdminApp = rol.id_rol === 1;
  const isCheckIn = rol.nombre === "Check-in";
  const locked = isAdminApp || isCheckIn;

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(rol.nombre);

  useEffect(() => { setName(rol.nombre); }, [rol.nombre]);

  async function saveName() {
    if (!name.trim() || name === rol.nombre) { setEditingName(false); return; }
    const { error } = await supabase.from("roles").update({ nombre: name.trim() }).eq("id_rol", rol.id_rol);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Nom actualitzat");
    setEditingName(false);
    onChanged();
  }

  const permByMenu = (menu: string) =>
    permisos.find((p) => p.menu === menu) ?? { id_rol: rol.id_rol, menu, pot_veure: false, pot_editar: false };

  async function upsertPerm(menu: string, patch: Partial<Pick<RolPermiso, "pot_veure" | "pot_editar">>) {
    const cur = permByMenu(menu);
    const next: RolPermiso = { ...cur, ...patch };
    if (!next.pot_veure) next.pot_editar = false;
    const { error } = await supabase
      .from("rol_permisos")
      .upsert(
        { id_rol: rol.id_rol, menu, pot_veure: next.pot_veure, pot_editar: next.pot_editar },
        { onConflict: "id_rol,menu" },
      );
    if (error) { toast.error("Error: " + error.message); return; }
    if (!isAdminApp) {
      const merged = ALL_MENUS.map(({ key }) => {
        if (key === menu) return { menu: key, pot_veure: next.pot_veure };
        const p = permByMenu(key);
        return { menu: key, pot_veure: p.pot_veure };
      });
      const acceso = deriveAccesoApp(merged);
      await supabase.from("roles").update({ acceso_app: acceso }).eq("id_rol", rol.id_rol);
    }
    onChanged();
  }

  return (
    <AccordionItem value={String(rol.id_rol)} className="border rounded-md bg-white">
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center gap-3 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 w-48"
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveName}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setName(rol.nombre); setEditingName(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: roleColor(rol.nombre).bg, color: roleColor(rol.nombre).fg }}
              >
                {rol.nombre}
              </span>
              {!locked && (
                <Pencil
                  className="h-3.5 w-3.5 text-muted-foreground cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setEditingName(true); }}
                />
              )}
            </div>
          )}
          {isCheckIn && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800">
              Desactivat
            </span>
          )}
          {isAdminApp && (
            <span className="text-xs text-muted-foreground italic">Accés total — no modificable</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {isCheckIn && (
          <p className="text-xs text-muted-foreground mb-2">
            Aquest rol no s'assigna a nous usuaris.
          </p>
        )}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menú</TableHead>
                <TableHead className="w-28 text-center">Pot veure</TableHead>
                <TableHead className="w-28 text-center">Pot editar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALL_MENUS.map(({ key, label }) => {
                const p = permByMenu(key);
                const veure = isAdminApp ? true : p.pot_veure;
                const editar = isAdminApp ? true : p.pot_editar;
                const disableEdit = locked || !veure;
                return (
                  <TableRow key={key}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={veure}
                        disabled={locked}
                        onCheckedChange={(v) => upsertPerm(key as MenuKey, { pot_veure: v })}
                      />
                    </TableCell>
                    <TableCell className={cn("text-center", disableEdit && "opacity-50")}>
                      <Switch
                        checked={editar}
                        disabled={disableEdit}
                        onCheckedChange={(v) => upsertPerm(key as MenuKey, { pot_editar: v })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </AccordionContent>
    </AccordionItem>
  );
}

function NewRoleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [perms, setPerms] = useState<Record<string, { v: boolean; e: boolean }>>(
    () => Object.fromEntries(ALL_MENUS.map(({ key }) => [key, { v: false, e: false }])),
  );
  const [saving, setSaving] = useState(false);

  function setPerm(menu: string, patch: Partial<{ v: boolean; e: boolean }>) {
    setPerms((prev) => {
      const cur = prev[menu] ?? { v: false, e: false };
      const next = { ...cur, ...patch };
      if (!next.v) next.e = false;
      return { ...prev, [menu]: next };
    });
  }

  async function create() {
    if (!nombre.trim()) { toast.error("El nom és obligatori"); return; }
    setSaving(true);
    const permRows = ALL_MENUS.map(({ key }) => ({
      menu: key,
      pot_veure: !!perms[key]?.v,
      pot_editar: !!perms[key]?.e,
    }));
    const acceso = activo ? deriveAccesoApp(permRows) : null;
    const { data, error } = await supabase
      .from("roles")
      .insert({ nombre: nombre.trim(), acceso_app: acceso })
      .select("id_rol")
      .single();
    if (error || !data) { setSaving(false); toast.error("Error: " + (error?.message ?? "")); return; }
    const id_rol = (data as { id_rol: number }).id_rol;
    const rows = permRows.map((r) => ({ id_rol, ...r }));
    const { error: pErr } = await supabase.from("rol_permisos").insert(rows);
    setSaving(false);
    if (pErr) { toast.error("Error permisos: " + pErr.message); return; }
    toast.success("Rol creat");
    onCreated();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nou rol</DialogTitle>
          <DialogDescription>Defineix el nom i els permisos del rol.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nom *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={activo} onCheckedChange={setActivo} id="new-role-activo" />
            <Label htmlFor="new-role-activo" className="text-xs">Actiu</Label>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Permisos</Label>
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Menú</TableHead>
                    <TableHead className="w-28 text-center">Pot veure</TableHead>
                    <TableHead className="w-28 text-center">Pot editar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_MENUS.map(({ key, label }) => {
                    const p = perms[key] ?? { v: false, e: false };
                    return (
                      <TableRow key={key}>
                        <TableCell>{label}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={p.v} onCheckedChange={(v) => setPerm(key, { v })} />
                        </TableCell>
                        <TableCell className={cn("text-center", !p.v && "opacity-50")}>
                          <Switch checked={p.e} disabled={!p.v} onCheckedChange={(e) => setPerm(key, { e })} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel·lar</Button>
          <Button onClick={create} disabled={saving}>{saving ? "Creant…" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
