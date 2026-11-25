// La lógica del circuito: qué video toca cada día, cómo se genera y cuándo se publica.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { CONFIG, RUTAS, datosDeLinea } from "./config.mjs";
import { prepararFotos } from "./fotos.mjs";
import { publicarReel } from "./instagram.mjs";
import { mandarARedes, revisarRedes } from "./buffer.mjs";
import { leerPagina } from "./pagina.mjs";
import { renderizar } from "./render.mjs";
import { armarPrecio } from "./precio.mjs";
import { enviarRevision, enviarTexto, fechaBonita, telegramConfigurado } from "./telegram.mjs";
import { CAMPOS, escribirTextos, textosCompletos } from "./textos.mjs";
import { captionConAviso, escribirFrases } from "./frases.mjs";
import { generarVoz, horarioVozTexto, planearVoz, prepararMemoria, soloUrgentes, vozActiva } from "./voz.mjs";
import { ahoraTexto, fechaLocal, horaLocal, log, normalizarFecha, slug, sondear, sumarDias } from "./util.mjs";

export const COLUMNAS_CALENDARIO = [
  "fecha", "linea", "producto_id", "producto", "estado",
  "etiqueta", "p1", "p2_titulo", "p2_punto_1", "p2_punto_2", "p2_punto_3", "p3_titulo", "p3_sub",
  "caption", "archivo", "ig_link", "nota", "actualizado",
];

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const estadoDe = (r) => sinTildes(r.estado).trim().toLowerCase().replace(/\s+/g, "_");
const esNo = (v) => ["no", "n", "false", "0"].includes(sinTildes(v).trim().toLowerCase());
const esSi = (v) => ["si", "s", "true", "1", "yes"].includes(sinTildes(v).trim().toLowerCase());

function claves(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[sinTildes(k).trim().toLowerCase().replace(/\s+/g, "_")] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

function idProducto(p) {
  return String(p.id || "").trim() || slug(p.producto, 40);
}

const hora = (h) => {
  const [a, b = "00"] = String(h).split(":");
  return `${a.padStart(2, "0")}:${b.padStart(2, "0")}`;
};

export function lineasDeProductos(prods) {
  const vistas = [];
  for (const p of prods) {
    const l = String(p.linea || "").trim();
    if (!vistas.includes(l)) vistas.push(l);
  }
  return vistas;
}

// ---------- Cola: un video a la vez (renderizar usa mucha CPU) ----------
let cola = Promise.resolve();
const enCurso = new Set();
export const ocupado = () => enCurso.size > 0;

function enCola(tarea) {
  const corrida = cola.then(tarea, tarea);
  cola = corrida.catch(() => {});
  return corrida;
}

// ---------- 1. Planificar ----------
/**
 * Recibe las filas de las hojas Productos y Calendario.
 * Devuelve las filas nuevas a agendar (días que faltan) y los videos a generar en esta corrida.
 */
export function planificar({ productos = [], calendario = [] }, hoy = fechaLocal(), ahora = new Date()) {
  if (CONFIG.pausado) {
    return { hoy, filas_nuevas: [], a_generar: [], resumen: "En pausa (config/negocio.json): no se agenda ni se genera nada" };
  }
  const prods = productos.map(claves).filter((p) => p.producto && !esNo(p.activo));
  for (const p of prods) p._id = idProducto(p);
  const filas = calendario
    .map(claves)
    .map((r) => ({ ...r, fecha: normalizarFecha(r.fecha) }))
    .filter((r) => r.fecha);
  const porFecha = new Map(filas.map((r) => [r.fecha, r]));
  const ultimoUso = new Map();
  for (const r of filas) {
    const id = String(r.producto_id || "");
    if (id && (ultimoUso.get(id) || "") < r.fecha) ultimoUso.set(id, r.fecha);
  }

  // Rotación: la de negocio.json; si no hay, todas las líneas de la hoja Productos, en el orden en que aparecen.
  const rot = CONFIG.rotacion.length ? CONFIG.rotacion : lineasDeProductos(prods);
  const nuevas = [];
  for (let d = 0; d <= CONFIG.diasAdelante; d++) {
    const f = sumarDias(hoy, d);
    if (porFecha.has(f)) continue;
    let previa = null;
    for (const r of porFecha.values()) if (r.fecha < f && (!previa || r.fecha > previa.fecha)) previa = r;
    const idx = previa ? rot.indexOf(String(previa.linea || "").trim()) : -1;
    let elegido = null;
    let lineaElegida = null;
    for (let k = 1; k <= rot.length && !elegido; k++) {
      const linea = rot[(idx + k + rot.length) % rot.length];
      const candidatos = prods.filter((p) => String(p.linea || "").trim() === linea);
      if (!candidatos.length) continue;
      candidatos.sort((a, b) => (ultimoUso.get(a._id) || "").localeCompare(ultimoUso.get(b._id) || ""));
      elegido = candidatos[0];
      lineaElegida = linea;
    }
    if (!elegido) break;
    const fila = {
      fecha: f,
      linea: lineaElegida,
      producto_id: elegido._id,
      producto: elegido.producto,
      estado: "pendiente",
      nota: "Agendado automáticamente",
      actualizado: ahoraTexto(),
    };
    porFecha.set(f, fila);
    ultimoUso.set(elegido._id, f);
    nuevas.push(fila);
  }

  // Con voz y VOZ_HORARIO: la voz se arma en ese horario. Fuera de él solo se generan los urgentes (los de hoy).
  const deDia = soloUrgentes(ahora);
  const fin = deDia ? sumarDias(hoy, Math.min(CONFIG.diasAdelante, CONFIG.voz.urgenteDias)) : sumarDias(hoy, CONFIG.diasAdelante);
  const esperanLaNoche = [];
  const candidatas = [...porFecha.values()].filter((r) => {
    const toca = r.fecha >= hoy && ["", "pendiente", "rehacer"].includes(estadoDe(r)) && !enCurso.has(r.fecha);
    if (toca && r.fecha > fin && r.fecha <= sumarDias(hoy, CONFIG.diasAdelante)) esperanLaNoche.push(r.fecha);
    return toca && r.fecha <= fin;
  });
  candidatas.sort(
    (a, b) => Number(estadoDe(b) === "rehacer") - Number(estadoDe(a) === "rehacer") || a.fecha.localeCompare(b.fecha),
  );
  const elegidas = candidatas.slice(0, Math.max(0, CONFIG.maxPorCorrida));
  const fechasElegidas = new Set(elegidas.map((r) => r.fecha));

  const aGenerar = elegidas.map((r) => {
    const prod =
      prods.find((p) => p._id === String(r.producto_id || "")) ||
      prods.find((p) => sinTildes(p.producto).toLowerCase() === sinTildes(r.producto).toLowerCase()) ||
      {};
    const textos = {};
    for (const c of CAMPOS) if (r[c]) textos[c] = r[c];
    return {
      fecha: r.fecha,
      linea: r.linea || prod.linea || "",
      producto_id: r.producto_id || prod._id || "",
      producto: r.producto || prod.producto || "",
      link: prod.link || "",
      precio: prod.precio || "",
      mostrar_precio: esSi(prod.mostrar_precio),
      detalles: prod.detalles || "",
      fotos: [prod.foto_1, prod.foto_2, prod.foto_3].filter(Boolean),
      textos,
      regenerar_textos: estadoDe(r) === "rehacer",
    };
  });

  const deNoche = esperanLaNoche.length ? ` · ${esperanLaNoche.length} esperan el horario de la voz (${horarioVozTexto()})` : "";
  return {
    hoy,
    filas_nuevas: nuevas.filter((f) => !fechasElegidas.has(f.fecha)),
    a_generar: aGenerar,
    resumen: `${nuevas.length} día(s) agendado(s), ${aGenerar.length} video(s) a generar${deNoche}`,
  };
}

// ---------- Voz en off ----------
let avisoChromeEnviado = "";

/**
 * Arma la voz del video: frases (Gemini o los textos de las pantallas) y audio (comando del estudio).
 * Devuelve { voz: { tramos, frases, origen, segundos } | null, avisos, carpeta }.
 */
async function armarVoz({ textos, precio, linea, producto, mostrarPrecio, fecha }) {
  const avisos = [];
  const fr = await escribirFrases({ textos, precio, linea, producto, mostrarPrecio });
  avisos.push(...fr.avisos);
  if (!fr.frases) return { voz: null, avisos, carpeta: null };
  const carpeta = path.join(RUTAS.trabajos, `voz-${fecha}-${Date.now()}`);
  const g = await generarVoz({ frases: fr.frases, carpeta });
  if (!g.ok) {
    avisos.push(`Sin voz: ${g.motivo}.`);
    return { voz: null, avisos, carpeta, frases: fr.frases };
  }
  const plan = planearVoz(g.archivos);
  if (!plan.ok) {
    avisos.push(`Sin voz: ${plan.motivo}.`);
    return { voz: null, avisos, carpeta, frases: fr.frases };
  }
  if (g.sinTope) avisos.push("La voz corrió sin tope de memoria (systemd-run no anduvo).");
  return { voz: { tramos: plan.tramos, frases: fr.frases, origen: fr.origen, segundos: g.segundos }, avisos, carpeta };
}

// ---------- 2. Generar ----------
async function generarAhora(p, base) {
  const lineaClave = String(p.linea || "").trim();
  const linea = datosDeLinea(lineaClave);
  const avisos = [];

  // Voz en off: primero se mira la memoria (en el horario de la voz, si hace falta y está permitido, se cierra el navegador).
  // Si no alcanza y el video no es urgente, queda para la vuelta siguiente sin gastar nada.
  let conVoz = vozActiva() && !p.sin_voz;
  if (conVoz) {
    const urgente = base.fecha <= sumarDias(fechaLocal(), CONFIG.voz.urgenteDias);
    const mem = await prepararMemoria();
    if (mem.chromeCerrado && avisoChromeEnviado !== fechaLocal()) {
      avisoChromeEnviado = fechaLocal();
      await enviarTexto(
        `🌙 Cerré el navegador a las ${horaLocal()} para armar la voz de los videos (la compu estaba sin usar hace ${Math.round(mem.inactivo)} min). Cuando lo abras, te recupera las pestañas.`,
      ).catch(() => {});
    }
    if (!mem.ok) {
      if (!urgente && !p.prueba) {
        log(`Video del ${base.fecha}: espera la voz (${mem.motivo})`);
        return {
          ...base,
          estado: p.regenerar_textos ? "rehacer" : "pendiente",
          nota: `Espera la voz: ${mem.motivo}. Lo reintento en la próxima vuelta (la voz se arma ${horarioVozTexto()}).`.slice(0, 480),
          actualizado: ahoraTexto(),
        };
      }
      avisos.push(`Sin voz: ${mem.motivo}.${urgente && !p.prueba ? " Como el video es para hoy, sale igual." : ""}`);
      conVoz = false;
    }
  }

  let pagina = null;
  if (p.link) {
    try {
      pagina = await leerPagina(p.link);
    } catch (e) {
      avisos.push(`No pude leer la página del producto (${e.message}).`);
    }
  }

  let textos;
  let origen = "planilla";
  const anteriores = p.textos || {};
  if (!p.regenerar_textos && textosCompletos(anteriores)) {
    textos = Object.fromEntries(CAMPOS.map((c) => [c, String(anteriores[c] || "")]));
  } else {
    const informacion = [p.detalles, pagina?.titulo, pagina?.descripcion].filter(Boolean).join("\n").slice(0, 2500);
    const r = await escribirTextos({
      fecha: base.fecha,
      producto: p.producto,
      lineaClave,
      linea,
      informacion,
      detalles: p.detalles || "",
      precio: pagina?.precio || p.precio || "",
      mostrarPrecio: Boolean(p.mostrar_precio),
      anteriores: p.regenerar_textos ? anteriores : null,
    });
    textos = r.textos;
    origen = r.origen;
    avisos.push(...r.avisos);
  }

  const carpetaFotos = path.join(RUTAS.trabajos, `fotos-${base.fecha}-${Date.now()}`);
  const { fotos, avisos: avisosFotos } = await prepararFotos([...(p.fotos || []), ...(pagina?.imagenes || [])], carpetaFotos);
  avisos.push(...avisosFotos);

  const nombreBase = `${base.fecha}_${slug(p.producto, 60)}`;
  // Precio en el video (estilo amarillo): solo con mostrar_precio = SI y un precio claro.
  let precio = null;
  if (p.mostrar_precio) {
    precio = armarPrecio(pagina?.precio || p.precio || "", p.producto);
    if (!precio) avisos.push("mostrar_precio está en SI pero no encontré un precio claro: el video sale sin precio.");
  }
  // La voz se arma antes del render: si sale, el video lleva el aviso "Voz generada con IA" en pantalla.
  let voz = null;
  let carpetaVoz = null;
  if (conVoz) {
    try {
      const r = await armarVoz({ textos, precio, linea, producto: p.producto, mostrarPrecio: Boolean(p.mostrar_precio), fecha: base.fecha });
      voz = r.voz;
      carpetaVoz = r.carpeta;
      avisos.push(...r.avisos);
    } catch (e) {
      avisos.push(`Sin voz: ${e.message}.`);
    }
  }

  let video;
  try {
    video = await renderizar({ nombreBase, textos, linea, fotos, precio, voz });
  } finally {
    await fs.rm(carpetaFotos, { recursive: true, force: true });
    if (carpetaVoz) await fs.rm(carpetaVoz, { recursive: true, force: true }).catch(() => {});
  }
  if (voz && !video.conVoz) avisos.push("No pude mezclar la voz: el video salió con la música sola.");
  const conVozFinal = Boolean(voz && video.conVoz);
  // El texto del posteo dice "Voz generada con IA" solo si el video lleva voz.
  textos.caption = captionConAviso(textos.caption, conVozFinal);
  await fs.writeFile(path.join(RUTAS.salida, `${nombreBase}.txt`), `${textos.caption}\n`);

  if (telegramConfigurado() && !p.sin_telegram) {
    try {
      await enviarRevision({
        fecha: base.fecha,
        producto: p.producto,
        ruta: video.ruta,
        caption: textos.caption,
        avisos: avisos.slice(0, 3),
        rehecho: Boolean(p.regenerar_textos),
        prueba: Boolean(p.prueba),
        frasesVoz: conVozFinal ? voz.frases : null,
      });
    } catch (e) {
      avisos.push(`El video está hecho pero no pude mandarlo a Telegram (${e.message}); aprobalo en la planilla.`);
    }
  } else if (!telegramConfigurado()) {
    avisos.push("Telegram sin configurar: aprobalo poniendo 'aprobado' en la planilla.");
  }

  return {
    ...base,
    linea: lineaClave,
    estado: "esperando_ok",
    ...textos,
    archivo: video.archivo,
    ig_link: "",
    nota: (
      avisos.length
        ? `${avisos.join(" | ")}${conVozFinal ? ` | Voz OK (${voz.origen}, ${voz.segundos} s)` : ""}`
        : `OK (textos: ${origen}${conVozFinal ? `, voz: ${voz.origen} en ${voz.segundos} s` : ""}, render ${video.segundos} s${video.musica ? `, música ${video.musica}` : ""})`
    ).slice(0, 480),
    actualizado: ahoraTexto(),
  };
}

/** Genera un video y devuelve la fila completa para la planilla (si falla, la fila queda en "error"). */
export async function generar(p) {
  const fecha = normalizarFecha(p.fecha);
  const base = { fecha: fecha || String(p.fecha || ""), linea: p.linea || "", producto_id: p.producto_id || "", producto: p.producto || "" };
  if (!fecha) return { ...base, estado: "error", nota: "Fecha inválida", actualizado: ahoraTexto() };
  if (enCurso.has(fecha)) return { fecha, nota: "Este video ya se estaba generando" };
  enCurso.add(fecha);
  try {
    log(`Generando video del ${fecha}: ${p.producto}`);
    const fila = await enCola(() => generarAhora(p, base));
    if (fila.archivo) log(`Video del ${fecha} listo: ${fila.archivo}`);
    return fila;
  } catch (e) {
    log(`Error generando el video del ${fecha}: ${e.message}`);
    await enviarTexto(
      `❌ No pude generar el video del ${fechaBonita(fecha)} (${p.producto}).\n${e.message}\n\nCuando lo resuelvas, poné el estado en "pendiente" en la planilla para reintentar.`,
    ).catch(() => {});
    return { ...base, estado: "error", nota: e.message.slice(0, 480), actualizado: ahoraTexto() };
  } finally {
    enCurso.delete(fecha);
  }
}

// ---------- 3. Publicar en Instagram ----------
let publicando = false;

export async function publicarPendientes({ calendario = [] }) {
  // Avisa por Telegram si TikTok o YouTube ya publicaron (o rechazaron) lo que se les mandó por Buffer.
  await revisarRedes().catch((e) => log(`Buffer: no pude revisar los envíos: ${e.message}`));
  if (CONFIG.pausado) return { filas: [], nota: "En pausa (config/negocio.json): no se publica nada" };
  const hoy = fechaLocal();
  if (horaLocal() < hora(CONFIG.horaPublicacion)) return { filas: [], nota: "Todavía no es la hora de publicar" };
  if (publicando) return { filas: [], nota: "Ya hay una publicación en curso" };
  const r = calendario
    .map(claves)
    .map((x) => ({ ...x, fecha: normalizarFecha(x.fecha) }))
    .find((x) => x.fecha === hoy && estadoDe(x) === "aprobado");
  if (!r) return { filas: [] };

  const base = { fecha: r.fecha };
  const ruta = path.join(RUTAS.salida, path.basename(String(r.archivo || "")));
  if (!r.archivo || !existsSync(ruta)) {
    await enviarTexto(`❌ Hoy no pude publicar en Instagram: no encuentro el archivo "${r.archivo}".`).catch(() => {});
    return { filas: [{ ...base, estado: "error_ig", nota: `No encuentro el archivo ${r.archivo || "(vacío)"}`, actualizado: ahoraTexto() }] };
  }
  publicando = true;
  try {
    // Si el video lleva voz hecha con IA, se publica con la marca oficial de cada red ("Información de IA").
    const conIa = await sondear(ruta)
      .then((i) => i.comentario.includes(CONFIG.voz.aviso))
      .catch(() => false);
    const res = await publicarReel({ ruta, caption: String(r.caption || ""), conIa });
    if (res.ok) {
      // TikTok y YouTube Shorts por Buffer, con el mismo video que acaba de salir en Instagram.
      let envio;
      try {
        envio = await mandarARedes({
          producto: r.producto,
          fecha: r.fecha,
          caption: String(r.caption || ""),
          gancho: r.p1,
          urlInstagram: res.mediaUrl,
          ruta,
          conIa,
        });
      } catch (e) {
        log(`Buffer: ${e.message}`);
        envio = { ok: false, motivo: e.message, redes: [] };
      }
      const lineas = [];
      const notas = [];
      if (!envio.omitido && !envio.redes.length) {
        lineas.push(`⚠️ TikTok/YouTube no salieron: ${envio.motivo}\nEl video está en la carpeta salida para subirlo a mano.`);
        notas.push(`Buffer: ${envio.motivo}`);
      }
      for (const x of envio.redes) {
        lineas.push(
          x.ok
            ? `${x.red === "youtube" ? "▶️" : "🎵"} ${x.nombre}: enviado a Buffer, sale en unos minutos (te aviso cuando esté).`
            : `⚠️ ${x.nombre} no salió: ${x.motivo}\nEl video está en la carpeta salida para subirlo a mano.`,
        );
        notas.push(x.ok ? `${x.nombre} enviado por Buffer${x.sinMarcaIa ? " (sin la marca de IA)" : ""}` : `${x.nombre}: ${x.motivo}`);
      }
      const lineaTiktok = lineas.length ? `\n${lineas.join("\n")}` : "";
      await enviarTexto(`✅ Publicado en Instagram: ${r.producto}\n${res.permalink || ""}${lineaTiktok}`).catch(() => {});
      if (res.sinMarcaIa) notas.push("Instagram no aceptó la marca de IA: lleva el aviso en el video y en el texto");
      const notaTiktok = notas.length ? ` · ${notas.join(" · ")}` : "";
      return {
        filas: [
          {
            ...base,
            estado: "publicado",
            ig_link: res.permalink || res.mediaId,
            nota: `Publicado en Instagram${notaTiktok}`.slice(0, 480),
            actualizado: ahoraTexto(),
          },
        ],
      };
    }
    await enviarTexto(
      `📌 Hoy toca publicar a mano: ${r.producto}\n(${res.motivo})\nEl video está en la carpeta salida: ${r.archivo}`,
    ).catch(() => {});
    return { filas: [{ ...base, estado: "publicar_a_mano", nota: res.motivo, actualizado: ahoraTexto() }] };
  } catch (e) {
    log(`Error publicando en Instagram: ${e.message}`);
    await enviarTexto(
      `❌ No pude publicar en Instagram (${r.producto}): ${e.message}\nPara reintentar, volvé a poner "aprobado" en la planilla.`,
    ).catch(() => {});
    return { filas: [{ ...base, estado: "error_ig", nota: e.message.slice(0, 480), actualizado: ahoraTexto() }] };
  } finally {
    publicando = false;
  }
}
