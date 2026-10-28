// "Actualizar todo": forces the general Partee sync (GitHub Actions workflow) from /registre-hostes.
// Editors of 'registre_hostes' only (the server functions re-check the permission).
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { estadoSincronizacionPartee, lanzarSincronizacionPartee } from "@/lib/api/sync-partee.functions";

const SONDEO_MS = 8_000;
const PRIMER_SONDEO_MS = 10_000;
const ESPERA_MAX_MS = 5 * 60_000;
const ERRORES_SEGUIDOS_MAX = 3;
const GENERIC = "No se ha podido lanzar la sincronización";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SyncTodoButton() {
  const { canEdit } = usePermissions();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!canEdit("registre_hostes")) return null;

  function refrescarListas() {
    qc.invalidateQueries({ queryKey: ["partee-registre-window"] });
    qc.invalidateQueries({ queryKey: ["partee-registre-reserva"] });
  }

  /** Polls the manual run until it finishes ("success" | "failed") or the wait runs out ("unknown"). */
  async function esperar(since: number): Promise<"success" | "failed" | "unknown"> {
    const limite = Date.now() + ESPERA_MAX_MS;
    let errores = 0;
    await sleep(PRIMER_SONDEO_MS);
    while (mounted.current && Date.now() < limite) {
      try {
        const r = await estadoSincronizacionPartee({ data: { since } });
        if (r.ok) {
          errores = 0;
          if (r.state === "success" || r.state === "failed") return r.state;
        } else if (++errores >= ERRORES_SEGUIDOS_MAX) {
          console.error("[sync-partee]", r.code);
          return "unknown";
        }
      } catch {
        if (++errores >= ERRORES_SEGUIDOS_MAX) return "unknown";
      }
      await sleep(SONDEO_MS);
    }
    return "unknown";
  }

  async function lanzar() {
    setBusy(true);
    try {
      const r = await lanzarSincronizacionPartee();
      if (!r.ok) {
        if (r.code === "already_running") toast.info("Ya hay una sincronización en curso");
        else {
          toast.error(GENERIC);
          console.error("[sync-partee]", r.code);
        }
        return;
      }
      toast.success("Sincronización lanzada. Tarda uno o dos minutos.");
      const resultado = await esperar(r.since);
      if (resultado === "failed") toast.error("La sincronización ha fallado; revisa GitHub Actions");
      else if (resultado === "unknown" && mounted.current) toast.info("La sincronización sigue en curso; la lista se actualizará en unos minutos");
    } catch (e) {
      toast.error(GENERIC);
      console.error("[sync-partee]", e instanceof Error ? e.name : "unknown");
    } finally {
      refrescarListas();
      if (mounted.current) setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : RefreshCw;
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void lanzar()}>
      <Icon className={busy ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} />
      {busy ? "Sincronizando…" : "Actualizar todo"}
    </Button>
  );
}
