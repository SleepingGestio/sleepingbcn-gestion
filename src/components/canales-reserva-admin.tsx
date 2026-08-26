import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchDistinctPortales } from "@/lib/tarifas";
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

type CanalReserva = {
  id_canal: number;
  nombre: string;
  activo: boolean | null;
};

export function CanalesReservaAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CanalReserva | null>(null);

  const q = useQuery({
    queryKey: ["canales-reserva-all"],
    queryFn: async (): Promise<CanalReserva[]> => {
      const { data, error } = await supabase
        .from("canales_reserva")
        .select("id_canal,nombre,activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as CanalReserva[];
    },
  });

  const portalesQ = useQuery({ queryKey: ["distinct-portales"], queryFn: fetchDistinctPortales });

  const knownNombres = new Set((q.data ?? []).map((c) => c.nombre));
  const portalesSinCanal = (portalesQ.data ?? []).filter((p) => !knownNombres.has(p));

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Gestiona los canales de reserva (Booking, Airbnb, Directo...) usados para las tarifas de
          comisión y cobro. El nombre debe coincidir exactamente con el campo "Portal" que envía
          Krossbooking, o las tarifas no se propondrán para esas reservas.
        </div>
        {!readOnly && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo canal
          </Button>
        )}
      </div>

      {portalesSinCanal.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs space-y-1.5">
          <div className="font-medium text-orange-900">
            Valores de "Portal" vistos en reservas sin canal correspondiente:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {portalesSinCanal.map((p) => (
              <span key={p} className="rounded bg-white border border-orange-200 px-2 py-0.5 font-mono">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border divide-y">
        {(q.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay canales definidos.
          </div>
        )}
        {(q.data ?? []).map((c) => (
          <div key={c.id_canal} className="flex items-center gap-3 px-4 py-3">
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
              {c.activo ? "Activo" : "Inactivo"}
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
      <EditModal canal={editing} onOpenChange={(open) => { if (!open) setEditing(null); }} onSaved={() => q.refetch()} />
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
    const { error } = await supabase.from("canales_reserva").insert({ nombre: n, activo: true });
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Canal creado");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo canal de reserva</DialogTitle>
          <DialogDescription className="sr-only">Crear canal de reserva</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre (debe coincidir con "Portal" en Krossbooking)</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Booking.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={crear} disabled={busy || !nombre.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
            Crear canal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditModal({
  canal, onOpenChange, onSaved,
}: {
  canal: CanalReserva | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [busy, setBusy] = useState(false);

  const openId = canal?.id_canal ?? null;
  useEffect(() => {
    setNombre(canal?.nombre ?? "");
    setActivo(!!canal?.activo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!canal) return;
    const n = nombre.trim();
    if (!n) { toast.error("Indica un nombre"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("canales_reserva")
      .update({ nombre: n, activo })
      .eq("id_canal", canal.id_canal);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Guardado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={!!canal} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar canal de reserva</DialogTitle>
          <DialogDescription className="sr-only">Editar canal de reserva</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre (debe coincidir con "Portal" en Krossbooking)</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer">Activo</Label>
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
