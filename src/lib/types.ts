export type ReservaKB = {
  "Número": string;
  "Llegada": string | null;
  "Salida": string | null;
  "Huésped": string | null;
  "Apartamento": string | null;
  "Canal": string | null;
  "Estado": string | null;
  "Personas": number | null;
  "Importe": number | null;
  "Email": string | null;
  "Teléfono": string | null;
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
  NotasGestio: string | null;
};

export type AgCheckIn = { id_agente: number; nombre: string | null; apellidos: string | null };
export type PersLimp = { id_persona: number; nombre: string | null; apellidos: string | null };

export const fullName = (p: { nombre: string | null; apellidos: string | null } | null | undefined) =>
  p ? [p.nombre, p.apellidos].filter(Boolean).join(" ").trim() || "—" : "—";

export type Reserva = ReservaKB & { gestio: ReservaGestio | null };