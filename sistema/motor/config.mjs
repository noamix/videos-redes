// Configuración del motor.
//  · .env (permisos 600): las claves y los ajustes técnicos. Después de cambiarlo, reiniciar el motor.
//  · config/negocio.json: los datos del negocio (marca, web, hora, estilo, colores, WhatsApp, pausa…).
//    Se vuelve a leer solo cuando cambia: no hace falta reiniciar el motor.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Redes sin IPv6: cuando un servidor tiene IPv4 e IPv6, Node le da solo 250 ms a cada intento de conexión. Si el
// primero tarda un poco más (pasó con Telegram), corta, prueba el otro y falla con ETIMEDOUT. Con 1 s anda. Va acá
// para que lo tengan también los comandos sueltos (chequeo, prueba, ig-probar), no solo el servicio.
try {
  net.setDefaultAutoSelectFamilyAttemptTimeout(1000);
} catch {
  // Node muy viejo: no tiene esta opción
}

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function leerEnv(archivo) {
  const salida = {};
  if (!fs.existsSync(archivo)) return salida;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 1) continue;
    const clave = l.slice(0, i).trim();
    let valor = l.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    salida[clave] = valor;
  }
  return salida;
}

const archivoEnv = process.env.VIDEOS_ENV || path.join(RAIZ, ".env");
const env = { ...leerEnv(archivoEnv), ...process.env };
const v = (clave, porDefecto = "") => {
  const x = env[clave];
  return x === undefined || x === null || String(x).trim() === "" ? porDefecto : String(x).trim();
};
const si = (clave, porDefecto) => {
  const x = v(clave, porDefecto ? "si" : "no").toLowerCase();
  return ["si", "sí", "s", "true", "1", "yes"].includes(x);
};

function leerJson(archivo, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch {
    return porDefecto;
  }
}

// Instagram: si no se aclara IG_API_BASE, un token de Facebook (EAA…) va por graph.facebook.com.
const igBase = v("IG_API_BASE", v("IG_TOKEN").startsWith("EAA") ? "https://graph.facebook.com" : "https://graph.instagram.com").replace(/\/+$/, "");

// Estilos del video: cada uno es una plantilla de HyperFrames. "amarillo" es el nombre viejo de "cajas".
export const ESTILOS = { cajas: "plantilla-cajas", amarillo: "plantilla-cajas", clasico: "plantilla" };
export const ARCHIVO_NEGOCIO = process.env.VIDEOS_NEGOCIO || path.join(RAIZ, "config", "negocio.json");

export const RUTAS = {
  raiz: RAIZ,
  plantilla: path.join(RAIZ, ESTILOS.cajas),
  salida: v("CARPETA_SALIDA", path.join(RAIZ, "salida")),
  trabajos: v("CARPETA_TRABAJOS", path.join(RAIZ, "trabajos")),
  datos: v("CARPETA_DATOS", path.join(RAIZ, "datos")),
  cache: path.join(v("CARPETA_DATOS", path.join(RAIZ, "datos")), "cache"),
  musica: path.join(RAIZ, "musica"),
  fotos: path.join(RAIZ, "fotos"),
  prompts: path.join(RAIZ, "prompts"),
  lineas: path.join(RAIZ, "config", "lineas.json"),
  plantillasTextos: path.join(RAIZ, "config", "textos-plantillas.json"),
  hyperframes: path.join(RAIZ, "node_modules", "hyperframes", "bin", "hyperframes.mjs"),
  gsap: path.join(RAIZ, "node_modules", "gsap", "dist", "gsap.min.js"),
};

export const CONFIG = {
  archivoEnv,
  archivoNegocio: ARCHIVO_NEGOCIO,
  puerto: Number(v("MOTOR_PUERTO", "8099")),
  host: v("MOTOR_HOST", "127.0.0.1"),
  clave: v("MOTOR_CLAVE"),
  diasGuardar: Number(v("DIAS_GUARDAR", "60")),
  // Los datos del negocio los completa aplicarNegocio() con config/negocio.json.
  estilo: "cajas",
  marca: "",
  web: "",
  webUrl: "",
  queVende: "",
  publico: "",
  whatsapp: "",
  logo: "",
  colores: { principal: "", oscuro: "" },
  zona: "America/Argentina/Buenos_Aires",
  horaPublicacion: "19:00",
  diasAdelante: 7,
  maxPorCorrida: 2,
  rotacion: [],
  reglasTextos: "",
  palabrasProhibidas: [],
  productoPrueba: null,
  pausado: false,
  errorNegocio: "",
  // Quién escribe los textos: auto (Gemini si hay clave; si no, plantillas) | gemini | claude | plantillas
  textos: {
    modo: v("TEXTOS_MODO", "auto").toLowerCase(),
  },
  gemini: {
    key: v("GEMINI_API_KEY"),
    modelo: v("GEMINI_MODELO", "gemini-3.5-flash"),
    base: v("GEMINI_API_BASE", "https://generativelanguage.googleapis.com").replace(/\/+$/, ""),
  },
  // Opcional y pago: el sistema no lo usa salvo que se cargue ANTHROPIC_API_KEY.
  claude: {
    key: v("ANTHROPIC_API_KEY"),
    modelo: v("CLAUDE_MODELO", "claude-sonnet-5-5"),
    base: v("ANTHROPIC_API_BASE", "https://api.anthropic.com"),
  },
  telegram: {
    token: v("TELEGRAM_BOT_TOKEN"),
    chat: v("TELEGRAM_CHAT_ID"),
    base: v("TELEGRAM_API_BASE", "https://api.telegram.org"),
    // Horas en que los mensajes llegan sin sonido ("23-7" = de 23:00 a 7:59). Vacío = siempre con sonido.
    silencio: v("TELEGRAM_SILENCIO", "23-7"),
  },
  // Voz en off (sistema/voz: VoxCPM2 completa o liviana). Los valores de memoria y horario los deja el instalador
  // de la voz según la máquina (npm run voz-instalar). Ver README, "Voz en off".
  voz: {
    // auto = con voz si VOZ_COMANDO está cargado · no = videos sin voz
    modo: v("VOZ_MODO", "auto").toLowerCase(),
    comando: v("VOZ_COMANDO"),
    nombre: v("VOZ_NOMBRE", "mi-voz"),
    // Memoria disponible que hace falta antes de llamar al comando (liviana: unos 5 GB; completa en procesador: 11).
    memoriaMinMb: Number(v("VOZ_MEMORIA_MIN_MB", "5000")),
    // Tope de memoria del comando (systemd-run): si se pasa, el sistema corta solo la voz, nunca n8n ni el motor.
    tope: v("VOZ_TOPE_MEMORIA", "6G"),
    topeSwap: v("VOZ_TOPE_SWAP", "1G"),
    // Horas en que se arma la voz ("1-6" = de 1:00 a 6:59). Vacío = a cualquier hora. Fuera del horario solo se
    // generan los videos urgentes; el resto espera.
    horario: v("VOZ_HORARIO", ""),
    // Dentro del horario, si falta memoria y la compu está sin usar, el motor cierra el navegador en forma ordenada.
    cerrarChrome: si("VOZ_CERRAR_CHROME", false),
    inactivoMin: Number(v("VOZ_INACTIVO_MIN", "30")),
    // Tope de tiempo del comando de voz. Con 12 min, el video entero entra en los 30 min que n8n le espera al motor.
    timeoutMin: Number(v("VOZ_TIMEOUT_MIN", "12")),
    // Urgente = el video es para hoy (o para dentro de estos días): sale aunque no haya memoria para la voz.
    urgenteDias: Number(v("VOZ_URGENTE_DIAS", "0")),
    aviso: v("VOZ_AVISO", "Voz generada con IA"),
    // Si una frase no entra en su pantalla, se acelera hasta este punto (1.2 = 20 % más rápido).
    tempoMax: Number(v("VOZ_TEMPO_MAX", "1.2")),
  },
  n8nWebhook: v("N8N_WEBHOOK_RESPUESTAS", "http://127.0.0.1:5678/webhook/videos-redes-respuesta"),
  // Solo para armar el flujo de n8n (npm run n8n)
  n8n: {
    planillaId: v("PLANILLA_ID"),
    motorUrl: v("MOTOR_URL_PARA_N8N"),
    credId: v("N8N_GOOGLE_CRED_ID"),
    credNombre: v("N8N_GOOGLE_CRED_NOMBRE", "Google Sheets account"),
    // Solo para npm run n8n -- --importar: clave de la API de n8n (se crea para la tarea y se revoca al terminar).
    apiKey: v("N8N_API_KEY"),
  },
  // Instagram tiene dos caminos y el motor elige solo según el token:
  //  - "facebook" (token EAA…, el de las apps nuevas de Meta): graph.facebook.com con el token de la página
  //    vinculada. El video se sube directo a Meta, sin WordPress.
  //  - "instagram" (token IG…, apps viejas): graph.instagram.com; necesita WordPress para la URL pública.
  instagram: {
    userId: v("IG_USER_ID"),
    token: v("IG_TOKEN"),
    version: v("IG_API_VERSION", "v25.0"),
    base: igBase,
    via: v("IG_VIA", /graph\.facebook\.com/i.test(igBase) ? "facebook" : "instagram").toLowerCase() === "facebook" ? "facebook" : "instagram",
    rupload: v("IG_RUPLOAD_BASE", "https://rupload.facebook.com").replace(/\/+$/, ""),
    cuenta: v("IG_CUENTA").replace(/^@/, ""),
  },
  // TikTok y YouTube Shorts por Buffer (plan gratis): publican el mismo video que salió en Instagram.
  buffer: {
    clave: v("BUFFER_API_KEY"),
    url: v("BUFFER_API_URL", "https://api.buffer.com").replace(/\/+$/, ""),
    // Redes a usar (por defecto, todas las conectadas en Buffer): "tiktok,youtube"
    redes: v("BUFFER_REDES").toLowerCase().split(/[\s,]+/).filter(Boolean),
    // id o nombre de la cuenta en Buffer, si hubiera más de una de la misma red
    canales: { tiktok: v("BUFFER_TIKTOK"), youtube: v("BUFFER_YOUTUBE") },
    categoriaYoutube: v("BUFFER_YOUTUBE_CATEGORIA", "22"), // 22 = Gente y blogs
  },
  wordpress: {
    url: v("WP_URL").replace(/\/+$/, ""),
    usuario: v("WP_USUARIO"),
    clave: v("WP_CLAVE_APLICACION"),
    borrarDespues: si("WP_BORRAR_DESPUES", true),
  },
  render: {
    calidad: v("RENDER_CALIDAD", "looks"),
    navegador: v("HYPERFRAMES_BROWSER_PATH"),
    timeoutMin: Number(v("RENDER_TIMEOUT_MIN", "12")),
  },
};

// ---------- Datos del negocio (config/negocio.json) ----------

const texto = (x) => (x === undefined || x === null ? "" : String(x).trim());
const lista = (x) =>
  (Array.isArray(x) ? x : String(x ?? "").split(","))
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
const esSi = (x) => x === true || ["si", "sí", "s", "true", "1", "yes"].includes(texto(x).toLowerCase());
const hora = (h) => {
  const m = texto(h).match(/^(\d{1,2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2] || "00"}` : "19:00";
};
const color = (x) => (/^#[0-9a-f]{3,8}$/i.test(texto(x)) ? texto(x) : "");

// "https://www.mitienda.com.ar/tienda/" → "mitienda.com.ar"
export function webParaMostrar(url) {
  const t = texto(url);
  if (!t) return "";
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).hostname.replace(/^www\./i, "");
  } catch {
    return t.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
  }
}

function leerNegocio() {
  if (!fs.existsSync(ARCHIVO_NEGOCIO)) return { datos: {}, error: "" };
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO_NEGOCIO, "utf8"));
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return { datos: {}, error: "no es un objeto JSON" };
    return { datos, error: "" };
  } catch (e) {
    return { datos: {}, error: e.message };
  }
}

function aplicarNegocio() {
  const { datos: n, error } = leerNegocio();
  // Cada dato sale de negocio.json; si no está, del .env (nombres de las versiones anteriores); si no, el valor por defecto.
  const de = (clave, varEnv, porDefecto = "") => (texto(n[clave]) !== "" ? n[clave] : v(varEnv, porDefecto));
  const estilo = texto(de("estilo", "ESTILO_VIDEO", "cajas")).toLowerCase();
  CONFIG.estilo = ESTILOS[estilo] ? (estilo === "amarillo" ? "cajas" : estilo) : "cajas";
  RUTAS.plantilla = path.join(RAIZ, ESTILOS[CONFIG.estilo]);
  CONFIG.marca = texto(de("nombre", "MARCA"));
  CONFIG.webUrl = texto(de("web", "WEB_URL"));
  CONFIG.web = texto(n.web_texto) || v("WEB_TEXTO") || webParaMostrar(CONFIG.webUrl);
  CONFIG.queVende = texto(n.que_vende);
  CONFIG.publico = texto(n.publico);
  CONFIG.whatsapp = texto(de("whatsapp", "WHATSAPP"));
  CONFIG.logo = texto(de("logo", "LOGO_ARCHIVO"));
  CONFIG.colores = { principal: color(n.colores?.principal), oscuro: color(n.colores?.oscuro) };
  CONFIG.zona = texto(de("zona_horaria", "ZONA_HORARIA", "America/Argentina/Buenos_Aires"));
  CONFIG.horaPublicacion = hora(de("hora_publicacion", "HORA_PUBLICACION", "19:00"));
  CONFIG.diasAdelante = Math.max(0, Number(de("dias_adelante", "DIAS_ADELANTE", "7")) || 0);
  CONFIG.maxPorCorrida = Math.max(0, Number(de("max_por_corrida", "MAX_POR_CORRIDA", "2")) || 0);
  CONFIG.rotacion = lista(n.rotacion ?? v("ROTACION"));
  CONFIG.reglasTextos = texto(n.reglas_textos);
  CONFIG.palabrasProhibidas = lista(n.palabras_prohibidas);
  CONFIG.productoPrueba = n.producto_prueba && typeof n.producto_prueba === "object" ? n.producto_prueba : null;
  CONFIG.pausado = esSi(n.pausado);
  CONFIG.instagram.cuenta = (v("IG_CUENTA") || texto(n.cuentas?.instagram)).replace(/^@/, "");
  CONFIG.errorNegocio = error;
}

let fechaNegocio = null;

/** Vuelve a leer config/negocio.json si cambió. Devuelve true si lo leyó. */
export function refrescarNegocio() {
  let fecha = 0;
  try {
    fecha = fs.statSync(ARCHIVO_NEGOCIO).mtimeMs;
  } catch {}
  if (fecha === fechaNegocio) return false;
  fechaNegocio = fecha;
  aplicarNegocio();
  return true;
}
refrescarNegocio();

export function lineas() {
  return leerJson(RUTAS.lineas, {});
}

export function datosDeLinea(clave) {
  const todas = lineas();
  return todas[clave] || todas.default || {};
}

export const VERSION = leerJson(path.join(RAIZ, "package.json"), {}).version || "0.0.0";
