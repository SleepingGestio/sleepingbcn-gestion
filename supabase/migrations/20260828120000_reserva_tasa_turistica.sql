-- "Tasa turística" box of the "Inf. económica" tab: make the expected amount
-- editable and record what was actually collected in cash.
--
-- Two nullable numeric columns, same shape/convention as the financial fields
-- in 20260826140000 (PagadoEstancia/PagadoLimpieza) and 20260827120000
-- (CuentaVerificada):
--
--   "TasaTuristica"         — expected tourist-tax amount. Prefilled in the
--                             popover from reservas_kb."Cargo tasa turística"
--                             (KB's imported figure, frequently wrong), then
--                             freely editable; once a value is saved a prefill
--                             never overwrites it again (the "only when null"
--                             guard, identical to PagadoEstancia).
--   "TasaTuristicaCobrada"  — tourist tax actually collected in cash. Pure
--                             manual entry: no prefill, no suggestion. NOT
--                             linked to limpiezas or any cleaning workflow yet
--                             — that (envelope prepared -> collected -> tracked)
--                             is a deliberately deferred later round.
--
-- Both stay "informativa, fuera de la cuenta": no report / view / aggregation
-- reads them, and the popover keeps them out of the ledger and the commission
-- math.
--
-- Resolved-literal principle unchanged (see 20260826140000 / 20260826120000):
-- the value stored is the literal in force when the reservation was closed; a
-- later KB re-import into reservas_kb never rewrites it, because the KB import
-- job only ever writes reservas_kb and reservas_gestio rows are created lazily
-- by the app (upsertGestio) — same guarantee every other field in this tab has.
--
-- Left untouched on purpose: the dormant legacy columns reservas_gestio.ImpTTAX
-- and .TaxCobradas (baseline 20260717160000), which are wired to nothing
-- anywhere in the app. Reusing them was considered and rejected — a legacy
-- snapshot may hold stale values that the "prefill only when null" guard would
-- surface instead of the KB prefill, and the cryptic names clash with the
-- PascalCase financial-field set.
--
-- No RLS/policy/grant here: reservas_gestio has no RLS enabled at all (see the
-- note in 20260826140000); access control on this table remains its own
-- separate design pass.
ALTER TABLE public.reservas_gestio
  ADD COLUMN IF NOT EXISTS "TasaTuristica" numeric CHECK ("TasaTuristica" >= 0),
  ADD COLUMN IF NOT EXISTS "TasaTuristicaCobrada" numeric CHECK ("TasaTuristicaCobrada" >= 0);

NOTIFY pgrst, 'reload schema';
