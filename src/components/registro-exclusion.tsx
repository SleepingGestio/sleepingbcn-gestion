// Reservations that do not need a Partee registration (partee_exclusion, one row per reservation).
// Writes are visible only to editors of 'registre_hostes' (RLS: can_edit_menu).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { useNombrePersona } from "@/components/registro-reclamaciones";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchExclusiones, type Exclusion } from "@/lib/partee-registre-api";
import { fmtMadridDateTime, MOTIVO_EXCLUSION_LABEL, MOTIVOS_EXCLUSION } from "@/lib/partee-registre";

const NOTE_PLACEHOLDER = "No incluyas datos personales del huésped";
export const EXCLUSIONES_KEY = ["partee-exclusiones"] as const;

/** All exclusions (one shared query, no filters) plus a Map by reservation number. */
export function useExclusiones(enabled = true) {
  const q = useQuery({ queryKey: EXCLUSIONES_KEY, queryFn: fetchExclusiones, enabled });
  const map = useMemo(() => new Map((q.data ?? []).map((e) => [e.numero_reserva, e])), [q.data]);
  return { ...q, map };
}

function invalidateExclusion(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: EXCLUSIONES_KEY });
  qc.invalidateQueries({ queryKey: ["partee-registre-window"] });
  qc.invalidateQueries({ queryKey: ["partee-registre-reserva"] });
}

// ---------- mark / edit ----------

export function ExcluirReservaDialog({
  numero,
  current,
  open,
  onOpenChange,
}: {
  numero: string | null;
  /** Existing exclusion when editing. */
  current: Exclusion | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { persona } = useCurrentPersonal();
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (!open) return;
    setMotivo(current?.motivo ?? "");
    setNota(current?.nota ?? "");
  }, [open, numero, current]);

  const save = useMutation({
    mutationFn: async () => {
      if (!numero) throw new Error("Falta la reserva");
      if (!motivo) throw new Error("Elige un motivo");
      if (!persona) throw new Error("No se pudo identificar a tu usuario");
      const nota_ = nota.trim() || null;
      if (current) {
        // Editing keeps who/when it was first marked; only motivo and nota change.
        const { data, error } = await supabase
          .from("partee_exclusion")
          .update({ motivo, nota: nota_ })
          .eq("numero_reserva", numero)
          .select("numero_reserva");
        if (error) throw error;
        if (!data?.length) throw new Error("No tienes permiso o la exclusión ya no existe");
      } else {
        const { error } = await supabase
          .from("partee_exclusion")
          .upsert(
            { numero_reserva: numero, motivo, nota: nota_, creado_por: persona.id_persona },
            { onConflict: "numero_reserva" },
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(current ? "Exclusión actualizada" : "Reserva marcada como «No requiere registro»");
      invalidateExclusion(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error("No se pudo guardar: " + (e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>No requiere registro</DialogTitle>
          <DialogDescription>
            La reserva {numero} (todas sus unidades) saldrá de la gestión del registro de huéspedes y la sincronización
            con Partee la omitirá.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger aria-label="Motivo"><SelectValue placeholder="Elige un motivo" /></SelectTrigger>
              <SelectContent>
                {MOTIVOS_EXCLUSION.map((m) => (
                  <SelectItem key={m} value={m}>{MOTIVO_EXCLUSION_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="excl-nota">Nota (opcional)</Label>
            <Textarea
              id="excl-nota"
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
          <Button onClick={() => save.mutate()} disabled={save.isPending || !motivo || !persona}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- include again ----------

export function IncluirReservaDialog({
  numero,
  open,
  onOpenChange,
}: {
  numero: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      if (!numero) throw new Error("Falta la reserva");
      const { data, error } = await supabase
        .from("partee_exclusion")
        .delete()
        .eq("numero_reserva", numero)
        .select("numero_reserva");
      if (error) throw error;
      if (!data?.length) throw new Error("No tienes permiso o la exclusión ya no existe");
    },
    onSuccess: () => {
      toast.success("Reserva incluida de nuevo");
      invalidateExclusion(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error("No se pudo incluir: " + (e as Error).message),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Volver a incluir la reserva?</AlertDialogTitle>
          <AlertDialogDescription>
            La reserva {numero} volverá a la gestión del registro de huéspedes y a la sincronización con Partee.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // keep it open until the delete resolves
              del.mutate();
            }}
            disabled={del.isPending}
          >
            {del.isPending ? "Incluyendo…" : "Volver a incluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- top of the reservation tab ----------

export function ExclusionHeader({ numero, exclusion }: { numero: string; exclusion: Exclusion | null }) {
  const { canEdit } = usePermissions();
  const editor = canEdit("registre_hostes");
  const nombre = useNombrePersona();
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [incluirOpen, setIncluirOpen] = useState(false);

  if (!exclusion && !editor) return null;

  return (
    <div>
      {exclusion ? (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div>
            Esta reserva no requiere registro ({MOTIVO_EXCLUSION_LABEL[exclusion.motivo] ?? exclusion.motivo}) — marcada
            por {nombre(exclusion.creado_por)} el {fmtMadridDateTime(exclusion.creado_en)}
          </div>
          {exclusion.nota && <div className="whitespace-pre-wrap text-xs">{exclusion.nota}</div>}
          {editor && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setExcluirOpen(true)}>Editar</Button>
              <Button variant="outline" size="sm" onClick={() => setIncluirOpen(true)}>Volver a incluir</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setExcluirOpen(true)}>
            No requiere registro
          </Button>
        </div>
      )}

      <ExcluirReservaDialog numero={numero} current={exclusion} open={excluirOpen} onOpenChange={setExcluirOpen} />
      <IncluirReservaDialog numero={numero} open={incluirOpen} onOpenChange={setIncluirOpen} />
    </div>
  );
}
