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
  HCheckInConf: string | null;
  HCheckOutConf: string | null;
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
};

export type AgCheckIn = { id_persona: number; nombre: string | null; apellidos: string | null };
export type PersLimp = { id_persona: number; nombre: string | null; apellidos: string | null; codigo?: string | null };

export const fullName = (p: { nombre: string | null; apellidos: string | null } | null | undefined) =>
  p ? [p.nombre, p.apellidos].filter(Boolean).join(" ").trim() || "—" : "—";

export type Reserva = ReservaKB & { gestio: ReservaGestio | null };