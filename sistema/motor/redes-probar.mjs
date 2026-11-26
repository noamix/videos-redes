// Prueba TikTok y YouTube por Buffer sin publicar nada: toma el último video publicado en Instagram, arma
// con él un borrador en cada red conectada (Buffer baja el video y lo revisa) y los borra enseguida.
//   npm run redes-probar                 → usa el último video de Instagram
//   npm run redes-probar -- <url.mp4>    → usa ese link público
//   npm run redes-probar -- --ia         → además prueba la marca de IA (videos con voz)
import { instagramConfigurado, ultimoVideo } from "./instagram.mjs";
import { bufferConfigurado, canalesBuffer, probarEnvio } from "./buffer.mjs";
import { CONFIG } from "./config.mjs";

function salir(texto) {
  console.log(texto);
  process.exit(1);
}

if (!bufferConfigurado()) salir("❌ Falta BUFFER_API_KEY en el .env: cargala con npm run cargar-clave -- BUFFER_API_KEY");
let canales;
try {
  canales = await canalesBuffer();
} catch (e) {
  salir(`❌ ${e.message}`);
}
for (const [red, nombre] of [["tiktok", "TikTok"], ["youtube", "YouTube"]]) {
  const c = canales[red];
  const apagada = CONFIG.buffer.redes.length && !CONFIG.buffer.redes.includes(red);
  if (!c && (canales.avisos || []).some((a) => a.includes(`cuentas de ${nombre} `) || a.startsWith(`${nombre} está conectado`))) continue; // lo explica el aviso
  console.log(
    c
      ? `✅ Buffer conectado con ${nombre}: ${c.nombre}${c.pausado ? " (la cola está en pausa en Buffer)" : ""}`
      : apagada
        ? `⚪ ${nombre}: desactivado con BUFFER_REDES`
        : `⚪ ${nombre} no está conectado en Buffer`,
  );
}

for (const a of canales.avisos || []) console.log(`⚠️ ${a}`);

const args = process.argv.slice(2);
const conIa = args.includes("--ia");
let url = args.find((a) => !a.startsWith("--")) || "";
if (!url) {
  if (!instagramConfigurado()) salir("❌ Instagram no está configurado y no pasaste un link de video");
  try {
    const v = await ultimoVideo();
    if (!v) {
      console.log("⚪ Todavía no hay videos en Instagram para probar. La prueba se puede hacer después del primer posteo.");
      process.exit(0);
    }
    url = v.mediaUrl;
    console.log(`Uso el último video de Instagram: ${v.permalink || v.id}`);
  } catch (e) {
    salir(`❌ No pude leer los videos de Instagram: ${e.message}`);
  }
}
const resultados = await probarEnvio({ url, conIa });
let fallas = 0;
for (const r of resultados) {
  if (!r.ok) {
    fallas++;
    console.log(`❌ ${r.nombre}: ${r.motivo}`);
  } else if (r.borrado) {
    console.log(`✅ ${r.nombre}: Buffer bajó el video y armó el borrador${conIa ? " con la marca de IA" : ""}. Ya lo borré: no se publicó nada.`);
  } else {
    console.log(`⚠️ ${r.nombre}: Buffer armó el borrador, pero no lo pude borrar (id ${r.id}). Borralo a mano en Buffer → Drafts. No se publicó nada.`);
  }
}
process.exit(fallas ? 1 : 0);
