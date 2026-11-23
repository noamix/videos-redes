// Carga claves y ajustes en el .env sin mostrarlos. Lo corre el dueño en su terminal: las claves nunca pasan por el chat.
//   npm run cargar-clave -- NOMBRE                    → pide el valor sin mostrarlo (pegalo y Enter)
//   npm run cargar-clave -- NOMBRE --generar          → crea un valor al azar (por ejemplo MOTOR_CLAVE)
//   npm run cargar-clave -- NOMBRE --valor "texto"    → guarda un valor que NO es secreto (por ejemplo PLANILLA_ID)
//   npm run cargar-clave -- NOMBRE --ver              → muestra un valor que NO es secreto
//   npm run cargar-clave -- NOMBRE --borrar           → lo saca del .env (por ejemplo, una clave temporal ya revocada)
//   npm run cargar-clave -- --lista                   → qué nombres tienen valor (sin mostrar los valores)
// Después de cambiar el .env: reiniciar el motor (systemctl --user restart videos-redes).
import { randomBytes } from "node:crypto";
import path from "node:path";
import { CONFIG, RAIZ } from "./config.mjs";
import { actualizarEnv, esSecreto, leerValores, nombresDeEjemplo, pedirOculto } from "./env.mjs";

const archivo = CONFIG.archivoEnv;
const args = process.argv.slice(2);
const opcion = (n) => args.includes(n);
const nombre = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--valor");

function salir(texto, codigo = 1) {
  console.log(texto);
  process.exit(codigo);
}

if (opcion("--lista")) {
  const valores = leerValores(archivo);
  const ejemplo = nombresDeEjemplo(path.join(RAIZ, ".env.example"));
  const todos = [...new Set([...ejemplo, ...Object.keys(valores)])];
  console.log(`Claves y ajustes en ${archivo} (no se muestran los valores):`);
  for (const n of todos) {
    const tiene = String(valores[n] ?? "").trim() !== "";
    console.log(`${tiene ? "✅" : "⚪"} ${n}${esSecreto(n) ? " (secreta)" : ""}`);
  }
  process.exit(0);
}

if (!nombre || !/^[A-Z][A-Z0-9_]*$/.test(nombre)) {
  salir('Uso: npm run cargar-clave -- NOMBRE   (por ejemplo: npm run cargar-clave -- GEMINI_API_KEY)\nOtras opciones: --generar, --valor "…", --ver, --borrar, --lista');
}

if (opcion("--borrar")) {
  actualizarEnv(archivo, {}, [nombre]);
  salir(`✅ ${nombre} sacada de ${archivo}`, 0);
}

if (opcion("--ver")) {
  if (esSecreto(nombre)) salir(`${nombre} es secreta: no se muestra. Con --lista ves si tiene valor.`);
  const valor = leerValores(archivo)[nombre];
  salir(valor ? `${nombre}=${valor}` : `${nombre} no tiene valor`, 0);
}

let valor;
if (opcion("--generar")) {
  valor = randomBytes(32).toString("hex");
} else if (opcion("--valor")) {
  if (esSecreto(nombre)) {
    salir(`${nombre} es secreta: no se carga con --valor (quedaría a la vista). Corré: npm run cargar-clave -- ${nombre}`);
  }
  valor = String(args[args.indexOf("--valor") + 1] ?? "").trim();
  if (!valor) salir('Falta el valor: npm run cargar-clave -- NOMBRE --valor "texto"');
} else {
  valor = await pedirOculto(`Pegá el valor de ${nombre} (no se va a ver) y apretá Enter: `);
}
if (!valor) salir("No recibí ningún valor: no cambié nada.");
if (/[\r\n]/.test(valor)) salir("El valor tiene saltos de línea: no lo guardé.");

actualizarEnv(archivo, { [nombre]: valor }, [], "Cargado con npm run cargar-clave");
const detalle = esSecreto(nombre) || opcion("--generar") ? `(${valor.length} caracteres, no se muestra)` : `= ${valor}`;
console.log(`✅ ${nombre} guardada en ${archivo} ${detalle}`);
console.log("Para que el motor la use: systemctl --user restart videos-redes");
