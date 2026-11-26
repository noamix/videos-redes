// Pruebas del motor contra servidores falsos de Meta, Buffer, Telegram, Gemini, n8n y una tienda.
// No publica nada, no sale a internet y no toca el .env, config/negocio.json, datos/ ni salida/ de esta carpeta:
// trabaja en una carpeta temporal.
//   npm run pruebas                → pruebas rápidas (unos segundos)
//   npm run pruebas -- --render    → además arma un video de cada estilo con HyperFrames (unos minutos)
//   agregá --conservar para no borrar la carpeta temporal (ahí quedan los videos de prueba)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conRender = process.argv.includes("--render");
const conservar = process.argv.includes("--conservar");
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), "videos-redes-pruebas-"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Resultados ----------
let bien = 0;
const fallas = [];
function ver(nombre, condicion, detalle = "") {
  if (condicion) {
    bien++;
    console.log(`✅ ${nombre}`);
  } else {
    fallas.push(nombre);
    console.log(`❌ ${nombre}${detalle ? `\n   ${String(detalle).slice(0, 600)}` : ""}`);
  }
}
async function probar(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    ver(nombre, false, e.stack || e.message);
  }
}

// ---------- Datos falsos ----------
const TOKEN_TG = "123456:TOKEN_FALSO_DE_TELEGRAM";
const CHAT = "777";
const CLAVE_BUFFER = "CLAVE_FALSA_DE_BUFFER";
const CLAVE_MOTOR = "clave-del-motor-de-prueba";
const CLAVE_GEMINI = "CLAVE_FALSA_DE_GEMINI";
const TEXTOS_BUENOS = {
  etiqueta: "Tazas",
  p1: "Tu café, en la taza justa",
  p2_titulo: "Taza de cerámica",
  p2_puntos: ["Capacidad de 350 ml", "Apta lavavajillas", "Pack de 6 unidades"],
  p3_titulo: "Pedilas hoy",
  p3_sub: "Todo el catálogo en la web",
  caption: "Tazas de cerámica de 350 ml.\nMirá todo en marca-prueba.com.ar ☕",
  hashtags: ["#tazas", "#ceramica", "#cafe", "#regalos"],
};

async function correrFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg: ${error}`))));
  });
}
const FOTOS = [];
for (const [i, fuente] of ["testsrc=size=900x900", "smptebars=size=800x1000", "rgbtestsrc=size=1000x700"].entries()) {
  const archivo = path.join(TMP, `foto${i + 1}.jpg`);
  await correrFfmpeg(["-f", "lavfi", "-i", fuente, "-frames:v", "1", archivo]);
  FOTOS.push(await fs.readFile(archivo));
}
const ARCHIVO_VIDEO = path.join(TMP, "video.mp4");
await correrFfmpeg(["-f", "lavfi", "-i", "color=c=black:s=540x960:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", ARCHIVO_VIDEO]);
const VIDEO = await fs.readFile(ARCHIVO_VIDEO);

// ---------- Servidor falso ----------
const estado = { telegram: [], updates: [], gemini: [], geminiRespuestas: [], graph: [], publicados: 0, rupload: [], buffer: [], borrados: [], n8n: [], n8nApi: [], flujos: [], rechazarIa: false };
let contador = 0;
let BASE = "";

const HTML_WOO = () => `<!doctype html><html><head>
<meta property="og:title" content="Taza de cerámica 350 ml x6 unid - Marca">
<meta property="og:image" content="/img/3.jpg"></head><body>
<h1 class="product_title entry-title">Taza de cerámica 350 ml x6 unid</h1>
<div class="woocommerce-product-details__short-description"><p>Taza de cerámica blanca de 350 ml, apta lavavajillas.</p></div>
<p class="price"><span class="woocommerce-Price-amount amount">$&nbsp;12.500,00</span></p>
<div class="woocommerce-product-gallery__image" data-large_image="/img/1.jpg"><a href="/img/1.jpg"><img src="/img/1-300x300.jpg"></a></div>
<div class="woocommerce-product-gallery__image" data-large_image="/img/2.jpg"><a href="/img/2.jpg"><img src="/img/2-300x300.jpg"></a></div>
</body></html>`;
const HTML_LD = () => `<!doctype html><html><head><meta property="og:title" content="Remera - Tienda">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
{"@type":"Product","name":"Remera de algodón","description":"<p>Remera 100% algodón peinado, talles S a XL.</p>",
"image":["/img/2.jpg",{"@type":"ImageObject","url":"/img/3.jpg"}],
"offers":{"@type":"Offer","price":"9395.00","priceCurrency":"ARS"}}]}</script></head><body><h1>Remera</h1></body></html>`;

async function leerCuerpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const buf = await leerCuerpo(req);
  const json = (codigo, datos) => {
    res.writeHead(codigo, { "content-type": "application/json" });
    res.end(JSON.stringify(datos));
  };
  try {
    // Telegram
    let m = p.match(/^\/tg\/bot([^/]+)\/(\w+)$/);
    if (m) {
      if (m[1] !== TOKEN_TG) return json(401, { ok: false, description: "Unauthorized" });
      const tipo = req.headers["content-type"] || "";
      const datos = tipo.includes("application/json") ? JSON.parse(buf.toString() || "{}") : { multipart: buf.toString("latin1") };
      estado.telegram.push({ metodo: m[2], datos });
      if (m[2] === "getMe") return json(200, { ok: true, result: { username: "bot_de_prueba" } });
      if (m[2] === "getUpdates") {
        const u = estado.updates.splice(0);
        if (!u.length) await esperar(150);
        return json(200, { ok: true, result: u });
      }
      if (m[2] === "sendVideo") return json(200, { ok: true, result: { message_id: 10 } });
      return json(200, { ok: true, result: true });
    }
    // Gemini
    m = p.match(/^\/gemini\/v1beta\/models\/([^:]+):generateContent$/);
    if (m) {
      estado.gemini.push({ modelo: m[1], clave: req.headers["x-goog-api-key"], datos: JSON.parse(buf.toString()) });
      const texto = estado.geminiRespuestas.length ? estado.geminiRespuestas.shift() : JSON.stringify(TEXTOS_BUENOS);
      return json(200, { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: "STOP" }] });
    }
    // Meta: subida reanudable
    if (p.startsWith("/rupload/")) {
      estado.rupload.push({ auth: req.headers.authorization, tamano: req.headers.file_size, bytes: buf.length });
      return json(200, { success: true });
    }
    // Meta: API Graph
    m = p.match(/^\/graph\/(v[\d.]+)(\/.*)$/);
    if (m) {
      const form = new URLSearchParams(buf.toString());
      const token = url.searchParams.get("access_token") || form.get("access_token") || "";
      const ruta = m[2];
      estado.graph.push({ metodo: req.method, ruta, token, form: Object.fromEntries(form) });
      if (token === "VENCIDO") return json(400, { error: { code: 190, message: "Error validating access token" } });
      if (ruta === "/debug_token") {
        const pagina = url.searchParams.get("input_token") === "EAA_TOKEN_DE_PAGINA";
        return json(200, {
          data: {
            is_valid: true,
            expires_at: pagina ? 0 : Math.floor(Date.now() / 1000) + 60 * 86400,
            scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "business_management"],
          },
        });
      }
      if (ruta === "/me/accounts") {
        return json(200, { data: [{ id: "pag1", name: "Página de prueba", access_token: "EAA_TOKEN_DE_PAGINA", instagram_business_account: { id: "ig1", username: "cuenta_prueba" } }] });
      }
      if (ruta === "/ig1" && req.method === "GET") return json(200, { id: "ig1", username: "cuenta_prueba" });
      if (ruta === "/ig1/content_publishing_limit") return json(200, { data: [{ quota_usage: 1, config: { quota_total: 100 } }] });
      if (ruta === "/ig1/media" && req.method === "POST") {
        if (estado.rechazarIa && form.get("is_ai_generated")) return json(400, { error: { code: 100, message: "(#100) Param is_ai_generated is not supported" } });
        const id = `cont${++contador}`;
        return json(200, form.get("upload_type") === "resumable" ? { id, uri: `${BASE}/rupload/ig-api-upload/${m[1]}/${id}` } : { id });
      }
      if (ruta === "/ig1/media" && req.method === "GET") {
        return json(200, { data: [{ id: "med1", media_type: "VIDEO", media_url: `${BASE}/video.mp4`, permalink: "https://www.instagram.com/reel/prueba/" }] });
      }
      if (/^\/cont\d+$/.test(ruta)) return json(200, { status_code: "FINISHED", status: "Finished" });
      if (ruta === "/ig1/media_publish") {
        estado.publicados++;
        return json(200, { id: "med1" });
      }
      if (ruta === "/med1") return json(200, { permalink: "https://www.instagram.com/reel/prueba/", media_url: `${BASE}/video.mp4` });
      return json(404, { error: { message: `ruta falsa no prevista ${ruta}` } });
    }
    // Buffer (GraphQL)
    if (p === "/buffer") {
      const q = JSON.parse(buf.toString());
      estado.buffer.push({ auth: req.headers.authorization, query: q.query, variables: q.variables });
      if (req.headers.authorization !== `Bearer ${CLAVE_BUFFER}`) return json(200, { errors: [{ message: "Unauthorized", extensions: { code: "UNAUTHORIZED" } }] });
      if (/organizations/.test(q.query)) return json(200, { data: { account: { organizations: [{ id: "org1", name: "Org" }] } } });
      if (/channels\(/.test(q.query)) {
        return json(200, {
          data: {
            channels: [
              { id: "ch-tt", name: "cuenta_tiktok", displayName: "cuenta_tiktok", service: "tiktok", isQueuePaused: false },
              { id: "ch-yt", name: "canal", displayName: "Canal de Prueba", service: "youtube", isQueuePaused: false },
            ],
          },
        });
      }
      if (/createPost/.test(q.query)) {
        const md = q.variables.input.metadata || {};
        if (estado.rechazarIa && (md.tiktok?.isAiGenerated || md.youtube?.isAiGenerated)) return json(200, { errors: [{ message: "Unknown field isAiGenerated" }] });
        const id = `post${++contador}`;
        return json(200, { data: { createPost: { post: { id, status: q.variables.input.saveToDraft ? "draft" : "sending" } } } });
      }
      if (/deletePost/.test(q.query)) {
        estado.borrados.push(q.variables.input.id);
        return json(200, { data: { deletePost: { __typename: "PostActionSuccess" } } });
      }
      if (/post\(input/.test(q.query)) {
        const id = q.query.match(/id: "([^"]+)"/)[1];
        return json(200, { data: { post: { id, status: "sent", externalLink: `https://ejemplo.com/${id}` } } });
      }
      return json(200, { errors: [{ message: "consulta no prevista" }] });
    }
    // n8n
    if (p === "/healthz") return json(200, { status: "ok" });
    m = p.match(/^\/api\/v1\/workflows(?:\/([^/]+))?(\/activate)?$/);
    if (m) {
      estado.n8nApi.push({ metodo: req.method, ruta: p, clave: req.headers["x-n8n-api-key"], cuerpo: buf.length ? JSON.parse(buf.toString()) : null });
      if (req.headers["x-n8n-api-key"] !== "CLAVE_N8N_DE_PRUEBA") return json(401, { message: "unauthorized" });
      if (req.method === "GET" && !m[1]) return json(200, { data: estado.flujos.map((f) => ({ id: f.id, name: f.name })) });
      if (req.method === "POST" && !m[1]) {
        const cuerpo = JSON.parse(buf.toString());
        const extra = Object.keys(cuerpo).filter((k) => !["name", "nodes", "connections", "settings"].includes(k));
        if (extra.length) return json(400, { message: `request/body must NOT have additional properties: ${extra.join(", ")}` });
        const f = { id: `wf${estado.flujos.length + 1}`, ...cuerpo, activo: false };
        estado.flujos.push(f);
        return json(200, f);
      }
      const f = estado.flujos.find((x) => x.id === m[1]);
      if (!f) return json(404, { message: "not found" });
      if (req.method === "PUT") {
        Object.assign(f, JSON.parse(buf.toString()));
        return json(200, f);
      }
      if (req.method === "POST" && m[2]) {
        f.activo = true;
        return json(200, f);
      }
    }
    if (p.startsWith("/webhook/")) {
      estado.n8n.push({ ruta: p, datos: JSON.parse(buf.toString() || "{}") });
      return json(200, { ok: true });
    }
    // Tienda
    if (p === "/producto/woo" || p === "/producto/ld") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(p.endsWith("woo") ? HTML_WOO() : HTML_LD());
    }
    m = p.match(/^\/img\/(\d)(?:-300x300)?\.jpg$/);
    if (m) {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(FOTOS[Number(m[1]) - 1]);
    }
    if (p === "/video.mp4") {
      res.writeHead(200, { "content-type": "video/mp4" });
      return res.end(VIDEO);
    }
    json(404, { error: "no existe" });
  } catch (e) {
    json(500, { error: e.message });
  }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
BASE = `http://127.0.0.1:${servidor.address().port}`;

// ---------- Configuración de prueba (todo en la carpeta temporal) ----------
const ARCHIVO_NEGOCIO = path.join(TMP, "negocio.json");
const NEGOCIO = {
  nombre: "MARCA DE PRUEBA",
  web: "https://www.marca-prueba.com.ar/tienda/",
  que_vende: "una fábrica de tazas y remeras para comercios",
  publico: "comercios y emprendedores de Argentina",
  cuentas: { instagram: "@cuenta_prueba" },
  hora_publicacion: "00:00",
  zona_horaria: "America/Argentina/Buenos_Aires",
  whatsapp: "11 5555-5555",
  estilo: "cajas",
  colores: { principal: "#E11D48", oscuro: "#111827" },
  palabras_prohibidas: ["Córdoba"],
  reglas_textos: "Nunca digas de dónde es la empresa.",
  producto_prueba: { producto: "Taza de cerámica 350 ml x6 unid", link: `${BASE}/producto/woo`, linea: "tazas" },
  pausado: false,
};
const escribirNegocio = async (cambios = {}) => {
  await fs.writeFile(ARCHIVO_NEGOCIO, JSON.stringify({ ...NEGOCIO, ...cambios }, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000));
  await fs.utimes(ARCHIVO_NEGOCIO, t, t);
};
await escribirNegocio();
const LINEAS = {
  tazas: { nombre: "Tazas", etiqueta: "Tazas", hashtags: ["#tazas", "#ceramica"], beneficios: ["Envíos a todo el país"], palabras_prohibidas: ["barata"] },
  remeras: { nombre: "Remeras", etiqueta: "Remeras", color_fondo: "#1E3A8A", color_tinta: "#FFFFFF", color_acento: "#FBBF24", color_acento_tinta: "#1E3A8A" },
  default: { nombre: "Productos", etiqueta: "" },
};
await fs.writeFile(path.join(TMP, "lineas.json"), JSON.stringify(LINEAS, null, 2));
await fs.writeFile(path.join(TMP, ".env.prueba"), "", { mode: 0o600 });

const ENTORNO = {
  VIDEOS_ENV: path.join(TMP, ".env.prueba"),
  VIDEOS_NEGOCIO: ARCHIVO_NEGOCIO,
  CARPETA_SALIDA: path.join(TMP, "salida"),
  CARPETA_DATOS: path.join(TMP, "datos"),
  CARPETA_TRABAJOS: path.join(TMP, "trabajos"),
  MOTOR_CLAVE: CLAVE_MOTOR,
  TELEGRAM_BOT_TOKEN: TOKEN_TG,
  TELEGRAM_CHAT_ID: CHAT,
  TELEGRAM_API_BASE: `${BASE}/tg`,
  GEMINI_API_KEY: CLAVE_GEMINI,
  GEMINI_API_BASE: `${BASE}/gemini`,
  GEMINI_MODELO: "gemini-de-prueba",
  N8N_WEBHOOK_RESPUESTAS: `${BASE}/webhook/videos-redes-respuesta`,
  PLANILLA_ID: "PLANILLA_DE_PRUEBA",
  IG_USER_ID: "ig1",
  IG_TOKEN: "EAA_TOKEN_DE_PAGINA",
  IG_API_BASE: `${BASE}/graph`,
  IG_API_BASE_CONECTAR: `${BASE}/graph`,
  IG_VIA: "facebook",
  IG_RUPLOAD_BASE: `${BASE}/rupload`,
  IG_ESPERA_MS: "50",
  BUFFER_API_KEY: CLAVE_BUFFER,
  BUFFER_API_URL: `${BASE}/buffer`,
  BUFFER_YOUTUBE: "Canal de Prueba",
  WP_URL: "",
  HYPERFRAMES_NO_TELEMETRY: "1",
};
Object.assign(process.env, ENTORNO);

function correrNode(script, args = [], { entrada = "", env = {}, timeoutMs = 180000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(RAIZ, script), ...args], { cwd: RAIZ, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (salida += d));
    const reloj = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (codigo) => {
      clearTimeout(reloj);
      resolve({ codigo, salida });
    });
    p.stdin.end(entrada);
  });
}

// Los módulos se cargan después de preparar el entorno (la configuración se lee al importarlos).
const { CONFIG, RUTAS, refrescarNegocio } = await import("../motor/config.mjs");
RUTAS.lineas = path.join(TMP, "lineas.json");
const { planificar, publicarPendientes, generar } = await import("../motor/flujo.mjs");
const { controlar, escribirTextos } = await import("../motor/textos.mjs");
const { textosDePlantilla } = await import("../motor/plantillas.mjs");
const { analizarPagina } = await import("../motor/pagina.mjs");
const { armarPrecio } = await import("../motor/precio.mjs");
const { publicarReel, probarSubida } = await import("../motor/instagram.mjs");
const { canalesBuffer, mandarARedes, probarEnvio, revisarRedes } = await import("../motor/buffer.mjs");
const { enviarRevision, iniciarEscucha, detenerEscucha } = await import("../motor/telegram.mjs");
const { fechaLocal, sumarDias } = await import("../motor/util.mjs");
const hoy = fechaLocal();

console.log(`Pruebas del motor (carpeta temporal: ${TMP})\n`);

// ---------- 1. Datos del negocio ----------
await probar("negocio.json se lee", async () => {
  ver(
    "negocio.json se lee (marca, web para mostrar, hora, estilo, colores)",
    CONFIG.marca === "MARCA DE PRUEBA" && CONFIG.web === "marca-prueba.com.ar" && CONFIG.horaPublicacion === "00:00" && CONFIG.estilo === "cajas" && CONFIG.colores.principal === "#E11D48",
    JSON.stringify({ marca: CONFIG.marca, web: CONFIG.web, hora: CONFIG.horaPublicacion, estilo: CONFIG.estilo }),
  );
  await escribirNegocio({ pausado: true, estilo: "clasico" });
  const cambio = refrescarNegocio();
  ver("negocio.json se vuelve a leer solo cuando cambia (pausa y estilo)", cambio && CONFIG.pausado && CONFIG.estilo === "clasico" && RUTAS.plantilla.endsWith(`${path.sep}plantilla`));
  ver("Sin cambios, no lo vuelve a leer", refrescarNegocio() === false);
  await fs.writeFile(ARCHIVO_NEGOCIO, "{ esto no es json");
  await fs.utimes(ARCHIVO_NEGOCIO, new Date(), new Date(Date.now() + 5000));
  refrescarNegocio();
  ver("Un negocio.json roto se avisa en vez de romper el motor", Boolean(CONFIG.errorNegocio));
  await escribirNegocio();
  refrescarNegocio();
  ver("Vuelve a la normalidad al corregirlo", !CONFIG.errorNegocio && !CONFIG.pausado && CONFIG.estilo === "cajas");
});

// ---------- 2. Planificar ----------
await probar("planificar", async () => {
  const productos = [
    { producto: "Taza A 350 ml", linea: "tazas", link: `${BASE}/producto/woo` },
    { producto: "Taza B 500 ml", linea: "tazas" },
    { producto: "Remera A", linea: "remeras" },
    { producto: "Gorra", linea: "remeras", activo: "NO" },
  ];
  const r = planificar({ productos, calendario: [] }, hoy);
  const todas = [...r.filas_nuevas, ...r.a_generar];
  const lineasDelPlan = [...todas].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => x.linea);
  const alterna = lineasDelPlan.every((l, i) => i === 0 || l !== lineasDelPlan[i - 1]);
  ver(`Planifica ${CONFIG.diasAdelante + 1} días rotando entre las líneas de la hoja (sin rotación en negocio.json)`, todas.length === CONFIG.diasAdelante + 1 && alterna, lineasDelPlan.join(","));
  ver("Un producto con activo = NO no sale", !todas.some((x) => x.producto === "Gorra"));
  ver(`Genera como máximo ${CONFIG.maxPorCorrida} por vuelta, con el link del producto`, r.a_generar.length === CONFIG.maxPorCorrida && r.a_generar.some((x) => x.link));
  CONFIG.pausado = true;
  const p = planificar({ productos, calendario: [] }, hoy);
  CONFIG.pausado = false;
  ver("En pausa no agenda ni genera nada", p.filas_nuevas.length === 0 && p.a_generar.length === 0);
});

// ---------- 3. Control de textos ----------
await probar("control de textos", async () => {
  const base = { etiqueta: "Tazas", p1: "Tu café en la taza justa", p2_titulo: "Taza de cerámica", p2_punto_1: "350 ml", p2_punto_2: "", p2_punto_3: "", p3_titulo: "Pedilas hoy", p3_sub: "Todo el catálogo", caption: "Mirá la web." };
  const ctx = { mostrarPrecio: false, lineaClave: "tazas" };
  ver("Textos correctos pasan el control", controlar(base, ctx).length === 0, controlar(base, ctx).join("; "));
  ver("Palabra prohibida del negocio (sin importar tildes)", controlar({ ...base, caption: "Fábrica en Cordoba" }, ctx).some((x) => x.includes("Córdoba")));
  ver("Palabra prohibida de la línea", controlar({ ...base, p1: "La taza más barata" }, ctx).some((x) => x.includes("barata")));
  ver("Tuteo", controlar({ ...base, p3_titulo: "Pide la tuya" }, ctx).some((x) => x.includes("voseo")));
  ver("Signos de exclamación en pantalla", controlar({ ...base, p1: "¡Llegaron!" }, ctx).some((x) => x.includes("exclamación")));
  ver("Teléfono", controlar({ ...base, caption: "Llamá al 351 444-5555" }, ctx).some((x) => x.includes("teléfono")));
  ver("Precio con mostrar_precio en NO", controlar({ ...base, p2_punto_1: "$ 12.500" }, ctx).some((x) => x.includes("precio")));
});

// ---------- 4. Plantillas de textos (sin IA) ----------
await probar("plantillas de textos", async () => {
  let problemas = [];
  let distintas = 0;
  for (let d = 0; d < 60; d++) {
    const datos = { fecha: sumarDias(hoy, d), producto: "Taza de cerámica 350 ml x6 unid", lineaClave: "tazas", linea: LINEAS.tazas, detalles: "Color negro", mostrarPrecio: false, precio: "" };
    const t = textosDePlantilla(datos);
    const re = textosDePlantilla({ ...datos, anteriores: t });
    if (t.p1 !== re.p1 || t.p3_titulo !== re.p3_titulo || t.caption !== re.caption) distintas++;
    problemas = problemas.concat(controlar(t, { mostrarPrecio: false, lineaClave: "tazas" }), controlar(re, { mostrarPrecio: false, lineaClave: "tazas" }));
  }
  ver("Las plantillas genéricas arman textos que pasan el control (60 días, con rehacer)", problemas.length === 0, [...new Set(problemas)].join("; "));
  ver("Al rehacer cambian los textos", distintas >= 50, `${distintas} de 60`);
});

// ---------- 5. Página del producto y precio ----------
await probar("página del producto", async () => {
  const w = analizarPagina(HTML_WOO(), `${BASE}/producto/woo`);
  ver("WooCommerce: título, descripción, precio y fotos", w.titulo === "Taza de cerámica 350 ml x6 unid" && /lavavajillas/.test(w.descripcion) && /12\.500/.test(w.precio) && w.imagenes.length === 3, JSON.stringify(w));
  const l = analizarPagina(HTML_LD(), `${BASE}/producto/ld`);
  ver(
    "Datos estándar (JSON-LD, Tiendanube/Shopify): título, descripción, precio y fotos",
    l.titulo === "Remera de algodón" && /algodón peinado/.test(l.descripcion) && l.precio === "$9.395" && l.imagenes.includes(`${BASE}/img/2.jpg`) && l.imagenes.includes(`${BASE}/img/3.jpg`),
    JSON.stringify(l),
  );
  const precio = armarPrecio("$ 12.500,00", "Taza de cerámica 350 ml x6 unid", "2026-11-23");
  ver("Precio: total, por unidad y mes", precio?.texto === "$12.500" && /por unidad/.test(precio?.unidad) && precio?.mes === "Precio de noviembre 2026", JSON.stringify(precio));
});

// ---------- 6. Textos con Gemini ----------
await probar("Gemini", async () => {
  const datos = { fecha: hoy, producto: "Taza de cerámica 350 ml x6 unid", lineaClave: "tazas", linea: LINEAS.tazas, informacion: "Taza de cerámica blanca de 350 ml", detalles: "", precio: "", mostrarPrecio: false };
  const r = await escribirTextos(datos);
  const sistema = estado.gemini.at(-1)?.datos?.systemInstruction?.parts?.[0]?.text || "";
  ver("Gemini escribe los textos", r.origen === "gemini" && r.textos.p1 === TEXTOS_BUENOS.p1, JSON.stringify(r.avisos));
  ver("Las instrucciones llevan los datos y las reglas del negocio", sistema.includes("MARCA DE PRUEBA") && sistema.includes("tazas y remeras") && sistema.includes("Nunca digas de dónde es la empresa") && sistema.includes("Córdoba") && !/\{[A-Z_]+\}/.test(sistema));
  ver("La clave va en el encabezado, no en la dirección", estado.gemini.at(-1)?.clave === CLAVE_GEMINI);
  const antes = estado.gemini.length;
  estado.geminiRespuestas.push(JSON.stringify({ ...TEXTOS_BUENOS, caption: "Somos de Córdoba" }), JSON.stringify(TEXTOS_BUENOS));
  const r2 = await escribirTextos(datos);
  ver("Si Gemini rompe una regla, se lo corrige y vuelve a pedir", r2.origen === "gemini" && estado.gemini.length - antes === 2 && !/C[oó]rdoba/.test(r2.textos.caption));
});

// ---------- 7. Instagram ----------
await probar("Instagram", async () => {
  const r = await publicarReel({ ruta: ARCHIVO_VIDEO, caption: "Prueba" });
  ver("Publica por subida directa a Meta (sin WordPress)", r.ok && r.permalink.includes("instagram.com") && estado.publicados === 1 && estado.rupload.at(-1)?.auth === "OAuth EAA_TOKEN_DE_PAGINA" && Number(estado.rupload.at(-1)?.tamano) === VIDEO.length);
  await probarSubida({ ruta: ARCHIVO_VIDEO });
  ver("ig-probar no publica (contenedor sin media_publish)", estado.publicados === 1);
  const original = CONFIG.instagram.token;
  CONFIG.instagram.token = "VENCIDO";
  let mensaje = "";
  try {
    await publicarReel({ ruta: ARCHIVO_VIDEO, caption: "x" });
  } catch (e) {
    mensaje = e.message;
  }
  CONFIG.instagram.token = original;
  ver("Error 190: avisa que hay que reconectar", /se venció o se revocó/.test(mensaje) && /ig-conectar/.test(mensaje), mensaje);
});

// ---------- 8. Buffer: TikTok y YouTube Shorts ----------
await probar("Buffer", async () => {
  const c = await canalesBuffer();
  ver("Encuentra TikTok y el canal de YouTube elegido", c.tiktok?.id === "ch-tt" && c.youtube?.id === "ch-yt");
  const antes = estado.buffer.length;
  const r = await mandarARedes({ producto: "Taza de cerámica", fecha: hoy, caption: "Texto #a #b #c #d #e #f #g", gancho: "Tu café", urlInstagram: `${BASE}/video.mp4`, ruta: ARCHIVO_VIDEO });
  const creados = estado.buffer.slice(antes).filter((x) => /createPost/.test(x.query)).map((x) => x.variables.input);
  const tt = creados.find((x) => x.channelId === "ch-tt");
  const yt = creados.find((x) => x.channelId === "ch-yt");
  ver("Manda el video a las dos redes, para publicar ya", r.ok && tt?.mode === "shareNow" && tt?.schedulingType === "automatic" && yt?.mode === "shareNow");
  ver("TikTok: hasta 5 hashtags · YouTube: título y categoría", (tt?.text.match(/#/g) || []).length === 5 && yt?.metadata?.youtube?.title?.length <= 100 && yt?.metadata?.youtube?.categoryId === "22");
  const antesBorrados = estado.borrados.length;
  const pr = await probarEnvio({ url: `${BASE}/video.mp4` });
  const borradores = estado.buffer.filter((x) => /createPost/.test(x.query) && x.variables.input.saveToDraft).map((x) => x.variables.input);
  ver("redes-probar: borradores con aviso (no automáticos) y los borra", pr.length === 2 && pr.every((x) => x.ok && x.borrado) && borradores.every((x) => x.schedulingType === "notification") && estado.borrados.length - antesBorrados === 2);
  const msgs = estado.telegram.length;
  await revisarRedes();
  const avisos = estado.telegram.slice(msgs).map((x) => x.datos.text || "").join("\n");
  ver("Avisa por Telegram cuando cada red publica", /Salió en TikTok/.test(avisos) && /Salió en YouTube/.test(avisos), avisos);
});

// ---------- 9. Publicar el aprobado del día ----------
await probar("publicar", async () => {
  await fs.mkdir(RUTAS.salida, { recursive: true });
  const archivo = `${hoy}_taza-de-ceramica.mp4`;
  await fs.copyFile(ARCHIVO_VIDEO, path.join(RUTAS.salida, archivo));
  const fila = { fecha: hoy, estado: "aprobado", producto: "Taza de cerámica", archivo, caption: "Texto", p1: "Tu café" };
  const horaOriginal = CONFIG.horaPublicacion;
  CONFIG.horaPublicacion = "24:00";
  const temprano = await publicarPendientes({ calendario: [fila] });
  CONFIG.horaPublicacion = horaOriginal;
  ver("Antes de la hora no publica", temprano.filas.length === 0 && /hora/.test(temprano.nota || ""));
  CONFIG.pausado = true;
  const pausa = await publicarPendientes({ calendario: [fila] });
  CONFIG.pausado = false;
  ver("En pausa no publica", pausa.filas.length === 0 && /pausa/i.test(pausa.nota || ""));
  const antes = estado.publicados;
  const r = await publicarPendientes({ calendario: [fila, { ...fila, fecha: sumarDias(hoy, -1) }] });
  ver("Publica solo el aprobado de hoy, en Instagram y por Buffer", r.filas.length === 1 && r.filas[0].estado === "publicado" && estado.publicados === antes + 1 && /Buffer/.test(r.filas[0].nota), JSON.stringify(r));
});

// ---------- 10. Telegram ----------
await probar("Telegram", async () => {
  await enviarRevision({ fecha: sumarDias(hoy, 3), producto: "Taza", ruta: ARCHIVO_VIDEO, caption: "Texto del posteo" });
  const video = estado.telegram.filter((x) => x.metodo === "sendVideo").at(-1)?.datos?.multipart || "";
  ver("Manda el video con Aprobar / Rehacer y la hora de publicación", video.includes("Aprobar") && video.includes("Rehacer") && video.includes("a las 00:00"));
  const fecha = sumarDias(hoy, 3);
  estado.updates.push(
    { update_id: 1, callback_query: { id: "a", data: `ok|${fecha}`, message: { chat: { id: Number(CHAT) }, message_id: 5 } } },
    { update_id: 2, callback_query: { id: "b", data: `re|${fecha}`, message: { chat: { id: 999 }, message_id: 6 } } },
    { update_id: 3, message: { text: "/id", chat: { id: 4242 } } },
  );
  iniciarEscucha().catch(() => {});
  for (let i = 0; i < 40 && !estado.telegram.some((x) => x.metodo === "sendMessage" && /4242/.test(x.datos.text || "")); i++) await esperar(100);
  detenerEscucha();
  await esperar(300);
  ver("Aprobar avisa a n8n, con la clave del motor", estado.n8n.length === 1 && estado.n8n[0].datos.estado === "aprobado" && estado.n8n[0].datos.fecha === fecha && estado.n8n[0].datos.clave === CLAVE_MOTOR, JSON.stringify(estado.n8n));
  ver("Los botones de otro chat no cambian nada", !estado.n8n.some((x) => x.datos.estado === "rehacer"));
  const id = estado.telegram.find((x) => x.metodo === "sendMessage" && /4242/.test(x.datos.text || ""));
  ver("/id contesta el número y cómo cargarlo", Boolean(id) && /cargar-clave -- TELEGRAM_CHAT_ID --valor 4242/.test(id.datos.text));
});

// ---------- 11. Comandos (procesos aparte) ----------
await probar("cargar-clave", async () => {
  const envArchivo = path.join(TMP, ".env.claves");
  const env = { VIDEOS_ENV: envArchivo };
  await correrNode("motor/cargar-clave.mjs", ["PLANILLA_ID", "--valor", "abc123"], { env });
  const rSecreta = await correrNode("motor/cargar-clave.mjs", ["GEMINI_API_KEY", "--valor", "no-va"], { env });
  const rGenerar = await correrNode("motor/cargar-clave.mjs", ["MOTOR_CLAVE", "--generar"], { env });
  const rOculta = await correrNode("motor/cargar-clave.mjs", ["GEMINI_API_KEY"], { env, entrada: "clave-super-secreta\n" });
  const rLista = await correrNode("motor/cargar-clave.mjs", ["--lista"], { env });
  const rVer = await correrNode("motor/cargar-clave.mjs", ["PLANILLA_ID", "--ver"], { env });
  const rVerSecreta = await correrNode("motor/cargar-clave.mjs", ["GEMINI_API_KEY", "--ver"], { env });
  await correrNode("motor/cargar-clave.mjs", ["N8N_API_KEY"], { env, entrada: "temporal\n" });
  const rBorrar = await correrNode("motor/cargar-clave.mjs", ["N8N_API_KEY", "--borrar"], { env });
  const contenido = await fs.readFile(envArchivo, "utf8");
  const modo = statSync(envArchivo).mode & 0o777;
  const motor = (contenido.match(/^MOTOR_CLAVE=([0-9a-f]+)$/m) || [])[1] || "";
  ver("--valor guarda lo que no es secreto, con permisos 600", /^PLANILLA_ID=abc123$/m.test(contenido) && modo === 0o600, `${modo.toString(8)}`);
  ver("--valor no acepta claves secretas", rSecreta.codigo !== 0 && !contenido.includes("no-va"));
  ver("--generar crea una clave al azar y no la muestra", motor.length === 64 && !rGenerar.salida.includes(motor));
  ver("Pide la clave sin mostrarla y la guarda", /^GEMINI_API_KEY=clave-super-secreta$/m.test(contenido) && !rOculta.salida.includes("clave-super-secreta"));
  ver("--lista muestra los nombres, no los valores", /✅ GEMINI_API_KEY/.test(rLista.salida) && !rLista.salida.includes("clave-super-secreta") && !rLista.salida.includes(motor));
  ver("--ver muestra lo que no es secreto y se niega con lo secreto", /PLANILLA_ID=abc123/.test(rVer.salida) && !rVerSecreta.salida.includes("clave-super-secreta"));
  ver("--borrar saca una clave temporal y deja las demás", rBorrar.codigo === 0 && !/N8N_API_KEY/.test(contenido) && /GEMINI_API_KEY=/.test(contenido));
});

await probar("ig-conectar", async () => {
  const envArchivo = path.join(TMP, ".env.ig");
  await fs.writeFile(envArchivo, "IG_USER_ID=\nIG_TOKEN=\n", { mode: 0o600 });
  const r = await correrNode("motor/ig-conectar.mjs", [], { env: { VIDEOS_ENV: envArchivo, IG_USER_ID: "", IG_TOKEN: "" }, entrada: "EAA_TOKEN_DE_USUARIO_LARGO\n" });
  const contenido = await fs.readFile(envArchivo, "utf8");
  ver("Cambia el token de usuario por el de la página y lo guarda", r.codigo === 0 && /^IG_USER_ID=ig1$/m.test(contenido) && /^IG_TOKEN=EAA_TOKEN_DE_PAGINA$/m.test(contenido), r.salida);
  ver("No muestra los tokens", !r.salida.includes("EAA_TOKEN"));
});

await probar("armar el flujo de n8n", async () => {
  const destino = path.join(TMP, "flujo.json");
  const r = await correrNode("motor/armar-n8n.mjs", [], { env: { VIDEOS_FLUJO: destino, MOTOR_URL_PARA_N8N: "http://172.31.250.1:8099" } });
  const flujo = JSON.parse(await fs.readFile(destino, "utf8"));
  const modo = statSync(destino).mode & 0o777;
  const tipos = flujo.nodes.map((n) => n.type);
  const webhook = flujo.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  const motor = flujo.nodes.find((n) => n.name === "Motor: generar video");
  ver(
    "Flujo completo para la marca, con permisos 600",
    r.codigo === 0 && modo === 0o600 && flujo.name === "Videos diarios MARCA DE PRUEBA" && tipos.filter((t) => t === "n8n-nodes-base.googleSheets").length === 7 && flujo.settings.timezone === "America/Argentina/Buenos_Aires",
    r.salida,
  );
  ver("Webhook de respuestas y motor con su clave", webhook?.parameters?.path === "videos-redes-respuesta" && motor?.parameters?.url === "http://172.31.250.1:8099/generar" && motor?.parameters?.headerParameters?.parameters?.[0]?.value === CLAVE_MOTOR);
  ver("Cuatro disparadores: cada hora, cada 15 min, lunes y webhook", ["0 8-21 * * *", "*/15 8-23 * * *", "0 10 * * 1"].every((c) => JSON.stringify(flujo).includes(c)) && Boolean(webhook));
  const sinClave = await correrNode("motor/armar-n8n.mjs", ["--importar"], { env: { VIDEOS_FLUJO: destino, N8N_API_KEY: "" } });
  ver("--importar sin la clave de n8n avisa y no hace nada", sinClave.codigo !== 0 && estado.n8nApi.length === 0, sinClave.salida);
  const env = { VIDEOS_FLUJO: destino, N8N_API_KEY: "CLAVE_N8N_DE_PRUEBA" };
  const primera = await correrNode("motor/armar-n8n.mjs", ["--importar"], { env });
  const segunda = await correrNode("motor/armar-n8n.mjs", ["--importar"], { env });
  ver(
    "--importar sube el flujo, lo activa y la segunda vez lo actualiza (no lo duplica)",
    primera.codigo === 0 && segunda.codigo === 0 && estado.flujos.length === 1 && estado.flujos[0].activo && /importado/.test(primera.salida) && /actualizado/.test(segunda.salida) && estado.n8nApi.some((x) => x.metodo === "PUT"),
    primera.salida + segunda.salida,
  );
  ver("--importar no muestra la clave del motor ni la de n8n", ![primera.salida, segunda.salida].some((s) => s.includes(CLAVE_MOTOR) || s.includes("CLAVE_N8N_DE_PRUEBA")));
});

await probar("ig-probar y redes-probar", async () => {
  const antes = estado.publicados;
  const ig = await correrNode("motor/ig-probar.mjs", [ARCHIVO_VIDEO]);
  const redes = await correrNode("motor/redes-probar.mjs");
  ver("ig-probar sube sin publicar", ig.codigo === 0 && /No se publicó nada/.test(ig.salida) && estado.publicados === antes, ig.salida);
  ver("redes-probar arma y borra los borradores", redes.codigo === 0 && (redes.salida.match(/no se publicó nada/g) || []).length === 2, redes.salida);
});

let motor = null;
await probar("motor y chequeo", async () => {
  const puerto = 20000 + Math.floor(Math.random() * 20000);
  motor = spawn(process.execPath, [path.join(RAIZ, "motor/servidor.mjs")], { cwd: RAIZ, env: { ...process.env, MOTOR_PUERTO: String(puerto) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  motor.stdout.on("data", (d) => (log += d));
  motor.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 50 && !log.includes("escuchando"); i++) await esperar(100);
  const conClave = await fetch(`http://127.0.0.1:${puerto}/estado`, { headers: { "x-motor-clave": CLAVE_MOTOR } }).then((r) => r.json());
  const sinClave = await fetch(`http://127.0.0.1:${puerto}/estado`);
  ver("El motor arranca y /estado pide la clave", conClave.ok && conClave.marca === "MARCA DE PRUEBA" && sinClave.status === 403, log);
  await escribirNegocio({ pausado: true });
  const plan = await fetch(`http://127.0.0.1:${puerto}/planificar`, {
    method: "POST",
    headers: { "x-motor-clave": CLAVE_MOTOR, "content-type": "application/json" },
    body: JSON.stringify({ productos: [{ producto: "Taza", linea: "tazas" }], calendario: [] }),
  }).then((r) => r.json());
  await escribirNegocio();
  ver("La pausa de negocio.json vale sin reiniciar el motor", /pausa/i.test(plan.resumen || "") && /EN PAUSA/.test(log), JSON.stringify(plan));
  const chequeo = await correrNode("motor/chequeo.mjs", [], { env: { MOTOR_PUERTO: String(puerto) } });
  const lineasOk = ["Negocio: MARCA DE PRUEBA", "Motor andando", "Plantillas de textos OK", "Telegram: bot @bot_de_prueba", "n8n responde", "Instagram conectado: @cuenta_prueba", "TikTok por Buffer: cuenta_tiktok", "YouTube Shorts por Buffer: Canal de Prueba"];
  const faltan = lineasOk.filter((l) => !chequeo.salida.includes(`✅ ${l}`));
  ver("npm run chequeo da bien todo lo que depende del sistema", faltan.length === 0, `faltan: ${faltan.join(" | ")}\n${chequeo.salida}`);
});
if (motor) motor.kill("SIGTERM");

// ---------- 12. Voz en off ----------
// Las partes del motor sin modelo, y el comando de voz con el motor "simulada" (un murmullo con forma de voz),
// si hay un Python con numpy y num2words (el de voz/.venv, el de VOZ_PYTHON_PRUEBAS o python3).
const voz = await import("../motor/voz.mjs");
const fr = await import("../motor/frases.mjs");
const { enRangoHorario, horasCron, horaLocal } = await import("../motor/util.mjs");
const pythonVoz = [path.join(RAIZ, "voz/.venv/bin/python"), process.env.VOZ_PYTHON_PRUEBAS, "python3"]
  .filter(Boolean)
  .find((py) => (!py.includes("/") || existsSync(py)) && spawnSync(py, ["-c", "import numpy, num2words"]).status === 0);
const DIR_VOZ = path.join(TMP, "voz");
const COMANDO_VOZ = pythonVoz ? `${pythonVoz} ${path.join(RAIZ, "voz/voz_videos.py")}` : "";
const vozOriginal = { ...CONFIG.voz };
const conVozSimulada = (cambios = {}) => Object.assign(CONFIG.voz, { modo: "auto", comando: COMANDO_VOZ, nombre: "mi-voz", tope: "no", horario: "", memoriaMinMb: 1, timeoutMin: 2, ...cambios });
const sinVoz = () => Object.assign(CONFIG.voz, vozOriginal);

await probar("voz: horarios", async () => {
  const a = (h) => new Date(`2026-11-25T${String(h).padStart(2, "0")}:30:00-03:00`);
  ver("Horario que cruza la medianoche (23-7)", enRangoHorario("23-7", a(23)) && enRangoHorario("23-7", a(3)) && !enRangoHorario("23-7", a(12)));
  ver("Horario de madrugada (1-6) y horario vacío", enRangoHorario("1-6", a(6)) && !enRangoHorario("1-6", a(7)) && !enRangoHorario("", a(3)));
  ver("Horas del cron para n8n (también si cruza la medianoche)", horasCron("1-6") === "1-6" && horasCron("23-5") === "23-23,0-5" && horasCron("25-3") === "" && horasCron("x") === "");
  Object.assign(CONFIG.voz, { modo: "auto", comando: "x", horario: "" });
  const sinHorario = !voz.soloUrgentes() && voz.enHorarioVoz() && voz.horarioVozTexto() === "a cualquier hora";
  const h = Number(horaLocal().slice(0, 2));
  CONFIG.voz.horario = `${(h + 2) % 24}-${(h + 3) % 24}`;
  const fuera = voz.soloUrgentes() && !voz.enHorarioVoz();
  CONFIG.voz.horario = `${h}-${h}`;
  const dentro = !voz.soloUrgentes() && voz.enHorarioVoz();
  sinVoz();
  ver("Sin VOZ_HORARIO la voz se arma a cualquier hora; con horario, fuera de él solo los urgentes", sinHorario && fuera && dentro);
});

await probar("voz: planificar", async () => {
  const productos = [{ producto: "Taza A", linea: "tazas" }, { producto: "Remera A", linea: "remeras" }];
  const h = Number(horaLocal().slice(0, 2));
  Object.assign(CONFIG.voz, { modo: "auto", comando: "x", horario: `${(h + 2) % 24}-${(h + 3) % 24}`, urgenteDias: 0 });
  const fuera = planificar({ productos, calendario: [] }, hoy);
  CONFIG.voz.horario = `${h}-${h}`;
  const dentro = planificar({ productos, calendario: [] }, hoy);
  sinVoz();
  ver("Fuera del horario de la voz solo genera el video de hoy y avisa cuántos esperan", fuera.a_generar.length === 1 && fuera.a_generar[0].fecha === hoy && /esperan el horario de la voz/.test(fuera.resumen), JSON.stringify(fuera.resumen));
  ver("En el horario de la voz genera como siempre", dentro.a_generar.length === CONFIG.maxPorCorrida && !/esperan/.test(dentro.resumen));
});

await probar("voz: frases", async () => {
  const textos = { etiqueta: "Tazas", p1: "Tu café, en la taza justa", p2_titulo: "Taza de cerámica", p2_punto_1: "Capacidad de 350 ml", p2_punto_2: "Pack de 6 unidades", p2_punto_3: "Apta lavavajillas", p3_titulo: "Pedilas hoy", p3_sub: "Todo el catálogo en la web" };
  const linea = LINEAS.tazas;
  const pant = fr.pantallasDelVideo(textos, { linea });
  const f = fr.frasesDePlantilla(textos, pant);
  ver("Sin IA, las frases salen de los textos de las pantallas y pasan el control", f?.length === 3 && fr.controlarFrases(f, pant, { linea }).length === 0 && /WhatsApp/.test(f[2]), JSON.stringify(f));
  const control = (frases) => fr.controlarFrases(frases, pant, { linea });
  ver("Un número que no está en su pantalla no pasa", control(["Tu café en la taza justa.", "Capacidad de 500 ml.", "Pedilas hoy."]).some((x) => x.includes("500")));
  ver("Palabras prohibidas del negocio y de la línea", control(["Llegan desde Córdoba.", "La taza más barata.", "Pedilas hoy."]).filter((x) => /menciona/.test(x)).length === 2);
  ver("Tuteo, exclamaciones, teléfonos y direcciones web", ["Pide la tuya.", "¡Llegaron!", "Llamá al 351 444-5555.", "Mirá marca.com.ar"].every((x) => control(["Tu café.", "Capacidad de 350 ml.", x]).length > 0));
  ver("Una frase demasiado larga para 4 segundos no pasa", control(["Tu café en la taza justa, la de siempre, la que te gusta para cada mañana del año.", "Capacidad de 350 ml.", "Pedilas hoy."]).length > 0);
  CONFIG.estilo = "clasico";
  const pantClasico = fr.pantallasDelVideo(textos, { linea });
  CONFIG.estilo = "cajas";
  ver("En el estilo clásico (sin botón de WhatsApp) la voz no puede nombrar WhatsApp", fr.controlarFrases(["Tu café.", "Capacidad de 350 ml.", "Escribinos por WhatsApp."], pantClasico, { linea }).some((x) => /WhatsApp/.test(x)));
  const caption = "Tazas de 350 ml.\nMirá la web.\n\n#tazas #cafe";
  const con = fr.captionConAviso(caption, true);
  ver(
    "El aviso de IA va en el posteo antes de los hashtags, una sola vez, y sale si el video quedó sin voz",
    con === "Tazas de 350 ml.\nMirá la web.\n🎙️ Voz generada con IA.\n\n#tazas #cafe" && fr.captionConAviso(con, true) === con && fr.captionConAviso(con, false) === caption,
    con,
  );
  estado.geminiRespuestas.push(JSON.stringify({ voz: ["Tu café, en la taza justa.", "Tazas de cerámica de 350 ml.", "Pedilas hoy por WhatsApp."] }));
  const ia = await fr.escribirFrases({ textos, linea, producto: "Taza" });
  const pedidoIa = estado.gemini.at(-1)?.datos?.systemInstruction?.parts?.[0]?.text || "";
  ver("Con IA: las frases las escribe Gemini, con las reglas del negocio", ia.origen === "gemini" && ia.frases?.[1] === "Tazas de cerámica de 350 ml." && pedidoIa.includes("MARCA DE PRUEBA") && pedidoIa.includes("Córdoba") && !/\{[A-Z_]+\}/.test(pedidoIa), JSON.stringify(ia));
  estado.geminiRespuestas.push(JSON.stringify({ voz: ["Uno.", "Capacidad de 900 ml.", "Pedilas."] }), JSON.stringify({ voz: ["Uno.", "Capacidad de 900 ml.", "Pedilas."] }));
  const mal = await fr.escribirFrases({ textos, linea, producto: "Taza" });
  ver("Si la IA falla dos veces el control, las frases salen de las pantallas", mal.origen === "pantallas" && mal.frases?.length === 3 && /no pasaron el control/.test(mal.avisos.join(" ")), JSON.stringify(mal));
});

await probar("voz: dónde entra cada frase", async () => {
  const p = voz.planearVoz([{ ruta: "a", duracion: 3 }, { ruta: "b", duracion: 5 }, { ruta: "c", duracion: 4 }], 1.2);
  ver("Cada frase arranca con su pantalla y la que no entra se acelera un poco", p.ok && p.tramos.map((t) => t.inicio).join() === "0.3,5.3,10.3" && p.tramos[1].tempo > 1.08 && p.tramos[1].tempo < 1.1 && p.tramos[0].tempo === 1, JSON.stringify(p));
  const no = voz.planearVoz([{ ruta: "a", duracion: 6.5 }], 1.2);
  ver("Si habría que acelerarla de más, el video sale sin voz (con el motivo)", !no.ok && /máximo es 20 %/.test(no.motivo), JSON.stringify(no));
});

await probar("voz: navegador", async () => {
  // Un /proc falso como el de una compu de verdad: los hijos de Chrome reescriben su línea de comandos.
  const proc = path.join(TMP, "proc");
  const proceso = async (pid, ppid, exe, cmdline) => {
    const d = path.join(proc, String(pid));
    await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(d, "cmdline"), cmdline);
    await fs.writeFile(path.join(d, "stat"), `${pid} (chrome) S ${ppid} 1 1 0 -1`);
    await fs.symlink(exe, path.join(d, "exe"));
  };
  const CH = "/opt/google/chrome/chrome";
  await proceso(1001, 900, CH, `${CH}\0--restore-last-session\0`);
  await proceso(1002, 1001, CH, `${CH} --type=renderer --lang=es`);
  await proceso(1003, 1002, CH, `${CH} --type=gpu-process`);
  await proceso(1004, 901, "/snap/chromium/2890/usr/lib/chromium-browser/chrome", "/snap/chromium/2890/usr/lib/chromium-browser/chrome\0");
  await proceso(1005, 950, CH, `${CH}\0--headless=new\0--remote-debugging-port=9222\0`);
  await proceso(1006, 960, "/home/u/.cache/puppeteer/chrome-headless-shell/linux-1/chrome-headless-shell", "chrome-headless-shell\0");
  await proceso(1007, 902, `${CH} (deleted)`, `${CH}\0`);
  await proceso(1008, 903, "/usr/bin/firefox", "/usr/bin/firefox\0");
  const todos = voz.procesosChrome(proc);
  const principales = voz.chromesAbiertos(todos).map((p) => p.pid).sort();
  ver("Del navegador solo cuentan los procesos principales (no los hijos, ni los sin ventana, ni HyperFrames)", principales.join() === "1001,1004,1007" && todos.length === 6, JSON.stringify(todos.map((p) => p.pid)));
  Object.assign(CONFIG.voz, { modo: "auto", comando: "x", memoriaMinMb: 10 ** 9, cerrarChrome: true, horario: "" });
  const sinHorario = await voz.prepararMemoria();
  sinVoz();
  ver("Sin VOZ_HORARIO nunca cierra el navegador, aunque falte memoria", !sinHorario.ok && !sinHorario.chromeCerrado && /la voz necesita/.test(sinHorario.motivo), JSON.stringify(sinHorario));
});

await probar("voz: n8n", async () => {
  const destino = path.join(TMP, "flujo-voz.json");
  const r = await correrNode("motor/armar-n8n.mjs", [], { env: { VIDEOS_FLUJO: destino, VOZ_COMANDO: "python3 voz.py", VOZ_HORARIO: "23-5" } });
  const flujo = JSON.parse(await fs.readFile(destino, "utf8"));
  const texto = JSON.stringify(flujo);
  const generar = flujo.nodes.find((n) => n.name === "Motor: generar video");
  ver("Con voz y horario, el flujo también corre en esas horas y le espera 30 min a cada video", r.codigo === 0 && texto.includes("0 23-23,0-5,8-21 * * *") && generar?.parameters?.options?.timeout === 1800000, r.salida);
});

if (!pythonVoz) {
  console.log("⚪ Voz con el comando: salteada (no hay un Python con numpy y num2words; instalá la voz o pasá VOZ_PYTHON_PRUEBAS)");
} else {
  await probar("voz: comando simulado", async () => {
    await fs.mkdir(DIR_VOZ, { recursive: true });
    await fs.writeFile(path.join(DIR_VOZ, "config.json"), JSON.stringify({ motor: "simulada" }));
    Object.assign(process.env, { VOZ_CONFIG: path.join(DIR_VOZ, "config.json"), VOZ_CARPETA_VOCES: path.join(DIR_VOZ, "voces"), VOZ_TURNO: path.join(DIR_VOZ, "turno.lock") });
    // Una "grabación" de 13 s y la voz armada con preparar_voz.py, como lo haría el dueño.
    const grabacion = path.join(DIR_VOZ, "grabacion.wav");
    const armar = spawnSync(pythonVoz, ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(path.join(RAIZ, "voz"))}); import comun; comun.guardar_wav(${JSON.stringify(grabacion)}, comun.murmullo(open(${JSON.stringify(path.join(RAIZ, "voz/texto-para-grabar.txt"))}).read().split("\\n")[-2], 44100, 1) * 0.6, 44100)`], { encoding: "utf8" });
    const sinPermiso = spawnSync(pythonVoz, [path.join(RAIZ, "voz/preparar_voz.py"), grabacion], { encoding: "utf8", env: process.env });
    const preparar = spawnSync(pythonVoz, [path.join(RAIZ, "voz/preparar_voz.py"), grabacion, "--es-mi-voz"], { encoding: "utf8", env: process.env });
    ver("preparar_voz pide confirmar de quién es la voz y después la guarda", armar.status === 0 && sinPermiso.status === 2 && /--es-mi-voz/.test(sinPermiso.stdout) && preparar.status === 0 && existsSync(path.join(DIR_VOZ, "voces/mi-voz/referencia.wav")), armar.stderr + sinPermiso.stdout + preparar.stdout + preparar.stderr);
    conVozSimulada();
    const e = await voz.estadoVoz();
    ver("El estado del comando dice el motor y que está la voz", e.ok && e.motor === "simulada" && e.tieneVoz, JSON.stringify(e));
    const g = await voz.generarVoz({ frases: ["Tu café, en la taza justa.", "Tazas de 350 ml, pack x6.", "Pedilas hoy."], carpeta: path.join(TMP, "trabajos", "voz-prueba") });
    const leido = g.archivos?.[1]?.leido || "";
    ver("El comando deja un audio por frase y los números se leen con palabras", g.ok && g.archivos.length === 3 && g.archivos.every((a) => a.duracion > 0.3 && existsSync(a.ruta)) && /trescientos cincuenta mililitros/.test(leido) && /por seis/.test(leido), JSON.stringify(g));
    process.env.VOZ_SIMULADA_FALLA = "sin memoria de prueba";
    const falla = await voz.generarVoz({ frases: ["Hola.", "Hola.", "Hola."], carpeta: path.join(TMP, "trabajos", "voz-falla") });
    delete process.env.VOZ_SIMULADA_FALLA;
    ver("Si el comando falla, el motor recibe el motivo", !falla.ok && /falla simulada/.test(falla.motivo), JSON.stringify(falla));
    process.env.VOZ_SIMULADA_DEMORA = "30";
    CONFIG.voz.timeoutMin = 0.03;
    const inicio = Date.now();
    const lenta = await voz.generarVoz({ frases: ["Hola.", "Hola.", "Hola."], carpeta: path.join(TMP, "trabajos", "voz-lenta") });
    delete process.env.VOZ_SIMULADA_DEMORA;
    ver("Si tarda más que VOZ_TIMEOUT_MIN, la corta (sale ordenada, sin esperar los 30 s)", !lenta.ok && /tardó más/.test(lenta.motivo) && Date.now() - inicio < 15000, JSON.stringify(lenta));
    CONFIG.voz.nombre = "otra";
    const sinLaVoz = await voz.generarVoz({ frases: ["Hola.", "Hola.", "Hola."], carpeta: path.join(TMP, "trabajos", "voz-otra") });
    sinVoz();
    ver("Si no existe la voz, dice cómo cargarla", !sinLaVoz.ok && /voz-preparar/.test(sinLaVoz.motivo), JSON.stringify(sinLaVoz));
    const chequeo = await correrNode("motor/chequeo.mjs", [], { env: { VOZ_COMANDO: COMANDO_VOZ, VOZ_TOPE_MEMORIA: "no", VOZ_MEMORIA_MIN_MB: "1" } });
    ver("npm run chequeo revisa la voz", /✅ Voz en off: VoxCPM2 simulada en cpu, con la voz "mi-voz"/.test(chequeo.salida) && /✅ Frases de voz sin IA/.test(chequeo.salida), chequeo.salida);
  });

  await probar("voz: publicar con la marca de IA", async () => {
    const conIa = await publicarReel({ ruta: ARCHIVO_VIDEO, caption: "Con voz", conIa: true });
    const contenedor = estado.graph.filter((x) => x.ruta === "/ig1/media" && x.metodo === "POST").at(-1)?.form || {};
    ver("Instagram: el contenedor lleva is_ai_generated", conIa.ok && contenedor.is_ai_generated === "true" && !conIa.sinMarcaIa);
    estado.rechazarIa = true;
    const rechazo = await publicarReel({ ruta: ARCHIVO_VIDEO, caption: "Con voz", conIa: true });
    const antes = estado.buffer.length;
    const redes = await mandarARedes({ producto: "Taza", fecha: hoy, caption: "Texto #a", gancho: "Tu café", urlInstagram: `${BASE}/video.mp4`, ruta: ARCHIVO_VIDEO, conIa: true });
    estado.rechazarIa = false;
    const creados = estado.buffer.slice(antes).filter((x) => /createPost/.test(x.query)).map((x) => x.variables.input);
    ver("Si una red no acepta la marca, publica igual sin ella y lo anota", rechazo.ok && rechazo.sinMarcaIa && redes.ok && redes.redes.every((x) => x.ok && x.sinMarcaIa), JSON.stringify({ rechazo, redes }));
    ver("Buffer: primero manda la marca a TikTok y a YouTube", creados.some((x) => x.metadata?.tiktok?.isAiGenerated) && creados.some((x) => x.metadata?.youtube?.isAiGenerated));
  });
}

// ---------- 13. Render con HyperFrames (opcional) ----------
if (conRender) {
  for (const estilo of ["cajas", "clasico"]) {
    await probar(`render ${estilo}`, async () => {
      await escribirNegocio({ estilo });
      refrescarNegocio();
      const antes = estado.telegram.filter((x) => x.metodo === "sendVideo").length;
      const fila = await generar({ fecha: sumarDias(hoy, estilo === "cajas" ? 20 : 21), linea: "tazas", producto: "Taza de cerámica 350 ml x6 unid", link: `${BASE}/producto/woo`, mostrar_precio: true, prueba: true });
      const ruta = path.join(RUTAS.salida, fila.archivo || "x");
      const info = existsSync(ruta) ? await new Promise((resolve) => {
        const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", ruta]);
        let s = "";
        p.stdout.on("data", (d) => (s += d));
        p.on("close", () => resolve(JSON.parse(s || "{}")));
      }) : {};
      const v = (info.streams || []).find((x) => x.width) || {};
      ver(`Render ${estilo}: video de 15 s en 1080×1920, mandado a Telegram`, fila.estado === "esperando_ok" && Math.abs(Number(info.format?.duration) - 15) < 0.3 && v.width === 1080 && v.height === 1920 && estado.telegram.filter((x) => x.metodo === "sendVideo").length === antes + 1, JSON.stringify(fila));
      if (fila.archivo) console.log(`   video: ${ruta}`);
    });
  }
}

if (conRender && pythonVoz) {
  await probar("render con voz", async () => {
    await escribirNegocio({ estilo: "cajas" });
    refrescarNegocio();
    conVozSimulada();
    const fila = await generar({ fecha: sumarDias(hoy, 22), linea: "tazas", producto: "Taza de cerámica 350 ml x6 unid", link: `${BASE}/producto/woo`, mostrar_precio: false, prueba: true });
    sinVoz();
    const ruta = path.join(RUTAS.salida, fila.archivo || "x");
    const datos = existsSync(ruta)
      ? spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:format_tags=comment:stream=codec_type", "-of", "json", ruta], { encoding: "utf8" })
      : { stdout: "{}" };
    const info = JSON.parse(datos.stdout || "{}");
    const volumen = existsSync(ruta) ? spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", ruta, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr : "";
    const lufs = Number((volumen.match(/I:\s+(-?[\d.]+) LUFS/g) || []).at(-1)?.match(/-?[\d.]+/)?.[0]);
    const caption = existsSync(ruta) ? await fs.readFile(ruta.replace(/\.mp4$/, ".txt"), "utf8") : "";
    // El servidor falso guarda el formulario como latin1 (tiene el video adentro): el texto se vuelve a leer como UTF-8.
    const mensaje = Buffer.from(estado.telegram.filter((x) => x.metodo === "sendVideo").at(-1)?.datos?.multipart || "", "latin1").toString("utf8");
    ver(
      "Render con voz: el video lleva la voz, el aviso de IA en el archivo y el posteo, y Telegram muestra lo que dice",
      fila.estado === "esperando_ok" && (info.streams || []).some((x) => x.codec_type === "audio") && /Voz generada con IA/.test(info.format?.tags?.comment || "") &&
        caption.includes("🎙️ Voz generada con IA.") && mensaje.includes("🎙️ Voz:") && /voz/i.test(fila.nota || ""),
      JSON.stringify({ nota: fila.nota, tags: info.format?.tags, telegram: mensaje.includes("🎙️ Voz:") }),
    );
    ver(`Render con voz: volumen parejo en -16 LUFS (${lufs})`, Math.abs(lufs + 16) <= 1.5);
    if (fila.archivo) console.log(`   video: ${ruta}`);
  });
}

// ---------- Fin ----------
servidor.close();
console.log(`\n${bien}/${bien + fallas.length} pruebas bien${fallas.length ? `\nFallaron: ${fallas.join(" · ")}` : ""}`);
if (!conservar) await fs.rm(TMP, { recursive: true, force: true });
else console.log(`Carpeta de las pruebas: ${TMP}`);
process.exit(fallas.length ? 1 : 0);
