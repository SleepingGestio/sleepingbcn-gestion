import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCanalesReserva, fetchTiposLicencia } from "@/lib/tarifas";
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

type Row = {
  id_tarifa_comision: number;
  id_tipo_licencia: number;
  id_canal: number;
  pct_comision: number;
  activo: boolean | null;
};

export function TarifasComisionOtaAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const tiposQ = useQuery({ queryKey: ["tipos-licencia-for-comision"], queryFn: fetchTiposLicencia });
  const canalesQ = useQuery({ queryKey: ["canales-for-comision"], queryFn: fetchCanalesReserva });

  const rowsQ = useQuery({
    queryKey: ["tarifas-comision-ota-all"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("tarifas_comision_ota")
        .select("id_tarifa_comision,id_tipo_licencia,id_canal,pct_comision,activo");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const nombreLicencia = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of tiposQ.data ?? []) m.set(t.id_tipo_licencia, t.nombre);
    return m;
  }, [tiposQ.data]);

  const nombreCanal = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of canalesQ.data ?? []) m.set(c.id_canal, c.nombre);
    return m;
  }, [canalesQ.data]);

  const refetch = () => rowsQ.refetch();

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          % de comisión OTA por tipo de licencia y canal. Se propone (sin forzar) al anotar
          "% comisión OTA" en el detalle de una reserva.
        </div>
        {!readOnly && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva tarifa
          </Button>
        )}
      </div>

      <div className="rounded-md border divide-y">
        {(rowsQ.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay tarifas de comisión definidas.
          </div>
        )}
        {(rowsQ.data ?? []).map((r) => (
          <div key={r.id_tarifa_comision} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 text-sm">
              <span className="font-semibold uppercase">{nombreLicencia.get(r.id_tipo_licencia) ?? "—"}</span>
              <span className="text-muted-foreground"> × </span>
              <span className="font-semibold">{nombreCanal.get(r.id_canal) ?? "—"}</span>
            </div>
            <div className="text-sm font-medium">{r.pct_comision}%</div>
            <span
              className={
                r.activo
                  ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium"
                  : "inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2.5 py-0.5 text-xs font-medium"
              }
            >
              {r.activo ? "Activa" : "Inactiva"}
            </span>
            {!readOnly && (
              <Button variant="ghost" size="icon" onClick={() => setEditing(r)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <CreateModal
        open={createOpen}
        tipos={(tiposQ.data ?? []).filter((t) => t.activo)}
        canales={(canalesQ.data ?? []).filter((c) => c.activo)}
        onOpenChange={setCreateOpen}
        onCreated={refetch}
      />
      <EditModal
        row={editing}
        nombreLicencia={editing ? nombreLicencia.get(editing.id_tipo_licencia) ?? "—" : "—"}
        nombreCanal={editing ? nombreCanal.get(editing.id_canal) ?? "—" : "—"}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={refetch}
      />
    </Card>
  );
}

function CreateModal({
  open, tipos, canales, onOpenChange, onCreated,
}: {
  open: boolean;
  tipos: { id_tipo_licencia: number; nombre: string }[];
  canales: { id_canal: number; nombre: string }[];
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [idTipo, setIdTipo] = useState<number | "">("");
  const [idCanal, setIdCanal] = useState<number | "">("");
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() { setIdTipo(""); setIdCanal(""); setPct(""); }

  async function crear() {
    const n = Number(pct);
    if (idTipo === "" || idCanal === "") { toast.error("Selecciona tipo de licencia y canal"); return; }
    if (pct.trim() === "" || Number.isNaN(n) || n < 0 || n > 100) { toast.error("Indica un % válido (0-100)"); return; }
    setBusy(true);
    const { error } = await supabase.from("tarifas_comision_ota").insert({
      id_tipo_licencia: idTipo,
      id_canal: idCanal,
      pct_comision: n,
      activo: true,
    });
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Tarifa creada");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarifa de comisión OTA</DialogTitle>
          <DialogDescription className="sr-only">Crear tarifa de comisión OTA</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de licencia</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={idTipo}
              onChange={(e) => setIdTipo(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">Selecciona…</option>
              {tipos.map((t) => (
                <option key={t.id_tipo_licencia} value={t.id_tipo_licencia}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={idCanal}
              onChange={(e) => setIdCanal(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">Selecciona…</option>
              {canales.map((c) => (
                <option key={c.id_canal} value={c.id_canal}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>% comisión</Label>
            <Input type="number" step="0.01" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={crear} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white">
            Crear tarifa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditModal({
  row, nombreLicencia, nombreCanal, onOpenChange, onSaved,
}: {
  row: Row | null;
  nombreLicencia: string;
  nombreCanal: string;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [pct, setPct] = useState("");
  const [activo, setActivo] = useState(true);
  const [busy, setBusy] = useState(false);

  const openId = row?.id_tarifa_comision ?? null;
  useEffect(() => {
    setPct(row?.pct_comision != null ? String(row.pct_comision) : "");
    setActivo(!!row?.activo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!row) return;
    const n = Number(pct);
    if (pct.trim() === "" || Number.isNaN(n) || n < 0 || n > 100) { toast.error("Indica un % válido (0-100)"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("tarifas_comision_ota")
      .update({ pct_comision: n, activo })
      .eq("id_tarifa_comision", row.id_tarifa_comision);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Guardado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nombreLicencia} × {nombreCanal}</DialogTitle>
          <DialogDescription className="sr-only">Editar tarifa de comisión OTA</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>% comisión</Label>
            <Input type="number" step="0.01" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
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
