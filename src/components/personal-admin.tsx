import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

type Persona = {
  id_persona: number;
  nombre: string | null;
  apellidos: string | null;
  codigo: string | null;
  tipo_contrato: string | null;
  telefono: string | null;
  mail: string | null;
  activo: boolean | null;
  coste_hora: number | null;
  coste_hora_extra: number | null;
};
type Rol = { id_rol: number; nombre: string };
type PersonaRol = { id_persona: number; id_rol: number; fecha_hasta: string | null };

const CONTRATOS = ["Indefinido", "Temporal", "Autónomo", "Prácticas", "Otro"];

const empty: Omit<Persona, "id_persona"> = {
  nombre: "", apellidos: "", codigo: "", tipo_contrato: null,
  telefono: "", mail: "", activo: true, coste_hora: null, coste_hora_extra: null,
};

export function PersonalAdmin() {
  const personalQ = useQuery({
    queryKey: ["personal-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("id_persona,nombre,apellidos,codigo,tipo_contrato,telefono,mail,activo,coste_hora,coste_hora_extra")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Persona[];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id_rol, nombre").order("nombre");
      if (error) throw error;
      return (data ?? []) as Rol[];
    },
  });

  const prQ = useQuery({
    queryKey: ["personal-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_roles")
        .select("id_persona, id_rol, fecha_hasta")
        .is("fecha_hasta", null);
      if (error) throw error;
      return (data ?? []) as PersonaRol[];
    },
  });

  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActivo = useMutation({
    mutationFn: async ({ id, activo }: { id: number; activo: boolean }) => {
      const { error } = await supabase.from("personal").update({ activo }).eq("id_persona", id);
      if (error) throw error;
    },
    onSuccess: () => personalQ.refetch(),
    onError: (e) => toast.error("Error: " + (e as Error).message),
  });

  const rolesByPersona = (id: number) =>
    (prQ.data ?? [])
      .filter((x) => x.id_persona === id)
      .map((x) => rolesQ.data?.find((r) => r.id_rol === x.id_rol)?.nombre)
      .filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{personalQ.data?.length ?? 0} personas</p>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> Añadir</Button>
      </div>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {personalQ.isLoading && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!personalQ.isLoading && (personalQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin personal</TableCell></TableRow>
            )}
            {personalQ.data?.map((p) => (
              <TableRow key={p.id_persona}>
                <TableCell className="font-medium">{[p.nombre, p.apellidos].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell>{p.codigo ?? "—"}</TableCell>
                <TableCell>{p.tipo_contrato ?? "—"}</TableCell>
                <TableCell>{p.telefono ?? "—"}</TableCell>
                <TableCell>{p.mail ?? "—"}</TableCell>
                <TableCell className="text-xs">{rolesByPersona(p.id_persona).join(", ") || "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={!!p.activo}
                    onCheckedChange={(v) => toggleActivo.mutate({ id: p.id_persona, activo: v })}
                  />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {(editing || creating) && (
        <PersonaDialog
          persona={editing}
          roles={rolesQ.data ?? []}
          currentRoleIds={editing ? (prQ.data ?? []).filter((x) => x.id_persona === editing.id_persona).map((x) => x.id_rol) : []}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { personalQ.refetch(); prQ.refetch(); }}
        />
      )}
    </div>
  );
}

function PersonaDialog({
  persona, roles, currentRoleIds, onClose, onSaved,
}: {
  persona: Persona | null;
  roles: Rol[];
  currentRoleIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Omit<Persona, "id_persona">>(persona ?? (empty as Persona));
  const [roleIds, setRoleIds] = useState<Set<number>>(new Set(currentRoleIds));
  const [saving, setSaving] = useState(false);

  const toggleRole = (id: number) => {
    setRoleIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  async function save() {
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre, apellidos: form.apellidos, codigo: form.codigo,
        tipo_contrato: form.tipo_contrato, telefono: form.telefono, mail: form.mail,
        activo: form.activo, coste_hora: form.coste_hora, coste_hora_extra: form.coste_hora_extra,
      };
      let id_persona: number;
      if (persona) {
        const { error } = await supabase.from("personal").update(payload).eq("id_persona", persona.id_persona);
        if (error) throw error;
        id_persona = persona.id_persona;
      } else {
        const today = new Date().toISOString().split("T")[0];
        const { data, error } = await supabase
          .from("personal")
          .insert({ ...payload, fecha_alta: today })
          .select("id_persona")
          .single();
        if (error) throw error;
        id_persona = (data as { id_persona: number }).id_persona;
      }
      // sync roles: current open assignments
      const current = new Set(currentRoleIds);
      const target = roleIds;
      const toAdd = [...target].filter((x) => !current.has(x));
      const toRemove = [...current].filter((x) => !target.has(x));
      const today = new Date().toISOString().slice(0, 10);
      if (toAdd.length) {
        const rows = toAdd.map((id_rol) => ({ id_persona, id_rol, fecha_desde: today }));
        const { error } = await supabase.from("personal_roles").insert(rows);
        if (error) throw error;
      }
      for (const id_rol of toRemove) {
        const { error } = await supabase
          .from("personal_roles")
          .update({ fecha_hasta: today })
          .eq("id_persona", id_persona)
          .eq("id_rol", id_rol)
          .is("fecha_hasta", null);
        if (error) throw error;
      }
      toast.success("Guardado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{persona ? "Editar persona" : "Nueva persona"}</DialogTitle>
          <DialogDescription className="sr-only">Datos del personal</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Nombre"><Input value={form.nombre ?? ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
          <Field label="Apellidos"><Input value={form.apellidos ?? ""} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} /></Field>
          <Field label="Código"><Input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></Field>
          <Field label="Tipo de contrato">
            <Select value={form.tipo_contrato ?? "none"} onValueChange={(v) => setForm({ ...form, tipo_contrato: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {CONTRATOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Teléfono"><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.mail ?? ""} onChange={(e) => setForm({ ...form, mail: e.target.value })} /></Field>
          <Field label="Coste/hora (€)">
            <Input type="number" step="0.01" value={form.coste_hora ?? ""} onChange={(e) => setForm({ ...form, coste_hora: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Coste/hora extra (€)">
            <Input type="number" step="0.01" value={form.coste_hora_extra ?? ""} onChange={(e) => setForm({ ...form, coste_hora_extra: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <Switch checked={!!form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
            <span>Activo</span>
          </div>
          <div className="col-span-2 space-y-2 pt-2">
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <label key={r.id_rol} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={roleIds.has(r.id_rol)} onCheckedChange={() => toggleRole(r.id_rol)} />
                  <span>{r.nombre}</span>
                </label>
              ))}
              {roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles definidos</span>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}