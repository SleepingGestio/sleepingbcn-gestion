-- Rastro al descartar un aviso de cambio de Krossbooking.
--
-- Hasta ahora solo "actualizar con datos nuevos" (applyFresh) dejaba constancia,
-- en affected_resolved_en / affected_resolved_diff. "Marcar como revisada"
-- (markReviewed) —descartar el aviso SIN aplicarlo— limpiaba las banderas y no
-- guardaba absolutamente nada: el aviso desaparecía y nadie podía saber después
-- que Krossbooking había cambiado algo, ni quién decidió ignorarlo. Es la acción
-- con consecuencias reales (una limpieza puede acabar en el día equivocado o no
-- hacerse) y era la única sin auditoría.
--
-- Hace falta distinguir las dos acciones, no solo registrarlas: Mi Día ya lee
-- affected_resolved_en/_diff para mostrar "limpieza con cambios aplicados hoy",
-- así que si el descarte rellenara esas columnas sin más, la app afirmaría que
-- se aplicaron unos cambios que en realidad se tiraron a la basura.
--
-- El nombre se guarda además del id a propósito: es una foto del momento, igual
-- que affected_resolved_diff, y así cualquier pantalla puede mostrar quién fue
-- sin resolver el id contra `personal` en cada sitio. Sin FK por el mismo
-- motivo: el registro debe sobrevivir a que esa persona se dé de baja.

ALTER TABLE public.limpiezas
  ADD COLUMN IF NOT EXISTS affected_resolved_accion text,
  ADD COLUMN IF NOT EXISTS affected_resolved_por integer,
  ADD COLUMN IF NOT EXISTS affected_resolved_por_nombre text;

-- NULL pasa el CHECK (filas antiguas y limpiezas nunca afectadas).
ALTER TABLE public.limpiezas
  DROP CONSTRAINT IF EXISTS limpiezas_affected_resolved_accion_check;

ALTER TABLE public.limpiezas
  ADD CONSTRAINT limpiezas_affected_resolved_accion_check
    CHECK (
      affected_resolved_accion IS NULL
      OR affected_resolved_accion IN ('aplicado', 'descartado')
    );

NOTIFY pgrst, 'reload schema';
