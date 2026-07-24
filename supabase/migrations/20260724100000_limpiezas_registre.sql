CREATE TABLE IF NOT EXISTS public.limpiezas_registre (
  id_registre bigint generated always as identity primary key,
  id_limpieza integer NOT NULL,
  id_persona integer NOT NULL,
  inici text NOT NULL,
  fi text,
  hores numeric,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.limpiezas_registre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_or_elevated" ON public.limpiezas_registre
  FOR SELECT TO authenticated
  USING (is_gestor_or_admin() OR (id_persona = current_id_persona()));

CREATE POLICY "insert_own_or_elevated" ON public.limpiezas_registre
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor_or_admin() OR (id_persona = current_id_persona()));

CREATE POLICY "update_own_or_elevated" ON public.limpiezas_registre
  FOR UPDATE TO authenticated
  USING (is_gestor_or_admin() OR (id_persona = current_id_persona()))
  WITH CHECK (is_gestor_or_admin() OR (id_persona = current_id_persona()));

CREATE POLICY "delete_elevated_only" ON public.limpiezas_registre
  FOR DELETE TO authenticated
  USING (is_gestor_or_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.limpiezas_registre TO authenticated;

NOTIFY pgrst, 'reload schema';
