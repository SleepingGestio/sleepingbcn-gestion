import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchEventos, descartarEvento, confirmarEvento, fetchTemporadas,
  type Evento, type EventoAplicaA, type EventoCategoria, type EventoFase,
} from "@/lib/pricing";
import { CategoriaBadge, EventoEstadoBadge } from "@/components/pricing-badges";
import { EventoFormDialog } from "@/components/evento-form-dialog";
import { SortHeader } from "@/components/sort-header";
import { FilterField } from "@/components/filter-field";

type SortKey = "nombre" | "categoria" | "fechas" | "afluencia" | "ubicacion" | "efecto" | "min_noches" | "estado";

function sortValue(e: Evento, k: SortKey): string | number | null {
  switch (k) {
    case "nombre": return e.nombre;
    case "categoria": return e.categoria;
    case "fechas": return e.fecha_inicio;
    case "afluencia": return e.afluencia_estimada;
    case "ubicacion": return e.ubicacion;
    case "efecto": return e.valor;
    case "min_noches": return e.estancia_minima;
    case "estado": return e.estado;
  }
}

export const Route = createFileRoute("/pricing/eventos")({
  component: EventosPage,
});

function formatEfecto(valor: number | null, tipoValor: Evento["tipo_valor"]): string {
  if (valor == null) return "";
  if (tipoValor === "%") return `${valor > 0 ? "+" : ""}${valor}%`;
  return `${valor}€`;
}

const GRUPO_OPTIONS: { value: "todos" | EventoAplicaA; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "city", label: "City" },
  { value: "rural", label: "Rural" },
  { value: "ambos", label: "Ambos" },
];

const CATEGORIA_OPTIONS: { value: "todas" | EventoCategoria; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "feria", label: "Feria" },
  { value: "deporte", label: "Deporte" },
  { value: "cultura", label: "Cultura" },
  { value: "otro", label: "Otro" },
];

type RangoFilter = "todas" | "anio_actual" | "proximo_anio" | "ytd";

// "YTD" is a rolling 12-month window: today through the same calendar date next year.
const RANGO_OPTIONS: { value: RangoFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "anio_actual", label: "Año actual" },
  { value: "proximo_anio", label: "Próximo año" },
  { value: "ytd", label: "YTD" },
];

function EventosPage() {
  const { canEdit } = usePermissions();
  const canEditEventos = canEdit("pricing_eventos");

  const [grupoFilter, setGrupoFilter] = useState<"todos" | EventoAplicaA>("todos");
  const [categoriaFilter, setCategoriaFilter] = useState<"todas" | EventoCategoria>("todas");
  const [rangoFilter, setRangoFilter] = useState<RangoFilter>("ytd");
  const [incluirDescartados, setIncluirDescartados] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("fechas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [formOpen, setFormOpen] = useState<{ fase: EventoFase; parent: Evento | null } | null>(null);
  const [editTarget, setEditTarget] = useState<Evento | null>(null);
  const [descartarTarget, setDescartarTarget] = useState<Evento | null>(null);

  const q = useQuery({ queryKey: ["pricing-eventos"], queryFn: fetchEventos });
  const temporadasQ = useQuery({ queryKey: ["pricing-temporadas"], queryFn: fetchTemporadas });
  const temporadaById = useMemo(
    () => new Map((temporadasQ.data ?? []).map((t) => [t.id, t])),
    [temporadasQ.data],
  );

  const rows = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const toISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = toISO(now);
    // Same calendar date next year; Feb 29 has no counterpart, so it clamps to Feb 28.
    const nextYear = new Date(year + 1, now.getMonth(), now.getDate());
    if (nextYear.getMonth() !== now.getMonth()) nextYear.setDate(0);
    const oneYearAhead = toISO(nextYear);
    function passesRango(e: Evento): boolean {
      const f = e.fecha_inicio;
      switch (rangoFilter) {
        case "todas": return true;
        case "anio_actual": return f >= `${year}-01-01` && f <= `${year}-12-31`;
        case "proximo_anio": return f >= `${year + 1}-01-01` && f <= `${year + 1}-12-31`;
        case "ytd": return f >= today && f <= oneYearAhead;
      }
    }
    function passesFilters(e: Evento): boolean {
      if (!incluirDescartados && e.estado === "descartado") return false;
      // City/Rural also include "ambos" events; the "Ambos" option stays an exact match.
      if (grupoFilter !== "todos" && e.aplica_a !== grupoFilter) {
        if (grupoFilter === "ambos" || e.aplica_a !== "ambos") return false;
      }
      if (categoriaFilter !== "todas" && e.categoria !== categoriaFilter) return false;
      if (!passesRango(e)) return false;
      return true;
    }
    const eventos = q.data ?? [];
    // Only principal rows are sorted; each keeps its own previo/post children
    // around it: previo rows first, then the principal, then post rows
    // (children stay in fetch order within each group).
    const principales = eventos
      .filter((e) => e.fase === "principal")
      .sort((a, b) => {
        const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
        if (av == null || bv == null) return av == null && bv == null ? 0 : av == null ? 1 : -1;
        const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? c : -c;
      });
    const childrenByParent = new Map<string, Evento[]>();
    for (const e of eventos) {
      if (e.fase === "principal" || !e.evento_relacionado_id) continue;
      const list = childrenByParent.get(e.evento_relacionado_id) ?? [];
      list.push(e);
      childrenByParent.set(e.evento_relacionado_id, list);
    }
    // inGroup: the principal has visible previo/post rows, so the whole block
    // gets a left bracket; lastInGroup marks where the block's stronger divider goes.
    const out: { evento: Evento; isChild: boolean; inGroup: boolean; lastInGroup: boolean }[] = [];
    for (const p of principales) {
      if (!passesFilters(p)) continue;
      const children = (childrenByParent.get(p.id) ?? []).filter(passesFilters);
      const group: Evento[] = [
        ...children.filter((c) => c.fase === "previo"),
        p,
        ...children.filter((c) => c.fase === "post"),
      ];
      const inGroup = group.length > 1;
      group.forEach((e, i) =>
        out.push({ evento: e, isChild: e !== p, inGroup, lastInGroup: i === group.length - 1 }),
      );
    }
    return out;
  }, [q.data, grupoFilter, categoriaFilter, rangoFilter, incluirDescartados, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  async function handleConfirmar(e: Evento) {
    try {
      await confirmarEvento(e.id);
      toast.success("Evento confirmado");
      q.refetch();
    } catch (err) {
      toast.error("Error: " + (err as Error).message);
    }
  }

  async function confirmDescartar() {
    if (!descartarTarget) return;
    try {
      await descartarEvento(descartarTarget.id);
      toast.success("Evento descartado");
      setDescartarTarget(null);
      q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    }
  }

  return (
    <AppShell title="Eventos-calendario">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Grupo">
            <Select value={grupoFilter} onValueChange={(v) => setGrupoFilter(v as typeof grupoFilter)}>
              <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRUPO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Categoría">
            <Select value={categoriaFilter} onValueChange={(v) => setCategoriaFilter(v as typeof categoriaFilter)}>
              <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIA_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Rango">
            <Select value={rangoFilter} onValueChange={(v) => setRangoFilter(v as RangoFilter)}>
              <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <div className="flex items-center gap-2 h-9">
            <Checkbox
              id="incluir-descartados"
              checked={incluirDescartados}
              onCheckedChange={(v) => setIncluirDescartados(!!v)}
            />
            <Label htmlFor="incluir-descartados" className="text-sm font-normal cursor-pointer">
              Mostrar descartados
            </Label>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Evento" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} /></TableHead>
              <TableHead><SortHeader label="Categoría" active={sortKey === "categoria"} dir={sortDir} onClick={() => toggleSort("categoria")} /></TableHead>
              <TableHead><SortHeader label="Fechas" active={sortKey === "fechas"} dir={sortDir} onClick={() => toggleSort("fechas")} /></TableHead>
              <TableHead><SortHeader label="Afluencia" active={sortKey === "afluencia"} dir={sortDir} onClick={() => toggleSort("afluencia")} /></TableHead>
              <TableHead><SortHeader label="Ubicación" active={sortKey === "ubicacion"} dir={sortDir} onClick={() => toggleSort("ubicacion")} /></TableHead>
              <TableHead><SortHeader label="Efecto" active={sortKey === "efecto"} dir={sortDir} onClick={() => toggleSort("efecto")} /></TableHead>
              <TableHead><SortHeader label="Mín. noches" active={sortKey === "min_noches"} dir={sortDir} onClick={() => toggleSort("min_noches")} /></TableHead>
              <TableHead><SortHeader label="Estado" active={sortKey === "estado"} dir={sortDir} onClick={() => toggleSort("estado")} /></TableHead>
              {canEditEventos && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow>
                <TableCell colSpan={canEditEventos ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {q.error && (
              <TableRow>
                <TableCell colSpan={canEditEventos ? 9 : 8} className="text-center py-8 text-destructive">
                  {(q.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEditEventos ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  Sin eventos
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ evento: e, isChild, inGroup, lastInGroup }) => {
              const efecto = formatEfecto(e.valor, e.tipo_valor);
              const temporada = e.temporada_override_id ? temporadaById.get(e.temporada_override_id) : undefined;
              return (
                <TableRow
                  key={e.id}
                  className={cn(isChild && "bg-muted/30", inGroup && !lastInGroup && "border-b-border/40")}
                >
                  <TableCell
                    className={cn(
                      "font-medium",
                      inGroup && "border-l-[3px] border-l-primary/60",
                      isChild && "pl-8 font-normal text-muted-foreground",
                    )}
                  >
                    {isChild ? `↳ ${e.fase === "previo" ? "Previo" : "Post"}` : e.nombre}
                  </TableCell>
                  <TableCell><CategoriaBadge categoria={e.categoria} /></TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(e.fecha_inicio)} – {fmtDate(e.fecha_fin)}</TableCell>
                  <TableCell>
                    {e.afluencia_estimada != null ? e.afluencia_estimada : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={e.ubicacion ?? undefined}>
                    {e.ubicacion ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {efecto ? efecto
                      : temporada ? `→ ${temporada.codigo} (${temporada.nombre})`
                      : e.temporada_override_id ? <span className="text-muted-foreground">→ Temporada</span>
                      : <span className="text-muted-foreground">Sin fórmula</span>}
                  </TableCell>
                  <TableCell>
                    {e.estancia_minima != null ? e.estancia_minima : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><EventoEstadoBadge estado={e.estado} /></TableCell>
                  {canEditEventos && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setEditTarget(e)}>
                          Editar
                        </Button>
                        {!isChild && (
                          <>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setFormOpen({ fase: "previo", parent: e })}
                            >
                              + Previo
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setFormOpen({ fase: "post", parent: e })}
                            >
                              + Post
                            </Button>
                          </>
                        )}
                        {e.estado === "propuesto" && (
                          <>
                            <Button
                              size="sm" variant="ghost"
                              className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 hover:text-emerald-900"
                              onClick={() => handleConfirmar(e)}
                            >
                              Confirmar
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="bg-red-100 text-red-800 hover:bg-red-200 hover:text-red-900"
                              onClick={() => setDescartarTarget(e)}
                            >
                              Descartar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {formOpen && (
        <EventoFormDialog
          fase={formOpen.fase}
          parent={formOpen.parent}
          onClose={() => setFormOpen(null)}
          onSaved={() => q.refetch()}
        />
      )}

      {editTarget && (
        <EventoFormDialog
          fase={editTarget.fase}
          parent={
            editTarget.evento_relacionado_id
              ? (q.data ?? []).find((x) => x.id === editTarget.evento_relacionado_id) ?? null
              : null
          }
          evento={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => q.refetch()}
        />
      )}

      <AlertDialog open={!!descartarTarget} onOpenChange={(o) => !o && setDescartarTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar "{descartarTarget?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              El evento pasará a estado "Descartado" y dejará de aplicarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDescartar}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
