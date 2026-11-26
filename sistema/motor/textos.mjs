// Escribe los textos de cada video y los controla antes de usarlos.
//   · Con GEMINI_API_KEY en el .env: los escribe Gemini (plan gratis de la API de Google).
//   · Sin clave (o si la IA falla): salen de las plantillas de config/textos-plantillas.json (gratis, sin internet).
//   · Claude sigue disponible si algún día se carga ANTHROPIC_API_KEY.
//   TEXTOS_MODO=auto (por defecto) | gemini | claude | plantillas
import fs from "node:fs";
import path from "node:path";
import { CONFIG, RUTAS, datosDeLinea } from "./config.mjs";
import { LARGOS, acortar, nombreCorto, textosDePlantilla } from "./plantillas.mjs";
import { esperar, hashTexto, log, sinEmojis, traer } from "./util.mjs";

export { acortar, nombreCorto };

const ANGULOS = [
  "el beneficio principal para el negocio del cliente",
  "el problema que resuelve y cómo lo resuelve",
  "una pregunta directa al cliente",
  "un dato concreto del producto (medida, cantidad o material)",
  "una ocasión o un uso concreto del producto",
];

// El control acepta un poco más que lo que se le pide a la IA (la plantilla achica la letra si hace falta).
const LIMITES = { etiqueta: 26, p1: 48, p2_titulo: 30, punto: 32, p3_titulo: 36, p3_sub: 46 };

export const CAMPOS = ["etiqueta", "p1", "p2_titulo", "p2_punto_1", "p2_punto_2", "p2_punto_3", "p3_titulo", "p3_sub", "caption"];

export function textosCompletos(t) {
  return Boolean(t && t.p1 && t.p2_titulo && t.p3_titulo && t.caption);
}

// Reglas propias del negocio (config/negocio.json): texto libre y palabras que nunca pueden aparecer.
// También van en el pedido de las frases de la voz (frases.mjs).
export function reglasExtra() {
  const partes = [];
  if (CONFIG.reglasTextos) partes.push(CONFIG.reglasTextos);
  if (CONFIG.palabrasProhibidas.length) partes.push(`Nunca uses estas palabras: ${CONFIG.palabrasProhibidas.join(", ")}.`);
  return partes.length ? `\nReglas propias de ${CONFIG.marca || "la marca"}:\n${partes.map((p) => `- ${p}`).join("\n")}\n` : "";
}

function promptSistema() {
  const archivo = path.join(RUTAS.prompts, "textos.md");
  return fs
    .readFileSync(archivo, "utf8")
    .replaceAll("{MARCA}", CONFIG.marca || "la marca")
    .replaceAll("{WEB}", CONFIG.web || "la web")
    .replaceAll("{QUE_VENDE}", CONFIG.queVende || "un negocio argentino que vende por internet")
    .replaceAll("{PUBLICO}", CONFIG.publico || "clientes de Argentina que compran por internet")
    .replaceAll("{REGLAS_EXTRA}", reglasExtra());
}

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ¿El texto menciona esa palabra o frase (sin importar tildes ni mayúsculas)? */
export function menciona(texto, palabra) {
  const p = sinTildes(palabra).trim();
  if (!p) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(p)}(?![\\p{L}\\p{N}])`, "iu").test(sinTildes(texto));
}

// Pasa la respuesta de la IA al formato de la planilla (p2_punto_1..3, caption con hashtags).
export function aplanar(r, linea) {
  const puntos = Array.isArray(r.p2_puntos) ? r.p2_puntos : [r.p2_punto_1, r.p2_punto_2, r.p2_punto_3];
  const hashtags = (Array.isArray(r.hashtags) ? r.hashtags : String(r.hashtags || "").split(/\s+/))
    .map((h) => String(h || "").trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))
    .slice(0, 6);
  let caption = String(r.caption || "").trim();
  if (hashtags.length && !caption.includes("#")) caption = `${caption}\n\n${hashtags.join(" ")}`;
  const limpio = (x) => sinEmojis(String(x ?? "")).trim();
  return {
    etiqueta: limpio(r.etiqueta || linea.etiqueta || ""),
    p1: limpio(r.p1),
    p2_titulo: limpio(r.p2_titulo),
    p2_punto_1: limpio(puntos[0] || ""),
    p2_punto_2: limpio(puntos[1] || ""),
    p2_punto_3: limpio(puntos[2] || ""),
    p3_titulo: limpio(r.p3_titulo),
    p3_sub: limpio(r.p3_sub),
    caption: caption.slice(0, 2000),
  };
}

// Formas de "tú" que no se pueden confundir con otra cosa (el sistema escribe con voseo).
export const TUTEO = /\b(tienes|puedes|quieres|necesitas|eres|sabes|vendes|buscas|pides|elige|pide|haz|descubre|aprovecha|encuentra|consigue)\b/i;

// Devuelve la lista de problemas (vacía si está todo bien).
export function controlar(t, { mostrarPrecio, lineaClave }) {
  const problemas = [];
  for (const c of ["p1", "p2_titulo", "p3_titulo", "caption"]) if (!t[c]) problemas.push(`falta ${c}`);
  const largo = (campo, max, valor) => {
    if (valor && valor.length > max) problemas.push(`${campo} es demasiado largo (${valor.length} caracteres, máximo ${max})`);
  };
  largo("etiqueta", LIMITES.etiqueta, t.etiqueta);
  largo("p1", LIMITES.p1, t.p1);
  largo("p2_titulo", LIMITES.p2_titulo, t.p2_titulo);
  [1, 2, 3].forEach((i) => largo(`punto ${i}`, LIMITES.punto, t[`p2_punto_${i}`]));
  largo("p3_titulo", LIMITES.p3_titulo, t.p3_titulo);
  largo("p3_sub", LIMITES.p3_sub, t.p3_sub);
  const todo = CAMPOS.map((c) => t[c] || "").join("\n");
  const pantallas = CAMPOS.filter((c) => c !== "caption").map((c) => t[c] || "").join("\n");
  // Palabras prohibidas: las del negocio (negocio.json) y las de la línea (lineas.json).
  const prohibidas = [...CONFIG.palabrasProhibidas, ...(datosDeLinea(lineaClave).palabras_prohibidas || [])];
  for (const p of new Set(prohibidas)) if (menciona(todo, p)) problemas.push(`menciona "${p}" (no se debe)`);
  if (!mostrarPrecio && /\$\s?\d/.test(todo)) problemas.push("menciona un precio y mostrar_precio es NO");
  if (/(\+?54\s?9?\s?)?\b\d{3,4}[\s-]?\d{3}[\s-]?\d{4}\b/.test(todo)) problemas.push("tiene un teléfono");
  if (/[!¡]/.test(pantallas)) problemas.push("las pantallas no llevan signos de exclamación");
  if (TUTEO.test(todo) || /(^|[^\p{L}])tú(?!\p{L})/iu.test(todo)) problemas.push("usa tú en lugar de vos (tiene que ser voseo: tenés, podés, pedí, elegí)");
  return problemas;
}

function soloLargo(problemas) {
  return problemas.every((p) => p.includes("demasiado largo"));
}

// Último recurso, si las plantillas se rompieran: textos mínimos con el nombre del producto.
export function textosDeRespaldo({ producto, linea }) {
  const nombre = nombreCorto(producto);
  return {
    etiqueta: acortar(linea?.etiqueta || "", LARGOS.etiqueta),
    p1: acortar(linea?.gancho_respaldo || nombre, LARGOS.p1),
    p2_titulo: linea?.gancho_respaldo ? acortar(nombre, LARGOS.p2_titulo) : "Lo que tenés que saber",
    p2_punto_1: "Compra simple en la web",
    p2_punto_2: "",
    p2_punto_3: "",
    p3_titulo: acortar(linea?.cierre_respaldo || "Hacé tu pedido hoy", LARGOS.p3_titulo),
    p3_sub: "Todo el catálogo en la web",
    caption: `${nombre}. Mirá todo en ${CONFIG.web || "la web"}\n\n${(linea?.hashtags || []).slice(0, 5).join(" ")}`.trim(),
  };
}

export function extraerJson(texto) {
  const a = texto.indexOf("{");
  const b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("la IA no devolvió un JSON");
  return JSON.parse(texto.slice(a, b + 1));
}

// ---------- Claude (opcional, pago) ----------
async function llamarClaude(system, mensajes) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    const r = await traer(
      `${CONFIG.claude.base}/v1/messages`,
      {
        method: "POST",
        headers: { "x-api-key": CONFIG.claude.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: CONFIG.claude.modelo, max_tokens: 1200, system, messages: mensajes }),
      },
      120000,
    );
    const datos = await r.json().catch(() => ({}));
    if (r.ok) return { texto: (datos.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), modelo: CONFIG.claude.modelo };
    ultimo = new Error(`la API de Claude respondió ${r.status}: ${datos?.error?.message || "sin detalle"}`);
    if (![429, 500, 502, 503, 529].includes(r.status)) break;
    await esperar(5000 * intento);
  }
  throw ultimo;
}

// ---------- Gemini (plan gratis de la API de Google) ----------
// Si el modelo configurado no existe o no tiene cupo gratis, prueba estos en orden.
export const GEMINI_RESPALDO = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
let modeloGeminiQueAnda = "";

function errorDeModelo(estado, mensaje) {
  if (estado === 404) return true;
  if (estado === 400 && /model/i.test(mensaje) && /not (found|supported)|unsupported|is not available|does not exist/i.test(mensaje)) return true;
  if (estado === 403 && /model/i.test(mensaje)) return true;
  // Sin cupo gratis para ese modelo ("limit: 0"): conviene probar otro.
  if (estado === 429 && /limit:\s*0\b/i.test(mensaje)) return true;
  return false;
}

async function pedirGemini(modelo, system, mensajes) {
  const url = `${CONFIG.gemini.base}/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const cuerpo = {
    systemInstruction: { parts: [{ text: system }] },
    contents: mensajes.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
  };
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    const r = await traer(
      url,
      { method: "POST", headers: { "x-goog-api-key": CONFIG.gemini.key, "content-type": "application/json" }, body: JSON.stringify(cuerpo) },
      120000,
    );
    const datos = await r.json().catch(() => ({}));
    if (r.ok) {
      if (datos.promptFeedback?.blockReason) throw new Error(`Gemini rechazó el pedido (${datos.promptFeedback.blockReason})`);
      const c = (datos.candidates || [])[0];
      const texto = (c?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (c?.finishReason === "MAX_TOKENS") throw new Error("Gemini cortó la respuesta (MAX_TOKENS)");
      if (!texto.trim()) throw new Error(`Gemini respondió vacío (${c?.finishReason || "sin motivo"})`);
      return texto;
    }
    const mensaje = String(datos?.error?.message || "sin detalle");
    ultimo = new Error(`Gemini (${modelo}) respondió ${r.status}: ${mensaje.slice(0, 300)}`);
    if (errorDeModelo(r.status, mensaje)) {
      ultimo.otroModelo = true;
      throw ultimo;
    }
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
    await esperar((r.status === 429 ? 20000 : 5000) * intento);
  }
  throw ultimo;
}

async function llamarGemini(system, mensajes) {
  const modelos = [...new Set([modeloGeminiQueAnda, CONFIG.gemini.modelo, ...GEMINI_RESPALDO].filter(Boolean))];
  let ultimo;
  for (const modelo of modelos) {
    try {
      const texto = await pedirGemini(modelo, system, mensajes);
      if (modelo !== modeloGeminiQueAnda && modelo !== CONFIG.gemini.modelo) {
        log(`Gemini: el modelo ${CONFIG.gemini.modelo} no anduvo; uso ${modelo}. Conviene poner GEMINI_MODELO=${modelo} en el .env.`);
      }
      modeloGeminiQueAnda = modelo;
      return { texto, modelo };
    } catch (e) {
      ultimo = e;
      if (!e.otroModelo) break;
    }
  }
  throw ultimo;
}

const PROVEEDORES = {
  gemini: { nombre: "Gemini", configurado: () => Boolean(CONFIG.gemini.key), llamar: llamarGemini },
  claude: { nombre: "Claude", configurado: () => Boolean(CONFIG.claude.key), llamar: llamarClaude },
};

/** Quién escribe los textos con la configuración actual: "gemini", "claude" o "plantillas". */
export function modoTextos() {
  const m = CONFIG.textos.modo;
  if (m === "plantillas") return "plantillas";
  if (PROVEEDORES[m]) return PROVEEDORES[m].configurado() ? m : "plantillas";
  if (PROVEEDORES.gemini.configurado()) return "gemini";
  if (PROVEEDORES.claude.configurado()) return "claude";
  return "plantillas";
}

/** Le pide un texto a la IA configurada (Gemini o Claude). Lo usan también las frases de la voz. */
export async function llamarIA(system, mensajes) {
  const modo = modoTextos();
  if (!PROVEEDORES[modo]) throw new Error("no hay IA configurada");
  return PROVEEDORES[modo].llamar(system, mensajes);
}

export function nombreIA() {
  return PROVEEDORES[modoTextos()]?.nombre || "Plantillas";
}

/** Para el chequeo: le pide a la IA configurada una respuesta mínima. */
export async function probarIA() {
  const modo = modoTextos();
  if (modo === "plantillas") return { modo };
  const r = await PROVEEDORES[modo].llamar('Respondé solo con este JSON: {"listo": true}', [{ role: "user", content: "Probando." }]);
  return { modo, modelo: r.modelo, respuesta: r.texto.trim().slice(0, 80) };
}

function desdePlantillas(datos, avisos) {
  const ctx = { mostrarPrecio: datos.mostrarPrecio, lineaClave: datos.lineaClave };
  try {
    const textos = textosDePlantilla(datos);
    const problemas = controlar(textos, ctx);
    if (!problemas.length) return { textos, avisos, origen: "plantillas" };
    avisos.push(`Las plantillas armaron textos con problemas (${problemas.join("; ")}); revisá config/textos-plantillas.json.`);
  } catch (e) {
    avisos.push(`No pude usar las plantillas (${e.message}); revisá config/textos-plantillas.json.`);
  }
  return { textos: textosDeRespaldo(datos), avisos, origen: "respaldo" };
}

/**
 * datos: { fecha, producto, lineaClave, linea, informacion, detalles, precio, mostrarPrecio, anteriores }
 * Devuelve { textos, avisos, origen }.
 */
export async function escribirTextos(datos) {
  const avisos = [];
  const modo = modoTextos();
  const pedidoForzado = PROVEEDORES[CONFIG.textos.modo];
  if (pedidoForzado && modo === "plantillas") {
    avisos.push(`TEXTOS_MODO=${CONFIG.textos.modo} pero falta su clave en el .env; usé las plantillas.`);
  }
  if (modo === "plantillas") return desdePlantillas(datos, avisos);

  const proveedor = PROVEEDORES[modo];
  const ctx = { mostrarPrecio: datos.mostrarPrecio, lineaClave: datos.lineaClave };
  const semilla = hashTexto(`${datos.fecha}|${datos.producto}|${datos.anteriores ? "rehacer" : ""}`);
  const angulo = ANGULOS[semilla % ANGULOS.length];
  const pedido = {
    producto: datos.producto,
    linea: datos.linea.nombre || datos.lineaClave,
    etiqueta_sugerida: datos.linea.etiqueta || "",
    reglas_de_la_linea: datos.linea.reglas || "",
    informacion_del_producto: datos.informacion || "(solo el nombre)",
    precio: datos.precio || "",
    mostrar_precio: datos.mostrarPrecio ? "SI" : "NO",
    angulo,
  };
  if (datos.anteriores && textosCompletos(datos.anteriores)) {
    pedido.textos_anteriores_no_repetir = datos.anteriores;
    pedido.pedido_especial = "Hacé una versión claramente distinta a los textos anteriores (otro gancho y otro cierre).";
  }
  const system = promptSistema();
  const mensajes = [{ role: "user", content: JSON.stringify(pedido, null, 2) }];
  let ultimoTextos = null;
  let ultimosProblemas = [];
  for (let intento = 1; intento <= 2; intento++) {
    let respuesta;
    try {
      respuesta = (await proveedor.llamar(system, mensajes)).texto;
    } catch (e) {
      avisos.push(`${proveedor.nombre} no respondió (${e.message}); usé las plantillas.`);
      return desdePlantillas(datos, avisos);
    }
    let crudo;
    try {
      crudo = extraerJson(respuesta);
    } catch (e) {
      ultimosProblemas = [e.message];
      mensajes.push({ role: "assistant", content: respuesta }, { role: "user", content: "Respondé solo con el objeto JSON pedido." });
      continue;
    }
    const textos = aplanar(crudo, datos.linea);
    const problemas = controlar(textos, ctx);
    if (!problemas.length) return { textos, avisos, origen: modo };
    ultimoTextos = textos;
    ultimosProblemas = problemas;
    mensajes.push(
      { role: "assistant", content: respuesta },
      { role: "user", content: `Corregí estos problemas y devolvé el JSON completo de nuevo: ${problemas.join("; ")}.` },
    );
  }
  if (ultimoTextos && soloLargo(ultimosProblemas)) {
    avisos.push(`Textos algo largos (${ultimosProblemas.join("; ")}); la plantilla achica la letra.`);
    return { textos: ultimoTextos, avisos, origen: modo };
  }
  avisos.push(`Los textos de ${proveedor.nombre} no pasaron el control (${ultimosProblemas.join("; ")}); usé las plantillas.`);
  return desdePlantillas(datos, avisos);
}
