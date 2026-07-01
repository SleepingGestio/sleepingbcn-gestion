import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SortHeader } from "@/components/sort-header";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Search } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/registre-horari/$id")({
  component: DetallPage,
});

const MONTH_CA = [
  "gener", "febrer", "març", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre",
];

function pad(n: number) { return String(n).padStart(2, "0"); }

function monthRange(year: number, month0: number) {
  const start = `${year}-${pad(month0 + 1)}-01`;
  const endDate = new Date(year, month0 + 1, 0);
  const end = `${year}-${pad(month0 + 1)}-${pad(endDate.getDate())}`;
  return { start, end };
}

function diffHours(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db)) return 0;
  return Math.max(0, (db - da) / 3_600_000);
}

function fmtHours(h: number): string {
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  const totalMin = Math.round(abs * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (mm === 0) return `${sign}${hh}h`;
  return `${sign}${hh}h ${pad(mm)}m`;
}

function fmtAjustSigned(h: number): { text: string; className: string } {
  if (h < 0) {
    return { text: `−${fmtHours(Math.abs(h))}`, className: "text-red-600" };
  }
  return { text: `+${fmtHours(h)}`, className: "text-emerald-600" };
}

function fmtHM(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateOnly(v: string | null): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

type RowKind = "checkout" | "extra_cr" | "generica" | "ajust";
type Row = {
  key: string;
  kind: RowKind;
  fecha: string;
  inici: string | null;
  fi: string | null;
  propietat: string;
  tipus: string;
  hores: number;
  raw: Record<string, unknown>;
};

type SortKey = "fecha" | "propietat" | "tipus" | "hores";

function DetallPage() {
  const { id } = Route.useParams();
  const idPersona = Number(id);
  const qc = useQueryClient();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const { start, end } = monthRange(year, month0);

  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [ajustOpen, setAjustOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<Row | null>(null);

  function prevMonth() {
    const d = new Date(year, month0 - 1, 1);
    setYear(d.getFullYear()); setMonth0(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(year, month0 + 1, 1);
    setYear(d.getFullYear()); setMonth0(d.getMonth());
  }

  const personaQ = useQuery({
    queryKey: ["reg-horari-persona", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("id_persona, nombre, apellidos, tipo_contrato, horas_objetivo_mes")
        .eq("id_persona", idPersona)
        .maybeSingle();
      if (error) throw error;
      return data as { id_persona: number; nombre: string | null; apellidos: string | null; tipo_contrato: string | null; horas_objetivo_mes: number | null } | null;
    },
  });

  const limpiezasQ = useQuery({
    queryKey: ["reg-horari-det-limpiezas", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_limpieza, worker, iniciada_en, finalizada_en, estado, fecha_limpieza, tipo, id_apt")
        .eq("worker", idPersona)
        .eq("estado", "finalizada")
        .gte("fecha_limpieza", start)
        .lte("fecha_limpieza", end);
      if (error) throw error;
      return (data ?? []) as Array<{
        id_limpieza: number; worker: number | null; iniciada_en: string | null;
        finalizada_en: string | null; fecha_limpieza: string; tipo: string | null; id_apt: number;
      }>;
    },
  });

  const genericQ = useQuery({
    queryKey: ["reg-horari-det-generic", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_registre, id_persona, id_tipus, id_apt, inici, fi, notes, tipos_tarea_generica(nombre)")
        .eq("id_persona", idPersona)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id_registre: number; id_persona: number; id_tipus: number; id_apt: number | null;
        inici: string | null; fi: string | null; notes: string | null;
        tipos_tarea_generica: { nombre: string } | null;
      }>;
    },
  });

  const ajustosQ = useQuery({
    queryKey: ["reg-horari-det-ajustos", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_ajuste, id_persona, fecha, tipo, horas, notas")
        .eq("id_persona", idPersona)
        .gte("fecha", start)
        .lte("fecha", end);
      if (error) {
        console.warn("ajustos query", error);
        return [];
      }
      return (data ?? []) as Array<{
        id_ajuste: number; id_persona: number; fecha: string; tipo: string | null;
        horas: number | null; notas: string | null;
      }>;
    },
  });

  const activePeriodQ = useQuery({
    queryKey: ["reg-horari-active-period", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_periodos_actividad")
        .select("id_periodo, horas_objetivo_mes, fecha_inicio, fecha_fin")
        .eq("id_persona", idPersona)
        .is("fecha_fin", null)
        .order("fecha_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("active period query", error);
        return null;
      }
      return data as { id_periodo: number; horas_objetivo_mes: number | null; fecha_inicio: string; fecha_fin: string | null } | null;
    },
  });

  const aptIds = useMemo(() => {
    const s = new Set<number>();
    for (const l of limpiezasQ.data ?? []) s.add(l.id_apt);
    for (const r of genericQ.data ?? []) if (r.id_apt != null) s.add(r.id_apt);
    return Array.from(s);
  }, [limpiezasQ.data, genericQ.data]);

  const aptsQ = useQuery({
    queryKey: ["reg-horari-det-apts", aptIds.join(",")],
    enabled: aptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select("id_apt, nombre")
        .in("id_apt", aptIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id_apt: number; nombre: string | null }>;
    },
  });

  const aptName = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of aptsQ.data ?? []) m.set(a.id_apt, a.nombre ?? `Apt #${a.id_apt}`);
    return m;
  }, [aptsQ.data]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const l of limpiezasQ.data ?? []) {
      const isSalida = l.tipo === "salida";
      const kind: RowKind = isSalida ? "checkout" : "extra_cr";
      out.push({
        key: `limp-${l.id_limpieza}`,
        kind,
        fecha: l.fecha_limpieza,
        inici: l.iniciada_en,
        fi: l.finalizada_en,
        propietat: aptName.get(l.id_apt) ?? `Apt #${l.id_apt}`,
        tipus: isSalida ? "Limpieza STD" : "Extra-CR",
        hores: diffHours(l.iniciada_en, l.finalizada_en),
        raw: l as unknown as Record<string, unknown>,
      });
    }
    for (const r of genericQ.data ?? []) {
      out.push({
        key: `gen-${r.id_registre}`,
        kind: "generica",
        fecha: dateOnly(r.inici),
        inici: r.inici,
        fi: r.fi,
        propietat: r.id_apt != null ? (aptName.get(r.id_apt) ?? `Apt #${r.id_apt}`) : "—",
        tipus: r.tipos_tarea_generica?.nombre ?? "Tasca genèrica",
        hores: diffHours(r.inici, r.fi),
        raw: r as unknown as Record<string, unknown>,
      });
    }
    for (const a of ajustosQ.data ?? []) {
      out.push({
        key: `aj-${a.id_ajuste}`,
        kind: "ajust",
        fecha: a.fecha,
        inici: null,
        fi: null,
        propietat: "—",
        tipus: a.tipo ?? "Ajust manual",
        hores: Number(a.horas ?? 0),
        raw: a as unknown as Record<string, unknown>,
      });
    }
    return out;
  }, [limpiezasQ.data, genericQ.data, ajustosQ.data, aptName]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") list = list.filter((r) => r.kind === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.propietat.toLowerCase().includes(q) || r.tipus.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "fecha") { va = a.fecha; vb = b.fecha; }
      else if (sortKey === "propietat") { va = a.propietat; vb = b.propietat; }
      else if (sortKey === "tipus") { va = a.tipus; vb = b.tipus; }
      else if (sortKey === "hores") { va = a.hores; vb = b.hores; }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [rows, typeFilter, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    let worked = 0, adjustments = 0, reductions = 0;
    let reductionTipo: string | null = null;
    for (const l of limpiezasQ.data ?? []) worked += diffHours(l.iniciada_en, l.finalizada_en);
    for (const r of genericQ.data ?? []) worked += diffHours(r.inici, r.fi);
    for (const a of ajustosQ.data ?? []) {
      const h = Number(a.horas ?? 0);
      if (a.tipo === "vacaciones" || a.tipo === "baja") {
        reductions += Math.abs(h);
        if (!reductionTipo) reductionTipo = a.tipo;
      } else {
        adjustments += h;
      }
    }
    const objective = activePeriodQ.data?.horas_objetivo_mes ?? null;
    const isAutonom = personaQ.data?.tipo_contrato === "autonomo";
    const baseObjective = objective != null ? Number(objective) : null;
    const effectiveObjective = baseObjective != null ? Math.max(0, baseObjective - reductions) : null;
    const total = worked + adjustments;
    const saldo = !isAutonom && effectiveObjective != null ? total - effectiveObjective : 0;
    return { worked, adjustments, reductions, reductionTipo, objective: baseObjective, effectiveObjective, isAutonom, total, saldo };
  }, [limpiezasQ.data, genericQ.data, ajustosQ.data, personaQ.data, activePeriodQ.data]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "fecha" ? "desc" : "asc"); }
  }

  const deleteAjust = useMutation({
    mutationFn: async (ajustId: number) => {
      const { error } = await supabase.from("personal_ajustos_hores").delete().eq("id_ajuste", ajustId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajust eliminat");
      qc.invalidateQueries({ queryKey: ["reg-horari-det-ajustos", idPersona] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const fullName = personaQ.data
    ? [personaQ.data.nombre, personaQ.data.apellidos].filter(Boolean).join(" ").trim() || `#${idPersona}`
    : `#${idPersona}`;

  const CONTRACT_LABELS: Record<string, string> = {
    fijo: "Fijo",
    discontinuo: "Discontinu",
    autonomo: "Autònom",
    temporal: "Temporal",
    practicas: "Pràctiques",
    otro: "Otro",
  };
  const contractLabel = CONTRACT_LABELS[personaQ.data?.tipo_contrato ?? ""] ?? "";

  return (
    <AppShell title="Registre horari">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Link to="/registre-horari" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Tornar
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium capitalize min-w-[140px] text-center">
              {MONTH_CA[month0]} {year}
            </div>
            <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Mes següent">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-semibold">{fullName}</h1>
          {contractLabel && <Badge variant="secondary">{contractLabel}</Badge>}
        </div>

        <HoresProgress
          worked={totals.worked}
          adjustments={totals.adjustments}
          reductions={totals.reductions}
          reductionTipo={totals.reductionTipo}
          baseObjective={totals.objective}
          effectiveObjective={totals.effectiveObjective}
          saldo={totals.saldo}
          isAutonom={totals.isAutonom}
        />

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              <SelectItem value="checkout">Check-out</SelectItem>
              <SelectItem value="extra_cr">Extra-CR</SelectItem>
              <SelectItem value="generica">Tasca genèrica</SelectItem>
              <SelectItem value="ajust">Ajust manual</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per propietat o tipus…"
              className="pl-8"
            />
          </div>
          <div className="flex-1" />
          <Button onClick={() => setAjustOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Ajust manual
          </Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left p-3">
                    <SortHeader label="Data" active={sortKey === "fecha"} dir={sortDir} onClick={() => toggleSort("fecha")} />
                  </th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inici</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fi</th>
                  <th className="text-left p-3">
                    <SortHeader label="Propietat" active={sortKey === "propietat"} dir={sortDir} onClick={() => toggleSort("propietat")} />
                  </th>
                  <th className="text-left p-3">
                    <SortHeader label="Tipus / Activitat" active={sortKey === "tipus"} dir={sortDir} onClick={() => toggleSort("tipus")} />
                  </th>
                  <th className="text-right p-3">
                    <SortHeader label="Hores" active={sortKey === "hores"} dir={sortDir} onClick={() => toggleSort("hores")} />
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-10">Cap registre en aquest mes.</td></tr>
                ) : (
                  filteredRows.map((r) => (
                    <Popover key={r.key}>
                      <PopoverTrigger asChild>
                        <tr className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => setDetailRow(r)}>
                          <td className="p-3">{fmtDate(r.fecha)}</td>
                          <td className="p-3">{r.kind === "ajust" ? "—" : fmtHM(r.inici)}</td>
                          <td className="p-3">{r.kind === "ajust" ? "—" : fmtHM(r.fi)}</td>
                          <td className="p-3">{r.propietat}</td>
                          <td className="p-3">
                            <RowTypeBadge kind={r.kind} label={r.tipus} />
                          </td>
                          <td className={`p-3 text-right tabular-nums ${r.kind === "ajust" ? fmtAjustSigned(r.hores).className : ""}`}>
                            {r.kind === "ajust" ? fmtAjustSigned(r.hores).text : fmtHours(r.hores)}
                          </td>
                          <td className="p-3">
                            {r.kind === "ajust" && (
                              <button
                                className="text-muted-foreground hover:text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Eliminar aquest ajust?")) {
                                    deleteAjust.mutate((r.raw as { id_ajuste: number }).id_ajuste);
                                  }
                                }}
                                aria-label="Eliminar ajust"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      </PopoverTrigger>
                    </Popover>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DetailPopoverDialog row={detailRow} onClose={() => setDetailRow(null)} />

        <AjustModal
          open={ajustOpen}
          onClose={() => setAjustOpen(false)}
          idPersona={idPersona}
          defaultDate={`${start.slice(0, 8)}${pad(Math.min(today.getDate(), 28))}`}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["reg-horari-det-ajustos", idPersona] });
            setAjustOpen(false);
          }}
        />
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClassName}`}>{value}</div>
    </div>
  );
}

function RowTypeBadge({ kind, label }: { kind: RowKind; label: string }) {
  const cls =
    kind === "checkout" ? "bg-blue-100 text-blue-800" :
    kind === "extra_cr" ? "bg-purple-100 text-purple-800" :
    kind === "generica" ? "bg-amber-100 text-amber-800" :
    "bg-emerald-100 text-emerald-800";
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function DetailPopoverDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detall activitat</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-2 text-sm">
            <Field label="Data" value={fmtDate(row.fecha)} />
            <Field label="Tipus" value={row.tipus} />
            <Field label="Propietat" value={row.propietat} />
            {row.kind !== "ajust" && (
              <>
                <Field label="Inici" value={fmtHM(row.inici)} />
                <Field label="Fi" value={fmtHM(row.fi)} />
              </>
            )}
            <Field
              label="Hores"
              value={row.kind === "ajust" ? fmtAjustSigned(row.hores).text : fmtHours(row.hores)}
              valueClassName={row.kind === "ajust" ? fmtAjustSigned(row.hores).className : ""}
            />
            {(row.raw as { notes?: string | null; notas?: string | null }).notes && (
              <Field label="Notes" value={String((row.raw as { notes: string }).notes)} />
            )}
            {(row.raw as { notas?: string | null }).notas && (
              <Field label="Notes" value={String((row.raw as { notas: string }).notas)} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HoresProgress({
  worked, adjustments, reductions, reductionTipo,
  baseObjective, effectiveObjective, saldo, isAutonom,
}: {
  worked: number; adjustments: number; reductions: number; reductionTipo: string | null;
  baseObjective: number | null; effectiveObjective: number | null; saldo: number; isAutonom: boolean;
}) {
  const BASE_PCT = 80;
  const hasObjective = baseObjective != null && baseObjective > 0 && effectiveObjective != null;
  const total = worked + adjustments;

  // Positions relative to bar container width (%). Base objective sits at 80%.
  const effPct = hasObjective ? (effectiveObjective! / baseObjective!) * BASE_PCT : 0;
  const workedPct = hasObjective ? Math.min(100, (total / baseObjective!) * BASE_PCT) : 0;

  // Progress bar color
  let workedColor = "#1D9E75";
  if (isAutonom) {
    workedColor = "#378ADD";
  } else if (hasObjective) {
    if (total >= effectiveObjective!) workedColor = "#1D9E75";
    else {
      const deficit = (effectiveObjective! - total) / effectiveObjective!;
      workedColor = deficit >= 0.15 ? "#E24B4A" : "#EF9F27";
    }
  }

  // Saldo pill color
  let saldoBg = "#E1F5EE", saldoFg = "#085041", saldoText: string;
  if (isAutonom || !hasObjective) {
    saldoBg = "#F1F1EE"; saldoFg = "#6B7280"; saldoText = "—";
  } else {
    if (saldo >= 0) {
      saldoBg = "#E1F5EE"; saldoFg = "#085041";
    } else {
      const deficitPct = effectiveObjective! > 0 ? Math.abs(saldo) / effectiveObjective! : 0;
      if (deficitPct >= 0.15) { saldoBg = "#FDEAEA"; saldoFg = "#A32D2D"; }
      else { saldoBg = "#FEF3E2"; saldoFg = "#B35C00"; }
    }
    saldoText = `${saldo >= 0 ? "+" : "−"}${fmtHours(Math.abs(saldo))}`;
  }

  const reductionLabel = reductionTipo === "vacaciones" ? "vacances" : reductionTipo === "baja" ? "baixa" : reductionTipo ?? "";
  const infoText = !hasObjective
    ? (isAutonom ? "Autònom" : "Sense objectiu")
    : reductions > 0
      ? `Obj. ${fmtHours(baseObjective!)} · −${fmtHours(reductions)} ${reductionLabel} → ${fmtHours(effectiveObjective!)} efectiu`
      : `Obj. ${fmtHours(baseObjective!)}`;

  return (
    <div className="mb-6 flex items-end gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">{infoText}</div>
        <div className="relative w-full">
          {/* Bar 1 - objective breakdown */}
          <div className="relative w-full" style={{ height: 10 }}>
            <div className="absolute inset-y-0 left-0" style={{ width: `${effPct}%`, background: "#D3D1C7" }} />
            {hasObjective && reductions > 0 && (
              <div
                className="absolute inset-y-0 flex items-center justify-center text-[10px] font-medium"
                style={{
                  left: `${effPct}%`,
                  width: `${Math.max(0, BASE_PCT - effPct)}%`,
                  background: "#FAEEDA",
                  borderLeft: "2px solid #EF9F27",
                  color: "#B35C00",
                }}
              >
                −{fmtHours(reductions)}
              </div>
            )}
          </div>
          {/* Bar 2 - progress */}
          <div className="relative w-full" style={{ height: 20 }}>
            <div
              className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-xs font-semibold text-white"
              style={{ width: `${workedPct}%`, background: workedColor }}
            >
              {workedPct > 8 ? fmtHours(worked) : ""}
            </div>
          </div>
          {/* Vertical marker at effectiveObjective */}
          {hasObjective && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${effPct}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "#26215C",
                transform: "translateX(-1px)",
              }}
            />
          )}
        </div>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <div
          className="rounded-full px-3 py-1 tabular-nums"
          style={{ background: saldoBg, color: saldoFg, fontSize: 16, fontWeight: 700 }}
        >
          {saldoText}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">saldo mes</div>
      </div>
    </div>
  );
}

function Field({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-right ${valueClassName}`}>{value}</span>
    </div>
  );
}

function AjustModal({
  open, onClose, idPersona, defaultDate, onSaved,
}: {
  open: boolean; onClose: () => void; idPersona: number; defaultDate: string; onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(defaultDate);
  const [tipo, setTipo] = useState("vacaciones");
  const [horas, setHoras] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const h = Number(horas);
    if (!fecha || !isFinite(h) || h === 0) {
      toast.error("Data i hores són obligatòries");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("personal_ajustos_hores").insert({
      id_persona: idPersona, fecha, tipo, horas: h, notas: notas.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ajust creat");
    setHoras(""); setNotas("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nou ajust manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Data</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Tipus</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vacaciones">Vacances</SelectItem>
                <SelectItem value="baja">Baixa</SelectItem>
                <SelectItem value="festivo">Festiu</SelectItem>
                <SelectItem value="otro">Altre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Hores</label>
            <Input type="number" step="0.25" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="ex. 8" />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel·lar</Button>
          <Button onClick={save} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}