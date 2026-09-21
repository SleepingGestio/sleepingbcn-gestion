import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchPrecioBase, upsertPrecioBase, type TemporadaAplicaA } from "@/lib/pricing";
import { Field } from "@/components/plantilla-edit-dialog";

/** Single editable value for the page's current Año + Grupo. */
function PrecioBaseForm({
  anio, aplicaA, initial, canEdit, onSaved,
}: {
  anio: number;
  aplicaA: TemporadaAplicaA;
  initial: number | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [precio, setPrecio] = useState(initial != null ? String(initial) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const value = Number(precio);
    if (precio.trim() === "" || !Number.isFinite(value) || value <= 0) {
      toast.error("El precio base debe ser un número mayor que 0");
      return;
    }
    setSaving(true);
    try {
      await upsertPrecioBase(aplicaA, anio, value);
      toast.success("Precio base guardado");
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-end gap-3">
      <div className="w-48">
        <Field label="Precio base *">
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Sin definir"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>
      {canEdit && (
        <Button onClick={handleSave} disabled={saving}>Guardar</Button>
      )}
    </div>
  );
}

/** "Precio base" tab of Configuración Tarifas. Fetches its own data. */
export function PrecioBaseTab({ anio, aplicaA }: { anio: number; aplicaA: TemporadaAplicaA }) {
  const { canEdit } = usePermissions();
  const canEditTarifas = canEdit("pricing_temporadas");
  const q = useQuery({ queryKey: ["pricing-precio-base"], queryFn: fetchPrecioBase });
  const current = (q.data ?? []).find((p) => p.anio === anio && p.aplica_a === aplicaA) ?? null;

  return (
    <Card className="bg-white p-6 max-w-xl">
      <h2 className="text-sm font-semibold mb-4">
        Precio base — {aplicaA === "city" ? "City" : "Rural"} {anio}
      </h2>
      {q.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && !q.error && (
        // Re-keyed on the saved value so the input follows the stored price after a save or refetch.
        <PrecioBaseForm
          key={`${anio}-${aplicaA}-${current?.precio ?? "none"}`}
          anio={anio}
          aplicaA={aplicaA}
          initial={current?.precio ?? null}
          canEdit={canEditTarifas}
          onSaved={() => q.refetch()}
        />
      )}
    </Card>
  );
}
