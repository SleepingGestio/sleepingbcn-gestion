-- Mantenimiento preventivo — Part 1: data model only (no screens/logic yet).
--
-- Adds:
--   1. tareas_preventivas               — the recurring-task definition/plan.
--   2. tareas_preventivas_meses         — side table for the "época del año"
--                                          periodicity mode: one row per
--                                          (tarea, mes) so a task can recur in
--                                          several months a year (e.g. May +
--                                          October for "Revisión de toldos").
--   3. tareas_preventivas_aplicaciones  — where each tarea preventiva
--                                          applies: one row per grupo
--                                          (+ optionally one espacio común
--                                          type within that grupo).
--   4. manteniment_incidencies.id_tarea_preventiva — links a generated
--      incidencia back to the tarea preventiva that produced it, so a later
--      migration/screen can compute the last real closure per location and
--      derive the next due date from it.
--
-- Part 2 (separate prompt, after this migration is applied) builds the
-- screens and generation logic on top of this shape.

-- 1. Tarea preventiva definition.
CREATE TABLE IF NOT EXISTS public.tareas_preventivas (
  id_tarea_preventiva bigint generated always as identity primary key,
  nombre text NOT NULL,
  descripcion text,
  modo_periodicidad text NOT NULL CHECK (modo_periodicidad IN ('intervalo', 'epoca_anyo')),
  intervalo_cantidad integer CHECK (intervalo_cantidad > 0),
  intervalo_unidad text CHECK (intervalo_unidad IN ('semanas', 'meses')),
  -- Reserves room for a second generation kind (attaching to a limpieza
  -- instead of creating a manteniment_incidencia) without an enum-type
  -- migration later — extending this just means dropping/adding the CHECK.
  tipo_generacion text NOT NULL DEFAULT 'incidencia' CHECK (tipo_generacion IN ('incidencia')),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_por integer REFERENCES public.personal(id_persona),
  CONSTRAINT tareas_preventivas_periodicidad_shape CHECK (
    (modo_periodicidad = 'intervalo' AND intervalo_cantidad IS NOT NULL AND intervalo_unidad IS NOT NULL)
    OR
    (modo_periodicidad = 'epoca_anyo' AND intervalo_cantidad IS NULL AND intervalo_unidad IS NULL)
  )
);

ALTER TABLE public.tareas_preventivas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tareas_preventivas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_mantenimiento" ON public.tareas_preventivas
  FOR ALL TO authenticated
  USING (can_edit_menu('mantenimiento'))
  WITH CHECK (can_edit_menu('mantenimiento'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas_preventivas TO authenticated;

-- 2. "Época del año" months — only meaningful when modo_periodicidad =
--    'epoca_anyo' (not enforced cross-table here; Part 2's screen owns that
--    invariant, same as the rest of this repo's validation split).
CREATE TABLE IF NOT EXISTS public.tareas_preventivas_meses (
  id_tarea_preventiva bigint NOT NULL REFERENCES public.tareas_preventivas(id_tarea_preventiva) ON DELETE CASCADE,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  PRIMARY KEY (id_tarea_preventiva, mes)
);

ALTER TABLE public.tareas_preventivas_meses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tareas_preventivas_meses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_mantenimiento" ON public.tareas_preventivas_meses
  FOR ALL TO authenticated
  USING (can_edit_menu('mantenimiento'))
  WITH CHECK (can_edit_menu('mantenimiento'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas_preventivas_meses TO authenticated;

-- 3. Where each tarea preventiva applies. A tarea can have several
--    applications; each one is either "every active apartment in this
--    grupo" or "this one espacio común type within this grupo" — e.g.
--    "Prevención de cucarachas" = RC·Garaje + RC·Almacén (espacio_comun) +
--    Holanda·apartamentos_activos, but NOT RC's apartments.
CREATE TABLE IF NOT EXISTS public.tareas_preventivas_aplicaciones (
  id_aplicacion bigint generated always as identity primary key,
  id_tarea_preventiva bigint NOT NULL REFERENCES public.tareas_preventivas(id_tarea_preventiva) ON DELETE CASCADE,
  id_grupo integer NOT NULL REFERENCES public.grupos_apartamentos(id_grupo),
  modo_aplicacion text NOT NULL CHECK (modo_aplicacion IN ('apartamentos_activos', 'espacio_comun')),
  id_tipo_espacio_comun integer REFERENCES public.tipos_espacio_comun(id_tipo),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tareas_preventivas_aplicaciones_shape CHECK (
    (modo_aplicacion = 'apartamentos_activos' AND id_tipo_espacio_comun IS NULL)
    OR
    (modo_aplicacion = 'espacio_comun' AND id_tipo_espacio_comun IS NOT NULL)
  )
);

-- Prevent duplicate applications of the same tarea to the same
-- grupo/espacio (NULLs make a plain UNIQUE constraint insufficient here
-- since two 'apartamentos_activos' rows would both have NULL espacio).
CREATE UNIQUE INDEX IF NOT EXISTS tareas_preventivas_aplicaciones_apt_activos_uq
  ON public.tareas_preventivas_aplicaciones (id_tarea_preventiva, id_grupo)
  WHERE modo_aplicacion = 'apartamentos_activos';

CREATE UNIQUE INDEX IF NOT EXISTS tareas_preventivas_aplicaciones_espacio_uq
  ON public.tareas_preventivas_aplicaciones (id_tarea_preventiva, id_grupo, id_tipo_espacio_comun)
  WHERE modo_aplicacion = 'espacio_comun';

ALTER TABLE public.tareas_preventivas_aplicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tareas_preventivas_aplicaciones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_mantenimiento" ON public.tareas_preventivas_aplicaciones
  FOR ALL TO authenticated
  USING (can_edit_menu('mantenimiento'))
  WITH CHECK (can_edit_menu('mantenimiento'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas_preventivas_aplicaciones TO authenticated;

-- 4. Link a generated incidencia back to the tarea preventiva that produced
--    it (nullable — most incidencias aren't preventivas).
ALTER TABLE public.manteniment_incidencies
  ADD COLUMN IF NOT EXISTS id_tarea_preventiva bigint REFERENCES public.tareas_preventivas(id_tarea_preventiva);

CREATE INDEX IF NOT EXISTS idx_manteniment_incidencies_tarea_preventiva
  ON public.manteniment_incidencies (id_tarea_preventiva);

-- 5. New origen value for incidencias created by this feature. `origen` is
--    plain text with no CHECK constraint tracked in any migration in this
--    repo (see ORIGEN_LABEL in src/lib/mantenimiento.ts, typed as
--    Record<string, string> rather than a closed union) — no DDL needed
--    here for that reason. If the live database turns out to have an
--    untracked CHECK/enum on this column, it needs extending by hand before
--    Part 2 can write 'preventiu' rows.

NOTIFY pgrst, 'reload schema';
