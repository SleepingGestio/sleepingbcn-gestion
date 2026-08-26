import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

type Categoria = { id_categoria: number; nombre: string; activo: boolean | null };
type TarifaLimpieza = { id_tarifa_limpieza: number; id_categoria: number; costo_limpieza: number; activo: boolean | null };

export function TarifasLimpiezaAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const categoriasQ = useQuery({
    queryKey: ["cfg-categorias-apartamento-for-tarifas"],
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from("tipos_categoria_apartamento")
        .select("id_categoria,nombre,activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  const tarifasQ = useQuery({
    queryKey: ["tarifas-limpieza-all"],
    queryFn: async (): Promise<TarifaLimpieza[]> => {
      const { data, error } = await supabase
        .from("tarifas_limpieza")
        .select("id_tarifa_limpieza,id_categoria,costo_limpieza,activo");
      if (error) throw error;
      return (data ?? []) as TarifaLimpieza[];
    },
  });

  const tarifaByCategoria = useMemo(() => {
    const m = new Map<number, TarifaLimpieza>();
    for (const t of tarifasQ.data ?? []) m.set(t.id_categoria, t);
    return m;
  }, [tarifasQ.data]);

  const [editing, setEditing] = useState<Categoria | null>(null);

  const refetch = () => { tarifasQ.refetch(); };

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground">
        Coste de limpieza por categoría de apartamento. Se propone (sin forzar) al anotar
        "Pagado limpieza" en el detalle de una reserva.
      </div>

      <div className="rounded-md border divide-y">
        {(categoriasQ.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay categorías de apartamento definidas.
          </div>
        )}
        {(categoriasQ.data ?? []).map((c) => {
          const tarifa = tarifaByCategoria.get(c.id_categoria);
          return (
            <div key={c.id_categoria} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 font-semibold uppercase tracking-wide text-sm">{c.nombre}</div>
              <div className="text-sm text-muted-foreground">
                {tarifa ? `${tarifa.costo_limpieza} €` : "Sin definir"}
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
        categoria={editing}
        tarifa={editing ? tarifaByCategoria.get(editing.id_categoria) ?? null : null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={refetch}
      />
    </Card>
  );
}

function EditModal({
  categoria, tarifa, onOpenChange, onSaved,
}: {
  categoria: Categoria | null;
  tarifa: TarifaLimpieza | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [costo, setCosto] = useState("");
  const [busy, setBusy] = useState(false);

  const openId = categoria?.id_categoria ?? null;
  useEffect(() => {
    setCosto(tarifa?.costo_limpieza != null ? String(tarifa.costo_limpieza) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!categoria) return;
    const n = Number(costo);
    if (costo.trim() === "" || Number.isNaN(n) || n < 0) {
      toast.error("Indica un coste válido (>= 0)");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("tarifas_limpieza")
      .upsert({ id_categoria: categoria.id_categoria, costo_limpieza: n, activo: true }, { onConflict: "id_categoria" });
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
          <DialogTitle>Coste de limpieza — {categoria?.nombre}</DialogTitle>
          <DialogDescription className="sr-only">Editar coste de limpieza de la categoría</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Coste de limpieza (€)</Label>
            <Input type="number" step="0.01" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} />
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
