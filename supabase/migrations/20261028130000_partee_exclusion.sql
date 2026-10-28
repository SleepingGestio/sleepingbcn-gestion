-- Registre hostes (Partee) — reservations that do not need a Partee registration.
--
-- Some reservations never need a guest registration: stay extensions, private / own
-- reservations, others. This table marks them (one row per RESERVATION, not per unit) so the
-- management view can hide them. It is independent from the Partee sync job (which, in a later
-- step, will skip these reservations); nothing here touches existing tables.
--
-- Same RLS / GRANT pattern as 20261027120000_partee_registre.sql:
--   - SELECT for every authenticated user;
--   - writes for authenticated only when can_edit_menu('registre_hostes');
--   - the Worker/job side uses service_role. No access for anon.

CREATE TABLE IF NOT EXISTS public.partee_exclusion (
  numero_reserva text PRIMARY KEY REFERENCES public.reservas_kb("Número") ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('extension', 'reserva_privada', 'otros')),
  nota text,
  creado_por integer REFERENCES public.personal(id_persona),
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partee_exclusion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.partee_exclusion
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_registre_hostes" ON public.partee_exclusion
  FOR ALL TO authenticated
  USING (can_edit_menu('registre_hostes'))
  WITH CHECK (can_edit_menu('registre_hostes'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partee_exclusion TO authenticated;
GRANT ALL ON public.partee_exclusion TO service_role;

NOTIFY pgrst, 'reload schema';
