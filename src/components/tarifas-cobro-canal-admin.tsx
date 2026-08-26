import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCanalesReserva } from "@/lib/tarifas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

type Canal = { id_canal: number; nombre: string; activo: boolean | null };
type TarifaCobro = { id_tarifa_cobro: number; id_canal: number; pct_cobro: number; activo: boolean | null };

export function TarifasCobroCanalAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const canalesQ = useQuery({ queryKey: ["canales-for-cobro"], queryFn: fetchCanalesReserva });

  const tarifasQ = useQuery({
    queryKey: ["tarifas-cobro-canal-all"],
    queryFn: async (): Promise<TarifaCobro[]> => {
      const { data, error } = await supabase
        .from("tarifas_cobro_canal")
        .select("id_tarifa_cobro,id_canal,pct_cobro,activo");
      if (error) throw error;
      return (data ?? []) as TarifaCobro[];
    },
  });

  const tarifaByCanal = useMemo(() => {
    const m = new Map<number, TarifaCobro>();
    for (const t of tarifasQ.data ?? []) m.set(t.id_canal, t);
    return m;
  }, [tarifasQ.data]);

  const [editing, setEditing] = useState<Canal | null>(null);

  const refetch = () => tarifasQ.refetch();

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground">
        % de cobro por canal. Se propone (sin forzar) al anotar "% por cobro" en el detalle de
        una reserva.
      </div>

      <div className="rounded-md border divide-y">
        {(canalesQ.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay canales definidos.
          </div>
        )}
        {(canalesQ.data ?? []).map((c) => {
          const tarifa = tarifaByCanal.get(c.id_canal);
          return (
            <div key={c.id_canal} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 font-semibold uppercase tracking-wide text-sm">{c.nombre}</div>
              <div className="text-sm text-muted-foreground">
                {tarifa ? `${tarifa.pct_cobro}%` : "Sin definir"}
              </div>
              {!readOnly && (
                <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <EditModal
        canal={editing}
        tarifa={editing ? tarifaByCanal.get(editing.id_canal) ?? null : null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={refetch}
      />
    </Card>
  );
}

function EditModal({
  canal, tarifa, onOpenChange, onSaved,
}: {
  canal: Canal | null;
  tarifa: TarifaCobro | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);

  const openId = canal?.id_canal ?? null;
  useEffect(() => {
    setPct(tarifa?.pct_cobro != null ? String(tarifa.pct_cobro) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!canal) return;
    const n = Number(pct);
    if (pct.trim() === "" || Number.isNaN(n) || n < 0 || n > 100) {
      toast.error("Indica un % válido (0-100)");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("tarifas_cobro_canal")
      .upsert({ id_canal: canal.id_canal, pct_cobro: n, activo: true }, { onConflict: "id_canal" });
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
          <DialogTitle>% de cobro — {canal?.nombre}</DialogTitle>
          <DialogDescription className="sr-only">Editar % de cobro del canal</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>% de cobro</Label>
            <Input type="number" step="0.01" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
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
