-- Decouple cleaning-tariff grouping from apartment typology. tarifas_limpieza
-- was keyed off tipos_categoria_apartamento (id_categoria), but that catalog
-- exists for apartment typology / standard-cleaning-time suggestions and
-- shouldn't constrain how cleaning prices are split or merged. This gives
-- cleaning tariffs their own standalone catalog, same shape as
-- tipos_licencia_turistica.

-- 1. Standalone catalog for cleaning-tariff categories.
CREATE TABLE IF NOT EXISTS public.tipos_categoria_limpieza (
  id_categoria_limpieza bigint generated always as identity primary key,
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  orden numeric,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.tipos_categoria_limpieza ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tipos_categoria_limpieza
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.tipos_categoria_limpieza
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_categoria_limpieza TO authenticated;

-- 2. Repoint tarifas_limpieza at the new catalog. Existing rows reference
-- tipos_categoria_apartamento ids, which are meaningless against the new
-- (empty) catalog — clear them rather than leave orphaned/mismatched data;
-- whoever set them up re-enters them against the new categories.
DELETE FROM public.tarifas_limpieza;

ALTER TABLE public.tarifas_limpieza
  DROP CONSTRAINT IF EXISTS tarifas_limpieza_id_categoria_fkey;

ALTER TABLE public.tarifas_limpieza
  RENAME COLUMN id_categoria TO id_categoria_limpieza;

ALTER TABLE public.tarifas_limpieza
  ADD CONSTRAINT tarifas_limpieza_id_categoria_limpieza_fkey
  FOREIGN KEY (id_categoria_limpieza) REFERENCES public.tipos_categoria_limpieza(id_categoria_limpieza);

-- 3. Link each apartment to its cleaning-tariff category, parallel to
-- id_categoria and id_tipo_licencia. Starts null for every apartment;
-- the PagadoLimpieza suggestion just stays silent (no chip) until this is
-- filled in via ApartamentosAdmin, same as any other unmatched lookup.
ALTER TABLE public.apartamentos
  ADD COLUMN IF NOT EXISTS id_categoria_limpieza bigint REFERENCES public.tipos_categoria_limpieza(id_categoria_limpieza);

NOTIFY pgrst, 'reload schema';
