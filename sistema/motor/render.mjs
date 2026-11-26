// Arma el video: copia la plantilla, carga textos/colores/fotos, renderiza con HyperFrames y agrega el audio
// (música y, si hay, la voz en off).
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

const FUNDIDOS = `afade=t=in:d=0.5,afade=t=out:st=${DURACION - 1.5}:d=1.5`;
const VOLUMEN_PAREJO = "loudnorm=I=-16:TP=-1.5:LRA=11";

/**
 * Arma el audio y lo pega al video, sin volver a codificar la imagen.
 *   · Música: un tema de la carpeta musica/ (o silencio si está vacía).
 *   · Voz (si hay): cada frase entra con su pantalla; la música baja sola mientras habla la voz.
 * voz: { tramos: [{ ruta, inicio, tempo }] } de voz.mjs/planearVoz.
 */
export function argumentosAudio({ videoMudo, destino, tema, voz = null, comentario = "", medicion = null }) {
  const args = ["-y", "-v", "error", "-i", videoMudo];
  if (tema) args.push("-stream_loop", "-1", "-i", tema);
  else args.push("-f", "lavfi", "-t", String(DURACION), "-i", "anullsrc=r=48000:cl=stereo");
  const tramos = voz?.tramos || [];
  if (!tramos.length) {
    args.push("-map", "0:v", "-map", "1:a");
    if (tema) args.push("-af", `${FUNDIDOS},${VOLUMEN_PAREJO}`);
  } else {
    for (const t of tramos) args.push("-i", t.ruta);
    const filtros = [];
    tramos.forEach((t, i) => {
      const tempo = t.tempo > 1.001 ? `,atempo=${t.tempo}` : "";
      filtros.push(`[${i + 2}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono${tempo},adelay=${Math.round(t.inicio * 1000)}[f${i}]`);
    });
    // La voz completa (las frases en su lugar), en estéreo, y una copia que le avisa a la música cuándo bajar.
    filtros.push(
      `${tramos.map((_, i) => `[f${i}]`).join("")}amix=inputs=${tramos.length}:normalize=0:duration=longest,` +
        `apad=whole_dur=${DURACION},aformat=channel_layouts=stereo,asplit=2[voz][aviso]`,
    );
    filtros.push(
      `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${DURACION},asetpts=N/SR/TB,${FUNDIDOS},volume=${tema ? "0.5" : "0"}[musica]`,
    );
    // Mientras habla la voz, la música baja unos 10 dB y vuelve en menos de medio segundo.
    filtros.push("[musica][aviso]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[musica_baja]");
    // Volumen parejo en -16 LUFS: con la medición de la primera pasada, la ganancia es fija (sin subidas y bajadas).
    filtros.push(`[musica_baja][voz]amix=inputs=2:normalize=0:duration=first,${medicion ? volumenLineal(medicion) : VOLUMEN_PAREJO}[audio]`);
    args.push("-filter_complex", filtros.join(";"), "-map", "0:v", "-map", "[audio]");
  }
  if (comentario) args.push("-metadata", `comment=${comentario}`);
  args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", String(DURACION), "-movflags", "+faststart", destino);
  return args;
}

// loudnorm en dos pasadas: la primera mide (sin escribir nada) y la segunda aplica una ganancia fija.
function volumenLineal(m) {
  return (
    `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
  );
}

async function medirVolumen({ videoMudo, tema, voz }) {
  const args = argumentosAudio({ videoMudo, destino: "-", tema, voz })
    .map((a) => (a === VOLUMEN_PAREJO || a.endsWith(`${VOLUMEN_PAREJO}[audio]`) ? a.replace(VOLUMEN_PAREJO, `${VOLUMEN_PAREJO}:print_format=json`) : a));
  // Solo el audio, sin escribir archivo: "-map 0:v" y la salida se cambian por un null.
  const i = args.indexOf("-map");
  args.splice(i, 2);
  const fin = args.indexOf("-c:v");
  args.splice(fin, args.length - fin, "-t", String(DURACION), "-f", "null", "-");
  args[args.indexOf("-v") + 1] = "info";
  const r = await correr("ffmpeg", ["-nostats", ...args], { timeoutMs: 120000 });
  const json = r.error.slice(r.error.lastIndexOf("{"), r.error.lastIndexOf("}") + 1);
  const m = JSON.parse(json);
  if (![m.input_i, m.input_tp, m.input_lra, m.input_thresh, m.target_offset].every((x) => Number.isFinite(Number(x)))) throw new Error("medición incompleta");
  return m;
}

async function agregarAudio(videoMudo, destino, semilla, voz = null) {
  const tema = await elegirMusica(semilla);
  const comentario = voz?.tramos?.length ? `${CONFIG.voz.aviso} (VoxCPM2)` : "";
  let medicion = null;
  if (comentario) {
    try {
      medicion = await medirVolumen({ videoMudo, tema, voz });
    } catch (e) {
      log(`No pude medir el volumen (${e.message}); uso el volumen parejo de una pasada.`);
    }
  }
  let r = await correr("ffmpeg", argumentosAudio({ videoMudo, destino, tema, voz, comentario, medicion }), { timeoutMs: 180000 });
  let conVoz = Boolean(comentario);
  if (r.codigo !== 0 && conVoz) {
    // Si la mezcla con voz falla, el video sale igual, con la música sola.
    log(`ffmpeg no pudo mezclar la voz (${r.error.trim().slice(0, 200)}); el video sale con la música sola.`);
    conVoz = false;
    r = await correr("ffmpeg", argumentosAudio({ videoMudo, destino, tema }), { timeoutMs: 180000 });
  }
  if (r.codigo !== 0) throw new Error(`ffmpeg no pudo agregar el audio: ${r.error.trim().slice(0, 400)}`);
  return { musica: tema ? path.basename(tema) : null, conVoz };
}

/**
 * Renderiza un video.
 * datos: { nombreBase, textos, linea, fotos: [{ruta, proporcion}x3], precio, voz }
 *   voz: { tramos } de voz.mjs/planearVoz, o null para el video sin voz.
 * Devuelve { archivo, ruta, info, musica, conVoz, segundos }.
 */
export async function renderizar({ nombreBase, textos, linea, fotos, precio = null, voz = null }) {
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
    // Aviso en pantalla cuando el video lleva voz hecha con IA (Instagram y TikTok piden declararla; TikTok acepta un texto propio).
    aviso_ia: voz?.tramos?.length ? CONFIG.voz.aviso : "",
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
  const { musica, conVoz } = await agregarAudio(mudo, temporal, nombreBase, voz);
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
  return { archivo: path.basename(final), ruta: final, info, musica, conVoz, segundos: Math.round((Date.now() - inicio) / 1000) };
}
