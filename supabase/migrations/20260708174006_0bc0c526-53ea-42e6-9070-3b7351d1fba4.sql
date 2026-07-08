-- Enforce at most one open (fecha_fin IS NULL) activity period per persona.
-- Preventive: no active bug depends on this today, but nothing previously
-- stopped NovaAltaDialog from inserting a second concurrently-open period
-- for the same id_persona (e.g. clicking "Nueva alta" without first closing
-- the current one via "Finalizar contrato").
CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_one_open_per_persona
  ON public.personal_periodos_actividad (id_persona)
  WHERE fecha_fin IS NULL;
