-- Fix RLS: personal, personal_roles, roles, rol_permisos currently have Row
-- Level Security fully DISABLED. Any authenticated user can read and write
-- every row, including self-granting AdminAPP via personal_roles. This
-- enables RLS on all four and adds row-scoped policies.
--
-- Depends on public.current_id_persona() and public.is_gestor_or_admin()
-- from the previous migration (20260708161129) already having been applied.
--
-- Safe to run more than once: every CREATE POLICY is preceded by a
-- DROP POLICY IF EXISTS for that same policy name, both new functions use
-- CREATE OR REPLACE, and GRANTs are idempotent.

-- ---------------------------------------------------------------------
-- Two narrow SECURITY DEFINER RPCs carrying the two legitimate cases where
-- a plain (mi_dia-only) worker needs to touch data beyond their own row,
-- so the base-table policies below can stay uniformly "own row or elevated"
-- with no broader carve-outs.
-- ---------------------------------------------------------------------

-- Powers mi-dia.tsx's "Equipo trabajando este día" coworker lookup.
-- Returns only 2 non-sensitive columns for active employees.
CREATE OR REPLACE FUNCTION public.personal_codigos_by_ids(p_ids bigint[])
RETURNS TABLE(id_persona bigint, codigo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id_persona, codigo FROM public.personal
  WHERE id_persona = ANY(p_ids) AND activo = true;
$$;

GRANT EXECUTE ON FUNCTION public.personal_codigos_by_ids(bigint[]) TO authenticated;

-- Powers force-password-setup.tsx's one self-service write: a worker
-- flipping their own onboarding flag on first login, nothing else.
CREATE OR REPLACE FUNCTION public.complete_own_onboarding()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.personal SET onboarding_completat = true
  WHERE id_persona = public.current_id_persona();
$$;

GRANT EXECUTE ON FUNCTION public.complete_own_onboarding() TO authenticated;

-- ---------------------------------------------------------------------
-- personal: own row (read) or elevated (read all); writes elevated-only
-- (the one worker self-write moved to complete_own_onboarding() above)
-- ---------------------------------------------------------------------
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal TO authenticated;
GRANT ALL ON public.personal TO service_role;

DROP POLICY IF EXISTS "select_own_or_elevated" ON public.personal;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.personal;
DROP POLICY IF EXISTS "update_elevated_only" ON public.personal;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.personal;

CREATE POLICY "select_own_or_elevated" ON public.personal
  FOR SELECT TO authenticated
  USING (public.is_gestor_or_admin() OR id_persona = public.current_id_persona());

CREATE POLICY "insert_elevated_only" ON public.personal
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.personal
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.personal
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());

-- ---------------------------------------------------------------------
-- personal_roles: own row (read) or elevated (read all); writes
-- elevated-only with NO exceptions — this is the self-promotion guard
-- (a plain worker must never be able to insert/update their own role row).
-- ---------------------------------------------------------------------
ALTER TABLE public.personal_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_roles TO authenticated;
GRANT ALL ON public.personal_roles TO service_role;

DROP POLICY IF EXISTS "select_own_or_elevated" ON public.personal_roles;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.personal_roles;
DROP POLICY IF EXISTS "update_elevated_only" ON public.personal_roles;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.personal_roles;

CREATE POLICY "select_own_or_elevated" ON public.personal_roles
  FOR SELECT TO authenticated
  USING (public.is_gestor_or_admin() OR id_persona = public.current_id_persona());

CREATE POLICY "insert_elevated_only" ON public.personal_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.personal_roles
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.personal_roles
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());

-- ---------------------------------------------------------------------
-- roles: own role(s) (read) or elevated (read all); writes elevated-only.
-- Nothing sensitive lives here (id_rol, nombre, acceso_app), but scoping
-- costs nothing since use-current-personal.tsx only ever needs its own
-- role's name, and every broader reader (personal-admin.tsx, roles-admin.tsx)
-- is already gestor/admin-gated.
-- ---------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;

DROP POLICY IF EXISTS "select_own_role_or_elevated" ON public.roles;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.roles;
DROP POLICY IF EXISTS "update_elevated_only" ON public.roles;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.roles;

CREATE POLICY "select_own_role_or_elevated" ON public.roles
  FOR SELECT TO authenticated
  USING (
    public.is_gestor_or_admin()
    OR id_rol IN (
      SELECT id_rol FROM public.personal_roles
      WHERE id_persona = public.current_id_persona() AND fecha_hasta IS NULL
    )
  );

CREATE POLICY "insert_elevated_only" ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.roles
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.roles
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());

-- ---------------------------------------------------------------------
-- rol_permisos: own role(s) (read) or elevated (read all); writes
-- elevated-only. Mirrors use-permissions.tsx's own query shape exactly
-- (it only ever reads rol_permisos for the caller's own active role ids).
-- ---------------------------------------------------------------------
ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rol_permisos TO authenticated;
GRANT ALL ON public.rol_permisos TO service_role;

DROP POLICY IF EXISTS "select_own_role_or_elevated" ON public.rol_permisos;
DROP POLICY IF EXISTS "insert_elevated_only" ON public.rol_permisos;
DROP POLICY IF EXISTS "update_elevated_only" ON public.rol_permisos;
DROP POLICY IF EXISTS "delete_elevated_only" ON public.rol_permisos;

CREATE POLICY "select_own_role_or_elevated" ON public.rol_permisos
  FOR SELECT TO authenticated
  USING (
    public.is_gestor_or_admin()
    OR id_rol IN (
      SELECT id_rol FROM public.personal_roles
      WHERE id_persona = public.current_id_persona() AND fecha_hasta IS NULL
    )
  );

CREATE POLICY "insert_elevated_only" ON public.rol_permisos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "update_elevated_only" ON public.rol_permisos
  FOR UPDATE TO authenticated
  USING (public.is_gestor_or_admin()) WITH CHECK (public.is_gestor_or_admin());

CREATE POLICY "delete_elevated_only" ON public.rol_permisos
  FOR DELETE TO authenticated
  USING (public.is_gestor_or_admin());
