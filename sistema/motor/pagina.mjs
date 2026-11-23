// Lee la página del producto en la web para sacar título, descripción, precio y fotos.
// Entiende WooCommerce y, en cualquier tienda, los datos estándar del producto (schema.org en JSON-LD,
// que publican Tiendanube, Shopify, WooCommerce con Yoast y la mayoría) y las etiquetas og: de redes.
import { formatoPesos } from "./precio.mjs";
import { traer } from "./util.mjs";

const AGENTE = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export function decodificar(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export function textoPlano(html) {
  return decodificar(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h\d|div|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n[\s\n]*/g, "\n")
    .trim();
}

// Devuelve el HTML de un <div> completo (con sus divs internos) que empieza en "desde".
function divCompleto(html, desde) {
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = desde;
  let nivel = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase() === "</div>") {
      nivel--;
      if (nivel === 0) return html.slice(desde, m.index + 6);
    } else {
      nivel++;
    }
  }
  return html.slice(desde, desde + 5000);
}

function bloquePorMarca(html, regex) {
  const m = regex.exec(html);
  if (!m) return "";
  const inicio = html.lastIndexOf("<div", m.index + m[0].length);
  return inicio >= 0 ? divCompleto(html, inicio) : "";
}

function meta(html, nombre) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${nombre}["'][^>]*>`, "i");
  const tag = (html.match(re) || [])[0] || "";
  return decodificar((tag.match(/content=["']([^"']*)["']/i) || [])[1] || "");
}

// ---------- Datos estándar del producto (schema.org en JSON-LD) ----------

const lista = (x) => (Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]);

export function productoJsonLd(html) {
  for (const m of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let datos;
    try {
      datos = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const pila = [datos];
    while (pila.length) {
      const x = pila.shift();
      if (!x || typeof x !== "object") continue;
      if (Array.isArray(x)) {
        pila.push(...x);
        continue;
      }
      if (x["@graph"]) pila.push(...lista(x["@graph"]));
      if (lista(x["@type"]).some((t) => /^(Product|ProductGroup|IndividualProduct)$/i.test(String(t)))) return x;
    }
  }
  return null;
}

function imagenesJsonLd(p) {
  return lista(p?.image)
    .map((i) => (typeof i === "string" ? i : i?.url || i?.contentUrl || ""))
    .filter(Boolean);
}

// Precio único en pesos ("$9.395"); si es un rango o está en otra moneda, nada (no se arriesga).
function precioJsonLd(p) {
  for (const o of lista(p?.offers)) {
    if (!o || typeof o !== "object") continue;
    const moneda = String(o.priceCurrency || o.priceSpecification?.priceCurrency || "ARS").toUpperCase();
    if (moneda !== "ARS") continue;
    if (o.lowPrice !== undefined && o.highPrice !== undefined && Number(o.lowPrice) !== Number(o.highPrice)) continue;
    const valor = Number(String(o.price ?? o.lowPrice ?? o.priceSpecification?.price ?? "").replace(",", "."));
    if (valor > 0) return formatoPesos(valor);
  }
  return "";
}

export function analizarPagina(html, url) {
  const ld = productoJsonLd(html);
  const titulo =
    textoPlano((html.match(/<h1[^>]*product_title[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") ||
    textoPlano(String(ld?.name || "")) ||
    meta(html, "og:title");
  const corta = textoPlano(bloquePorMarca(html, /<div[^>]*woocommerce-product-details__short-description[^>]*>/i));
  const larga = textoPlano(bloquePorMarca(html, /<div[^>]*id=["']tab-description["'][^>]*>/i)).replace(/^Descripción\s*/i, "");
  const deLd = textoPlano(String(ld?.description || ""));
  const metaDesc = meta(html, "og:description") || meta(html, "description");
  const partes = [corta, larga, deLd, metaDesc].filter(Boolean);
  const vistos = new Set();
  const descripcion = partes
    .filter((p) => {
      const k = p.slice(0, 80);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .join("\n")
    .slice(0, 1800);

  const precioHtml = (html.match(/<p[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "";
  const precio = textoPlano(precioHtml).replace(/\s+/g, " ").trim() || precioJsonLd(ld);

  const imagenes = [];
  const sumar = (u) => {
    if (!u) return;
    try {
      const abs = new URL(decodificar(u), url).href;
      if (!imagenes.includes(abs)) imagenes.push(abs);
    } catch {}
  };
  for (const m of html.matchAll(/data-large_image=["']([^"']+)["']/gi)) sumar(m[1]);
  for (const m of html.matchAll(/woocommerce-product-gallery__image[^>]*>\s*<a[^>]+href=["']([^"']+)["']/gi)) sumar(m[1]);
  for (const u of imagenesJsonLd(ld)) sumar(u);
  sumar(meta(html, "og:image"));

  return { titulo, descripcion, precio, imagenes };
}

export async function leerPagina(url) {
  const r = await traer(url, { headers: { "User-Agent": AGENTE, "Accept-Language": "es-AR,es;q=0.9" } }, 30000);
  if (!r.ok) throw new Error(`la página del producto respondió ${r.status}`);
  return analizarPagina(await r.text(), url);
}
