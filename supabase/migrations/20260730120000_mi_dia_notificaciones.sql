CREATE TABLE IF NOT EXISTS public.mi_dia_notificaciones (
  id_notificacion bigint generated always as identity primary key,
  id_persona numeric NOT NULL,
  tipo text NOT NULL,
  referencia_id numeric,
  mensaje text,
  fecha_afectada text,
  creado_en text DEFAULT now()::text,
  visto boolean NOT NULL DEFAULT false
);

ALTER TABLE public.mi_dia_notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_or_elevated" ON public.mi_dia_notificaciones
  FOR SELECT TO authenticated
  USING (is_gestor_or_admin() OR (id_persona = current_id_persona()));

CREATE POLICY "insert_elevated_only" ON public.mi_dia_notificaciones
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor_or_admin());

CREATE POLICY "update_own_or_elevated" ON public.mi_dia_notificaciones
  FOR UPDATE TO authenticated
  USING (is_gestor_or_admin() OR (id_persona = current_id_persona()))
  WITH CHECK (is_gestor_or_admin() OR (id_persona = current_id_persona()));

CREATE POLICY "delete_elevated_only" ON public.mi_dia_notificaciones
  FOR DELETE TO authenticated
  USING (is_gestor_or_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_dia_notificaciones TO authenticated;

NOTIFY pgrst, 'reload schema';
