import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

type CategoriaLimpieza = {
  id_categoria_limpieza: number;
  nombre: string;
  activo: boolean | null;
};

export function TiposCategoriaLimpiezaAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CategoriaLimpieza | null>(null);

  const q = useQuery({
    queryKey: ["tipos-categoria-limpieza-all"],
    queryFn: async (): Promise<CategoriaLimpieza[]> => {
      const { data, error } = await supabase
        .from("tipos_categoria_limpieza")
        .select("id_categoria_limpieza,nombre,activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as CategoriaLimpieza[];
    },
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Categorías de limpieza propias para agrupar tarifas de coste — independientes de las
          categorías de apartamento (que solo afectan a tiempos estándar de limpieza).
        </div>
        {!readOnly && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva categoría
          </Button>
        )}
      </div>

      <div className="rounded-md border divide-y">
        {(q.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay categorías de limpieza definidas.
          </div>
        )}
        {(q.data ?? []).map((c) => (
          <div key={c.id_categoria_limpieza} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 font-semibold uppercase tracking-wide text-sm">
              {c.nombre.toUpperCase()}
            </div>
            <span
              className={
                c.activo
                  ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium"
                  : "inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2.5 py-0.5 text-xs font-medium"
              }
            >
              {c.activo ? "Activa" : "Inactiva"}
            </span>
            {!readOnly && (
              <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <CreateModal open={createOpen} onOpenChange={setCreateOpen} onCreated={() => q.refetch()} />
      <EditModal categoria={editing} onOpenChange={(open) => { if (!open) setEditing(null); }} onSaved={() => q.refetch()} />
    </Card>
  );
}

function CreateModal({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() { setNombre(""); }

  async function crear() {
    const n = nombre.trim();
    if (!n) { toast.error("Indica un nombre"); return; }
    setBusy(true);
    const { error } = await supabase.from("tipos_categoria_limpieza").insert({ nombre: n, activo: true });
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Categoría creada");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva categoría de limpieza</DialogTitle>
          <DialogDescription className="sr-only">Crear categoría de limpieza</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Estándar, Grande…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={crear} disabled={busy || !nombre.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
            Crear categoría
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditModal({
  categoria, onOpenChange, onSaved,
}: {
  categoria: CategoriaLimpieza | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [busy, setBusy] = useState(false);

  const openId = categoria?.id_categoria_limpieza ?? null;
  useEffect(() => {
    setNombre(categoria?.nombre ?? "");
    setActivo(!!categoria?.activo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!categoria) return;
    const n = nombre.trim();
    if (!n) { toast.error("Indica un nombre"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("tipos_categoria_limpieza")
      .update({ nombre: n, activo })
      .eq("id_categoria_limpieza", categoria.id_categoria_limpieza);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Guardado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={!!categoria} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar categoría de limpieza</DialogTitle>
          <DialogDescription className="sr-only">Editar categoría de limpieza</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer">Activa</Label>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
