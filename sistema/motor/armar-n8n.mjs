// Arma el flujo de n8n (n8n/flujo.json) con los datos del .env, listo para importar.
//   npm run n8n                  → arma el archivo (para importarlo desde la pantalla de n8n)
//   npm run n8n -- --importar    → además lo sube a n8n por su API y lo activa (si ya estaba, lo actualiza).
//                                  Necesita N8N_API_KEY en el .env: se crea en n8n (Settings → n8n API) solo
//                                  para esto, la carga el dueño con npm run cargar-clave y se revoca al terminar.
// El archivo lleva la clave del motor: queda con permisos 600 y no se copia ni se sube a ningún lado.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG, RAIZ } from "./config.mjs";
import { COLUMNAS_CALENDARIO } from "./flujo.mjs";

const PLANILLA = CONFIG.n8n.planillaId || "PEGAR_ACA_EL_ID_DE_LA_PLANILLA";
const MOTOR = (CONFIG.n8n.motorUrl || `http://127.0.0.1:${CONFIG.puerto}`).replace(/\/+$/, "");
const CRED_ID = CONFIG.n8n.credId;
const CRED_NOMBRE = CONFIG.n8n.credNombre;
const RUTA_WEBHOOK = new URL(CONFIG.n8nWebhook).pathname.replace(/^\/webhook(-test)?\//, "") || "videos-redes-respuesta";

// IDs con forma de UUID y estables (el mismo flujo siempre sale igual).
function uuidDe(texto) {
  const h = createHash("sha1").update(`videos-redes|${texto}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
let n = 0;
const id = () => uuidDe(`nodo-${++n}`);

const credencial = () => ({ googleSheetsOAuth2Api: { id: CRED_ID, name: CRED_NOMBRE } });
const documento = () => ({ __rl: true, value: PLANILLA, mode: "id" });
const hoja = (nombre) => ({ __rl: true, value: nombre, mode: "name" });

function leerHoja(nombre, titulo, pos) {
  return {
    id: id(),
    name: titulo,
    type: "n8n-nodes-base.googleSheets",
    typeVersion: 4.5,
    position: pos,
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { operation: "read", documentId: documento(), sheetName: hoja(nombre), options: {} },
    credentials: credencial(),
  };
}

function guardarFilas(titulo, pos) {
  return {
    id: id(),
    name: titulo,
    type: "n8n-nodes-base.googleSheets",
    typeVersion: 4.5,
    position: pos,
    parameters: {
      operation: "appendOrUpdate",
      documentId: documento(),
      sheetName: hoja("Calendario"),
      columns: {
        mappingMode: "autoMapInputData",
        value: {},
        matchingColumns: ["fecha"],
        schema: COLUMNAS_CALENDARIO.map((c) => ({
          id: c,
          displayName: c,
          required: false,
          defaultMatch: false,
          display: true,
          type: "string",
          canBeUsedToMatch: true,
          removed: false,
        })),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: { cellFormat: "RAW" },
    },
    credentials: credencial(),
  };
}

function motor(titulo, ruta, pos, { cuerpo, timeoutMin = 15, extra = {} } = {}) {
  const parametros = {
    method: "POST",
    url: `${MOTOR}${ruta}`,
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "x-motor-clave", value: CONFIG.clave || "" }] },
    options: { timeout: timeoutMin * 60000, batching: { batch: { batchSize: 1, batchInterval: 0 } } },
  };
  if (cuerpo) {
    parametros.sendBody = true;
    parametros.specifyBody = "json";
    parametros.jsonBody = cuerpo;
  }
  return { id: id(), name: titulo, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos, parameters: parametros, ...extra };
}

function partir(titulo, campo, pos) {
  return {
    id: id(),
    name: titulo,
    type: "n8n-nodes-base.splitOut",
    typeVersion: 1,
    position: pos,
    parameters: { fieldToSplitOut: campo, options: {} },
  };
}

function reloj(titulo, cron, pos) {
  return {
    id: id(),
    name: titulo,
    type: "n8n-nodes-base.scheduleTrigger",
    typeVersion: 1.2,
    position: pos,
    parameters: { rule: { interval: [{ field: "cronExpression", expression: cron }] } },
  };
}

function codigo(titulo, js, pos, modo = "runOnceForAllItems") {
  const parametros = { jsCode: js };
  if (modo !== "runOnceForAllItems") parametros.mode = modo;
  return { id: id(), name: titulo, type: "n8n-nodes-base.code", typeVersion: 2, position: pos, parameters: parametros };
}

function nota(contenido, pos, ancho, alto, color = 7) {
  return {
    id: id(),
    name: `Nota ${n}`,
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: pos,
    parameters: { content: contenido, width: ancho, height: alto, color },
  };
}

const nodos = [];
const conexiones = {};
const unir = (de, a, salida = 0) => {
  conexiones[de] ??= { main: [] };
  while (conexiones[de].main.length <= salida) conexiones[de].main.push([]);
  conexiones[de].main[salida].push({ node: a, type: "main", index: 0 });
};

// ---------- Rama 1: planificar y generar ----------
const cuerpoPlanificar =
  "={{ JSON.stringify({ productos: $('Leer Productos').all().map(i => i.json), calendario: $('Leer Calendario').all().map(i => i.json) }) }}";
nodos.push(
  nota(
    `## 🎬 Videos diarios ${CONFIG.marca}\n**1. Generar:** cada hora (8 a 21 h) agenda los días que faltan y genera hasta ${CONFIG.maxPorCorrida} videos. Cada video te llega a Telegram para aprobar.\n**2. Respuestas:** los botones de Telegram cambian el estado en la planilla. *Rehacer* lo vuelve a generar al toque.\n**3. Publicar:** cada 15 min; desde la hora de publicación (config/negocio.json) sube el video aprobado del día a Instagram y, por Buffer, a TikTok y YouTube Shorts.\n**4. Revisión:** los lunes revisa que Instagram y Buffer sigan conectados.\n\nTodo el trabajo pesado lo hace el **motor** (servicio en esta PC).`,
    [-420, -260],
    380,
    420,
    4,
  ),
  reloj("Cada hora (8 a 21 h)", "0 8-21 * * *", [0, 0]),
  leerHoja("Productos", "Leer Productos", [220, 0]),
  leerHoja("Calendario", "Leer Calendario", [440, 0]),
  motor("Motor: planificar", "/planificar", [660, 0], { cuerpo: cuerpoPlanificar, timeoutMin: 2, extra: { executeOnce: true } }),
  partir("Días nuevos", "filas_nuevas", [880, -120]),
  guardarFilas("Agendar días nuevos", [1100, -120]),
  partir("Videos a generar", "a_generar", [880, 120]),
  motor("Motor: generar video", "/generar", [1100, 120], { cuerpo: "={{ JSON.stringify($json) }}", timeoutMin: 20, extra: { onError: "continueErrorOutput" } }),
  codigo(
    "Fila con error",
    [
      "// El motor no respondió: dejamos el día marcado con error para revisarlo.",
      "const original = $('Videos a generar').item?.json || {};",
      "const mensaje = $json.error?.message || $json.error || 'El motor no respondió';",
      "return { json: { fecha: original.fecha, estado: 'error', nota: String(mensaje).slice(0, 450), actualizado: $now.setZone('" + CONFIG.zona + "').toFormat('yyyy-MM-dd HH:mm') } };",
    ].join("\n"),
    [1320, 260],
    "runOnceForEachItem",
  ),
  guardarFilas("Guardar video", [1540, 120]),
);
unir("Cada hora (8 a 21 h)", "Leer Productos");
unir("Leer Productos", "Leer Calendario");
unir("Leer Calendario", "Motor: planificar");
unir("Motor: planificar", "Días nuevos");
unir("Motor: planificar", "Videos a generar");
unir("Días nuevos", "Agendar días nuevos");
unir("Videos a generar", "Motor: generar video");
unir("Motor: generar video", "Guardar video", 0);
unir("Motor: generar video", "Fila con error", 1);
unir("Fila con error", "Guardar video");

// ---------- Rama 2: respuestas de Telegram ----------
nodos.push(
  {
    id: id(),
    name: "Respuesta de Telegram",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [0, 480],
    webhookId: uuidDe("webhook-respuestas"),
    parameters: { httpMethod: "POST", path: RUTA_WEBHOOK, responseMode: "onReceived", options: {} },
  },
  codigo(
    "Leer respuesta",
    [
      `const clave = ${JSON.stringify(CONFIG.clave || "")};`,
      "const salida = [];",
      "for (const item of $input.all()) {",
      "  const b = item.json.body || item.json;",
      "  if (clave && b.clave !== clave) continue;",
      "  if (!b.fecha || !['aprobado', 'rehacer'].includes(b.estado)) continue;",
      "  salida.push({ json: { fecha: String(b.fecha), estado: b.estado, nota: String(b.nota || ''), actualizado: String(b.actualizado || '') } });",
      "}",
      "return salida;",
    ].join("\n"),
    [220, 480],
  ),
  guardarFilas("Guardar respuesta", [440, 480]),
  {
    id: id(),
    name: "¿Pidió rehacer?",
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position: [660, 480],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            id: uuidDe("condicion-rehacer"),
            leftValue: "={{ String($json.estado || '') }}",
            rightValue: "rehacer",
            operator: { type: "string", operation: "equals" },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  },
);
unir("Respuesta de Telegram", "Leer respuesta");
unir("Leer respuesta", "Guardar respuesta");
unir("Guardar respuesta", "¿Pidió rehacer?");
unir("¿Pidió rehacer?", "Leer Productos", 0);

// ---------- Rama 3: publicar en Instagram ----------
nodos.push(
  reloj("Cada 15 min (8 a 23 h)", "*/15 8-23 * * *", [0, 760]),
  leerHoja("Calendario", "Leer Calendario (IG)", [220, 760]),
  motor("Motor: publicar en Instagram", "/publicar-pendientes", [440, 760], {
    cuerpo: "={{ JSON.stringify({ calendario: $('Leer Calendario (IG)').all().map(i => i.json) }) }}",
    timeoutMin: 20,
    extra: { executeOnce: true },
  }),
  partir("Resultado", "filas", [660, 760]),
  guardarFilas("Guardar publicación", [880, 760]),
);
unir("Cada 15 min (8 a 23 h)", "Leer Calendario (IG)");
unir("Leer Calendario (IG)", "Motor: publicar en Instagram");
unir("Motor: publicar en Instagram", "Resultado");
unir("Resultado", "Guardar publicación");

// ---------- Rama 4: renovar el token de Instagram ----------
nodos.push(
  reloj("Lunes 10 h", "0 10 * * 1", [0, 1000]),
  motor("Motor: renovar token IG", "/renovar-token-ig", [220, 1000], { timeoutMin: 2, extra: { onError: "continueRegularOutput" } }),
);
unir("Lunes 10 h", "Motor: renovar token IG");

const flujo = {
  name: `Videos diarios ${CONFIG.marca || "(videos-redes)"}`,
  nodes: nodos,
  connections: conexiones,
  active: false,
  settings: { executionOrder: "v1", timezone: CONFIG.zona, saveManualExecutions: true },
  pinData: {},
  meta: { templateCredsSetupCompleted: Boolean(CRED_ID) },
  tags: [],
};

const destino = process.env.VIDEOS_FLUJO || path.join(RAIZ, "n8n", "flujo.json");
await fs.mkdir(path.dirname(destino), { recursive: true });
await fs.writeFile(destino, JSON.stringify(flujo, null, 2), { mode: 0o600 });
await fs.chmod(destino, 0o600);
console.log(`Flujo armado: ${destino} (permisos 600: lleva la clave del motor)`);
console.log(`  Planilla: ${PLANILLA}${PLANILLA.startsWith("PEGAR") ? "  ⚠️ falta PLANILLA_ID en el .env" : ""}`);
console.log(`  Motor: ${MOTOR}`);
const nodosSheets = nodos.filter((x) => x.type === "n8n-nodes-base.googleSheets").length;
console.log(
  `  Credencial de Google: ${CRED_ID ? CRED_ID : `elegila en n8n en los ${nodosSheets} nodos de Google Sheets (o poné N8N_GOOGLE_CRED_ID en el .env y volvé a correr npm run n8n)`}`,
);

// ---------- Importar por la API de n8n (opcional) ----------
if (process.argv.includes("--importar")) {
  const clave = CONFIG.n8n.apiKey;
  if (!clave) {
    console.log("❌ Falta N8N_API_KEY: creala en n8n (Settings → n8n API) y que el dueño la cargue con npm run cargar-clave -- N8N_API_KEY");
    process.exit(1);
  }
  const base = new URL(CONFIG.n8nWebhook).origin;
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(`${base}/api/v1${ruta}`, {
      method: metodo,
      headers: { "X-N8N-API-KEY": clave, "content-type": "application/json", accept: "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`n8n respondió ${r.status} en ${metodo} ${ruta}: ${d.message || "sin detalle"}`);
    return d;
  };
  try {
    const datos = { name: flujo.name, nodes: flujo.nodes, connections: flujo.connections, settings: flujo.settings };
    const lista = await pedir("GET", "/workflows?limit=250");
    const existente = (lista.data || []).find((w) => w.name === flujo.name);
    const w = existente ? await pedir("PUT", `/workflows/${existente.id}`, datos) : await pedir("POST", "/workflows", datos);
    await pedir("POST", `/workflows/${w.id}/activate`);
    console.log(`✅ Flujo ${existente ? "actualizado" : "importado"} y activo en n8n (id ${w.id}).`);
    if (!CRED_ID) console.log("⚠️ Sin N8N_GOOGLE_CRED_ID: elegí la credencial de Google en los nodos de Google Sheets desde la pantalla de n8n.");
    console.log("Ahora revocá la clave de la API de n8n (Settings → n8n API) y sacala del .env: npm run cargar-clave -- N8N_API_KEY --borrar");
  } catch (e) {
    console.log(`❌ No pude importar el flujo: ${e.message}`);
    process.exit(1);
  }
}
