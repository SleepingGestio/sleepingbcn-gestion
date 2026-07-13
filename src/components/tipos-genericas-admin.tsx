import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

type Tipus = {
  id_tipus: number;
  nombre: string;
  requiere_apartamento: boolean | null;
  computable_hores: boolean | null;
  actiu: boolean | null;
  orden: number | null;
  notas: string | null;
  creado_por: number | null;
  creado_en: string | null;
};

type Persona = { id_persona: number; nombre: string | null; apellidos: string | null };
type Apt = { id_apt: number; nombre: string | null };
type Registro = {
  id_registre: number;
  id_tipus: number;
  id_persona: number | null;
  id_apt: number | null;
  inici: string | null;
  hores_totals: number | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtDur(h: number | null): string {
  const v = h ?? 0;
  if (v <= 0) return "0h 0m";
  const hh = Math.floor(v);
  const mm = Math.round((v - hh) * 60);
  return `${hh}h ${mm}m`;
}

function personaName(p: Persona | undefined): string {
  if (!p) return "—";
  return [p.nombre, p.apellidos].filter(Boolean).join(" ").trim() || "—";
}

export function TiposGenericasAdmin() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Tipus | null>(null);
  const [recordsFor, setRecordsFor] = useState<Tipus | null>(null);

  const q = useQuery({
    queryKey: ["tipos-tarea-generica-all"],
    queryFn: async (): Promise<Tipus[]> => {
      const { data, error } = await supabase
        .from("tipos_tarea_generica")
        .select("id_tipus,nombre,requiere_apartamento,computable_hores,actiu,orden,notas,creado_por,creado_en")
        .order("orden", { ascending: true, nullsFirst: false })
        .order("id_tipus");
      if (error) throw error;
      return (data ?? []) as Tipus[];
    },
  });

  const personalQ = useQuery({
    queryKey: ["tipos-admin-personal"],
    queryFn: async (): Promise<Persona[]> => {
      const { data, error } = await supabase
        .from("personal")
        .select("id_persona,nombre,apellidos");
      if (error) throw error;
      return (data ?? []) as Persona[];
    },
  });

  const countsQ = useQuery({
    queryKey: ["tipos-admin-counts"],
    queryFn: async (): Promise<Record<number, number>> => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_tipus");
      if (error) throw error;
      const map: Record<number, number> = {};
      for (const r of (data ?? []) as { id_tipus: number }[]) {
        map[r.id_tipus] = (map[r.id_tipus] ?? 0) + 1;
      }
      return map;
    },
  });

  const personalById = useMemo(() => {
    const m = new Map<number, Persona>();
    for (const p of personalQ.data ?? []) m.set(p.id_persona, p);
    return m;
  }, [personalQ.data]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Gestiona la lista de tareas genéricas disponibles.
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva tarea
        </Button>
      </div>

      <div className="rounded-md border divide-y">
        {(q.data ?? []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Todavía no hay tipos definidos.
          </div>
        )}
        {(q.data ?? []).map((t) => (
          <div key={t.id_tipus} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 font-semibold uppercase tracking-wide text-sm">
              {t.nombre.toUpperCase()}
            </div>
            <span
              className={
                t.actiu
                  ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium"
                  : "inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2.5 py-0.5 text-xs font-medium"
              }
            >
              {t.actiu ? "Activa" : "Inactiva"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(t)}
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <CreateTaskModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        nextOrden={((q.data ?? []).reduce((m, t) => Math.max(m, t.orden ?? 0), 0)) + 1}
        onCreated={() => { q.refetch(); countsQ.refetch(); }}
      />

      <EditTaskModal
        tipus={editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        count={editing ? (countsQ.data?.[editing.id_tipus] ?? 0) : 0}
        createdBy={editing?.creado_por ? personalById.get(editing.creado_por) : undefined}
        onSaved={() => { q.refetch(); }}
        onOpenRecords={() => { if (editing) { setRecordsFor(editing); setEditing(null); } }}
      />

      <RecordsPanel
        tipus={recordsFor}
        onOpenChange={(open) => { if (!open) setRecordsFor(null); }}
        personalById={personalById}
      />
    </Card>
  );
}

function CreateTaskModal({
  open, onOpenChange, nextOrden, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextOrden: number;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [actiu, setActiu] = useState(true);
  const [busy, setBusy] = useState(false);
  const { persona } = useCurrentPersonal();

  function reset() { setNombre(""); setNotas(""); setActiu(true); }

  async function crear() {
    const n = nombre.toUpperCase().trim();
    if (!n) { toast.error("Indica un nombre"); return; }
    setBusy(true);
    const payload: Record<string, unknown> = {
      nombre: n,
      actiu,
      orden: nextOrden,
      notas: notas.trim() || null,
      creado_por: persona?.id_persona ?? null,
      creado_en: new Date().toISOString(),
    };
    const { error } = await supabase.from("tipos_tarea_generica").insert(payload);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Tarea creada");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea genérica</DialogTitle>
          <DialogDescription className="sr-only">Crear tarea genérica</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de la tarea"
              className="uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notas internas (opcional)</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Comentarios internos…"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer">Activa</Label>
            <Switch checked={actiu} onCheckedChange={setActiu} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={crear} disabled={busy || !nombre.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
            Crear tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTaskModal({
  tipus, onOpenChange, count, createdBy, onSaved, onOpenRecords,
}: {
  tipus: Tipus | null;
  onOpenChange: (v: boolean) => void;
  count: number;
  createdBy: Persona | undefined;
  onSaved: () => void;
  onOpenRecords: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [actiu, setActiu] = useState(true);
  const [busy, setBusy] = useState(false);

  // Sync on open / when tipus changes
  const openId = tipus?.id_tipus ?? null;
  useEffect(() => {
    setNombre(tipus?.nombre ?? "");
    setNotas(tipus?.notas ?? "");
    setActiu(!!tipus?.actiu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function guardar() {
    if (!tipus) return;
    const n = nombre.toUpperCase().trim();
    if (!n) { toast.error("Indica un nombre"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("tipos_tarea_generica")
      .update({ nombre: n, notas: notas.trim() || null, actiu })
      .eq("id_tipus", tipus.id_tipus);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Guardado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={!!tipus} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tarea</DialogTitle>
          <DialogDescription className="sr-only">Editar tarea genérica</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notas internas (opcional)</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer">Activa</Label>
            <Switch checked={actiu} onCheckedChange={setActiu} />
          </div>

          <div className="border-t pt-3 space-y-1 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground/70">Creada por:</span>{" "}
              {personaName(createdBy)}
            </div>
            <div>
              <span className="font-medium text-foreground/70">Fecha de creación:</span>{" "}
              {fmtDate(tipus?.creado_en ?? null)}
            </div>
            <div>
              <span className="font-medium text-foreground/70">Registros asociados:</span>{" "}
              <button
                type="button"
                onClick={onOpenRecords}
                className="text-blue-600 hover:underline font-medium"
              >
                {count} usos →
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordsPanel({
  tipus, onOpenChange, personalById,
}: {
  tipus: Tipus | null;
  onOpenChange: (v: boolean) => void;
  personalById: Map<number, Persona>;
}) {
  const q = useQuery({
    queryKey: ["tipus-records", tipus?.id_tipus],
    enabled: !!tipus,
    queryFn: async (): Promise<{ regs: Registro[]; apts: Apt[] }> => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_registre,id_tipus,id_persona,id_apt,inici,hores_totals")
        .eq("id_tipus", tipus!.id_tipus)
        .order("inici", { ascending: false });
      if (error) throw error;
      const regs = (data ?? []) as Registro[];
      const aptIds = Array.from(new Set(regs.map((r) => r.id_apt).filter((x): x is number => x != null)));
      let apts: Apt[] = [];
      if (aptIds.length) {
        const { data: aData } = await supabase
          .from("apartamentos")
          .select("id_apt,nombre")
          .in("id_apt", aptIds);
        apts = (aData ?? []) as Apt[];
      }
      return { regs, apts };
    },
  });

  const aptById = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of q.data?.apts ?? []) m.set(a.id_apt, a.nombre ?? "—");
    return m;
  }, [q.data]);

  return (
    <Dialog open={!!tipus} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wide">
            {tipus?.nombre?.toUpperCase() ?? "Registros"}
          </DialogTitle>
          <DialogDescription className="sr-only">Registros asociados</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {(q.data?.regs ?? []).length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {q.isLoading ? "Cargando…" : "Sin registros."}
            </div>
          )}
          <div className="divide-y">
            {(q.data?.regs ?? []).map((r) => (
              <div key={r.id_registre} className="grid grid-cols-12 gap-2 py-2 text-sm">
                <div className="col-span-4 truncate">
                  {personaName(r.id_persona ? personalById.get(r.id_persona) : undefined)}
                </div>
                <div className="col-span-3 text-muted-foreground">{fmtDate(r.inici)}</div>
                <div className="col-span-3 truncate">
                  {r.id_apt != null ? (aptById.get(r.id_apt) ?? "—") : "—"}
                </div>
                <div className="col-span-2 text-right tabular-nums">{fmtDur(r.hores_totals)}</div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
