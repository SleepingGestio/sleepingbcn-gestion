// Partee API read-only probe.
//
// READ-ONLY: only GET requests and the two POST query endpoints (reservations, lote-status),
// which read data. Nothing is created, updated, finalized or deleted. No retries, no redirects.
//
// Usage (token only from the environment, never printed):
//   node scripts/partee-probe.mjs properties
//   node scripts/partee-probe.mjs reservations <estID> <dd-MM-yyyy>
//   node scripts/partee-probe.mjs reservation <id>
//   node scripts/partee-probe.mjs parte <parteId>
//   node scripts/partee-probe.mjs webhooks
//   node scripts/partee-probe.mjs lotes <estID> <yyyy-MM-dd> <yyyy-MM-dd> [--tipo=ALL|PV|RH] [--raw]
//   node scripts/partee-probe.mjs lotes-parte <parteId>
//   node scripts/partee-probe.mjs lotes-all [estID]
//
// Env: PARTEE_API_TOKEN (required), PARTEE_LOGIN (required for `properties`).
// Personal data is masked in all output (initials, e-mail domain, URL host + 6 chars);
// guest data is never printed, only counts and non-personal status fields.

const BASE = 'https://app.partee.es/resources/api';
const TOKEN = process.env.PARTEE_API_TOKEN;
const LOGIN = process.env.PARTEE_LOGIN;

// Errors end the run through process.exitCode (no process.exit, so open handles close cleanly).
class Fail extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}
const die = (msg, code = 1) => {
  throw new Fail(msg, code);
};

// ---- masking ----
function maskName(v) {
  if (!v || typeof v !== 'string') return '-';
  return v.trim().split(/\s+/).map((p) => p[0]?.toUpperCase() + '.').join(' ');
}
function maskEmail(v) {
  if (!v || typeof v !== 'string') return '-';
  const at = v.lastIndexOf('@');
  return at < 0 ? '***' : '***@' + v.slice(at + 1);
}
function maskUrl(v) {
  if (!v || typeof v !== 'string') return '-';
  try {
    const u = new URL(v);
    return `${u.host}${u.pathname.slice(0, 7)}…`;
  } catch {
    return '***';
  }
}
function shortError(v) {
  if (!v) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.replace(/[^\s@]+@[^\s@]+/g, '***@***').slice(0, 120);
}
const show = (v) => (v === undefined || v === null || v === '' ? '-' : v);
const asList = (data, ...keys) => {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
};
const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).join(', ') : typeof o);

// ---- HTTP ----
// tolerate404: return { notFound: true, text } instead of failing, so the caller decides.
async function call(method, path, body, { tolerate404 = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status} ${method} ${path.split('?')[0]}`);
  if (res.status >= 300 && res.status < 400) {
    die(`Redirect (${res.status}) not followed. Location host: ${maskUrl(res.headers.get('location') ?? '')}`);
  }
  if (res.status === 401) die('401 — token invalid/expired or API access not enabled for this account');
  if (res.status === 429) die(`429 — rate limited. Retry-After: ${res.headers.get('retry-after') ?? '(not provided)'}`);
  if (res.status === 404 && tolerate404) return { res, data: null, notFound: true, text };
  if (!res.ok) die(`Error body: ${text.slice(0, 500) || '(empty)'}`);
  let data = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      die(`Non-JSON response body: ${text.slice(0, 500)}`);
    }
  }
  return { res, data };
}

// ---- commands ----
async function properties() {
  if (!LOGIN) die('Missing PARTEE_LOGIN (Partee account e-mail), required for `properties`.');
  const rows = [];
  for (let page = 0; page < 100; page++) {
    const q = `login=${encodeURIComponent(LOGIN)}&size=100&page=${page}&total=-1`;
    const { res, data, notFound, text } = await call('GET', `/establecimiento/external/getproperties?${q}`, undefined, { tolerate404: true });
    if (notFound) {
      if (text.trim()) die(`Error body: ${text.slice(0, 500)}`);
      if (page === 0) console.log('No establishments (404 with empty body).');
      break;
    }
    const list = asList(data, 'content', 'data', 'properties');
    rows.push(...list);
    const total = Number(res.headers.get('x-total-count'));
    if (!list.length || !Number.isFinite(total) || rows.length >= total) break;
  }
  console.table(rows.map((p) => ({
    id: p.id,
    nombre_establecimiento: p.nombre_establecimiento,
    municipio_establecimiento: p.municipio_establecimiento,
  })));
  console.log(`Total establishments: ${rows.length}`);
}

const reservationRow = (r) => ({
  id: show(r.id),
  parteID: show(r.parteID),
  status: show(r.status),
  idFromChannel: show(r.idFromChannel),
  channel: show(r.channel),
  checkInDate: show(r.checkInDate),
  checkOutDate: show(r.checkOutDate),
  totalGuests: show(r.totalGuests),
  guestName: maskName(r.guestName),
  guestEmail: maskEmail(r.guestEmail),
  checkInOnlineURL: maskUrl(r.checkInOnlineURL),
});

async function reservations(estID, date) {
  if (!estID || !/^\d{2}-\d{2}-\d{4}$/.test(date ?? '')) die('Usage: reservations <estID> <dd-MM-yyyy>');
  const { data, notFound, text } = await call('POST', '/reservation/external/reservations', {
    accomodationID: estID,
    checkinDate: date,
  }, { tolerate404: true });
  if (notFound) {
    if (!/no reservations/i.test(text)) die(`Error body: ${text.slice(0, 500) || '(empty)'}`);
    console.log('Reservations returned: 0');
    return;
  }
  const list = asList(data, 'content', 'data', 'reservations');
  console.table(list.map(reservationRow));
  console.log(`Reservations returned: ${list.length}`);
}

async function reservation(id) {
  if (!id) die('Usage: reservation <id>');
  const { data } = await call('GET', `/reservation/external/${encodeURIComponent(id)}`);
  console.log(`Top-level keys: ${keysOf(data)}`);
  console.table([reservationRow(data ?? {})]);
}

async function parte(parteId) {
  if (!parteId) die('Usage: parte <parteId>');
  const { data } = await call('GET', `/parteviajeros/external/${encodeURIComponent(parteId)}`);
  const p = data ?? {};
  console.log(`Top-level keys: ${keysOf(p)}`);
  console.table([{
    parteId: show(p.parteId),
    reservationId: show(p.reservationId),
    codigoReserva: show(p.codigoReserva),
    numParte: show(p.numParte),
    isBorrador: show(p.isBorrador),
    numLoteMinisterio: show(p.numLoteMinisterio),
    ministerioAnulacion: show(p.ministerioAnulacion),
    ministerioFixed: show(p.ministerioFixed),
    ministerioCodigoComunicacion: show(p.ministerioCodigoComunicacion),
    ministerioErrorDetalle: shortError(p.ministerioErrorDetalle) || '-',
    fechaEntrada: show(p.fechaEntrada),
    viajeros: Array.isArray(p.viajeros) ? p.viajeros.length : '-',
  }]);
}

async function webhooks() {
  const { data } = await call('GET', '/webhooks');
  const list = asList(data, 'content', 'data', 'webhooks');
  console.table(list.map((w) => ({
    id: show(w.id),
    eventType: show(w.eventType),
    estID: show(w.estID),
    online: show(w.online),
    presencial: show(w.presencial),
    whkurl: show(w.whkurl),
  })));
  console.log(`Webhooks: ${list.length}`);
}

// Non-personal values only: status/state fields plus any scalar date field.
function rawLote(l) {
  const out = { keys: keysOf(l) };
  for (const k of ['status', 'codigoEstado', 'descEstado', 'tipoComunicacion']) out[k] = show(l[k]);
  for (const [k, v] of Object.entries(l ?? {})) {
    if (/fecha|date/i.test(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = v;
  }
  return out;
}

const LOTE_URL = '/parteviajeros/external/seshospedajes/lote-status';
const numOrStr = (v) => (/^\d+$/.test(v) ? Number(v) : v);

// Runs one lote-status query. `raw` prints non-personal fields only; otherwise a summary table.
async function queryLotes(sent, raw) {
  console.log(`Request body sent: ${JSON.stringify(sent)}`);
  const { data } = await call('POST', LOTE_URL, sent);
  console.log(`Top-level keys: ${keysOf(data)}`);
  let list = asList(data, 'lotes', 'content', 'data');
  let foundUnder = Array.isArray(data) ? '(root array)' : ['lotes', 'content', 'data'].find((k) => Array.isArray(data?.[k]));
  if (!list.length && data && !Array.isArray(data)) {
    const k = Object.keys(data).find((key) => Array.isArray(data[key]));
    if (k) {
      list = data[k];
      foundUnder = k;
    }
  }
  console.log(`Lote array: ${foundUnder ? `under "${foundUnder}", ${list.length} item(s)` : 'not found'}`);
  if (raw) {
    list.forEach((l, i) => console.log(`lote[${i}]`, rawLote(l)));
  } else {
    console.table(list.map((l) => ({
      lote: String(l.lote ?? '').slice(0, 8) || '-',
      tipoComunicacion: show(l.tipoComunicacion),
      parteId: show(l.parteId),
      reservationId: show(l.reservationId),
      status: show(l.status),
      codigoEstado: show(l.codigoEstado),
      descEstado: show(l.descEstado),
      fechaProcesamiento: show(l.fechaProcesamiento),
      errorDetalle: shortError(l.errorDetalle) || '-',
    })));
  }
  console.log(`totalLotes: ${show(data?.totalLotes ?? list.length)}`);
}

async function lotes(...args) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const raw = args.includes('--raw');
  const tipoArg = args.find((a) => a.startsWith('--tipo='));
  const tipo = tipoArg ? tipoArg.slice(7).toUpperCase() : 'PV';
  const [estID, from, to] = args.filter((a) => !a.startsWith('--'));
  const unknown = args.filter((a) => a.startsWith('--') && a !== '--raw' && !a.startsWith('--tipo='));
  if (!estID || !iso.test(from ?? '') || !iso.test(to ?? '') || !['ALL', 'PV', 'RH'].includes(tipo) || unknown.length) {
    die('Usage: lotes <estID> <yyyy-MM-dd> <yyyy-MM-dd> [--tipo=ALL|PV|RH] [--raw]');
  }
  await queryLotes({
    tipo,
    accomodationIds: [numOrStr(estID)],
    startDate: from,
    endDate: to,
    limit: 50,
    page: 0,
  }, raw);
}

async function lotesParte(parteId) {
  if (!parteId) die('Usage: lotes-parte <parteId>');
  await queryLotes({ tipo: 'ALL', parteIds: [numOrStr(parteId)], limit: 50, page: 0 }, true);
}

async function lotesAll(estID) {
  const sent = { limit: 50, page: 0 };
  if (estID) sent.accomodationIds = [numOrStr(estID)];
  await queryLotes(sent, true);
}

// ---- main ----
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!TOKEN) die('Missing PARTEE_API_TOKEN environment variable. Set it in your terminal session (not in a file) and retry.');
  switch (cmd) {
    case 'properties': return properties();
    case 'reservations': return reservations(...args);
    case 'reservation': return reservation(...args);
    case 'parte': return parte(...args);
    case 'webhooks': return webhooks();
    case 'lotes': return lotes(...args);
    case 'lotes-parte': return lotesParte(...args);
    case 'lotes-all': return lotesAll(...args);
    default:
      die('Usage: partee-probe.mjs <properties | reservations <estID> <dd-MM-yyyy> | reservation <id> | parte <parteId> | webhooks | lotes <estID> <from> <to> [--tipo=ALL|PV|RH] [--raw] | lotes-parte <parteId> | lotes-all [estID]>');
  }
}

main().catch((e) => {
  console.error(e instanceof Fail ? e.message : `Request failed: ${e?.message ?? e}`);
  process.exitCode = e instanceof Fail ? e.code : 1;
});
