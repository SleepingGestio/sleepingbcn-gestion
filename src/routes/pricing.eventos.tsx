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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchEventos, descartarEvento, confirmarEvento,
  type Evento, type EventoAplicaA, type EventoCategoria, type EventoFase,
} from "@/lib/pricing";
import { CategoriaBadge, AplicaABadge, EventoEstadoBadge } from "@/components/pricing-badges";
import { EventoFormDialog } from "@/components/evento-form-dialog";

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

function EventosPage() {
  const { canEdit } = usePermissions();
  const canEditEventos = canEdit("pricing_eventos");

  const [grupoFilter, setGrupoFilter] = useState<"todos" | EventoAplicaA>("todos");
  const [categoriaFilter, setCategoriaFilter] = useState<"todas" | EventoCategoria>("todas");
  const [incluirDescartados, setIncluirDescartados] = useState(false);

  const [formOpen, setFormOpen] = useState<{ fase: EventoFase; parent: Evento | null } | null>(null);
  const [editTarget, setEditTarget] = useState<Evento | null>(null);
  const [descartarTarget, setDescartarTarget] = useState<Evento | null>(null);

  const q = useQuery({ queryKey: ["pricing-eventos"], queryFn: fetchEventos });

  const rows = useMemo(() => {
    function passesFilters(e: Evento): boolean {
      if (!incluirDescartados && e.estado === "descartado") return false;
      if (grupoFilter !== "todos" && e.aplica_a !== grupoFilter) return false;
      if (categoriaFilter !== "todas" && e.categoria !== categoriaFilter) return false;
      return true;
    }
    const eventos = q.data ?? [];
    const principales = eventos.filter((e) => e.fase === "principal");
    const childrenByParent = new Map<string, Evento[]>();
    for (const e of eventos) {
      if (e.fase === "principal" || !e.evento_relacionado_id) continue;
      const list = childrenByParent.get(e.evento_relacionado_id) ?? [];
      list.push(e);
      childrenByParent.set(e.evento_relacionado_id, list);
    }
    const out: { evento: Evento; isChild: boolean }[] = [];
    for (const p of principales) {
      if (!passesFilters(p)) continue;
      out.push({ evento: p, isChild: false });
      const children = (childrenByParent.get(p.id) ?? []).filter(passesFilters);
      for (const c of children) out.push({ evento: c, isChild: true });
    }
    return out;
  }, [q.data, grupoFilter, categoriaFilter, incluirDescartados]);

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
    <AppShell title="Eventos">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={grupoFilter} onValueChange={(v) => setGrupoFilter(v as typeof grupoFilter)}>
            <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRUPO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoriaFilter} onValueChange={(v) => setCategoriaFilter(v as typeof categoriaFilter)}>
            <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIA_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
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
        {canEditEventos && (
          <Button size="sm" onClick={() => setFormOpen({ fase: "principal", parent: null })}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo evento
          </Button>
        )}
      </div>

      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Aplica a</TableHead>
              <TableHead>Efecto</TableHead>
              <TableHead>Mín. noches</TableHead>
              <TableHead>Estado</TableHead>
              {canEditEventos && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow>
                <TableCell colSpan={canEditEventos ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {q.error && (
              <TableRow>
                <TableCell colSpan={canEditEventos ? 8 : 7} className="text-center py-8 text-destructive">
                  {(q.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEditEventos ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  Sin eventos
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ evento: e, isChild }) => {
              const efecto = formatEfecto(e.valor, e.tipo_valor);
              return (
                <TableRow key={e.id} className={cn(isChild && "bg-muted/30")}>
                  <TableCell className={cn("font-medium", isChild && "pl-8 font-normal text-muted-foreground")}>
                    {isChild ? `↳ ${e.fase === "previo" ? "Previo" : "Post"}` : e.nombre}
                  </TableCell>
                  <TableCell><CategoriaBadge categoria={e.categoria} /></TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(e.fecha_inicio)} – {fmtDate(e.fecha_fin)}</TableCell>
                  <TableCell><AplicaABadge aplicaA={e.aplica_a} /></TableCell>
                  <TableCell>
                    {efecto ? efecto : <span className="text-muted-foreground">Sin fórmula</span>}
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
                            <Button size="sm" variant="ghost" onClick={() => handleConfirmar(e)}>
                              Confirmar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDescartarTarget(e)}>
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
          parent={null}
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
