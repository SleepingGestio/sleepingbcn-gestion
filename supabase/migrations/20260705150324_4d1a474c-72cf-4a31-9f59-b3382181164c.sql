CREATE TABLE IF NOT EXISTS public.personal_periodos_actividad (
  id_periodo bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  id_persona bigint NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  motivo text,
  horas_objetivo_mes numeric,
  dies_vacances_any numeric NOT NULL DEFAULT 23,
  creado_por bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_periodos_actividad TO authenticated;
GRANT ALL ON public.personal_periodos_actividad TO service_role;

ALTER TABLE public.personal_periodos_actividad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read periodos" ON public.personal_periodos_actividad FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert periodos" ON public.personal_periodos_actividad FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update periodos" ON public.personal_periodos_actividad FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete periodos" ON public.personal_periodos_actividad FOR DELETE TO authenticated USING (true);