// Precio para mostrar en el video (solo productos con mostrar_precio = SI).
// Arma "$9.395", "Menos de $94 por unidad" y "Precio de noviembre 2026" a partir del precio de la web o de la planilla.
import { cantidadDe } from "./plantillas.mjs";
import { fechaLocal } from "./util.mjs";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "9.395,00" → 9395 · "$ 12.500" → 12500
function aNumero(texto) {
  const limpio = String(texto).replace(/[^\d.,]/g, "");
  if (!limpio) return NaN;
  const conDecimales = /,\d{1,2}$/.test(limpio);
  const entero = conDecimales ? limpio.slice(0, limpio.lastIndexOf(",")) : limpio;
  const dec = conDecimales ? limpio.slice(limpio.lastIndexOf(",") + 1) : "";
  return Number(`${entero.replace(/[.,]/g, "")}${dec ? `.${dec}` : ""}`);
}

export function formatoPesos(n) {
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return centavos ? `$${miles},${String(centavos).padStart(2, "0")}` : `$${miles}`;
}

/** Devuelve { texto, valor, unidad, mes } o null si el precio no es claro (rango de precios, vacío, etc.). */
export function armarPrecio(textoPrecio, producto, hoy = fechaLocal()) {
  const t = String(textoPrecio || "");
  const montos = [...t.matchAll(/\$\s?([\d.]+(?:,\d{1,2})?)/g)].map((m) => aNumero(m[1])).filter((n) => n > 0);
  let valor;
  if (montos.length === 1) valor = montos[0];
  else if (montos.length > 1 && /actual/i.test(t)) valor = montos.at(-1); // oferta: "precio original… precio actual…"
  else if (!montos.length && /^\s*[\d.,]+\s*$/.test(t)) valor = aNumero(t); // planilla con el número solo
  if (!(valor > 0)) return null;

  let unidad = "";
  const cantidad = Number(cantidadDe(producto));
  if (cantidad > 1) {
    const nombre = String(producto);
    const palabra = /metros/i.test(nombre) ? "metro" : /bolsas?\b/i.test(nombre) ? "bolsa" : /unid/i.test(nombre) ? "unidad" : "";
    if (palabra) {
      const cada = valor / cantidad;
      unidad = Number.isInteger(Math.round(cada * 100) / 100) && cada === Math.round(cada)
        ? `${formatoPesos(cada)} por ${palabra}`
        : `Menos de ${formatoPesos(Math.ceil(cada))} por ${palabra}`;
    }
  }
  const [anio, mes] = String(hoy).split("-").map(Number);
  return { texto: formatoPesos(valor), valor, unidad, mes: mes ? `Precio de ${MESES[mes - 1]} ${anio}` : "" };
}
