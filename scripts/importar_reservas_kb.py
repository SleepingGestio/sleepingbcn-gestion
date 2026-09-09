import os
import sys
import shutil
import unicodedata
import re
import hashlib
import argparse
import pandas as pd
import requests
import json
from datetime import datetime, date

# Las librerías de Google (y phonenumbers) solo hacen falta para la
# sincronización con Google Contacts. Se importan de forma tolerante para que
# el script pueda ejecutarse en un entorno donde no estén instaladas (p.ej. un
# runner de GitHub Actions que solo importa reservas), sin que eso rompa nada.
try:
    import phonenumbers
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from googleapiclient.discovery import build
    GOOGLE_LIBS_DISPONIBLES = True
except ImportError:
    GOOGLE_LIBS_DISPONIBLES = False

# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def cargar_env_local():
    """Lee un fichero .env situado junto al script (o en la carpeta padre) y
    vuelca sus valores en el entorno, sin pisar variables ya definidas.

    Sirve para que en local siga funcionando con un simple doble clic (basta
    tener el .env al lado), mientras que en GitHub Actions las mismas
    variables llegan como secrets y este fichero ni existe.
    """
    for carpeta in (BASE_DIR, os.path.dirname(BASE_DIR)):
        ruta = os.path.join(carpeta, ".env")
        if not os.path.isfile(ruta):
            continue
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    clave, _, valor = linea.partition("=")
                    clave = clave.strip()
                    valor = valor.strip().strip('"').strip("'")
                    if clave and clave not in os.environ:
                        os.environ[clave] = valor
        except Exception:
            pass  # un .env ilegible no debe impedir arrancar
        break


cargar_env_local()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wayawbosopwqyivacxah.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
TABLE = "reservas_kb"

# Carpeta donde se busca el Excel. Configurable por entorno para poder
# ejecutar el script en un runner (donde rclone habrá dejado el fichero en una
# carpeta temporal) sin tocar el comportamiento local de siempre.
WATCH_DIR = os.environ.get(
    "KB_WATCH_DIR",
    r"P:\SLEEPINGBCN PCloud\SISTEMES GESTIO\DESCARREGUES KB",
)
PROCESADOS_DIR = os.path.join(WATCH_DIR, "procesados")
RECHAZADOS_DIR = os.path.join(WATCH_DIR, "rechazados")
LOG_PATH = os.environ.get("KB_LOG_PATH", os.path.join(BASE_DIR, "importar_reservas_kb.log"))

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}
HEADERS_PLAIN = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# Sesión con reintento automático: si una petición falla por un error de
# conexión/SSL transitorio (p.ej. "SSLV3_ALERT_BAD_RECORD_MAC", timeouts,
# resets de conexión), se reintenta automáticamente antes de dar el fichero
# por rechazado. 3 intentos con espera creciente (0.5s, 1s, 2s).
_retries = requests.adapters.Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=[500, 502, 503, 504],
    allowed_methods=["GET", "POST", "PATCH"],
)
http = requests.Session()
http.mount("https://", requests.adapters.HTTPAdapter(max_retries=_retries))

# ------------------------------------------------------------
# Sincronización con Google Contacts (alta automática de huéspedes nuevos)
# ------------------------------------------------------------
# Requiere (una sola vez, en este PC):
#   pip install phonenumbers google-auth google-auth-oauthlib google-api-python-client
# Y el fichero google_client_secret.json (credencial OAuth tipo "Escritorio",
# descargada de Google Cloud Console) en la misma carpeta que este script.
# El primer arranque abrirá el navegador para el login; a partir de ahí el
# token se guarda en google_token.json y se renueva solo.
SYNC_GOOGLE_CONTACTS      = os.environ.get("SYNC_GOOGLE_CONTACTS", "1") != "0"
GOOGLE_CLIENT_SECRET_PATH = os.environ.get(
    "GOOGLE_CLIENT_SECRET_PATH", os.path.join(BASE_DIR, "google_client_secret.json")
)
GOOGLE_TOKEN_PATH         = os.environ.get(
    "GOOGLE_TOKEN_PATH", os.path.join(BASE_DIR, "google_token.json")
)
GOOGLE_CONTACTS_SCOPES    = ["https://www.googleapis.com/auth/contacts"]
GOOGLE_PHONE_REGION       = "ES"  # región por defecto para teléfonos sin prefijo de país

# ============================================================
# COLUMNAS EXACTAS del Excel de Krossbooking
# ============================================================

COLUMNAS_KB = [
    "ID", "Número", "Check in", "Check-out", "Noches",
    "N. Habitaciones", "Habitaciones", "Huéspedes",
    "Huéspedes menores de edad", "Huespedes mayores de edad",
    "Huéspedes exentos", "Nacionalidad", "Residencia",
    "Email", "Teléfono", "Tipologías y tarifas", "Portal",
    "Código OTA", "Referencia", "Estado",
    "Fecha de creación", "Fecha caducidad",
    "Cobros", "Cargo estancia", "Cargo tasa turística",
    "Otros cobros", "Pendiente de pago", "Pagado",
    "País", "Idioma",
    "Hora estimada de llegada", "Hora estimada de salida",
    "Notas", "Notas internas", "Fecha de cancelación",
    "Método de adquisición", "Origen Lead",
    "Detalle precios habitaciones", "Comisiones",
    "Comisiones retenidas", "ID Tipologie", "Pagador",
    "Creado por", "ID Habitaciones",
]

# Campos que se excluyen del hash de comparación y del diff:
# - fecha_ultima_importacion: metadato volátil, no es un dato real de la reserva.
# - ID: identificador interno de Krossbooking que cambia en cada exportación
#   aunque la reserva no haya cambiado — NO es estable, por eso usamos
#   "Número" para emparejar reservas, nunca "ID".
CAMPOS_EXCLUIDOS_HASH = {"fecha_ultima_importacion", "ID"}

# Estados de reserva que Krossbooking considera cancelación/no-show
ESTADOS_CANCELADAS = {"Cancelada", "No show"}

# Detección de "candidatas a eliminadas" DESACTIVADA (jul 2026): con rangos
# de exportación variables (el usuario elige fechas distintas cada vez), esta
# detección genera falsos positivos constantes — una reserva fuera del rango
# de hoy no significa que haya desaparecido de Krossbooking, ya que las
# reservas nunca se eliminan de verdad allí (como mucho pasan a "Cancelada").
# La función obtener_eliminadas_candidatas() se deja intacta por si algún día
# cambia el flujo de exportación (p.ej. rango siempre fijo/creciente) y vuelve
# a tener sentido reactivarla.
DETECTAR_ELIMINADAS = False

# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

def log(mensaje):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linea = f"[{ts}] {mensaje}"
    print(linea)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(linea + "\n")
    except Exception:
        pass  # en un runner el log en fichero es prescindible

def mover_fichero(ruta, destino):
    try:
        os.makedirs(destino, exist_ok=True)
        shutil.move(ruta, os.path.join(destino, os.path.basename(ruta)))
    except Exception as e:
        log(f"  ⚠️  No se pudo mover el fichero: {e}")

def normalizar_cabeceras(df):
    def limpiar(s):
        s = unicodedata.normalize("NFKC", str(s))
        s = s.replace("\xa0", " ")
        s = re.sub(r"\s+", " ", s)
        return s.strip()
    return df.rename(columns={c: limpiar(c) for c in df.columns})

def serializar(valor):
    """Convierte tipos Python a JSON serializable."""
    if valor is None:
        return None
    try:
        if pd.isna(valor):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return valor

def limpiar_codigo_ota(v):
    """Fuerza 'Código OTA' a texto siempre, aunque pandas lo haya leído
    como número (son códigos, no cantidades — un valor como '5922786725'
    no debe tratarse como int, podría perder ceros a la izquierda y además
    generaba falsos "modificado" al comparar str guardado vs int recién
    leído)."""
    if pd.isna(v):
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)

def normalizar_datos(df):
    for col in ["Fecha de creación", "Fecha caducidad", "Fecha de cancelación"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True)

    for col in ["Check in", "Check-out"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True).dt.date

    for col in ["Hora estimada de llegada", "Hora estimada de salida"]:
        if col in df.columns:
            df[col] = pd.to_datetime(
                df[col], format="%H:%M", errors="coerce"
            ).dt.strftime("%H:%M:%S")

    if "Código OTA" in df.columns:
        df["Código OTA"] = df["Código OTA"].apply(limpiar_codigo_ota)

    return df

def buscar_excel(directorio):
    for f in os.listdir(directorio):
        if f.endswith(".xlsx") and os.path.isfile(os.path.join(directorio, f)):
            return os.path.join(directorio, f)
    return None

# ============================================================
# CONTROL DE CAMBIOS
# ============================================================

def normalizar_fecha_texto(valor):
    """Trunca timestamps ISO a precisión de segundos, descartando los
    decimales — Postgres y Python los serializan con distinto número de
    dígitos (p.ej. '.01341' vs '.013410'), generando falsos "modificado"
    para el mismo instante exacto."""
    if isinstance(valor, str) and "T" in valor and len(valor) > 19:
        return valor[:19]
    return valor

def normalizar_numero(valor):
    """Normaliza floats que representan enteros (0.0 -> 0) y trunca
    timestamps ISO a precisión de segundos — para que el hash no dependa
    de diferencias de formato entre Excel/pandas y lo ya guardado en
    Supabase."""
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    if isinstance(valor, str):
        return normalizar_fecha_texto(valor)
    return valor

def calcular_hash(registro):
    """Hash estable, calculado SOLO sobre los campos de COLUMNAS_KB (excluyendo
    'ID'), normalizando números y fechas — ignora cualquier otra columna que
    pueda existir en la fila de Supabase (clave interna, timestamps de
    sistema, etc.) que no proceda del Excel."""
    limpio = {
        col: normalizar_numero(registro.get(col))
        for col in COLUMNAS_KB
        if col not in CAMPOS_EXCLUIDOS_HASH
    }
    cadena = json.dumps(limpio, sort_keys=True, default=str)
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest()

def obtener_existentes_por_numero(numeros):
    """Trae el estado actual (antes de esta importación) de las reservas
    cuyo Número está en la lista dada. Devuelve dict {Número: registro}."""
    existentes = {}
    numeros = [n for n in numeros if n]
    # Lotes pequeños: los "Número" de reserva llevan una barra ("11610/2026"),
    # que se codifica como %2F en la URL — con BATCH=100 la URL resultante es
    # muy larga (>3000 caracteres), lo que parece provocar errores SSL
    # intermitentes en algunas redes. Con lotes de 20 la URL es mucho más corta
    # y menos propensa a este problema.
    BATCH = 20
    for i in range(0, len(numeros), BATCH):
        lote = numeros[i:i+BATCH]
        valores = ",".join(str(n) for n in lote)
        resp = http.get(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers=HEADERS_PLAIN,
            params={"select": "*", "Número": f"in.({valores})"}
        )
        if resp.ok:
            for row in resp.json():
                existentes[row["Número"]] = row
    return existentes

def obtener_eliminadas_candidatas(registros_import):
    """Reservas que ya existían con Check-in dentro del rango de fechas
    cubierto por ESTA exportación concreta (inferido de las propias fechas
    de Check-in presentes en el fichero, no una ventana fija — el rango de
    fechas lo elige manualmente el usuario cada vez en Krossbooking), y que
    ya NO aparecen en la importación actual.

    DESACTIVADA por defecto (ver DETECTAR_ELIMINADAS) — se deja intacta
    para una posible reactivación futura."""
    fechas_checkin = [r["Check in"] for r in registros_import if r.get("Check in")]
    if not fechas_checkin:
        return []
    desde = min(fechas_checkin)
    hasta = max(fechas_checkin)
    resp = http.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=HEADERS_PLAIN,
        params={
            "select": "Número,Check in,Estado",
            "and": f"(\"Check in\".gte.{desde},\"Check in\".lte.{hasta})"
        }
    )
    if not resp.ok:
        log(f"  ⚠️  No se pudo consultar candidatas a eliminadas: {resp.text}")
        return []
    existentes_ventana = resp.json()
    numeros_import_set = {r["Número"] for r in registros_import}
    return [r["Número"] for r in existentes_ventana if r["Número"] not in numeros_import_set]

def diff_campos(anterior, nuevo):
    """Devuelve dict {campo: {antes, despues}} solo con los campos que cambian
    de verdad (con la misma normalización que el hash). Excluye 'ID' (no
    estable entre exportaciones, ver CAMPOS_EXCLUIDOS_HASH)."""
    cambios = {}
    for col in COLUMNAS_KB:
        if col == "ID":
            continue
        v_antes = normalizar_numero(anterior.get(col) if anterior else None)
        v_despues = normalizar_numero(nuevo.get(col))
        if v_antes != v_despues:
            cambios[col] = {"antes": v_antes, "despues": v_despues}
    return cambios

def determinar_motivo(campos_cambiados):
    """Aproximación pragmática, por prioridad (primera coincidencia gana),
    replicando el orden real de generar-limpiezas.ts salvo 'proxima_reserva'
    (requiere recalcular la reserva siguiente para todo el apartamento, no
    solo mirar la reserva que ha cambiado — no cubierto aquí a propósito).
    Solo 'cancelada' recibe tratamiento especial en la UI; el resto de
    motivos activan la misma alerta genérica, así que esta aproximación
    es suficiente salvo para el caso de cancelación."""
    if "Estado" in campos_cambiados:
        nuevo_estado = campos_cambiados["Estado"]["despues"]
        if nuevo_estado in ESTADOS_CANCELADAS:
            return "cancelada"
    if "Habitaciones" in campos_cambiados:
        return "apartamento"
    if "Check-out" in campos_cambiados:
        return "fechas"
    if "Huéspedes" in campos_cambiados:
        return "huespedes"
    if "Hora estimada de llegada" in campos_cambiados or "Hora estimada de salida" in campos_cambiados:
        return "horario"
    return None

def marcar_limpiezas_afectadas(numero_reserva, campos_cambiados):
    """Marca affected_by_kb_change=true en las limpiezas vinculadas a esta
    reserva, con un único motivo (mutuamente excluyente, por prioridad)."""
    motivo = determinar_motivo(campos_cambiados)
    if not motivo:
        return
    resp = http.patch(
        f"{SUPABASE_URL}/rest/v1/limpiezas",
        headers=HEADERS_PLAIN,
        params={
            "numero_reserva": f"eq.{numero_reserva}",
            "estado": "not.in.(anulada,finalizada)"
        },
        data=json.dumps({"affected_by_kb_change": True, "affected_reason": motivo})
    )
    if not resp.ok:
        log(f"  ⚠️  No se pudo marcar limpieza afectada para {numero_reserva}: {resp.text}")

def registrar_importacion(modo, fichero, total, nuevas, modificadas, sin_cambios, eliminadas, detalle_rows):
    resp = http.post(
        f"{SUPABASE_URL}/rest/v1/kb_importaciones",
        headers={**HEADERS_PLAIN, "Prefer": "return=representation"},
        data=json.dumps({
            "fichero": fichero,
            "modo": modo,
            "total_filas": total,
            "nuevas": nuevas,
            "modificadas": modificadas,
            "sin_cambios": sin_cambios,
            "eliminadas_candidatas": eliminadas,
            "estado": "ok",
        })
    )
    if not resp.ok:
        log(f"  ⚠️  No se pudo registrar la cabecera de importación: {resp.text}")
        return None
    id_importacion = resp.json()[0]["id"]

    if detalle_rows:
        for row in detalle_rows:
            row["id_importacion"] = id_importacion
        BATCH = 200
        for i in range(0, len(detalle_rows), BATCH):
            resp_d = http.post(
                f"{SUPABASE_URL}/rest/v1/kb_importaciones_detalle",
                headers=HEADERS_PLAIN,
                data=json.dumps(detalle_rows[i:i+BATCH])
            )
            if not resp_d.ok:
                log(f"  ⚠️  No se pudo registrar detalle de importación: {resp_d.text}")

    return id_importacion

# ============================================================
# SINCRONIZACIÓN GOOGLE CONTACTS (alta automática, solo huéspedes nuevos)
# ============================================================
#
# Planteamiento (ver claude/nota_feasibilitat_sync_google_contacts.md):
# - Se dispara solo para reservas NUEVAS (nunca actualiza un contacto que
#   ya existía por tener el mismo teléfono — así lo pidió Ramon).
# - Teléfono vacío -> se descarta, no hay nada que crear ni comparar.
# - Nombre del contacto: usamos "Referencia" en vez de "Pagador". La nota de
#   viabilidad original decía usar "Pagador tal cual", pero el trabajo
#   posterior sobre el histórico de clientes (claude/importacio_historic_kb_2026-09-01.md)
#   detectó que "Pagador" es quien gestiona el cobro (a menudo literalmente
#   "AirBnb") y que "Referencia" es el campo que de verdad lleva el nombre
#   del huésped en el 100% de las reservas. Si prefieres mantener "Pagador"
#   tal como decía la nota original, es cambiar una sola línea (ver
#   crear_registros_contactos_nuevos más abajo).
# - Solo se ejecuta en modo "diario" (no en "historico"): una importación
#   histórica puede traer miles de reservas nuevas de golpe y no tiene
#   sentido dar de alta miles de contactos a la vez. Se puede forzar a False
#   con SYNC_GOOGLE_CONTACTS o con --no-google-sync en cualquier ejecución.

def obtener_credenciales_google():
    """Carga el token guardado (y lo refresca si hace falta). Si no existe
    ningún token todavía, lanza el login interactivo en el navegador (solo
    hace falta la primera vez; requiere que exista GOOGLE_CLIENT_SECRET_PATH,
    la credencial OAuth de tipo "Escritorio" descargada de Google Cloud
    Console)."""
    creds = None
    if os.path.exists(GOOGLE_TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(GOOGLE_TOKEN_PATH, GOOGLE_CONTACTS_SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(GoogleAuthRequest())
        else:
            if not os.path.exists(GOOGLE_CLIENT_SECRET_PATH):
                raise FileNotFoundError(
                    f"No se encuentra {GOOGLE_CLIENT_SECRET_PATH}. Descárgalo desde "
                    f"Google Cloud Console (credencial OAuth tipo 'Escritorio') antes "
                    f"de activar la sincronización con Google Contacts."
                )
            flow = InstalledAppFlow.from_client_secrets_file(GOOGLE_CLIENT_SECRET_PATH, GOOGLE_CONTACTS_SCOPES)
            creds = flow.run_local_server(port=0)
        with open(GOOGLE_TOKEN_PATH, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return creds

def normalizar_telefono(valor):
    """Normaliza un teléfono a formato E.164 (+34...) para poder comparar
    números que llegan en formatos distintos. Devuelve None si está vacío,
    si no es un número válido, o si no se puede interpretar."""
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto or texto.lower() == "nan":
        return None
    try:
        numero = phonenumbers.parse(texto, GOOGLE_PHONE_REGION)
        if not phonenumbers.is_valid_number(numero):
            return None
        return phonenumbers.format_number(numero, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return None

def cargar_telefonos_existentes_google(service):
    """Descarga toda la libreta de contactos de Gmail (solo el campo
    phoneNumbers) y devuelve un set con todos los teléfonos ya normalizados
    a E.164, para poder comparar rápido sin llamar a la API por cada reserva."""
    telefonos = set()
    page_token = None
    while True:
        resp = service.people().connections().list(
            resourceName="people/me",
            pageSize=1000,
            personFields="phoneNumbers",
            pageToken=page_token,
        ).execute()
        for persona in resp.get("connections", []):
            for tel in persona.get("phoneNumbers", []):
                normalizado = normalizar_telefono(tel.get("value"))
                if normalizado:
                    telefonos.add(normalizado)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return telefonos

def formatear_rango_fechas(checkin_iso, checkout_iso):
    """Da formato corto al rango de fechas, igual que Ramon lo escribe a mano
    en Google Contacts (p.ej. "23-25/3/2026" cuando check-in y check-out caen
    en el mismo mes; "23/3-2/4/2026" si cambia el mes; con año también si
    cambia el año). Si falta alguna fecha, devuelve lo que haya tal cual."""
    if not checkin_iso or not checkout_iso:
        return (checkin_iso or checkout_iso or "")
    try:
        y1, m1, d1 = (int(p) for p in str(checkin_iso)[:10].split("-"))
        y2, m2, d2 = (int(p) for p in str(checkout_iso)[:10].split("-"))
    except (ValueError, AttributeError):
        return f"{checkin_iso}-{checkout_iso}"
    if y1 == y2 and m1 == m2:
        return f"{d1}-{d2}/{m1}/{y1}"
    elif y1 == y2:
        return f"{d1}/{m1}-{d2}/{m2}/{y1}"
    else:
        return f"{d1}/{m1}/{y1}-{d2}/{m2}/{y2}"

def construir_nombre_contacto(nombre, apartamento, checkin_iso, checkout_iso, ota):
    """Construye el nombre del contacto siguiendo el mismo patrón que Ramon
    usa a mano: "<Nombre> <Apartamento> <fechas> <OTA>" (p.ej. "Adrián Aspas
    RC31 23-25/3/2026 Booking"). Cualquier parte vacía se omite sin dejar
    huecos ni separadores de más."""
    partes = [
        nombre,
        apartamento,
        formatear_rango_fechas(checkin_iso, checkout_iso),
        ota,
    ]
    partes = [str(p).strip() for p in partes if p and str(p).strip()]
    return " ".join(partes) if partes else "Huésped sin nombre"

def crear_contacto_google(service, nombre_completo, telefono_e164):
    body = {
        "names": [{"givenName": nombre_completo}],
        "phoneNumbers": [{"value": telefono_e164, "type": "mobile"}],
    }
    service.people().createContact(body=body).execute()

def sincronizar_google_contacts(registros_nuevos):
    """Para cada reserva NUEVA con teléfono no vacío: si el teléfono ya está
    en la libreta de Gmail, no se toca nada; si no está, se crea el contacto.
    Nunca actualiza un contacto ya existente. Cualquier fallo aquí se
    registra en el log pero NUNCA interrumpe la importación de reservas
    (la sincronización de Supabase ya ha terminado cuando esto se ejecuta).

    Devuelve la lista de contactos creados en esta ejecución (numero_reserva,
    nombre_contacto, telefono), para que importar() pueda dejar constancia de
    ellos en kb_importaciones_detalle y así sean visibles en el histórico de
    importaciones de la app (tipo_cambio="contacto_creado")."""
    candidatos = [r for r in registros_nuevos if normalizar_telefono(r.get("Teléfono"))]
    if not candidatos:
        return []

    creados_info = []
    try:
        creds = obtener_credenciales_google()
        service = build("people", "v1", credentials=creds)
        existentes = cargar_telefonos_existentes_google(service)

        for r in candidatos:
            telefono = normalizar_telefono(r.get("Teléfono"))
            if telefono in existentes:
                continue
            nombre_completo = construir_nombre_contacto(
                nombre=r.get("Referencia") or r.get("Pagador"),
                apartamento=r.get("Habitaciones"),
                checkin_iso=r.get("Check in"),
                checkout_iso=r.get("Check-out"),
                ota=r.get("Portal"),
            )
            try:
                crear_contacto_google(service, nombre_completo, telefono)
                existentes.add(telefono)  # evita duplicados si dos reservas nuevas comparten teléfono
                creados_info.append({
                    "numero_reserva": r.get("Número"),
                    "nombre_contacto": nombre_completo,
                    "telefono": telefono,
                })
            except Exception as e:
                log(f"  ⚠️  No se pudo crear contacto Google para reserva {r.get('Número')} ({telefono}): {e}")

        log(f"Google Contacts: {len(creados_info)} contacto(s) nuevo(s) creado(s) de {len(candidatos)} candidato(s) con teléfono")
    except Exception as e:
        log(f"  ⚠️  Sincronización con Google Contacts omitida: {e}")

    return creados_info

def registrar_contactos_creados(id_importacion, contactos_creados):
    """Deja constancia en kb_importaciones_detalle de cada contacto de Google
    creado en esta importación (tipo_cambio="contacto_creado"), para que la
    pantalla "Importaciones" de la app los pueda mostrar junto al resto de
    cambios."""
    if not id_importacion or not contactos_creados:
        return
    filas = [{
        "id_importacion": id_importacion,
        "numero_reserva": c["numero_reserva"],
        "tipo_cambio": "contacto_creado",
        "campos_cambiados": {"nombre_contacto": c["nombre_contacto"], "telefono": c["telefono"]},
    } for c in contactos_creados]
    resp = http.post(
        f"{SUPABASE_URL}/rest/v1/kb_importaciones_detalle",
        headers=HEADERS_PLAIN,
        data=json.dumps(filas)
    )
    if not resp.ok:
        log(f"  ⚠️  No se pudo registrar el detalle de contactos creados: {resp.text}")

# ============================================================
# IMPORTACIÓN PRINCIPAL
# ============================================================

def importar(fichero, modo="diario", sync_google=True):
    """Devuelve True si el fichero se ha importado correctamente, False si ha
    sido rechazado. El código de salida del script depende de esto, para que
    un runner (GitHub Actions) pueda saber a qué carpeta mover el original."""
    nombre = os.path.basename(fichero)
    log(f"{'='*55}")
    log(f"Fichero detectado: {nombre} (modo: {modo})")

    try:
        df = pd.read_excel(fichero, engine="openpyxl", header=0)
        df = normalizar_cabeceras(df)

        columnas_faltantes = [c for c in COLUMNAS_KB if c not in df.columns]
        if columnas_faltantes:
            raise ValueError(f"Columnas no encontradas: {columnas_faltantes}")

        df = df[COLUMNAS_KB]
        df = normalizar_datos(df)

        total_filas = len(df)
        log(f"Filas leídas del Excel: {total_filas}")

        fecha_importacion = datetime.now().isoformat()
        registros = []
        for _, row in df.iterrows():
            registro = {col: serializar(row[col]) for col in COLUMNAS_KB}
            registro["fecha_ultima_importacion"] = fecha_importacion
            registros.append(registro)

        # --- Control de cambios: comparar contra el estado anterior ---
        numeros_import = [r["Número"] for r in registros]
        existentes = obtener_existentes_por_numero(numeros_import)
        # --- Proteger "Fecha de cancelación": es un hecho histórico que no
        # debería cambiar nunca una vez registrado. La protegemos de
        # sobreescrituras porque el Excel de Krossbooking, para algunas
        # reservas (probablemente canceladas automáticamente vía OTA/API),
        # trae esta fecha en formato ambiguo día/mes que dayfirst=True no
        # siempre interpreta bien (swap silencioso o NaT). Si ya existe un
        # valor en Supabase, lo conservamos tal cual y no lo recalculamos;
        # solo se captura la primera vez que la reserva se marca cancelada.
        for r in registros:
            anterior_r = existentes.get(r["Número"])
            if anterior_r and anterior_r.get("Fecha de cancelación"):
                r["Fecha de cancelación"] = anterior_r["Fecha de cancelación"]
        nuevas = modificadas = sin_cambios = 0
        detalle_rows = []
        registros_nuevos = []

        for r in registros:
            numero = r["Número"]
            anterior = existentes.get(numero)
            if anterior is None:
                nuevas += 1
                registros_nuevos.append(r)
                detalle_rows.append({
                    "numero_reserva": numero,
                    "tipo_cambio": "nuevo",
                    "campos_cambiados": None,
                })
            else:
                hash_antes = calcular_hash(anterior)
                hash_despues = calcular_hash(r)
                if hash_antes == hash_despues:
                    sin_cambios += 1
                else:
                    modificadas += 1
                    cambios = diff_campos(anterior, r)
                    detalle_rows.append({
                        "numero_reserva": numero,
                        "tipo_cambio": "modificado",
                        "campos_cambiados": cambios,
                    })
                    marcar_limpiezas_afectadas(numero, cambios)

        eliminadas_candidatas = []
        if modo == "diario" and DETECTAR_ELIMINADAS:
            eliminadas_candidatas = obtener_eliminadas_candidatas(registros)
            for numero in eliminadas_candidatas:
                detalle_rows.append({
                    "numero_reserva": numero,
                    "tipo_cambio": "eliminado_candidato",
                    "campos_cambiados": None,
                })

        log(f"Control de cambios: {nuevas} nuevas, {modificadas} modificadas, "
            f"{sin_cambios} sin cambios, {len(eliminadas_candidatas)} candidatas a eliminadas")

        # --- Enviar a Supabase via API REST (upsert) ---
        BATCH = 200
        afectados = 0
        for i in range(0, len(registros), BATCH):
            lote = registros[i:i+BATCH]
            resp = http.post(
                f"{SUPABASE_URL}/rest/v1/{TABLE}",
                headers=HEADERS,
                data=json.dumps(lote)
            )
            if resp.status_code not in (200, 201):
                raise Exception(f"API error {resp.status_code}: {resp.text}")
            afectados += len(lote)

        log(f"✅ Importación completada: {total_filas} registros procesados")
        log(f"   Filas enviadas a Supabase: {afectados}")

        # --- Registrar la importación y su detalle ---
        id_importacion = registrar_importacion(
            modo, nombre, total_filas, nuevas, modificadas, sin_cambios,
            len(eliminadas_candidatas), detalle_rows
        )

        # --- Sincronizar reservas_gestio ---
        resp_gestio = http.get(
            f"{SUPABASE_URL}/rest/v1/reservas_gestio",
            headers={**HEADERS, "Prefer": ""},
            params={"select": "Número"}
        )
        existentes_gestio = {r["Número"] for r in resp_gestio.json()} if resp_gestio.ok else set()

        nuevos_gestio = [
            {"Número": r["Número"]}
            for r in registros
            if r["Número"] not in existentes_gestio
        ]

        if nuevos_gestio:
            resp_new = http.post(
                f"{SUPABASE_URL}/rest/v1/reservas_gestio",
                headers={**HEADERS, "Prefer": "resolution=ignore-duplicates"},
                data=json.dumps(nuevos_gestio)
            )
            if resp_new.status_code in (200, 201):
                log(f"   Filas nuevas en reservas_gestio: {len(nuevos_gestio)}")

        # --- Alta automática en Google Contacts (solo huéspedes nuevos) ---
        if modo == "diario" and sync_google and SYNC_GOOGLE_CONTACTS and registros_nuevos:
            if GOOGLE_LIBS_DISPONIBLES:
                contactos_creados = sincronizar_google_contacts(registros_nuevos)
                if contactos_creados:
                    registrar_contactos_creados(id_importacion, contactos_creados)
            else:
                log("  ⚠️  Sincronización con Google Contacts omitida: librerías no instaladas")

        mover_fichero(fichero, PROCESADOS_DIR)
        log("📁 Fichero movido a: procesados")
        return True

    except Exception as e:
        log(f"❌ ERROR: {e}")
        mover_fichero(fichero, RECHAZADOS_DIR)
        log("📁 Fichero movido a: rechazados")
        return False

# ============================================================
# ENTRADA
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--modo", choices=["diario", "historico"], default="diario",
                         help="diario: revisa candidatas a eliminadas dentro del rango de fechas "
                              "cubierto por el propio fichero (si DETECTAR_ELIMINADAS=True). "
                              "historico: solo detecta nuevas/modificadas, sin comprobar eliminadas.")
    parser.add_argument("--no-google-sync", action="store_true",
                         help="Desactiva la alta automática en Google Contacts solo para esta ejecución.")
    args = parser.parse_args()

    print("=" * 55)
    print("  Importador Krossbooking → Supabase PostgreSQL")
    print(f"  Modo: {args.modo}")
    print(f"  Carpeta: {WATCH_DIR}")
    print("=" * 55)

    if not SUPABASE_KEY:
        print()
        print("❌ Falta la clave de Supabase.")
        print("   Defínela como variable de entorno SUPABASE_KEY, o ponla en un")
        print("   fichero .env junto a este script:  SUPABASE_KEY=...")
        sys.exit(2)

    fichero = None
    if os.path.isdir(WATCH_DIR):
        fichero = buscar_excel(WATCH_DIR)
    else:
        print(f"\n⚠️  La carpeta no existe: {WATCH_DIR}")

    if not fichero:
        print()
        print("⚠️  No se ha encontrado ningún fichero .xlsx en:")
        print(f"   {WATCH_DIR}")
        print()
        print("Descarga el Excel de Krossbooking, déjalo en esa")
        print("carpeta y vuelve a ejecutar este script.")
        codigo_salida = 3
    else:
        ok = importar(fichero, modo=args.modo, sync_google=not args.no_google_sync)
        codigo_salida = 0 if ok else 1

    # Solo esperar una tecla cuando se ejecuta de forma interactiva (doble clic
    # / terminal). En un runner desatendido no hay nadie para pulsar ENTER y el
    # proceso se quedaría colgado para siempre.
    if sys.stdin is not None and sys.stdin.isatty():
        print()
        input("Pulsa ENTER para cerrar...")

    sys.exit(codigo_salida)
