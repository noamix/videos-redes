// Respaldo de la carpeta del sistema antes de un cambio grande: respaldos/respaldo-AAAAMMDD-HHMM.tgz (permisos 600).
// Incluye el .env y el flujo de n8n (tienen claves): no lo copies a otro lado ni lo subas.
// No incluye node_modules, salida (videos), trabajos, la caché ni los respaldos anteriores.
//   npm run respaldo
import { chmodSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { RAIZ } from "./config.mjs";
import { correr } from "./util.mjs";

const carpeta = path.join(RAIZ, "respaldos");
mkdirSync(carpeta, { recursive: true, mode: 0o700 });
chmodSync(carpeta, 0o700);
const d = new Date();
const dos = (n) => String(n).padStart(2, "0");
const marca = `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
const destino = path.join(carpeta, `respaldo-${marca}.tgz`);

const r = await correr(
  "tar",
  [
    "czf", destino,
    "--exclude=./node_modules", "--exclude=./salida", "--exclude=./trabajos", "--exclude=./respaldos", "--exclude=./datos/cache",
    "-C", RAIZ, ".",
  ],
  { timeoutMs: 10 * 60 * 1000 },
);
if (r.codigo !== 0) {
  console.log(`❌ No pude hacer el respaldo: ${r.error.trim().slice(0, 400)}`);
  process.exit(1);
}
chmodSync(destino, 0o600);
console.log(`✅ Respaldo hecho: ${destino} (${(statSync(destino).size / 1048576).toFixed(1)} MB, permisos 600)`);
console.log("Tiene las claves: no lo copies a otro lado ni lo subas.");
