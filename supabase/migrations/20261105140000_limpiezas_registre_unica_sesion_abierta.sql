-- Only one OPEN session per cleaning and worker. Closed sessions (fi not null) are unaffected,
-- so "Fin parcial" followed by a new start still works.
CREATE UNIQUE INDEX IF NOT EXISTS limpiezas_registre_una_abierta_por_persona
  ON public.limpiezas_registre (id_limpieza, id_persona)
  WHERE fi IS NULL;

NOTIFY pgrst, 'reload schema';
