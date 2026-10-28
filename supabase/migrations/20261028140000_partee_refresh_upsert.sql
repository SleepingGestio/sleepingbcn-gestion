-- Registre hostes (Partee) — upsert of freshly synced rows from the app ("Actualizar ahora").
--
-- WHO CAN CALL IT: any `authenticated` user for whom can_edit_menu('registre_hostes') is true.
--   The first statement of the function re-checks that, so EXECUTE being granted to `authenticated`
--   does not by itself let anybody write. `anon` and PUBLIC cannot execute it; `service_role` keeps
--   access (it owns the default privileges and bypasses everything anyway).
--
-- WHY IT EXISTS: the app Worker refreshes ONE reservation from Partee and has to write the result to
--   partee_registre. We do not want the Supabase service role key in the Worker. `authenticated` cannot
--   write those columns directly (it only has UPDATE on the four registro_confirmado* columns), so this
--   SECURITY DEFINER function does the write with a fixed, validated column list.
--
-- WHAT IT WRITES: exactly the columns the sync job writes (jobs/partee-sync/src/logic.ts buildRow):
--   numero_reserva, id_apt, fecha_checkin, ultimo_sync, actualizado_en, partee_reservation_id, parte_id,
--   estado, is_borrador, num_viajeros, num_lote, checkin_url. It NEVER writes ses_codigo_estado, ses_desc,
--   parte_enviado_en, registro_confirmado*, creado_en.
--
-- NEVER DOWNGRADES a sent parte, with the SAME rule as `wouldDowngrade` in the job: an existing row in
--   finalizado/anulado is left untouched when the incoming estado is sin_registro or iniciado, and is
--   reported in "needs_review". Any other incoming estado is written, so a parte that Partee reopened
--   (finalizado -> borrador) is accepted exactly like the job accepts it.
--
-- TRUST MODEL: a user who passes the permission check could call this function directly with arbitrary
--   values inside the validated set (known keys, valid estado, real reservation/apartment through the FKs,
--   at most 20 rows). That is acceptable because the editors of this menu are administrators; the strict
--   validation only limits what a mistake or a bug in the client could do.
--
-- NOTE: this file mirrors the version applied by hand in the Supabase SQL Editor (dollar-quote tag $fn$,
--   no COMMENT ON FUNCTION, permission/size messages without interpolated values).

CREATE OR REPLACE FUNCTION public.partee_refresh_upsert(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_allowed_keys constant text[] := ARRAY[
    'numero_reserva', 'id_apt', 'fecha_checkin', 'ultimo_sync', 'actualizado_en',
    'partee_reservation_id', 'parte_id', 'estado', 'is_borrador', 'num_viajeros',
    'num_lote', 'checkin_url'
  ];
  v_estados constant text[] := ARRAY[
    'sin_registro', 'iniciado', 'borrador', 'finalizado', 'anulado', 'error', 'manual'
  ];
  v_sent constant text[] := ARRAY['finalizado', 'anulado'];
  v_row jsonb;
  v_key text;
  v_numero text;
  v_apt integer;
  v_estado text;
  v_count integer;
  v_upserted integer := 0;
  v_review jsonb := '[]'::jsonb;
BEGIN
  -- 1. Permission, always first.
  IF NOT public.can_edit_menu('registre_hostes') THEN
    RAISE EXCEPTION 'partee_refresh_upsert: permission denied'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Shape of the payload.
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'partee_refresh_upsert: p_rows must be a JSON array'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 20 THEN
    RAISE EXCEPTION 'partee_refresh_upsert: too many rows (max 20)'
      USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'partee_refresh_upsert: every element must be a JSON object'
        USING ERRCODE = '22023';
    END IF;

    -- 3. Exactly the known keys.
    FOR v_key IN SELECT jsonb_object_keys(v_row) LOOP
      IF NOT (v_key = ANY (v_allowed_keys)) THEN
        RAISE EXCEPTION 'partee_refresh_upsert: unknown key "%"', v_key
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- 4. Required values.
    IF coalesce(btrim(v_row ->> 'numero_reserva'), '') = ''
       OR (v_row ->> 'id_apt') IS NULL
       OR (v_row ->> 'fecha_checkin') IS NULL
       OR (v_row ->> 'estado') IS NULL THEN
      RAISE EXCEPTION 'partee_refresh_upsert: numero_reserva, id_apt, fecha_checkin and estado are required'
        USING ERRCODE = '22023';
    END IF;

    v_numero := v_row ->> 'numero_reserva';
    v_apt := (v_row ->> 'id_apt')::integer;
    v_estado := v_row ->> 'estado';

    IF NOT (v_estado = ANY (v_estados)) THEN
      RAISE EXCEPTION 'partee_refresh_upsert: invalid estado "%"', v_estado
        USING ERRCODE = '22023';
    END IF;

    -- 5. Upsert of the sync columns only. The WHERE makes the never-downgrade rule atomic with the write:
    --    when it is false the row is neither inserted nor updated (ROW_COUNT = 0), which only happens for
    --    an existing sent row receiving sin_registro / iniciado. FKs reject unknown reservations/apartments.
    INSERT INTO public.partee_registre AS r (
      numero_reserva, id_apt, fecha_checkin, ultimo_sync, actualizado_en,
      partee_reservation_id, parte_id, estado, is_borrador, num_viajeros, num_lote, checkin_url
    ) VALUES (
      v_numero,
      v_apt,
      (v_row ->> 'fecha_checkin')::date,
      coalesce((v_row ->> 'ultimo_sync')::timestamptz, now()),
      coalesce((v_row ->> 'actualizado_en')::timestamptz, now()),
      (v_row ->> 'partee_reservation_id')::bigint,
      (v_row ->> 'parte_id')::bigint,
      v_estado,
      (v_row ->> 'is_borrador')::boolean,
      (v_row ->> 'num_viajeros')::integer,
      v_row ->> 'num_lote',
      v_row ->> 'checkin_url'
    )
    ON CONFLICT (numero_reserva, id_apt) DO UPDATE SET
      fecha_checkin = EXCLUDED.fecha_checkin,
      ultimo_sync = EXCLUDED.ultimo_sync,
      actualizado_en = EXCLUDED.actualizado_en,
      partee_reservation_id = EXCLUDED.partee_reservation_id,
      parte_id = EXCLUDED.parte_id,
      estado = EXCLUDED.estado,
      is_borrador = EXCLUDED.is_borrador,
      num_viajeros = EXCLUDED.num_viajeros,
      num_lote = EXCLUDED.num_lote,
      checkin_url = EXCLUDED.checkin_url
    WHERE NOT (r.estado = ANY (v_sent) AND EXCLUDED.estado IN ('sin_registro', 'iniciado'));

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      v_review := v_review || jsonb_build_array(
        jsonb_build_object('numero_reserva', v_numero, 'id_apt', v_apt)
      );
    ELSE
      v_upserted := v_upserted + v_count;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('upserted', v_upserted, 'needs_review', v_review);
END;
$fn$;

-- Only signed-in users may execute it (the function re-checks can_edit_menu). service_role keeps access.
REVOKE ALL ON FUNCTION public.partee_refresh_upsert(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partee_refresh_upsert(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
