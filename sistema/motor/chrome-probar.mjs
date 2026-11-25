// Muestra qué navegador cerraría el motor para hacerle lugar a la voz (VOZ_CERRAR_CHROME=si), sin tocar nada.
//   npm run chrome-probar               → lista los procesos del navegador y cuál es el principal
//   npm run chrome-probar -- --cerrar   → lo cierra de verdad, igual que en el horario de la voz: SIGTERM solo al
//                                          principal y espera hasta 60 s. Cerrá antes lo que tengas sin guardar.
// Reconoce Google Chrome, Chromium, Brave y Edge. Nunca toca el Chrome sin ventana de HyperFrames.
import { readFileSync } from "node:fs";
import { CONFIG } from "./config.mjs";
import { cerrarChrome, chromesAbiertos, enHorarioVoz, horarioVozTexto, inactividadMin, memoriaDisponibleMb, procesosChrome } from "./voz.mjs";

const cerrar = process.argv.includes("--cerrar");
const mb = (n) => (n === null ? "sin dato" : `${n.toLocaleString("es-AR")} MB`);
const nombre = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/comm`, "utf8").trim();
  } catch {
    return "?";
  }
};

const todos = procesosChrome();
const principales = chromesAbiertos(todos);
const libre = memoriaDisponibleMb();

if (!todos.length) {
  console.log("El navegador está cerrado (no hay procesos de Chrome, Chromium, Brave ni Edge).");
  console.log(`Memoria disponible: ${mb(libre)} (la voz necesita ${mb(CONFIG.voz.memoriaMinMb)})`);
  process.exit(0);
}

const delNavegador = new Set(todos.map((p) => p.pid));
const hijos = todos.filter((p) => delNavegador.has(p.ppid));
const conTipo = todos.filter((p) => /(^|\s)--type=/.test(p.cmd)).length;
const otros = todos.length - hijos.length - principales.length;
console.log(
  `Procesos del navegador: ${todos.length} en total: ${principales.length} principal y ${hijos.length} hijos ` +
    `(${conTipo} con --type=; pestañas, GPU, red…). A los hijos no se les manda nada.` +
    (otros ? ` Otros ${otros} sin ventana (--headless), que tampoco se tocan.` : ""),
);
if (!principales.length) {
  console.log("⚠️  No encontré el proceso principal: no cerraría nada.");
} else {
  console.log(`Proceso principal${principales.length > 1 ? "es" : ""} (el único al que el motor le pide que se cierre):`);
  for (const p of principales) console.log(`  · PID ${p.pid}, lo abrió ${nombre(p.ppid)} (PID ${p.ppid}): ${p.cmd}`);
}
console.log(`Memoria disponible: ${mb(libre)} (la voz necesita ${mb(CONFIG.voz.memoriaMinMb)})`);

if (!cerrar) {
  const min = await inactividadMin();
  const activo = CONFIG.voz.cerrarChrome && Boolean(String(CONFIG.voz.horario || "").trim());
  console.log(
    `Cierre automático: ${activo ? "activo" : "apagado (hace falta VOZ_CERRAR_CHROME=si y un VOZ_HORARIO)"}. ` +
      `Ahora: ${enHorarioVoz() ? "es" : "no es"} el horario de la voz (${horarioVozTexto()}); ` +
      `la compu ${min === null ? "no informa cuánto hace que no se usa" : `lleva ${Math.round(min)} min sin uso`} ` +
      `(se cierra con ${CONFIG.voz.inactivoMin} min o más).`,
  );
  console.log("Para cerrarlo de verdad: npm run chrome-probar -- --cerrar");
  process.exit(0);
}

if (!principales.length) process.exit(1);
console.log(`Cierro el navegador: SIGTERM al PID ${principales.map((p) => p.pid).join(", ")} y espero hasta 60 s…`);
const r = await cerrarChrome(principales.map((p) => p.pid));
const despues = memoriaDisponibleMb();
if (!r.cerrado) {
  console.log(`❌ El navegador no se cerró en ${r.segundos} s (puede haber una página que pide confirmar). No lo fuerzo: cerralo a mano.`);
  process.exit(1);
}
const restantes = procesosChrome().length;
console.log(`✅ El navegador se cerró en ${r.segundos} s. Procesos suyos que quedan: ${restantes}.`);
console.log(`Memoria disponible: ${mb(libre)} → ${mb(despues)}`);
process.exit(0);
