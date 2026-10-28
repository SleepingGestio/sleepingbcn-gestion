import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ReservaDetail } from "@/components/reserva-detail";
import { AddReclamacionDialog } from "@/components/registro-reclamaciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CopyLinkIconButton,
  LEVEL_LABEL,
  LEVEL_TEXT,
  noLinkReason,
  RegistreEstadoBadge,
  ViajerosCell,
} from "@/components/partee-registre-bits";
import { usePermissions } from "@/hooks/use-permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fetchRegistreWindow, type RegistreRowFull } from "@/lib/partee-registre-api";
import {
  addDaysIso,
  alertLevel,
  countRooms,
  CANAL_LABEL,
  DEFAULT_SORT,
  ESTADO_LABEL,
  expectedViajeros,
  fmtAgo,
  isValidIso,
  reclamacionHint,
  SORT_OPTIONS,
  sortRows,
  todayMadrid,
  viajerosTone,
  type Alert,
  type ViajerosTone,
  type AlertLevel,
  type Expected,
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
  /** "Sin reclamar" / "Reclamado hace …" for warning/danger rows, else null. */
  hint: string | null;
  last: { enviada_en: string; canal: string | null } | null;
}

function toSortable({ r, alert, last }: Row): SortableRow {
  return {
    fecha_checkin: r.fecha_checkin,
    urgency: alert.priority,
    unit: r.apartamentos?.nombre ?? null,
    numero_reserva: r.numero_reserva,
    huesped: r.reservas_kb?.Referencia ?? null,
    portal: r.reservas_kb?.Portal ?? null,
    viajeros: r.num_viajeros,
    ultimo_sync: r.ultimo_sync,
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

function ReclamacionCell({
  hint,
  last,
  level,
  canClaim,
  onClaim,
}: {
  hint: string | null;
  last: Row["last"];
  level: AlertLevel;
  canClaim: boolean;
  onClaim: () => void;
}) {
  if (!hint && !canClaim) return <span className="text-xs text-muted-foreground">—</span>;
  const sin = hint === "Sin reclamar";
  return (
    <div className="flex flex-col items-start gap-1">
      {hint && (
        <span className={cn("text-xs", sin ? LEVEL_TEXT[level] : "text-muted-foreground")}>
          {hint}
          {!sin && last?.canal ? ` · ${CANAL_LABEL[last.canal] ?? last.canal}` : ""}
        </span>
      )}
      {canClaim && (
        <Button variant="outline" size="sm" onClick={onClaim}>
          Reclamar
        </Button>
      )}
    </div>
  );
}

type Quick = "danger" | "warning" | "sin_registro" | "borrador0" | "finalizado" | null;

const QUICK: { key: Exclude<Quick, null>; label: string; test: (x: Row) => boolean; tone: string }[] = [
  { key: "danger", label: "Urgentes", test: (x) => x.alert.level === "danger", tone: "text-red-700" },
  { key: "warning", label: "Avisos", test: (x) => x.alert.level === "warning", tone: "text-orange-700" },
  { key: "sin_registro", label: "Sin registro", test: (x) => x.r.estado === "sin_registro", tone: "" },
  {
    key: "borrador0",
    label: "Borrador sin viajeros",
    test: (x) => x.r.estado === "borrador" && !(x.r.num_viajeros ?? 0),
    tone: "",
  },
  { key: "finalizado", label: "Finalizados", test: (x) => x.r.estado === "finalizado", tone: "text-green-700" },
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

  const rangeOk = isValidIso(from) && isValidIso(to) && from <= to;
  const q = useQuery({
    queryKey: ["partee-registre-window", from, to],
    enabled: rangeOk,
    queryFn: () => fetchRegistreWindow(from, to),
  });

  const rows: Row[] = useMemo(() => {
    const now = new Date();
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
      const alert = alertLevel(r, { today, expected });
      const last = r.partee_reclamacio?.[0] ?? null;
      return {
        r,
        expected,
        alert,
        tone: viajerosTone(r, { today }, expected),
        hint: reclamacionHint(alert.level, last?.enviada_en ?? null, now),
        last,
      };
    });
  }, [q.data, today]);

  const units = useMemo(() => {
    const m = new Map<number, string>();
    for (const { r } of rows) m.set(r.id_apt, r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [rows]);

  // Filters other than the clickable counters; the counters are computed on this set.
  const base = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter(({ r, alert }) => {
      if (level !== ALL && alert.level !== level) return false;
      if (estado !== ALL && r.estado !== estado) return false;
      if (unit !== ALL && String(r.id_apt) !== unit) return false;
      if (t) {
        const hay = `${r.numero_reserva} ${r.reservas_kb?.Referencia ?? ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [rows, level, estado, unit, search]);

  const visible = useMemo(() => {
    const test = QUICK.find((c) => c.key === quick)?.test;
    const list = test ? base.filter(test) : base;
    // Stable client-side sort over the loaded rows (default: entry date asc, most urgent first).
    return sortRows(list, sortKey, sortDir, toSortable);
  }, [base, quick, sortKey, sortDir]);

  const lastSync = useMemo(() => {
    let max: string | null = null;
    for (const { r } of rows) if (r.ultimo_sync && (!max || r.ultimo_sync > max)) max = r.ultimo_sync;
    return max;
  }, [rows]);

  const counts = QUICK.map((c) => ({ ...c, n: base.filter(c.test).length }));

  return (
    <AppShell title="Registre hostes">
      <TooltipProvider delayDuration={200}>
        <div className="space-y-4">
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
            . La sincronización con Partee se ejecuta dos veces al día.
          </p>

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
              <div className="text-2xl font-semibold">{base.length}</div>
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
                {Object.entries(ESTADO_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
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
                    {visible.map(({ r, expected, alert, tone, hint, last }) => (
                      <TableRow key={r.id_registre}>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.fecha_checkin)}</TableCell>
                        <TableCell>{r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.numero_reserva}</TableCell>
                        <TableCell>{r.reservas_kb?.Referencia ?? "—"}</TableCell>
                        <TableCell>{r.reservas_kb?.Portal ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <RegistreEstadoBadge estado={r.estado} level={alert.level} />
                            <span className={cn("text-xs", LEVEL_TEXT[alert.level])}>{alert.label}</span>
                          </div>
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
                            hint={hint}
                            last={last}
                            level={alert.level}
                            canClaim={editor && r.estado !== "finalizado" && r.estado !== "anulado"}
                            onClaim={() => setReclamarFor(r.id_registre)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <CopyLinkIconButton url={r.checkin_url} noLinkReason={noLinkReason(r.estado)} />
                          <Button variant="ghost" size="icon" aria-label="Ver registro de huéspedes" onClick={() => setSelected(r.numero_reserva)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
                {visible.map(({ r, expected, alert, tone, hint, last }) => (
                  <Card key={r.id_registre}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{r.apartamentos?.nombre ?? `Apartamento ${r.id_apt}`}</div>
                          <div className="text-xs text-muted-foreground">
                            Entrada {fmtDate(r.fecha_checkin)} · salida {fmtDate(r.reservas_kb?.["Check-out"])}
                          </div>
                        </div>
                        <RegistreEstadoBadge estado={r.estado} level={alert.level} />
                      </div>
                      <div className={cn("text-sm", LEVEL_TEXT[alert.level])}>{alert.label}</div>
                      <ReclamacionCell
                        hint={hint}
                        last={last}
                        level={alert.level}
                        canClaim={editor && r.estado !== "finalizado" && r.estado !== "anulado"}
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
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">Sincronizado {fmtAgo(r.ultimo_sync)}</div>
                    </CardContent>
                  </Card>
                ))}
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
