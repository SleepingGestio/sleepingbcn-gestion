import { supabase } from "@/integrations/supabase/client";

type ResVw = {
  "Número": string;
  "Check in": string | null;
  "Check-out": string | null;
  "Noches": number | null;
  "Huéspedes": number | null;
  "Estado": string | null;
  "Hora estimada de llegada": string | null;
  "Hora estimada de salida": string | null;
  id_apt: number | null;
  es_reserva_compartida: boolean | null;
};

type Apt = {
  id_apt: number;
  id_grupo: number | null;
  camas_fijas: number | null;
  tiene_sofa_cama: boolean | null;
  requiere_limpieza_intermedia: boolean | null;
};

type Gestio = {
  "Número": string;
  HCheckInConf: string | null;
  HCheckOutConf: string | null;
};

type Grupo = {
  id_grupo: number;
  mostrar_por_defecto: boolean | null;
};

type ExistingLimp = {
  id_limpieza: number;
  numero_reserva: string | null;
  id_apt: number;
  fecha_limpieza: string;
  tipo: string | null;
  hora_out_time?: string | null;
  hora_in_time?: string | null;
  hora_in_informed?: boolean | null;
  sfc_montar?: boolean | null;
  sfc_montar_manual?: boolean | null;
  sfc_desmontar?: boolean | null;
  sfc_desmontar_manual?: boolean | null;
  proxima_reserva_numero?: string | null;
  affected_by_kb_change?: boolean | null;
  affected_reason?: string | null;
  estado?: string | null;
};

// The normal reservation lifecycle is Confirmada → Check-in realizado →
// Check-out realizado. These three are the only "valid" states for cleaning
// generation and next-reservation lookups. Cancelada / No show are problem
// states and are explicitly excluded (and surfaced via affected_reason).
const ESTADOS_VALID = ["Confirmada", "Check-in realizado", "Check-out realizado"];
const ESTADOS_CANCELADAS = new Set(["Cancelada", "No show"]);

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function trimHM(s: string | null | undefined): string | null {
  if (!s) return null;
  const str = String(s).trim();
  // Pure time value like "15:00" or "15:00:00"
  if (/^\d{1,2}:\d{2}/.test(str)) {
    const m = str.match(/^(\d{1,2}):(\d{2})/)!;
    return `${m[1].padStart(2, "0")}:${m[2]}:00`;
  }
  // Timestamp value (with or without TZ). Convert to Europe/Madrid local time
  // to recover the time the operator actually entered.
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.format(d).match(/(\d{2}):(\d{2})/);
    return parts ? `${parts[1]}:${parts[2]}:00` : null;
  }
  return null;
}

function resolveTime(
  conf: string | null,
  estimada: string | null,
  defaultVal: string,
): { value: string; informed: boolean } {
  const c = trimHM(conf);
  if (c) return { value: c, informed: true };
  const e = trimHM(estimada);
  if (e) return { value: e, informed: true };
  return { value: defaultVal, informed: false };
}

function minsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const pa = a.match(/(\d{1,2}):(\d{2})/);
  const pb = b.match(/(\d{1,2}):(\d{2})/);
  if (!pa || !pb) return null;
  return Number(pb[1]) * 60 + Number(pb[2]) - (Number(pa[1]) * 60 + Number(pa[2]));
}

function intermediaOffsets(noches: number): number[] {
  if (noches < 7) return [];
  if (noches < 14) return [Math.round(noches / 2)];
  if (noches < 21) return [5, 10];
  // >= 21 nights: not covered explicitly; cap at 2 cleanings spaced ~7d
  return [5, 10];
}

export type GenerarResult = { created: number; updated: number };

export async function generarLimpiezas(fromISO: string, toISO: string): Promise<GenerarResult> {
  // Fetch reservations whose stay overlaps [from, to] (for intermedia) OR whose checkout is in [from,to] (for salida)
  // Single broader query: stay overlapping is the superset.
  const { data: vresAll, error: e1 } = await supabase
    .from("v_reservas_por_apartamento")
    .select(
      `"Número","Check in","Check-out","Noches","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`,
    )
    .in("Estado", ESTADOS_VALID)
    .lte("Check in", toISO)
    .gte("Check-out", fromISO);
  if (e1) throw e1;
  const vres = (vresAll ?? []) as ResVw[];

  // Plus a wider window of FUTURE reservations to find "next reservation" per apt (up to 7 days after a checkout in range).
  const widerTo = addDaysISO(toISO, 8);
  const { data: vresFuture, error: e2 } = await supabase
    .from("v_reservas_por_apartamento")
    .select(`"Número","Check in","Check-out","Huéspedes","Estado",id_apt,"Hora estimada de llegada"`)
    .in("Estado", ESTADOS_VALID)
    .gte("Check in", fromISO)
    .lte("Check in", widerTo);
  if (e2) throw e2;
  const futureByApt = new Map<
    number,
    { ci: string; co: string; numero: string; guests: number; ciTime: string }[]
  >();
  for (const r of (vresFuture ?? []) as ResVw[]) {
    if (r.id_apt == null || !r["Check in"]) continue;
    const arr = futureByApt.get(r.id_apt) ?? [];
    arr.push({
      ci: r["Check in"]!,
      co: r["Check-out"] ?? r["Check in"]!,
      numero: r["Número"],
      guests: r["Huéspedes"] ?? 0,
      ciTime: trimHM(r["Hora estimada de llegada"]) ?? "99:99:99",
    });
    futureByApt.set(r.id_apt, arr);
  }
  for (const arr of futureByApt.values())
    arr.sort((a, b) => a.ci.localeCompare(b.ci) || a.ciTime.localeCompare(b.ciTime));

  // Apartments + gestio
  const aptIds = Array.from(new Set(vres.map((r) => r.id_apt).filter((x): x is number => x != null)));
  const numeros = Array.from(new Set(vres.map((r) => r["Número"]).filter(Boolean)));
  const [aptsRes, gestRes] = await Promise.all([
    aptIds.length
      ? supabase
          .from("apartamentos")
          .select("id_apt, camas_fijas, tiene_sofa_cama, requiere_limpieza_intermedia")
          .in("id_apt", aptIds)
      : Promise.resolve({ data: [] as Apt[], error: null }),
    numeros.length
      ? supabase
          .from("reservas_gestio")
          .select(`"Número",HCheckInConf,HCheckOutConf`)
          .in("Número", numeros)
      : Promise.resolve({ data: [] as Gestio[], error: null }),
  ]);
  if ((aptsRes as any).error) throw (aptsRes as any).error;
  if ((gestRes as any).error) throw (gestRes as any).error;
  const aptMap = new Map<number, Apt>(((aptsRes.data ?? []) as Apt[]).map((a) => [a.id_apt, a]));
  const gestMap = new Map<string, Gestio>(
    ((gestRes.data ?? []) as Gestio[]).map((g) => [g["Número"], g]),
  );

  // Existing limpiezas to dedupe — for all (numero, apt) pairs we may touch
  const { data: existRows, error: e3 } = numeros.length
    ? await supabase
        .from("limpiezas")
        .select(
          "id_limpieza, numero_reserva, id_apt, fecha_limpieza, tipo, hora_out_time, hora_in_time, hora_in_informed, sfc_montar, sfc_montar_manual, sfc_desmontar, sfc_desmontar_manual, proxima_reserva_numero, affected_by_kb_change, affected_reason, estado",
        )
        .in("numero_reserva", numeros)
    : { data: [], error: null };
  if (e3) throw e3;
  const existing = (existRows ?? []) as ExistingLimp[];

  // ---- KB CHANGE DETECTION on existing salida rows ----
  // Recalculate everything as if generating fresh, then compare against the
  // currently-stored values. ANY mismatch flips affected_by_kb_change=true
  // and stamps a machine-readable affected_reason. We DO NOT overwrite the
  // stored field values themselves — only the flag/reason. The popover lets
  // the gestor explicitly apply the recomputed values.
  const salidaExisting = existing.filter(
    (l) => l.tipo === "salida" && l.estado !== "anulada" && l.numero_reserva,
  );
  if (salidaExisting.length) {
    // Universe of reservation numbers to inspect: every salida's linked
    // numero plus its previously-recorded next-reservation numero.
    const lookupNums = Array.from(
      new Set(
        salidaExisting.flatMap((l) =>
          [l.numero_reserva, l.proxima_reserva_numero].filter(Boolean),
        ),
      ),
    ) as string[];

    // Bypass status filter — we WANT Cancelada / No show so we can flag them.
    const { data: lookupRows, error: eLk } = lookupNums.length
      ? await supabase
          .from("v_reservas_por_apartamento")
          .select(
            `"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`,
          )
          .in("Número", lookupNums)
      : { data: [] as any[], error: null };
    if (eLk) throw eLk;
    const resByNumero = new Map<string, ResVw>();
    for (const r of ((lookupRows ?? []) as ResVw[])) {
      if (!resByNumero.has(r["Número"])) resByNumero.set(r["Número"], r);
    }

    // Ensure apt + gestio coverage for everything we may inspect.
    const extraAptIds = Array.from(
      new Set(
        Array.from(resByNumero.values())
          .map((r) => r.id_apt)
          .filter((x): x is number => x != null && !aptMap.has(x)),
      ),
    );
    if (extraAptIds.length) {
      const { data: extraApts } = await supabase
        .from("apartamentos")
        .select("id_apt, camas_fijas, tiene_sofa_cama, requiere_limpieza_intermedia")
        .in("id_apt", extraAptIds);
      for (const a of ((extraApts ?? []) as Apt[])) aptMap.set(a.id_apt, a);
    }
    const missingGestNums = lookupNums.filter((n) => !gestMap.has(n));
    if (missingGestNums.length) {
      const { data: extraGest } = await supabase
        .from("reservas_gestio")
        .select(`"Número",HCheckInConf,HCheckOutConf`)
        .in("Número", missingGestNums);
      for (const g of ((extraGest ?? []) as Gestio[])) gestMap.set(g["Número"], g);
    }

    type UpdatePayload = {
      affected_by_kb_change: boolean;
      affected_reason: string | null;
      proxima_reserva_numero?: string | null;
    };
    const updates: { id: number; payload: UpdatePayload }[] = [];

    for (const l of salidaExisting) {
      const numero = l.numero_reserva!;
      const cur = resByNumero.get(numero) ?? null;
      let reason: string | null = null;

      // (a) own reservation cancelada / no show
      if (cur && cur["Estado"] && ESTADOS_CANCELADAS.has(cur["Estado"]!)) {
        reason = "cancelada";
      }

      // (b) previously-matched next reservation cancelada / no show
      if (!reason && l.proxima_reserva_numero) {
        const prevNext = resByNumero.get(l.proxima_reserva_numero) ?? null;
        if (prevNext && prevNext["Estado"] && ESTADOS_CANCELADAS.has(prevNext["Estado"]!)) {
          reason = "cancelada";
        }
      }

      const baseCo = cur?.["Check-out"] ?? l.fecha_limpieza;
      const arr = futureByApt.get(cur?.id_apt ?? l.id_apt) ?? [];
      const freshNext = arr.find(
        (x) => x.numero !== numero && x.ci >= baseCo && x.ci <= addDaysISO(baseCo, 7),
      );
      const freshNextNumero = freshNext?.numero ?? null;

      if (!reason) {
        const gest = gestMap.get(numero) ?? null;
        const outRes = resolveTime(
          gest?.HCheckOutConf ?? null,
          cur?.["Hora estimada de salida"] ?? null,
          "11:00:00",
        );
        let inTime: string | null = null;
        if (freshNext) {
          const gestNext = gestMap.get(freshNext.numero) ?? null;
          const nextRow =
            resByNumero.get(freshNext.numero) ??
            vres.find((x) => x["Número"] === freshNext.numero) ??
            null;
          const inRes = resolveTime(
            gestNext?.HCheckInConf ?? null,
            nextRow?.["Hora estimada de llegada"] ?? null,
            "15:00:00",
          );
          inTime = inRes.value;
        }
        const apt = aptMap.get(cur?.id_apt ?? l.id_apt);
        let freshSfcMontar = false;
        let freshSfcDesmontar = false;
        if (cur && apt && !cur.es_reserva_compartida && apt.tiene_sofa_cama) {
          const camas = apt.camas_fijas ?? 0;
          const thisGuests = cur["Huéspedes"] ?? 0;
          const nextGuests = freshNext?.guests ?? 0;
          const nextNeedsSfc = !!freshNext && nextGuests > camas;
          freshSfcMontar = nextNeedsSfc;
          const thisNeedsSfc = thisGuests > camas;
          freshSfcDesmontar = thisNeedsSfc && !nextNeedsSfc;
        }

        if (cur && cur.id_apt != null && cur.id_apt !== l.id_apt) {
          reason = "apartamento";
        } else if (cur && cur["Check-out"] && cur["Check-out"] !== l.fecha_limpieza) {
          reason = "fechas";
        } else {
          const storedSfcMontarAuto = l.sfc_montar_manual == null ? !!l.sfc_montar : null;
          const storedSfcDesmontarAuto =
            l.sfc_desmontar_manual == null ? !!l.sfc_desmontar : null;
          const sfcMontarDiff =
            storedSfcMontarAuto !== null && storedSfcMontarAuto !== freshSfcMontar;
          const sfcDesmontarDiff =
            storedSfcDesmontarAuto !== null && storedSfcDesmontarAuto !== freshSfcDesmontar;
          if (sfcMontarDiff || sfcDesmontarDiff) {
            reason = "huespedes";
          } else if (
            l.proxima_reserva_numero != null &&
            l.proxima_reserva_numero !== freshNextNumero
          ) {
            reason = "proxima_reserva";
          } else if (
            outRes.value !== (l.hora_out_time ?? null) ||
            inTime !== (l.hora_in_time ?? null)
          ) {
            reason = "horario";
          }
        }
      }

      // Backfill proxima_reserva_numero for legacy rows where it's NULL,
      // without flagging — record the current value so future runs can
      // detect "next reservation changed".
      const needsBackfill =
        l.proxima_reserva_numero == null && freshNextNumero != null && !reason;

      const isAffected = reason !== null;
      const flagChanged =
        !!l.affected_by_kb_change !== isAffected ||
        (l.affected_reason ?? null) !== reason;

      if (flagChanged || needsBackfill) {
        const payload: UpdatePayload = {
          affected_by_kb_change: isAffected,
          affected_reason: reason,
        };
        if (needsBackfill) payload.proxima_reserva_numero = freshNextNumero;
        updates.push({ id: l.id_limpieza, payload });
      }
    }

    for (const u of updates) {
      const { error } = await supabase
        .from("limpiezas")
        .update(u.payload)
        .eq("id_limpieza", u.id);
      if (error) throw error;
    }
  }

  const salidaKey = (n: string, apt: number) => `${n}|${apt}|salida`;
  const intermediaKey = (n: string, apt: number) => `${n}|${apt}|intermedia`;
  const existingSalida = new Set<string>();
  const existingIntermediaByPair = new Map<string, Set<string>>(); // key -> set of fechas
  for (const l of existing) {
    if (!l.numero_reserva) continue;
    if (l.tipo === "salida") existingSalida.add(salidaKey(l.numero_reserva, l.id_apt));
    else if (l.tipo === "intermedia") {
      const k = intermediaKey(l.numero_reserva, l.id_apt);
      const s = existingIntermediaByPair.get(k) ?? new Set<string>();
      s.add(l.fecha_limpieza);
      existingIntermediaByPair.set(k, s);
    }
  }

  const inserts: any[] = [];

  for (const r of vres) {
    if (r.id_apt == null) continue;
    const apt = aptMap.get(r.id_apt);
    const ci = r["Check in"];
    const co = r["Check-out"];
    if (!ci || !co) continue;

    // ---- SALIDA: checkout in [fromISO, toISO]
    if (co >= fromISO && co <= toISO) {
      if (!existingSalida.has(salidaKey(r["Número"], r.id_apt))) {
        const gest = gestMap.get(r["Número"]) ?? null;
        const out = resolveTime(
          gest?.HCheckOutConf ?? null,
          r["Hora estimada de salida"],
          "11:00:00",
        );
        // find next reservation for same apt within 7 days
        const arr = futureByApt.get(r.id_apt) ?? [];
        const next = arr.find(
          (x) => x.numero !== r["Número"] && x.ci >= co && x.ci <= addDaysISO(co, 7),
        );
        let inTime: string | null = null;
        let inInformed = false;
        let sfc_montar = false;
        let sfc_desmontar = false;
        if (next) {
          const gestNext = gestMap.get(next.numero) ?? null;
          // We don't have Hora estimada de llegada for next here; refetch lightly via existing vres if possible.
          const nextRow = vres.find(
            (x) => x["Número"] === next.numero && x.id_apt === r.id_apt,
          );
          const inRes = resolveTime(
            gestNext?.HCheckInConf ?? null,
            nextRow?.["Hora estimada de llegada"] ?? null,
            "15:00:00",
          );
          inTime = inRes.value;
          inInformed = inRes.informed;
        }
        // SFC calc (only when non-shared and apartment has SFC)
        if (!r.es_reserva_compartida && apt?.tiene_sofa_cama) {
          const camas = apt.camas_fijas ?? 0;
          const thisGuests = r["Huéspedes"] ?? 0;
          const nextGuests = next?.guests ?? 0;
          const nextNeedsSfc = !!next && nextGuests > camas;
          sfc_montar = nextNeedsSfc;
          const thisNeedsSfc = thisGuests > camas;
          sfc_desmontar = thisNeedsSfc && !nextNeedsSfc;
        }
        const prioritaria =
          inTime != null
            ? (minsBetween(out.value, inTime) ?? Infinity) < 150
            : false;

        inserts.push({
          numero_reserva: r["Número"],
          id_apt: r.id_apt,
          fecha_limpieza: co,
          tipo: "salida",
          hora_out_time: out.value,
          hora_out_informed: out.informed,
          hora_in_time: inTime,
          hora_in_informed: inInformed,
          sfc_montar,
          sfc_desmontar,
          prioritaria,
          estado: "activa",
          proxima_reserva_numero: next?.numero ?? null,
          check_toallas: false,
          check_sabanas: false,
          check_limpieza_basica: false,
          check_limpieza_completa: false,
        });
        existingSalida.add(salidaKey(r["Número"], r.id_apt));
      }
    }

    // ---- INTERMEDIA: skip for shared reservations
    if (r.es_reserva_compartida) continue;
    // Skip if the apartment opts out of intermediate cleanings.
    if (apt && apt.requiere_limpieza_intermedia === false) continue;
    const noches = r["Noches"] ?? 0;
    const offsets = intermediaOffsets(noches);
    if (offsets.length === 0) continue;
    const key = intermediaKey(r["Número"], r.id_apt);
    const existingFechas = existingIntermediaByPair.get(key) ?? new Set<string>();
    // If already has expected count, skip
    if (existingFechas.size >= offsets.length) continue;
    for (const off of offsets) {
      const fecha = addDaysISO(ci, off);
      if (fecha < fromISO || fecha > toISO) continue;
      if (existingFechas.has(fecha)) continue;
      inserts.push({
        numero_reserva: r["Número"],
        id_apt: r.id_apt,
        fecha_limpieza: fecha,
        tipo: "intermedia",
        hora_out_time: "11:00:00",
        hora_out_informed: false,
        hora_in_time: null,
        hora_in_informed: false,
        sfc_montar: false,
        sfc_desmontar: false,
        prioritaria: false,
        estado: "activa",
        check_toallas: true,
        check_sabanas: true,
        check_limpieza_basica: true,
        check_limpieza_completa: false,
      });
      existingFechas.add(fecha);
      existingIntermediaByPair.set(key, existingFechas);
    }
  }

  let created = 0;
  if (inserts.length) {
    // Insert in batches
    const batchSize = 200;
    for (let i = 0; i < inserts.length; i += batchSize) {
      const batch = inserts.slice(i, i + batchSize);
      const { error } = await supabase.from("limpiezas").insert(batch);
      if (error) throw error;
      created += batch.length;
    }
  }

  return { created, updated: 0 };
}