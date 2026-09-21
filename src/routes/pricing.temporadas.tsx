import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchTemporadas, copyTemporadasToYear, deleteTemporada, deleteTemporadasByYear, findCoverageGaps, type Temporada, type TemporadaAplicaA } from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { SortHeader } from "@/components/sort-header";
import { TemporadaDialog } from "@/components/temporada-dialog";
import { DiaSemanaTab } from "@/components/dia-semana-tab";

const firstInicio = (t: Temporada) =>
  t.temporada_periodos.map((p) => p.fecha_inicio).sort()[0] ?? "";

const MAX_CHIPS = 2;

function PeriodosSummary({ temporada }: { temporada: Temporada }) {
  const ps = [...temporada.temporada_periodos].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  if (ps.length === 0) return <span className="text-muted-foreground">—</span>;
  const label = (p: (typeof ps)[number]) =>
    `${fmtDate(p.fecha_inicio)} – ${fmtDate(p.fecha_fin)}${p.estancia_minima != null ? ` · mín. ${p.estancia_minima}` : ""}`;
  return (
    <div className="flex items-center gap-1 whitespace-nowrap" title={ps.map(label).join(", ")}>
      {ps.slice(0, MAX_CHIPS).map((p) => (
        <span key={p.id} className="rounded bg-muted px-1.5 py-0.5 text-xs">{label(p)}</span>
      ))}
      {ps.length > MAX_CHIPS && <span className="text-xs text-muted-foreground">+{ps.length - MAX_CHIPS}</span>}
    </div>
  );
}

type SortKey = "codigo" | "nombre" | "coeficiente" | "fechas";

export const Route = createFileRoute("/pricing/temporadas")({
  component: ConfiguracionTarifasPage,
});

type TabProps = { anio: number; aplicaA: TemporadaAplicaA; temporadas: Temporada[]; loading: boolean; error: Error | null; onSaved: () => void };

function TemporadasTab({ anio, aplicaA, temporadas: all, loading, error, onSaved }: TabProps) {
  const { canEdit } = usePermissions();
  const canEditTemporadas = canEdit("pricing_temporadas");

  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Temporada | null>(null);
  const [gaps, setGaps] = useState<{ desde: string; hasta: string }[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("fechas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const colSpan = canEditTemporadas ? 5 : 4;

  const temporadas = useMemo(() => {
    const pick = (t: Temporada) => {
      switch (sortKey) {
        case "codigo": return t.codigo;
        case "nombre": return t.nombre;
        case "coeficiente": return t.coeficiente;
        case "fechas": return firstInicio(t);
      }
    };
    return all.filter((t) => t.anio === anio && t.aplica_a === aplicaA).sort((a, b) => {
      const av = pick(a), bv = pick(b);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
  }, [all, anio, aplicaA, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteTemporada(deleteTarget.id);
      toast.success("Temporada eliminada");
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="flex justify-end gap-2 mb-4">
        <Button size="sm" variant="outline" onClick={() => setGaps(findCoverageGaps(temporadas, anio))}>
          <CalendarCheck className="h-4 w-4 mr-1" /> Comprobar cobertura
        </Button>
        {canEditTemporadas && (
          <Button size="sm" onClick={() => setDialog({ id: null })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva temporada
          </Button>
        )}
      </div>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Código" active={sortKey === "codigo"} dir={sortDir} onClick={() => toggleSort("codigo")} /></TableHead>
              <TableHead><SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} /></TableHead>
              <TableHead><SortHeader label="Coeficiente" active={sortKey === "coeficiente"} dir={sortDir} onClick={() => toggleSort("coeficiente")} /></TableHead>
              <TableHead><SortHeader label="Períodos" active={sortKey === "fechas"} dir={sortDir} onClick={() => toggleSort("fechas")} /></TableHead>
              {canEditTemporadas && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && temporadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Sin temporadas
                </TableCell>
              </TableRow>
            )}
            {temporadas.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.codigo}</TableCell>
                <TableCell>{t.nombre}</TableCell>
                <TableCell>{t.coeficiente}</TableCell>
                <TableCell><PeriodosSummary temporada={t} /></TableCell>
                {canEditTemporadas && (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ id: t.id })}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(t)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {dialog && (
        <TemporadaDialog
          key={dialog.id ?? "nueva"}
          temporada={dialog.id ? all.find((t) => t.id === dialog.id) ?? null : null}
          temporadasEnContexto={temporadas}
          defaultAnio={anio}
          aplicaA={aplicaA}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}

      <Dialog open={gaps !== null} onOpenChange={(o) => !o && setGaps(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cobertura {anio} · {aplicaA === "city" ? "City" : "Rural"}</DialogTitle>
            <DialogDescription className="sr-only">Resultado de la comprobación de cobertura del año</DialogDescription>
          </DialogHeader>
          {gaps?.length === 0 ? (
            <p className="text-sm">Todo el año está cubierto por alguna temporada</p>
          ) : (
            <ul className="text-sm space-y-1">
              {gaps?.map((g) => (
                <li key={g.desde}>Sin temporada asignada: {fmtDate(g.desde)} – {fmtDate(g.hasta)}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGaps(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar "{deleteTarget?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la temporada {deleteTarget?.codigo}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const TABS: { label: string; component: ComponentType<TabProps> }[] = [
  { label: "Temporadas", component: TemporadasTab },
  { label: "Días de la semana", component: DiaSemanaTab },
];

function ConfiguracionTarifasPage() {
  const { canEdit } = usePermissions();
  const canEditTemporadas = canEdit("pricing_temporadas");
  const q = useQuery({ queryKey: ["pricing-temporadas"], queryFn: fetchTemporadas });
  const all = useMemo(() => q.data ?? [], [q.data]);
  const [anioSel, setAnioSel] = useState<number | null>(null);
  const [aplicaA, setAplicaA] = useState<TemporadaAplicaA>("city");
  const [tab, setTab] = useState(0);
  const [nuevoAnioInput, setNuevoAnioInput] = useState<string | null>(null);
  const [deleteYear, setDeleteYear] = useState<number | null>(null);
  const [deleteAck, setDeleteAck] = useState(false);
  const [deletingYear, setDeletingYear] = useState(false);
  const [copyPrompt, setCopyPrompt] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  const dataYears = useMemo(() => [...new Set(all.map((t) => t.anio))], [all]);
  const thisYear = new Date().getFullYear();
  const anio = anioSel ?? (dataYears.includes(thisYear) ? thisYear : dataYears.length ? Math.max(...dataYears) : thisYear);
  const years = useMemo(() => [...new Set([...dataYears, anio])].sort((a, b) => b - a), [dataYears, anio]);
  const ActiveTab = TABS[tab].component;
  const suggestedYear = String((dataYears.length ? Math.max(...dataYears) : thisYear) + 1);
  const nuevoAnio = nuevoAnioInput || suggestedYear;
  const deleteCounts = useMemo(() => {
    const rows = all.filter((t) => t.anio === deleteYear);
    return { city: rows.filter((t) => t.aplica_a === "city").length, rural: rows.filter((t) => t.aplica_a === "rural").length };
  }, [all, deleteYear]);

  function addYear() {
    const y = Number(nuevoAnio);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) { toast.error("Año no válido"); return; }
    setNuevoAnioInput(null);
    if (dataYears.includes(y)) { setAnioSel(y); return; }
    if (dataYears.includes(y - 1)) setCopyPrompt(y);
    else setAnioSel(y);
  }

  function declineCopy() {
    if (copyPrompt == null || copying) return;
    setAnioSel(copyPrompt);
    setCopyPrompt(null);
  }

  async function confirmDeleteYear() {
    if (deleteYear == null) return;
    setDeletingYear(true);
    try {
      await deleteTemporadasByYear(deleteYear);
      toast.success(`Año ${deleteYear} eliminado`);
      await q.refetch();
      setAnioSel(null);
    } catch (e) {
      toast.error("Error al eliminar: " + (e as Error).message);
    } finally {
      setDeletingYear(false);
      setDeleteYear(null);
      setDeleteAck(false);
    }
  }

  async function confirmCopy() {
    if (copyPrompt == null) return;
    const y = copyPrompt;
    setCopying(true);
    try {
      const n = await copyTemporadasToYear(y - 1, y);
      toast.success(`${n} temporadas copiadas de ${y - 1} a ${y}`);
      await q.refetch();
      setAnioSel(y);
    } catch (e) {
      toast.error("Error al copiar: " + (e as Error).message);
    } finally {
      setCopying(false);
      setCopyPrompt(null);
    }
  }

  return (
    <AppShell title="Configuración Tarifas">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Año</span>
          <Select value={String(anio)} onValueChange={(v) => setAnioSel(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Input
            type="number"
            min={2000}
            max={2100}
            placeholder={suggestedYear}
            className="w-28"
            value={nuevoAnioInput ?? ""}
            onChange={(e) => setNuevoAnioInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addYear()}
          />
          <Button size="sm" variant="outline" onClick={addYear}>
            <Plus className="h-4 w-4 mr-1" /> Añadir año
          </Button>
          {canEditTemporadas && dataYears.includes(anio) && (
            <Button size="sm" variant="outline" onClick={() => { setDeleteAck(false); setDeleteYear(anio); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar año {anio}
            </Button>
          )}
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Grupo</span>
          <Select value={aplicaA} onValueChange={(v) => setAplicaA(v as TemporadaAplicaA)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="city">City</SelectItem>
              <SelectItem value="rural">Rural</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-1 border-b mb-4">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${i === tab ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ActiveTab
        anio={anio}
        aplicaA={aplicaA}
        temporadas={all}
        loading={q.isLoading}
        error={q.error as Error | null}
        onSaved={() => q.refetch()}
      />

      <AlertDialog open={copyPrompt != null} onOpenChange={(o) => !o && declineCopy()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Copiar los datos del año anterior?</AlertDialogTitle>
            <AlertDialogDescription>
              Se copiarán las temporadas de {copyPrompt != null ? copyPrompt - 1 : ""} (City y Rural) a {copyPrompt}, desplazando las fechas un año.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copying}>No copiar</AlertDialogCancel>
            <AlertDialogAction disabled={copying} onClick={(e) => { e.preventDefault(); void confirmCopy(); }}>
              Copiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteYear != null} onOpenChange={(o) => !o && !deletingYear && setDeleteYear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todo el año {deleteYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán todas las temporadas de {deleteYear} en City y Rural. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={deleteAck} onCheckedChange={(c) => setDeleteAck(c === true)} className="mt-0.5" />
            <span>
              Entiendo que se borrarán todas las temporadas de {deleteYear} ({deleteCounts.city} de City, {deleteCounts.rural} de Rural)
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingYear}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!deleteAck || deletingYear} onClick={(e) => { e.preventDefault(); void confirmDeleteYear(); }}>
              Eliminar año
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
