CREATE TABLE IF NOT EXISTS public.personal_ajustos_hores (
  id_ajuste bigint primary key generated always as identity,
  id_persona bigint not null,
  fecha date not null,
  tipo text,
  horas numeric not null,
  notas text,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_ajustos_hores TO authenticated;
GRANT ALL ON public.personal_ajustos_hores TO service_role;

ALTER TABLE public.personal_ajustos_hores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ajustos"
  ON public.personal_ajustos_hores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert ajustos"
  ON public.personal_ajustos_hores FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update ajustos"
  ON public.personal_ajustos_hores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete ajustos"
  ON public.personal_ajustos_hores FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ajustos_persona_fecha
  ON public.personal_ajustos_hores (id_persona, fecha);