// Instagram: publica el Reel aprobado. Hay dos caminos y el motor elige solo según el token del .env:
//  - "facebook" (el de las apps nuevas de Meta): API de Instagram con inicio de sesión de Facebook (graph.facebook.com),
//    con el token de la página de Facebook vinculada a la cuenta, que no vence. El video se sube directo
//    a Meta (subida reanudable en rupload.facebook.com): no hace falta WordPress.
//  - "instagram" (apps viejas): API con inicio de sesión de Instagram (graph.instagram.com). Pide una URL
//    pública del video: se sube un momento a WordPress y después se borra. El token dura 60 días y se
//    renueva los lunes.
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG, RUTAS } from "./config.mjs";
import { escribirJson, esperar, leerJson, log, traer } from "./util.mjs";

const TOKEN_GUARDADO = path.join(RUTAS.datos, "instagram-token.json");
// Pausa entre consultas a Meta mientras procesa el video (las pruebas la achican).
const ESPERA_MS = Number(process.env.IG_ESPERA_MS || 10000);
const porFacebook = () => CONFIG.instagram.via === "facebook";

export function instagramConfigurado() {
  return Boolean(CONFIG.instagram.userId && CONFIG.instagram.token);
}

export function wordpressConfigurado() {
  return Boolean(CONFIG.wordpress.url && CONFIG.wordpress.usuario && CONFIG.wordpress.clave);
}

/** Cómo publica: "facebook" (subida directa a Meta) o "instagram" (con WordPress). */
export function caminoInstagram() {
  return CONFIG.instagram.via;
}

async function tokenActual() {
  // El token renovado en datos/ es solo del camino de Instagram; el de la página de Facebook no se renueva.
  if (porFacebook()) return CONFIG.instagram.token;
  const guardado = await leerJson(TOKEN_GUARDADO, null);
  return guardado?.access_token || CONFIG.instagram.token;
}

function errorDeMeta(ruta, estado, e = {}) {
  if (e.code === 190) {
    return new Error(
      `el permiso de Instagram se venció o se revocó (${e.message || "token inválido"}). Hay que volver a conectarlo con npm run ig-conectar (pedíselo a Claude)`,
    );
  }
  const detalle = e.error_user_msg ? ` (${e.error_user_msg})` : "";
  return new Error(`Instagram ${ruta}: ${e.message || estado}${detalle}`);
}

async function ig(metodo, ruta, parametros = {}) {
  const token = await tokenActual();
  const url = new URL(`${CONFIG.instagram.base}/${CONFIG.instagram.version}${ruta}`);
  const opciones = { method: metodo };
  if (metodo === "GET") {
    for (const [k, v] of Object.entries({ ...parametros, access_token: token })) url.searchParams.set(k, v);
  } else {
    opciones.headers = { "content-type": "application/x-www-form-urlencoded" };
    opciones.body = new URLSearchParams({ ...parametros, access_token: token }).toString();
  }
  const r = await traer(url.href, opciones, 120000);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || datos.error) throw errorDeMeta(ruta, r.status, datos.error);
  return datos;
}

// ---------- WordPress (solo camino "instagram", o de respaldo) ----------
function autorizacionWp() {
  const { usuario, clave } = CONFIG.wordpress;
  return "Basic " + Buffer.from(`${usuario}:${clave}`).toString("base64");
}

export async function subirAWordpress(ruta) {
  const buf = await fs.readFile(ruta);
  const nombre = path.basename(ruta);
  const r = await traer(
    `${CONFIG.wordpress.url}/wp-json/wp/v2/media`,
    {
      method: "POST",
      headers: {
        Authorization: autorizacionWp(),
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${nombre}"`,
      },
      body: buf,
    },
    300000,
  );
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.source_url) {
    throw new Error(`WordPress no aceptó el video (${r.status}): ${datos.message || "sin detalle"}`);
  }
  return { id: datos.id, url: datos.source_url };
}

export async function borrarDeWordpress(id) {
  await traer(
    `${CONFIG.wordpress.url}/wp-json/wp/v2/media/${id}?force=true`,
    { method: "DELETE", headers: { Authorization: autorizacionWp() } },
    60000,
  );
}

// ---------- Contenedores ----------
// conIa: el video lleva voz hecha con IA → marca oficial "Información de IA" (is_ai_generated, desde junio de 2026).
function datosDelReel(caption, conIa = false) {
  const d = { media_type: "REELS", caption: caption.slice(0, 2200), share_to_feed: "true" };
  if (conIa) d.is_ai_generated = "true";
  return d;
}

const rechazoLaMarcaIa = (e) => /is_ai_generated/i.test(String(e?.message || ""));

/** Camino "facebook": crea el contenedor y sube el archivo directo a Meta. Devuelve el id del contenedor. */
async function contenedorConSubidaDirecta({ ruta, caption, conIa = false }) {
  const buf = await fs.readFile(ruta);
  const contenedor = await ig("POST", `/${CONFIG.instagram.userId}/media`, { ...datosDelReel(caption, conIa), upload_type: "resumable" });
  if (!contenedor.id) throw new Error("Meta no devolvió el contenedor para subir el video");
  const destino = contenedor.uri || `${CONFIG.instagram.rupload}/ig-api-upload/${CONFIG.instagram.version}/${contenedor.id}`;
  const r = await traer(
    destino,
    {
      method: "POST",
      headers: { Authorization: `OAuth ${await tokenActual()}`, offset: "0", file_size: String(buf.length) },
      body: buf,
    },
    300000,
  );
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || datos.success === false || datos.error || datos.debug_info) {
    const motivo = datos.debug_info?.message || datos.error?.message || datos.message || `respuesta ${r.status}`;
    throw new Error(`Meta no aceptó el video: ${motivo}`);
  }
  log(`Video subido directo a Meta (${(buf.length / 1048576).toFixed(1)} MB)`);
  return contenedor.id;
}

/** Camino "instagram" (o respaldo): Meta baja el video desde una URL pública de WordPress. */
async function contenedorConUrl({ caption, conIa = false }, url) {
  const contenedor = await ig("POST", `/${CONFIG.instagram.userId}/media`, { ...datosDelReel(caption, conIa), video_url: url });
  return contenedor.id;
}

async function esperarProcesado(contenedorId) {
  for (let i = 0; i < 60; i++) {
    await esperar(ESPERA_MS);
    const s = await ig("GET", `/${contenedorId}`, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`Instagram no pudo procesar el video: ${s.status || s.status_code}`);
    }
  }
  throw new Error("Instagram tardó más de 10 minutos en procesar el video");
}

async function publicarContenedor(contenedorId) {
  await esperarProcesado(contenedorId);
  const publicado = await ig("POST", `/${CONFIG.instagram.userId}/media_publish`, { creation_id: contenedorId });
  // permalink: el link del posteo. media_url: el archivo del video en Meta (TikTok lo toma de ahí, por Buffer).
  let permalink = "";
  let mediaUrl = "";
  for (let i = 0; i < 3 && !(permalink && mediaUrl); i++) {
    if (i) await esperar(ESPERA_MS);
    try {
      const d = await ig("GET", `/${publicado.id}`, { fields: "permalink,media_url" });
      permalink = d.permalink || permalink;
      mediaUrl = d.media_url || mediaUrl;
    } catch {}
  }
  return { ok: true, mediaId: publicado.id, permalink, mediaUrl };
}

async function publicarConWordpress({ ruta, caption, conIa = false }) {
  const medio = await subirAWordpress(ruta);
  log(`Video subido a WordPress para Instagram: ${medio.url}`);
  try {
    let contenedorId;
    let sinMarcaIa = false;
    try {
      contenedorId = await contenedorConUrl({ caption, conIa }, medio.url);
    } catch (e) {
      if (!conIa || !rechazoLaMarcaIa(e)) throw e;
      log(`Instagram no aceptó la marca de IA (${e.message}); publico sin la marca.`);
      sinMarcaIa = true;
      contenedorId = await contenedorConUrl({ caption }, medio.url);
    }
    return { ...(await publicarContenedor(contenedorId)), sinMarcaIa };
  } finally {
    if (CONFIG.wordpress.borrarDespues) {
      await borrarDeWordpress(medio.id).catch((e) => log(`No pude borrar el video de WordPress: ${e.message}`));
    }
  }
}

/** Publica un Reel. Devuelve { ok, permalink, mediaId } o { ok:false, omitido, motivo }. */
export async function publicarReel({ ruta, caption, conIa = false }) {
  if (!instagramConfigurado()) return { ok: false, omitido: true, motivo: "Instagram no está configurado en el .env" };
  if (porFacebook()) {
    let contenedorId;
    let sinMarcaIa = false;
    try {
      try {
        contenedorId = await contenedorConSubidaDirecta({ ruta, caption, conIa });
      } catch (e) {
        if (!conIa || !rechazoLaMarcaIa(e)) throw e;
        log(`Instagram no aceptó la marca de IA (${e.message}); publico sin la marca.`);
        sinMarcaIa = true;
        contenedorId = await contenedorConSubidaDirecta({ ruta, caption });
      }
    } catch (e) {
      // Si la subida directa falla y hay WordPress, se prueba con la URL pública.
      if (!wordpressConfigurado() || /se venció o se revocó/.test(e.message)) throw e;
      log(`Falló la subida directa (${e.message}); pruebo con WordPress`);
      return publicarConWordpress({ ruta, caption, conIa: conIa && !sinMarcaIa });
    }
    return { ...(await publicarContenedor(contenedorId)), sinMarcaIa };
  }
  if (!wordpressConfigurado()) return { ok: false, omitido: true, motivo: "Falta la clave de aplicación de WordPress en el .env" };
  return publicarConWordpress({ ruta, caption, conIa });
}

/**
 * Sube el video y espera que Meta lo procese, sin publicarlo (el contenedor se descarta solo en 24 h).
 * Camino "facebook": subida directa. Camino "instagram": por WordPress (si está configurado).
 */
export async function probarSubida({ ruta, conIa = false }) {
  if (!instagramConfigurado()) throw new Error("Instagram no está configurado en el .env");
  const caption = "Prueba de subida (no se publica)";
  if (porFacebook()) {
    const contenedor = await contenedorConSubidaDirecta({ ruta, caption, conIa });
    await esperarProcesado(contenedor);
    return { contenedor };
  }
  if (!wordpressConfigurado()) throw new Error("Falta la clave de aplicación de WordPress en el .env");
  const medio = await subirAWordpress(ruta);
  try {
    const contenedor = await contenedorConUrl({ caption, conIa }, medio.url);
    await esperarProcesado(contenedor);
    return { contenedor };
  } finally {
    if (CONFIG.wordpress.borrarDespues) await borrarDeWordpress(medio.id).catch(() => {});
  }
}

/**
 * Los lunes. Camino "instagram": renueva el token largo (dura 60 días).
 * Camino "facebook": el token de la página no vence; solo revisa que la conexión siga andando.
 */
export async function renovarToken() {
  if (!instagramConfigurado()) return { ok: false, omitido: true, motivo: "Instagram no está configurado" };
  if (porFacebook()) {
    const yo = await probarInstagram();
    return { ok: true, omitido: true, motivo: `Instagram sigue conectado (@${yo.username}); el token de la página no vence` };
  }
  const token = await tokenActual();
  const url = new URL(`${CONFIG.instagram.base}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const r = await traer(url.href, {}, 60000);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.access_token) throw new Error(`No pude renovar el token de Instagram: ${datos.error?.message || r.status}`);
  const vence = new Date(Date.now() + Number(datos.expires_in || 0) * 1000).toISOString().slice(0, 10);
  await escribirJson(TOKEN_GUARDADO, { access_token: datos.access_token, renovado: new Date().toISOString(), vence });
  return { ok: true, vence };
}

/** Datos de la cuenta conectada: { user_id, username }. */
export async function probarInstagram() {
  if (porFacebook()) {
    const d = await ig("GET", `/${CONFIG.instagram.userId}`, { fields: "id,username" });
    return { user_id: d.id, username: d.username };
  }
  return ig("GET", "/me", { fields: "user_id,username" });
}

/** Último video publicado en la cuenta, con su archivo público: { id, mediaUrl, permalink } o null. */
export async function ultimoVideo() {
  const d = await ig("GET", `/${CONFIG.instagram.userId}/media`, { fields: "id,media_type,media_url,permalink", limit: "15" });
  const v = (d.data || []).find((m) => m.media_type === "VIDEO" && m.media_url);
  return v ? { id: v.id, mediaUrl: v.media_url, permalink: v.permalink } : null;
}

/** Cupo de publicaciones por API (100 cada 24 h). Solo camino "facebook". */
export async function cupoInstagram() {
  const d = await ig("GET", `/${CONFIG.instagram.userId}/content_publishing_limit`, { fields: "config,quota_usage" });
  const x = d.data?.[0] || {};
  return { usado: Number(x.quota_usage || 0), total: Number(x.config?.quota_total || 100) };
}
