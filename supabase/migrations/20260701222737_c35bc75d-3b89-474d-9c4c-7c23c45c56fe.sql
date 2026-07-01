ALTER TABLE public.personal_ajustos_hores
  ADD COLUMN IF NOT EXISTS tipus_computa text NOT NULL DEFAULT 'ajust'
  CHECK (tipus_computa IN ('treballades','objectiu','ajust'));

-- Backfill existing rows based on tipo
UPDATE public.personal_ajustos_hores
   SET tipus_computa = CASE
     WHEN tipo IN ('vacaciones','baja') THEN 'objectiu'
     WHEN tipo = 'treballades' THEN 'treballades'
     ELSE 'ajust'
   END;