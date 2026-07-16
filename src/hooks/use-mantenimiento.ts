import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { fetchMantenimiento } from "@/lib/catalogos";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { findOpenSession, type AptLite, type EspacioLite, type GrupoLite, type Incidencia, type PersonaLite, type Prioridad, type Registre } from "@/lib/mantenimiento";

function diffHours(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
}

// Small reference-data queries shared by the list page and the detail
// popover. Both use the same queryKey, so react-query dedupes/caches them —
// only fetched once regardless of how many components ask for it.

export function usePersonalLite() {
  return useQuery({
    queryKey: ["mantenimiento-personal-lite"],
    queryFn: async (): Promise<PersonaLite[]> => {
      const { data, error } = await supabase.from("personal").select("id_persona,nombre,apellidos,codigo");
      if (error) throw error;
      return (data ?? []) as PersonaLite[];
    },
  });
}

export function useApartamentosLite() {
  return useQuery({
    queryKey: ["mantenimiento-apts"],
    queryFn: async (): Promise<AptLite[]> => {
      const { data, error } = await supabase.from("apartamentos").select("id_apt,nombre,id_grupo");
      if (error) throw error;
      return (data ?? []) as AptLite[];
    },
  });
}

export function useEspaciosLite() {
  return useQuery({
    queryKey: ["mantenimiento-espacios"],
    queryFn: async (): Promise<EspacioLite[]> => {
      const { data, error } = await supabase.from("tipos_espacio_comun").select("id_tipo,nombre");
      if (error) throw error;
      return (data ?? []) as EspacioLite[];
    },
  });
}

export function useGruposLite() {
  return useQuery({
    queryKey: ["mantenimiento-grupos"],
    queryFn: async (): Promise<GrupoLite[]> => {
      const { data, error } = await supabase.from("grupos_apartamentos").select("id_grupo,nombre").order("nombre");
      if (error) throw error;
      return (data ?? []) as GrupoLite[];
    },
  });
}

export function useMantenimientoWorkers() {
  return useQuery({ queryKey: ["mantenimiento-workers"], queryFn: fetchMantenimiento });
}

/**
 * Single source of truth for every mutation the /mantenimiento screen can
 * perform (list rows AND the detail popover both call these — neither owns
 * its own copy of the update logic). `onMutated` is invoked after every
 * successful write so each caller can refetch whatever queries it owns.
 */
export function useMantenimientoActions(onMutated?: () => void) {
  const { persona } = useCurrentPersonal();

  async function rechazar(inc: Pick<Incidencia, "id_incidencia" | "titol">) {
    if (!window.confirm(`¿Rechazar la incidencia "${inc.titol}"?`)) return;
    const { error } = await supabase
      .from("manteniment_incidencies")
      .update({
        estat: "rebutjada",
        validat_per: persona?.id_persona ?? null,
        validat_en: new Date().toISOString(),
      })
      .eq("id_incidencia", inc.id_incidencia);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Incidencia rechazada");
    onMutated?.();
  }

  async function confirmarAsignacion(
    inc: Pick<Incidencia, "id_incidencia">,
    workerId: number,
    fecha: string | null,
    prioridad: Prioridad,
  ) {
    const { error } = await supabase
      .from("manteniment_incidencies")
      .update({
        estat: "validada",
        id_assignat: workerId,
        data_prevista: fecha,
        prioritat_confirmada: prioridad,
        validat_per: persona?.id_persona ?? null,
        validat_en: new Date().toISOString(),
      })
      .eq("id_incidencia", inc.id_incidencia);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Incidencia asignada");
    onMutated?.();
  }

  /**
   * `idPersona` is whose session this is — the console passes `inc.id_assignat`
   * (the officially assigned worker), Mi Día passes the logged-in worker's own
   * id_persona. Any worker with role Mantenimiento may start their own session
   * on any open incidencia, independent of who else is already on it.
   */
  async function iniciar(inc: Pick<Incidencia, "id_incidencia" | "iniciat_en">, idPersona: number | null) {
    if (idPersona == null) {
      toast.error("La incidencia no tiene un operario asignado");
      return;
    }
    const nowIso = new Date().toISOString();
    const { error: e1 } = await supabase.from("manteniment_registre").insert({
      id_incidencia: inc.id_incidencia,
      id_persona: idPersona,
      inici: nowIso,
    });
    if (e1) {
      toast.error("Error: " + e1.message);
      return;
    }
    const patch: TablesUpdate<"manteniment_incidencies"> = { estat: "en_curs" };
    if (!inc.iniciat_en) patch.iniciat_en = nowIso;
    const { error: e2 } = await supabase
      .from("manteniment_incidencies")
      .update(patch)
      .eq("id_incidencia", inc.id_incidencia);
    if (e2) {
      toast.error("Error: " + e2.message);
      return;
    }
    toast.success("Tarea iniciada");
    onMutated?.();
  }

  async function finParcial(
    inc: Pick<Incidencia, "id_incidencia">,
    idPersona: number | null,
    sesiones: Registre[],
  ) {
    const nowIso = new Date().toISOString();
    const openSession = findOpenSession(sesiones.filter((s) => s.id_persona === idPersona));
    if (openSession != null) {
      const { error: e1 } = await supabase
        .from("manteniment_registre")
        .update({ fi: nowIso, hores: diffHours(openSession.inici, nowIso) })
        .eq("id_registre", openSession.id_registre);
      if (e1) {
        toast.error("Error: " + e1.message);
        return;
      }
    }
    // Only revert the incidencia to "validada" if no other worker still has an
    // open session on it — otherwise pausing my own session would incorrectly
    // flip a task someone else is still actively working on back to "not started".
    const { data: stillOpen, error: eOpen } = await supabase
      .from("manteniment_registre")
      .select("id_registre")
      .eq("id_incidencia", inc.id_incidencia)
      .is("fi", null);
    if (eOpen) {
      toast.error("Error: " + eOpen.message);
      return;
    }
    if (!stillOpen || stillOpen.length === 0) {
      const { error: e2 } = await supabase
        .from("manteniment_incidencies")
        .update({ estat: "validada" })
        .eq("id_incidencia", inc.id_incidencia);
      if (e2) {
        toast.error("Error: " + e2.message);
        return;
      }
    }
    toast.success("Sesión pausada");
    onMutated?.();
  }

  // Finalizing definitively closes the incidencia — it must not leave another
  // worker's still-open session dangling forever, so this closes every open
  // session on the incidencia (not just the acting worker's own), unlike
  // finParcial which only ever touches the acting worker's own session.
  async function finTotal(inc: Pick<Incidencia, "id_incidencia">) {
    const nowIso = new Date().toISOString();
    const { data: openSessions, error: eSel } = await supabase
      .from("manteniment_registre")
      .select("id_registre, inici")
      .eq("id_incidencia", inc.id_incidencia)
      .is("fi", null);
    if (eSel) {
      toast.error("Error: " + eSel.message);
      return;
    }
    for (const s of openSessions ?? []) {
      const { error: eUpd } = await supabase
        .from("manteniment_registre")
        .update({ fi: nowIso, hores: diffHours(s.inici, nowIso) })
        .eq("id_registre", s.id_registre);
      if (eUpd) {
        toast.error("Error: " + eUpd.message);
        return;
      }
    }
    const { error: e2 } = await supabase
      .from("manteniment_incidencies")
      .update({ estat: "finalitzada", finalitzat_en: nowIso })
      .eq("id_incidencia", inc.id_incidencia);
    if (e2) {
      toast.error("Error: " + e2.message);
      return;
    }
    toast.success("Tarea finalizada");
    onMutated?.();
  }

  async function guardarNota(inc: Pick<Incidencia, "id_incidencia">, nota: string) {
    const { error } = await supabase
      .from("manteniment_incidencies")
      .update({ notas_gestor: nota || null })
      .eq("id_incidencia", inc.id_incidencia);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Nota guardada");
    onMutated?.();
  }

  async function guardarDescripcio(inc: Pick<Incidencia, "id_incidencia">, descripcio: string) {
    const { error } = await supabase
      .from("manteniment_incidencies")
      .update({ descripcio: descripcio.trim() || null })
      .eq("id_incidencia", inc.id_incidencia);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Descripción guardada");
    onMutated?.();
  }

  return { rechazar, confirmarAsignacion, iniciar, finParcial, finTotal, guardarNota, guardarDescripcio };
}
