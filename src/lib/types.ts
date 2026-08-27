export type ReservaKB = {
  "Número": string;
  "Check in": string | null;
  "Check-out": string | null;
  "Referencia": string | null;
  "Habitaciones": string | null;
  "Portal": string | null;
  "Estado": string | null;
  "Huéspedes": number | null;
  "Cobros": number | null;
  "Email": string | null;
  "Teléfono": string | null;
  "Hora estimada de llegada": string | null;
  "Hora estimada de salida": string | null;
  "Notas internas": string | null;
  "Notas": string | null;
  "Cargo estancia": number | null;
  "Cargo tasa turística": number | null;
  "Pendiente de pago": number | null;
  "Pagado": number | null;
  "Comisiones": number | null;
  "Fecha de creación": string | null;
  "Fecha de cancelación": string | null;
  "Método de adquisición": string | null;
  "Creado por": string | null;
  "fecha_ultima_importacion": string | null;
  [key: string]: unknown;
};

export type ReservaGestio = {
  "Número": string;
  ParteeEnv: string | null;
  ParteeRecl1: string | null;
  ParteeRecl2: string | null;
  ParteeRecl3: string | null;
  AgCheckIN: number | null;
  PersLImpAsig: number | null;
  ImpTTAX: number | null;
  TaxCobradas: number | null;
  ReadyCheckIn: boolean | null;
  EnLimpieza: boolean | null;
  NotasGestio: string | null;
  PagadoEstancia: number | null;
  PagadoLimpieza: number | null;
  PctComisionOTA: number | null;
  PctPorCobro: number | null;
  /** "Cuenta verificada y cerrada" — scoped to the Inf. económica tab. */
  CuentaVerificada: boolean | null;
  /** Expected tourist-tax amount; prefilled from KB "Cargo tasa turística", then editable. Informational. */
  TasaTuristica: number | null;
  /** Tourist tax actually collected in cash — manual entry, informational. */
  TasaTuristicaCobrada: number | null;
};

/** A persisted extra charge line for a reservation (reservas_extras row). */
export type ReservaExtra = {
  id_extra: number;
  numero_reserva: string;
  concepto: string;
  importe: number;
  con_iva: boolean;
};

/** Editable draft of an extra line in the detail popover; id_extra is absent
 *  until the line has been persisted at least once. */
export type ReservaExtraDraft = {
  id_extra?: number;
  concepto: string;
  importe: number | null;
  con_iva: boolean;
};

export type AgCheckIn = { id_persona: number; nombre: string | null; apellidos: string | null };
export type PersLimp = { id_persona: number; nombre: string | null; apellidos: string | null; codigo?: string | null };

export const fullName = (p: { nombre: string | null; apellidos: string | null } | null | undefined) =>
  p ? [p.nombre, p.apellidos].filter(Boolean).join(" ").trim() || "—" : "—";

/** Apartment fields resolved for a reservation via the apartamentos.nombre <-> reservas_kb.Habitaciones exact-match convention. */
export type ApartamentoInfo = {
  id_apt: number;
  id_categoria: number | null;
  id_tipo_licencia: number | null;
  id_categoria_limpieza: number | null;
};

export type Reserva = ReservaKB & { gestio: ReservaGestio | null; apartamento?: ApartamentoInfo | null };