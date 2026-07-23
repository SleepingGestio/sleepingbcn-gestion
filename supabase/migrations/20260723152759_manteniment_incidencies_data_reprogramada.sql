ALTER TABLE public.manteniment_incidencies
  ADD COLUMN IF NOT EXISTS data_reprogramada_por_operario boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
