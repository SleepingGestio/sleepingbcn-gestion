-- Snapshot of the KB-change diff at the moment a gestor applies the recomputed
-- values from the popover's "Actualizar con datos nuevos" action (applyFresh()).
-- Lets every screen show a same-day "cambios aplicados" notice even though the
-- stale values themselves are gone once affected_by_kb_change is cleared.
ALTER TABLE public.limpiezas
  ADD COLUMN IF NOT EXISTS affected_resolved_en timestamptz,
  ADD COLUMN IF NOT EXISTS affected_resolved_diff jsonb;

NOTIFY pgrst, 'reload schema';
