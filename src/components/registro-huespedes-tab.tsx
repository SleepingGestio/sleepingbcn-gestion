// Tab "Registro de huéspedes" of the reservation detail. Read-only.
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchRegistreByReserva } from "@/lib/partee-registre-api";
import {
  alertLevel,
  countRooms,
  expectedViajeros,
  fmtAgo,
  todayMadrid,
  viajerosTone,
} from "@/lib/partee-registre";
import { fmtDateTime } from "@/lib/format";
import {
  copyLink,
  LEVEL_TEXT,
  noLinkReason,
  OpenLinkButton,
  RegistreEstadoBadge,
  ViajerosCell,
} from "@/components/partee-registre-bits";

export function RegistroHuespedesTab({
  numero,
  huespedes,
  menores,
  exentos,
  habitaciones,
}: {
  numero: string;
  huespedes: number | null;
  menores: number | null;
  exentos: number | null;
  habitaciones: string | null;
}) {
  const { canView, loading } = usePermissions();
  const allowed = canView("registre_hostes");

  const q = useQuery({
    queryKey: ["partee-registre-reserva", numero],
    enabled: allowed,
    queryFn: () => fetchRegistreByReserva(numero),
  });

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!allowed) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Sin acceso</div>
    );
  }
  if (q.isLoading) return <div className="p-4 text-sm text-muted-foreground">Cargando…</div>;
  if (q.error) {
    return <div className="p-4 text-sm text-destructive">No se pudo cargar el registro de huéspedes.</div>;
  }
  const rows = q.data ?? [];
  if (!rows.length) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sin datos de Partee todavía (la sincronización cubre las entradas de ayer a 7 días vista).
      </div>
    );
  }

  const today = todayMadrid();
  const expected = expectedViajeros({ huespedes, menores, exentos }, countRooms(habitaciones));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        {rows.map((r) => {
          const alert = alertLevel(r, { today, expected });
          return (
            <div key={r.id_registre} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`}</span>
                <RegistreEstadoBadge estado={r.estado} level={alert.level} />
                <span className={`text-sm ${LEVEL_TEXT[alert.level]}`}>{alert.label}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <ViajerosCell n={r.num_viajeros} expected={expected} tone={viajerosTone(r, { today }, expected)} />
                {r.num_lote && <span>Lote: {r.num_lote}</span>}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">Actualizado {fmtAgo(r.ultimo_sync)}</span>
                  </TooltipTrigger>
                  <TooltipContent>{fmtDateTime(r.ultimo_sync)}</TooltipContent>
                </Tooltip>
              </div>

              {r.checkin_url ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all text-sm">{r.checkin_url}</span>
                  <Button variant="outline" size="sm" onClick={() => copyLink(r.checkin_url!)}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copiar enlace
                  </Button>
                  <OpenLinkButton url={r.checkin_url} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{noLinkReason(r.estado)}</p>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
