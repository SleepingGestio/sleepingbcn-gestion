import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Tipus = {
  id_tipus: number;
  nombre: string;
  requiere_apartamento: boolean | null;
  computable_hores: boolean | null;
  actiu: boolean | null;
  orden: number | null;
};

export function TiposGenericasAdmin() {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const q = useQuery({
    queryKey: ["tipos-tarea-generica-all"],
    queryFn: async (): Promise<Tipus[]> => {
      const { data, error } = await supabase
        .from("tipos_tarea_generica")
        .select("*")
        .order("orden", { ascending: true, nullsFirst: false })
        .order("id_tipus");
      if (error) throw error;
      return (data ?? []) as Tipus[];
    },
  });

  async function crear() {
    const n = nuevoNombre.trim();
    if (!n) { toast.error("Indica un nom"); return; }
    setCreando(true);
    const nextOrden = ((q.data ?? []).reduce((m, t) => Math.max(m, t.orden ?? 0), 0)) + 1;
    const { error } = await supabase
      .from("tipos_tarea_generica")
      .insert({ nombre: n, actiu: true, orden: nextOrden });
    setCreando(false);
    if (error) { toast.error("Error: " + error.message); return; }
    setNuevoNombre("");
    toast.success("Tipus creat");
    q.refetch();
  }

  async function update(id: number, patch: Partial<Tipus>) {
    const { error } = await supabase
      .from("tipos_tarea_generica")
      .update(patch)
      .eq("id_tipus", id);
    if (error) { toast.error("Error: " + error.message); return; }
    q.refetch();
  }

  async function eliminar(id: number) {
    // Solo permitir borrar si no tiene registros
    const { count, error: cErr } = await supabase
      .from("registre_temps_generic")
      .select("id_registre", { count: "exact", head: true })
      .eq("id_tipus", id);
    if (cErr) { toast.error("Error: " + cErr.message); return; }
    if ((count ?? 0) > 0) {
      toast.error("No es pot eliminar: ja té registres. Desactiva'l en comptes.");
      return;
    }
    if (!confirm("Eliminar aquest tipus?")) return;
    const { error } = await supabase.from("tipos_tarea_generica").delete().eq("id_tipus", id);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Eliminat");
    q.refetch();
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-sm">
          <label className="text-xs text-muted-foreground">Nou tipus de tasca</label>
          <Input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nom del tipus…"
            onKeyDown={(e) => { if (e.key === "Enter") crear(); }}
          />
        </div>
        <Button onClick={crear} disabled={creando || !nuevoNombre.trim()}>
          <Plus className="h-4 w-4" /> Afegir
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Ordre</TableHead>
            <TableHead>Nom</TableHead>
            <TableHead className="w-24">Actiu</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(q.data ?? []).map((t) => (
            <TableRow key={t.id_tipus}>
              <TableCell>
                <Input
                  type="number"
                  className="h-8 w-16"
                  defaultValue={t.orden ?? 0}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v === (t.orden ?? 0)) return;
                    update(t.id_tipus, { orden: v });
                  }}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  defaultValue={t.nombre}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v || v === t.nombre) return;
                    update(t.id_tipus, { nombre: v });
                  }}
                />
              </TableCell>
              <TableCell>
                <Switch
                  checked={!!t.actiu}
                  onCheckedChange={(v) => update(t.id_tipus, { actiu: v })}
                />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => eliminar(t.id_tipus)} title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {(q.data ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                Encara no hi ha tipus definits.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}