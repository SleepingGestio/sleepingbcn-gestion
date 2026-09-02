import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReservas } from "@/lib/reservas";
import {
  fetchApartamentosRef,
  fetchCanalesReserva,
  fetchIvaPct,
  fetchTarifasCobroCanal,
  fetchTarifasComisionOta,
  fetchTarifasLimpieza,
  type ApartamentoRef,
  type CanalReserva,
  type TarifaCobroCanal,
  type TarifaComisionOta,
  type TarifaLimpieza,
} from "@/lib/tarifas";
import { fetchReservaExtrasTotales } from "@/lib/reserva-extras";
import { comisionBase, computeComision, pagadoEstanciaEfectivo } from "@/lib/comisiones";
import type { Reserva } from "@/lib/types";
import type { Apartamento as ApartamentoGrupo } from "@/components/group-filter";
import { AppShell } from "@/components/app-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReservaDetail } from "@/components/reserva-detail";
import { EstadoBadge } from "@/components/estado-badge";
import { DateRangePicker, currentMonthRange } from "@/components/date-range-picker";
import { GroupFilterChips, useGroupFilter } from "@/components/group-filter";
import { usePermissions } from "@/hooks/use-permissions";
import { fmtDate, fmtEUR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check, Download } from "lucide-react";

export const Route = createFileRoute("/informe-economico")({
  component: InformeEconomicoPage,
});

// EPS de comparació en euros — evita que un residu de coma flotant (p. ex.
// 0.0000000004) faci aparèixer les columnes condicionals "Extra c/IVA" /
// "Net c/IVA" quan en realitat no hi ha cap import real.
const EPS = 0.005;

/** Fila calculada de l'informe económico. Disseny tancat amb Ramon el
 *  01/09/2026 (mockups v1→v4) — veure claude/disseny_informe_economico_columnes_2026-09-01.md
 *  al projecte per al detall complet de cada fórmula i per què. Resum:
 *   - "Total pagado cliente" = Pagado estancia + Pagado limpieza, MAI la
 *     Tasa turística (és independent de qualsevol càlcul, igual que al
 *     popover).
 *   - Comissió/IVA es calculen sobre "Total pagado cliente"; el desglossament
 *     "només estada" / "només neteja" surt d'aplicar la MATEIXA fórmula de
 *     comissió per separat a Pagado estancia i Pagado limpieza (és lineal,
 *     així que sempre sumen exactament al total — no és una aproximació).
 *   - Els extras "amb IVA" mai es reparteixen cap a "estada" ni "neteja":
 *     es queden en la seva pròpia parella de columnes (brut introduït al
 *     popover / net ja sense IVA) i només compten dins "TOTAL netos".
 */
type Fila = {
  numero: string;
  referencia: string | null;
  habitaciones: string | null;
  huespedes: number | null;
  portal: string | null;
  estado: string | null;
  enLimpieza: boolean | null;
  checkin: string | null;
  checkout: string | null;
  idGrupo: number | null;
  verificada: boolean;
  pagadoEstancia: number;
  pagadoLimpieza: number;
  tasaTuristica: number;
  totalPagadoCliente: number;
  pctOta: number | null;
  pctCobro: number | null;
  aplicaCobro: boolean;
  baseSinIva: number;
  iva: number;
  comisionOta: number;
  comisionCobro: number;
  liquidadoOta: number;
  ingresoNeto: number;
  extrasSinIva: number;
  extraConIvaBruto: number;
  netConIva: number;
  ingresoNetoEstada: number;
  limpiezaNeta: number;
  totalIngresosNetos: number;
  observaciones: string | null;
};

function calcularFila(
  r: Reserva,
  ivaPct: number,
  extrasMap: Map<string, { sinIva: number; conIva: number }>,
  canales: CanalReserva[] | undefined,
  apartamentosRef: ApartamentoRef[] | undefined,
  apartamentosGrupo: ApartamentoGrupo[] | undefined,
  tarifasLimpieza: TarifaLimpieza[] | undefined,
  tarifasComision: TarifaComisionOta[] | undefined,
  tarifasCobro: TarifaCobroCanal[] | undefined,
): Fila {
  const canal = canales?.find((c) => c.nombre === r["Portal"]);
  const modoComision = canal?.modo_comision ?? "bruto";
  const apto = r["Habitaciones"]
    ? apartamentosRef?.find((a) => a.nombre === r["Habitaciones"])
    : undefined;
  const aptoGrupo = r["Habitaciones"]
    ? apartamentosGrupo?.find((a) => a.nombre === r["Habitaciones"])
    : undefined;

  const propuestaLimpieza =
    apto?.id_categoria_limpieza != null
      ? (tarifasLimpieza?.find((t) => t.id_categoria_limpieza === apto.id_categoria_limpieza)
          ?.costo_limpieza ?? null)
      : null;
  const propuestaComision =
    apto?.id_tipo_licencia != null && canal?.id_canal != null
      ? (tarifasComision?.find(
          (t) => t.id_tipo_licencia === apto.id_tipo_licencia && t.id_canal === canal.id_canal,
        )?.pct_comision ?? null)
      : null;
  const propuestaCobro =
    canal?.id_canal != null
      ? (tarifasCobro?.find((t) => t.id_canal === canal.id_canal)?.pct_cobro ?? null)
      : null;

  const pctOta = r.gestio?.PctComisionOTA ?? propuestaComision;
  const pctCobro = r.gestio?.PctPorCobro ?? propuestaCobro;
  const pagadoLimpieza = r.gestio?.PagadoLimpieza ?? propuestaLimpieza ?? 0;
  const pagadoEstancia =
    pagadoEstanciaEfectivo(
      r.gestio?.PagadoEstancia,
      r["Cargo estancia"],
      r["Comisiones retenidas"],
    ) ?? 0;
  const tasaTuristicaKb = Number(r["Cargo tasa turística"]);
  const tasaTuristica =
    r.gestio?.TasaTuristica ?? (Number.isFinite(tasaTuristicaKb) ? tasaTuristicaKb : 0);

  // Base de comissió/IVA: NOMÉS estada + neteja — la Tasa turística queda
  // totalment fora de qualsevol càlcul (igual que al popover de detall).
  const totalPagadoCliente = comisionBase(pagadoEstancia, pagadoLimpieza);
  const comision = computeComision(modoComision, pctOta, pctCobro, totalPagadoCliente);
  const baseSinIva = totalPagadoCliente / (1 + ivaPct);
  const iva = totalPagadoCliente - baseSinIva;
  const liquidadoOta = totalPagadoCliente - comision.total;
  const ingresoNeto = baseSinIva - comision.total;

  // Desglossament "només estada" / "només neteja": la mateixa fórmula de
  // comissió aplicada per separat a cada import — és lineal, així que sempre
  // sumen exactament a ingresoNeto (mai una aproximació ni un repartiment
  // arbitrari).
  const comisionEstancia = computeComision(modoComision, pctOta, pctCobro, pagadoEstancia);
  const comisionLimpieza = computeComision(modoComision, pctOta, pctCobro, pagadoLimpieza);
  const ingresoNetoEstada = pagadoEstancia / (1 + ivaPct) - comisionEstancia.total;
  const limpiezaNeta = pagadoLimpieza / (1 + ivaPct) - comisionLimpieza.total;

  const extras = extrasMap.get(r["Número"]) ?? { sinIva: 0, conIva: 0 };
  const extrasSinIva = extras.sinIva;
  const extraConIvaBruto = extras.conIva;
  const netConIva = extraConIvaBruto / (1 + ivaPct);

  const totalIngresosNetos = ingresoNeto + extrasSinIva + netConIva;

  return {
    numero: r["Número"],
    referencia: r["Referencia"],
    habitaciones: r["Habitaciones"],
    huespedes: r["Huéspedes"],
    portal: r["Portal"],
    estado: r["Estado"],
    enLimpieza: r.gestio?.EnLimpieza ?? null,
    checkin: r["Check in"],
    checkout: r["Check-out"],
    idGrupo: aptoGrupo?.id_grupo ?? null,
    verificada: !!r.gestio?.CuentaVerificada,
    pagadoEstancia,
    pagadoLimpieza,
    tasaTuristica,
    totalPagadoCliente,
    pctOta,
    pctCobro,
    aplicaCobro: comision.aplicaCobro,
    baseSinIva,
    iva,
    comisionOta: comision.ota,
    comisionCobro: comision.cobro,
    liquidadoOta,
    ingresoNeto,
    extrasSinIva,
    extraConIvaBruto,
    netConIva,
    ingresoNetoEstada,
    limpiezaNeta,
    totalIngresosNetos,
    observaciones: r.gestio?.NotasGestio ?? null,
  };
}

/** Criteri d'inclusió (decidit 01/09/2026, substitueix l'antic
 *  "tot excepte Cancelada/No show"): una reserva surt a l'informe si ha fet
 *  check-out de veritat, O si Ramon l'ha marcada manualment com a
 *  "Cuenta verificada y cerrada" — això cobreix els casos esporàdics d'una
 *  reserva Cancelada/No show/Confirmada amb un càrrec real (p. ex. una
 *  cancel·lació no reemborsable) que sí que ha de comptar com a ingrés. El
 *  període (DateRangePicker) es filtra sempre per data de Check-out — veure
 *  fetchReservas({dateMode: "checkout"}) més avall — perquè aquest criteri
 *  tingui sentit per igual en tots els casos. */
function esIncluible(r: Reserva): boolean {
  return r["Estado"] === "Check-out realizado" || !!r.gestio?.CuentaVerificada;
}

const SUBTOTAL_KEYS = [
  "pagadoEstancia",
  "pagadoLimpieza",
  "tasaTuristica",
  "totalPagadoCliente",
  "baseSinIva",
  "iva",
  "comisionOta",
  "comisionCobro",
  "liquidadoOta",
  "ingresoNeto",
  "extrasSinIva",
  "extraConIvaBruto",
  "netConIva",
  "ingresoNetoEstada",
  "limpiezaNeta",
  "totalIngresosNetos",
] as const;

type Subtotal = Record<(typeof SUBTOTAL_KEYS)[number], number>;

function sumar(filas: Fila[]): Subtotal {
  const t = Object.fromEntries(SUBTOTAL_KEYS.map((k) => [k, 0])) as Subtotal;
  for (const f of filas) for (const k of SUBTOTAL_KEYS) t[k] += f[k];
  return t;
}

/** "15" → "15,00%"; "15.5" → "15,50%". Evita que un % amb residu de coma
 *  flotant (p. ex. vingut d'un càlcul, no d'un valor desat pla) es mostri
 *  amb un munt de decimals a la taula. */
function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Agrupa un array de files JA ordenat per apartament (tandes consecutives)
 *  en blocs { nombre, filas } — un bloc per cada tram consecutiu del mateix
 *  apartament. No fa cap ordenació pròpia: depèn que `filas` ja vingui
 *  ordenat per habitaciones abans de cridar-la. */
function agruparPorApartamento(filasGrupo: Fila[]): { nombre: string; filas: Fila[] }[] {
  const out: { nombre: string; filas: Fila[] }[] = [];
  for (const f of filasGrupo) {
    const nombre = f.habitaciones ?? "Sin apartamento";
    const last = out[out.length - 1];
    if (last && last.nombre === nombre) last.filas.push(f);
    else out.push({ nombre, filas: [f] });
  }
  return out;
}

function VerifBadge({ verificada }: { verificada: boolean }) {
  return verificada ? (
    <span
      title="Cuenta verificada y cerrada"
      aria-label="Cuenta verificada y cerrada"
      className="inline-grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-primary bg-primary text-primary-foreground shadow"
    >
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span
      title="Cuenta pendiente de verificar"
      aria-label="Cuenta pendiente de verificar"
      className="inline-block h-4 w-4 shrink-0 rounded-sm border border-muted-foreground/30"
    />
  );
}

/** Fila de subtotal/total reutilitzada per als 3 nivells (apartament, GRUP,
 *  gran total) — evita triplicar les ~20 cel·les numèriques (i el risc de
 *  desquadrar-les entre els 3 llocs en tocar-hi res). `labelColSpan` cobreix
 *  sempre el bloc "Identificación" (7 columnes). `tintExtra` (per defecte
 *  `true`) aplica el fons ambre de les 2 columnes condicionals — es passa
 *  `false` només al gran total (fons fosc), perquè l'ambre hi quedava com
 *  un pedaç estrany sobre el negre; a l'apartament i al GRUP es manté. */
function SubtotalRow({
  label,
  s,
  mostrarExtraConIva,
  className,
  tintExtra = true,
}: {
  label: string;
  s: Subtotal;
  mostrarExtraConIva: boolean;
  className?: string;
  tintExtra?: boolean;
}) {
  return (
    <TableRow className={className}>
      <TableCell colSpan={7}>{label}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.pagadoEstancia)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.pagadoLimpieza)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.tasaTuristica)}</TableCell>
      <TableCell className="text-right font-semibold">{fmtEUR(s.totalPagadoCliente)}</TableCell>
      <TableCell />
      <TableCell />
      <TableCell />
      <TableCell className="text-right">{fmtEUR(s.baseSinIva)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.iva)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.comisionOta)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.comisionCobro)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.liquidadoOta)}</TableCell>
      <TableCell className="text-right font-semibold">{fmtEUR(s.ingresoNeto)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.extrasSinIva)}</TableCell>
      {mostrarExtraConIva && (
        <TableCell className={cn("text-right", tintExtra && "bg-amber-50/60")}>
          {fmtEUR(s.extraConIvaBruto)}
        </TableCell>
      )}
      {mostrarExtraConIva && (
        <TableCell className={cn("text-right", tintExtra && "bg-amber-50/60")}>
          {fmtEUR(s.netConIva)}
        </TableCell>
      )}
      <TableCell className="text-right">{fmtEUR(s.ingresoNetoEstada)}</TableCell>
      <TableCell className="text-right">{fmtEUR(s.limpiezaNeta)}</TableCell>
      <TableCell className="text-right font-semibold">{fmtEUR(s.totalIngresosNetos)}</TableCell>
      <TableCell />
    </TableRow>
  );
}

// CSV amb ";" com a separador (no ",") perquè els números fan servir la coma
// com a decimal (format es-ES, igual que a pantalla) — amb "," com a
// separador, Excel llegiria cada import com dues columnes. BOM UTF-8 al
// davant perquè Excel interpreti bé els accents/ñ.
function csvCell(v: string | number): string {
  const s =
    typeof v === "number"
      ? v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : v;
  if (s.includes(";") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportarCsv(
  filas: Fila[],
  grupos: { id: number | null; nombre: string }[],
  total: Subtotal,
  range: { from: string; to: string },
  orden: "apartamento" | "fecha",
) {
  const headers = [
    "Check-out",
    "GRUP",
    "Apartamento",
    "PAX",
    "Portal",
    "Referencia",
    "Estado",
    "Pagado estancia",
    "Pagado limpieza",
    "Tasa turística",
    "Total pagado cliente",
    "Verificada",
    "% OTA",
    "% Cobro",
    "Base sin IVA",
    "IVA",
    "Comisión OTA",
    "Comisión cobro",
    "Liquidado OTA",
    "Ingreso neto",
    "Extras sin IVA",
    "Extra con IVA (bruto)",
    "Net con IVA",
    "Ingreso neto estancia",
    "Limpieza neta",
    "TOTAL ingresos netos",
    "Observaciones",
  ];
  const filaRow = (f: Fila, grupoNombre: string): (string | number)[] => [
    fmtDate(f.checkout),
    grupoNombre,
    f.habitaciones ?? "",
    f.huespedes ?? "",
    f.portal ?? "",
    f.referencia ?? "",
    f.estado ?? "",
    f.pagadoEstancia,
    f.pagadoLimpieza,
    f.tasaTuristica,
    f.totalPagadoCliente,
    f.verificada ? "Sí" : "No",
    f.pctOta ?? "",
    f.pctCobro ?? "",
    f.baseSinIva,
    f.iva,
    f.comisionOta,
    f.comisionCobro,
    f.liquidadoOta,
    f.ingresoNeto,
    f.extrasSinIva,
    f.extraConIvaBruto,
    f.netConIva,
    f.ingresoNetoEstada,
    f.limpiezaNeta,
    f.totalIngresosNetos,
    f.observaciones ?? "",
  ];
  const subtotalRow = (nombre: string, s: Subtotal): (string | number)[] => [
    "",
    "",
    "",
    "",
    "",
    "",
    `Subtotal ${nombre}`,
    s.pagadoEstancia,
    s.pagadoLimpieza,
    s.tasaTuristica,
    s.totalPagadoCliente,
    "",
    "",
    "",
    s.baseSinIva,
    s.iva,
    s.comisionOta,
    s.comisionCobro,
    s.liquidadoOta,
    s.ingresoNeto,
    s.extrasSinIva,
    s.extraConIvaBruto,
    s.netConIva,
    s.ingresoNetoEstada,
    s.limpiezaNeta,
    s.totalIngresosNetos,
    "",
  ];

  const rows: (string | number)[][] = [headers];
  for (const grupo of grupos) {
    const filasGrupo = filas.filter((f) => f.idGrupo === grupo.id);
    if (filasGrupo.length === 0) continue;
    if (orden === "apartamento") {
      for (const apt of agruparPorApartamento(filasGrupo)) {
        for (const f of apt.filas) rows.push(filaRow(f, grupo.nombre));
        rows.push(subtotalRow(`  ${apt.nombre}`, sumar(apt.filas)));
      }
    } else {
      for (const f of filasGrupo) rows.push(filaRow(f, grupo.nombre));
    }
    rows.push(subtotalRow(grupo.nombre, sumar(filasGrupo)));
  }
  rows.push(subtotalRow(`TOTAL (${filas.length} reservas)`, total));

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe_economico_${range.from}_${range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function InformeEconomicoPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState(currentMonthRange);
  const [orden, setOrden] = useState<"apartamento" | "fecha">("apartamento");
  // A diferència de la resta de pàgines, aquí el grup per defecte és "Todos"
  // (no "Por defecto") — un informe de diners no s'ha d'amagar cap grup.
  const filter = useGroupFilter("all");
  // Mateix permís que /reservas (no "informe_economico"): reservas_extras
  // està RLS-gated per can_edit_menu('reservas'), mentre que reservas_gestio
  // no té RLS — usar un permís diferent podria deixar editar uns camps i no
  // uns altres de forma confusa.
  const { canEdit } = usePermissions();
  const canEditReservas = canEdit("reservas");

  // Període sempre per data de Check-out (veure esIncluible més amunt) — no
  // Check-in com a la resta de l'app.
  const q = useQuery({
    queryKey: ["informe-economico-reservas", { from: range.from, to: range.to }],
    queryFn: () => fetchReservas({ from: range.from, to: range.to, dateMode: "checkout" }),
  });

  const canalesQ = useQuery({
    queryKey: ["canales-reserva-informe"],
    queryFn: fetchCanalesReserva,
  });
  const apartamentosRefQ = useQuery({
    queryKey: ["apartamentos-ref-informe"],
    queryFn: fetchApartamentosRef,
  });
  const tarifasLimpiezaQ = useQuery({
    queryKey: ["tarifas-limpieza-informe"],
    queryFn: fetchTarifasLimpieza,
  });
  const tarifasComisionQ = useQuery({
    queryKey: ["tarifas-comision-informe"],
    queryFn: fetchTarifasComisionOta,
  });
  const tarifasCobroQ = useQuery({
    queryKey: ["tarifas-cobro-informe"],
    queryFn: fetchTarifasCobroCanal,
  });
  const ivaPctQ = useQuery({ queryKey: ["iva-pct-informe"], queryFn: fetchIvaPct });

  const numeros = useMemo(() => (q.data ?? []).map((r) => r["Número"]), [q.data]);
  const extrasQ = useQuery({
    queryKey: ["extras-totales-informe", numeros],
    queryFn: () => fetchReservaExtrasTotales(numeros),
    enabled: numeros.length > 0,
  });

  const filas = useMemo(() => {
    if (!q.data) return [];
    const extrasMap = extrasQ.data ?? new Map();
    const ivaPct = ivaPctQ.data ?? 0.1;
    const incluibles = q.data.filter(
      (r) =>
        r["Habitaciones"] != null &&
        filter.allowedAptNames.has(r["Habitaciones"]) &&
        esIncluible(r),
    );
    return incluibles
      .map((r) =>
        calcularFila(
          r,
          ivaPct,
          extrasMap,
          canalesQ.data,
          apartamentosRefQ.data,
          filter.aptsQ.data,
          tarifasLimpiezaQ.data,
          tarifasComisionQ.data,
          tarifasCobroQ.data,
        ),
      )
      .sort((a, b) =>
        orden === "apartamento"
          ? (a.habitaciones ?? "").localeCompare(b.habitaciones ?? "") ||
            (a.checkout ?? "").localeCompare(b.checkout ?? "")
          : (a.checkout ?? "").localeCompare(b.checkout ?? ""),
      );
  }, [
    q.data,
    extrasQ.data,
    ivaPctQ.data,
    filter.allowedAptNames,
    filter.aptsQ.data,
    canalesQ.data,
    apartamentosRefQ.data,
    tarifasLimpiezaQ.data,
    tarifasComisionQ.data,
    tarifasCobroQ.data,
    orden,
  ]);

  // Columnes condicionals "Extra c/IVA" / "Net c/IVA": només es mostren si
  // el període té algun cas real — mai una columna buida sense sentit.
  const mostrarExtraConIva = useMemo(() => filas.some((f) => f.extraConIvaBruto > EPS), [filas]);
  const totalCols = 25 + (mostrarExtraConIva ? 2 : 0);

  // Grupos visibles (según el filtro), en su orden configurado, más un grupo
  // "Sin grupo" al final para cualquier apartamento sin id_grupo asignado.
  const grupos = useMemo(() => {
    const visibles = filter.visibleGrupos;
    const conFilas = visibles.filter((g) => filas.some((f) => f.idGrupo === g.id_grupo));
    const sinGrupo = filas.some((f) => f.idGrupo == null);
    return [
      ...conFilas.map((g) => ({ id: g.id_grupo, nombre: g.nombre })),
      ...(sinGrupo ? [{ id: null as number | null, nombre: "Sin grupo" }] : []),
    ];
  }, [filter.visibleGrupos, filas]);

  const total = useMemo(() => sumar(filas), [filas]);
  const loading = q.isLoading || extrasQ.isLoading;

  return (
    <AppShell title="Informe económico">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-1">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex items-center gap-1 rounded-lg border px-1.5 py-1 text-xs">
          <span className="pl-1 text-muted-foreground">Orden:</span>
          <button
            type="button"
            onClick={() => setOrden("apartamento")}
            className={cn(
              "px-2.5 py-1 rounded-full border transition-colors",
              orden === "apartamento"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white hover:bg-muted",
            )}
          >
            Apartamento
          </button>
          <button
            type="button"
            onClick={() => setOrden("fecha")}
            className={cn(
              "px-2.5 py-1 rounded-full border transition-colors",
              orden === "fecha"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white hover:bg-muted",
            )}
          >
            Fecha
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => exportarCsv(filas, grupos, total, range, orden)}
          disabled={loading || filas.length === 0}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Exportar a Excel
        </Button>
      </div>
      <div className="mb-3 text-[11px] text-muted-foreground">
        Periodo por fecha de Check-out. Incluye reservas con Check-out realizado, más cualquier otra
        marcada como "Cuenta verificada y cerrada" (p. ej. una cancelación con cargo retenido).
      </div>
      <GroupFilterChips {...filter} />

      <Card className="overflow-hidden bg-white">
        <Table className="[&_td]:whitespace-nowrap">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                colSpan={7}
                className="bg-slate-100 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Identificación
              </TableHead>
              <TableHead
                colSpan={7}
                className="bg-blue-50 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Datos validados
              </TableHead>
              <TableHead
                colSpan={4}
                className="bg-amber-50 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Cálculos
              </TableHead>
              <TableHead
                colSpan={1}
                className="bg-rose-50 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Liquidado
              </TableHead>
              <TableHead
                colSpan={mostrarExtraConIva ? 6 : 4}
                className="bg-purple-50 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Desglose neto
              </TableHead>
              <TableHead
                colSpan={1}
                className="bg-slate-200 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Total
              </TableHead>
              <TableHead
                colSpan={1}
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Notas
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Check-out</TableHead>
              <TableHead>GRUP</TableHead>
              <TableHead>Apartamento</TableHead>
              <TableHead>PAX</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Estado</TableHead>

              <TableHead className="text-right">Pagado estancia</TableHead>
              <TableHead className="text-right">Pagado limpieza</TableHead>
              <TableHead className="text-right">Tasa turíst.</TableHead>
              <TableHead className="text-right">Total pagado cliente</TableHead>
              <TableHead className="text-center">Verif.</TableHead>
              <TableHead className="text-right">% OTA</TableHead>
              <TableHead className="text-right">% Cobro</TableHead>

              <TableHead className="text-right">Base sin IVA</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Com. OTA €</TableHead>
              <TableHead className="text-right">Com. cobro €</TableHead>

              <TableHead className="text-right">Liquid. OTA</TableHead>

              <TableHead className="text-right">Ingrés net</TableHead>
              <TableHead className="text-right">Extras s/IVA</TableHead>
              {mostrarExtraConIva && (
                <TableHead className="text-right bg-amber-50/60">Extra c/IVA</TableHead>
              )}
              {mostrarExtraConIva && (
                <TableHead className="text-right bg-amber-50/60 font-semibold">Net c/IVA</TableHead>
              )}
              <TableHead className="text-right">Ingrés net estada</TableHead>
              <TableHead className="text-right">Neteja net</TableHead>

              <TableHead className="text-right">TOTAL netos</TableHead>

              <TableHead>Observaciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center py-8 text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {q.error && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center py-8 text-destructive">
                  {(q.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!loading && filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-center py-8 text-muted-foreground">
                  Sin reservas en este rango
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              grupos.map((grupo) => {
                const filasGrupo = filas.filter((f) => f.idGrupo === grupo.id);
                if (filasGrupo.length === 0) return null;
                const sub = sumar(filasGrupo);
                const bloques =
                  orden === "apartamento"
                    ? agruparPorApartamento(filasGrupo)
                    : [{ nombre: "", filas: filasGrupo }];
                return (
                  <Fragment key={grupo.id ?? "sin-grupo"}>
                    <TableRow className="bg-[#637863]/15 hover:bg-[#637863]/15">
                      <TableCell
                        colSpan={totalCols}
                        className="font-semibold text-xs uppercase tracking-wide text-[#3d4a3d]"
                      >
                        {grupo.nombre}
                      </TableCell>
                    </TableRow>
                    {bloques.map((bloque, i) => (
                      <Fragment key={`${grupo.id ?? "sin-grupo"}-${bloque.nombre}-${i}`}>
                        {bloque.filas.map((f) => (
                          <TableRow
                            key={f.numero}
                            className="cursor-pointer"
                            onClick={() => setSelected(f.numero)}
                          >
                            <TableCell>{fmtDate(f.checkout)}</TableCell>
                            <TableCell>{grupo.nombre}</TableCell>
                            <TableCell
                              className="max-w-[110px] truncate"
                              title={f.habitaciones ?? undefined}
                            >
                              {f.habitaciones ?? "—"}
                            </TableCell>
                            <TableCell>{f.huespedes ?? "—"}</TableCell>
                            <TableCell>{f.portal ?? "—"}</TableCell>
                            <TableCell
                              className="max-w-[130px] truncate"
                              title={f.referencia ?? undefined}
                            >
                              {f.referencia ?? "—"}
                            </TableCell>
                            <TableCell>
                              <EstadoBadge estado={f.estado} enLimpieza={f.enLimpieza} />
                            </TableCell>

                            <TableCell className="text-right">{fmtEUR(f.pagadoEstancia)}</TableCell>
                            <TableCell className="text-right">{fmtEUR(f.pagadoLimpieza)}</TableCell>
                            <TableCell className="text-right">{fmtEUR(f.tasaTuristica)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {fmtEUR(f.totalPagadoCliente)}
                            </TableCell>
                            <TableCell className="text-center">
                              <VerifBadge verificada={f.verificada} />
                            </TableCell>
                            <TableCell className="text-right">{fmtPct(f.pctOta)}</TableCell>
                            <TableCell className="text-right">
                              {f.aplicaCobro ? fmtPct(f.pctCobro) : "—"}
                            </TableCell>

                            <TableCell className="text-right">{fmtEUR(f.baseSinIva)}</TableCell>
                            <TableCell className="text-right">{fmtEUR(f.iva)}</TableCell>
                            <TableCell className="text-right">{fmtEUR(f.comisionOta)}</TableCell>
                            <TableCell className="text-right">
                              {f.aplicaCobro ? fmtEUR(f.comisionCobro) : "—"}
                            </TableCell>

                            <TableCell className="text-right">{fmtEUR(f.liquidadoOta)}</TableCell>

                            <TableCell className="text-right font-semibold">
                              {fmtEUR(f.ingresoNeto)}
                            </TableCell>
                            <TableCell className="text-right">{fmtEUR(f.extrasSinIva)}</TableCell>
                            {mostrarExtraConIva && (
                              <TableCell className="text-right bg-amber-50/60">
                                {fmtEUR(f.extraConIvaBruto)}
                              </TableCell>
                            )}
                            {mostrarExtraConIva && (
                              <TableCell className="text-right bg-amber-50/60 font-semibold">
                                {fmtEUR(f.netConIva)}
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              {fmtEUR(f.ingresoNetoEstada)}
                            </TableCell>
                            <TableCell className="text-right">{fmtEUR(f.limpiezaNeta)}</TableCell>

                            <TableCell className="text-right font-semibold">
                              {fmtEUR(f.totalIngresosNetos)}
                            </TableCell>

                            <TableCell
                              className="max-w-[170px] truncate"
                              title={f.observaciones ?? undefined}
                            >
                              {f.observaciones ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {orden === "apartamento" && (
                          <SubtotalRow
                            label={`Subtotal ${bloque.nombre} (${bloque.filas.length})`}
                            s={sumar(bloque.filas)}
                            mostrarExtraConIva={mostrarExtraConIva}
                            className="bg-slate-50 hover:bg-slate-50 text-[13px]"
                          />
                        )}
                      </Fragment>
                    ))}
                    <SubtotalRow
                      label={`Subtotal ${grupo.nombre} (${filasGrupo.length})`}
                      s={sub}
                      mostrarExtraConIva={mostrarExtraConIva}
                      className="bg-muted/30 hover:bg-muted/30 font-semibold"
                    />
                  </Fragment>
                );
              })}
            {!loading && filas.length > 0 && (
              <SubtotalRow
                label={`Total (${filas.length} reservas)`}
                s={total}
                mostrarExtraConIva={mostrarExtraConIva}
                className="bg-slate-900 text-white hover:bg-slate-900 font-semibold"
                tintExtra={false}
              />
            )}
          </TableBody>
        </Table>
      </Card>

      <ReservaDetail
        numero={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onSaved={() => {
          q.refetch();
          extrasQ.refetch();
        }}
        readOnly={!canEditReservas}
      />
    </AppShell>
  );
}
