import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAjustes, upsertAjuste } from "@/lib/tarifas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AjustesFinancierosAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const q = useQuery({ queryKey: ["ajustes-app"], queryFn: fetchAjustes });

  const [iva, setIva] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data) setIva(q.data["iva_pct"] ?? "");
  }, [q.data]);

  async function guardar() {
    const n = Number(iva);
    if (iva.trim() === "" || Number.isNaN(n) || n < 0 || n > 100) {
      toast.error("Indica un IVA válido (0-100)");
      return;
    }
    setBusy(true);
    try {
      await upsertAjuste("iva_pct", String(n));
      toast.success("Guardado");
      q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-4 max-w-md">
      <div className="text-sm text-muted-foreground">
        Constantes financieras de la aplicación. El IVA se aplica a las líneas "Con IVA" del cierre
        económico de cada reserva.
      </div>

      <div className="space-y-1.5">
        <Label>IVA (%)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={iva}
          disabled={readOnly}
          onChange={(e) => setIva(e.target.value)}
        />
      </div>

      {!readOnly && (
        <Button onClick={guardar} disabled={busy || q.isLoading}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      )}
    </Card>
  );
}
