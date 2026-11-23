// Diagnóstico: revisa que todo esté listo y dice qué falta. No publica nada.
//   npm run chequeo               → revisa sin gastar nada
//   npm run chequeo -- --completo → además manda un mensaje de prueba por Telegram y prueba la IA de los textos (Gemini)
import { existsSync } from "node:fs";
import { CONFIG, RUTAS, datosDeLinea, lineas } from "./config.mjs";
import { caminoInstagram, cupoInstagram, instagramConfigurado, probarInstagram, wordpressConfigurado } from "./instagram.mjs";
import { textosDePlantilla } from "./plantillas.mjs";
import { bufferConfigurado, canalesBuffer } from "./buffer.mjs";
import { api, enviarTexto } from "./telegram.mjs";
import { controlar, modoTextos, probarIA } from "./textos.mjs";
import { correr, fechaLocal, sumarDias, traer } from "./util.mjs";

const completo = process.argv.includes("--completo");
let fallas = 0;
const ok = (t) => console.log(`✅ ${t}`);
const mal = (t, arreglo) => {
  fallas++;
  console.log(`❌ ${t}${arreglo ? `\n   → ${arreglo}` : ""}`);
};
const aviso = (t) => console.log(`⚪ ${t}`);

async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    mal(`${nombre}: ${e.message}`);
  }
}

console.log("Chequeo del sistema de videos (no publica nada)\n");

await paso("Datos del negocio", async () => {
  if (!existsSync(CONFIG.archivoNegocio)) return mal("No existe config/negocio.json", "Copiá config/negocio.example.json como config/negocio.json y completalo");
  if (CONFIG.errorNegocio) return mal(`config/negocio.json tiene un error: ${CONFIG.errorNegocio}`, "Corregí el archivo (tiene que ser JSON válido)");
  const faltan = [];
  if (!CONFIG.marca) faltan.push("nombre");
  if (!CONFIG.web) faltan.push("web");
  if (!CONFIG.queVende) faltan.push("que_vende");
  if (faltan.length) mal(`config/negocio.json: falta ${faltan.join(", ")}`, "Completalo: lo usan los textos y el cierre del video");
  else ok(`Negocio: ${CONFIG.marca} · ${CONFIG.web} · publica a las ${CONFIG.horaPublicacion} (${CONFIG.zona}) · estilo ${CONFIG.estilo}`);
  if (CONFIG.pausado) aviso("EN PAUSA (pausado en config/negocio.json): no se agenda, no se genera y no se publica nada");
  if (!CONFIG.productoPrueba?.producto) aviso("Falta producto_prueba en config/negocio.json (lo usa npm run prueba)");
});

await paso("Node.js", async () => {
  const mayor = Number(process.versions.node.split(".")[0]);
  mayor >= 22 ? ok(`Node.js ${process.versions.node}`) : mal(`Node.js ${process.versions.node} es viejo`, "Instalá Node 22 o más nuevo");
});

await paso("FFmpeg", async () => {
  const a = await correr("ffmpeg", ["-version"], { timeoutMs: 20000 });
  const b = await correr("ffprobe", ["-version"], { timeoutMs: 20000 });
  a.codigo === 0 && b.codigo === 0 ? ok(a.salida.split("\n")[0]) : mal("FFmpeg no responde", "sudo apt install -y ffmpeg");
});

await paso("GSAP", async () => {
  existsSync(RUTAS.gsap) ? ok("GSAP instalado (animaciones del video)") : mal("Falta GSAP", "Corré: npm install");
});

await paso("HyperFrames", async () => {
  if (!existsSync(RUTAS.hyperframes)) return mal("HyperFrames no está instalado", "Corré: npm install");
  const env = { HYPERFRAMES_NO_TELEMETRY: "1" };
  if (CONFIG.render.navegador) env.HYPERFRAMES_BROWSER_PATH = CONFIG.render.navegador;
  const r = await correr(process.execPath, [RUTAS.hyperframes, "doctor", "--json"], { env, timeoutMs: 120000 });
  const json = r.salida.slice(r.salida.indexOf("{"));
  const d = JSON.parse(json);
  const chrome = (d.checks || []).find((c) => c.name === "Chrome");
  chrome?.ok
    ? ok(`HyperFrames listo · Chrome: ${chrome.detail}`)
    : mal(
        `HyperFrames no encuentra Chrome (${chrome?.detail || "sin dato"})`,
        "Corré: npx hyperframes browser ensure  (o cargá HYPERFRAMES_BROWSER_PATH con npm run cargar-clave -- HYPERFRAMES_BROWSER_PATH --valor /usr/bin/google-chrome)",
      );
});

await paso("Letras", async () => {
  if (process.platform !== "linux") return aviso("Letras: revisá a mano que estén instaladas Inter (y Archivo Black para el estilo clásico)");
  const r = await correr("fc-list", [], { timeoutMs: 20000 }).catch(() => null);
  if (!r || r.codigo !== 0) return aviso("No pude revisar las letras instaladas (fc-list)");
  const hay = (nombre) => r.salida.toLowerCase().includes(nombre);
  const faltan = [];
  if (!hay("inter")) faltan.push("Inter");
  if (CONFIG.estilo === "clasico" && !hay("archivo black")) faltan.push("Archivo Black");
  faltan.length
    ? mal(`Falta la letra ${faltan.join(" y ")}`, "Inter: sudo apt install -y fonts-inter · Archivo Black: bajala de fonts.google.com a ~/.local/share/fonts")
    : ok("Letras del video instaladas");
});

existsSync(CONFIG.archivoEnv) ? ok(`Configuración: ${CONFIG.archivoEnv}`) : mal("No existe el archivo .env", "Corré: cp -n .env.example .env && chmod 600 .env");

await paso("Motor", async () => {
  const headers = CONFIG.clave ? { "x-motor-clave": CONFIG.clave } : {};
  const host = CONFIG.host === "0.0.0.0" ? "127.0.0.1" : CONFIG.host;
  try {
    const r = await traer(`http://${host}:${CONFIG.puerto}/estado`, { headers }, 5000);
    const d = await r.json();
    d.ok ? ok(`Motor andando (v${d.version}) en ${host}:${CONFIG.puerto}`) : mal("El motor respondió con error");
  } catch {
    mal("El motor no está corriendo", "systemctl --user start videos-redes   (o: npm start para probar)");
  }
});

await paso("Estilo del video", async () => {
  if (!existsSync(`${RUTAS.plantilla}/index.html`)) return mal(`Falta la plantilla del estilo ${CONFIG.estilo} (${RUTAS.plantilla})`, "Volvé a copiar la carpeta del sistema desde el plugin");
  const colores = CONFIG.estilo === "cajas" ? ` · colores ${CONFIG.colores.principal || "#F7CE00 (por defecto)"} y ${CONFIG.colores.oscuro || "#0B0B0B (por defecto)"}` : " · colores de config/lineas.json";
  ok(`Estilo del video: ${CONFIG.estilo}${colores} · WhatsApp en el cierre: ${CONFIG.whatsapp || "no"}`);
});

await paso("Plantillas de textos", async () => {
  // Son el respaldo de la IA (y los textos de todos los días si no hay clave): todas las frases tienen que pasar el control.
  const todas = lineas();
  const claves = Object.keys(todas).filter((k) => !k.startsWith("_"));
  const ejemplos = [];
  for (const k of claves.length ? claves : ["default"]) {
    const nombre = todas[k]?.nombre || "Producto";
    ejemplos.push([k, `${nombre} 30x40 x100 unid`, ""], [k, nombre, ""]);
  }
  const p = CONFIG.productoPrueba;
  if (p?.producto) ejemplos.push([p.linea || "default", p.producto, p.detalles || ""]);
  const problemas = [];
  let combinaciones = 0;
  for (const [lineaClave, producto, detalles] of ejemplos) {
    const linea = datosDeLinea(lineaClave);
    for (let dia = 0; dia < 60; dia++) {
      const datos = { fecha: sumarDias(fechaLocal(), dia), producto, lineaClave, linea, detalles, mostrarPrecio: false, precio: "" };
      const t = textosDePlantilla(datos);
      const rehecho = textosDePlantilla({ ...datos, anteriores: t });
      for (const x of [t, rehecho]) {
        combinaciones++;
        const pr = controlar(x, { mostrarPrecio: false, lineaClave });
        if (pr.length) problemas.push(`${producto.slice(0, 28)}…: ${pr.join("; ")}`);
      }
    }
  }
  problemas.length
    ? mal(`Plantillas de textos: ${[...new Set(problemas)].slice(0, 3).join(" | ")}`, "Revisá config/textos-plantillas.json")
    : ok(`Plantillas de textos OK (${combinaciones} combinaciones controladas)`);
});

await paso("Textos", async () => {
  const modo = modoTextos();
  const forzado = CONFIG.textos.modo;
  if (modo === "plantillas") {
    if (forzado === "gemini") return mal("TEXTOS_MODO=gemini pero falta GEMINI_API_KEY", "Creala en aistudio.google.com/apikey y cargala con npm run cargar-clave -- GEMINI_API_KEY");
    if (forzado === "claude") return mal("TEXTOS_MODO=claude pero falta ANTHROPIC_API_KEY");
    return aviso("Textos: los arman las plantillas, sin IA. Para que los escriba Gemini, cargá GEMINI_API_KEY con npm run cargar-clave");
  }
  const quien = modo === "gemini" ? `Gemini (modelo ${CONFIG.gemini.modelo})` : `Claude (modelo ${CONFIG.claude.modelo})`;
  if (!completo) return ok(`Textos: los escribe ${quien}; con --completo lo pruebo`);
  try {
    const r = await probarIA();
    ok(`Textos: ${modo === "gemini" ? "Gemini" : "Claude"} responde (modelo ${r.modelo})`);
    if (modo === "gemini" && r.modelo !== CONFIG.gemini.modelo) {
      aviso(`El modelo ${CONFIG.gemini.modelo} no anduvo y respondió ${r.modelo}: corré npm run cargar-clave -- GEMINI_MODELO --valor ${r.modelo}`);
    }
  } catch (e) {
    mal(
      `Textos: ${e.message}`,
      modo === "gemini"
        ? "Revisá GEMINI_API_KEY (aistudio.google.com/apikey). Mientras tanto los videos salen igual, con las plantillas."
        : "Revisá ANTHROPIC_API_KEY, CLAUDE_MODELO y el crédito. Mientras tanto los videos salen con las plantillas.",
    );
  }
});

await paso("Telegram", async () => {
  if (!CONFIG.telegram.token) return mal("Falta TELEGRAM_BOT_TOKEN", "Crealo con @BotFather en Telegram (/newbot) y cargalo con npm run cargar-clave -- TELEGRAM_BOT_TOKEN");
  const yo = await api("getMe");
  if (!CONFIG.telegram.chat) {
    return mal(
      `Bot @${yo.username} OK, pero falta TELEGRAM_CHAT_ID`,
      `Con el motor andando, mandale /id a @${yo.username} y cargá el número con npm run cargar-clave -- TELEGRAM_CHAT_ID --valor <número>`,
    );
  }
  if (completo) await enviarTexto("👋 Prueba del sistema de videos: si ves esto, Telegram anda.");
  ok(`Telegram: bot @${yo.username}, chat ${CONFIG.telegram.chat}${completo ? " (te mandé un mensaje de prueba)" : ""}`);
});

await paso("n8n", async () => {
  const base = new URL(CONFIG.n8nWebhook).origin;
  try {
    const r = await traer(`${base}/healthz`, {}, 5000);
    r.ok ? ok(`n8n responde en ${base}`) : mal(`n8n respondió ${r.status} en ${base}`);
  } catch {
    mal(`No encuentro n8n en ${base}`, "Levantalo con: cd n8n && docker compose up -d   (revisá N8N_WEBHOOK_RESPUESTAS en el .env)");
  }
  if (!CONFIG.n8n.planillaId) aviso("Falta PLANILLA_ID en el .env (npm run cargar-clave -- PLANILLA_ID --valor <id>); después, npm run n8n");
});

await paso("Instagram", async () => {
  if (!instagramConfigurado()) return aviso("Instagram sin configurar: los videos aprobados te van a llegar para publicar a mano (conectalo con npm run ig-conectar)");
  const porFacebook = caminoInstagram() === "facebook";
  const yo = await probarInstagram();
  const camino = porFacebook ? "vía Facebook, el video se sube directo a Meta" : "vía Instagram, con WordPress";
  ok(`Instagram conectado: @${yo.username} (id ${yo.user_id || CONFIG.instagram.userId}, ${camino})`);
  if (porFacebook) {
    const c = await cupoInstagram();
    ok(`Cupo de Instagram: ${c.usado} de ${c.total} publicaciones en las últimas 24 h`);
  }
});

await paso("WordPress", async () => {
  const loNecesita = instagramConfigurado() && caminoInstagram() !== "facebook";
  if (!wordpressConfigurado()) {
    if (loNecesita) {
      return mal("Falta la clave de aplicación de WordPress (la necesita Instagram)", "WordPress → Usuarios → Perfil → Contraseñas de aplicación");
    }
    return aviso(
      instagramConfigurado()
        ? "WordPress no hace falta: el video se sube directo a Meta"
        : "WordPress sin configurar (no hace falta si conectás Instagram por Facebook)",
    );
  }
  const auth = "Basic " + Buffer.from(`${CONFIG.wordpress.usuario}:${CONFIG.wordpress.clave}`).toString("base64");
  const r = await traer(`${CONFIG.wordpress.url}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: auth } }, 20000);
  const d = await r.json().catch(() => ({}));
  r.ok ? ok(`WordPress: entra como ${d.name || CONFIG.wordpress.usuario}`) : mal(`WordPress respondió ${r.status}: ${d.message || ""}`, "Revisá WP_USUARIO y WP_CLAVE_APLICACION");
});

await paso("TikTok y YouTube (Buffer)", async () => {
  if (!bufferConfigurado()) {
    return aviso("TikTok y YouTube sin configurar: los videos quedan en la carpeta salida para subirlos a mano (cargá BUFFER_API_KEY con npm run cargar-clave)");
  }
  const canales = await canalesBuffer();
  const nombres = { tiktok: ["TikTok", "BUFFER_TIKTOK"], youtube: ["YouTube Shorts", "BUFFER_YOUTUBE"] };
  for (const [red, [nombre, variable]] of Object.entries(nombres)) {
    const c = canales[red];
    const primera = nombre.split(" ")[0];
    if (!c && (canales.avisos || []).some((a) => a.includes(`cuentas de ${primera} `) || a.startsWith(`${primera} está conectado`))) continue; // lo explica el aviso
    if (!c) {
      const apagada = CONFIG.buffer.redes.length && !CONFIG.buffer.redes.includes(red);
      aviso(apagada ? `${nombre}: desactivado con BUFFER_REDES` : `${nombre}: no está conectado en Buffer (Buffer → Connect channel)`);
      continue;
    }
    if (c.pausado) {
      aviso(`${nombre} por Buffer: ${c.nombre}, pero la cola está en pausa en Buffer (reanudala en Buffer)`);
      continue;
    }
    ok(`${nombre} por Buffer: ${c.nombre}${c.cantidad > 1 ? ` (hay ${c.cantidad} cuentas; elegí con ${variable})` : ""}`);
  }
  for (const a of canales.avisos || []) {
    if (a.startsWith("Hay ")) mal(a, "Cargá el nombre con npm run cargar-clave y reiniciá el motor");
    else aviso(a);
  }
  if (!instagramConfigurado()) aviso("TikTok y YouTube usan el video que publica Instagram: sin Instagram, no salen solos");
});

console.log(fallas ? `\nHay ${fallas} cosa(s) para resolver.` : "\nTodo listo. 🎬");
process.exit(fallas ? 1 : 0);
