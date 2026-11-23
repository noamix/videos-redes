// Servidor del motor: n8n lo llama por HTTP (solo desde esta PC, salvo que se configure MOTOR_CLAVE).
// Antes de cada pedido vuelve a leer config/negocio.json si cambió (hora, estilo, pausa…), sin reiniciar.
import http from "node:http";
import fs from "node:fs/promises";
import { CONFIG, RUTAS, VERSION, refrescarNegocio } from "./config.mjs";
import { generar, ocupado, planificar, publicarPendientes } from "./flujo.mjs";
import { caminoInstagram, instagramConfigurado, renovarToken, wordpressConfigurado } from "./instagram.mjs";
import { enviarTexto, iniciarEscucha, telegramConfigurado } from "./telegram.mjs";
import { modoTextos } from "./textos.mjs";
import { bufferConfigurado, canalesBuffer } from "./buffer.mjs";
import { borrarViejos, log } from "./util.mjs";

const LOCALES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function responder(res, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(cuerpo) });
  res.end(cuerpo);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => {
      datos += c;
      if (datos.length > 10 * 1024 * 1024) reject(new Error("Pedido demasiado grande"));
    });
    req.on("end", () => {
      if (!datos.trim()) return resolve({});
      try {
        resolve(JSON.parse(datos));
      } catch {
        reject(new Error("El cuerpo no es un JSON válido"));
      }
    });
    req.on("error", reject);
  });
}

function autorizado(req) {
  if (CONFIG.clave) return req.headers["x-motor-clave"] === CONFIG.clave;
  return LOCALES.has(req.socket.remoteAddress);
}

const rutas = {
  "GET /estado": async () => ({
    ok: true,
    version: VERSION,
    ocupado: ocupado(),
    telegram: telegramConfigurado(),
    textos: modoTextos(),
    estilo: CONFIG.estilo,
    marca: CONFIG.marca,
    pausado: CONFIG.pausado,
    hora_publicacion: CONFIG.horaPublicacion,
    instagram: instagramConfigurado(),
    instagram_camino: instagramConfigurado() ? caminoInstagram() : null,
    tiktok: bufferConfigurado(),
    buffer: bufferConfigurado(),
    wordpress: wordpressConfigurado(),
  }),
  "POST /planificar": async (cuerpo) => planificar(cuerpo),
  "POST /generar": async (cuerpo) => generar(cuerpo),
  "POST /publicar-pendientes": async (cuerpo) => publicarPendientes(cuerpo),
  "POST /renovar-token-ig": async () => {
    // Los lunes: revisa Instagram y TikTok (Buffer) y avisa por Telegram si alguno se cortó.
    let tiktok = null;
    if (bufferConfigurado()) {
      try {
        const canales = await canalesBuffer();
        tiktok = { ok: true };
        for (const [red, nombre] of [["tiktok", "TikTok"], ["youtube", "YouTube"]]) {
          const c = canales[red];
          tiktok[red] = c ? { cuenta: c.nombre, pausado: c.pausado } : null;
          if (c?.pausado) await enviarTexto(`⚠️ ${nombre}: la cola de ${c.nombre} está en pausa en Buffer. Reanudala para que publique.`).catch(() => {});
        }
      } catch (e) {
        tiktok = { ok: false, error: e.message };
        await enviarTexto(`⚠️ Buffer: ${e.message}.\nMientras no se arregle, TikTok y YouTube no publican solos.`).catch(() => {});
      }
    }
    try {
      const r = await renovarToken();
      if (r.ok) log(r.omitido ? r.motivo : `Token de Instagram renovado (vence ${r.vence})`);
      return { ...r, tiktok };
    } catch (e) {
      await enviarTexto(`⚠️ Instagram: ${e.message}.\nMientras no se arregle, los videos aprobados no se publican solos.`).catch(() => {});
      return { ok: false, error: e.message, tiktok };
    }
  },
  "POST /aviso": async (cuerpo) => {
    await enviarTexto(String(cuerpo.texto || "").slice(0, 3500));
    return { ok: true };
  },
};

const servidor = http.createServer(async (req, res) => {
  const ruta = `${req.method} ${new URL(req.url, "http://x").pathname.replace(/\/+$/, "") || "/"}`;
  if (!autorizado(req)) return responder(res, 403, { ok: false, error: "No autorizado" });
  if (refrescarNegocio()) {
    log(`Datos del negocio actualizados · Estilo: ${CONFIG.estilo} · Hora: ${CONFIG.horaPublicacion}${CONFIG.pausado ? " · EN PAUSA" : ""}`);
    if (CONFIG.errorNegocio) log(`⚠️ config/negocio.json tiene un error: ${CONFIG.errorNegocio}`);
  }
  const manejador = rutas[ruta];
  if (!manejador) return responder(res, 404, { ok: false, error: `No existe ${ruta}` });
  try {
    const cuerpo = req.method === "POST" ? await leerCuerpo(req) : {};
    responder(res, 200, await manejador(cuerpo));
  } catch (e) {
    log(`Error en ${ruta}: ${e.stack || e.message}`);
    responder(res, 500, { ok: false, error: e.message });
  }
});
servidor.requestTimeout = 0;
servidor.headersTimeout = 60000;

async function limpiar() {
  const viejos = await borrarViejos(RUTAS.salida, CONFIG.diasGuardar, (n) => /\.(mp4|txt)$/i.test(n));
  const trabajos = await borrarViejos(RUTAS.trabajos, 3);
  await borrarViejos(RUTAS.cache, 30);
  if (viejos || trabajos) log(`Limpieza: ${viejos} archivo(s) de salida y ${trabajos} trabajo(s) viejos borrados`);
}

await fs.mkdir(RUTAS.salida, { recursive: true });
await fs.mkdir(RUTAS.datos, { recursive: true });
await limpiar().catch(() => {});
setInterval(() => limpiar().catch(() => {}), 12 * 3600 * 1000).unref();

servidor.listen(CONFIG.puerto, CONFIG.host, () => {
  log(`Motor de videos v${VERSION} (${CONFIG.marca || "sin marca en config/negocio.json"}) escuchando en http://${CONFIG.host}:${CONFIG.puerto}`);
  if (CONFIG.errorNegocio) log(`⚠️ config/negocio.json tiene un error: ${CONFIG.errorNegocio}`);
  if (CONFIG.pausado) log("⏸️ En pausa (config/negocio.json): no se agenda, no se genera y no se publica nada.");
  log(
    `Telegram: ${telegramConfigurado() ? "sí" : "NO"} · Estilo: ${CONFIG.estilo} · Textos: ${modoTextos()} · Instagram: ${instagramConfigurado() ? `sí (vía ${caminoInstagram()})` : "NO"} · TikTok/YouTube: ${bufferConfigurado() ? "sí (Buffer)" : "NO"} · WordPress: ${wordpressConfigurado() ? "sí" : "NO"}`,
  );
  if (CONFIG.host !== "127.0.0.1" && !CONFIG.clave) log("⚠️ Escucha fuera de esta PC sin MOTOR_CLAVE: solo se aceptan pedidos locales.");
});
iniciarEscucha().catch((e) => log(`Telegram: ${e.message}`));

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    log("Cerrando el motor…");
    servidor.close();
    process.exit(0);
  });
}
