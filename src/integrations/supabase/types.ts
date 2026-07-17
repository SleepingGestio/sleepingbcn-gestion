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
      personal_ajustos_hores: {
        Row: {
          created_at: string
          fecha: string
          horas: number
          id_ajuste: number
          id_persona: number
          notas: string | null
          tipo: string | null
          tipus_computa: string
        }
        Insert: {
          created_at?: string
          fecha: string
          horas: number
          id_ajuste?: never
          id_persona: number
          notas?: string | null
          tipo?: string | null
          tipus_computa?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          horas?: number
          id_ajuste?: never
          id_persona?: number
          notas?: string | null
          tipo?: string | null
          tipus_computa?: string
        }
        Relationships: []
      }
      personal_periodos_actividad: {
        Row: {
          creado_por: number | null
          created_at: string
          dies_vacances_any: number
          fecha_fin: string | null
          fecha_inicio: string
          horas_objetivo_mes: number | null
          id_periodo: number
          id_persona: number
          motivo: string | null
        }
        Insert: {
          creado_por?: number | null
          created_at?: string
          dies_vacances_any?: number
          fecha_fin?: string | null
          fecha_inicio: string
          horas_objetivo_mes?: number | null
          id_periodo?: never
          id_persona: number
          motivo?: string | null
        }
        Update: {
          creado_por?: number | null
          created_at?: string
          dies_vacances_any?: number
          fecha_fin?: string | null
          fecha_inicio?: string
          horas_objetivo_mes?: number | null
          id_periodo?: never
          id_persona?: number
          motivo?: string | null
        }
        Relationships: []
      }
      personal_resum_mes: {
        Row: {
          any_mes: number
          cerrado: boolean
          cerrado_en: string | null
          cerrado_por: number | null
          created_at: string
          decisio_tancament: string | null
          horas_ajust_saldo: number
          horas_objetivo_base: number
          horas_objetivo_efectiu: number
          horas_reduccion: number
          horas_treballades: number
          id_persona: number
          id_resum: number
          mes: number
          notas: string | null
          saldo_acumulat_anterior: number
          saldo_acumulat_fi: number
          saldo_mes: number
          updated_at: string
        }
        Insert: {
          any_mes: number
          cerrado?: boolean
          cerrado_en?: string | null
          cerrado_por?: number | null
          created_at?: string
          decisio_tancament?: string | null
          horas_ajust_saldo?: number
          horas_objetivo_base?: number
          horas_objetivo_efectiu?: number
          horas_reduccion?: number
          horas_treballades?: number
          id_persona: number
          id_resum?: never
          mes: number
          notas?: string | null
          saldo_acumulat_anterior?: number
          saldo_acumulat_fi?: number
          saldo_mes?: number
          updated_at?: string
        }
        Update: {
          any_mes?: number
          cerrado?: boolean
          cerrado_en?: string | null
          cerrado_por?: number | null
          created_at?: string
          decisio_tancament?: string | null
          horas_ajust_saldo?: number
          horas_objetivo_base?: number
          horas_objetivo_efectiu?: number
          horas_reduccion?: number
          horas_treballades?: number
          id_persona?: number
          id_resum?: never
          mes?: number
          notas?: string | null
          saldo_acumulat_anterior?: number
          saldo_acumulat_fi?: number
          saldo_mes?: number
          updated_at?: string
        }
        Relationships: []
      }
      personal_vacances_any: {
        Row: {
          creado_en: string
          creado_por: number | null
          data_fi_any: string
          data_inici_any: string
          dies_assignats: number
          hores_assignades: number
          hores_calculades: number
          id_persona: number
          id_vac_any: number
          notas: string | null
          updated_at: string
        }
        Insert: {
          creado_en?: string
          creado_por?: number | null
          data_fi_any: string
          data_inici_any: string
          dies_assignats?: number
          hores_assignades?: number
          hores_calculades?: number
          id_persona: number
          id_vac_any?: never
          notas?: string | null
          updated_at?: string
        }
        Update: {
          creado_en?: string
          creado_por?: number | null
          data_fi_any?: string
          data_inici_any?: string
          dies_assignats?: number
          hores_assignades?: number
          hores_calculades?: number
          id_persona?: number
          id_vac_any?: never
          notas?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
