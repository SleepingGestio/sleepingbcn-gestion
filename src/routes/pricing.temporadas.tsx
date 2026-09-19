import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchTemporadas, copyTemporadasToYear, type Temporada, type TemporadaAplicaA } from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { SortHeader } from "@/components/sort-header";
import { TemporadaDialog } from "@/components/temporada-dialog";

type SortKey = "codigo" | "nombre" | "coeficiente" | "fechas";

export const Route = createFileRoute("/pricing/temporadas")({
  component: ConfiguracionTarifasPage,
});

type TabProps = { anio: number; aplicaA: TemporadaAplicaA; temporadas: Temporada[]; loading: boolean; error: Error | null; onSaved: () => void };

function TemporadasTab({ anio, aplicaA, temporadas: all, loading, error, onSaved }: TabProps) {
  const { canEdit } = usePermissions();
  const canEditTemporadas = canEdit("pricing_temporadas");

  const [dialog, setDialog] = useState<{ temporada: Temporada | null } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("fechas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const colSpan = canEditTemporadas ? 5 : 4;

  const temporadas = useMemo(() => {
    const pick = (t: Temporada) => {
      switch (sortKey) {
        case "codigo": return t.codigo;
        case "nombre": return t.nombre;
        case "coeficiente": return t.coeficiente;
        case "fechas": return t.fecha_inicio;
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

  return (
    <>
      {canEditTemporadas && (
        <div className="flex justify-end mb-4">
          <Button size="sm" onClick={() => setDialog({ temporada: null })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva temporada
          </Button>
        </div>
      )}
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Código" active={sortKey === "codigo"} dir={sortDir} onClick={() => toggleSort("codigo")} /></TableHead>
              <TableHead><SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} /></TableHead>
              <TableHead><SortHeader label="Coeficiente" active={sortKey === "coeficiente"} dir={sortDir} onClick={() => toggleSort("coeficiente")} /></TableHead>
              <TableHead><SortHeader label="Fechas" active={sortKey === "fechas"} dir={sortDir} onClick={() => toggleSort("fechas")} /></TableHead>
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
                <TableCell className="whitespace-nowrap">{fmtDate(t.fecha_inicio)} – {fmtDate(t.fecha_fin)}</TableCell>
                {canEditTemporadas && (
                  <TableCell>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ temporada: t })}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
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
          key={dialog.temporada?.id ?? "nueva"}
          temporada={dialog.temporada}
          anio={anio}
          aplicaA={aplicaA}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

const TABS: { label: string; component: ComponentType<TabProps> }[] = [
  { label: "Temporadas", component: TemporadasTab },
];

function ConfiguracionTarifasPage() {
  const q = useQuery({ queryKey: ["pricing-temporadas"], queryFn: fetchTemporadas });
  const all = useMemo(() => q.data ?? [], [q.data]);
  const [anioSel, setAnioSel] = useState<number | null>(null);
  const [aplicaA, setAplicaA] = useState<TemporadaAplicaA>("city");
  const [tab, setTab] = useState(0);
  const [nuevoAnio, setNuevoAnio] = useState("");
  const [copyPrompt, setCopyPrompt] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  const dataYears = useMemo(() => [...new Set(all.map((t) => t.anio))], [all]);
  const thisYear = new Date().getFullYear();
  const anio = anioSel ?? (dataYears.includes(thisYear) ? thisYear : dataYears.length ? Math.max(...dataYears) : thisYear);
  const years = useMemo(() => [...new Set([...dataYears, anio])].sort((a, b) => b - a), [dataYears, anio]);
  const ActiveTab = TABS[tab].component;

  function addYear() {
    const y = Number(nuevoAnio);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) { toast.error("Año no válido"); return; }
    setNuevoAnio("");
    if (dataYears.includes(y)) { setAnioSel(y); return; }
    if (dataYears.includes(y - 1)) setCopyPrompt(y);
    else setAnioSel(y);
  }

  function declineCopy() {
    if (copyPrompt == null || copying) return;
    setAnioSel(copyPrompt);
    setCopyPrompt(null);
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
            placeholder="Nuevo año"
            className="w-28"
            value={nuevoAnio}
            onChange={(e) => setNuevoAnio(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addYear()}
          />
          <Button size="sm" variant="outline" onClick={addYear} disabled={!nuevoAnio}>
            <Plus className="h-4 w-4 mr-1" /> Añadir año
          </Button>
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
    </AppShell>
  );
}
