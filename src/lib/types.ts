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
  hora_llegada_estimada: string | null;
  check_in_realizado: boolean | null;
  limpieza_realizada: boolean | null;
  limpiador_asignado: string | null;
  fianza_recibida: boolean | null;
  documento_recibido: boolean | null;
  notas: string | null;
  updated_at?: string | null;
};

export type Reserva = ReservaKB & { gestio: ReservaGestio | null };