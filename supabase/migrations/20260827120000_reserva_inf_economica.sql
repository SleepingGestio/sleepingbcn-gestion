-- Redesign of the "Inf. económica" tab of the reservation detail popover:
--   * reservas_extras                  — repeatable per-reservation extra charges
--   * reservas_gestio.CuentaVerificada — per-tab "cuenta verificada y cerrada" flag
--   * canales_reserva.modo_comision    — which commission formula the channel uses
--   * drop reservas_gestio.CobroEfectivo (a no-IVA extra line replaces it)
--   * ajustes_app                      — app-wide editable constants; seeds IVA %
--
-- Resolved-literal principle unchanged (see 20260826140000 /
-- 20260826120000): %/importe/IVA are stored as the literal values in force
-- when the reservation was closed. A later change to canales_reserva /
-- tarifas_* / ajustes_app never rewrites an already-saved reservation.

-- 1. Per-reservation extra charges ---------------------------------------
-- Child-table conventions follow limpiezas_registre / manteniment_registre:
-- identity bigint PK, creado_en text DEFAULT now()::text. Linked by the text
-- "Número" business key (same choice as manteniment_incidencies.numero_reserva
-- and reservas_gestio."Número"), pointed at reservas_kb because a
-- reservas_gestio row may not exist yet for a reservation that has never been
-- saved from the popover.
CREATE TABLE IF NOT EXISTS public.reservas_extras (
  id_extra       bigint generated always as identity primary key,
  numero_reserva text NOT NULL REFERENCES public.reservas_kb("Número") ON DELETE CASCADE,
  concepto       text NOT NULL,
  importe        numeric NOT NULL CHECK (importe >= 0),
  con_iva        boolean NOT NULL DEFAULT false,
  creado_en      text DEFAULT now()::text
);

CREATE INDEX IF NOT EXISTS reservas_extras_numero_idx
  ON public.reservas_extras (numero_reserva);

ALTER TABLE public.reservas_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.reservas_extras
  FOR SELECT TO authenticated USING (true);

-- Write-gate mirrors the popover's own readOnly gate (canEdit("reservas")).
-- reservas_gestio itself has no RLS; that pre-existing gap is intentionally
-- left untouched here — a brand-new child table gets proper access control.
CREATE POLICY "write_reservas" ON public.reservas_extras
  FOR ALL TO authenticated
  USING (can_edit_menu('reservas'))
  WITH CHECK (can_edit_menu('reservas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas_extras TO authenticated;

-- 2. "Cuenta verificada y cerrada" -------------------------------------
-- Nullable boolean, same convention as reservas_gestio.ReadyCheckIn.
ALTER TABLE public.reservas_gestio
  ADD COLUMN IF NOT EXISTS "CuentaVerificada" boolean;

-- 3. Commission formula per channel -----------------------------------
--   bruto — KB "Cargo estancia" is the pre-commission price (Booking):
--           comision = (pct_ota + pct_cobro)/100 * (Cargo_estancia + PagadoLimpieza)
--   neto  — KB "Cargo estancia" is already net of commission (Airbnb; and
--           provisionally Expedia — same formula shape, % verified on one
--           partial example only, re-confirm with a cleaner case):
--           comision = (pct_ota/100) * base / (1 - pct_ota/100),
--           base = Cargo_estancia + PagadoLimpieza;  pct_cobro does NOT apply.
-- Manual/configured like everything else on canales_reserva, never inferred
-- from KB data. New channels default to 'bruto' and need a one-time review.
ALTER TABLE public.canales_reserva
  ADD COLUMN IF NOT EXISTS modo_comision text NOT NULL DEFAULT 'bruto'
    CHECK (modo_comision IN ('bruto', 'neto'));

-- 4. Drop CobroEfectivo ----------------------------------------------
-- Added 2026-08-26; only ever read by the popover UI (replaced in the same
-- change as this migration). No report / export / view / aggregation
-- references it (grep-verified across src/ and supabase/).
ALTER TABLE public.reservas_gestio
  DROP COLUMN IF EXISTS "CobroEfectivo";

-- 5. App-wide editable constants -----------------------------------
-- No key/value settings table exists; the tarifas_* tables are all
-- per-entity catalogs. Generic clave/valor store, edited under
-- Configuración → Tarifas (gated by config_tarifas). IVA % is the first
-- entry; it also feeds the future monthly closing report.
CREATE TABLE IF NOT EXISTS public.ajustes_app (
  clave          text primary key,
  valor          text NOT NULL,
  descripcion    text,
  actualizado_en text DEFAULT now()::text
);

ALTER TABLE public.ajustes_app ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_authenticated" ON public.ajustes_app
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_config_tarifas" ON public.ajustes_app
  FOR ALL TO authenticated
  USING (can_edit_menu('config_tarifas'))
  WITH CHECK (can_edit_menu('config_tarifas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes_app TO authenticated;

INSERT INTO public.ajustes_app (clave, valor, descripcion)
VALUES ('iva_pct', '10',
        'IVA (%) aplicado a las líneas "Con IVA" del cierre económico de reservas')
ON CONFLICT (clave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
