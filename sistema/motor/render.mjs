// Arma el video: copia la plantilla, carga textos/colores/fotos, renderiza con HyperFrames y agrega el audio.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { CONFIG, RUTAS } from "./config.mjs";
import { correr, hashTexto, log, sondear } from "./util.mjs";

const DURACION = 15;

// Escribe los valores como "default" de las variables declaradas en el index.html del trabajo.
export function hornearVariables(html, valores) {
  const re = /data-composition-variables='([\s\S]*?)'/;
  const m = html.match(re);
  if (!m) throw new Error("La plantilla no tiene data-composition-variables");
  const declaradas = JSON.parse(m[1].replace(/&#39;/g, "'"));
  for (const d of declaradas) {
    if (!(d.id in valores) || valores[d.id] === undefined || valores[d.id] === null) continue;
    let x = valores[d.id];
    if (d.type === "number") x = Number(x);
    else if (d.type === "boolean") x = x === true || x === "true";
    else x = String(x);
    d.default = x;
  }
  const json = JSON.stringify(declaradas).replace(/'/g, "&#39;");
  return html.replace(re, () => `data-composition-variables='${json}'`);
}

async function elegirMusica(semilla) {
  if (!existsSync(RUTAS.musica)) return null;
  const temas = (await fs.readdir(RUTAS.musica)).filter((n) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(n)).sort();
  if (!temas.length) return null;
  return path.join(RUTAS.musica, temas[hashTexto(semilla) % temas.length]);
}

// Agrega música (si hay en la carpeta musica/) o una pista de silencio, sin volver a codificar la imagen.
async function agregarAudio(videoMudo, destino, semilla) {
  const tema = await elegirMusica(semilla);
  const args = ["-y", "-v", "error", "-i", videoMudo];
  if (tema) {
    args.push(
      "-stream_loop", "-1", "-i", tema,
      "-map", "0:v", "-map", "1:a",
      "-af", `afade=t=in:d=0.5,afade=t=out:st=${DURACION - 1.5}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11`,
    );
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a");
  }
  args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", String(DURACION), "-movflags", "+faststart", destino);
  const r = await correr("ffmpeg", args, { timeoutMs: 180000 });
  if (r.codigo !== 0) throw new Error(`ffmpeg no pudo agregar el audio: ${r.error.trim().slice(0, 400)}`);
  return tema ? path.basename(tema) : null;
}

/**
 * Renderiza un video.
 * datos: { nombreBase, textos, linea, fotos: [{ruta, proporcion}x3] }
 * Devuelve { archivo, ruta, info, musica }.
 */
export async function renderizar({ nombreBase, textos, linea, fotos, precio = null }) {
  if (!existsSync(RUTAS.hyperframes)) {
    throw new Error("Falta HyperFrames: corré 'npm install' en la carpeta del sistema.");
  }
  await fs.mkdir(RUTAS.trabajos, { recursive: true });
  await fs.mkdir(RUTAS.salida, { recursive: true });
  const trabajo = path.join(RUTAS.trabajos, `${nombreBase}-${Date.now()}`);
  await fs.cp(RUTAS.plantilla, trabajo, {
    recursive: true,
    filter: (origen) => !origen.includes(`${path.sep}.hyperframes`) && !origen.includes(`${path.sep}node_modules`),
  });
  const dirFotos = path.join(trabajo, "assets", "fotos");
  await fs.mkdir(dirFotos, { recursive: true });
  for (let i = 0; i < 3; i++) await fs.copyFile(fotos[i].ruta, path.join(dirFotos, `foto_${i + 1}.jpg`));

  // GSAP (las animaciones) va dentro del trabajo, así el render no depende de internet. Viene de npm install.
  const gsapDelTrabajo = path.join(trabajo, "assets", "vendor", "gsap.min.js");
  if (!existsSync(gsapDelTrabajo)) {
    if (!existsSync(RUTAS.gsap)) throw new Error("Falta GSAP: corré 'npm install' en la carpeta del sistema.");
    await fs.mkdir(path.dirname(gsapDelTrabajo), { recursive: true });
    await fs.copyFile(RUTAS.gsap, gsapDelTrabajo);
  }

  let usarLogo = false;
  if (CONFIG.logo) {
    const logo = path.isAbsolute(CONFIG.logo) ? CONFIG.logo : path.join(RUTAS.raiz, CONFIG.logo);
    if (existsSync(logo)) {
      await fs.mkdir(path.join(trabajo, "assets", "marca"), { recursive: true });
      await fs.copyFile(logo, path.join(trabajo, "assets", "marca", "logo.png"));
      usarLogo = true;
    }
  }

  const valores = {
    ...textos,
    web: CONFIG.web,
    marca: CONFIG.marca,
    usar_logo: usarLogo,
    // Estilo clásico: los colores de la línea (config/lineas.json); si no tiene, los de la marca (negocio.json).
    color_fondo: linea.color_fondo || CONFIG.colores.oscuro || undefined,
    color_tinta: linea.color_tinta || (CONFIG.colores.oscuro ? "#FFFFFF" : undefined),
    color_acento: linea.color_acento || CONFIG.colores.principal || undefined,
    color_acento_tinta: linea.color_acento_tinta || CONFIG.colores.oscuro || undefined,
    color_brillo: linea.color_brillo || linea.color_acento || CONFIG.colores.principal || undefined,
    foto_1_ar: fotos[0].proporcion,
    foto_2_ar: fotos[1].proporcion,
    foto_3_ar: fotos[2].proporcion,
    precio: precio?.texto || "",
    precio_valor: precio?.valor || 0,
    precio_unidad: precio?.unidad || "",
    precio_mes: precio?.mes || "",
    whatsapp: CONFIG.whatsapp || "",
    beneficios: (linea.beneficios || []).filter(Boolean).join("|"),
  };
  // Estilo "cajas": los dos colores de la marca (config/negocio.json); sin ellos, amarillo y negro.
  if (CONFIG.colores.principal) valores.amarillo = CONFIG.colores.principal;
  if (CONFIG.colores.oscuro) valores.negro = CONFIG.colores.oscuro;
  const indice = path.join(trabajo, "index.html");
  await fs.writeFile(indice, hornearVariables(await fs.readFile(indice, "utf8"), valores));

  const mudo = path.join(trabajo, "render.mp4");
  const env = { HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_SKIP_SKILLS: "1" };
  if (CONFIG.render.navegador) env.HYPERFRAMES_BROWSER_PATH = CONFIG.render.navegador;
  const inicio = Date.now();
  const r = await correr(
    process.execPath,
    [RUTAS.hyperframes, "render", "--quality", CONFIG.render.calidad, "--fps", "30", "--max-bitrate", "10M", "-o", mudo],
    { cwd: trabajo, env, timeoutMs: CONFIG.render.timeoutMin * 60000 },
  );
  if (r.codigo !== 0 || !existsSync(mudo)) {
    const detalle = `${r.salida}\n${r.error}`.trim().split("\n").filter(Boolean).slice(-8).join(" | ");
    throw new Error(`HyperFrames no pudo renderizar (código ${r.codigo}): ${detalle.slice(0, 700)}. El trabajo quedó en ${trabajo}`);
  }
  log(`Render listo en ${Math.round((Date.now() - inicio) / 1000)} s: ${nombreBase}`);

  const final = path.join(RUTAS.salida, `${nombreBase}.mp4`);
  const temporal = path.join(RUTAS.salida, `${nombreBase}.tmp.mp4`);
  const musica = await agregarAudio(mudo, temporal, nombreBase);
  const info = await sondear(temporal);
  const problemas = [];
  if (Math.abs(info.duracion - DURACION) > 0.25) problemas.push(`dura ${info.duracion.toFixed(2)} s`);
  if (info.ancho !== 1080 || info.alto !== 1920) problemas.push(`mide ${info.ancho}x${info.alto}`);
  if (info.bytes < 50000) problemas.push(`pesa muy poco (${info.bytes} bytes)`);
  if (problemas.length) {
    await fs.rm(temporal, { force: true });
    throw new Error(`El video salió mal (${problemas.join(", ")}). El trabajo quedó en ${trabajo}`);
  }
  await fs.rename(temporal, final);
  await fs.rm(trabajo, { recursive: true, force: true });
  return { archivo: path.basename(final), ruta: final, info, musica, segundos: Math.round((Date.now() - inicio) / 1000) };
}
