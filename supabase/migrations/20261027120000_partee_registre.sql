-- Registre hostes (Partee) — Part 1: data model only (no sync, no screens yet).
--
-- Adds:
--   1. partee_establiment — unit (apartamentos.id_apt) <-> Partee establishment id.
--   2. partee_registre    — one row per (reservation, unit): state of the
--                           Partee guest registration (parte). A KB reservation
--                           with several rooms (comma-separated
--                           reservas_kb."Habitaciones") gets one row per unit.
--   3. partee_reclamacio  — reminders sent to the guest to complete the
--                           registration (replaces the manual
--                           reservas_gestio."ParteeRecl1-3"; those columns are
--                           NOT touched here — see claude/partee_backfill_manual_fields.sql).
--   4. rol_permisos row so AdminAPP can see/edit the new menu 'registre_hostes'.
--
-- No guest personal data is stored: only ids, status, counts and links.
-- Written by a Worker with the service role (later step); read/edited by the
-- app through RLS (can_edit_menu('registre_hostes')).

-- 1. Unit <-> Partee establishment (hand-seeded, ~14 rows).
CREATE TABLE IF NOT EXISTS public.partee_establiment (
  id_apt integer PRIMARY KEY REFERENCES public.apartamentos(id_apt),
  partee_est_id bigint NOT NULL UNIQUE,
  nombre_partee text,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz DEFAULT now()
);

ALTER TABLE public.partee_establiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.partee_establiment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_registre_hostes" ON public.partee_establiment
  FOR ALL TO authenticated
  USING (can_edit_menu('registre_hostes'))
  WITH CHECK (can_edit_menu('registre_hostes'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partee_establiment TO authenticated;
GRANT ALL ON public.partee_establiment TO service_role;

-- 2. Registration state per (reservation, unit).
--    numero_reserva is NOT NULL on purpose: the app only follows up
--    reservations it knows from Krossbooking. A Partee record that cannot be
--    matched to a KB reservation (by unit + check-in date) is skipped/logged
--    by the sync instead of being stored orphaned. If orphans turn out to be
--    useful, relaxing this later is a trivial ALTER ... DROP NOT NULL.
CREATE TABLE IF NOT EXISTS public.partee_registre (
  id_registre bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_reserva text NOT NULL REFERENCES public.reservas_kb("Número") ON DELETE CASCADE,
  id_apt integer NOT NULL REFERENCES public.apartamentos(id_apt),
  fecha_checkin date NOT NULL,
  partee_reservation_id bigint,
  parte_id bigint,
  estado text NOT NULL DEFAULT 'sin_registro'
    CHECK (estado IN ('sin_registro', 'iniciado', 'borrador', 'finalizado', 'anulado', 'error', 'manual')),
  is_borrador boolean,
  num_viajeros integer,
  num_lote text,
  ses_codigo_estado integer,
  ses_desc text,
  checkin_url text,
  parte_enviado_en timestamptz,
  ultimo_sync timestamptz,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now(),
  CONSTRAINT partee_registre_reserva_apt_uq UNIQUE (numero_reserva, id_apt)
);

CREATE INDEX IF NOT EXISTS idx_partee_registre_fecha_checkin
  ON public.partee_registre (fecha_checkin);

CREATE INDEX IF NOT EXISTS idx_partee_registre_parte_id
  ON public.partee_registre (parte_id);

ALTER TABLE public.partee_registre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.partee_registre
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_registre_hostes" ON public.partee_registre
  FOR ALL TO authenticated
  USING (can_edit_menu('registre_hostes'))
  WITH CHECK (can_edit_menu('registre_hostes'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partee_registre TO authenticated;
GRANT ALL ON public.partee_registre TO service_role;

-- 3. Reminders sent for a registration (modelled on manteniment_reclamaciones).
CREATE TABLE IF NOT EXISTS public.partee_reclamacio (
  id_reclamacion bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_registre bigint NOT NULL REFERENCES public.partee_registre(id_registre) ON DELETE CASCADE,
  enviada_en timestamptz NOT NULL DEFAULT now(),
  canal text CHECK (canal IN ('kb', 'whatsapp', 'telefono', 'email', 'otro')),
  nota text,
  creado_por integer REFERENCES public.personal(id_persona),
  creado_en timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partee_reclamacio_registre
  ON public.partee_reclamacio (id_registre);

ALTER TABLE public.partee_reclamacio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.partee_reclamacio
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_registre_hostes" ON public.partee_reclamacio
  FOR ALL TO authenticated
  USING (can_edit_menu('registre_hostes'))
  WITH CHECK (can_edit_menu('registre_hostes'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partee_reclamacio TO authenticated;
GRANT ALL ON public.partee_reclamacio TO service_role;

-- 4. Menu permission for AdminAPP (id_rol = 1) only, for now. Same pattern as
--    20260826120000_tarifas_comisiones_reference_data.sql: independent of how
--    can_edit_menu() is implemented, and a no-op if the row already exists.
INSERT INTO public.rol_permisos (id_rol, menu, pot_veure, pot_editar)
SELECT 1, 'registre_hostes', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.rol_permisos WHERE id_rol = 1 AND menu = 'registre_hostes'
);

NOTIFY pgrst, 'reload schema';
