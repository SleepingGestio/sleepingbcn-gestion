import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { fetchMantenimiento } from "@/lib/catalogos";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import type { AptLite, EspacioLite, Incidencia, PersonaLite, Prioridad } from "@/lib/mantenimiento";

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
      const { data, error } = await supabase.from("apartamentos").select("id_apt,nombre");
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

  async function iniciar(inc: Pick<Incidencia, "id_incidencia" | "id_assignat" | "iniciat_en">) {
    if (inc.id_assignat == null) {
      toast.error("La incidencia no tiene un operario asignado");
      return;
    }
    const nowIso = new Date().toISOString();
    const { error: e1 } = await supabase.from("manteniment_registre").insert({
      id_incidencia: inc.id_incidencia,
      id_persona: inc.id_assignat,
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

  async function finParcial(inc: Pick<Incidencia, "id_incidencia">, openSessionId: number | null) {
    const nowIso = new Date().toISOString();
    if (openSessionId != null) {
      const { error: e1 } = await supabase
        .from("manteniment_registre")
        .update({ fi: nowIso })
        .eq("id_registre", openSessionId);
      if (e1) {
        toast.error("Error: " + e1.message);
        return;
      }
    }
    const { error: e2 } = await supabase
      .from("manteniment_incidencies")
      .update({ estat: "validada" })
      .eq("id_incidencia", inc.id_incidencia);
    if (e2) {
      toast.error("Error: " + e2.message);
      return;
    }
    toast.success("Sesión pausada");
    onMutated?.();
  }

  async function finTotal(inc: Pick<Incidencia, "id_incidencia">, openSessionId: number | null) {
    const nowIso = new Date().toISOString();
    if (openSessionId != null) {
      const { error: e1 } = await supabase
        .from("manteniment_registre")
        .update({ fi: nowIso })
        .eq("id_registre", openSessionId);
      if (e1) {
        toast.error("Error: " + e1.message);
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

  return { rechazar, confirmarAsignacion, iniciar, finParcial, finTotal, guardarNota };
}
