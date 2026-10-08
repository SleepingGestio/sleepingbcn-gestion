-- Cleaning tariffs by period. Until now tarifas_limpieza held ONE price per
-- cleaning category (UNIQUE on id_categoria_limpieza). Each category can now
-- have several price steps, each in force from `vigente_desde` until the next
-- step of the same category starts (no explicit end date, so there can be no
-- gaps or overlaps). The reservation's Check-out date decides which step
-- applies (resolved client-side in src/lib/tarifas.ts: resolveCosteLimpieza).

ALTER TABLE public.tarifas_limpieza
  ADD COLUMN IF NOT EXISTS vigente_desde date NOT NULL DEFAULT DATE '2000-01-01';

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.tarifas_limpieza'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND (SELECT attname FROM pg_attribute
           WHERE attrelid = con.conrelid AND attnum = con.conkey[1]) = 'id_categoria_limpieza'
  LOOP
    EXECUTE format('ALTER TABLE public.tarifas_limpieza DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tarifas_limpieza
  ADD CONSTRAINT tarifas_limpieza_categoria_vigente_desde_key
  UNIQUE (id_categoria_limpieza, vigente_desde);

NOTIFY pgrst, 'reload schema';
