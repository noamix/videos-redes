// Prueba la subida a Instagram sin publicar nada: sube un video a Meta, espera que lo procese y lo deja
// sin publicar (Meta lo descarta solo en 24 h). Sirve para comprobar la conexión antes de la hora de publicar.
//   npm run ig-probar                     → usa el MP4 más nuevo de salida/
//   npm run ig-probar -- salida/video.mp4 → usa ese archivo
//   npm run ig-probar -- --ia             → además prueba la marca "Información de IA" (videos con voz)
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { RUTAS } from "./config.mjs";
import { caminoInstagram, instagramConfigurado, probarSubida } from "./instagram.mjs";

function videoMasNuevo() {
  if (!existsSync(RUTAS.salida)) return null;
  const mp4 = readdirSync(RUTAS.salida)
    .filter((n) => n.toLowerCase().endsWith(".mp4"))
    .map((n) => path.join(RUTAS.salida, n))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return mp4[0] || null;
}

if (!instagramConfigurado()) {
  console.log("❌ Instagram no está configurado en el .env: conectalo con npm run ig-conectar");
  process.exit(1);
}
const args = process.argv.slice(2);
const conIa = args.includes("--ia");
const archivo = args.find((a) => !a.startsWith("--"));
const ruta = archivo ? path.resolve(archivo) : videoMasNuevo();
if (!ruta || !existsSync(ruta)) {
  console.log(`❌ No encuentro el video ${ruta || "(no hay MP4 en salida/)"}`);
  process.exit(1);
}
console.log(`Subiendo ${path.basename(ruta)} a Meta por el camino "${caminoInstagram()}"${conIa ? ", con la marca de IA" : ""} (no se publica)…`);
try {
  const r = await probarSubida({ ruta, conIa });
  console.log(`✅ Meta recibió y procesó el video${conIa ? " con la marca de IA" : ""} (contenedor ${r.contenedor}). No se publicó nada.`);
} catch (e) {
  console.log(`❌ ${e.message}`);
  process.exit(1);
}
