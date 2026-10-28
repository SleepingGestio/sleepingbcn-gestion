-- Registre hostes (Partee) — manual "registro confirmado completo" + reclamation support.
--
-- Adds to partee_registre four columns that let a user mark a registration as manually
-- confirmed complete (e.g. the KB guest count includes a child, so "1 of 2" is in fact
-- complete). These columns are written ONLY by the app; the Partee sync job upserts an
-- explicit column list (see jobs/partee-sync/src/db.ts + logic.ts buildRow) and never
-- touches them.
--
-- No new table is created here, so no new table GRANTs are needed (partee_reclamacio already
-- has SELECT/INSERT/UPDATE/DELETE for authenticated + ALL for service_role and a FOR ALL
-- policy on can_edit_menu('registre_hostes') from 20261027120000_partee_registre.sql).
-- New columns of partee_registre are covered by the existing table-level SELECT (authenticated)
-- and ALL (service_role) grants.
--
-- Privilege change: until now authenticated had table-level UPDATE on partee_registre, i.e. an
-- editor of 'registre_hostes' could change ANY column (estado, num_viajeros, ...) through the
-- Data API, although the app never needs to (only the sync, via service_role, writes them).
-- Here table-level UPDATE is replaced by a column-level UPDATE on the 4 new columns only.
-- RLS (write_registre_hostes -> can_edit_menu('registre_hostes')) still decides WHICH users
-- can update. INSERT and DELETE grants are left as they were.

-- 1. New columns (idempotent).
ALTER TABLE public.partee_registre
  ADD COLUMN IF NOT EXISTS registro_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registro_confirmado_por integer REFERENCES public.personal(id_persona),
  ADD COLUMN IF NOT EXISTS registro_confirmado_en timestamptz,
  ADD COLUMN IF NOT EXISTS registro_confirmado_nota text;

-- 2. Column-level UPDATE for authenticated (revoke the table-level one first; the REVOKE is a
--    no-op if it was already removed, and column grants are independent of it).
REVOKE UPDATE ON public.partee_registre FROM authenticated;
GRANT UPDATE (
  registro_confirmado,
  registro_confirmado_por,
  registro_confirmado_en,
  registro_confirmado_nota
) ON public.partee_registre TO authenticated;

-- 3. Latest reclamation per registration (list ordered newest first).
CREATE INDEX IF NOT EXISTS idx_partee_reclamacio_registre_enviada
  ON public.partee_reclamacio (id_registre, enviada_en DESC);

NOTIFY pgrst, 'reload schema';
