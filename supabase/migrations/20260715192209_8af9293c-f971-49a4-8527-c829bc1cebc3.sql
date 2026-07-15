
-- Drop permissive "true" policies on all four tables
DROP POLICY IF EXISTS "Authenticated can delete ajustos" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "Authenticated can insert ajustos" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "Authenticated can read ajustos"   ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "Authenticated can update ajustos" ON public.personal_ajustos_hores;

DROP POLICY IF EXISTS "Auth delete periodos" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "Auth insert periodos" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "Auth read periodos"   ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "Auth update periodos" ON public.personal_periodos_actividad;

DROP POLICY IF EXISTS "Auth can delete resum_mes" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "Auth can insert resum_mes" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "Auth can read resum_mes"   ON public.personal_resum_mes;
DROP POLICY IF EXISTS "Auth can update resum_mes" ON public.personal_resum_mes;

DROP POLICY IF EXISTS "Auth can delete vac_any" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "Auth can insert vac_any" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "Auth can read vac_any"   ON public.personal_vacances_any;
DROP POLICY IF EXISTS "Auth can update vac_any" ON public.personal_vacances_any;

-- Revoke direct Data API privileges from anon/authenticated; keep service_role only.
REVOKE ALL ON public.personal_ajustos_hores       FROM anon, authenticated;
REVOKE ALL ON public.personal_periodos_actividad  FROM anon, authenticated;
REVOKE ALL ON public.personal_resum_mes           FROM anon, authenticated;
REVOKE ALL ON public.personal_vacances_any        FROM anon, authenticated;

GRANT ALL ON public.personal_ajustos_hores       TO service_role;
GRANT ALL ON public.personal_periodos_actividad  TO service_role;
GRANT ALL ON public.personal_resum_mes           TO service_role;
GRANT ALL ON public.personal_vacances_any        TO service_role;
