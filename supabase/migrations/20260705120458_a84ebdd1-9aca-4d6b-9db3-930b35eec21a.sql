-- personal_resum_mes: monthly closure per worker
CREATE TABLE IF NOT EXISTS public.personal_resum_mes (
  id_resum bigint primary key generated always as identity,
  id_persona bigint not null,
  any_mes int not null, -- year
  mes int not null check (mes between 1 and 12),
  horas_objetivo_base numeric not null default 0,
  horas_reduccion numeric not null default 0,
  horas_objetivo_efectiu numeric not null default 0,
  horas_treballades numeric not null default 0,
  horas_ajust_saldo numeric not null default 0,
  saldo_mes numeric not null default 0,
  saldo_acumulat_anterior numeric not null default 0,
  saldo_acumulat_fi numeric not null default 0,
  decisio_tancament text check (decisio_tancament in ('liquidar','acumular')),
  cerrado boolean not null default false,
  cerrado_en timestamptz,
  cerrado_por bigint,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id_persona, any_mes, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_resum_mes TO authenticated;
GRANT ALL ON public.personal_resum_mes TO service_role;

ALTER TABLE public.personal_resum_mes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read resum_mes" ON public.personal_resum_mes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert resum_mes" ON public.personal_resum_mes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update resum_mes" ON public.personal_resum_mes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete resum_mes" ON public.personal_resum_mes FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_resum_persona_year_month ON public.personal_resum_mes (id_persona, any_mes desc, mes desc);

-- personal_vacances_any: contractual year vacation allotment per worker
CREATE TABLE IF NOT EXISTS public.personal_vacances_any (
  id_vac_any bigint primary key generated always as identity,
  id_persona bigint not null,
  data_inici_any date not null,
  data_fi_any date not null,
  dies_assignats int not null default 30,
  hores_calculades numeric not null default 0,
  hores_assignades numeric not null default 0,
  notas text,
  creado_por bigint,
  creado_en timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id_persona, data_inici_any)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_vacances_any TO authenticated;
GRANT ALL ON public.personal_vacances_any TO service_role;

ALTER TABLE public.personal_vacances_any ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read vac_any" ON public.personal_vacances_any FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert vac_any" ON public.personal_vacances_any FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update vac_any" ON public.personal_vacances_any FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete vac_any" ON public.personal_vacances_any FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vac_any_persona ON public.personal_vacances_any (id_persona, data_inici_any desc);

-- Reusable updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_resum_mes_updated ON public.personal_resum_mes;
CREATE TRIGGER trg_resum_mes_updated BEFORE UPDATE ON public.personal_resum_mes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_vac_any_updated ON public.personal_vacances_any;
CREATE TRIGGER trg_vac_any_updated BEFORE UPDATE ON public.personal_vacances_any
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();