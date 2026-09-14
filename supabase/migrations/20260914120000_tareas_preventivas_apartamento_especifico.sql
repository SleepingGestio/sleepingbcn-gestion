-- Mantenimiento preventivo — third "Dónde se aplica" mode: a single specific
-- apartment, in addition to the existing "todos los apartamentos activos del
-- grupo" and "espacio común del grupo" modes.

ALTER TABLE public.tareas_preventivas_aplicaciones
  DROP CONSTRAINT tareas_preventivas_aplicaciones_shape;

ALTER TABLE public.tareas_preventivas_aplicaciones
  DROP CONSTRAINT IF EXISTS tareas_preventivas_aplicaciones_modo_aplicacion_check;

ALTER TABLE public.tareas_preventivas_aplicaciones
  ADD COLUMN id_apt integer REFERENCES public.apartamentos(id_apt);

ALTER TABLE public.tareas_preventivas_aplicaciones
  ADD CONSTRAINT tareas_preventivas_aplicaciones_modo_aplicacion_check
  CHECK (modo_aplicacion IN ('apartamentos_activos', 'espacio_comun', 'apartamento_especifico'));

ALTER TABLE public.tareas_preventivas_aplicaciones
  ADD CONSTRAINT tareas_preventivas_aplicaciones_shape CHECK (
    (modo_aplicacion = 'apartamentos_activos' AND id_tipo_espacio_comun IS NULL AND id_apt IS NULL)
    OR
    (modo_aplicacion = 'espacio_comun' AND id_tipo_espacio_comun IS NOT NULL AND id_apt IS NULL)
    OR
    (modo_aplicacion = 'apartamento_especifico' AND id_tipo_espacio_comun IS NULL AND id_apt IS NOT NULL)
  );

-- Prevent the same tarea from referencing the same specific apartment twice
-- (mirrors tareas_preventivas_aplicaciones_apt_activos_uq / _espacio_uq).
CREATE UNIQUE INDEX IF NOT EXISTS tareas_preventivas_aplicaciones_apt_especifico_uq
  ON public.tareas_preventivas_aplicaciones (id_tarea_preventiva, id_apt)
  WHERE modo_aplicacion = 'apartamento_especifico';

NOTIFY pgrst, 'reload schema';
