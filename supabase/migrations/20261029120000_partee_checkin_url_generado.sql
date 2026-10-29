-- Registre hostes (Partee) — check-in link generated from the app ("Generar enlace").
--
-- WHY A NEW COLUMN: the hourly Partee sync rewrites partee_registre.checkin_url on every run (it is NULL for a
--   `sin_registro` row), so a URL created from the app would be wiped. The generated URL therefore lives in its
--   own column, which neither the job (jobs/partee-sync buildRow) nor partee_refresh_upsert ever writes. The app
--   shows checkin_url ?? checkin_url_generado.
--
-- NO NEW TABLE => no new table GRANTs: the new columns are covered by the existing table-level SELECT for
--   `authenticated` and ALL for `service_role` (20261027120000_partee_registre.sql). `authenticated` has no UPDATE
--   on these columns (column-level UPDATE exists only for the four registro_confirmado* columns), so the only way
--   to write them from the app is the SECURITY DEFINER function below.
--
-- WHO CAN CALL IT: any `authenticated` user for whom can_edit_menu('registre_hostes') is true; the first statement
--   re-checks that. `anon` and PUBLIC cannot execute it; `service_role` keeps access.
--
-- WHAT IT WRITES: checkin_url_generado / _en / _por of ONE existing row, and only while estado = 'sin_registro'
--   (atomic with the state check: if a sync moved the row on meanwhile, 0 rows are updated and the app is told).
--   `_por` uses public.current_id_persona() (email -> personal.id_persona, the same lookup the app uses for
--   registro_confirmado_por); NULL if there is no match.

-- 1. Columns (idempotent).
ALTER TABLE public.partee_registre
  ADD COLUMN IF NOT EXISTS checkin_url_generado text,
  ADD COLUMN IF NOT EXISTS checkin_url_generado_en timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_url_generado_por integer REFERENCES public.personal(id_persona);

-- 2. Function.
CREATE OR REPLACE FUNCTION public.partee_set_checkin_url(
  p_numero_reserva text,
  p_id_apt integer,
  p_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_persona integer;
  v_count integer;
BEGIN
  -- 1. Permission, always first.
  IF NOT public.can_edit_menu('registre_hostes') THEN
    RAISE EXCEPTION 'partee_set_checkin_url: permission denied' USING ERRCODE = '42501';
  END IF;

  -- 2. Inputs.
  IF coalesce(btrim(p_numero_reserva), '') = '' OR p_id_apt IS NULL THEN
    RAISE EXCEPTION 'partee_set_checkin_url: numero_reserva and id_apt are required' USING ERRCODE = '22023';
  END IF;
  IF p_url IS NULL OR length(p_url) > 300
     OR p_url !~ '^https://([a-z0-9-]+\.)*partee\.es/[^[:space:]]+$' THEN
    RAISE EXCEPTION 'partee_set_checkin_url: invalid url' USING ERRCODE = '22023';
  END IF;

  -- 3. Who did it (same email lookup as the app's registro_confirmado_por); NULL if there is no match.
  v_persona := public.current_id_persona()::integer;

  -- 4. Only an existing sin_registro row.
  UPDATE public.partee_registre
  SET checkin_url_generado = p_url,
      checkin_url_generado_en = now(),
      checkin_url_generado_por = v_persona
  WHERE numero_reserva = p_numero_reserva
    AND id_apt = p_id_apt
    AND estado = 'sin_registro';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_count);
END;
$fn$;

-- Only signed-in users may execute it (the function re-checks can_edit_menu). service_role keeps access.
REVOKE ALL ON FUNCTION public.partee_set_checkin_url(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partee_set_checkin_url(text, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
