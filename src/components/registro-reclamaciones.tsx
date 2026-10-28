// Reclamations of a Partee registration + manual "registro completo" confirmation.
// Writes: partee_reclamacio (insert/delete) and ONLY the 4 registro_confirmado* columns of
// partee_registre (column-level grant). Actions are visible to editors of 'registre_hostes'.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePersonalLite } from "@/hooks/use-mantenimiento";
import { usePermissions } from "@/hooks/use-permissions";
import {
  CANAL_LABEL,
  CANALES,
  fmtMadridDateTime,
  madridLocalToIso,
  toMadridLocalInput,
} from "@/lib/partee-registre";

const MENU = "registre_hostes";
const NOTE_PLACEHOLDER = "No incluyas datos personales del huésped";

export interface RegistreConfirmable {
  id_registre: number;
  estado: string;
  num_viajeros: number | null;
  registro_confirmado: boolean;
  registro_confirmado_por: number | null;
  registro_confirmado_en: string | null;
  registro_confirmado_nota: string | null;
}

function invalidateRegistre(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["partee-registre-reserva"] });
  qc.invalidateQueries({ queryKey: ["partee-registre-window"] });
  qc.invalidateQueries({ queryKey: ["partee-reclamaciones"] });
}

export function useNombrePersona() {
  const q = usePersonalLite();
  const byId = new Map((q.data ?? []).map((p) => [p.id_persona, p]));
  return (id: number | null | undefined): string => {
    if (id == null) return "—";
    const p = byId.get(id);
    return p ? [p.nombre, p.apellidos].filter(Boolean).join(" ").trim() || "—" : "—";
  };
}

// ---------- add reclamation (reservation tab and /registre-hostes) ----------

export function AddReclamacionDialog({
  idRegistre,
  open,
  onOpenChange,
}: {
  idRegistre: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { persona } = useCurrentPersonal();
  const [cuando, setCuando] = useState("");
  const [canal, setCanal] = useState<string>("kb");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (!open) return;
    setCuando(toMadridLocalInput(new Date()));
    setCanal("kb");
    setNota("");
  }, [open, idRegistre]);

  const save = useMutation({
    mutationFn: async () => {
      if (idRegistre == null) throw new Error("Falta el registro");
      if (!persona) throw new Error("No se pudo identificar a tu usuario");
      const iso = madridLocalToIso(cuando);
      if (!iso) throw new Error("Fecha y hora no válidas");
      const { error } = await supabase.from("partee_reclamacio").insert({
        id_registre: idRegistre,
        enviada_en: iso,
        canal,
        nota: nota.trim() || null,
        creado_por: persona.id_persona,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reclamación registrada");
      invalidateRegistre(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error("No se pudo guardar: " + (e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir reclamación</DialogTitle>
          <DialogDescription>Registra que has reclamado al huésped que complete el registro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="recl-cuando">Fecha y hora (Madrid)</Label>
            <Input id="recl-cuando" type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANALES.map((c) => (
                  <SelectItem key={c} value={c}>{CANAL_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="recl-nota">Nota (opcional)</Label>
            <Textarea
              id="recl-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={NOTE_PLACEHOLDER}
              rows={3}
            />
          </div>
          {!persona && (
            <p className="text-xs text-destructive">No se pudo identificar a tu usuario; no se puede guardar.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !persona || !cuando}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- block shown per unit in the reservation tab ----------

export function ReclamacionesBlock({
  registre,
  readOnly = false,
}: {
  registre: RegistreConfirmable;
  /** History stays visible but every action is hidden (e.g. the reservation is excluded). */
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const { canEdit } = usePermissions();
  const editor = canEdit(MENU) && !readOnly;
  const { persona } = useCurrentPersonal();
  const nombre = useNombrePersona();

  const [addOpen, setAddOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNota, setConfirmNota] = useState("");
  const [toDelete, setToDelete] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["partee-reclamaciones", registre.id_registre],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partee_reclamacio")
        .select("id_reclamacion, enviada_en, canal, nota, creado_por")
        .eq("id_registre", registre.id_registre)
        .order("enviada_en", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase
        .from("partee_reclamacio")
        .delete()
        .eq("id_reclamacion", id)
        .select("id_reclamacion");
      if (error) throw error;
      if (!data?.length) throw new Error("No tienes permiso o la reclamación ya no existe");
    },
    onSuccess: () => {
      toast.success("Reclamación eliminada");
      invalidateRegistre(qc);
      setToDelete(null);
    },
    onError: (e) => toast.error("No se pudo eliminar: " + (e as Error).message),
  });

  // Only the 4 registro_confirmado* columns are ever written to partee_registre.
  const setConfirmado = useMutation({
    mutationFn: async (v: { on: boolean; nota?: string }) => {
      if (v.on && !persona) throw new Error("No se pudo identificar a tu usuario");
      const { data, error } = await supabase
        .from("partee_registre")
        .update(
          v.on
            ? {
                registro_confirmado: true,
                registro_confirmado_por: persona!.id_persona,
                registro_confirmado_en: new Date().toISOString(),
                registro_confirmado_nota: v.nota?.trim() || null,
              }
            : {
                registro_confirmado: false,
                registro_confirmado_por: null,
                registro_confirmado_en: null,
                registro_confirmado_nota: null,
              },
        )
        .eq("id_registre", registre.id_registre)
        .select("id_registre");
      if (error) throw error;
      if (!data?.length) throw new Error("No tienes permiso para modificar este registro");
    },
    onSuccess: (_d, v) => {
      toast.success(v.on ? "Registro marcado como completo" : "Confirmación quitada");
      invalidateRegistre(qc);
      setConfirmOpen(false);
      setConfirmNota("");
    },
    onError: (e) => toast.error("No se pudo guardar: " + (e as Error).message),
  });

  const puedeConfirmar =
    editor && registre.estado === "borrador" && (registre.num_viajeros ?? 0) > 0 && !registre.registro_confirmado;
  const rows = list.data ?? [];

  return (
    <div className="space-y-2 border-t pt-2">
      {registre.registro_confirmado && (
        <div className="space-y-1 rounded-md bg-green-50 p-2 text-sm text-green-900">
          <div>
            Registro confirmado a mano por {nombre(registre.registro_confirmado_por)} el{" "}
            {fmtMadridDateTime(registre.registro_confirmado_en)}
          </div>
          {registre.registro_confirmado_nota && (
            <div className="whitespace-pre-wrap text-xs">{registre.registro_confirmado_nota}</div>
          )}
          {editor && (
            <Button
              variant="outline"
              size="sm"
              disabled={setConfirmado.isPending}
              onClick={() => setConfirmado.mutate({ on: false })}
            >
              Quitar confirmación
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reclamaciones</span>
        {editor && (
          <div className="flex flex-wrap gap-2">
            {puedeConfirmar && (
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                Marcar registro como completo
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              Añadir reclamación
            </Button>
          </div>
        )}
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : list.error ? (
        <p className="text-sm text-destructive">No se pudieron cargar las reclamaciones.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin reclamaciones.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id_reclamacion} className="flex items-start gap-2 text-sm">
              <span className="w-28 shrink-0 text-muted-foreground">{fmtMadridDateTime(r.enviada_en)}</span>
              <Badge variant="secondary" className="shrink-0">
                {CANAL_LABEL[r.canal ?? ""] ?? r.canal ?? "—"}
              </Badge>
              <span className="min-w-0 flex-1">
                {r.nota && <span className="whitespace-pre-wrap">{r.nota} </span>}
                <span className="text-xs text-muted-foreground">· {nombre(r.creado_por)}</span>
              </span>
              {editor && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Eliminar reclamación"
                  onClick={() => setToDelete(r.id_reclamacion)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddReclamacionDialog idRegistre={registre.id_registre} open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar registro como completo</DialogTitle>
            <DialogDescription>
              Úsalo cuando el registro está completo aunque los viajeros no coincidan con los previstos (por ejemplo,
              porque la reserva cuenta a un niño).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="conf-nota">Nota (opcional)</Label>
            <Textarea
              id="conf-nota"
              value={confirmNota}
              onChange={(e) => setConfirmNota(e.target.value)}
              placeholder={NOTE_PLACEHOLDER}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => setConfirmado.mutate({ on: true, nota: confirmNota })}
              disabled={setConfirmado.isPending || !persona}
            >
              {setConfirmado.isPending ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete != null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la reclamación?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete != null && del.mutate(toDelete)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
