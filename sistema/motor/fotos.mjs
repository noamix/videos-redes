// Consigue hasta 3 fotos del producto, las baja, las pasa a JPG con fondo blanco y mide su proporción.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { RUTAS } from "./config.mjs";
import { correr, hashTexto, sondear, traer } from "./util.mjs";

const AGENTE = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

// En WordPress las miniaturas terminan en -300x300; probamos primero el original.
export function variantes(url) {
  const sinTamano = url.replace(/-\d{2,4}x\d{2,4}(?=(-[a-z]{3,4})?\.(jpe?g|png|webp|avif)(\?|$))/i, "");
  return sinTamano !== url ? [sinTamano, url] : [url];
}

function claveImagen(u) {
  return variantes(u)[0].toLowerCase();
}

async function bajar(url) {
  await fs.mkdir(RUTAS.cache, { recursive: true });
  const base = path.join(RUTAS.cache, `img-${hashTexto(url).toString(16)}`);
  for (const ext of [".jpg", ".png", ".webp", ".avif", ".gif", ".img"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  const r = await traer(url, { headers: { "User-Agent": AGENTE, Accept: "image/*" } }, 45000);
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  const tipo = (r.headers.get("content-type") || "").toLowerCase();
  if (!tipo.startsWith("image/")) throw new Error(`no es una imagen (${tipo || "sin tipo"})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000) throw new Error("imagen demasiado chica");
  const ext = tipo.includes("png") ? ".png" : tipo.includes("webp") ? ".webp" : tipo.includes("avif") ? ".avif" : tipo.includes("gif") ? ".gif" : tipo.includes("jpeg") || tipo.includes("jpg") ? ".jpg" : ".img";
  await fs.writeFile(base + ext, buf);
  return base + ext;
}

async function aJpg(origen, destino) {
  const info = await sondear(origen);
  if (!info.ancho || !info.alto) throw new Error("no pude leer el tamaño de la imagen");
  const args = [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=white:s=${info.ancho}x${info.alto}`,
    "-i", origen,
    "-filter_complex",
    "[0:v][1:v]overlay=format=auto,scale='min(iw,1600)':'min(ih,1600)':force_original_aspect_ratio=decrease,format=yuvj420p",
    "-frames:v", "1", "-q:v", "3",
    destino,
  ];
  const r = await correr("ffmpeg", args, { timeoutMs: 120000 });
  if (r.codigo !== 0) throw new Error(`ffmpeg no pudo convertir la imagen: ${r.error.trim().slice(0, 300)}`);
  return { ancho: info.ancho, alto: info.alto };
}

async function resolverLocal(valor) {
  const candidatos = path.isAbsolute(valor) ? [valor] : [path.join(RUTAS.fotos, valor), path.join(RUTAS.raiz, valor)];
  for (const c of candidatos) if (existsSync(c)) return c;
  throw new Error(`no encontré el archivo ${valor} (ponelo en la carpeta fotos/)`);
}

/**
 * candidatos: URLs o nombres de archivo, en orden de preferencia.
 * Devuelve 3 fotos [{ ruta, proporcion, origen }] (repite si hay menos) y avisos.
 */
export async function prepararFotos(candidatos, carpetaDestino) {
  await fs.mkdir(carpetaDestino, { recursive: true });
  const avisos = [];
  const fotos = [];
  const usadas = new Set();
  for (const bruto of candidatos) {
    if (fotos.length >= 3) break;
    const valor = String(bruto || "").trim();
    if (!valor) continue;
    const esUrl = /^https?:\/\//i.test(valor);
    const clave = esUrl ? claveImagen(valor) : valor.toLowerCase();
    if (usadas.has(clave)) continue;
    usadas.add(clave);
    let original = null;
    let problema = "";
    if (esUrl) {
      for (const u of variantes(valor)) {
        try {
          original = await bajar(u);
          break;
        } catch (e) {
          problema = e.message;
        }
      }
    } else {
      try {
        original = await resolverLocal(valor);
      } catch (e) {
        problema = e.message;
      }
    }
    if (!original) {
      avisos.push(`Foto descartada (${valor.slice(0, 90)}): ${problema}`);
      continue;
    }
    const destino = path.join(carpetaDestino, `foto_${fotos.length + 1}.jpg`);
    try {
      const { ancho, alto } = await aJpg(original, destino);
      fotos.push({ ruta: destino, proporcion: Math.round((ancho / alto) * 100) / 100, origen: valor });
    } catch (e) {
      avisos.push(`Foto descartada (${valor.slice(0, 90)}): ${e.message}`);
    }
  }
  if (!fotos.length) {
    const motivos = avisos.length ? ` (${avisos.slice(0, 3).join("; ")})` : " (no había ninguna para probar)";
    throw new Error(`No conseguí ninguna foto del producto${motivos}. Cargá foto_1 en la planilla (URL o archivo de la carpeta fotos/).`);
  }
  if (fotos.length < 3) avisos.push(`Solo había ${fotos.length} foto(s); se repiten en el video.`);
  while (fotos.length < 3) {
    const n = fotos.length + 1;
    const copia = fotos[(n - 1) % fotos.length];
    const destino = path.join(carpetaDestino, `foto_${n}.jpg`);
    await fs.copyFile(copia.ruta, destino);
    fotos.push({ ...copia, ruta: destino });
  }
  return { fotos, avisos };
}
