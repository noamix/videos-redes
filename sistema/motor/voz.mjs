// Voz en off: le pide las frases al comando de voz y cuida la memoria de la PC.
//   VOZ_MODO=auto (por defecto) arma la voz si VOZ_COMANDO está cargado · VOZ_MODO=no = videos sin voz.
//   VOZ_COMANDO lo carga el instalador de la voz (npm run voz-instalar): es el voz_videos.py de sistema/voz,
//   con VoxCPM2 completa (PyTorch) o liviana (llama.cpp-omni). Sirve cualquier comando que cumpla el mismo
//   contrato (--estado y --pedido, ver sistema/voz/voz_videos.py).
// El comando carga el modelo, genera un WAV por frase y termina: no queda nada prendido.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { correr, enRangoHorario, esperar, log, rangoTexto } from "./util.mjs";

export function vozActiva() {
  return CONFIG.voz.modo !== "no" && Boolean(CONFIG.voz.comando);
}

const conHorario = () => Boolean(String(CONFIG.voz.horario || "").trim());

/** ¿Es la hora de armar voces? Sin VOZ_HORARIO, la voz se arma a cualquier hora. */
export function enHorarioVoz(d = new Date()) {
  return conHorario() ? enRangoHorario(CONFIG.voz.horario, d) : true;
}

/** "de 1 a 6 h" o "a cualquier hora", para los mensajes. */
export function horarioVozTexto() {
  return conHorario() ? `de ${rangoTexto(CONFIG.voz.horario)} h` : "a cualquier hora";
}

/** Con voz y horario, fuera del horario solo se generan los videos urgentes: el resto espera. */
export function soloUrgentes(d = new Date()) {
  return vozActiva() && conHorario() && !enRangoHorario(CONFIG.voz.horario, d);
}

// Parte VOZ_COMANDO en programa y argumentos (acepta rutas entre comillas simples o dobles).
export function partirComando(texto) {
  const partes = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(texto || "")))) partes.push(m[1] ?? m[2] ?? m[3]);
  return partes;
}

// ---------- Memoria ----------
export function memoriaDisponibleMb(archivo = "/proc/meminfo") {
  try {
    const m = readFileSync(archivo, "utf8").match(/^MemAvailable:\s+(\d+)\s+kB/m);
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
}

/** Minutos que lleva la compu sin teclado ni mouse (GNOME, o xprintidle en otros escritorios). null si no se sabe. */
export async function inactividadMin() {
  const env = {};
  if (!process.env.DBUS_SESSION_BUS_ADDRESS) {
    const run = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid ? process.getuid() : 1000}`;
    env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${run}/bus`;
  }
  try {
    const r = await correr(
      "gdbus",
      ["call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", "--object-path", "/org/gnome/Mutter/IdleMonitor/Core",
        "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"],
      { env, timeoutMs: 10000 },
    );
    const m = r.codigo === 0 && r.salida.match(/uint64\s+(\d+)/);
    if (m) return Number(m[1]) / 60000;
  } catch {
    // sin gdbus o sin GNOME
  }
  try {
    const r = await correr("xprintidle", [], { env: { DISPLAY: process.env.DISPLAY || ":0" }, timeoutMs: 10000 });
    const ms = r.codigo === 0 ? Number(String(r.salida).trim()) : NaN;
    if (Number.isFinite(ms)) return ms / 60000;
  } catch {
    // sin xprintidle
  }
  return null;
}

// ---------- Navegador ----------
// El navegador del usuario: Google Chrome, Chromium, Brave o Edge (todos de la familia de Chrome). Se busca el
// proceso principal; los demás procesos del mismo programa (pestañas, GPU, red, audio) son hijos suyos y no se
// tocan: se cierran solos cuando se cierra el principal. Nunca el Chrome de HyperFrames (chrome-headless-shell,
// sin ventana), que es otro programa.
//
// Ojo: los procesos hijos de Chrome reescriben su línea de comandos y en /proc/<pid>/cmdline quedan como un
// solo texto con espacios ("…/chrome --type=renderer …"), no como argumentos separados. Por eso al hijo se
// lo reconoce por el padre (otro proceso del navegador) y por el texto completo, no argumento por argumento.
const RUTA_NAVEGADOR = new RegExp(
  [
    "/opt/google/chrome[^/]*/chrome",
    "/usr/lib/chromium[^/]*/chromium[^/]*",
    "/usr/lib/chromium-browser/chrome",
    "/snap/chromium/[^/]+/usr/lib/chromium-browser/chrome",
    "/opt/brave\\.com/brave[^/]*/brave",
    "/opt/microsoft/msedge[^/]*/msedge",
  ]
    .map((r) => `(?:${r})`)
    .join("|")
    .replace(/^/, "^(?:")
    .concat(")$"),
);
const NO_ES_DEL_USUARIO = /(^|\s)--(headless|remote-debugging|type=)|puppeteer|hyperframes/i;

// Lee un proceso de /proc: { pid, ppid, exe, cmd }. null si no es del usuario o si terminó mientras lo leía.
function leerProceso(pid, uid, base = "/proc") {
  const dir = path.join(base, String(pid));
  try {
    if (uid !== null && statSync(dir).uid !== uid) return null;
    const cmd = readFileSync(path.join(dir, "cmdline"), "utf8").replace(/\0+/g, " ").trim();
    if (!cmd) return null;
    let exe = "";
    try {
      // Si el navegador se actualizó con la ventana abierta, el enlace termina en " (deleted)".
      exe = readlinkSync(path.join(dir, "exe")).replace(/ \(deleted\)$/, "");
    } catch {
      // proceso que ya terminó
    }
    const stat = readFileSync(path.join(dir, "stat"), "utf8");
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    return { pid: Number(pid), ppid, exe, cmd };
  } catch {
    return null;
  }
}

/** Todos los procesos del navegador del usuario: el principal y sus hijos. */
export function procesosChrome(base = "/proc") {
  const uid = process.getuid ? process.getuid() : null;
  let pids = [];
  try {
    pids = readdirSync(base).filter((n) => /^\d+$/.test(n));
  } catch {
    return [];
  }
  const lista = [];
  for (const pid of pids) {
    const p = leerProceso(pid, uid, base);
    if (p && (RUTA_NAVEGADOR.test(p.exe) || (!p.exe && RUTA_NAVEGADOR.test(p.cmd.split(" ")[0])))) lista.push(p);
  }
  return lista;
}

/** Los procesos principales (normalmente uno): los únicos a los que el motor les pide que se cierren. */
export function chromesAbiertos(todos = procesosChrome()) {
  const delNavegador = new Set(todos.map((p) => p.pid));
  return todos
    .filter((p) => !delNavegador.has(p.ppid) && !NO_ES_DEL_USUARIO.test(p.cmd))
    .map((p) => ({ pid: p.pid, ppid: p.ppid, cmd: p.cmd.replace(/\s+/g, " ").slice(0, 120) }));
}

// Los procesos que cuelgan de los principales (hijos, nietos…), según el padre de cada uno.
function descendientes(raices, todos) {
  const hijos = new Map();
  for (const p of todos) {
    if (!hijos.has(p.ppid)) hijos.set(p.ppid, []);
    hijos.get(p.ppid).push(p.pid);
  }
  const vistos = new Set();
  const pila = [...raices];
  while (pila.length) {
    for (const h of hijos.get(pila.pop()) || []) {
      if (!vistos.has(h)) {
        vistos.add(h);
        pila.push(h);
      }
    }
  }
  return [...vistos];
}

const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};

/**
 * Cierre ordenado: SIGTERM solo a los procesos principales, como cuando se apaga la compu (el navegador guarda
 * la sesión y cierra sus hijos). Nunca SIGKILL ni señales a los hijos.
 * Devuelve { cerrado, segundos, quedan }: quedan = procesos hijos que seguían terminando al final.
 */
export async function cerrarChrome(pids, esperaMs = 60000) {
  const inicio = Date.now();
  const hijos = descendientes(pids, procesosChrome());
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ya estaba cerrado
    }
  }
  const fin = inicio + esperaMs;
  while (Date.now() < fin && pids.some(vivo)) await esperar(1000);
  if (pids.some(vivo)) return { cerrado: false, segundos: Math.round((Date.now() - inicio) / 1000), quedan: hijos.filter(vivo).length };
  // El principal ya se cerró: le doy hasta 15 s a sus hijos para terminar (no se los toca).
  const finHijos = Date.now() + 15000;
  while (Date.now() < finHijos && hijos.some(vivo)) await esperar(500);
  return { cerrado: true, segundos: Math.round((Date.now() - inicio) / 1000), quedan: hijos.filter(vivo).length };
}

/**
 * Antes de la voz: mira la memoria y, si falta, dentro de VOZ_HORARIO y con la compu sin usar, cierra el
 * navegador (solo con VOZ_CERRAR_CHROME=si). Devuelve { ok, libre, necesaria, motivo, chromeCerrado, inactivo }.
 */
export async function prepararMemoria({ ahora = new Date(), permitirCerrarChrome = true } = {}) {
  const necesaria = CONFIG.voz.memoriaMinMb;
  let libre = memoriaDisponibleMb();
  if (libre === null) return { ok: true, libre, necesaria, aviso: "no pude leer la memoria disponible" };
  if (libre >= necesaria) return { ok: true, libre, necesaria };
  const falta = `hay ${libre} MB libres y la voz necesita ${necesaria} MB`;
  // Sin horario no se cierra nunca: el navegador se cierra solo en las horas de la voz, que elige el dueño.
  if (!permitirCerrarChrome || !CONFIG.voz.cerrarChrome || !conHorario() || !enHorarioVoz(ahora)) {
    return { ok: false, libre, necesaria, motivo: falta };
  }
  const chromes = chromesAbiertos();
  if (!chromes.length) return { ok: false, libre, necesaria, motivo: `${falta} (el navegador ya está cerrado)` };
  const inactivo = await inactividadMin();
  if (inactivo === null) {
    return { ok: false, libre, necesaria, motivo: `${falta}; el navegador está abierto y no pude saber si estás usando la compu, así que no lo cierro` };
  }
  if (inactivo < CONFIG.voz.inactivoMin) {
    return { ok: false, libre, necesaria, inactivo, motivo: `${falta}; el navegador está abierto y usaste la compu hace ${Math.round(inactivo)} min` };
  }
  log(`Voz: cierro el navegador (proceso ${chromes.map((c) => c.pid).join(", ")}) para liberar memoria (${falta}; la compu está sin usar hace ${Math.round(inactivo)} min).`);
  const cierre = await cerrarChrome(chromes.map((c) => c.pid));
  if (!cierre.cerrado) {
    return { ok: false, libre, necesaria, inactivo, chromeCerrado: false, motivo: `${falta}; le pedí al navegador que se cierre y no se cerró en 60 s` };
  }
  log(`Voz: el navegador se cerró en ${cierre.segundos} s${cierre.quedan ? ` (${cierre.quedan} procesos suyos seguían terminando)` : ""}.`);
  await esperar(3000);
  libre = memoriaDisponibleMb() ?? libre;
  if (libre >= necesaria) return { ok: true, libre, necesaria, inactivo, chromeCerrado: true };
  return { ok: false, libre, necesaria, inactivo, chromeCerrado: true, motivo: `cerré el navegador y quedaron ${libre} MB libres (la voz necesita ${necesaria} MB)` };
}

// ---------- Comando de voz ----------
// Corre un programa. A diferencia de util.correr, si se pasa del tiempo primero manda SIGTERM (el comando de voz
// sale ordenado, con código 130) y recién a los 30 s SIGKILL.
function ejecutar(programa, args, { timeoutMs }) {
  return new Promise((resolve) => {
    let salida = "";
    let error = "";
    let cortado = false;
    let p;
    try {
      p = spawn(programa, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    } catch (e) {
      resolve({ codigo: -1, salida, error: e.message, noArranco: true });
      return;
    }
    p.stdout.on("data", (d) => (salida = (salida + d).slice(-200000)));
    p.stderr.on("data", (d) => (error = (error + d).slice(-200000)));
    const reloj = setTimeout(() => {
      cortado = true;
      p.kill("SIGTERM");
      setTimeout(() => p.kill("SIGKILL"), 30000).unref();
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(reloj);
      resolve({ codigo: -1, salida, error: e.message, noArranco: e.code === "ENOENT" || e.code === "EACCES" });
    });
    p.on("close", (codigo, senal) => {
      clearTimeout(reloj);
      resolve({ codigo, senal, salida, error, cortado });
    });
  });
}

// El comando responde con una sola línea JSON por la salida estándar.
function leerRespuesta(salida) {
  const lineas = String(salida || "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"));
  for (let i = lineas.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lineas[i]);
    } catch {
      // no era el JSON
    }
  }
  return null;
}

const conTope = () => process.platform === "linux" && CONFIG.voz.tope && !/^(no|0|)$/i.test(CONFIG.voz.tope);

function llamada(argsExtra, tope) {
  const [programa, ...resto] = partirComando(CONFIG.voz.comando);
  if (!tope) return { programa, args: [...resto, ...argsExtra] };
  return {
    programa: "systemd-run",
    args: ["--user", "--scope", "--quiet", "-p", `MemoryMax=${CONFIG.voz.tope}`, "-p", `MemorySwapMax=${CONFIG.voz.topeSwap}`, "--",
      programa, ...resto, ...argsExtra],
  };
}

/** Estado rápido (no carga el modelo): { activa, ok, motor, modelo, voces, dispositivo, tieneVoz, error } */
export async function estadoVoz() {
  if (!vozActiva()) return { activa: false };
  const { programa, args } = llamada(["--estado"], false);
  if (!programa) return { activa: true, ok: false, error: "VOZ_COMANDO está vacío" };
  const r = await ejecutar(programa, args, { timeoutMs: 60000 });
  const d = leerRespuesta(r.salida);
  if (!d) {
    const detalle = r.noArranco ? `no encuentro ${programa}` : String(r.error || "").trim().split("\n").slice(-2).join(" ") || `código ${r.codigo}`;
    return { activa: true, ok: false, error: detalle.slice(0, 300) };
  }
  const voces = (d.voces || []).map((x) => (typeof x === "string" ? x : x?.nombre)).filter(Boolean);
  return { activa: true, ...d, voces, tieneVoz: voces.includes(CONFIG.voz.nombre) };
}

/** Prueba que el tope de memoria (systemd-run) ande en esta PC. */
export async function probarTope() {
  if (!conTope()) return { ok: false, motivo: "sin tope (VOZ_TOPE_MEMORIA vacío o no es Linux)" };
  try {
    const r = await correr("systemd-run", ["--user", "--scope", "--quiet", "-p", "MemoryMax=256M", "--", "true"], { timeoutMs: 30000 });
    return r.codigo === 0 ? { ok: true } : { ok: false, motivo: String(r.error || "").trim().split("\n")[0] || `código ${r.codigo}` };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

const arrancoMal = (r) =>
  r.noArranco || (r.codigo !== 0 && !leerRespuesta(r.salida) && /failed to|unknown (assignment|property)|not supported|systemd-run|dbus/i.test(r.error || ""));

/**
 * Genera un WAV por frase. frases: ["...", "...", "..."] (una por pantalla).
 * Devuelve { ok, archivos: [{ ruta, duracion, texto, leido }], segundos, dispositivo, sinTope } o { ok:false, motivo }.
 */
export async function generarVoz({ frases, carpeta }) {
  await fs.mkdir(carpeta, { recursive: true });
  const pedido = {
    voz: CONFIG.voz.nombre,
    carpeta,
    normalizar: true,
    frases: frases.map((texto, i) => ({ id: `p${i + 1}`, texto })),
  };
  const archivoPedido = path.join(carpeta, "pedido.json");
  await fs.writeFile(archivoPedido, JSON.stringify(pedido, null, 2));
  const timeoutMs = CONFIG.voz.timeoutMin * 60000;
  const inicio = Date.now();
  let sinTope = !conTope();
  let l = llamada(["--pedido", archivoPedido], !sinTope);
  let r = await ejecutar(l.programa, l.args, { timeoutMs });
  if (!sinTope && arrancoMal(r)) {
    log(`Voz: el tope de memoria (systemd-run) no anduvo (${String(r.error || "").trim().split("\n")[0]}); corro el comando sin tope.`);
    sinTope = true;
    l = llamada(["--pedido", archivoPedido], false);
    r = await ejecutar(l.programa, l.args, { timeoutMs });
  }
  const segundos = Math.round((Date.now() - inicio) / 1000);
  if (r.cortado) return { ok: false, segundos, motivo: `el comando de voz tardó más de ${CONFIG.voz.timeoutMin} min y lo corté` };
  const d = leerRespuesta(r.salida);
  if (!d || !d.ok) {
    let motivo = d?.error;
    if (!motivo && r.senal === "SIGKILL") motivo = "el sistema cortó el comando de voz (SIGKILL): probablemente se quedó sin memoria";
    if (!motivo && r.noArranco) motivo = `no encuentro el comando de voz (${l.programa}); revisá VOZ_COMANDO`;
    if (!motivo) motivo = `el comando de voz salió con código ${r.codigo}${r.senal ? ` (${r.senal})` : ""}: ${String(r.error || "").trim().split("\n").slice(-1)[0] || "sin detalle"}`;
    return { ok: false, segundos, codigo: r.codigo, motivo: String(motivo).slice(0, 300) };
  }
  const archivos = [];
  for (let i = 0; i < frases.length; i++) {
    const a = (d.archivos || []).find((x) => x.id === `p${i + 1}`);
    if (!a || !a.ruta || !existsSync(a.ruta)) return { ok: false, segundos, motivo: `el comando no dejó el audio de la frase ${i + 1}` };
    archivos.push({ ruta: a.ruta, duracion: Number(a.duracion) || 0, texto: frases[i], leido: String(a.texto_leido || "") });
  }
  log(`Voz lista en ${segundos} s (${[d.motor, d.dispositivo].filter(Boolean).join(", ") || "?"}${sinTope ? ", sin tope de memoria" : ""}): ${archivos.map((a) => `${a.duracion.toFixed(1)} s`).join(" · ")}`);
  return { ok: true, archivos, segundos, dispositivo: d.dispositivo || "", motor: d.motor || "", sinTope };
}

// ---------- Dónde entra cada frase ----------
// Cada frase arranca con su pantalla (3 pantallas de 5 s) y tiene que terminar antes del cambio.
export const ARRANQUES = [0.3, 5.3, 10.3];
export const LARGO_MAX = [4.6, 4.6, 4.5];

/** Si una frase no entra, se acelera hasta VOZ_TEMPO_MAX. Devuelve { ok, tramos: [{ ruta, inicio, tempo, duracion }] } o { ok:false, motivo }. */
export function planearVoz(archivos, tempoMax = CONFIG.voz.tempoMax) {
  const tramos = [];
  for (let i = 0; i < archivos.length; i++) {
    const d = Number(archivos[i].duracion) || 0;
    const max = LARGO_MAX[i] ?? 4.5;
    if (d <= 0.2) return { ok: false, motivo: `el audio de la frase ${i + 1} está vacío` };
    const tempo = d > max ? d / max : 1;
    if (tempo > tempoMax + 1e-9) {
      return {
        ok: false,
        motivo: `la frase ${i + 1} dura ${d.toFixed(1)} s y su pantalla deja ${max} s (habría que acelerarla un ${Math.round((tempo - 1) * 100)} %, y el máximo es ${Math.round((tempoMax - 1) * 100)} %)`,
      };
    }
    tramos.push({ ruta: archivos[i].ruta, inicio: ARRANQUES[i] ?? i * 5 + 0.3, tempo: Math.round(tempo * 1000) / 1000, duracion: d / tempo });
  }
  return { ok: true, tramos };
}
