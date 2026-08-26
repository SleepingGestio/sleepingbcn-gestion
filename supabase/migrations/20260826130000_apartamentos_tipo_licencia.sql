-- Link each apartment to its tourist license type, so the OTA-commission
-- lookup (tarifas_comision_ota, keyed by id_tipo_licencia x id_canal) can
-- be resolved per apartment. Mirrors the apartamentos.id_categoria
-- precedent (20260727150000_tipos_categoria_apartamento.sql): bare
-- ADD COLUMN + FK, no RLS/policy changes to apartamentos itself.

ALTER TABLE public.apartamentos
  ADD COLUMN IF NOT EXISTS id_tipo_licencia bigint REFERENCES public.tipos_licencia_turistica(id_tipo_licencia);

NOTIFY pgrst, 'reload schema';
