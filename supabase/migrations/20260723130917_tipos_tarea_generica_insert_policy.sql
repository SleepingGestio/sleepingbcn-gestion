DROP POLICY IF EXISTS "write_config_personal" ON public.tipos_tarea_generica;

-- Qualsevol treballador autenticat pot crear un tipus nou sobre la marxa
-- des de Mi Día (mi-dia.tsx → onCreateType). No és una acció d'administració.
CREATE POLICY "insert_any_authenticated" ON public.tipos_tarea_generica
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Editar, desactivar o reordenar tipus existents segueix sent només
-- del gestor/admin (Configuración → Personal → tipos-genericas-admin.tsx)
CREATE POLICY "update_config_personal" ON public.tipos_tarea_generica
  FOR UPDATE TO authenticated
  USING (can_edit_menu('config_personal'))
  WITH CHECK (can_edit_menu('config_personal'));

CREATE POLICY "delete_config_personal" ON public.tipos_tarea_generica
  FOR DELETE TO authenticated
  USING (can_edit_menu('config_personal'));
