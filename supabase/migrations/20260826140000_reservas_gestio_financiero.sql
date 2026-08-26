-- Reservation-level financial closing fields, annotated during the month
-- instead of by hand in Excel at month-end. Values are resolved literals
-- (never a live join to the tarifas_* reference tables), so a later change
-- to a tariff never retroactively alters an already-saved reservation.
--
-- No RLS/policy/grant statements here: reservas_gestio currently has no
-- RLS enabled at all (confirmed by grep across every tracked migration —
-- zero CREATE POLICY / ENABLE ROW LEVEL SECURITY / GRANT statements ever
-- targeted this table), matching the one precedent column-ALTER on this
-- table (20260713144225, DROP COLUMN "HCheckInConf"/"HCheckOutConf") which
-- also never touched policies. Retrofitting proper access control here
-- needs its own dedicated design pass — bundling it into a column-add
-- migration risks silently breaking legitimate non-admin writes (e.g. the
-- ReadyCheckIn toggle in checkins.tsx) without full visibility into every
-- role that currently writes to this table.
ALTER TABLE public.reservas_gestio
  ADD COLUMN IF NOT EXISTS "PagadoEstancia" numeric CHECK ("PagadoEstancia" >= 0),
  ADD COLUMN IF NOT EXISTS "PagadoLimpieza" numeric CHECK ("PagadoLimpieza" >= 0),
  ADD COLUMN IF NOT EXISTS "PctComisionOTA" numeric CHECK ("PctComisionOTA" >= 0 AND "PctComisionOTA" <= 100),
  ADD COLUMN IF NOT EXISTS "PctPorCobro" numeric CHECK ("PctPorCobro" >= 0 AND "PctPorCobro" <= 100),
  ADD COLUMN IF NOT EXISTS "CobroEfectivo" numeric CHECK ("CobroEfectivo" >= 0);

NOTIFY pgrst, 'reload schema';
