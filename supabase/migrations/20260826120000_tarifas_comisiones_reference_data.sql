-- Reference-data catalogs for tourist-license types, apartment cleaning
-- tariffs, OTA commission %, and channel collection %, feeding the
-- reservation-level financial closing fields to be added in a follow-up
-- migration (reservas_gestio.PagadoEstancia / PagadoLimpieza /
-- PctComisionOTA / PctPorCobro / CobroEfectivo).

-- 1. Tourist license types (HUT, HA2**, ...)
CREATE TABLE IF NOT EXISTS public.tipos_licencia_turistica (
  id_tipo_licencia bigint generated always as identity primary key,
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  orden numeric,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.tipos_licencia_turistica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tipos_licencia_turistica
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.tipos_licencia_turistica
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_licencia_turistica TO authenticated;

-- 2. Reservation channels (Booking, Airbnb, Vrbo, Directo...) — app-owned
--    catalog, decoupled from reservas_kb."Portal" (free text, Krossbooking-
--    synced, out of our control). Shared FK target for both tariff tables
--    below so the channel list can't drift between the two.
CREATE TABLE IF NOT EXISTS public.canales_reserva (
  id_canal bigint generated always as identity primary key,
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  orden numeric,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.canales_reserva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.canales_reserva
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.canales_reserva
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canales_reserva TO authenticated;

-- 3. Cleaning cost per apartment category (no channel dimension)
CREATE TABLE IF NOT EXISTS public.tarifas_limpieza (
  id_tarifa_limpieza bigint generated always as identity primary key,
  id_categoria bigint NOT NULL UNIQUE REFERENCES public.tipos_categoria_apartamento(id_categoria),
  costo_limpieza numeric NOT NULL CHECK (costo_limpieza >= 0),
  activo boolean NOT NULL DEFAULT true,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.tarifas_limpieza ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tarifas_limpieza
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.tarifas_limpieza
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_limpieza TO authenticated;

-- 4. OTA commission % — matrix of license type x channel
CREATE TABLE IF NOT EXISTS public.tarifas_comision_ota (
  id_tarifa_comision bigint generated always as identity primary key,
  id_tipo_licencia bigint NOT NULL REFERENCES public.tipos_licencia_turistica(id_tipo_licencia),
  id_canal bigint NOT NULL REFERENCES public.canales_reserva(id_canal),
  pct_comision numeric NOT NULL CHECK (pct_comision >= 0 AND pct_comision <= 100),
  activo boolean NOT NULL DEFAULT true,
  creado_en text DEFAULT now()::text,
  UNIQUE (id_tipo_licencia, id_canal)
);

ALTER TABLE public.tarifas_comision_ota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tarifas_comision_ota
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.tarifas_comision_ota
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_comision_ota TO authenticated;

-- 5. Collection % per channel
CREATE TABLE IF NOT EXISTS public.tarifas_cobro_canal (
  id_tarifa_cobro bigint generated always as identity primary key,
  id_canal bigint NOT NULL UNIQUE REFERENCES public.canales_reserva(id_canal),
  pct_cobro numeric NOT NULL CHECK (pct_cobro >= 0 AND pct_cobro <= 100),
  activo boolean NOT NULL DEFAULT true,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.tarifas_cobro_canal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tarifas_cobro_canal
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.tarifas_cobro_canal
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_cobro_canal TO authenticated;

-- Ensure AdminAPP (id_rol = 1, see is_gestor_or_admin() in migration
-- 20260708161129) can view and edit the new tables immediately. This
-- doesn't depend on how can_edit_menu() is actually implemented — its
-- definition isn't tracked in any migration in this repo, so we can't
-- inspect it here — nor on rol_permisos already having a config_tarifas
-- row, since this is a brand-new menu key with none yet.
INSERT INTO public.rol_permisos (id_rol, menu, pot_veure, pot_editar)
SELECT 1, 'config_tarifas', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.rol_permisos WHERE id_rol = 1 AND menu = 'config_tarifas'
);

NOTIFY pgrst, 'reload schema';
