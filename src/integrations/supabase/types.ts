export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      apartamentos: {
        Row: {
          activo: boolean
          camas_fijas: number | null
          creado_en: string | null
          id_apt: number
          id_grupo: number | null
          nombre: string
          notas: string | null
          orden: number
          requiere_limpieza_intermedia: boolean
          tiene_sofa_cama: boolean | null
        }
        Insert: {
          activo?: boolean
          camas_fijas?: number | null
          creado_en?: string | null
          id_apt?: number
          id_grupo?: number | null
          nombre: string
          notas?: string | null
          orden?: number
          requiere_limpieza_intermedia?: boolean
          tiene_sofa_cama?: boolean | null
        }
        Update: {
          activo?: boolean
          camas_fijas?: number | null
          creado_en?: string | null
          id_apt?: number
          id_grupo?: number | null
          nombre?: string
          notas?: string | null
          orden?: number
          requiere_limpieza_intermedia?: boolean
          tiene_sofa_cama?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "apartamentos_id_grupo_fkey"
            columns: ["id_grupo"]
            isOneToOne: false
            referencedRelation: "grupos_apartamentos"
            referencedColumns: ["id_grupo"]
          },
        ]
      }
      apartamentos_alias_kb: {
        Row: {
          creado_en: string | null
          id_alias: number
          id_apt: number
          nombre_kb: string
        }
        Insert: {
          creado_en?: string | null
          id_alias?: number
          id_apt: number
          nombre_kb: string
        }
        Update: {
          creado_en?: string | null
          id_alias?: number
          id_apt?: number
          nombre_kb?: string
        }
        Relationships: [
          {
            foreignKeyName: "apartamentos_alias_kb_id_apt_fkey"
            columns: ["id_apt"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id_apt"]
          },
        ]
      }
      checklist_items: {
        Row: {
          activo: boolean | null
          descripcion: string
          id_item: number
          id_tipologia: number
          obligatorio: boolean | null
          orden: number
          tipo_respuesta: string | null
          zona: string | null
        }
        Insert: {
          activo?: boolean | null
          descripcion: string
          id_item?: number
          id_tipologia: number
          obligatorio?: boolean | null
          orden?: number
          tipo_respuesta?: string | null
          zona?: string | null
        }
        Update: {
          activo?: boolean | null
          descripcion?: string
          id_item?: number
          id_tipologia?: number
          obligatorio?: boolean | null
          orden?: number
          tipo_respuesta?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_id_tipologia_fkey"
            columns: ["id_tipologia"]
            isOneToOne: false
            referencedRelation: "tipologia_apartamento"
            referencedColumns: ["id_tipologia"]
          },
        ]
      }
      comunicaciones_dia: {
        Row: {
          actualizado_en: string | null
          creado_en: string | null
          fecha: string
          id_comunicacion: number
          observaciones: string
          worker: number
        }
        Insert: {
          actualizado_en?: string | null
          creado_en?: string | null
          fecha: string
          id_comunicacion?: number
          observaciones: string
          worker: number
        }
        Update: {
          actualizado_en?: string | null
          creado_en?: string | null
          fecha?: string
          id_comunicacion?: number
          observaciones?: string
          worker?: number
        }
        Relationships: [
          {
            foreignKeyName: "comunicaciones_dia_worker_fkey"
            columns: ["worker"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      conceptos_coste: {
        Row: {
          activo: boolean | null
          categoria: string | null
          id_concepto: number
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          categoria?: string | null
          id_concepto?: number
          nombre: string
        }
        Update: {
          activo?: boolean | null
          categoria?: string | null
          id_concepto?: number
          nombre?: string
        }
        Relationships: []
      }
      costes_reserva: {
        Row: {
          cantidad: number | null
          coste_total: number
          coste_unitario: number | null
          descripcion: string | null
          fecha: string
          id_concepto: number | null
          id_coste: number
          id_reserva: number
          id_trabajo: number | null
          notas: string | null
        }
        Insert: {
          cantidad?: number | null
          coste_total: number
          coste_unitario?: number | null
          descripcion?: string | null
          fecha?: string
          id_concepto?: number | null
          id_coste?: number
          id_reserva: number
          id_trabajo?: number | null
          notas?: string | null
        }
        Update: {
          cantidad?: number | null
          coste_total?: number
          coste_unitario?: number | null
          descripcion?: string | null
          fecha?: string
          id_concepto?: number | null
          id_coste?: number
          id_reserva?: number
          id_trabajo?: number | null
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costes_reserva_id_concepto_fkey"
            columns: ["id_concepto"]
            isOneToOne: false
            referencedRelation: "conceptos_coste"
            referencedColumns: ["id_concepto"]
          },
          {
            foreignKeyName: "costes_reserva_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reservas_gestio"
            referencedColumns: ["id_historico"]
          },
          {
            foreignKeyName: "costes_reserva_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id_trabajo"]
          },
        ]
      }
      fichajes: {
        Row: {
          concepto: string | null
          fecha: string
          hora_entrada: string
          hora_salida: string | null
          horas_totales: number | null
          id_fichaje: number
          id_persona: number
          notas: string | null
          tipo_jornada: string | null
        }
        Insert: {
          concepto?: string | null
          fecha: string
          hora_entrada: string
          hora_salida?: string | null
          horas_totales?: number | null
          id_fichaje?: number
          id_persona: number
          notas?: string | null
          tipo_jornada?: string | null
        }
        Update: {
          concepto?: string | null
          fecha?: string
          hora_entrada?: string
          hora_salida?: string | null
          horas_totales?: number | null
          id_fichaje?: number
          id_persona?: number
          notas?: string | null
          tipo_jornada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichajes_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      grupos_apartamentos: {
        Row: {
          creado_en: string | null
          id_grupo: number
          mostrar_por_defecto: boolean
          nombre: string
          orden: number
        }
        Insert: {
          creado_en?: string | null
          id_grupo?: number
          mostrar_por_defecto?: boolean
          nombre: string
          orden?: number
        }
        Update: {
          creado_en?: string | null
          id_grupo?: number
          mostrar_por_defecto?: boolean
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      kb_importaciones: {
        Row: {
          eliminadas_candidatas: number
          estado: string
          fecha_importacion: string
          fichero: string | null
          id: number
          modificadas: number
          modo: string
          nuevas: number
          sin_cambios: number
          total_filas: number
        }
        Insert: {
          eliminadas_candidatas?: number
          estado?: string
          fecha_importacion?: string
          fichero?: string | null
          id?: number
          modificadas?: number
          modo?: string
          nuevas?: number
          sin_cambios?: number
          total_filas?: number
        }
        Update: {
          eliminadas_candidatas?: number
          estado?: string
          fecha_importacion?: string
          fichero?: string | null
          id?: number
          modificadas?: number
          modo?: string
          nuevas?: number
          sin_cambios?: number
          total_filas?: number
        }
        Relationships: []
      }
      kb_importaciones_detalle: {
        Row: {
          campos_cambiados: Json | null
          fecha: string
          id: number
          id_importacion: number
          numero_reserva: string
          tipo_cambio: string
        }
        Insert: {
          campos_cambiados?: Json | null
          fecha?: string
          id?: number
          id_importacion: number
          numero_reserva: string
          tipo_cambio: string
        }
        Update: {
          campos_cambiados?: Json | null
          fecha?: string
          id?: number
          id_importacion?: number
          numero_reserva?: string
          tipo_cambio?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_importaciones_detalle_id_importacion_fkey"
            columns: ["id_importacion"]
            isOneToOne: false
            referencedRelation: "kb_importaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      limpiezas: {
        Row: {
          aceptada_en: string | null
          actualizado_en: string | null
          affected_by_kb_change: boolean
          affected_reason: string | null
          check_checkin: boolean
          check_limpieza_basica: boolean
          check_limpieza_completa: boolean
          check_sabanas: boolean
          check_tasas: boolean
          check_toallas: boolean
          creado_en: string | null
          enviada_en: string | null
          estado: string
          fecha_limpieza: string
          finalizada_en: string | null
          hora_in_informed: boolean
          hora_in_time: string | null
          hora_out_informed: boolean
          hora_out_time: string | null
          hora_sugerida: string | null
          id_apt: number
          id_limpieza: number
          incidencias: string | null
          iniciada_en: string | null
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          numero_reserva: string | null
          observaciones: string | null
          orden_trabajo: number | null
          prioritaria: boolean
          prioritaria_manual: boolean | null
          proxima_reserva_numero: string | null
          rechazada_en: string | null
          sfc_desmontar: boolean
          sfc_desmontar_manual: boolean | null
          sfc_montar: boolean
          sfc_montar_manual: boolean | null
          tipo: string
          worker: number | null
        }
        Insert: {
          aceptada_en?: string | null
          actualizado_en?: string | null
          affected_by_kb_change?: boolean
          affected_reason?: string | null
          check_checkin?: boolean
          check_limpieza_basica?: boolean
          check_limpieza_completa?: boolean
          check_sabanas?: boolean
          check_tasas?: boolean
          check_toallas?: boolean
          creado_en?: string | null
          enviada_en?: string | null
          estado?: string
          fecha_limpieza: string
          finalizada_en?: string | null
          hora_in_informed?: boolean
          hora_in_time?: string | null
          hora_out_informed?: boolean
          hora_out_time?: string | null
          hora_sugerida?: string | null
          id_apt: number
          id_limpieza?: number
          incidencias?: string | null
          iniciada_en?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero_reserva?: string | null
          observaciones?: string | null
          orden_trabajo?: number | null
          prioritaria?: boolean
          prioritaria_manual?: boolean | null
          proxima_reserva_numero?: string | null
          rechazada_en?: string | null
          sfc_desmontar?: boolean
          sfc_desmontar_manual?: boolean | null
          sfc_montar?: boolean
          sfc_montar_manual?: boolean | null
          tipo?: string
          worker?: number | null
        }
        Update: {
          aceptada_en?: string | null
          actualizado_en?: string | null
          affected_by_kb_change?: boolean
          affected_reason?: string | null
          check_checkin?: boolean
          check_limpieza_basica?: boolean
          check_limpieza_completa?: boolean
          check_sabanas?: boolean
          check_tasas?: boolean
          check_toallas?: boolean
          creado_en?: string | null
          enviada_en?: string | null
          estado?: string
          fecha_limpieza?: string
          finalizada_en?: string | null
          hora_in_informed?: boolean
          hora_in_time?: string | null
          hora_out_informed?: boolean
          hora_out_time?: string | null
          hora_sugerida?: string | null
          id_apt?: number
          id_limpieza?: number
          incidencias?: string | null
          iniciada_en?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero_reserva?: string | null
          observaciones?: string | null
          orden_trabajo?: number | null
          prioritaria?: boolean
          prioritaria_manual?: boolean | null
          proxima_reserva_numero?: string | null
          rechazada_en?: string | null
          sfc_desmontar?: boolean
          sfc_desmontar_manual?: boolean | null
          sfc_montar?: boolean
          sfc_montar_manual?: boolean | null
          tipo?: string
          worker?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "limpiezas_id_apt_fkey"
            columns: ["id_apt"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id_apt"]
          },
          {
            foreignKeyName: "limpiezas_numero_reserva_fkey"
            columns: ["numero_reserva"]
            isOneToOne: false
            referencedRelation: "reservas_kb"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "limpiezas_numero_reserva_fkey"
            columns: ["numero_reserva"]
            isOneToOne: false
            referencedRelation: "v_reservas_por_apartamento"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "limpiezas_proxima_reserva_numero_fkey"
            columns: ["proxima_reserva_numero"]
            isOneToOne: false
            referencedRelation: "reservas_kb"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "limpiezas_proxima_reserva_numero_fkey"
            columns: ["proxima_reserva_numero"]
            isOneToOne: false
            referencedRelation: "v_reservas_por_apartamento"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "limpiezas_worker_fkey"
            columns: ["worker"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      manteniment_adjunts: {
        Row: {
          creado_en: string | null
          creado_per: number | null
          id_adjunt: number
          id_incidencia: number
          nom_fitxer: string | null
          tipus: string
          url: string
        }
        Insert: {
          creado_en?: string | null
          creado_per?: number | null
          id_adjunt?: number
          id_incidencia: number
          nom_fitxer?: string | null
          tipus: string
          url: string
        }
        Update: {
          creado_en?: string | null
          creado_per?: number | null
          id_adjunt?: number
          id_incidencia?: number
          nom_fitxer?: string | null
          tipus?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "manteniment_adjunts_creado_per_fkey"
            columns: ["creado_per"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "manteniment_adjunts_id_incidencia_fkey"
            columns: ["id_incidencia"]
            isOneToOne: false
            referencedRelation: "manteniment_incidencies"
            referencedColumns: ["id_incidencia"]
          },
        ]
      }
      manteniment_incidencies: {
        Row: {
          creado_en: string | null
          data_incident: string | null
          data_prevista: string | null
          data_reprogramada_por_operario: boolean
          descripcio: string | null
          estat: string
          finalitzat_en: string | null
          id_apt: number | null
          id_assignat: number | null
          id_grup: number | null
          id_incidencia: number
          id_limpieza: number | null
          id_reporter: number
          id_tipo_espacio_comun: number | null
          iniciat_en: string | null
          material_reposat: boolean | null
          notas_gestor: string | null
          numero_reserva: string | null
          origen: string
          prioritat_confirmada: string | null
          prioritat_proposta: string | null
          tasca_realitzada: boolean | null
          tipus: string | null
          titol: string
          validat_en: string | null
          validat_per: number | null
        }
        Insert: {
          creado_en?: string | null
          data_incident?: string | null
          data_prevista?: string | null
          data_reprogramada_por_operario?: boolean
          descripcio?: string | null
          estat?: string
          finalitzat_en?: string | null
          id_apt?: number | null
          id_assignat?: number | null
          id_grup?: number | null
          id_incidencia?: number
          id_limpieza?: number | null
          id_reporter: number
          id_tipo_espacio_comun?: number | null
          iniciat_en?: string | null
          material_reposat?: boolean | null
          notas_gestor?: string | null
          numero_reserva?: string | null
          origen: string
          prioritat_confirmada?: string | null
          prioritat_proposta?: string | null
          tasca_realitzada?: boolean | null
          tipus?: string | null
          titol: string
          validat_en?: string | null
          validat_per?: number | null
        }
        Update: {
          creado_en?: string | null
          data_incident?: string | null
          data_prevista?: string | null
          data_reprogramada_por_operario?: boolean
          descripcio?: string | null
          estat?: string
          finalitzat_en?: string | null
          id_apt?: number | null
          id_assignat?: number | null
          id_grup?: number | null
          id_incidencia?: number
          id_limpieza?: number | null
          id_reporter?: number
          id_tipo_espacio_comun?: number | null
          iniciat_en?: string | null
          material_reposat?: boolean | null
          notas_gestor?: string | null
          numero_reserva?: string | null
          origen?: string
          prioritat_confirmada?: string | null
          prioritat_proposta?: string | null
          tasca_realitzada?: boolean | null
          tipus?: string | null
          titol?: string
          validat_en?: string | null
          validat_per?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "manteniment_incidencies_id_apt_fkey"
            columns: ["id_apt"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id_apt"]
          },
          {
            foreignKeyName: "manteniment_incidencies_id_assignat_fkey"
            columns: ["id_assignat"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "manteniment_incidencies_id_grup_fkey"
            columns: ["id_grup"]
            isOneToOne: false
            referencedRelation: "grupos_apartamentos"
            referencedColumns: ["id_grupo"]
          },
          {
            foreignKeyName: "manteniment_incidencies_id_limpieza_fkey"
            columns: ["id_limpieza"]
            isOneToOne: false
            referencedRelation: "limpiezas"
            referencedColumns: ["id_limpieza"]
          },
          {
            foreignKeyName: "manteniment_incidencies_id_reporter_fkey"
            columns: ["id_reporter"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "manteniment_incidencies_id_tipo_espacio_comun_fkey"
            columns: ["id_tipo_espacio_comun"]
            isOneToOne: false
            referencedRelation: "tipos_espacio_comun"
            referencedColumns: ["id_tipo"]
          },
          {
            foreignKeyName: "manteniment_incidencies_numero_reserva_fkey"
            columns: ["numero_reserva"]
            isOneToOne: false
            referencedRelation: "reservas_kb"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "manteniment_incidencies_numero_reserva_fkey"
            columns: ["numero_reserva"]
            isOneToOne: false
            referencedRelation: "v_reservas_por_apartamento"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "manteniment_incidencies_validat_per_fkey"
            columns: ["validat_per"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      manteniment_registre: {
        Row: {
          cost_materials: number | null
          creado_en: string | null
          desc_materials: string | null
          fi: string | null
          hores: number | null
          id_incidencia: number
          id_persona: number
          id_registre: number
          inici: string
          notas: string | null
        }
        Insert: {
          cost_materials?: number | null
          creado_en?: string | null
          desc_materials?: string | null
          fi?: string | null
          hores?: number | null
          id_incidencia: number
          id_persona: number
          id_registre?: number
          inici: string
          notas?: string | null
        }
        Update: {
          cost_materials?: number | null
          creado_en?: string | null
          desc_materials?: string | null
          fi?: string | null
          hores?: number | null
          id_incidencia?: number
          id_persona?: number
          id_registre?: number
          inici?: string
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manteniment_registre_id_incidencia_fkey"
            columns: ["id_incidencia"]
            isOneToOne: false
            referencedRelation: "manteniment_incidencies"
            referencedColumns: ["id_incidencia"]
          },
          {
            foreignKeyName: "manteniment_registre_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      materiales_catalogo: {
        Row: {
          activo: boolean | null
          coste_unitario: number | null
          id_material: number
          nombre: string
          unidad: string | null
        }
        Insert: {
          activo?: boolean | null
          coste_unitario?: number | null
          id_material?: number
          nombre: string
          unidad?: string | null
        }
        Update: {
          activo?: boolean | null
          coste_unitario?: number | null
          id_material?: number
          nombre?: string
          unidad?: string | null
        }
        Relationships: []
      }
      personal: {
        Row: {
          activo: boolean | null
          apellidos: string | null
          codigo: string
          control_horario: boolean | null
          coste_hora: number | null
          coste_hora_extra: number | null
          fecha_alta: string
          fecha_baja: string | null
          fecha_inicio_contrato: string | null
          horas_objetivo_mes: number | null
          id_persona: number
          mail: string | null
          motivo_baja: string | null
          nif: string | null
          nombre: string
          notas: string | null
          onboarding_completat: boolean
          orden_dashboard: number | null
          telefono: string | null
          tipo_contrato: string | null
          usuario_app: string | null
        }
        Insert: {
          activo?: boolean | null
          apellidos?: string | null
          codigo: string
          control_horario?: boolean | null
          coste_hora?: number | null
          coste_hora_extra?: number | null
          fecha_alta: string
          fecha_baja?: string | null
          fecha_inicio_contrato?: string | null
          horas_objetivo_mes?: number | null
          id_persona?: number
          mail?: string | null
          motivo_baja?: string | null
          nif?: string | null
          nombre: string
          notas?: string | null
          onboarding_completat?: boolean
          orden_dashboard?: number | null
          telefono?: string | null
          tipo_contrato?: string | null
          usuario_app?: string | null
        }
        Update: {
          activo?: boolean | null
          apellidos?: string | null
          codigo?: string
          control_horario?: boolean | null
          coste_hora?: number | null
          coste_hora_extra?: number | null
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_inicio_contrato?: string | null
          horas_objetivo_mes?: number | null
          id_persona?: number
          mail?: string | null
          motivo_baja?: string | null
          nif?: string | null
          nombre?: string
          notas?: string | null
          onboarding_completat?: boolean
          orden_dashboard?: number | null
          telefono?: string | null
          tipo_contrato?: string | null
          usuario_app?: string | null
        }
        Relationships: []
      }
      personal_ajustos_hores: {
        Row: {
          creado_en: string | null
          creado_por: number | null
          fecha: string
          horas: number
          id_ajuste: number
          id_persona: number | null
          notas: string | null
          tipo: string | null
          tipus_computa: string | null
        }
        Insert: {
          creado_en?: string | null
          creado_por?: number | null
          fecha: string
          horas: number
          id_ajuste?: number
          id_persona?: number | null
          notas?: string | null
          tipo?: string | null
          tipus_computa?: string | null
        }
        Update: {
          creado_en?: string | null
          creado_por?: number | null
          fecha?: string
          horas?: number
          id_ajuste?: number
          id_persona?: number | null
          notas?: string | null
          tipo?: string | null
          tipus_computa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_ajustos_hores_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "personal_ajustos_hores_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      personal_periodos_actividad: {
        Row: {
          creado_en: string | null
          creado_por: number | null
          dies_vacances_any: number | null
          fecha_fin: string | null
          fecha_inicio: string
          horas_objetivo_mes: number | null
          id_periodo: number
          id_persona: number | null
          motivo: string | null
          notas: string | null
        }
        Insert: {
          creado_en?: string | null
          creado_por?: number | null
          dies_vacances_any?: number | null
          fecha_fin?: string | null
          fecha_inicio: string
          horas_objetivo_mes?: number | null
          id_periodo?: number
          id_persona?: number | null
          motivo?: string | null
          notas?: string | null
        }
        Update: {
          creado_en?: string | null
          creado_por?: number | null
          dies_vacances_any?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string
          horas_objetivo_mes?: number | null
          id_periodo?: number
          id_persona?: number | null
          motivo?: string | null
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_periodos_actividad_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "personal_periodos_actividad_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      personal_resum_mes: {
        Row: {
          anio: number
          cerrado: boolean
          cerrado_en: string | null
          cerrado_por: number | null
          decisio_tancament: string | null
          hores_ajust_saldo: number
          hores_objectiu_base: number | null
          hores_objectiu_ef: number | null
          hores_reduccio: number
          hores_treballades: number
          id_persona: number
          id_resumen: number
          mes: number
          notas: string | null
          saldo_acumulat_ant: number
          saldo_acumulat_fi: number | null
          saldo_mes: number | null
        }
        Insert: {
          anio: number
          cerrado?: boolean
          cerrado_en?: string | null
          cerrado_por?: number | null
          decisio_tancament?: string | null
          hores_ajust_saldo?: number
          hores_objectiu_base?: number | null
          hores_objectiu_ef?: number | null
          hores_reduccio?: number
          hores_treballades?: number
          id_persona: number
          id_resumen?: number
          mes: number
          notas?: string | null
          saldo_acumulat_ant?: number
          saldo_acumulat_fi?: number | null
          saldo_mes?: number | null
        }
        Update: {
          anio?: number
          cerrado?: boolean
          cerrado_en?: string | null
          cerrado_por?: number | null
          decisio_tancament?: string | null
          hores_ajust_saldo?: number
          hores_objectiu_base?: number | null
          hores_objectiu_ef?: number | null
          hores_reduccio?: number
          hores_treballades?: number
          id_persona?: number
          id_resumen?: number
          mes?: number
          notas?: string | null
          saldo_acumulat_ant?: number
          saldo_acumulat_fi?: number | null
          saldo_mes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_resum_mes_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "personal_resum_mes_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      personal_roles: {
        Row: {
          fecha_desde: string
          fecha_hasta: string | null
          id: number
          id_persona: number
          id_rol: number
        }
        Insert: {
          fecha_desde?: string
          fecha_hasta?: string | null
          id?: number
          id_persona: number
          id_rol: number
        }
        Update: {
          fecha_desde?: string
          fecha_hasta?: string | null
          id?: number
          id_persona?: number
          id_rol?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_roles_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "personal_roles_id_rol_fkey"
            columns: ["id_rol"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id_rol"]
          },
        ]
      }
      personal_vacances_any: {
        Row: {
          creado_en: string | null
          creado_por: number | null
          data_fi_any: string
          data_inici_any: string
          dies_assignats: number | null
          hores_assignades: number
          hores_calculades: number | null
          id_persona: number
          id_vacances: number
          notas: string | null
        }
        Insert: {
          creado_en?: string | null
          creado_por?: number | null
          data_fi_any: string
          data_inici_any: string
          dies_assignats?: number | null
          hores_assignades: number
          hores_calculades?: number | null
          id_persona: number
          id_vacances?: number
          notas?: string | null
        }
        Update: {
          creado_en?: string | null
          creado_por?: number | null
          data_fi_any?: string
          data_inici_any?: string
          dies_assignats?: number | null
          hores_assignades?: number
          hores_calculades?: number | null
          id_persona?: number
          id_vacances?: number
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_vacances_any_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "personal_vacances_any_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      registre_temps_generic: {
        Row: {
          creado_en: string | null
          fi: string | null
          hores_totals: number | null
          id_apt: number | null
          id_grupo: number | null
          id_persona: number
          id_registre: number
          id_tipo_espacio_comun: number | null
          id_tipus: number
          inici: string
          notes: string | null
        }
        Insert: {
          creado_en?: string | null
          fi?: string | null
          hores_totals?: number | null
          id_apt?: number | null
          id_grupo?: number | null
          id_persona: number
          id_registre?: number
          id_tipo_espacio_comun?: number | null
          id_tipus: number
          inici?: string
          notes?: string | null
        }
        Update: {
          creado_en?: string | null
          fi?: string | null
          hores_totals?: number | null
          id_apt?: number | null
          id_grupo?: number | null
          id_persona?: number
          id_registre?: number
          id_tipo_espacio_comun?: number | null
          id_tipus?: number
          inici?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registre_temps_generic_id_apt_fkey"
            columns: ["id_apt"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id_apt"]
          },
          {
            foreignKeyName: "registre_temps_generic_id_grupo_fkey"
            columns: ["id_grupo"]
            isOneToOne: false
            referencedRelation: "grupos_apartamentos"
            referencedColumns: ["id_grupo"]
          },
          {
            foreignKeyName: "registre_temps_generic_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "registre_temps_generic_id_tipus_fkey"
            columns: ["id_tipus"]
            isOneToOne: false
            referencedRelation: "tipos_tarea_generica"
            referencedColumns: ["id_tipus"]
          },
        ]
      }
      reservas_gestio: {
        Row: {
          AgCheckIN: number | null
          EnLimpieza: boolean | null
          id_historico: number
          ImpTTAX: number | null
          NotasGestio: string | null
          Número: string
          ParteeEnv: string | null
          ParteeRecl1: string | null
          ParteeRecl2: string | null
          ParteeRecl3: string | null
          PersLImpAsig: number | null
          ReadyCheckIn: boolean | null
          TaxCobradas: number | null
        }
        Insert: {
          AgCheckIN?: number | null
          EnLimpieza?: boolean | null
          id_historico?: number
          ImpTTAX?: number | null
          NotasGestio?: string | null
          Número: string
          ParteeEnv?: string | null
          ParteeRecl1?: string | null
          ParteeRecl2?: string | null
          ParteeRecl3?: string | null
          PersLImpAsig?: number | null
          ReadyCheckIn?: boolean | null
          TaxCobradas?: number | null
        }
        Update: {
          AgCheckIN?: number | null
          EnLimpieza?: boolean | null
          id_historico?: number
          ImpTTAX?: number | null
          NotasGestio?: string | null
          Número?: string
          ParteeEnv?: string | null
          ParteeRecl1?: string | null
          ParteeRecl2?: string | null
          ParteeRecl3?: string | null
          PersLImpAsig?: number | null
          ReadyCheckIn?: boolean | null
          TaxCobradas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_gestio_agente"
            columns: ["AgCheckIN"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "fk_gestio_limpieza"
            columns: ["PersLImpAsig"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "reservas_gestio_Número_fkey"
            columns: ["Número"]
            isOneToOne: true
            referencedRelation: "reservas_kb"
            referencedColumns: ["Número"]
          },
          {
            foreignKeyName: "reservas_gestio_Número_fkey"
            columns: ["Número"]
            isOneToOne: true
            referencedRelation: "v_reservas_por_apartamento"
            referencedColumns: ["Número"]
          },
        ]
      }
      reservas_kb: {
        Row: {
          "Cargo estancia": number | null
          "Cargo tasa turística": number | null
          "Check in": string | null
          "Check-out": string | null
          Cobros: number | null
          "Código OTA": string | null
          Comisiones: number | null
          "Comisiones retenidas": number | null
          "Creado por": string | null
          "Detalle precios habitaciones": string | null
          Email: string | null
          Estado: string | null
          "Fecha caducidad": string | null
          "Fecha de cancelación": string | null
          "Fecha de creación": string | null
          fecha_ultima_importacion: string | null
          Habitaciones: string | null
          "Hora estimada de llegada": string | null
          "Hora estimada de salida": string | null
          Huéspedes: number | null
          "Huéspedes exentos": number | null
          "Huespedes mayores de edad": number | null
          "Huéspedes menores de edad": number | null
          ID: string | null
          "ID Habitaciones": string | null
          "ID Tipologie": string | null
          Idioma: string | null
          "Método de adquisición": string | null
          "N. Habitaciones": number | null
          Nacionalidad: string | null
          Noches: number | null
          Notas: string | null
          "Notas internas": string | null
          Número: string
          "Origen Lead": string | null
          "Otros cobros": number | null
          Pagado: number | null
          Pagador: string | null
          País: string | null
          "Pendiente de pago": number | null
          Portal: string | null
          Referencia: string | null
          Residencia: string | null
          Teléfono: string | null
          "Tipologías y tarifas": string | null
        }
        Insert: {
          "Cargo estancia"?: number | null
          "Cargo tasa turística"?: number | null
          "Check in"?: string | null
          "Check-out"?: string | null
          Cobros?: number | null
          "Código OTA"?: string | null
          Comisiones?: number | null
          "Comisiones retenidas"?: number | null
          "Creado por"?: string | null
          "Detalle precios habitaciones"?: string | null
          Email?: string | null
          Estado?: string | null
          "Fecha caducidad"?: string | null
          "Fecha de cancelación"?: string | null
          "Fecha de creación"?: string | null
          fecha_ultima_importacion?: string | null
          Habitaciones?: string | null
          "Hora estimada de llegada"?: string | null
          "Hora estimada de salida"?: string | null
          Huéspedes?: number | null
          "Huéspedes exentos"?: number | null
          "Huespedes mayores de edad"?: number | null
          "Huéspedes menores de edad"?: number | null
          ID?: string | null
          "ID Habitaciones"?: string | null
          "ID Tipologie"?: string | null
          Idioma?: string | null
          "Método de adquisición"?: string | null
          "N. Habitaciones"?: number | null
          Nacionalidad?: string | null
          Noches?: number | null
          Notas?: string | null
          "Notas internas"?: string | null
          Número: string
          "Origen Lead"?: string | null
          "Otros cobros"?: number | null
          Pagado?: number | null
          Pagador?: string | null
          País?: string | null
          "Pendiente de pago"?: number | null
          Portal?: string | null
          Referencia?: string | null
          Residencia?: string | null
          Teléfono?: string | null
          "Tipologías y tarifas"?: string | null
        }
        Update: {
          "Cargo estancia"?: number | null
          "Cargo tasa turística"?: number | null
          "Check in"?: string | null
          "Check-out"?: string | null
          Cobros?: number | null
          "Código OTA"?: string | null
          Comisiones?: number | null
          "Comisiones retenidas"?: number | null
          "Creado por"?: string | null
          "Detalle precios habitaciones"?: string | null
          Email?: string | null
          Estado?: string | null
          "Fecha caducidad"?: string | null
          "Fecha de cancelación"?: string | null
          "Fecha de creación"?: string | null
          fecha_ultima_importacion?: string | null
          Habitaciones?: string | null
          "Hora estimada de llegada"?: string | null
          "Hora estimada de salida"?: string | null
          Huéspedes?: number | null
          "Huéspedes exentos"?: number | null
          "Huespedes mayores de edad"?: number | null
          "Huéspedes menores de edad"?: number | null
          ID?: string | null
          "ID Habitaciones"?: string | null
          "ID Tipologie"?: string | null
          Idioma?: string | null
          "Método de adquisición"?: string | null
          "N. Habitaciones"?: number | null
          Nacionalidad?: string | null
          Noches?: number | null
          Notas?: string | null
          "Notas internas"?: string | null
          Número?: string
          "Origen Lead"?: string | null
          "Otros cobros"?: number | null
          Pagado?: number | null
          Pagador?: string | null
          País?: string | null
          "Pendiente de pago"?: number | null
          Portal?: string | null
          Referencia?: string | null
          Residencia?: string | null
          Teléfono?: string | null
          "Tipologías y tarifas"?: string | null
        }
        Relationships: []
      }
      rol_permisos: {
        Row: {
          id_permis: number
          id_rol: number
          menu: string
          pot_editar: boolean
          pot_veure: boolean
        }
        Insert: {
          id_permis?: number
          id_rol: number
          menu: string
          pot_editar?: boolean
          pot_veure?: boolean
        }
        Update: {
          id_permis?: number
          id_rol?: number
          menu?: string
          pot_editar?: boolean
          pot_veure?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rol_permisos_id_rol_fkey"
            columns: ["id_rol"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id_rol"]
          },
        ]
      }
      roles: {
        Row: {
          acceso_app: string | null
          activo: boolean | null
          descripcion: string | null
          id_rol: number
          nombre: string
        }
        Insert: {
          acceso_app?: string | null
          activo?: boolean | null
          descripcion?: string | null
          id_rol?: number
          nombre: string
        }
        Update: {
          acceso_app?: string | null
          activo?: boolean | null
          descripcion?: string | null
          id_rol?: number
          nombre?: string
        }
        Relationships: []
      }
      tipologia_apartamento: {
        Row: {
          activo: boolean | null
          descripcion: string | null
          id_tipologia: number
          id_tipologia_base: number | null
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          descripcion?: string | null
          id_tipologia?: number
          id_tipologia_base?: number | null
          nombre: string
        }
        Update: {
          activo?: boolean | null
          descripcion?: string | null
          id_tipologia?: number
          id_tipologia_base?: number | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipologia_apartamento_id_tipologia_base_fkey"
            columns: ["id_tipologia_base"]
            isOneToOne: false
            referencedRelation: "tipologia_apartamento"
            referencedColumns: ["id_tipologia"]
          },
        ]
      }
      tipos_espacio_comun: {
        Row: {
          activo: boolean
          creado_en: string
          id_tipo: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id_tipo?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id_tipo?: number
          nombre?: string
        }
        Relationships: []
      }
      tipos_tarea_generica: {
        Row: {
          actiu: boolean
          computable_hores: boolean
          creado_en: string | null
          creado_por: number | null
          id_tipus: number
          nombre: string
          notas: string | null
          orden: number | null
          requiere_apartamento: boolean
        }
        Insert: {
          actiu?: boolean
          computable_hores?: boolean
          creado_en?: string | null
          creado_por?: number | null
          id_tipus?: number
          nombre: string
          notas?: string | null
          orden?: number | null
          requiere_apartamento?: boolean
        }
        Update: {
          actiu?: boolean
          computable_hores?: boolean
          creado_en?: string | null
          creado_por?: number | null
          id_tipus?: number
          nombre?: string
          notas?: string | null
          orden?: number | null
          requiere_apartamento?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tipos_tarea_generica_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      trabajos: {
        Row: {
          categoria: string
          creado_por: number | null
          descripcion: string | null
          estado: string | null
          fecha_apertura: string | null
          fecha_cierre: string | null
          fecha_limite: string | null
          habitacion: string | null
          id_reserva: number | null
          id_tipologia: number | null
          id_trabajo: number
          notas: string | null
          prioridad: string | null
          titulo: string
        }
        Insert: {
          categoria: string
          creado_por?: number | null
          descripcion?: string | null
          estado?: string | null
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_limite?: string | null
          habitacion?: string | null
          id_reserva?: number | null
          id_tipologia?: number | null
          id_trabajo?: number
          notas?: string | null
          prioridad?: string | null
          titulo: string
        }
        Update: {
          categoria?: string
          creado_por?: number | null
          descripcion?: string | null
          estado?: string | null
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_limite?: string | null
          habitacion?: string | null
          id_reserva?: number | null
          id_tipologia?: number | null
          id_trabajo?: number
          notas?: string | null
          prioridad?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "trabajos_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reservas_gestio"
            referencedColumns: ["id_historico"]
          },
          {
            foreignKeyName: "trabajos_id_tipologia_fkey"
            columns: ["id_tipologia"]
            isOneToOne: false
            referencedRelation: "tipologia_apartamento"
            referencedColumns: ["id_tipologia"]
          },
        ]
      }
      trabajos_asignaciones: {
        Row: {
          coste_hora: number | null
          coste_total: number | null
          hora_fin: string | null
          hora_inicio: string | null
          horas_totales: number | null
          id_asignacion: number
          id_persona: number
          id_trabajo: number
          notas: string | null
        }
        Insert: {
          coste_hora?: number | null
          coste_total?: number | null
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_totales?: number | null
          id_asignacion?: number
          id_persona: number
          id_trabajo: number
          notas?: string | null
        }
        Update: {
          coste_hora?: number | null
          coste_total?: number | null
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_totales?: number | null
          id_asignacion?: number
          id_persona?: number
          id_trabajo?: number
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_asignaciones_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "trabajos_asignaciones_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id_trabajo"]
          },
        ]
      }
      trabajos_checklist: {
        Row: {
          completado: boolean | null
          id_item: number
          id_respuesta: number
          id_trabajo: number
          respuesta_texto: string | null
          timestamp: string | null
          url_multimedia: string | null
        }
        Insert: {
          completado?: boolean | null
          id_item: number
          id_respuesta?: number
          id_trabajo: number
          respuesta_texto?: string | null
          timestamp?: string | null
          url_multimedia?: string | null
        }
        Update: {
          completado?: boolean | null
          id_item?: number
          id_respuesta?: number
          id_trabajo?: number
          respuesta_texto?: string | null
          timestamp?: string | null
          url_multimedia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_checklist_id_item_fkey"
            columns: ["id_item"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id_item"]
          },
          {
            foreignKeyName: "trabajos_checklist_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id_trabajo"]
          },
        ]
      }
      trabajos_materiales: {
        Row: {
          cantidad: number
          coste_total: number | null
          coste_unitario: number | null
          descripcion: string | null
          id: number
          id_material: number | null
          id_trabajo: number
        }
        Insert: {
          cantidad: number
          coste_total?: number | null
          coste_unitario?: number | null
          descripcion?: string | null
          id?: number
          id_material?: number | null
          id_trabajo: number
        }
        Update: {
          cantidad?: number
          coste_total?: number | null
          coste_unitario?: number | null
          descripcion?: string | null
          id?: number
          id_material?: number | null
          id_trabajo?: number
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_materiales_id_material_fkey"
            columns: ["id_material"]
            isOneToOne: false
            referencedRelation: "materiales_catalogo"
            referencedColumns: ["id_material"]
          },
          {
            foreignKeyName: "trabajos_materiales_id_trabajo_fkey"
            columns: ["id_trabajo"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id_trabajo"]
          },
        ]
      }
    }
    Views: {
      v_apartamentos_nombres: {
        Row: {
          id_apt: number | null
          nombre_buscable: string | null
          nombre_oficial: string | null
        }
        Relationships: []
      }
      v_apartamentos_sin_configurar: {
        Row: {
          nombre_detectado: string | null
        }
        Relationships: []
      }
      v_reservas_por_apartamento: {
        Row: {
          "Check in": string | null
          "Check-out": string | null
          "Código OTA": string | null
          es_reserva_compartida: boolean | null
          Estado: string | null
          habitacion_individual: string | null
          habitaciones_original: string | null
          "Hora estimada de llegada": string | null
          "Hora estimada de salida": string | null
          Huéspedes: number | null
          "Huespedes mayores de edad": number | null
          "Huéspedes menores de edad": number | null
          ID: string | null
          id_apt: number | null
          Noches: number | null
          Notas: string | null
          "Notas internas": string | null
          Número: string | null
          Portal: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_edit_menu: { Args: { p_menu: string }; Returns: boolean }
      complete_own_onboarding: { Args: never; Returns: undefined }
      current_id_persona: { Args: never; Returns: number }
      is_gestor_or_admin: { Args: never; Returns: boolean }
      personal_codigos_by_ids: {
        Args: { p_ids: number[] }
        Returns: {
          codigo: string
          id_persona: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
