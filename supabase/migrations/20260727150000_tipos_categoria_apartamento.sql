CREATE TABLE IF NOT EXISTS public.tipos_categoria_apartamento (
  id_categoria bigint generated always as identity primary key,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden numeric,
  creado_en text DEFAULT now()::text
);

ALTER TABLE public.tipos_categoria_apartamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tipos_categoria_apartamento
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "write_config_apartamentos" ON public.tipos_categoria_apartamento
  FOR ALL TO authenticated
  USING (can_edit_menu('config_apartamentos'))
  WITH CHECK (can_edit_menu('config_apartamentos'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_categoria_apartamento TO authenticated;

ALTER TABLE public.apartamentos DROP CONSTRAINT IF EXISTS apartamentos_tipologia_check;
ALTER TABLE public.apartamentos DROP COLUMN IF EXISTS tipologia;
ALTER TABLE public.apartamentos DROP CONSTRAINT IF EXISTS apartamentos_tiempo_estandar_modo_check;
ALTER TABLE public.apartamentos DROP COLUMN IF EXISTS tiempo_estandar_modo;
ALTER TABLE public.apartamentos
  ADD COLUMN IF NOT EXISTS id_categoria bigint REFERENCES public.tipos_categoria_apartamento(id_categoria);

NOTIFY pgrst, 'reload schema';
