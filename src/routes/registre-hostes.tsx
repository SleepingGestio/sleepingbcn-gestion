import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Ban, ChevronsUpDown, Eye, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ReservaDetail } from "@/components/reserva-detail";
import { AddReclamacionDialog } from "@/components/registro-reclamaciones";
import { ExcluirReservaDialog, IncluirReservaDialog, useExclusiones } from "@/components/registro-exclusion";
import { RefreshButton } from "@/components/registro-refresh";
import { SyncTodoButton } from "@/components/registro-sync-todo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CopyLinkIconButton,
  LEVEL_LABEL,
  LEVEL_TEXT,
  noLinkReason,
  ReclamadoBadge,
  SituacionPill,
  ViajerosCell,
} from "@/components/partee-registre-bits";
import { usePermissions } from "@/hooks/use-permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fetchRegistreWindow, type Exclusion, type RegistreRowFull } from "@/lib/partee-registre-api";
import {
  addDaysIso,
  alertLevel,
  countRooms,
  DEFAULT_SORT,
  MOTIVO_EXCLUSION_LABEL,
  SITUACIONES_FILTRO,
  expectedViajeros,
  fmtAgo,
  isValidIso,
  isReclamable,
  SORT_OPTIONS,
  situacionRegistro,
  situacionTone,
  situacionTooltip,
  sortRows,
  todayMadrid,
  viajerosTone,
  type Alert,
  type ViajerosTone,
  type AlertLevel,
  type Expected,
  type Situacion,
  type SituacionTone,
  type SortableRow,
  type SortDir,
  type SortKey,
} from "@/lib/partee-registre";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/registre-hostes")({
  component: RegistreHostesPage,
});

interface Row {
  r: RegistreRowFull;
  expected: Expected;
  alert: Alert;
  tone: ViajerosTone;
  /** Latest reclamation and how many there are (embedded, newest first). */
  last: { enviada_en: string; canal: string | null } | null;
  count: number;
  /** "Reclamado N" badge + "Reclamar" button apply (something is still missing, not excluded). */
  reclamable: boolean;
  /** Fixed colour of the situation pill. */
  pillTone: SituacionTone;
  /** Row of partee_exclusion for this reservation (all its units), or null. */
  exclusion: Exclusion | null;
  /** The single visible label (No generado, Parcial, Completado, ...). */
  situacion: Situacion;
}

function toSortable({ r, alert, last, count, reclamable }: Row): SortableRow {
  return {
    fecha_checkin: r.fecha_checkin,
    urgency: alert.priority,
    unit: r.apartamentos?.nombre ?? null,
    numero_reserva: r.numero_reserva,
    huesped: r.reservas_kb?.Referencia ?? null,
    portal: r.reservas_kb?.Portal ?? null,
    viajeros: r.num_viajeros,
    ultimo_sync: r.ultimo_sync,
    reclamacionCount: reclamable ? count : null,
    lastReclamacionAt: last?.enviada_en ?? null,
  };
}

/** Clickable column header: a real button inside the th, with aria-sort on the th. */
function SortHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} />
      </button>
    </TableHead>
  );
}

/**
 * The row's single situation pill (color = alert level). Excluded reservations show
 * "Excluida · {motivo}". Only an overdue parte keeps a second line: it is a legal risk.
 */
function EstadoPill({ row }: { row: Row }) {
  const { r, alert, exclusion, situacion, expected, pillTone } = row;
  return (
    <div className="flex flex-col items-start gap-1">
      {exclusion ? (
        <Badge variant="secondary" className="whitespace-nowrap">
          Excluida · {MOTIVO_EXCLUSION_LABEL[exclusion.motivo] ?? exclusion.motivo}
        </Badge>
      ) : (
        <SituacionPill
          situacion={situacion}
          tone={pillTone}
          tooltip={situacionTooltip({ ...r, excluida: false }, expected)}
        />
      )}
      {alert.code === "vencido" && <span className={cn("text-xs", LEVEL_TEXT[alert.level])}>{alert.label}</span>}
    </div>
  );
}

/** Icon action: "No requiere registro" (reservation level) or, if already excluded, "Volver a incluir". */
function ExclusionAction({
  excluded,
  onExcluir,
  onIncluir,
}: {
  excluded: boolean;
  onExcluir: () => void;
  onIncluir: () => void;
}) {
  const label = excluded ? "Volver a incluir" : "No requiere registro";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={excluded ? onIncluir : onExcluir}>
          {excluded ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ReclamacionCell({
  row,
  canClaim,
  onClaim,
}: {
  row: Row;
  canClaim: boolean;
  onClaim: () => void;
}) {
  if (!row.reclamable) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReclamadoBadge count={row.count} last={row.last} tone={row.pillTone} />
      {canClaim && (
        <Button variant="outline" size="sm" onClick={onClaim}>
          Reclamar
        </Button>
      )}
    </div>
  );
}

type Quick = "danger" | "warning" | "no_generado" | "generado" | "finalizado" | null;

const QUICK: { key: Exclude<Quick, null>; label: string; test: (x: Row) => boolean; tone: string }[] = [
  { key: "danger", label: "Urgentes", test: (x) => x.alert.level === "danger", tone: "text-red-700" },
  { key: "warning", label: "Avisos", test: (x) => x.alert.level === "warning", tone: "text-orange-700" },
  { key: "no_generado", label: "No generado", test: (x) => x.situacion.code === "no_generado", tone: "" },
  {
    key: "generado",
    label: "Generado sin registros",
    test: (x) => x.situacion.code === "generado_sin_registros",
    tone: "",
  },
  { key: "finalizado", label: "Finalizados", test: (x) => x.situacion.code === "finalizado", tone: "text-green-700" },
];

const ALL = "all";

function RegistreHostesPage() {
  const { canEdit } = usePermissions();
  const today = todayMadrid();
  const [from, setFrom] = useState(() => addDaysIso(today, -7));
  const [to, setTo] = useState(() => addDaysIso(today, 14));
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<string>(ALL);
  const [estado, setEstado] = useState<string>(ALL);
  const [unit, setUnit] = useState<string>(ALL);
  const [quick, setQuick] = useState<Quick>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reclamarFor, setReclamarFor] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT.dir);
  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };
  const editor = canEdit("registre_hostes");
  const [showExcluidas, setShowExcluidas] = useState(false);
  const [excluirFor, setExcluirFor] = useState<string | null>(null);
  const [incluirFor, setIncluirFor] = useState<string | null>(null);
  const exclusiones = useExclusiones();

  const rangeOk = isValidIso(from) && isValidIso(to) && from <= to;
  const q = useQuery({
    queryKey: ["partee-registre-window", from, to],
    enabled: rangeOk,
    queryFn: () => fetchRegistreWindow(from, to),
  });

  const rows: Row[] = useMemo(() => {
    return (q.data ?? []).map((r) => {
      const kb = r.reservas_kb;
      const expected = expectedViajeros(
        {
          huespedes: kb?.["Huéspedes"],
          menores: kb?.["Huéspedes menores de edad"],
          exentos: kb?.["Huéspedes exentos"],
        },
        countRooms(kb?.Habitaciones),
      );
      const exclusion = exclusiones.map.get(r.numero_reserva) ?? null;
      const rowIn = { ...r, excluida: !!exclusion };
      const alert = alertLevel(rowIn, { today, expected });
      const situacion = situacionRegistro(rowIn, { expected });
      const reclamaciones = r.partee_reclamacio ?? [];
      const last = reclamaciones[0] ?? null;
      return {
        r,
        expected,
        alert,
        tone: viajerosTone(rowIn, { today }, expected),
        last,
        count: reclamaciones.length,
        reclamable: isReclamable(situacion),
        pillTone: situacionTone(situacion, rowIn, { today }),
        exclusion,
        situacion,
      };
    });
  }, [q.data, today, exclusiones.map]);

  const units = useMemo(() => {
    const m = new Map<number, string>();
    for (const { r } of rows) m.set(r.id_apt, r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [rows]);

  const excludedCount = useMemo(() => rows.filter((x) => x.exclusion).length, [rows]);

  // Filters other than the clickable counters. Excluded rows are only here when the switch is on.
  const base = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter(({ alert, exclusion, situacion, r }) => {
      if (exclusion && !showExcluidas) return false;
      if (level !== ALL && alert.level !== level) return false;
      if (estado !== ALL && situacion.code !== estado) return false;
      if (unit !== ALL && String(r.id_apt) !== unit) return false;
      if (t) {
        const hay = `${r.numero_reserva} ${r.reservas_kb?.Referencia ?? ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [rows, level, estado, unit, search, showExcluidas]);

  // Excluded rows never count: counters, the Total and the quick filters only see these.
  const counted = useMemo(() => base.filter((x) => !x.exclusion), [base]);

  const visible = useMemo(() => {
    const test = QUICK.find((c) => c.key === quick)?.test;
    const list = test ? counted.filter(test) : base;
    // Stable client-side sort over the loaded rows (default: entry date asc, most urgent first).
    return sortRows(list, sortKey, sortDir, toSortable);
  }, [base, counted, quick, sortKey, sortDir]);

  const lastSync = useMemo(() => {
    let max: string | null = null;
    for (const { r } of rows) if (r.ultimo_sync && (!max || r.ultimo_sync > max)) max = r.ultimo_sync;
    return max;
  }, [rows]);

  const counts = QUICK.map((c) => ({ ...c, n: counted.filter(c.test).length }));

  return (
    <AppShell title="Registre hostes">
      <TooltipProvider delayDuration={200}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Última sincronización:{" "}
              {lastSync ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      {fmtAgo(lastSync)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{fmtDateTime(lastSync)}</TooltipContent>
                </Tooltip>
              ) : (
                "—"
              )}
              . La sincronización con Partee se ejecuta de forma completa dos veces al día y de forma ligera cada hora, de 08:00 a 20:00.
            </p>
            <SyncTodoButton />
          </div>

          {/* Counters (click = filter) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {counts.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setQuick(quick === c.key ? null : c.key)}
                className={cn(
                  "rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent",
                  quick === c.key && "border-primary ring-1 ring-primary",
                )}
              >
                <div className={cn("text-2xl font-semibold", c.tone)}>{c.n}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQuick(null)}
              className={cn(
                "rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent",
                quick === null && "border-primary ring-1 ring-primary",
              )}
            >
              <div className="text-2xl font-semibold">{counted.length}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
            <Input
              placeholder="Reserva o huésped"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="col-span-2 lg:col-span-2"
            />
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue placeholder="Alerta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas las alertas</SelectItem>
                {(["danger", "warning", "info", "ok"] as AlertLevel[]).map((l) => (
                  <SelectItem key={l} value={l}>{LEVEL_LABEL[l]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los estados</SelectItem>
                {SITUACIONES_FILTRO.map((o) => (
                  <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger><SelectValue placeholder="Apartamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los apartamentos</SelectItem>
                {units.map(([id, nombre]) => (
                  <SelectItem key={id} value={String(id)}>{nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Entrada desde" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Entrada hasta" />
          </div>
          <p className="text-xs text-muted-foreground">
            Entradas del rango elegido; los partes anteriores sin finalizar se muestran siempre.
          </p>
          <div className="flex items-center gap-2">
            <Switch id="mostrar-excluidas" checked={showExcluidas} onCheckedChange={setShowExcluidas} />
            <Label htmlFor="mostrar-excluidas" className="text-sm">
              Mostrar excluidas ({excludedCount})
            </Label>
          </div>

          {!rangeOk ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Rango de fechas no válido.</CardContent></Card>
          ) : q.isLoading ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
          ) : q.error ? (
            <Card><CardContent className="py-8 text-center text-sm text-destructive">No se pudo cargar el registro de huéspedes.</CardContent></Card>
          ) : visible.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No hay registros que coincidan.</CardContent></Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Entrada" k="entrada" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Apartamento" k="apartamento" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Reserva" k="reserva" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Huésped" k="huesped" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Portal" k="portal" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Estado" k="urgencia" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Viajeros" k="viajeros" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Sincronizado" k="sync" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Reclamación" k="reclamacion" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => {
                      const { r, expected, tone, exclusion } = row;
                      return (
                        <TableRow key={r.id_registre} className={exclusion ? "opacity-60" : undefined}>
                          <TableCell className="whitespace-nowrap">{fmtDate(r.fecha_checkin)}</TableCell>
                          <TableCell>{r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.numero_reserva}</TableCell>
                          <TableCell>{r.reservas_kb?.Referencia ?? "—"}</TableCell>
                          <TableCell>{r.reservas_kb?.Portal ?? "—"}</TableCell>
                          <TableCell>
                            <EstadoPill row={row} />
                          </TableCell>
                          <TableCell><ViajerosCell n={r.num_viajeros} expected={expected} tone={tone} /></TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild><span className="cursor-help">{fmtAgo(r.ultimo_sync)}</span></TooltipTrigger>
                              <TooltipContent>{fmtDateTime(r.ultimo_sync)}</TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <ReclamacionCell
                              row={row}
                              canClaim={editor && row.reclamable}
                              onClaim={() => setReclamarFor(r.id_registre)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <CopyLinkIconButton url={r.checkin_url} noLinkReason={noLinkReason(r.estado)} />
                            <Button variant="ghost" size="icon" aria-label="Ver registro de huéspedes" onClick={() => setSelected(r.numero_reserva)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {editor && !exclusion && <RefreshButton numero={r.numero_reserva} compact />}
                            {editor && (
                              <ExclusionAction
                                excluded={!!exclusion}
                                onExcluir={() => setExcluirFor(r.numero_reserva)}
                                onIncluir={() => setIncluirFor(r.numero_reserva)}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile: sort control + cards */}
              <div className="flex items-center gap-2 md:hidden">
                <span className="shrink-0 text-xs text-muted-foreground">Ordenar por</span>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="flex-1" aria-label="Ordenar por">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={sortDir === "asc" ? "Orden ascendente" : "Orden descendente"}
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                >
                  {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </Button>
              </div>
              <div className="space-y-2 md:hidden">
                {visible.map((row) => {
                  const { r, expected, tone, exclusion } = row;
                  return (
                    <Card key={r.id_registre} className={exclusion ? "opacity-60" : undefined}>
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`}</div>
                            <div className="text-xs text-muted-foreground">
                              Entrada {fmtDate(r.fecha_checkin)} · salida {fmtDate(r.reservas_kb?.["Check-out"])}
                            </div>
                          </div>
                          <EstadoPill row={row} />
                        </div>
                        <ReclamacionCell
                          row={row}
                          canClaim={editor && row.reclamable}
                          onClaim={() => setReclamarFor(r.id_registre)}
                        />
                        <div className="text-xs text-muted-foreground">
                          {r.numero_reserva} · {r.reservas_kb?.Referencia ?? "—"} · {r.reservas_kb?.Portal ?? "—"}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <ViajerosCell n={r.num_viajeros} expected={expected} tone={tone} />
                          <div className="flex items-center">
                            <CopyLinkIconButton url={r.checkin_url} noLinkReason={noLinkReason(r.estado)} />
                            <Button variant="ghost" size="icon" aria-label="Ver registro de huéspedes" onClick={() => setSelected(r.numero_reserva)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {editor && !exclusion && <RefreshButton numero={r.numero_reserva} compact />}
                            {editor && (
                              <ExclusionAction
                                excluded={!!exclusion}
                                onExcluir={() => setExcluirFor(r.numero_reserva)}
                                onIncluir={() => setIncluirFor(r.numero_reserva)}
                              />
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground">Sincronizado {fmtAgo(r.ultimo_sync)}</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </TooltipProvider>

      <AddReclamacionDialog
        idRegistre={reclamarFor}
        open={reclamarFor != null}
        onOpenChange={(o) => !o && setReclamarFor(null)}
      />

      <ExcluirReservaDialog
        numero={excluirFor}
        current={excluirFor ? exclusiones.map.get(excluirFor) ?? null : null}
        open={excluirFor != null}
        onOpenChange={(o) => !o && setExcluirFor(null)}
      />
      <IncluirReservaDialog
        numero={incluirFor}
        open={incluirFor != null}
        onOpenChange={(o) => !o && setIncluirFor(null)}
      />

      <ReservaDetail
        numero={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        readOnly={!canEdit("reservas")}
        initialTab="huespedes"
      />
    </AppShell>
  );
}
