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

type EspacioComun = {
  id_tipo: number;
  nombre: string;
  activo: boolean | null;
};

export function TiposEspacioComunAdmin() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EspacioComun | null>(null);

  const q = useQuery({
    queryKey: ["tipos-espacio-comun-all"],
    queryFn: async (): Promise<EspacioComun[]> => {
      const { data, error } = await supabase
        .from("tipos_espacio_comun")
        .select("id_tipo,nombre,activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as EspacioComun[];
    },
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Gestiona los tipos de espacio común disponibles para reportar incidencias.
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo tipo
        </Button>
      </div>

      <div className="rounded-md border divide-y">
        {(q.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay tipos definidos.
          </div>
        )}
        {(q.data ?? []).map((t) => (
          <div key={t.id_tipo} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 font-semibold uppercase tracking-wide text-sm">
              {t.nombre.toUpperCase()}
            </div>
            <span
              className={
                t.activo
                  ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium"
                  : "inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2.5 py-0.5 text-xs font-medium"
              }
            >
              {t.activo ? "Activo" : "Inactivo"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(t)}
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <CreateEspacioModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => q.refetch()}
      />

      <EditEspacioModal
        espacio={editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={() => q.refetch()}
      />
    </Card>
  );
}

function CreateEspacioModal({
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
    const { error } = await supabase.from("tipos_espacio_comun").insert({ nombre: n, activo: true });
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Tipo creado");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo tipo de espacio común</DialogTitle>
          <DialogDescription className="sr-only">Crear tipo de espacio común</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ascensor, Terraza, Escalera…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={busy || !nombre.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
            Crear tipo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEspacioModal({
  espacio, onOpenChange, onSaved,
}: {
  espacio: EspacioComun | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [busy, setBusy] = useState(false);

  const openId = espacio?.id_tipo ?? null;
  useEffect(() => {
    setNombre(espacio?.nombre ?? "");
    setActivo(!!espacio?.activo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!espacio) return;
    const n = nombre.trim();
    if (!n) { toast.error("Indica un nombre"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("tipos_espacio_comun")
      .update({ nombre: n, activo })
      .eq("id_tipo", espacio.id_tipo);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Guardado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={!!espacio} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tipo de espacio común</DialogTitle>
          <DialogDescription className="sr-only">Editar tipo de espacio común</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer">Activo</Label>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
