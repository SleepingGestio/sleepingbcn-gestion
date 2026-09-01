-- Vista de valores DISTINCT de reservas_kb."Estado".
--
-- Motivo: fetchDistinctEstados() en src/lib/reservas.ts obtenía los estados
-- con `.select("Estado").not("Estado","is",null).limit(2000)` y de-duplicaba
-- en el cliente. Con reservas_kb ya en ~4.612 filas (import histórico de todo
-- 2025 + 2026) ese `.limit(2000)` sin `.order()` devuelve un subconjunto
-- arbitrario, no el conjunto real de valores distintos: el filtro "Estado" de
-- /reservas acababa mostrando casi solo "Cancelada" y "Por defecto"
-- (Confirmada) salía vacío.
--
-- Una vista DISTINCT resuelve esto de raíz y escala sin importar cuántas filas
-- históricas se importen (el resultado son ~5 filas siempre). Misma convención
-- de nombre `v_*` que v_reservas_por_apartamento / v_apartamentos_nombres.
--
-- security_invoker = on: la vista se evalúa con los permisos de quien la
-- consulta, no del creador (reservas_kb no tiene RLS propia; el acceso sigue
-- siendo el mismo que hoy tiene la tabla).
CREATE OR REPLACE VIEW public.v_distinct_estados_reservas
  WITH (security_invoker = on) AS
SELECT DISTINCT "Estado"
FROM public.reservas_kb
WHERE "Estado" IS NOT NULL
ORDER BY "Estado";

GRANT SELECT ON public.v_distinct_estados_reservas TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
