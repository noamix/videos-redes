// TikTok y YouTube Shorts por Buffer (plan gratis). Cuando el video sale en Instagram, el motor se lo
// pasa a Buffer, y Buffer lo publica en cada red conectada (TikTok y/o YouTube) con sus apps aprobadas.
// Buffer no acepta subir archivos: pide un link público, así que se usa el del video que acaba de publicar
// Instagram (o WordPress, si está cargado, de respaldo). Después, cada vez que n8n llama a
// /publicar-pendientes, se revisa si cada red ya lo publicó y se avisa por Telegram con el link.
import path from "node:path";
import { CONFIG, RUTAS } from "./config.mjs";
import { borrarDeWordpress, subirAWordpress, wordpressConfigurado } from "./instagram.mjs";
import { enviarTexto } from "./telegram.mjs";
import { escribirJson, leerJson, log, traer } from "./util.mjs";

const PENDIENTES = path.join(RUTAS.datos, "buffer-pendientes.json");
const REDES = {
  tiktok: { nombre: "TikTok", icono: "🎵", maxHashtags: 5, maxTexto: 2200 },
  // YouTube se usa solo si BUFFER_YOUTUBE dice qué canal: es fácil conectar por error el canal personal.
  youtube: { nombre: "YouTube", icono: "▶️", maxHashtags: 15, maxTexto: 4900, pedirEleccion: true },
};
let canalesGuardados = null;

export function bufferConfigurado() {
  return Boolean(CONFIG.buffer.clave);
}

async function buffer(query, variables = {}) {
  const r = await traer(
    CONFIG.buffer.url,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CONFIG.buffer.clave}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    120000,
  );
  if (r.status === 429) throw new Error("Buffer: demasiados pedidos seguidos, se reintenta en la próxima vuelta");
  const d = await r.json().catch(() => ({}));
  if (d.errors?.length) {
    const e = d.errors[0];
    const codigo = e.extensions?.code;
    if (codigo === "UNAUTHORIZED") throw new Error("Buffer rechazó la clave de API (BUFFER_API_KEY). Creá otra en publish.buffer.com/settings/api y cargala con npm run cargar-clave -- BUFFER_API_KEY");
    throw new Error(`Buffer: ${e.message}${codigo ? ` (${codigo})` : ""}`);
  }
  if (!r.ok || !d.data) throw new Error(`Buffer respondió ${r.status}`);
  return d.data;
}

const normal = (s) => String(s || "").replace(/^@/, "").trim().toLowerCase();

/**
 * Las redes conectadas en Buffer que usa el sistema: { tiktok: {id,nombre,pausado,cantidad} | null, youtube: … | null }.
 * BUFFER_TIKTOK / BUFFER_YOUTUBE eligen la cuenta si hay más de una; BUFFER_REDES limita las redes (por defecto, todas).
 */
export async function canalesBuffer() {
  if (canalesGuardados) return canalesGuardados;
  const { account } = await buffer("query { account { organizations { id name } } }");
  const todos = [];
  for (const org of account?.organizations || []) {
    const d = await buffer(
      `query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name displayName service isQueuePaused } }`,
    );
    todos.push(...(d.channels || []));
  }
  const elegidas = CONFIG.buffer.redes.length ? CONFIG.buffer.redes : Object.keys(REDES);
  const salida = { avisos: [] };
  for (const red of Object.keys(REDES)) {
    salida[red] = null;
    if (!elegidas.includes(red)) continue;
    const deLaRed = todos.filter((c) => normal(c.service) === red);
    if (!deLaRed.length) continue;
    const buscado = normal(CONFIG.buffer.canales[red]);
    if (!buscado && REDES[red].pedirEleccion) {
      salida.avisos.push(
        `${REDES[red].nombre} está conectado en Buffer (${deLaRed.map((x) => x.displayName || x.name).join(", ")}), pero no se usa hasta que cargues el nombre del canal: npm run cargar-clave -- BUFFER_${red.toUpperCase()} --valor "<nombre del canal>".`,
      );
      continue;
    }
    if (!buscado && deLaRed.length > 1) {
      // Con varias cuentas de la misma red no se adivina: podría publicar en la equivocada.
      salida.avisos.push(
        `Hay ${deLaRed.length} cuentas de ${REDES[red].nombre} en Buffer (${deLaRed.map((x) => x.displayName || x.name).join(", ")}): elegí una con npm run cargar-clave -- BUFFER_${red.toUpperCase()} --valor "<nombre>". Mientras tanto, ${REDES[red].nombre} no se usa.`,
      );
      continue;
    }
    const c = buscado ? deLaRed.find((x) => [x.id, x.name, x.displayName].some((v) => normal(v) === buscado)) : deLaRed[0];
    if (!c) {
      throw new Error(
        `No encuentro la cuenta de ${REDES[red].nombre} "${CONFIG.buffer.canales[red]}" en Buffer. Hay: ${deLaRed.map((x) => x.displayName || x.name).join(", ")}`,
      );
    }
    salida[red] = { id: c.id, nombre: c.displayName || c.name, pausado: Boolean(c.isQueuePaused), cantidad: deLaRed.length };
  }
  if (!salida.tiktok && !salida.youtube) {
    throw new Error(salida.avisos[0] || "No hay ninguna cuenta de TikTok ni de YouTube conectada en Buffer (Buffer → Connect channel)");
  }
  canalesGuardados = salida;
  return salida;
}

/** Texto para la red: el mismo posteo, con el máximo de hashtags y de largo que acepta. */
export function textoPara(red, caption) {
  const { maxHashtags, maxTexto } = REDES[red];
  let n = 0;
  return String(caption || "")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m) => (++n <= maxHashtags ? m : ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxTexto);
}

/** Título del Short: el producto y, si entra, el gancho. Hasta 100 caracteres, sin cortar palabras. */
export function tituloYoutube({ producto, gancho }) {
  const limpiar = (s) => String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const base = limpiar(producto) || limpiar(CONFIG.marca) || "Video del día";
  const conGancho = gancho ? `${base} · ${limpiar(gancho)}` : base;
  const t = conGancho.length <= 100 ? conGancho : base;
  if (t.length <= 100) return t;
  return t.slice(0, 100).replace(/\s+\S*$/, "").trim();
}

async function crearPost({ red, canal, texto, url, titulo, borrador = false }) {
  const input = {
    text: texto,
    channelId: canal.id,
    // En la prueba, "notification": aunque Buffer ignorara el borrador, solo mandaría un recordatorio.
    schedulingType: borrador ? "notification" : "automatic",
    mode: borrador ? "addToQueue" : "shareNow",
    assets: [{ video: { url } }],
  };
  if (red === "youtube") {
    input.metadata = { youtube: { title: titulo, categoryId: CONFIG.buffer.categoriaYoutube, madeForKids: false } };
  }
  if (borrador) input.saveToDraft = true;
  const d = await buffer(
    `mutation CrearPost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id status } }
        ... on MutationError { message }
      }
    }`,
    { input },
  );
  const res = d.createPost || {};
  if (!res.post?.id) throw new Error(`Buffer no aceptó el video para ${REDES[red].nombre}: ${res.message || "sin detalle"}`);
  return res.post.id;
}

export async function borrarPost(id) {
  await buffer(`mutation BorrarPost($input: DeletePostInput!) { deletePost(input: $input) { __typename } }`, { input: { id } });
}

async function estadoPost(id) {
  const d = await buffer(`query { post(input: { id: ${JSON.stringify(id)} }) { id status externalLink error { message } } }`);
  return d.post || {};
}

const errorDeConfiguracion = (m) => /clave de API|ninguna cuenta|No encuentro la cuenta/.test(m);

/**
 * Manda el video a las redes de Buffer. urlInstagram: link público del video que acaba de salir en Instagram.
 * Devuelve { ok, omitido, motivo, redes: [{ red, nombre, ok, id, motivo }] }.
 */
export async function mandarARedes({ producto, fecha, caption, gancho, urlInstagram, ruta }) {
  if (!bufferConfigurado()) return { ok: false, omitido: true, motivo: "Buffer no está configurado (falta BUFFER_API_KEY)", redes: [] };
  const canales = await canalesBuffer();
  const titulo = tituloYoutube({ producto, gancho });
  let url = urlInstagram;
  let medioWp = null;
  const redes = [];
  for (const red of Object.keys(REDES)) {
    const canal = canales[red];
    if (!canal) continue;
    const texto = textoPara(red, caption);
    let id;
    try {
      if (!url) throw new Error("no tengo el link del video de Instagram");
      id = await crearPost({ red, canal, texto, url, titulo });
    } catch (e) {
      // Respaldo: si Buffer no pudo bajar el video de Instagram y hay WordPress, se usa ese link.
      if (medioWp || !wordpressConfigurado() || !ruta || errorDeConfiguracion(e.message)) {
        redes.push({ red, nombre: REDES[red].nombre, ok: false, motivo: e.message });
        continue;
      }
      log(`${REDES[red].nombre}: no anduvo con el link de Instagram (${e.message}); pruebo con WordPress`);
      try {
        medioWp = await subirAWordpress(ruta);
        url = medioWp.url;
        id = await crearPost({ red, canal, texto, url, titulo });
      } catch (e2) {
        redes.push({ red, nombre: REDES[red].nombre, ok: false, motivo: e2.message });
        continue;
      }
    }
    redes.push({ red, nombre: REDES[red].nombre, ok: true, id });
    log(`${REDES[red].nombre}: enviado a Buffer (${canal.nombre}), post ${id}`);
  }
  const enviados = redes.filter((x) => x.ok);
  if (enviados.length) {
    const pendientes = await leerPendientes();
    for (const x of enviados) {
      pendientes.push({ id: x.id, red: x.red, producto, fecha, enviado: new Date().toISOString(), wp: medioWp?.id || null });
    }
    await escribirJson(PENDIENTES, pendientes);
  } else if (medioWp) {
    await borrarDeWordpress(medioWp.id).catch(() => {});
  }
  return { ok: enviados.length > 0, redes };
}

async function leerPendientes() {
  return leerJson(PENDIENTES, []);
}

/** Revisa lo mandado a Buffer y avisa por Telegram cuando cada red lo publica o lo rechaza. */
export async function revisarRedes() {
  if (!bufferConfigurado()) return;
  const pendientes = await leerPendientes();
  if (!pendientes.length) return;
  const siguen = [];
  for (const p of pendientes) {
    const red = REDES[p.red] || REDES.tiktok;
    let s;
    try {
      s = await estadoPost(p.id);
    } catch (e) {
      log(`${red.nombre}: no pude revisar el post ${p.id}: ${e.message}`);
      siguen.push(p);
      continue;
    }
    const horas = (Date.now() - new Date(p.enviado).getTime()) / 3600000;
    if (s.status === "sent") {
      await enviarTexto(`✅ Salió en ${red.nombre}: ${p.producto}${s.externalLink ? `\n${s.externalLink}` : ""}`).catch(() => {});
    } else if (s.status === "error") {
      await enviarTexto(
        `❌ ${red.nombre} no publicó "${p.producto}": ${s.error?.message || "sin detalle"}\nEl video está en la carpeta salida para subirlo a mano.`,
      ).catch(() => {});
    } else if (horas > 6) {
      await enviarTexto(`⚠️ ${red.nombre} todavía no publicó "${p.producto}" (estado en Buffer: ${s.status || "desconocido"}). Revisalo en Buffer.`).catch(() => {});
    } else {
      siguen.push(p);
    }
  }
  // El archivo de WordPress de respaldo se borra cuando ya no queda ninguna red esperándolo.
  const enUso = new Set(siguen.map((x) => x.wp).filter(Boolean));
  for (const wp of new Set(pendientes.map((x) => x.wp).filter(Boolean))) {
    if (!enUso.has(wp)) await borrarDeWordpress(wp).catch(() => {});
  }
  await escribirJson(PENDIENTES, siguen);
}

/** Prueba sin publicar: arma un borrador en cada red con ese video (Buffer lo baja y lo revisa) y lo borra. */
export async function probarEnvio({ url }) {
  const canales = await canalesBuffer();
  const resultados = [];
  for (const red of Object.keys(REDES)) {
    const canal = canales[red];
    if (!canal) continue;
    try {
      const id = await crearPost({
        red,
        canal,
        texto: "Prueba del sistema de videos (no se publica)",
        url,
        titulo: "Prueba del sistema de videos (no se publica)",
        borrador: true,
      });
      let borrado = true;
      try {
        await borrarPost(id);
      } catch (e) {
        borrado = false;
        log(`${REDES[red].nombre}: no pude borrar el borrador de prueba ${id}: ${e.message}`);
      }
      resultados.push({ red, nombre: REDES[red].nombre, canal: canal.nombre, ok: true, id, borrado });
    } catch (e) {
      resultados.push({ red, nombre: REDES[red].nombre, canal: canal.nombre, ok: false, motivo: e.message });
    }
  }
  return resultados;
}
