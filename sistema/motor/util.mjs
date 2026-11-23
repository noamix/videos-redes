// Utilidades comunes: registro, fechas en hora argentina, comandos externos y archivos.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

export function log(...args) {
  const hora = new Date().toLocaleString("es-AR", { timeZone: CONFIG.zona, hour12: false });
  console.log(`[${hora}]`, ...args);
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Fecha de hoy (AAAA-MM-DD) y hora (HH:MM) en la zona horaria configurada.
export function fechaLocal(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: CONFIG.zona });
}
export function horaLocal(d = new Date()) {
  return d.toLocaleTimeString("en-GB", { timeZone: CONFIG.zona, hour: "2-digit", minute: "2-digit", hour12: false });
}
export function ahoraTexto(d = new Date()) {
  return `${fechaLocal(d)} ${horaLocal(d)}`;
}
export function sumarDias(fechaIso, dias) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + dias, 12));
  return x.toISOString().slice(0, 10);
}

// Acepta "2026-11-14", "14/11/2026" o "14-11-2026"; devuelve AAAA-MM-DD o null.
export function normalizarFecha(valor) {
  if (valor === undefined || valor === null) return null;
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function slug(texto, max = 60) {
  let s = String(texto || "video")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > max) {
    s = s.slice(0, max);
    const corte = s.lastIndexOf("-");
    if (corte > 20) s = s.slice(0, corte);
  }
  return s.replace(/-+$/g, "") || "video";
}

// Número estable a partir de un texto (para elegir variantes sin azar).
export function hashTexto(s) {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Corre un programa y devuelve { codigo, salida, error }. Falla si se pasa del tiempo.
export function correr(programa, args, { cwd, env, timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(programa, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    const recortar = (s) => (s.length > 200000 ? s.slice(-200000) : s);
    p.stdout.on("data", (d) => (salida = recortar(salida + d)));
    p.stderr.on("data", (d) => (error = recortar(error + d)));
    const reloj = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${path.basename(programa)} tardó más de ${Math.round(timeoutMs / 60000)} min y se cortó`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(reloj);
      reject(new Error(`No pude ejecutar ${programa}: ${e.message}`));
    });
    p.on("close", (codigo) => {
      clearTimeout(reloj);
      resolve({ codigo, salida, error });
    });
  });
}

export async function sondear(archivo) {
  const r = await correr("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,width,height,r_frame_rate",
    "-of", "json",
    archivo,
  ], { timeoutMs: 60000 });
  if (r.codigo !== 0) throw new Error(`ffprobe no pudo leer ${path.basename(archivo)}: ${r.error.trim().slice(0, 300)}`);
  const d = JSON.parse(r.salida);
  const video = (d.streams || []).find((s) => s.codec_type === "video") || {};
  const audio = (d.streams || []).find((s) => s.codec_type === "audio");
  return {
    duracion: Number(d.format?.duration || 0),
    bytes: Number(d.format?.size || 0),
    ancho: Number(video.width || 0),
    alto: Number(video.height || 0),
    tieneAudio: Boolean(audio),
  };
}

export async function leerJson(archivo, porDefecto) {
  try {
    return JSON.parse(await fs.readFile(archivo, "utf8"));
  } catch {
    return porDefecto;
  }
}

export async function escribirJson(archivo, datos) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(datos, null, 2));
  await fs.rename(tmp, archivo);
}

export async function borrarViejos(carpeta, dias, filtro = () => true) {
  if (!existsSync(carpeta)) return 0;
  const limite = Date.now() - dias * 86400000;
  let n = 0;
  for (const nombre of await fs.readdir(carpeta)) {
    if (!filtro(nombre)) continue;
    const ruta = path.join(carpeta, nombre);
    const st = await fs.stat(ruta).catch(() => null);
    if (st && st.mtimeMs < limite) {
      await fs.rm(ruta, { recursive: true, force: true });
      n++;
    }
  }
  return n;
}

// fetch con tiempo límite y mensaje de error claro.
export async function traer(url, opciones = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } catch (e) {
    const motivo = e.name === "AbortError" ? `no respondió en ${Math.round(timeoutMs / 1000)} s` : e.cause?.code || e.message;
    throw new Error(`No pude conectar con ${new URL(url).host}: ${motivo}`);
  } finally {
    clearTimeout(reloj);
  }
}

export function sinEmojis(s) {
  return String(s || "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
