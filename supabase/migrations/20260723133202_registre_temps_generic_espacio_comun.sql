ALTER TABLE public.registre_temps_generic
  ADD COLUMN IF NOT EXISTS id_tipo_espacio_comun numeric;

NOTIFY pgrst, 'reload schema';
