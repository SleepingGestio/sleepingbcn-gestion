import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

type Grupo = {
  id_grupo: number;
  nombre: string;
  orden: number | null;
  mostrar_por_defecto: boolean | null;
};

type Apartamento = {
  id_apt: number;
  nombre: string;
  id_grupo: number;
  camas_fijas: number | null;
  tiene_sofa_cama: boolean | null;
  requiere_limpieza_intermedia: boolean | null;
  orden: number | null;
  activo: boolean;
  notas: string | null;
};

export function ApartamentosAdmin() {
  const gruposQ = useQuery({
    queryKey: ["cfg-grupos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupos_apartamentos")
        .select("id_grupo, nombre, orden, mostrar_por_defecto")
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Grupo[];
    },
  });

  const aptsQ = useQuery({
    queryKey: ["cfg-apartamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select(
          "id_apt,nombre,id_grupo,camas_fijas,tiene_sofa_cama,requiere_limpieza_intermedia,orden,activo,notas",
        )
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Apartamento[];
    },
  });

  const sinConfigQ = useQuery({
    queryKey: ["cfg-sin-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_apartamentos_sin_configurar").select("*");
      if (error) {
        // view may not exist in all envs — silently ignore
        return [] as Array<Record<string, unknown>>;
      }
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const [editingApt, setEditingApt] = useState<Apartamento | null>(null);
  const [editingGrupo, setEditingGrupo] = useState<Grupo | null>(null);
  const [prefillName, setPrefillName] = useState<string | null>(null);

  const aptsByGroup = useMemo(() => {
    const m = new Map<number, Apartamento[]>();
    for (const a of aptsQ.data ?? []) {
      const arr = m.get(a.id_grupo) ?? [];
      arr.push(a);
      m.set(a.id_grupo, arr);
    }
    return m;
  }, [aptsQ.data]);

  const refetchAll = () => {
    aptsQ.refetch();
    gruposQ.refetch();
    sinConfigQ.refetch();
  };

  const sinConfigRows = sinConfigQ.data ?? [];

  return (
    <div className="space-y-4">
      {sinConfigRows.length > 0 && (
        <Card className="bg-orange-50 border-orange-200 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-700 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-semibold text-orange-900">
                Apartamentos detectados en Krossbooking sin configurar ({sinConfigRows.length})
              </div>
              <div className="space-y-1">
                {sinConfigRows.map((row, i) => {
                  const name =
                    (row as any).nombre ?? (row as any).Habitaciones ?? JSON.stringify(row);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 bg-white/70 border border-orange-200 rounded px-2 py-1"
                    >
                      <span className="text-sm font-mono">{String(name)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPrefillName(String(name));
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Dar de alta
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {(gruposQ.data ?? []).map((g) => {
        const apts = aptsByGroup.get(g.id_grupo) ?? [];
        return (
          <Card key={g.id_grupo} className="bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/60 border-b">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide">{g.nombre}</div>
                <div className="text-[11px] text-muted-foreground">
                  Orden: {g.orden ?? "—"} ·{" "}
                  {g.mostrar_por_defecto ? "Visible por defecto" : "Oculto por defecto"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditingGrupo(g)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y">
              {apts.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  Sin apartamentos en este grupo
                </div>
              )}
              {apts.map((a) => (
                <div key={a.id_apt} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {a.nombre}
                      {!a.activo && (
                        <span className="ml-2 text-[10px] uppercase rounded bg-gray-200 text-gray-600 px-1.5 py-0.5">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.camas_fijas ?? 0} pax · orden {a.orden ?? "—"}
                      {a.tiene_sofa_cama ? " · SFC" : ""}
                      {a.requiere_limpieza_intermedia === false ? " · sin intermedia" : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditingApt(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {(editingApt || prefillName) && (
        <ApartamentoDialog
          apt={editingApt}
          prefillName={prefillName}
          grupos={gruposQ.data ?? []}
          onClose={() => {
            setEditingApt(null);
            setPrefillName(null);
          }}
          onSaved={() => refetchAll()}
        />
      )}

      {editingGrupo && (
        <GrupoDialog
          grupo={editingGrupo}
          onClose={() => setEditingGrupo(null)}
          onSaved={() => refetchAll()}
        />
      )}
    </div>
  );
}

function ApartamentoDialog({
  apt,
  prefillName,
  grupos,
  onClose,
  onSaved,
}: {
  apt: Apartamento | null;
  prefillName: string | null;
  grupos: Grupo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !apt;
  const [form, setForm] = useState<Partial<Apartamento>>(
    apt ?? {
      nombre: prefillName ?? "",
      id_grupo: grupos[0]?.id_grupo,
      camas_fijas: 2,
      tiene_sofa_cama: false,
      requiere_limpieza_intermedia: true,
      orden: 1,
      activo: true,
      notas: "",
    },
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload: any = {
        nombre: form.nombre,
        id_grupo: form.id_grupo,
        camas_fijas: form.camas_fijas ?? null,
        tiene_sofa_cama: !!form.tiene_sofa_cama,
        requiere_limpieza_intermedia: form.requiere_limpieza_intermedia ?? true,
        orden: form.orden ?? null,
        activo: !!form.activo,
        notas: form.notas ?? null,
      };
      if (isNew) {
        const { error } = await supabase.from("apartamentos").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("apartamentos")
          .update(payload)
          .eq("id_apt", apt!.id_apt);
        if (error) throw error;
      }
      toast.success("Apartamento guardado");
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuevo apartamento" : "Editar apartamento"}</DialogTitle>
          <DialogDescription className="text-xs">
            El campo <code>nombre</code> debe coincidir exactamente con el campo "Habitaciones" en
            Krossbooking, o las reservas dejarán de cuadrar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nombre (Krossbooking)</Label>
            <Input
              value={form.nombre ?? ""}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
            {!isNew && (
              <p className="text-[10px] text-orange-700">
                ⚠ Cambiar este nombre puede romper el cruce con reservas existentes.
              </p>
            )}
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Grupo</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.id_grupo ?? ""}
              onChange={(e) => setForm({ ...form, id_grupo: Number(e.target.value) })}
            >
              {grupos.map((g) => (
                <option key={g.id_grupo} value={g.id_grupo}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Camas fijas (pax)</Label>
            <Input
              type="number"
              value={form.camas_fijas ?? ""}
              onChange={(e) =>
                setForm({ ...form, camas_fijas: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input
              type="number"
              value={form.orden ?? ""}
              onChange={(e) =>
                setForm({ ...form, orden: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <ToggleRow
            label="Tiene sofá cama"
            checked={!!form.tiene_sofa_cama}
            onChange={(v) => setForm({ ...form, tiene_sofa_cama: v })}
          />
          <ToggleRow
            label="Requiere limpieza intermedia"
            checked={form.requiere_limpieza_intermedia !== false}
            onChange={(v) => setForm({ ...form, requiere_limpieza_intermedia: v })}
          />
          <ToggleRow
            label="Activo (visible en Gantt)"
            checked={!!form.activo}
            onChange={(v) => setForm({ ...form, activo: v })}
          />
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Notas</Label>
            <Textarea
              rows={3}
              value={form.notas ?? ""}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrupoDialog({
  grupo,
  onClose,
  onSaved,
}: {
  grupo: Grupo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Grupo>(grupo);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("grupos_apartamentos")
        .update({
          nombre: form.nombre,
          orden: form.orden ?? 0,
          mostrar_por_defecto: !!form.mostrar_por_defecto,
        })
        .eq("id_grupo", grupo.id_grupo);
      if (error) throw error;
      toast.success("Grupo guardado");
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar grupo</DialogTitle>
          <DialogDescription className="sr-only">Editar grupo de apartamentos</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input
              type="number"
              value={form.orden ?? ""}
              onChange={(e) =>
                setForm({ ...form, orden: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <ToggleRow
            label="Mostrar por defecto en el Gantt"
            checked={!!form.mostrar_por_defecto}
            onChange={(v) => setForm({ ...form, mostrar_por_defecto: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="col-span-2 flex items-center gap-2 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-sm">{label}</span>
    </label>
  );
}