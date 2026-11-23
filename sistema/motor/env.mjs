// El archivo .env: pedir un valor sin mostrarlo, escribirlo con permisos 600 y saber qué es secreto.
// Lo usan cargar-clave.mjs e ig-conectar.mjs. Nunca imprime los valores secretos.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

// Claves que nunca se muestran ni se cargan con --valor (irían a la línea de comandos y al historial).
export const SECRETOS = new Set([
  "MOTOR_CLAVE",
  "TELEGRAM_BOT_TOKEN",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "IG_TOKEN",
  "IG_TOKEN_USUARIO",
  "BUFFER_API_KEY",
  "WP_CLAVE_APLICACION",
  "N8N_API_KEY",
]);

export const esSecreto = (nombre) => SECRETOS.has(nombre) || /(TOKEN|CLAVE|KEY|SECRET|PASSWORD)/i.test(nombre);

/** Pide un valor en la terminal sin mostrarlo (si no hay terminal, lo lee de la entrada estándar). */
export async function pedirOculto(pregunta) {
  if (!process.stdin.isTTY) {
    let s = "";
    for await (const parte of process.stdin) s += parte;
    return s.trim();
  }
  process.stdout.write(pregunta);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolver) => {
    let s = "";
    const alRecibir = (b) => {
      for (const c of b.toString("utf8")) {
        if (c === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (c === "\r" || c === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", alRecibir);
          process.stdout.write("\n");
          return resolver(s.trim());
        }
        s = c === "\u007f" || c === "\b" ? s.slice(0, -1) : s + c;
      }
    };
    process.stdin.on("data", alRecibir);
  });
}

/** Lee el .env como { NOMBRE: valor } (sin comentarios). */
export function leerValores(archivo) {
  const salida = {};
  if (!existsSync(archivo)) return salida;
  for (const l of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    salida[m[1]] = valor;
  }
  return salida;
}

/** Nombres que trae la plantilla .env.example (para avisar los que faltan). */
export function nombresDeEjemplo(archivo) {
  if (!existsSync(archivo)) return [];
  return readFileSync(archivo, "utf8")
    .split(/\r?\n/)
    .map((l) => (l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/) || [])[1])
    .filter(Boolean);
}

const conComillas = (valor) => (/[\s#"']/.test(valor) ? `"${valor.replace(/"/g, '\\"')}"` : valor);

/**
 * Cambia o agrega valores en el .env sin tocar lo demás, con permisos 600.
 * valores: { NOMBRE: valor }. quitar: nombres a borrar. titulo: comentario para las líneas nuevas.
 */
export function actualizarEnv(archivo, valores, quitar = [], titulo = "") {
  const vistos = new Set();
  const lineas = [];
  const original = existsSync(archivo) ? readFileSync(archivo, "utf8").split(/\r?\n/) : [];
  for (const l of original) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (m && quitar.includes(m[1])) continue;
    if (m && m[1] in valores) {
      if (vistos.has(m[1])) continue; // una sola vez cada clave: la última repetida pisaría el valor nuevo
      vistos.add(m[1]);
      lineas.push(`${m[1]}=${conComillas(valores[m[1]])}`);
      continue;
    }
    lineas.push(l);
  }
  while (lineas.length && lineas.at(-1).trim() === "") lineas.pop();
  const faltan = Object.keys(valores).filter((k) => !vistos.has(k));
  if (faltan.length) {
    if (titulo) lineas.push("", `# ${titulo}`);
    for (const k of faltan) lineas.push(`${k}=${conComillas(valores[k])}`);
  }
  const temporal = `${archivo}.tmp`;
  writeFileSync(temporal, lineas.join("\n") + "\n", { mode: 0o600 });
  renameSync(temporal, archivo);
  chmodSync(archivo, 0o600);
}
