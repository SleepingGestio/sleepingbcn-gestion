-- Cleaning-role workers need to read other workers' limpiezas rows to see 'Equipo trabajando este día' in Mi Día; write access remains restricted via write_own_or_menus.
DROP POLICY IF EXISTS "select_own_or_menus" ON public.limpiezas;

CREATE POLICY "select_all_authenticated" ON public.limpiezas
  FOR SELECT TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
