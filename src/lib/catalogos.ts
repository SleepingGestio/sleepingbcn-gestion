import { supabase } from "@/integrations/supabase/client";
import type { AgCheckIn, PersLimp } from "./types";

export async function fetchAgentes(): Promise<AgCheckIn[]> {
  const { data, error } = await supabase.from("agcheckin").select("id_agente, nombre").order("nombre");
  if (error) throw error;
  return (data ?? []) as AgCheckIn[];
}

export async function fetchLimpiadores(): Promise<PersLimp[]> {
  const { data, error } = await supabase.from("perslimp").select("id_persona, nombre").order("nombre");
  if (error) throw error;
  return (data ?? []) as PersLimp[];
}