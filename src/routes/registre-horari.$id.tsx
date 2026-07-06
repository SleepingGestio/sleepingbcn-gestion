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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Search, Lock, LockOpen, Eye, Pencil } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { formatHHMM as fmtHours } from "@/lib/utils";
import { toast } from "sonner";
import { LimpiezaPopover, type Limpieza } from "@/components/limpieza-popover";
import { useCurrentPersonal } from "@/hooks/use-current-personal";

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

function fmtAjustSigned(h: number): { text: string; className: string } {
  if (h < 0) {
    return { text: `−${fmtHours(Math.abs(h))}`, className: "text-red-600" };
  }
  return { text: `+${fmtHours(h)}`, className: "text-emerald-600" };
}

function ajustCellText(r: { kind: RowKind; hores: number; tipus_computa?: "treballades" | "objectiu" | "ajust" | null }): string {
  if (r.kind !== "ajust") return fmtHours(r.hores);
  const tc = r.tipus_computa ?? "ajust";
  if (tc === "treballades") return `+${fmtHours(Math.abs(r.hores))}`;
  if (tc === "objectiu") return `−${fmtHours(Math.abs(r.hores))} obj.`;
  return fmtAjustSigned(r.hores).text;
}

function ajustCellClass(r: { kind: RowKind; hores: number; tipus_computa?: "treballades" | "objectiu" | "ajust" | null }): string {
  if (r.kind !== "ajust") return "";
  const tc = r.tipus_computa ?? "ajust";
  if (tc === "treballades") return "text-emerald-600";
  if (tc === "objectiu") return "text-amber-600";
  return fmtAjustSigned(r.hores).className;
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
  tipus_computa?: "treballades" | "objectiu" | "ajust" | null;
  raw: Record<string, unknown>;
};

type SortKey = "fecha" | "propietat" | "tipus" | "hores";

function DetallPage() {
  const { id } = Route.useParams();
  const idPersona = Number(id);
  const qc = useQueryClient();
  const { persona: currentPersona } = useCurrentPersonal();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const { start, end } = monthRange(year, month0);
  const [activeTab, setActiveTab] = useState<"mes" | "tancaments" | "vacances">("mes");

  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [ajustOpen, setAjustOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [limpiezaPopover, setLimpiezaPopover] = useState<null | {
    loadKey: number;
    apt: { id_apt: number; nombre: string; camas_fijas?: number | null; tiene_sofa_cama?: boolean | null };
    fecha: string;
    existing: Limpieza | null;
  }>(null);

  async function openRow(r: Row) {
    if (r.kind === "checkout" || r.kind === "extra_cr") {
      const raw = r.raw as { id_limpieza: number; id_apt: number };
      const [{ data: apt }, { data: full }] = await Promise.all([
        supabase
          .from("apartamentos")
          .select("id_apt, nombre, camas_fijas, tiene_sofa_cama")
          .eq("id_apt", raw.id_apt)
          .maybeSingle(),
        supabase.from("limpiezas").select("*").eq("id_limpieza", raw.id_limpieza).maybeSingle(),
      ]);
      if (!apt) { toast.error("Apartament no trobat"); return; }
      setLimpiezaPopover({
        loadKey: Date.now(),
        apt: {
          id_apt: apt.id_apt,
          nombre: apt.nombre ?? `Apt #${apt.id_apt}`,
          camas_fijas: (apt as { camas_fijas?: number | null }).camas_fijas ?? null,
          tiene_sofa_cama: (apt as { tiene_sofa_cama?: boolean | null }).tiene_sofa_cama ?? null,
        },
        fecha: r.fecha,
        existing: (full ?? { id_limpieza: raw.id_limpieza }) as unknown as Limpieza,
      });
      return;
    }
    setDetailRow(r);
  }

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
        .select("id_ajuste, id_persona, fecha, tipo, horas, notas, tipus_computa")
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
        tipus_computa: "treballades" | "objectiu" | "ajust" | null;
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
        tipus_computa: a.tipus_computa ?? "ajust",
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
    let worked = 0, otherAdjustments = 0, reductions = 0;
    let reductionTipo: string | null = null;
    for (const l of limpiezasQ.data ?? []) worked += diffHours(l.iniciada_en, l.finalizada_en);
    for (const r of genericQ.data ?? []) worked += diffHours(r.inici, r.fi);
    for (const a of ajustosQ.data ?? []) {
      const h = Number(a.horas ?? 0);
      const tc = a.tipus_computa ?? "ajust";
      if (tc === "treballades") {
        worked += h;
      } else if (tc === "objectiu") {
        reductions += Math.abs(h);
        if (!reductionTipo) reductionTipo = a.tipo;
      } else {
        otherAdjustments += h;
      }
    }
    const objective = activePeriodQ.data?.horas_objetivo_mes ?? null;
    const isAutonom = personaQ.data?.tipo_contrato === "autonomo";
    const baseObjective = objective != null ? Number(objective) : null;
    const effectiveObjective = baseObjective != null ? Math.max(0, baseObjective - reductions) : null;
    const saldo = !isAutonom && effectiveObjective != null ? worked - effectiveObjective + otherAdjustments : 0;
    return { worked, adjustments: otherAdjustments, reductions, reductionTipo, objective: baseObjective, effectiveObjective, isAutonom, saldo };
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
          {activeTab !== "vacances" && (
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
          )}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-semibold">{fullName}</h1>
          {contractLabel && <Badge variant="secondary">{contractLabel}</Badge>}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "mes" | "tancaments" | "vacances")} className="mb-4">
          <TabsList>
            <TabsTrigger value="mes">Mes en curs</TabsTrigger>
            <TabsTrigger value="tancaments">Tancaments</TabsTrigger>
            <TabsTrigger value="vacances">Vacances</TabsTrigger>
          </TabsList>

        <TabsContent value="mes" className="mt-4">
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
                         <tr className="border-b hover:bg-muted/40 cursor-pointer" onClick={() => openRow(r)}>
                          <td className="p-3">{fmtDate(r.fecha)}</td>
                          <td className="p-3">{r.kind === "ajust" ? "—" : fmtHM(r.inici)}</td>
                          <td className="p-3">{r.kind === "ajust" ? "—" : fmtHM(r.fi)}</td>
                          <td className="p-3">{r.propietat}</td>
                          <td className="p-3">
                            <RowTypeBadge kind={r.kind} label={r.tipus} />
                          </td>
                          <td className={`p-3 text-right tabular-nums ${ajustCellClass(r)}`}>
                            {ajustCellText(r)}
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

        {limpiezaPopover && (
          <LimpiezaPopover
            key={`${limpiezaPopover.apt.id_apt}|${limpiezaPopover.fecha}|${limpiezaPopover.existing?.id_limpieza ?? 0}|${limpiezaPopover.loadKey}`}
            open={!!limpiezaPopover}
            loadKey={limpiezaPopover.loadKey}
            onOpenChange={(o) => !o && setLimpiezaPopover(null)}
            apt={limpiezaPopover.apt}
            fecha={limpiezaPopover.fecha}
            existing={limpiezaPopover.existing}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["reg-horari-det-limpiezas", idPersona] });
            }}
          />
        )}

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
        </TabsContent>

        <TabsContent value="tancaments" className="mt-4">
          <TancamentsTab
            idPersona={idPersona}
            year={year}
            month0={month0}
            totals={totals}
            currentPersonaId={currentPersona?.id_persona ?? null}
          />
        </TabsContent>

        <TabsContent value="vacances" className="mt-4">
          <VacancesTab
            idPersona={idPersona}
            tipoContrato={personaQ.data?.tipo_contrato ?? null}
            currentPersonaId={currentPersona?.id_persona ?? null}
          />
        </TabsContent>
        </Tabs>
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
  if (isAutonom) {
    saldoBg = "#EBF4FD"; saldoFg = "#0C447C"; saldoText = fmtHours(worked);
  } else if (!hasObjective) {
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
        <div className="relative w-full" style={{ overflow: "visible" }}>
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
          {hasObjective && (
            <div
              className="absolute"
              style={{
                left: `${effPct}%`,
                top: -22,
                transform: "translateX(-50%)",
                fontSize: 11,
                color: "#26215C",
                fontWeight: 600,
                whiteSpace: "nowrap",
                background: "#fff",
                padding: "1px 4px",
                borderRadius: 3,
              }}
            >
              {fmtHours(effectiveObjective!)}
            </div>
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
  const [tipusComputa, setTipusComputa] = useState<"treballades" | "objectiu" | "ajust">("objectiu");
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
      tipus_computa: tipusComputa,
    } as never);
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
            <label className="text-sm font-medium">Com computa</label>
            <Select value={tipusComputa} onValueChange={(v) => setTipusComputa(v as "treballades" | "objectiu" | "ajust")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="treballades">Hores treballades no registrades</SelectItem>
                <SelectItem value="objectiu">Reducció d'objectiu (vacances/baixa)</SelectItem>
                <SelectItem value="ajust">Ajust de saldo</SelectItem>
              </SelectContent>
            </Select>
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

// ============================================================
// TANCAMENTS TAB
// ============================================================

type ResumRow = {
  id_resum: number;
  id_persona: number;
  any_mes: number;
  mes: number;
  horas_objetivo_base: number;
  horas_reduccion: number;
  horas_objetivo_efectiu: number;
  horas_treballades: number;
  horas_ajust_saldo: number;
  saldo_mes: number;
  saldo_acumulat_anterior: number;
  saldo_acumulat_fi: number;
  decisio_tancament: "liquidar" | "acumular" | null;
  cerrado: boolean;
  cerrado_en: string | null;
  cerrado_por: number | null;
  notas: string | null;
};

type TotalsShape = {
  worked: number;
  adjustments: number;
  reductions: number;
  reductionTipo: string | null;
  objective: number | null;
  effectiveObjective: number | null;
  isAutonom: boolean;
  saldo: number;
};

function saldoChipStyle(saldo: number, effectiveObjective: number | null): { bg: string; fg: string } {
  if (saldo >= 0) return { bg: "#E1F5EE", fg: "#085041" };
  const eff = effectiveObjective ?? 0;
  const deficitPct = eff > 0 ? Math.abs(saldo) / eff : 1;
  if (deficitPct >= 0.15) return { bg: "#FDEAEA", fg: "#A32D2D" };
  return { bg: "#FEF3E2", fg: "#B35C00" };
}

function TancamentsTab({
  idPersona, year, month0, totals, currentPersonaId,
}: {
  idPersona: number; year: number; month0: number; totals: TotalsShape; currentPersonaId: number | null;
}) {
  const qc = useQueryClient();
  const mes = month0 + 1;

  const currentMonthQ = useQuery({
    queryKey: ["resum-mes-current", idPersona, year, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_resum_mes" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .eq("any_mes", year)
        .eq("mes", mes)
        .maybeSingle();
      if (error) { console.warn(error); return null; }
      return (data ?? null) as ResumRow | null;
    },
  });

  const historyQ = useQuery({
    queryKey: ["resum-mes-history", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_resum_mes" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .order("any_mes", { ascending: false })
        .order("mes", { ascending: false });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as ResumRow[];
    },
  });

  // Previous month's accumulated balance
  const prevIdx = (() => {
    const d = new Date(year, month0 - 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  })();

  const prevAcumulat = useMemo(() => {
    const rows = historyQ.data ?? [];
    // Find latest closed month strictly before (year, mes)
    const sorted = [...rows]
      .filter((r) => r.cerrado && (r.any_mes < year || (r.any_mes === year && r.mes < mes)))
      .sort((a, b) => (b.any_mes - a.any_mes) || (b.mes - a.mes));
    return sorted[0]?.saldo_acumulat_fi ?? 0;
  }, [historyQ.data, year, mes]);

  const [detailRow, setDetailRow] = useState<ResumRow | null>(null);

  const closeMonth = useMutation({
    mutationFn: async (decisio: "liquidar" | "acumular") => {
      const saldoAcumulat = decisio === "liquidar" ? 0 : totals.saldo + Number(prevAcumulat);
      const payload = {
        id_persona: idPersona,
        any_mes: year,
        mes,
        horas_objetivo_base: totals.objective ?? 0,
        horas_reduccion: totals.reductions,
        horas_objetivo_efectiu: totals.effectiveObjective ?? 0,
        horas_treballades: totals.worked,
        horas_ajust_saldo: totals.adjustments,
        saldo_mes: totals.saldo,
        saldo_acumulat_anterior: Number(prevAcumulat),
        saldo_acumulat_fi: saldoAcumulat,
        decisio_tancament: decisio,
        cerrado: true,
        cerrado_en: new Date().toISOString(),
        cerrado_por: currentPersonaId,
      };
      const existing = currentMonthQ.data;
      if (existing) {
        const { error } = await supabase
          .from("personal_resum_mes" as never)
          .update(payload as never)
          .eq("id_resum", existing.id_resum);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("personal_resum_mes" as never)
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mes tancat");
      qc.invalidateQueries({ queryKey: ["resum-mes-current", idPersona] });
      qc.invalidateQueries({ queryKey: ["resum-mes-history", idPersona] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const cerrador = currentMonthQ.data?.cerrado_por;
  const cerradorNameQ = useQuery({
    queryKey: ["persona-name", cerrador],
    enabled: !!cerrador,
    queryFn: async () => {
      const { data } = await supabase.from("personal").select("nombre, apellidos").eq("id_persona", cerrador!).maybeSingle();
      return data ? `${(data as { nombre?: string }).nombre ?? ""} ${(data as { apellidos?: string }).apellidos ?? ""}`.trim() : "";
    },
  });

  const closed = currentMonthQ.data?.cerrado === true;
  const monthLabel = `${MONTH_CA[month0]} ${year}`;

  return (
    <div className="space-y-6">
      {/* Current month block */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {closed ? <Lock className="h-5 w-5 text-emerald-600" /> : <LockOpen className="h-5 w-5 text-amber-600" />}
            <span className="font-semibold capitalize">{monthLabel}</span>
            {closed ? (
              <span className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">Tancat</span>
            ) : (
              <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">Pendent</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {closed
              ? `Tancat el ${fmtDate(currentMonthQ.data?.cerrado_en ?? null)}${cerradorNameQ.data ? ` per ${cerradorNameQ.data}` : ""}`
              : "Proposta del sistema"}
          </div>
        </div>

        {totals.isAutonom ? (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Hores registrades</span>
              <span className="font-semibold tabular-nums">{fmtHours(totals.worked)}</span>
            </div>
            {!closed && (
              <div className="flex justify-end">
                <Button onClick={() => closeMonth.mutate("acumular")} disabled={closeMonth.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  Confirmar tancament
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-end gap-4">
              <div className="flex-1 min-w-0">
                <ClosureProgressBar
                  worked={closed ? currentMonthQ.data!.horas_treballades : totals.worked}
                  reductions={closed ? currentMonthQ.data!.horas_reduccion : totals.reductions}
                  baseObjective={closed ? currentMonthQ.data!.horas_objetivo_base : (totals.objective ?? 0)}
                  effectiveObjective={closed ? currentMonthQ.data!.horas_objetivo_efectiu : (totals.effectiveObjective ?? 0)}
                />
              </div>
              {(() => {
                const saldoVal = closed ? Number(currentMonthQ.data!.saldo_mes) : totals.saldo;
                const eff = closed ? Number(currentMonthQ.data!.horas_objetivo_efectiu) : (totals.effectiveObjective ?? 0);
                const st = saldoChipStyle(saldoVal, eff);
                return (
                  <div className="flex flex-col items-center shrink-0" style={{ minWidth: 72 }}>
                    <div className="rounded-full px-3 py-1 tabular-nums" style={{ background: st.bg, color: st.fg, fontSize: 16, fontWeight: 700 }}>
                      {fmtSigned(saldoVal)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">saldo mes</div>
                  </div>
                );
              })()}
            </div>

            <BreakdownRows
              baseObjective={closed ? currentMonthQ.data!.horas_objetivo_base : (totals.objective ?? 0)}
              reductions={closed ? currentMonthQ.data!.horas_reduccion : totals.reductions}
              reductionTipo={totals.reductionTipo}
              effectiveObjective={closed ? currentMonthQ.data!.horas_objetivo_efectiu : (totals.effectiveObjective ?? 0)}
              worked={closed ? currentMonthQ.data!.horas_treballades : totals.worked}
              adjustments={closed ? currentMonthQ.data!.horas_ajust_saldo : totals.adjustments}
              saldoMes={closed ? currentMonthQ.data!.saldo_mes : totals.saldo}
            />

            <div className="my-4 border-t" />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo acumulat anterior</span>
                <span className="tabular-nums font-medium">{fmtSigned(closed ? currentMonthQ.data!.saldo_acumulat_anterior : Number(prevAcumulat))}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {closed ? "Saldo acumulat final" : "Saldo acumulat si es confirma"}
                </span>
                {(() => {
                  const acc = closed ? currentMonthQ.data!.saldo_acumulat_fi : (totals.saldo + Number(prevAcumulat));
                  const st = saldoChipStyle(acc, totals.effectiveObjective);
                  return (
                    <div className="rounded-full px-3 py-1 tabular-nums" style={{ background: st.bg, color: st.fg, fontSize: 16, fontWeight: 700 }}>
                      {fmtSigned(acc)}
                    </div>
                  );
                })()}
              </div>
            </div>

            {!closed && (
              <div className="mt-5 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> Afegir ajust
                </Button>
                <div className="flex gap-2">
                  <Button
                    onClick={() => closeMonth.mutate("liquidar")}
                    disabled={closeMonth.isPending}
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    Liquidar i saldar
                  </Button>
                  <Button
                    onClick={() => closeMonth.mutate("acumular")}
                    disabled={closeMonth.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Confirmar (acumular)
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Historial de saldos acumulats</h3>
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left p-3">Mes</th>
                <th className="text-right p-3">Obj. efectiu</th>
                <th className="text-right p-3">Treballades</th>
                <th className="text-right p-3">Saldo mes</th>
                <th className="text-right p-3">Acumulat</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(historyQ.data ?? []).length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Sense historial.</td></tr>
              ) : (
                (historyQ.data ?? []).map((r) => (
                  <tr key={r.id_resum} className="border-b">
                    <td className="p-3 capitalize">{MONTH_CA[r.mes - 1]} {r.any_mes}</td>
                    <td className="p-3 text-right tabular-nums">
                      {fmtHours(Number(r.horas_objetivo_efectiu))}
                      {r.decisio_tancament === "liquidar" && <span className="ml-1 text-amber-600 text-xs">★ liquidat</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmtHours(Number(r.horas_treballades))}</td>
                    <td className={`p-3 text-right tabular-nums ${saldoColor(Number(r.saldo_mes))}`}>{fmtSigned(Number(r.saldo_mes))}</td>
                    <td className={`p-3 text-right tabular-nums ${saldoColor(Number(r.saldo_acumulat_fi))}`}>{fmtSigned(Number(r.saldo_acumulat_fi))}</td>
                    <td className="p-3">
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => setDetailRow(r)} aria-label="Veure detall">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {detailRow ? `${MONTH_CA[detailRow.mes - 1]} ${detailRow.any_mes}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-1 text-sm">
              <Field label="Objectiu base" value={fmtHours(Number(detailRow.horas_objetivo_base))} />
              <Field label="Reducció" value={`−${fmtHours(Number(detailRow.horas_reduccion))}`} />
              <Field label="Objectiu efectiu" value={fmtHours(Number(detailRow.horas_objetivo_efectiu))} />
              <Field label="Hores treballades" value={fmtHours(Number(detailRow.horas_treballades))} />
              <Field label="Ajust de saldo" value={fmtSigned(Number(detailRow.horas_ajust_saldo))} />
              <Field label="Saldo mes" value={fmtSigned(Number(detailRow.saldo_mes))} />
              <Field label="Acumulat anterior" value={fmtSigned(Number(detailRow.saldo_acumulat_anterior))} />
              <Field label="Acumulat final" value={fmtSigned(Number(detailRow.saldo_acumulat_fi))} />
              <Field label="Decisió" value={detailRow.decisio_tancament ?? "—"} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtSigned(h: number): string {
  if (h === 0) return "0h";
  return `${h > 0 ? "+" : "−"}${fmtHours(Math.abs(h))}`;
}

function saldoColor(h: number): string {
  if (h > 0) return "text-emerald-600";
  if (h < 0) return "text-red-600";
  return "text-muted-foreground";
}

function ClosureProgressBar({
  worked, reductions, baseObjective, effectiveObjective,
}: { worked: number; reductions: number; baseObjective: number; effectiveObjective: number }) {
  const BASE_PCT = 80;
  const has = baseObjective > 0;
  const effPct = has ? (effectiveObjective / baseObjective) * BASE_PCT : 0;
  const workedPct = has ? Math.min(100, (worked / baseObjective) * BASE_PCT) : 0;

  let color = "#1D9E75";
  if (has && worked < effectiveObjective) {
    const deficit = (effectiveObjective - worked) / (effectiveObjective || 1);
    color = deficit >= 0.15 ? "#E24B4A" : "#EF9F27";
  }

  return (
    <div className="relative w-full mb-4" style={{ overflow: "visible" }}>
      <div className="relative w-full" style={{ height: 10 }}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${effPct}%`, background: "#D3D1C7" }} />
        {has && reductions > 0 && (
          <div className="absolute inset-y-0" style={{ left: `${effPct}%`, width: `${Math.max(0, BASE_PCT - effPct)}%`, background: "#FAEEDA", borderLeft: "2px solid #EF9F27" }} />
        )}
      </div>
      <div className="relative w-full" style={{ height: 18 }}>
        <div className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-xs font-semibold text-white" style={{ width: `${workedPct}%`, background: color }}>
          {workedPct > 8 ? fmtHours(worked) : ""}
        </div>
      </div>
      {has && (
        <div className="absolute pointer-events-none" style={{ left: `${effPct}%`, top: 0, bottom: 0, width: 2, background: "#26215C", transform: "translateX(-1px)" }} />
      )}
      {has && (
        <div
          className="absolute"
          style={{
            left: `${effPct}%`,
            top: -22,
            transform: "translateX(-50%)",
            fontSize: 11,
            color: "#26215C",
            fontWeight: 600,
            whiteSpace: "nowrap",
            background: "#fff",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          {fmtHours(effectiveObjective)}
        </div>
      )}
    </div>
  );
}

function BreakdownRows({
  baseObjective, reductions, reductionTipo, effectiveObjective, worked, adjustments, saldoMes,
}: {
  baseObjective: number; reductions: number; reductionTipo: string | null;
  effectiveObjective: number; worked: number; adjustments: number; saldoMes: number;
}) {
  const redLabel = reductionTipo === "vacaciones" ? "vacances" : reductionTipo === "baja" ? "baixa" : reductionTipo ?? "";
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Objectiu base</span>
        <span className="tabular-nums">{fmtHours(baseObjective)}</span>
      </div>
      {reductions > 0 && (
        <div className="flex justify-between text-amber-700">
          <span>− {redLabel} (ajust objectiu)</span>
          <span className="tabular-nums">−{fmtHours(reductions)}</span>
        </div>
      )}
      <div className="border-t my-1" />
      <div className="flex justify-between font-medium">
        <span>Objectiu efectiu</span>
        <span className="tabular-nums">{fmtHours(effectiveObjective)}</span>
      </div>
      <div className="border-t my-1" />
      <div className="flex justify-between">
        <span className="text-muted-foreground">Hores treballades</span>
        <span className="tabular-nums">{fmtHours(worked)}</span>
      </div>
      {adjustments !== 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Ajust de saldo</span>
          <span className="tabular-nums">{fmtSigned(adjustments)}</span>
        </div>
      )}
      <div className="border-t my-1" />
      <div className="flex justify-between items-center">
        <span className="font-medium">Saldo del mes</span>
        {(() => {
          const st = saldoChipStyle(saldoMes, effectiveObjective);
          return (
            <div className="rounded-full px-3 py-1 tabular-nums" style={{ background: st.bg, color: st.fg, fontSize: 15, fontWeight: 700 }}>
              {fmtSigned(saldoMes)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ============================================================
// VACANCES TAB
// ============================================================

type VacAnyRow = {
  id_vac_any: number;
  id_persona: number;
  data_inici_any: string;
  data_fi_any: string;
  dies_assignats: number;
  hores_calculades: number;
  hores_assignades: number;
  notas: string | null;
  creado_por: number | null;
  creado_en: string;
};

type PeriodRow = {
  id_periodo: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  horas_objetivo_mes: number | null;
};

function addYears(dateISO: string, n: number): string {
  const d = new Date(dateISO);
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}
function addDays(dateISO: string, n: number): string {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function VacancesTab({
  idPersona, tipoContrato, currentPersonaId,
}: { idPersona: number; tipoContrato: string | null; currentPersonaId: number | null }) {
  const qc = useQueryClient();
  const isAutonom = tipoContrato === "autonomo";
  const [newOpen, setNewOpen] = useState(false);

  const vacsQ = useQuery({
    queryKey: ["vac-any", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_vacances_any" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .order("data_inici_any", { ascending: false });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as VacAnyRow[];
    },
    enabled: !isAutonom,
  });

  const periodsQ = useQuery({
    queryKey: ["all-periods", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_periodos_actividad")
        .select("id_periodo, fecha_inicio, fecha_fin, horas_objetivo_mes")
        .eq("id_persona", idPersona)
        .order("fecha_inicio", { ascending: true });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as PeriodRow[];
    },
    enabled: !isAutonom,
  });

  if (isAutonom) {
    return (
      <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Els autònoms no tenen dies de vacances assignats.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNewOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nou any
        </Button>
      </div>

      {(vacsQ.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Encara no hi ha cap any de vacances configurat.
        </div>
      ) : (
        (vacsQ.data ?? []).map((v) => (
          <VacYearCard key={v.id_vac_any} row={v} idPersona={idPersona} />
        ))
      )}

      <NouAnyModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        idPersona={idPersona}
        tipoContrato={tipoContrato}
        periods={periodsQ.data ?? []}
        existing={vacsQ.data ?? []}
        currentPersonaId={currentPersonaId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["vac-any", idPersona] });
          setNewOpen(false);
        }}
      />
    </div>
  );
}

function VacYearCard({ row, idPersona }: { row: VacAnyRow; idPersona: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const isActive = row.data_inici_any <= today && today <= row.data_fi_any;
  const isPast = row.data_fi_any < today;

  const consumedQ = useQuery({
    queryKey: ["vac-consumed", idPersona, row.data_inici_any, row.data_fi_any],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_ajuste, fecha, horas, notas")
        .eq("id_persona", idPersona)
        .eq("tipo", "vacaciones")
        .gte("fecha", row.data_inici_any)
        .lte("fecha", row.data_fi_any);
      if (error) { console.warn(error); return []; }
      return (data ?? []) as Array<{ id_ajuste: number; fecha: string; horas: number; notas: string | null }>;
    },
  });

  const consumed = (consumedQ.data ?? []).reduce((s, r) => s + Math.abs(Number(r.horas ?? 0)), 0);
  const assigned = Number(row.hores_calculades ?? row.hores_assignades ?? 0);
  const remaining = assigned - consumed;
  const pct = assigned > 0 ? Math.min(120, (consumed / assigned) * 100) : 0;

  let barColor = "#1D9E75";
  if (consumed > assigned) barColor = "#A32D2D";
  else if (assigned > 0 && consumed >= assigned) barColor = "#9CA3AF";
  else if (assigned > 0 && consumed >= 0.8 * assigned) barColor = "#EF9F27";

  const chipStyle = remaining >= 0
    ? { bg: "#E1F5EE", fg: "#085041" }
    : { bg: "#FDEAEA", fg: "#A32D2D" };

  const yearStart = new Date(row.data_inici_any).getFullYear();
  const yearEnd = new Date(row.data_fi_any).getFullYear();

  const status = isActive ? "Actiu" : isPast ? "Tancat" : "Futur";
  const statusClass = isActive
    ? "bg-emerald-100 text-emerald-800"
    : isPast ? "bg-gray-100 text-gray-700" : "bg-blue-100 text-blue-800";
  const advancedClass = consumed > assigned ? "bg-red-100 text-red-800" : "";

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Any contractual {yearStart}–{yearEnd}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${consumed > assigned ? advancedClass : statusClass}`}>
              {consumed > assigned ? "Avançades" : status}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fmtDate(row.data_inici_any)} → {fmtDate(row.data_fi_any)}
          </div>
        </div>
        {isPast ? (
          <Lock className="h-4 w-4 text-muted-foreground" />
        ) : (
          <button className="text-muted-foreground hover:text-foreground" aria-label="Editar">
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            Vac. {fmtHours(Number(row.hores_calculades))} assignades (≈ {row.dies_assignats} dies naturals)
          </div>
          <div className="relative w-full" style={{ overflow: "visible" }}>
            {/* Thin bar - assigned */}
            <div className="relative w-full" style={{ height: 10 }}>
              <div className="absolute inset-y-0 left-0" style={{ width: `80%`, background: "#D3D1C7" }} />
            </div>
            {/* Thick bar - consumed */}
            <div className="relative w-full" style={{ height: 18 }}>
              <div className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-xs font-semibold text-white"
                style={{ width: `${assigned > 0 ? (consumed / assigned) * 80 : 0}%`, background: barColor }}>
                {pct > 10 ? `${fmtHours(consumed)} consumides` : ""}
              </div>
            </div>
            {/* Vertical marker at 80% */}
            <div className="absolute pointer-events-none" style={{ left: `80%`, top: 0, bottom: 0, width: 2, background: "#26215C", transform: "translateX(-1px)" }} />
            <div
              className="absolute"
              style={{
                left: `80%`,
                top: -22,
                transform: "translateX(-50%)",
                fontSize: 11,
                color: "#26215C",
                fontWeight: 600,
                whiteSpace: "nowrap",
                background: "#fff",
                padding: "1px 4px",
                borderRadius: 3,
              }}
            >
              {fmtHours(Number(row.hores_calculades))}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-center" style={{ minWidth: 72 }}>
          <div className="rounded-full px-3 py-1 tabular-nums"
            style={{ background: chipStyle.bg, color: chipStyle.fg, fontSize: 16, fontWeight: 700 }}>
            {remaining >= 0 ? fmtHours(remaining) : `−${fmtHours(Math.abs(remaining))}`}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {remaining >= 0 ? "per gaudir" : "avançades"}
          </div>
        </div>
      </div>

      {(consumedQ.data ?? []).length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Consumit</div>
          <div className="space-y-1 text-sm">
            {(consumedQ.data ?? []).map((c) => (
              <div key={c.id_ajuste} className="flex justify-between">
                <span>{fmtDate(c.fecha)}{c.notas ? ` · ${c.notas}` : ""}</span>
                <span className="tabular-nums">{fmtHours(Math.abs(Number(c.horas ?? 0)))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NouAnyModal({
  open, onClose, idPersona, tipoContrato, periods, existing, currentPersonaId, onSaved,
}: {
  open: boolean; onClose: () => void; idPersona: number; tipoContrato: string | null;
  periods: PeriodRow[]; existing: VacAnyRow[]; currentPersonaId: number | null;
  onSaved: () => void;
}) {
  // Compute next contractual year based on earliest period start + number of existing years
  const earliest = periods[0]?.fecha_inicio ?? null;
  const nextYearIdx = existing.length; // 0-based offset from earliest
  const inici = earliest ? addYears(earliest, nextYearIdx) : new Date().toISOString().slice(0, 10);
  const fi = addDays(addYears(inici, 1), -1);

  const [dies, setDies] = useState<string>("30");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const horesPerMes = useMemo(() => {
    if (tipoContrato === "fijo_discontinuo") {
      // Sum horas_objetivo_mes of periods overlapping [inici, fi]
      let sum = 0;
      for (const p of periods) {
        const pi = p.fecha_inicio;
        const pf = p.fecha_fin ?? "9999-12-31";
        if (pf >= inici && pi <= fi) sum += Number(p.horas_objetivo_mes ?? 0);
      }
      return sum;
    }
    // Use active period (fecha_fin null) horas_objetivo_mes; fallback last period
    const active = periods.find((p) => !p.fecha_fin) ?? periods[periods.length - 1];
    return Number(active?.horas_objetivo_mes ?? 0);
  }, [tipoContrato, periods, inici, fi]);

  const diesN = Number(dies) || 0;
  const horesCalc = diesN * (horesPerMes / 30);

  async function save() {
    if (diesN <= 0) { toast.error("Dies han de ser > 0"); return; }
    setSaving(true);
    const { error } = await supabase.from("personal_vacances_any" as never).insert({
      id_persona: idPersona,
      data_inici_any: inici,
      data_fi_any: fi,
      dies_assignats: diesN,
      hores_calculades: horesCalc,
      hores_assignades: horesCalc,
      notas: notas.trim() || null,
      creado_por: currentPersonaId,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Any creat");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nou any de vacances</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Inici</label>
              <Input value={fmtDate(inici)} readOnly />
            </div>
            <div>
              <label className="text-sm font-medium">Fi</label>
              <Input value={fmtDate(fi)} readOnly />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Dies assignats</label>
            <Input type="number" value={dies} onChange={(e) => setDies(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground">
            Hores calculades: <span className="font-medium">{fmtHours(horesCalc)}</span>
            {" "}({fmtHours(horesPerMes)} / mes)
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
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