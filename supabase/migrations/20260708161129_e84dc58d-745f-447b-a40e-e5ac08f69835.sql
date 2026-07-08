-- Fix RLS: replace always-true policies on personal_ajustos_hores,
-- personal_periodos_actividad, personal_resum_mes, personal_vacances_any
-- with row-scoped policies (own row for mi_dia-only workers, all rows for
-- gestor/admin roles). Writes are elevated-only on all four tables.
-- Safe to run more than once: every CREATE POLICY is preceded by a
-- DROP POLICY IF EXISTS for that same policy name, and both helper
-- functions use CREATE OR REPLACE.

-- Unique index backing the email->id_persona lookup used by current_id_persona().
-- Confirmed no existing duplicate lower(mail) values before adding this.
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_mail_lower_unique
  ON public.personal (lower(mail))
  WHERE mail IS NOT NULL;

-- Resolves the calling user's own id_persona from their auth email.
CREATE OR REPLACE FUNCTION public.current_id_persona()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id_persona FROM public.personal
  WHERE lower(mail) = lower(auth.email())
  LIMIT 1;
$$;

-- True if the calling user holds AdminAPP (id_rol = 1) or any active role
-- granted view access to at least one menu in rol_permisos (i.e. anything
-- beyond the implicit mi_dia-only default).
CREATE OR REPLACE FUNCTION public.is_gestor_or_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personal_roles pr
    WHERE pr.id_persona = public.current_id_persona()
      AND pr.fecha_hasta IS NULL
      AND (
        pr.id_rol = 1
        OR EXISTS (
          SELECT 1 FROM public.rol_permisos rp
          WHERE rp.id_rol = pr.id_rol AND rp.pot_veure = true
        )
      )
  );
$$;

-- ---------------------------------------------------------------------
-- personal_ajustos_hores: own row (read) or elevated (read all / write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read ajustos" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "Authenticated can insert ajustos" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "Authenticated can update ajustos" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "Authenticated can delete ajustos" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "select_own_or_elevated" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "update_elevated_only" ON public.personal_ajustos_hores;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.personal_ajustos_hores;

CREATE POLICY "select_own_or_elevated" ON public.personal_ajustos_hores
  FOR SELECT TO authenticated
  USING (public.is_gestor_or_admin() OR id_persona = public.current_id_persona());

CREATE POLICY "insert_elevated_only" ON public.personal_ajustos_hores
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.personal_ajustos_hores
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.personal_ajustos_hores
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());

-- ---------------------------------------------------------------------
-- personal_periodos_actividad: own row (read) or elevated (read all / write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth read periodos" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "Auth insert periodos" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "Auth update periodos" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "Auth delete periodos" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "select_own_or_elevated" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "update_elevated_only" ON public.personal_periodos_actividad;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.personal_periodos_actividad;

CREATE POLICY "select_own_or_elevated" ON public.personal_periodos_actividad
  FOR SELECT TO authenticated
  USING (public.is_gestor_or_admin() OR id_persona = public.current_id_persona());

CREATE POLICY "insert_elevated_only" ON public.personal_periodos_actividad
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.personal_periodos_actividad
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.personal_periodos_actividad
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());

-- ---------------------------------------------------------------------
-- personal_vacances_any: own row (read) or elevated (read all / write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth can read vac_any" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "Auth can insert vac_any" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "Auth can update vac_any" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "Auth can delete vac_any" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "select_own_or_elevated" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "update_elevated_only" ON public.personal_vacances_any;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.personal_vacances_any;

CREATE POLICY "select_own_or_elevated" ON public.personal_vacances_any
  FOR SELECT TO authenticated
  USING (public.is_gestor_or_admin() OR id_persona = public.current_id_persona());

CREATE POLICY "insert_elevated_only" ON public.personal_vacances_any
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.personal_vacances_any
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.personal_vacances_any
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());

-- ---------------------------------------------------------------------
-- personal_resum_mes: elevated-only for everything, no worker access at all
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth can read resum_mes" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "Auth can insert resum_mes" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "Auth can update resum_mes" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "Auth can delete resum_mes" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "select_elevated_only" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "update_elevated_only" ON public.personal_resum_mes;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.personal_resum_mes;

CREATE POLICY "select_elevated_only" ON public.personal_resum_mes
  FOR SELECT TO authenticated
  USING (public.is_gestor_or_admin());

CREATE POLICY "insert_elevated_only" ON public.personal_resum_mes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.personal_resum_mes
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.personal_resum_mes
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());
