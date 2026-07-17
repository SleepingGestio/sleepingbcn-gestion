-- Baseline migration: registers pre-existing tables (created directly in
-- Supabase, outside this migrations history) with Lovable's own
-- migration-tracked schema model.
--
-- Context: Lovable's internal type-generation appears to rebuild
-- src/integrations/supabase/types.ts from its own migration history rather
-- than the live database, which wiped out every table not already covered
-- by a migration file here (see commits 0f886b3, 371f5d6, b1f71e2). This
-- file gives it awareness of the remaining tables so it stops doing that.
--
-- Every table below already exists in production. IF NOT EXISTS makes each
-- statement a no-op against the real database — this migration is never
-- meant to actually run/create anything. Column types are a best-effort
-- mapping from the generated TypeScript types (string->text,
-- number->numeric, boolean->boolean, Json->jsonb), with no primary keys,
-- foreign keys, indexes, defaults, or constraints — deliberately minimal to
-- avoid any risk of SQL syntax errors, since exact fidelity doesn't matter
-- for a statement that will always be skipped.

CREATE TABLE IF NOT EXISTS public."apartamentos" (
  "activo" boolean NOT NULL,
  "camas_fijas" numeric,
  "creado_en" text,
  "id_apt" numeric NOT NULL,
  "id_grupo" numeric,
  "nombre" text NOT NULL,
  "notas" text,
  "orden" numeric NOT NULL,
  "requiere_limpieza_intermedia" boolean NOT NULL,
  "tiene_sofa_cama" boolean
);

CREATE TABLE IF NOT EXISTS public."apartamentos_alias_kb" (
  "creado_en" text,
  "id_alias" numeric NOT NULL,
  "id_apt" numeric NOT NULL,
  "nombre_kb" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."checklist_items" (
  "activo" boolean,
  "descripcion" text NOT NULL,
  "id_item" numeric NOT NULL,
  "id_tipologia" numeric NOT NULL,
  "obligatorio" boolean,
  "orden" numeric NOT NULL,
  "tipo_respuesta" text,
  "zona" text
);

CREATE TABLE IF NOT EXISTS public."comunicaciones_dia" (
  "actualizado_en" text,
  "creado_en" text,
  "fecha" text NOT NULL,
  "id_comunicacion" numeric NOT NULL,
  "observaciones" text NOT NULL,
  "worker" numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public."conceptos_coste" (
  "activo" boolean,
  "categoria" text,
  "id_concepto" numeric NOT NULL,
  "nombre" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."costes_reserva" (
  "cantidad" numeric,
  "coste_total" numeric NOT NULL,
  "coste_unitario" numeric,
  "descripcion" text,
  "fecha" text NOT NULL,
  "id_concepto" numeric,
  "id_coste" numeric NOT NULL,
  "id_reserva" numeric NOT NULL,
  "id_trabajo" numeric,
  "notas" text
);

CREATE TABLE IF NOT EXISTS public."fichajes" (
  "concepto" text,
  "fecha" text NOT NULL,
  "hora_entrada" text NOT NULL,
  "hora_salida" text,
  "horas_totales" numeric,
  "id_fichaje" numeric NOT NULL,
  "id_persona" numeric NOT NULL,
  "notas" text,
  "tipo_jornada" text
);

CREATE TABLE IF NOT EXISTS public."grupos_apartamentos" (
  "creado_en" text,
  "id_grupo" numeric NOT NULL,
  "mostrar_por_defecto" boolean NOT NULL,
  "nombre" text NOT NULL,
  "orden" numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public."kb_importaciones" (
  "eliminadas_candidatas" numeric NOT NULL,
  "estado" text NOT NULL,
  "fecha_importacion" text NOT NULL,
  "fichero" text,
  "id" numeric NOT NULL,
  "modificadas" numeric NOT NULL,
  "modo" text NOT NULL,
  "nuevas" numeric NOT NULL,
  "sin_cambios" numeric NOT NULL,
  "total_filas" numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public."kb_importaciones_detalle" (
  "campos_cambiados" jsonb,
  "fecha" text NOT NULL,
  "id" numeric NOT NULL,
  "id_importacion" numeric NOT NULL,
  "numero_reserva" text NOT NULL,
  "tipo_cambio" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."limpiezas" (
  "aceptada_en" text,
  "actualizado_en" text,
  "affected_by_kb_change" boolean NOT NULL,
  "affected_reason" text,
  "check_checkin" boolean NOT NULL,
  "check_limpieza_basica" boolean NOT NULL,
  "check_limpieza_completa" boolean NOT NULL,
  "check_sabanas" boolean NOT NULL,
  "check_tasas" boolean NOT NULL,
  "check_toallas" boolean NOT NULL,
  "creado_en" text,
  "enviada_en" text,
  "estado" text NOT NULL,
  "fecha_limpieza" text NOT NULL,
  "finalizada_en" text,
  "hora_in_informed" boolean NOT NULL,
  "hora_in_time" text,
  "hora_out_informed" boolean NOT NULL,
  "hora_out_time" text,
  "hora_sugerida" text,
  "id_apt" numeric NOT NULL,
  "id_limpieza" numeric NOT NULL,
  "incidencias" text,
  "iniciada_en" text,
  "motivo_anulacion" text,
  "motivo_rechazo" text,
  "numero_reserva" text,
  "observaciones" text,
  "orden_trabajo" numeric,
  "prioritaria" boolean NOT NULL,
  "prioritaria_manual" boolean,
  "proxima_reserva_numero" text,
  "rechazada_en" text,
  "sfc_desmontar" boolean NOT NULL,
  "sfc_desmontar_manual" boolean,
  "sfc_montar" boolean NOT NULL,
  "sfc_montar_manual" boolean,
  "tipo" text NOT NULL,
  "worker" numeric
);

CREATE TABLE IF NOT EXISTS public."manteniment_adjunts" (
  "creado_en" text,
  "creado_per" numeric,
  "id_adjunt" numeric NOT NULL,
  "id_incidencia" numeric NOT NULL,
  "nom_fitxer" text,
  "tipus" text NOT NULL,
  "url" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."manteniment_incidencies" (
  "creado_en" text,
  "data_incident" text,
  "data_prevista" text,
  "descripcio" text,
  "estat" text NOT NULL,
  "finalitzat_en" text,
  "id_apt" numeric,
  "id_assignat" numeric,
  "id_grup" numeric,
  "id_incidencia" numeric NOT NULL,
  "id_limpieza" numeric,
  "id_reporter" numeric NOT NULL,
  "id_tipo_espacio_comun" numeric,
  "iniciat_en" text,
  "material_reposat" boolean,
  "notas_gestor" text,
  "numero_reserva" text,
  "origen" text NOT NULL,
  "prioritat_confirmada" text,
  "prioritat_proposta" text,
  "tasca_realitzada" boolean,
  "tipus" text,
  "titol" text NOT NULL,
  "validat_en" text,
  "validat_per" numeric
);

CREATE TABLE IF NOT EXISTS public."manteniment_registre" (
  "cost_materials" numeric,
  "creado_en" text,
  "desc_materials" text,
  "fi" text,
  "hores" numeric,
  "id_incidencia" numeric NOT NULL,
  "id_persona" numeric NOT NULL,
  "id_registre" numeric NOT NULL,
  "inici" text NOT NULL,
  "notas" text
);

CREATE TABLE IF NOT EXISTS public."materiales_catalogo" (
  "activo" boolean,
  "coste_unitario" numeric,
  "id_material" numeric NOT NULL,
  "nombre" text NOT NULL,
  "unidad" text
);

CREATE TABLE IF NOT EXISTS public."personal" (
  "activo" boolean,
  "apellidos" text,
  "codigo" text NOT NULL,
  "control_horario" boolean,
  "coste_hora" numeric,
  "coste_hora_extra" numeric,
  "fecha_alta" text NOT NULL,
  "fecha_baja" text,
  "fecha_inicio_contrato" text,
  "horas_objetivo_mes" numeric,
  "id_persona" numeric NOT NULL,
  "mail" text,
  "motivo_baja" text,
  "nif" text,
  "nombre" text NOT NULL,
  "notas" text,
  "onboarding_completat" boolean NOT NULL,
  "orden_dashboard" numeric,
  "telefono" text,
  "tipo_contrato" text,
  "usuario_app" text
);

CREATE TABLE IF NOT EXISTS public."personal_roles" (
  "fecha_desde" text NOT NULL,
  "fecha_hasta" text,
  "id" numeric NOT NULL,
  "id_persona" numeric NOT NULL,
  "id_rol" numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS public."registre_temps_generic" (
  "creado_en" text,
  "fi" text,
  "hores_totals" numeric,
  "id_apt" numeric,
  "id_grupo" numeric,
  "id_persona" numeric NOT NULL,
  "id_registre" numeric NOT NULL,
  "id_tipus" numeric NOT NULL,
  "inici" text NOT NULL,
  "notes" text
);

CREATE TABLE IF NOT EXISTS public."reservas_gestio" (
  "AgCheckIN" numeric,
  "EnLimpieza" boolean,
  "id_historico" numeric NOT NULL,
  "ImpTTAX" numeric,
  "NotasGestio" text,
  "Número" text NOT NULL,
  "ParteeEnv" text,
  "ParteeRecl1" text,
  "ParteeRecl2" text,
  "ParteeRecl3" text,
  "PersLImpAsig" numeric,
  "ReadyCheckIn" boolean,
  "TaxCobradas" numeric
);

CREATE TABLE IF NOT EXISTS public."reservas_kb" (
  "Cargo estancia" numeric,
  "Cargo tasa turística" numeric,
  "Check in" text,
  "Check-out" text,
  "Cobros" numeric,
  "Código OTA" text,
  "Comisiones" numeric,
  "Comisiones retenidas" numeric,
  "Creado por" text,
  "Detalle precios habitaciones" text,
  "Email" text,
  "Estado" text,
  "Fecha caducidad" text,
  "Fecha de cancelación" text,
  "Fecha de creación" text,
  "fecha_ultima_importacion" text,
  "Habitaciones" text,
  "Hora estimada de llegada" text,
  "Hora estimada de salida" text,
  "Huéspedes" numeric,
  "Huéspedes exentos" numeric,
  "Huespedes mayores de edad" numeric,
  "Huéspedes menores de edad" numeric,
  "ID" text,
  "ID Habitaciones" text,
  "ID Tipologie" text,
  "Idioma" text,
  "Método de adquisición" text,
  "N. Habitaciones" numeric,
  "Nacionalidad" text,
  "Noches" numeric,
  "Notas" text,
  "Notas internas" text,
  "Número" text NOT NULL,
  "Origen Lead" text,
  "Otros cobros" numeric,
  "Pagado" numeric,
  "Pagador" text,
  "País" text,
  "Pendiente de pago" numeric,
  "Portal" text,
  "Referencia" text,
  "Residencia" text,
  "Teléfono" text,
  "Tipologías y tarifas" text
);

CREATE TABLE IF NOT EXISTS public."rol_permisos" (
  "id_permis" numeric NOT NULL,
  "id_rol" numeric NOT NULL,
  "menu" text NOT NULL,
  "pot_editar" boolean NOT NULL,
  "pot_veure" boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS public."roles" (
  "acceso_app" text,
  "activo" boolean,
  "descripcion" text,
  "id_rol" numeric NOT NULL,
  "nombre" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."tipologia_apartamento" (
  "activo" boolean,
  "descripcion" text,
  "id_tipologia" numeric NOT NULL,
  "id_tipologia_base" numeric,
  "nombre" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."tipos_espacio_comun" (
  "activo" boolean NOT NULL,
  "creado_en" text NOT NULL,
  "id_tipo" numeric NOT NULL,
  "nombre" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."tipos_tarea_generica" (
  "actiu" boolean NOT NULL,
  "computable_hores" boolean NOT NULL,
  "creado_en" text,
  "creado_por" numeric,
  "id_tipus" numeric NOT NULL,
  "nombre" text NOT NULL,
  "notas" text,
  "orden" numeric,
  "requiere_apartamento" boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS public."trabajos" (
  "categoria" text NOT NULL,
  "creado_por" numeric,
  "descripcion" text,
  "estado" text,
  "fecha_apertura" text,
  "fecha_cierre" text,
  "fecha_limite" text,
  "habitacion" text,
  "id_reserva" numeric,
  "id_tipologia" numeric,
  "id_trabajo" numeric NOT NULL,
  "notas" text,
  "prioridad" text,
  "titulo" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."trabajos_asignaciones" (
  "coste_hora" numeric,
  "coste_total" numeric,
  "hora_fin" text,
  "hora_inicio" text,
  "horas_totales" numeric,
  "id_asignacion" numeric NOT NULL,
  "id_persona" numeric NOT NULL,
  "id_trabajo" numeric NOT NULL,
  "notas" text
);

CREATE TABLE IF NOT EXISTS public."trabajos_checklist" (
  "completado" boolean,
  "id_item" numeric NOT NULL,
  "id_respuesta" numeric NOT NULL,
  "id_trabajo" numeric NOT NULL,
  "respuesta_texto" text,
  "timestamp" text,
  "url_multimedia" text
);

CREATE TABLE IF NOT EXISTS public."trabajos_materiales" (
  "cantidad" numeric NOT NULL,
  "coste_total" numeric,
  "coste_unitario" numeric,
  "descripcion" text,
  "id" numeric NOT NULL,
  "id_material" numeric,
  "id_trabajo" numeric NOT NULL
);
