ALTER TABLE public.apartamentos
  ADD COLUMN IF NOT EXISTS tiempo_estandar_modo text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS tipologia text,
  ADD COLUMN IF NOT EXISTS tiempo_estandar_std_sin_sfc numeric,
  ADD COLUMN IF NOT EXISTS tiempo_estandar_std_con_sfc numeric,
  ADD COLUMN IF NOT EXISTS tiempo_estandar_extra_cr numeric;

ALTER TABLE public.apartamentos
  ADD CONSTRAINT apartamentos_tiempo_estandar_modo_check
  CHECK (tiempo_estandar_modo IN ('individual', 'compartido'));

ALTER TABLE public.apartamentos
  ADD CONSTRAINT apartamentos_tipologia_check
  CHECK (tipologia IS NULL OR tipologia IN ('apartamento', 'habitacion'));

NOTIFY pgrst, 'reload schema';
