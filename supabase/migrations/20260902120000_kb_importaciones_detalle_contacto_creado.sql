-- kb_importaciones_detalle.tipo_cambio: permitir el nuevo valor
-- 'contacto_creado'.
--
-- El importador (importar_reservas_kb_supabase2.py) crea ahora una fila de
-- detalle con tipo_cambio = 'contacto_creado' cada vez que da de alta un
-- contacto de Google para una reserva nueva (solo en modo diario). La tabla
-- tiene un CHECK que hoy solo admite 'nuevo' / 'modificado' /
-- 'eliminado_candidato', así que esos INSERT fallan con SQLSTATE 23514.
--
-- La tabla se creó fuera de este historial de migraciones (ver
-- 20260717160000_baseline_existing_tables.sql), por lo que el nombre del
-- CHECK se localiza por introspección en lugar de asumirlo. El bloque:
--   - si existe un CHECK sobre tipo_cambio que aún NO admite
--     'contacto_creado', lo elimina y lo recrea con el mismo nombre y los 4
--     valores;
--   - si ya lo admite (p. ej. al reejecutar la migración), no hace nada;
--   - si no hubiera ningún CHECK sobre tipo_cambio, tampoco hace nada.
-- El DO se ejecuta como una única sentencia (una transacción), de modo que
-- no hay ventana en la que la tabla quede sin constraint.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'kb_importaciones_detalle'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tipo_cambio%'
  LOOP
    IF c.def NOT ILIKE '%contacto_creado%' THEN
      EXECUTE format(
        'ALTER TABLE public.kb_importaciones_detalle DROP CONSTRAINT %I', c.conname
      );
      EXECUTE format(
        'ALTER TABLE public.kb_importaciones_detalle ADD CONSTRAINT %I '
        || 'CHECK (tipo_cambio = ANY (ARRAY[%L, %L, %L, %L]))',
        c.conname, 'nuevo', 'modificado', 'eliminado_candidato', 'contacto_creado'
      );
    END IF;
  END LOOP;
END $$;
