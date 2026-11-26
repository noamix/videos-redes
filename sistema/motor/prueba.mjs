// Genera un video de prueba sin pasar por n8n y sin publicar nada.
//   npm run prueba                         → usa el producto de prueba de config/negocio.json (producto_prueba)
//   npm run prueba -- pedido.json          → usa un pedido propio (mismo formato que manda n8n)
//   agregá --sin-telegram para no mandarlo al celular y --sin-voz para no armar la voz en off
//   (con voz, mirá antes que haya memoria libre: npm run voz-estado)
// En Telegram sale marcado como PRUEBA y sus botones no cambian la planilla.
import fs from "node:fs/promises";
import { CONFIG } from "./config.mjs";
import { generar } from "./flujo.mjs";
import { fechaLocal, sumarDias } from "./util.mjs";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
let pedido;
if (archivo) {
  pedido = JSON.parse(await fs.readFile(archivo, "utf8"));
} else {
  const p = CONFIG.productoPrueba;
  if (!p?.producto) {
    console.log(
      '❌ Falta el producto de prueba. En config/negocio.json agregá, por ejemplo:\n   "producto_prueba": { "producto": "Nombre del producto", "link": "https://tu-web/producto/...", "linea": "nombre-de-la-linea" }',
    );
    process.exit(1);
  }
  pedido = {
    fecha: sumarDias(fechaLocal(), 30),
    linea: p.linea || "",
    producto_id: p.id || "",
    producto: p.producto,
    link: p.link || "",
    precio: p.precio || "",
    mostrar_precio: ["si", "sí", "true"].includes(String(p.mostrar_precio ?? "").toLowerCase()) || p.mostrar_precio === true,
    detalles: p.detalles || "",
    fotos: [p.foto_1, p.foto_2, p.foto_3].filter(Boolean),
  };
}
if (args.includes("--sin-telegram")) pedido.sin_telegram = true;
if (args.includes("--sin-voz")) pedido.sin_voz = true;
pedido.prueba = true;
const fila = await generar(pedido);
console.log(JSON.stringify(fila, null, 2));
process.exit(fila.estado === "error" ? 1 : 0);
