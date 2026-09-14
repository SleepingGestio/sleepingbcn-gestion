-- Mantenimiento preventivo — "Anular ocurrencia programada": a soft
-- (definitiva = false) or permanent (definitiva = true) override for one
-- specific tarea+location+year+month época del año occurrence, so it never
-- comes back as "programada"/vencida/próxima on either the planning grid or
-- the queue screen.
--
-- Column names (id_apt/id_grup/id_tipo_espacio_comun) deliberately match
-- locationInsertFields()'s existing return shape (used for
-- manteniment_incidencies inserts), not tareas_preventivas_aplicaciones'
-- own id_grupo spelling, so that helper can build this table's location
-- columns too without a parallel mapping function.

CREATE TABLE public.tareas_preventivas_anulaciones (
  id_anulacion bigint generated always as identity primary key,
  id_tarea_preventiva bigint NOT NULL REFERENCES public.tareas_preventivas(id_tarea_preventiva) ON DELETE CASCADE,
  id_grup integer NOT NULL REFERENCES public.grupos_apartamentos(id_grupo),
  id_apt integer REFERENCES public.apartamentos(id_apt),
  id_tipo_espacio_comun integer REFERENCES public.tipos_espacio_comun(id_tipo),
  anyo integer NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  definitiva boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_por integer REFERENCES public.personal(id_persona),
  CONSTRAINT tareas_preventivas_anulaciones_shape CHECK (
    (id_apt IS NOT NULL AND id_tipo_espacio_comun IS NULL)
    OR
    (id_apt IS NULL AND id_tipo_espacio_comun IS NOT NULL)
  )
);

-- Prevent duplicate annulment rows for the same tarea+location+year+month
-- (mirrors tareas_preventivas_aplicaciones_apt_activos_uq / _espacio_uq /
-- _apt_especifico_uq).
CREATE UNIQUE INDEX tareas_preventivas_anulaciones_apt_uq
  ON public.tareas_preventivas_anulaciones (id_tarea_preventiva, id_apt, anyo, mes)
  WHERE id_apt IS NOT NULL;

CREATE UNIQUE INDEX tareas_preventivas_anulaciones_espacio_uq
  ON public.tareas_preventivas_anulaciones (id_tarea_preventiva, id_grup, id_tipo_espacio_comun, anyo, mes)
  WHERE id_tipo_espacio_comun IS NOT NULL;

ALTER TABLE public.tareas_preventivas_anulaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.tareas_preventivas_anulaciones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_mantenimiento" ON public.tareas_preventivas_anulaciones
  FOR ALL TO authenticated
  USING (can_edit_menu('mantenimiento'))
  WITH CHECK (can_edit_menu('mantenimiento'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas_preventivas_anulaciones TO authenticated;

NOTIFY pgrst, 'reload schema';
