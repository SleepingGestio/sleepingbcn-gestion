import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TimeBadge } from "@/components/time-badge";
import { fmtDate, resolveTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/importaciones")({
  component: ImportacionesPage,
});

type Importacion = {
  id: number;
  fecha_importacion: string;
  fichero: string | null;
  modo: string | null;
  total_filas: number | null;
  nuevas: number | null;
  modificadas: number | null;
  sin_cambios: number | null;
  eliminadas_candidatas: number | null;
  estado: string | null;
};

type TipoCambio = "nuevo" | "modificado" | "eliminado_candidato";

type DetalleRow = {
  id: number;
  id_importacion: number;
  numero_reserva: string;
  tipo_cambio: TipoCambio;
  campos_cambiados: Record<string, { antes: unknown; despues: unknown }> | null;
  fecha: string;
};

type ResvLite = {
  "Número": string;
  "Check in": string | null;
  "Habitaciones": string | null;
  "Referencia": string | null;
};

const MODO_LABEL: Record<string, string> = {
  diario: "Diario",
  historico: "Carga histórica",
};

// KB estimated-time fields need the same green(informed)/gray(default)
// TimeBadge treatment used elsewhere (programacion-limpiezas, checkins,
// reserva-detail) — everything else is plain before/after text.
const HORA_DEFAULT: Record<string, string> = {
  "Hora estimada de llegada": "15:00:00",
  "Hora estimada de salida": "11:00:00",
};

function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

function ImportacionesPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showEstado, setShowEstado] = useState(false);

  const importsQ = useQuery({
    queryKey: ["kb-importaciones"],
    queryFn: async (): Promise<Importacion[]> => {
      const { data, error } = await supabase
        .from("kb_importaciones")
        .select(
          "id, fecha_importacion, fichero, modo, total_filas, nuevas, modificadas, sin_cambios, eliminadas_candidatas, estado",
        )
        .order("fecha_importacion", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Importacion[];
    },
  });

  const detalleQ = useQuery({
    queryKey: ["kb-importaciones-detalle", selectedId],
    enabled: selectedId != null,
    queryFn: async (): Promise<DetalleRow[]> => {
      const { data, error } = await supabase
        .from("kb_importaciones_detalle")
        .select("id, id_importacion, numero_reserva, tipo_cambio, campos_cambiados, fecha")
        .eq("id_importacion", selectedId!)
        .in("tipo_cambio", ["nuevo", "modificado", "eliminado_candidato"]);
      if (error) throw error;
      return (data ?? []) as DetalleRow[];
    },
  });

  const numeros = useMemo(
    () => Array.from(new Set((detalleQ.data ?? []).map((d) => d.numero_reserva))),
    [detalleQ.data],
  );

  const resvQ = useQuery({
    queryKey: ["kb-importaciones-resv", numeros.join(",")],
    enabled: numeros.length > 0,
    queryFn: async (): Promise<Map<string, ResvLite>> => {
      const { data, error } = await supabase
        .from("reservas_kb")
        .select('"Número","Check in","Habitaciones","Referencia"')
        .in("Número", numeros);
      if (error) throw error;
      const m = new Map<string, ResvLite>();
      for (const r of (data ?? []) as ResvLite[]) m.set(r["Número"], r);
      return m;
    },
  });

  type Line = {
    key: string;
    first: boolean;
    numero: string;
    checkin: string | null;
    apt: string | null;
    cliente: string | null;
  } & (
    | { kind: "nuevo" }
    | { kind: "eliminado" }
    | { kind: "campo"; campo: string; antes: unknown; despues: unknown }
  );

  const lines = useMemo((): Line[] => {
    const resvMap = resvQ.data ?? new Map<string, ResvLite>();
    const enriched = (detalleQ.data ?? []).map((d) => {
      const r = resvMap.get(d.numero_reserva) ?? null;
      return {
        d,
        checkin: r?.["Check in"] ?? null,
        apt: r?.["Habitaciones"] ?? null,
        cliente: r?.["Referencia"] ?? null,
      };
    });
    enriched.sort((a, b) => (a.checkin ?? "9999-99-99").localeCompare(b.checkin ?? "9999-99-99"));

    const out: Line[] = [];
    for (const { d, checkin, apt, cliente } of enriched) {
      const base = { numero: d.numero_reserva, checkin, apt, cliente };
      if (d.tipo_cambio === "nuevo") {
        out.push({ ...base, kind: "nuevo", key: `${d.id}`, first: true });
      } else if (d.tipo_cambio === "eliminado_candidato") {
        out.push({ ...base, kind: "eliminado", key: `${d.id}`, first: true });
      } else {
        const campos = Object.entries(d.campos_cambiados ?? {}).filter(
          ([campo]) => showEstado || campo !== "Estado",
        );
        campos.forEach(([campo, diff], idx) => {
          out.push({
            ...base,
            kind: "campo",
            key: `${d.id}-${campo}`,
            first: idx === 0,
            campo,
            antes: diff?.antes,
            despues: diff?.despues,
          });
        });
      }
    }
    return out;
  }, [detalleQ.data, resvQ.data, showEstado]);

  return (
    <AppShell title="Importaciones">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Historial de importaciones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {importsQ.isLoading && (
              <div className="px-4 py-6 text-sm text-muted-foreground">Cargando…</div>
            )}
            {!importsQ.isLoading && (importsQ.data ?? []).length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No hay importaciones registradas.
              </div>
            )}
            <div className="divide-y">
              {(importsQ.data ?? []).map((imp) => {
                const selected = selectedId === imp.id;
                const nuevas = imp.nuevas ?? 0;
                const modificadas = imp.modificadas ?? 0;
                const eliminadas = imp.eliminadas_candidatas ?? 0;
                return (
                  <button
                    key={imp.id}
                    type="button"
                    onClick={() => setSelectedId(selected ? null : imp.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors",
                      selected && "bg-slate-100",
                    )}
                  >
                    <span className="text-muted-foreground shrink-0">{fmtFechaHora(imp.fecha_importacion)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="shrink-0">{MODO_LABEL[imp.modo ?? ""] ?? imp.modo ?? "—"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="shrink-0">{imp.total_filas ?? 0} reservas</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800">
                      {nuevas} nuevas
                    </span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800">
                      {modificadas} modificadas
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold",
                        eliminadas > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {eliminadas} eliminadas
                    </span>
                    <ChevronRight
                      className={cn(
                        "ml-auto h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                        selected && "rotate-90",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedId != null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Cambios detectados</CardTitle>
              <div className="flex items-center gap-2">
                <Switch id="show-estado" checked={showEstado} onCheckedChange={setShowEstado} />
                <Label htmlFor="show-estado" className="text-sm font-normal cursor-pointer">
                  Mostrar cambios de estado
                </Label>
              </div>
            </CardHeader>
            <CardContent>
              {detalleQ.isLoading && (
                <div className="py-6 text-sm text-muted-foreground">Cargando…</div>
              )}
              {!detalleQ.isLoading && lines.length === 0 && (
                <div className="py-6 text-sm text-muted-foreground">
                  No hay cambios que mostrar en esta importación.
                </div>
              )}
              {!detalleQ.isLoading && lines.length > 0 && (
                <div className="text-sm">
                  <div className="grid grid-cols-[110px_84px_1fr_1fr_2.2fr] gap-3 px-1 pb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <span>Número</span>
                    <span>Check-in</span>
                    <span>Apartamento</span>
                    <span>Cliente</span>
                    <span>Cambio</span>
                  </div>
                  <div className="divide-y">
                    {lines.map((line) => (
                      <div
                        key={line.key}
                        className="grid grid-cols-[110px_84px_1fr_1fr_2.2fr] gap-3 px-1 py-1.5 items-center"
                      >
                        <span className="font-mono text-xs truncate">{line.first ? line.numero : ""}</span>
                        <span>{line.first ? fmtDate(line.checkin) : ""}</span>
                        <span className="truncate">{line.first ? (line.apt ?? "—") : ""}</span>
                        <span className="truncate">{line.first ? (line.cliente ?? "—") : ""}</span>
                        <div>
                          <CambioCell line={line} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function CambioCell({
  line,
}: {
  line:
    | { kind: "nuevo" }
    | { kind: "eliminado" }
    | { kind: "campo"; campo: string; antes: unknown; despues: unknown };
}) {
  if (line.kind === "nuevo") {
    return (
      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800">
        Nueva
      </span>
    );
  }
  if (line.kind === "eliminado") {
    return (
      <span className="text-muted-foreground italic">Ya no aparece — revisar en Krossbooking</span>
    );
  }

  const { campo, antes, despues } = line;
  const horaDefault = HORA_DEFAULT[campo];
  if (horaDefault) {
    const a = resolveTime((antes as string | null) ?? null, horaDefault);
    const d = resolveTime((despues as string | null) ?? null, horaDefault);
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="text-muted-foreground">{campo}:</span>
        <TimeBadge value={a.value.slice(0, 5)} informed={a.informed} />
        <span className="text-muted-foreground">→</span>
        <TimeBadge value={d.value.slice(0, 5)} informed={d.informed} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-muted-foreground">{campo}:</span>
      <span className="line-through text-red-600">{String(antes ?? "—")}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-bold text-emerald-700">{String(despues ?? "—")}</span>
    </span>
  );
}
