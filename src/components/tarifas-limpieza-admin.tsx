import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Categoria = { id_categoria_limpieza: number; nombre: string; activo: boolean | null };
type TarifaLimpieza = {
  id_tarifa_limpieza: number;
  id_categoria_limpieza: number;
  costo_limpieza: number;
  vigente_desde: string;
  activo: boolean | null;
};

/** Steps dated on/before this day are the open-ended base step ("Desde siempre"). */
const BASE_DATE = "2000-01-01";

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fmtDesde(iso: string): string {
  if (iso <= BASE_DATE) return "Desde siempre";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Active step in force on `dia` (latest vigente_desde <= dia), if any. */
function vigenteEn(tarifas: TarifaLimpieza[], dia: string): TarifaLimpieza | null {
  let best: TarifaLimpieza | null = null;
  for (const t of tarifas) {
    if (t.activo === false || t.vigente_desde > dia) continue;
    if (!best || t.vigente_desde > best.vigente_desde) best = t;
  }
  return best;
}

export function TarifasLimpiezaAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const categoriasQ = useQuery({
    queryKey: ["cfg-categorias-limpieza-for-tarifas"],
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from("tipos_categoria_limpieza")
        .select("id_categoria_limpieza,nombre,activo")
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
        .select("id_tarifa_limpieza,id_categoria_limpieza,costo_limpieza,vigente_desde,activo")
        .order("vigente_desde", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TarifaLimpieza[];
    },
  });

  const tarifasByCategoria = useMemo(() => {
    const m = new Map<number, TarifaLimpieza[]>();
    for (const t of tarifasQ.data ?? []) {
      const arr = m.get(t.id_categoria_limpieza) ?? [];
      arr.push(t);
      m.set(t.id_categoria_limpieza, arr);
    }
    return m;
  }, [tarifasQ.data]);

  const [editing, setEditing] = useState<Categoria | null>(null);
  const refetch = () => { tarifasQ.refetch(); };
  const hoy = todayISO();

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground">
        Coste de limpieza por categoría de limpieza y por periodo (independiente de la categoría
        de apartamento). Cada tarifa rige desde su fecha de inicio hasta que empieza la siguiente,
        según la fecha de CHECK-OUT de la reserva. Se propone (sin forzar) al anotar "Pagado
        limpieza" en el detalle de una reserva.
      </div>

      <div className="rounded-md border divide-y">
        {(categoriasQ.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay categorías de limpieza definidas. Créalas en la pestaña "Categorías
            de limpieza".
          </div>
        )}
        {(categoriasQ.data ?? []).map((c) => {
          const tarifas = tarifasByCategoria.get(c.id_categoria_limpieza) ?? [];
          const actual = vigenteEn(tarifas, hoy);
          const futuros = tarifas.filter((t) => t.vigente_desde > hoy).length;
          return (
            <div key={c.id_categoria_limpieza} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 font-semibold uppercase tracking-wide text-sm">{c.nombre}</div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  {actual ? `${actual.costo_limpieza} €` : "Sin definir"}
                </div>
                {(tarifas.length > 1 || futuros > 0) && (
                  <div className="text-xs text-muted-foreground">
                    {tarifas.length} periodos · {futuros} futuro(s)
                  </div>
                )}
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

      <PeriodosModal
        categoria={editing}
        tarifas={editing ? tarifasByCategoria.get(editing.id_categoria_limpieza) ?? [] : []}
        hoy={hoy}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onChanged={refetch}
      />
    </Card>
  );
}

function PeriodosModal({
  categoria, tarifas, hoy, onOpenChange, onChanged,
}: {
  categoria: Categoria | null;
  tarifas: TarifaLimpieza[];
  hoy: string;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  // null = form closed; "new" = adding; number = id_tarifa_limpieza being edited
  const [formFor, setFormFor] = useState<"new" | number | null>(null);
  const [desde, setDesde] = useState("");
  const [costo, setCosto] = useState("");
  const [busy, setBusy] = useState(false);

  const ordenadas = useMemo(
    () => [...tarifas].sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : a.vigente_desde > b.vigente_desde ? -1 : 0)),
    [tarifas],
  );
  const vigente = useMemo(() => vigenteEn(tarifas, hoy), [tarifas, hoy]);
  const formOpen = formFor !== null;

  function cerrarForm() { setFormFor(null); }

  function abrirNuevo() {
    setDesde(hoy);
    setCosto(ordenadas[0] ? String(ordenadas[0].costo_limpieza) : "");
    setFormFor("new");
  }

  function abrirEditar(t: TarifaLimpieza) {
    setDesde(t.vigente_desde.slice(0, 10));
    setCosto(String(t.costo_limpieza));
    setFormFor(t.id_tarifa_limpieza);
  }

  function handleOpenChange(open: boolean) {
    if (!open) cerrarForm();
    onOpenChange(open);
  }

  async function guardar() {
    if (!categoria || formFor === null) return;
    const n = Number(costo);
    if (costo.trim() === "" || Number.isNaN(n) || n < 0) {
      toast.error("Indica un coste válido (>= 0)");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || Number.isNaN(Date.parse(desde))) {
      toast.error("Indica una fecha de inicio válida");
      return;
    }
    const duplicada = tarifas.some(
      (t) => t.vigente_desde.slice(0, 10) === desde && t.id_tarifa_limpieza !== formFor,
    );
    if (duplicada) {
      toast.error("Ya existe un periodo con esa fecha de inicio");
      return;
    }
    setBusy(true);
    const { error } = formFor === "new"
      ? await supabase.from("tarifas_limpieza").insert({
          id_categoria_limpieza: categoria.id_categoria_limpieza,
          costo_limpieza: n,
          vigente_desde: desde,
          activo: true,
        })
      : await supabase.from("tarifas_limpieza")
          .update({ costo_limpieza: n, vigente_desde: desde })
          .eq("id_tarifa_limpieza", formFor);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Guardado");
    cerrarForm();
    onChanged();
  }

  async function eliminar(t: TarifaLimpieza) {
    if (!window.confirm(`¿Eliminar el periodo "${fmtDesde(t.vigente_desde)}" (${t.costo_limpieza} €)?`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("tarifas_limpieza")
      .delete()
      .eq("id_tarifa_limpieza", t.id_tarifa_limpieza);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Periodo eliminado");
    onChanged();
  }

  return (
    <Dialog open={!!categoria} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Coste de limpieza — {categoria?.nombre}</DialogTitle>
          <DialogDescription className="sr-only">Periodos de tarifa de limpieza de la categoría</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border divide-y">
            {ordenadas.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">
                Sin periodos definidos.
              </div>
            )}
            {ordenadas.map((t) => (
              <div key={t.id_tarifa_limpieza} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 text-sm flex items-center gap-2">
                  <span>{fmtDesde(t.vigente_desde)}</span>
                  {vigente?.id_tarifa_limpieza === t.id_tarifa_limpieza && (
                    <Badge variant="secondary">vigente hoy</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{t.costo_limpieza} €</div>
                <Button
                  variant="ghost" size="icon" title="Editar"
                  disabled={formOpen || busy} onClick={() => abrirEditar(t)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" title="Eliminar"
                  disabled={formOpen || busy} onClick={() => eliminar(t)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {formOpen ? (
            <div className="rounded-md border p-3 space-y-3">
              <div className="space-y-1.5">
                <Label>Vigente desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Coste de limpieza (€)</Label>
                <Input type="number" step="0.01" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cerrarForm} disabled={busy}>Cancelar</Button>
                <Button onClick={guardar} disabled={busy}>Guardar</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={abrirNuevo} disabled={busy}>
              <Plus className="h-4 w-4 mr-1" /> Añadir periodo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
