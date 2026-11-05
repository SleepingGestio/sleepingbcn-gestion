-- "Requiere factura" flag on a reservation (SÍ/NO switch in the reserva detail, tab Inf. económica).
-- Existing rows get false (NO).
--
-- No RLS/policy/grant statements here: this is a column added to an existing table, and reservas_gestio
-- has no RLS enabled (same situation as 20260826140000_reservas_gestio_financiero.sql).
ALTER TABLE public.reservas_gestio
  ADD COLUMN IF NOT EXISTS requiere_factura boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
