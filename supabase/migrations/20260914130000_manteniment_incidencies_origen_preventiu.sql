-- generarOcurrencias() (mantenimiento preventivo) has always inserted
-- origen: 'preventiu' — and ORIGEN_LABEL in src/lib/mantenimiento.ts has
-- always had a label for it — but the live CHECK constraint on
-- manteniment_incidencies.origen was never extended to allow it, so every
-- generation attempt from this feature failed with a check violation.

ALTER TABLE public.manteniment_incidencies
  DROP CONSTRAINT manteniment_incidencies_origen_check;

ALTER TABLE public.manteniment_incidencies
  ADD CONSTRAINT manteniment_incidencies_origen_check
  CHECK (origen = ANY (ARRAY['gestor'::text, 'neteja'::text, 'manteniment'::text, 'preventiu'::text]));

NOTIFY pgrst, 'reload schema';
