// Textos SIN IA: arma los textos de cada video con las frases de config/textos-plantillas.json
// y con los datos del producto (medida, cantidad, rasgos). No usa claves ni internet: es gratis.
// Las frases rotan: cada vez que le toca a una línea usa la siguiente, y al rehacer cambia de frase.
import fs from "node:fs";
import { CONFIG, RUTAS, lineas } from "./config.mjs";

// Largos máximos (los mismos que se le piden a la IA en prompts/textos.md).
export const LARGOS = { etiqueta: 26, p1: 40, p2_titulo: 28, punto: 30, p3_titulo: 32, p3_sub: 44 };

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => sinTildes(s).toLowerCase().replace(/\s+/g, " ").trim();

// Palabras que no pueden quedar al final de un texto recortado ("…con", "…de").
const COLGANTES = new Set(["con", "de", "del", "para", "y", "e", "o", "u", "x", "a", "al", "en", "el", "la", "los", "las", "por", "sin", "–", "-"]);

// Recorta en un límite de palabra y saca conectores sueltos al final: nunca deja una frase cortada a la mitad.
export function acortar(texto, max) {
  const t = String(texto || "").replace(/\s{2,}/g, " ").trim();
  if (t.length <= max) return t;
  const palabras = t.slice(0, max + 1).split(" ");
  if (palabras.length > 1) palabras.pop();
  while (palabras.length > 1 && COLGANTES.has(palabras.at(-1).toLowerCase())) palabras.pop();
  return palabras.join(" ").replace(/[\s,;:.–-]+$/, "");
}

// Nombre del producto sin la cantidad del pack ni aclaraciones entre paréntesis.
export function nombreCorto(producto) {
  let n = String(producto || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+x\s*\d+\s*(unid(ades)?\.?|u\.?)(?=\s|$)/gi, " ")
    .replace(/^\d+\s+(?=bolsas?\b)/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const antesDelGuion = n.split(/\s[–-]\s/)[0].trim();
  if (antesDelGuion.split(" ").length >= 2) n = antesDelGuion;
  return n;
}

// "45x40x10" → "45 x 40 x 10". La tercera cifra solo cuenta si va pegada ("15×25 x100 unid": 100 es la cantidad).
export function medidaDe(texto) {
  const m = String(texto || "").match(/(\d+)\s*[x×]\s*(\d+)(?:[x×](\d+))?/i);
  if (!m) return "";
  return [m[1], m[2], m[3]].filter(Boolean).join(" x ");
}

// Cantidad del pack o del rollo: "x100 unid", "100 Bolsas", "X 500 Metros", "(2)".
export function cantidadDe(texto) {
  const t = String(texto || "");
  for (const re of [/x\s*(\d+)\s*unid/i, /^(\d+)\s+bolsas?\b/i, /x\s*(\d+)\s*metros/i, /\((\d+)\)/]) {
    const m = t.match(re);
    if (m) return m[1];
  }
  return "";
}

let cache = null;
let cacheFecha = 0;

// Lee las frases (y las vuelve a leer si alguien editó el archivo, sin reiniciar el motor).
export function cargarPlantillas() {
  const fecha = fs.statSync(RUTAS.plantillasTextos).mtimeMs;
  if (!cache || fecha !== cacheFecha) {
    cache = JSON.parse(fs.readFileSync(RUTAS.plantillasTextos, "utf8"));
    cacheFecha = fecha;
  }
  return cache;
}

// Completa los {marcadores}. Si falta algún dato, devuelve null (esa frase se saltea).
function llenar(plantilla, valores) {
  if (typeof plantilla !== "string" || !plantilla.trim()) return null;
  let falta = false;
  const out = plantilla.replace(/\{(\w+)\}/g, (_, k) => {
    const v = valores[k];
    if (v === undefined || v === null || String(v).trim() === "") {
      falta = true;
      return "";
    }
    return String(v);
  });
  return falta ? null : out.replace(/[ \t]{2,}/g, " ").trim();
}

const lista = (...fuentes) => {
  for (const f of fuentes) {
    if (Array.isArray(f) && f.length) return f;
    if (typeof f === "string" && f.trim()) return [f];
  }
  return [];
};

// Elige la frase que toca (n = vez número n que sale esta línea). "evitar": frases que no se pueden repetir.
function elegir(frases, n, desfase, evitar = []) {
  if (!frases.length) return "";
  const prohibidas = new Set(evitar.filter(Boolean).map(norm));
  for (let k = 0; k < frases.length; k++) {
    const f = frases[(n + desfase + k) % frases.length];
    if (!prohibidas.has(norm(f))) return f;
  }
  return frases[(n + desfase) % frases.length];
}

// Palabras de 5 letras o más (para no repetir la misma idea en el cierre y su subtítulo).
const palabrasFuertes = (s) => new Set(norm(s).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 5));
const compartenPalabra = (a, b) => {
  const pa = palabrasFuertes(a);
  return [...palabrasFuertes(b)].some((p) => pa.has(p));
};

const conPunto = (s) => (/[.?!…]$/.test(s) ? s : `${s}.`);
const minuscula = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const mayuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "a" · "a y b" · "a e ideal" (se usa "e" antes de i/hi).
function unir(partes) {
  if (partes.length <= 1) return partes[0] || "";
  const ultimo = partes.at(-1);
  const y = /^h?i(?![aeiouáéíóú])/i.test(ultimo) ? "e" : "y";
  return `${partes.slice(0, -1).join(", ")} ${y} ${ultimo}`;
}

// Vez número n que sale la línea: los días se reparten entre las líneas de la rotación
// (la de negocio.json o, si no hay, las líneas de config/lineas.json).
function vezDeLinea(fecha) {
  const [a, m, d] = String(fecha || "").split("-").map(Number);
  const dias = Number.isFinite(a) && m && d ? Math.floor(Date.UTC(a, m - 1, d) / 86400000) : 0;
  const cuantas = CONFIG.rotacion.length || Object.keys(lineas()).filter((k) => k !== "default" && !k.startsWith("_")).length;
  return Math.floor(dias / Math.max(1, cuantas));
}

/**
 * datos: { fecha, producto, lineaClave, linea, detalles, precio, mostrarPrecio, anteriores }
 * Devuelve los textos con el mismo formato que la planilla (p2_punto_1..3, caption con hashtags).
 */
export function textosDePlantilla(datos) {
  const cfg = cargarPlantillas();
  const comunes = cfg.comunes || {};
  const lin = (cfg.lineas || {})[datos.lineaClave] || {};
  const producto = String(datos.producto || "");
  const base = norm(producto);
  const prod = (cfg.productos || []).find((p) => p.si && new RegExp(p.si, "i").test(base)) || null;
  const anteriores = datos.anteriores || null;

  const medida = medidaDe(producto);
  const cantidad = cantidadDe(producto);
  const valores = { medida, cantidad, web: CONFIG.web, marca: CONFIG.marca, nombre_corto: nombreCorto(producto) };
  const frases = (fuente, max) => fuente.map((f) => llenar(f, valores)).filter((f) => f && f.length <= max);

  // Al rehacer, se corre una posición y además se evitan las frases del video anterior.
  const n = vezDeLinea(datos.fecha) + (anteriores ? 1 : 0);

  // Pantalla 1
  const etiqueta = acortar(prod?.etiqueta || datos.linea?.etiqueta || "", LARGOS.etiqueta);
  const ganchos = frases(lista(prod?.ganchos, lin.ganchos), LARGOS.p1);
  const p1 = elegir(ganchos, n, 0, [anteriores?.p1]) || acortar(valores.nombre_corto, LARGOS.p1);

  // Pantalla 2: título y 3 puntos (primero los datos concretos, después los de uso general)
  const titulos = frases(lista(prod?.titulo, lin.titulos, comunes.titulos), LARGOS.p2_titulo);
  const p2_titulo = elegir(titulos, n, 1, [p1]) || acortar(valores.nombre_corto, LARGOS.p2_titulo);

  const concretos = [];
  const sumar = (texto, tipo) => {
    if (texto && texto.length <= LARGOS.punto && !concretos.some((c) => norm(c.texto) === norm(texto))) concretos.push({ texto, tipo });
  };
  if (datos.mostrarPrecio && datos.precio) sumar(`Precio: ${String(datos.precio).trim()}`, "precio");
  if (medida && lin.punto_medida) sumar(llenar(lin.punto_medida, valores), "medida");
  if (cantidad && lin.punto_cantidad) sumar(llenar(lin.punto_cantidad, valores), "cantidad");
  for (const p of prod?.puntos || []) sumar(llenar(p, valores), "producto");
  const textoRasgos = norm(`${producto} ${datos.detalles || ""}`);
  for (const r of cfg.rasgos || []) {
    try {
      if (r.si && new RegExp(r.si, "i").test(textoRasgos)) sumar(r.punto, "rasgo");
    } catch {
      // una expresión mal escrita en el archivo no frena el video
    }
  }
  // Si el título ya dice la medida, el punto "Medida …" sobra: queda lugar para otro dato.
  const tituloConMedida = Boolean(medida) && norm(p2_titulo).includes(norm(medida));
  let puntos = concretos.filter((c) => !(tituloConMedida && c.tipo === "medida") && norm(c.texto) !== norm(p2_titulo));
  if (puntos.length > 3) {
    // Más de 3 datos: el primero queda fijo y los demás van rotando.
    const resto = puntos.slice(1);
    const inicio = n % resto.length;
    puntos = [puntos[0], ...[0, 1].map((k) => resto[(inicio + k) % resto.length])];
  }
  const extras = frases(lista(lin.puntos_extra, comunes.puntos_extra), LARGOS.punto);
  for (let k = 0; puntos.length < 3 && k < extras.length; k++) {
    const e = extras[(n + k) % extras.length];
    if (!puntos.some((p) => norm(p.texto) === norm(e))) puntos.push({ texto: e, tipo: "extra" });
  }

  // Pantalla 3
  const cierres = frases(lista(prod?.cierres, lin.cierres, comunes.cierres), LARGOS.p3_titulo);
  const p3_titulo = elegir(cierres, n, 2, [anteriores?.p3_titulo]) || "Hacé tu pedido hoy";
  const subs = frases(lista(lin.subs, comunes.subs), LARGOS.p3_sub).filter((s) => !compartenPalabra(s, p3_titulo));
  const p3_sub = elegir(subs, n, 3, [anteriores?.p3_sub]) || "Todo el catálogo en la web";

  // Texto del posteo
  const nombre = llenar(prod?.nombre, valores) || llenar(lin.nombre, valores) || valores.nombre_corto;
  const detalles = puntos
    .filter((p) => p.tipo !== "precio" && !(p.tipo === "medida" && medida && nombre.includes(medida)))
    .slice(0, 2)
    .map((p) => minuscula(p.texto));
  const valoresCaption = {
    ...valores,
    p1: conPunto(p1),
    nombre,
    detalles: unir(detalles),
    Detalles: mayuscula(unir(detalles)),
  };
  const captions = lista(prod?.captions, lin.captions, comunes.captions)
    .map((c) => llenar(c, valoresCaption))
    .filter(Boolean);
  const anteriorSinHashtags = String(anteriores?.caption || "").split("\n\n#")[0];
  let caption =
    elegir(captions, n, 1, [anteriorSinHashtags]) ||
    llenar(comunes.caption_minima, valoresCaption) ||
    `${nombre}.\nMirá todo en ${CONFIG.web || "la web"}`;
  if (datos.mostrarPrecio && datos.precio) {
    const lineas = caption.split("\n");
    lineas.splice(Math.max(1, lineas.length - 1), 0, `Precio: ${String(datos.precio).trim()}.`);
    caption = lineas.join("\n");
  }
  const hashtags = (datos.linea?.hashtags || []).slice(0, 6).join(" ");

  return {
    etiqueta,
    p1,
    p2_titulo,
    p2_punto_1: puntos[0]?.texto || "",
    p2_punto_2: puntos[1]?.texto || "",
    p2_punto_3: puntos[2]?.texto || "",
    p3_titulo,
    p3_sub,
    caption: hashtags ? `${caption}\n\n${hashtags}` : caption,
  };
}
