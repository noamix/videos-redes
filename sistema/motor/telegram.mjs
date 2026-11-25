// Telegram: manda cada video para revisar con botones Aprobar / Rehacer y escucha las respuestas.
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG, RUTAS } from "./config.mjs";
import { instagramConfigurado } from "./instagram.mjs";
import { horarioVozTexto, soloUrgentes } from "./voz.mjs";
import { ahoraTexto, enRangoHorario, escribirJson, esperar, fechaLocal, leerJson, log, sumarDias, traer } from "./util.mjs";

// En las horas de TELEGRAM_SILENCIO (por defecto de 23 a 7) los mensajes llegan sin sonido.
export const enSilencio = (d = new Date()) => enRangoHorario(CONFIG.telegram.silencio, d);

const ESTADO = path.join(RUTAS.datos, "telegram.json");
const PENDIENTES = path.join(RUTAS.datos, "respuestas-pendientes.json");

export function telegramConfigurado() {
  return Boolean(CONFIG.telegram.token && CONFIG.telegram.chat);
}

export async function api(metodo, cuerpo = {}, timeoutMs = 60000) {
  if (!CONFIG.telegram.token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el .env");
  const url = `${CONFIG.telegram.base}/bot${CONFIG.telegram.token}/${metodo}`;
  const opciones = { method: "POST" };
  if (cuerpo instanceof FormData) {
    opciones.body = cuerpo;
  } else {
    opciones.headers = { "content-type": "application/json" };
    opciones.body = JSON.stringify(cuerpo);
  }
  const r = await traer(url, opciones, timeoutMs);
  const datos = await r.json().catch(() => ({}));
  if (!datos.ok) throw new Error(`Telegram ${metodo}: ${datos.description || r.status}`);
  return datos.result;
}

export function fechaBonita(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export async function enviarTexto(texto) {
  if (!telegramConfigurado()) return null;
  return api("sendMessage", {
    chat_id: CONFIG.telegram.chat,
    text: texto.slice(0, 4000),
    disable_web_page_preview: true,
    disable_notification: enSilencio(),
  });
}

export async function enviarRevision({ fecha, producto, ruta, caption, avisos = [], rehecho = false, prueba = false, frasesVoz = null }) {
  if (!telegramConfigurado()) return null;
  const silencio = enSilencio();
  const voz = frasesVoz?.length ? `🎙️ Voz: ${frasesVoz.map((f) => `«${f}»`).join(" ")}` : "";
  const cabecera = [
    prueba ? "🧪 VIDEO DE PRUEBA: los botones no cambian la planilla." : "",
    `🎬 ${rehecho ? "Nueva versión · " : ""}${fechaBonita(fecha)} · ${producto}`,
    voz,
    avisos.length ? `⚠️ ${avisos.join(" · ")}` : "",
    "",
    instagramConfigurado()
      ? `Si lo aprobás, sale en Instagram el ${fechaBonita(fecha)} a las ${CONFIG.horaPublicacion}.`
      : `Si lo aprobás, el ${fechaBonita(fecha)} a las ${CONFIG.horaPublicacion} te aviso para subirlo.`,
    "En el mensaje siguiente va el texto para el posteo (y para TikTok).",
  ]
    .filter((l, i) => l || i === 4) // la línea en blanco separa los avisos de lo que pasa al aprobar
    .join("\n")
    .slice(0, 1000);
  const form = new FormData();
  form.append("chat_id", CONFIG.telegram.chat);
  form.append("caption", cabecera);
  form.append("supports_streaming", "true");
  if (silencio) form.append("disable_notification", "true");
  form.append("width", "1080");
  form.append("height", "1920");
  form.append("duration", "15");
  form.append(
    "reply_markup",
    JSON.stringify({
      inline_keyboard: [
        [
          { text: "✅ Aprobar", callback_data: `${prueba ? "pk" : "ok"}|${fecha}` },
          { text: "🔁 Rehacer", callback_data: `${prueba ? "pr" : "re"}|${fecha}` },
        ],
      ],
    }),
  );
  const buf = await fs.readFile(ruta);
  form.append("video", new Blob([buf], { type: "video/mp4" }), path.basename(ruta));
  const msg = await api("sendVideo", form, 180000);
  await api("sendMessage", {
    chat_id: CONFIG.telegram.chat,
    text: caption.slice(0, 4000),
    disable_web_page_preview: true,
    disable_notification: silencio,
  });
  return msg.message_id;
}

// ---------- Respuestas (botones) ----------

async function avisarN8n(respuesta) {
  const r = await traer(
    CONFIG.n8nWebhook,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...respuesta, clave: CONFIG.clave || "" }),
    },
    30000,
  );
  if (!r.ok) throw new Error(`n8n respondió ${r.status} (¿está activo el flujo?)`);
}

async function encolar(respuesta) {
  const lista = await leerJson(PENDIENTES, []);
  lista.push(respuesta);
  await escribirJson(PENDIENTES, lista);
}

async function reintentarPendientes() {
  const lista = await leerJson(PENDIENTES, []);
  if (!lista.length) return;
  const quedan = [];
  for (const r of lista) {
    try {
      await avisarN8n(r);
    } catch {
      quedan.push(r);
    }
  }
  await escribirJson(PENDIENTES, quedan);
  if (quedan.length < lista.length) log(`Respuestas reenviadas a n8n: ${lista.length - quedan.length}`);
}

async function procesar(u, alDecidir) {
  const miChat = String(CONFIG.telegram.chat);
  if (u.callback_query) {
    const cq = u.callback_query;
    const chat = String(cq.message?.chat?.id ?? "");
    const [codigo, fecha] = String(cq.data || "").split("|");
    if (chat === miChat && ["pk", "pr"].includes(codigo)) {
      await api("answerCallbackQuery", { callback_query_id: cq.id, text: "Es un video de prueba: no cambia la planilla 👍" }).catch(() => {});
      await api("editMessageReplyMarkup", {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: "🧪 Prueba (sin efecto)", callback_data: "nada|x" }]] },
      }).catch(() => {});
      return;
    }
    if (chat !== miChat || !["ok", "re"].includes(codigo) || !fecha) {
      await api("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
      return;
    }
    const estado = codigo === "ok" ? "aprobado" : "rehacer";
    // Con voz y VOZ_HORARIO, fuera del horario solo se rehacen al toque los videos urgentes; el resto, en el horario de la voz.
    const deNoche = estado === "rehacer" && soloUrgentes() && fecha > sumarDias(fechaLocal(), CONFIG.voz.urgenteDias);
    await api("answerCallbackQuery", {
      callback_query_id: cq.id,
      text:
        estado === "aprobado"
          ? "Aprobado ✅"
          : deNoche
            ? `Lo rehago con la voz, ${horarioVozTexto()} 🔁 Te llega cuando esté.`
            : "Lo rehago con otros textos 🔁",
    }).catch(() => {});
    await api("editMessageReplyMarkup", {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: estado === "aprobado" ? "✅ Aprobado" : deNoche ? "🔁 Se rehace con la voz" : "🔁 Rehaciendo…", callback_data: "nada|x" }],
        ],
      },
    }).catch(() => {});
    const respuesta = {
      fecha,
      estado,
      actualizado: ahoraTexto(),
      nota:
        estado === "aprobado"
          ? "Aprobado en Telegram"
          : `Pedido de rehacer desde Telegram${deNoche ? ` (se rehace con la voz, ${horarioVozTexto()})` : ""}`,
    };
    log(`Telegram: ${estado} ${fecha}`);
    if (alDecidir) alDecidir(respuesta);
    try {
      await avisarN8n(respuesta);
    } catch (e) {
      log(`No pude avisar a n8n (${e.message}); lo reintento cada minuto.`);
      await encolar(respuesta);
    }
    return;
  }
  const m = u.message;
  if (m?.text) {
    const texto = m.text.trim().toLowerCase();
    if (texto.startsWith("/start") || texto.startsWith("/id")) {
      // El ID del chat no es secreto (sin el token no sirve): queda en el log para cargarlo en el .env.
      log(`Telegram: ${texto.split(/\s/)[0]} desde el chat ${m.chat.id}${m.from?.username ? ` (@${m.from.username})` : ""}`);
      await api("sendMessage", {
        chat_id: m.chat.id,
        text: `El ID de este chat es: ${m.chat.id}\nPasáselo a Claude, o cargalo vos en la carpeta del sistema con:\nnpm run cargar-clave -- TELEGRAM_CHAT_ID --valor ${m.chat.id}\ny reiniciá el motor.`,
      }).catch(() => {});
    }
  }
}

let escuchando = false;

export async function iniciarEscucha(alDecidir) {
  if (escuchando || !CONFIG.telegram.token) return;
  escuchando = true;
  await fs.mkdir(RUTAS.datos, { recursive: true });
  setInterval(() => reintentarPendientes().catch(() => {}), 60000).unref();
  let { offset = 0 } = await leerJson(ESTADO, {});
  log("Escuchando los botones de Telegram…");
  while (escuchando) {
    try {
      const updates = await api(
        "getUpdates",
        { offset, timeout: 50, allowed_updates: ["callback_query", "message"] },
        70000,
      );
      for (const u of updates) {
        offset = u.update_id + 1;
        await escribirJson(ESTADO, { offset });
        await procesar(u, alDecidir).catch((e) => log(`Error procesando un mensaje de Telegram: ${e.message}`));
      }
    } catch (e) {
      log(`Telegram (escucha): ${e.message}. Reintento en 20 s.`);
      await esperar(20000);
    }
  }
}

export function detenerEscucha() {
  escuchando = false;
}
