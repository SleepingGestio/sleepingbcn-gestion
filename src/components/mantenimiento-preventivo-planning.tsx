import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate } from "@/lib/format";
import { fullName } from "@/lib/types";
import {
  ESTADO_FULL_STYLE,
  type GrupoLite,
  type EspacioLite,
  type PersonaLite,
} from "@/lib/mantenimiento";
import {
  buildPlanningColumns,
  buildPlanningRow,
  locationKey,
  locationLabel,
  incidenciaLocationKey,
  anulacionLocationKey,
  resolveConcreteLocations,
  todayISO,
  MES_LABELS_CORTO,
  MES_LABELS_LARGO,
  PREVENTIVO_COLOR_ANULADA,
  PREVENTIVO_COLOR_PROGRAMADA,
  PREVENTIVO_COLOR_PROXIMA,
  PREVENTIVO_COLOR_VENCIDA,
  periodicidadLabel,
  type AnulacionPreventiva,
  type AplicacionPreventiva,
  type ConcreteLocation,
  type IncidenciaPreventivaLite,
  type PlanningCellState,
  type TareaPreventivaConMeses,
} from "@/lib/mantenimiento-preventivo";
import type { AnularItem, GenerarItem } from "@/hooks/use-mantenimiento-preventivo";

const DONE_COLOR = ESTADO_FULL_STYLE.finalitzada.bg;
const GENERADO_COLOR = ESTADO_FULL_STYLE.pendent_validacio.bg;
const ASIGNADO_COLOR = ESTADO_FULL_STYLE.validada.bg;

function Dot({
  bg,
  border,
  fg,
  children,
  title,
}: {
  bg: string;
  border?: string;
  fg: string;
  children: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px] font-bold"
      style={{ backgroundColor: bg, color: fg, border: border ? `2px solid ${border}` : undefined }}
    >
      {children}
    </span>
  );
}

function Legend() {
  const items: { bg: string; border?: string; fg: string; label: string; char: string }[] = [
    { bg: DONE_COLOR, fg: "#fff", label: "Realizada", char: "✓" },
    { bg: GENERADO_COLOR, fg: "#fff", label: "Generada · sin asignar", char: "G" },
    { bg: ASIGNADO_COLOR, fg: "#fff", label: "Generada · asignada", char: "A" },
    {
      bg: "#E2E8F0",
      border: PREVENTIVO_COLOR_PROGRAMADA,
      fg: PREVENTIVO_COLOR_PROGRAMADA,
      label: "Programada · aún no vence",
      char: "•",
    },
    {
      bg: "#FEF3C7",
      border: PREVENTIVO_COLOR_PROXIMA,
      fg: PREVENTIVO_COLOR_PROXIMA,
      label: "Pendiente · próxima ventana",
      char: "?",
    },
    {
      bg: "#FEE2E2",
      border: PREVENTIVO_COLOR_VENCIDA,
      fg: "#7F1D1D",
      label: "Pendiente · vencida",
      char: "!",
    },
    {
      bg: "#F1F5F9",
      border: PREVENTIVO_COLOR_ANULADA,
      fg: PREVENTIVO_COLOR_ANULADA,
      label: "Anulada (temporalmente)",
      char: "✕",
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 py-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Dot bg={it.bg} border={it.border} fg={it.fg}>
            {it.char}
          </Dot>
          {it.label}
        </div>
      ))}
    </div>
  );
}

type PendingOrProgramadaCell = Extract<PlanningCellState, { type: "pending" | "programada" }>;

function GenerarCellPopover({
  location,
  cell,
  grupoById,
  espacioById,
  selected,
  onToggleSelect,
  onGenerarUno,
  onAnularUno,
}: {
  location: ConcreteLocation;
  cell: PendingOrProgramadaCell;
  grupoById: Map<number, { nombre: string }>;
  espacioById: Map<number, { nombre: string }>;
  selected: boolean;
  onToggleSelect: () => void;
  onGenerarUno: (fecha: string) => Promise<void>;
  /** Only meaningful (and only rendered) for cell.type === "programada". */
  onAnularUno?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(cell.targetDate);
  const [busy, setBusy] = useState(false);
  const [busyAnular, setBusyAnular] = useState(false);
  const { grupo, detalle } = locationLabel(location, grupoById, espacioById);
  const label =
    cell.mes != null
      ? `${grupo} · ${detalle} — ${MES_LABELS_LARGO[cell.mes]}`
      : `${grupo} · ${detalle}`;

  async function handleGenerar() {
    setBusy(true);
    await onGenerarUno(fecha);
    setBusy(false);
    setOpen(false);
  }

  async function handleAnular() {
    if (!onAnularUno) return;
    setBusyAnular(true);
    await onAnularUno();
    setBusyAnular(false);
    setOpen(false);
  }

  const isProgramada = cell.type === "programada";
  const isVencida = cell.type === "pending" && cell.estado === "vencida";
  const dotBg = isProgramada ? "#E2E8F0" : isVencida ? "#FEE2E2" : "#FEF3C7";
  const dotBorder = isProgramada
    ? PREVENTIVO_COLOR_PROGRAMADA
    : isVencida
      ? PREVENTIVO_COLOR_VENCIDA
      : PREVENTIVO_COLOR_PROXIMA;
  const dotFg = isProgramada
    ? PREVENTIVO_COLOR_PROGRAMADA
    : isVencida
      ? "#7F1D1D"
      : PREVENTIVO_COLOR_PROXIMA;
  const dotChar = isProgramada ? "•" : isVencida ? "!" : "?";
  const estadoText = isProgramada
    ? "Programada · aún no vence — generar ahora la adelanta"
    : `Pendiente de generar · ${isVencida ? "vencida" : "próxima ventana"}`;
  return (
    <div className="relative inline-flex">
      <Checkbox
        checked={selected}
        onCheckedChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="absolute -left-1 -top-1 z-10 h-3.5 w-3.5 bg-white"
        title="Seleccionar para acción en bloque"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button">
            <Dot bg={dotBg} border={dotBorder} fg={dotFg}>
              {dotChar}
            </Dot>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-sm space-y-2.5">
          <div className="font-semibold text-xs">{label}</div>
          <div className="text-xs text-muted-foreground">Estado: {estadoText}</div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Fecha prevista
            </div>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="w-full bg-[#26215C] hover:bg-[#1e1a48] text-white"
            disabled={busy}
            onClick={handleGenerar}
          >
            {busy ? "Generando…" : "Generar"}
          </Button>
          {isProgramada && onAnularUno && (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-slate-300 text-slate-600 hover:bg-slate-50"
              disabled={busyAnular}
              onClick={handleAnular}
            >
              {busyAnular ? "Anulando…" : "Anular"}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AnuladaCellPopover({
  location,
  cell,
  grupoById,
  espacioById,
  onDesanular,
  onAnularDefinitiva,
}: {
  location: ConcreteLocation;
  cell: Extract<PlanningCellState, { type: "anulada" }>;
  grupoById: Map<number, { nombre: string }>;
  espacioById: Map<number, { nombre: string }>;
  onDesanular: () => Promise<void>;
  onAnularDefinitiva: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { grupo, detalle } = locationLabel(location, grupoById, espacioById);
  const label = `${grupo} · ${detalle} — ${MES_LABELS_LARGO[cell.mes]}`;

  async function handleDesfer() {
    setBusy(true);
    await onDesanular();
    setBusy(false);
    setOpen(false);
  }

  async function handleConfirmarDefinitiva() {
    setBusy(true);
    await onAnularDefinitiva();
    setBusy(false);
    setConfirmOpen(false);
    setOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button">
            <Dot bg="#F1F5F9" border={PREVENTIVO_COLOR_ANULADA} fg={PREVENTIVO_COLOR_ANULADA}>
              ✕
            </Dot>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-sm space-y-2.5">
          <div className="font-semibold text-xs">{label}</div>
          <div className="text-xs text-muted-foreground">
            Estado: Anulada (temporalmente) — no se generará mientras esté anulada
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={handleDesfer}
          >
            {busy ? "Deshaciendo…" : "Desfer"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            Anular definitivamente
          </Button>
        </PopoverContent>
      </Popover>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-700">⚠ Anular definitivamente</DialogTitle>
            <DialogDescription>
              {label}. Esta acción no se puede deshacer: la ocurrencia dejará de mostrarse por
              completo (ni siquiera como anulada) y nunca volverá a generarse.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={busy}
              onClick={handleConfirmarDefinitiva}
            >
              {busy ? "Anulando…" : "Confirmar anulación definitiva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlanningRowView({
  tarea,
  location,
  incidenciasAtLocation,
  anulacionesAtLocation,
  columns,
  today,
  grupoById,
  espacioById,
  selected,
  onToggleSelect,
  onOpenIncidencia,
  onGenerarUno,
  onAnularUno,
  onDesanular,
  onAnularDefinitiva,
}: {
  tarea: TareaPreventivaConMeses;
  location: ConcreteLocation;
  incidenciasAtLocation: IncidenciaPreventivaLite[];
  anulacionesAtLocation: AnulacionPreventiva[];
  columns: { year: number; month: number }[];
  today: string;
  grupoById: Map<number, { nombre: string }>;
  espacioById: Map<number, { nombre: string }>;
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onOpenIncidencia: (id: number) => void;
  onGenerarUno: (location: ConcreteLocation, fecha: string) => Promise<void>;
  onAnularUno: (location: ConcreteLocation, anyo: number, mes: number) => Promise<void>;
  onDesanular: (idAnulacion: number) => Promise<void>;
  onAnularDefinitiva: (idAnulacion: number) => Promise<void>;
}) {
  const row = buildPlanningRow(
    tarea,
    location.scopeSince,
    incidenciasAtLocation,
    columns,
    today,
    anulacionesAtLocation,
  );
  const { grupo, detalle } = locationLabel(location, grupoById, espacioById);
  const locKey = locationKey(location);

  return (
    <tr>
      <td className="text-left py-2.5 pr-3.5 text-sm whitespace-nowrap border-b">
        <span className="font-medium">{grupo}</span>{" "}
        <span className="text-muted-foreground">· {detalle}</span>
      </td>
      {row.map((cell, i) => {
        const col = columns[i];
        return (
          <td key={i} className="py-1.5 px-1 text-center border-b relative">
            {cell.type === "done" && (
              <button
                type="button"
                onClick={() => onOpenIncidencia(cell.incidencia.id_incidencia)}
                title="Ver detalle"
              >
                <Dot bg={DONE_COLOR} fg="#fff">
                  ✓
                </Dot>
              </button>
            )}
            {cell.type === "generated" && (
              <button
                type="button"
                onClick={() => onOpenIncidencia(cell.incidencia.id_incidencia)}
                title="Ver / asignar"
              >
                <Dot bg={cell.asignada ? ASIGNADO_COLOR : GENERADO_COLOR} fg="#fff">
                  {cell.asignada ? "A" : "G"}
                </Dot>
              </button>
            )}
            {(cell.type === "pending" || cell.type === "programada") && (
              <GenerarCellPopover
                location={location}
                cell={cell}
                grupoById={grupoById}
                espacioById={espacioById}
                selected={selected.has(`${locKey}|${col.year}-${col.month}`)}
                onToggleSelect={() => onToggleSelect(`${locKey}|${col.year}-${col.month}`)}
                onGenerarUno={(fecha) => onGenerarUno(location, fecha)}
                onAnularUno={
                  cell.type === "programada"
                    ? () => onAnularUno(location, col.year, col.month)
                    : undefined
                }
              />
            )}
            {cell.type === "anulada" && (
              <AnuladaCellPopover
                location={location}
                cell={cell}
                grupoById={grupoById}
                espacioById={espacioById}
                onDesanular={() => onDesanular(cell.idAnulacion)}
                onAnularDefinitiva={() => onAnularDefinitiva(cell.idAnulacion)}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}

function PlanningTareaContent({
  tarea,
  aplicaciones,
  incidencias,
  anulaciones,
  apartamentos,
  grupoById,
  espacioById,
  workers,
  onOpenIncidencia,
  onGenerar,
  onAnular,
  onDesanular,
  onAnularDefinitiva,
}: {
  tarea: TareaPreventivaConMeses;
  aplicaciones: AplicacionPreventiva[];
  incidencias: IncidenciaPreventivaLite[];
  anulaciones: AnulacionPreventiva[];
  apartamentos: { id_apt: number; id_grupo: number | null; nombre: string; activo: boolean }[];
  grupoById: Map<number, { nombre: string }>;
  espacioById: Map<number, { nombre: string }>;
  workers: PersonaLite[];
  onOpenIncidencia: (id: number) => void;
  onGenerar: (items: GenerarItem[], asignarA?: number | null) => Promise<boolean>;
  onAnular: (items: AnularItem[]) => Promise<boolean>;
  onDesanular: (idAnulacion: number) => Promise<boolean>;
  onAnularDefinitiva: (idAnulacion: number) => Promise<boolean>;
}) {
  const today = todayISO();
  const columns = useMemo(() => buildPlanningColumns(today), [today]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [asignarWorker, setAsignarWorker] = useState<string>("");
  const [busyBulk, setBusyBulk] = useState(false);

  const aplicacionesTarea = useMemo(
    () => aplicaciones.filter((a) => a.id_tarea_preventiva === tarea.id_tarea_preventiva),
    [aplicaciones, tarea.id_tarea_preventiva],
  );
  const locations = useMemo(
    () =>
      resolveConcreteLocations(tarea.creado_en, aplicacionesTarea, apartamentos).sort((a, b) => {
        const la = locationLabel(a, grupoById, espacioById);
        const lb = locationLabel(b, grupoById, espacioById);
        return la.grupo.localeCompare(lb.grupo) || la.detalle.localeCompare(lb.detalle);
      }),
    [tarea.creado_en, aplicacionesTarea, apartamentos, grupoById, espacioById],
  );

  const incidenciasByLocKey = useMemo(() => {
    const m = new Map<string, IncidenciaPreventivaLite[]>();
    for (const i of incidencias) {
      if (i.id_tarea_preventiva !== tarea.id_tarea_preventiva) continue;
      const k = incidenciaLocationKey(i);
      const arr = m.get(k) ?? [];
      arr.push(i);
      m.set(k, arr);
    }
    return m;
  }, [incidencias, tarea.id_tarea_preventiva]);

  const anulacionesByLocKey = useMemo(() => {
    const m = new Map<string, AnulacionPreventiva[]>();
    for (const a of anulaciones) {
      if (a.id_tarea_preventiva !== tarea.id_tarea_preventiva) continue;
      const k = anulacionLocationKey(a);
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [anulaciones, tarea.id_tarea_preventiva]);

  // Rows/cells are keyed by `${locationKey}|${year}-${month}`; used both to
  // resolve which pending occurrence a selection refers to and to reset
  // selection whenever the visible pending set changes underneath it.
  function keyOf(loc: ConcreteLocation, year: number, month: number) {
    return `${locationKey(loc)}|${year}-${month}`;
  }

  const pendingByKey = useMemo(() => {
    const m = new Map<
      string,
      { location: ConcreteLocation; targetDate: string; type: "pending" | "programada" }
    >();
    for (const loc of locations) {
      const row = buildPlanningRow(
        tarea,
        loc.scopeSince,
        incidenciasByLocKey.get(locationKey(loc)) ?? [],
        columns,
        today,
        anulacionesByLocKey.get(locationKey(loc)) ?? [],
      );
      row.forEach((cell, i) => {
        if (cell.type === "pending" || cell.type === "programada") {
          m.set(keyOf(loc, columns[i].year, columns[i].month), {
            location: loc,
            targetDate: cell.targetDate,
            type: cell.type,
          });
        }
      });
    }
    return m;
  }, [locations, incidenciasByLocKey, anulacionesByLocKey, tarea, columns, today]);

  function toggleSelect(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedCells = useMemo(
    () =>
      Array.from(selected)
        .map((k) => pendingByKey.get(k))
        .filter((v): v is NonNullable<typeof v> => v != null),
    [selected, pendingByKey],
  );
  const selectionAllProgramada =
    selectedCells.length > 0 && selectedCells.every((v) => v.type === "programada");

  async function handleBulkGenerar(asignarA?: number | null) {
    const items: GenerarItem[] = selectedCells.map((v) => ({
      tarea,
      location: v.location,
      fechaPrevista: v.targetDate,
    }));
    if (items.length === 0) return;
    setBusyBulk(true);
    const ok = await onGenerar(items, asignarA ?? null);
    setBusyBulk(false);
    if (ok) {
      setSelected(new Set());
      setAsignarWorker("");
    }
  }

  async function handleBulkAnular() {
    if (!selectionAllProgramada) return;
    const items: AnularItem[] = selectedCells.map((v) => ({
      tarea,
      location: v.location,
      anyo: Number(v.targetDate.slice(0, 4)),
      mes: Number(v.targetDate.slice(5, 7)),
    }));
    if (items.length === 0) return;
    setBusyBulk(true);
    const ok = await onAnular(items);
    setBusyBulk(false);
    if (ok) setSelected(new Set());
  }

  async function handleGenerarUno(location: ConcreteLocation, fecha: string) {
    await onGenerar([{ tarea, location, fechaPrevista: fecha }]);
  }

  async function handleAnularUno(location: ConcreteLocation, anyo: number, mes: number) {
    await onAnular([{ tarea, location, anyo, mes }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xl font-bold">Planning anual · {tarea.nombre}</div>
        <div className="text-sm text-muted-foreground">{periodicidadLabel(tarea)}</div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/60 px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {selected.size} seleccionada{selected.size === 1 ? "" : "s"} —
          </span>
          <Button
            size="sm"
            className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
            disabled={busyBulk}
            onClick={() => handleBulkGenerar(null)}
          >
            Generar
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Generar y asignar a:</span>
            <Select value={asignarWorker} onValueChange={setAsignarWorker}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Selecciona persona…" />
              </SelectTrigger>
              <SelectContent>
                {workers.map((w) => (
                  <SelectItem key={w.id_persona} value={String(w.id_persona)}>
                    {fullName(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
              disabled={busyBulk || !asignarWorker}
              onClick={() => handleBulkGenerar(Number(asignarWorker))}
            >
              Confirmar
            </Button>
          </div>
          <span
            title={
              selectionAllProgramada
                ? undefined
                : "Anular solo aplica a celdas \"Programada\" — deselecciona las demás"
            }
          >
            <Button
              size="sm"
              variant="outline"
              className="border-slate-300 text-slate-600 hover:bg-slate-50"
              disabled={busyBulk || !selectionAllProgramada}
              onClick={handleBulkAnular}
            >
              Anular
            </Button>
          </span>
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <th className="w-[190px]" />
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-2 border-b"
                >
                  {MES_LABELS_CORTO[c.month]} {String(c.year).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-4 text-sm text-muted-foreground text-center"
                >
                  Esta tarea no tiene aplicaciones configuradas.
                </td>
              </tr>
            )}
            {locations.map((loc) => (
              <PlanningRowView
                key={locationKey(loc)}
                tarea={tarea}
                location={loc}
                incidenciasAtLocation={incidenciasByLocKey.get(locationKey(loc)) ?? []}
                anulacionesAtLocation={anulacionesByLocKey.get(locationKey(loc)) ?? []}
                columns={columns}
                today={today}
                grupoById={grupoById}
                espacioById={espacioById}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpenIncidencia={onOpenIncidencia}
                onGenerarUno={handleGenerarUno}
                onAnularUno={handleAnularUno}
                onDesanular={async (idAnulacion) => {
                  await onDesanular(idAnulacion);
                }}
                onAnularDefinitiva={async (idAnulacion) => {
                  await onAnularDefinitiva(idAnulacion);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Cada ✓ marca el mes en que se cerró realmente la tarea (no el mes programado). Desde aquí se
        gestiona todo el ciclo de vida: generar lo pendiente, asignar/reasignar y consultar el
        histórico — la cola de generación es solo lo pendiente.
      </div>
    </div>
  );
}

export function MantenimientoPreventivoPlanning({
  tareas,
  aplicaciones,
  incidencias,
  anulaciones,
  apartamentos,
  grupoById,
  espacioById,
  workers,
  selectedTareaId,
  onSelectTarea,
  onBack,
  onOpenIncidencia,
  onGenerar,
  onAnular,
  onDesanular,
  onAnularDefinitiva,
}: {
  tareas: TareaPreventivaConMeses[];
  aplicaciones: AplicacionPreventiva[];
  incidencias: IncidenciaPreventivaLite[];
  anulaciones: AnulacionPreventiva[];
  apartamentos: { id_apt: number; id_grupo: number | null; nombre: string; activo: boolean }[];
  grupoById: Map<number, GrupoLite>;
  espacioById: Map<number, EspacioLite>;
  workers: PersonaLite[];
  selectedTareaId: number | null;
  onSelectTarea: (id: number) => void;
  onBack: () => void;
  onOpenIncidencia: (id: number) => void;
  onGenerar: (items: GenerarItem[], asignarA?: number | null) => Promise<boolean>;
  onAnular: (items: AnularItem[]) => Promise<boolean>;
  onDesanular: (idAnulacion: number) => Promise<boolean>;
  onAnularDefinitiva: (idAnulacion: number) => Promise<boolean>;
}) {
  const tarea = tareas.find((t) => t.id_tarea_preventiva === selectedTareaId) ?? tareas[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        className="text-sm font-medium text-primary hover:underline self-start"
        onClick={onBack}
      >
        ← Volver a Mantenimiento preventivo
      </button>

      <div className="flex flex-wrap gap-2">
        {tareas.map((t) => (
          <button
            key={t.id_tarea_preventiva}
            type="button"
            onClick={() => onSelectTarea(t.id_tarea_preventiva)}
            className={`h-8 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap ${
              t.id_tarea_preventiva === tarea?.id_tarea_preventiva
                ? "bg-[#26215C] text-white border-[#26215C]"
                : "bg-white text-muted-foreground"
            }`}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      <Legend />
      <div className="text-xs text-muted-foreground -mt-2">
        Marca el ☐ de una o varias celdas "pendiente de generar" para generarlas juntas — "Anular"
        solo actúa cuando la selección es toda "Programada".
      </div>

      {tarea ? (
        <PlanningTareaContent
          key={tarea.id_tarea_preventiva}
          tarea={tarea}
          aplicaciones={aplicaciones}
          incidencias={incidencias}
          anulaciones={anulaciones}
          apartamentos={apartamentos}
          grupoById={grupoById}
          espacioById={espacioById}
          workers={workers}
          onOpenIncidencia={onOpenIncidencia}
          onGenerar={onGenerar}
          onAnular={onAnular}
          onDesanular={onDesanular}
          onAnularDefinitiva={onAnularDefinitiva}
        />
      ) : (
        <div className="text-sm text-muted-foreground">No hay tareas preventivas activas.</div>
      )}
    </div>
  );
}
