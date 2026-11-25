// Frases de la voz en off: una por pantalla, con el mismo mensaje y los mismos datos que se leen en el video.
//   · Con IA (Gemini o Claude): las escribe a partir de lo que dice cada pantalla (prompts/voz.md) y pasan su
//     propio control.
//   · Si la IA falla o no hay clave: se arman con los textos de las mismas pantallas (gratis, sin internet).
// Los números se mandan con cifras ("30x40", "$12.500"): el comando de voz los pasa a palabras.
import fs from "node:fs";
import path from "node:path";
import { CONFIG, RUTAS } from "./config.mjs";
import { TUTEO, extraerJson, llamarIA, menciona, modoTextos, nombreIA, reglasExtra } from "./textos.mjs";
import { sinEmojis } from "./util.mjs";

// Cada frase tiene que entrar en unos 4,5 s de voz.
export const VOZ_LIMITES = { palabras: 11, hablado: 62 };

/** Lo que se lee en cada pantalla del video: va en el pedido a la IA y sirve para controlar los números. */
export function pantallasDelVideo(textos, { precio = null, linea = {} } = {}) {
  const cajas = CONFIG.estilo === "cajas";
  const whatsapp = cajas && Boolean(CONFIG.whatsapp);
  return [
    { etiqueta: textos.etiqueta || "", titulo: textos.p1 || "" },
    {
      titulo: textos.p2_titulo || "",
      puntos: [textos.p2_punto_1, textos.p2_punto_2, textos.p2_punto_3].filter(Boolean),
      ...(cajas && precio ? { precio: [precio.texto, precio.unidad, precio.mes].filter(Boolean).join(" · ") } : {}),
    },
    {
      titulo: textos.p3_titulo || "",
      sub: textos.p3_sub || "",
      ...(cajas ? { beneficios: (linea.beneficios || []).filter(Boolean) } : {}),
      boton: whatsapp ? "WhatsApp" : "web",
    },
  ];
}

const textoDe = (pantalla) => Object.values(pantalla || {}).flat().join(" ");

/** Números de un texto, sin separadores de miles: "$12.500" → "12500" · "30x40" → "30" y "40". */
export function numeros(texto) {
  return (String(texto || "").match(/\d[\d.,]*/g) || [])
    .map((n) => n.replace(/[.,]+$/, "").replace(/[.,](?=\d{3}(\D|$))/g, ""))
    .filter(Boolean);
}

/** Largo aproximado de la frase dicha: los números van con letras ("30x40" → "treinta por cuarenta"). */
export function largoHablado(texto) {
  const t = String(texto || "");
  const pesos = (t.match(/\$/g) || []).length;
  return (
    t
      .replace(/\d[\d.,]*/g, (n) => "n".repeat(Math.min(24, 5 + 3 * n.replace(/\D/g, "").length)))
      .replace(/(?<=n)\s*[x×]\s*(?=n)/gi, " por ")
      .replace(/\bcm\b/gi, "centímetros")
      .replace(/\$/g, "").length + pesos * 6
  );
}

const cuentaPalabras = (f) => String(f || "").split(/\s+/).filter(Boolean).length;
const entra = (f) => Boolean(f) && cuentaPalabras(f) <= VOZ_LIMITES.palabras && largoHablado(f) <= VOZ_LIMITES.hablado;

/** Devuelve la lista de problemas (vacía si están bien). */
export function controlarFrases(frases, pantallas, { mostrarPrecio = false, linea = {} } = {}) {
  if (!Array.isArray(frases) || frases.length !== 3 || frases.some((f) => !String(f || "").trim())) {
    return ["tienen que ser exactamente 3 frases, una por pantalla"];
  }
  const problemas = [];
  frases.forEach((f, i) => {
    const n = i + 1;
    const palabras = cuentaPalabras(f);
    if (palabras > VOZ_LIMITES.palabras) problemas.push(`la frase ${n} tiene ${palabras} palabras (máximo ${VOZ_LIMITES.palabras})`);
    else if (largoHablado(f) > VOZ_LIMITES.hablado) problemas.push(`la frase ${n} es demasiado larga para decirla en 4 segundos`);
    const permitidos = new Set(numeros(textoDe(pantallas[i])));
    for (const x of numeros(f)) if (!permitidos.has(x)) problemas.push(`la frase ${n} dice ${x}, que no está en la pantalla ${n}`);
  });
  const todo = frases.join("\n");
  // Palabras prohibidas: las del negocio (negocio.json) y las de la línea (lineas.json), igual que en los textos.
  const prohibidas = [...CONFIG.palabrasProhibidas, ...(linea.palabras_prohibidas || [])];
  for (const p of new Set(prohibidas)) if (menciona(todo, p)) problemas.push(`menciona "${p}" (no se debe)`);
  if (!mostrarPrecio && /\$\s?\d|\bpesos\b/i.test(todo)) problemas.push("menciona un precio y mostrar_precio es NO");
  if (/(\+?54\s?9?\s?)?\b\d{3,4}[\s-]?\d{3}[\s-]?\d{4}\b/.test(todo)) problemas.push("tiene un teléfono");
  if (/[!¡]/.test(todo)) problemas.push("sin signos de exclamación");
  if (/https?:|www\.|\.com\b|\.ar\b|@/i.test(todo)) problemas.push("no tiene que decir direcciones web ni cuentas");
  if (/#/.test(todo)) problemas.push("sin hashtags");
  if (TUTEO.test(todo) || /(^|[^\p{L}])tú(?!\p{L})/iu.test(todo)) problemas.push("usa tú en lugar de vos (tiene que ser voseo: pedí, mirá, escribinos)");
  if (pantallas[2]?.boton !== "WhatsApp" && /whats\s?app/i.test(todo)) problemas.push("menciona WhatsApp y este video no lo muestra");
  return [...new Set(problemas)];
}

const conPunto = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  return /[.?!…]$/.test(t) ? t : `${t}.`;
};
const minuscula = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Sin IA: las frases salen de los mismos textos de las pantallas. Devuelve 3 frases o null. */
export function frasesDePlantilla(textos, pantallas, precio = null) {
  const elegir = (opciones) => opciones.map(conPunto).find(entra) || "";
  const f1 = elegir([textos.p1, textos.etiqueta]);
  const puntos = pantallas[1]?.puntos || [];
  const titulo2 = textos.p2_titulo || "";
  const f2 = elegir([
    pantallas[1]?.precio && precio?.texto ? `${puntos[0] || titulo2}, a ${precio.texto}` : "",
    puntos.length >= 2 ? `${puntos[0]} y ${minuscula(puntos[1])}` : "",
    puntos[0],
    titulo2,
  ]);
  const titulo3 = conPunto(textos.p3_titulo);
  const f3 = elegir([
    pantallas[2]?.boton === "WhatsApp" ? `${titulo3} Escribinos por WhatsApp` : `${titulo3} ${conPunto(textos.p3_sub)}`,
    titulo3,
  ]);
  return f1 && f2 && f3 ? [f1, f2, f3] : null;
}

function promptVoz(whatsapp) {
  const canal = whatsapp ? "por WhatsApp (el número ya está en la pantalla: no lo digas)" : "en la web (sin decir la dirección)";
  return fs
    .readFileSync(path.join(RUTAS.prompts, "voz.md"), "utf8")
    .replaceAll("{MARCA}", CONFIG.marca || "la marca")
    .replaceAll("{QUE_VENDE}", CONFIG.queVende || "un negocio argentino que vende por internet")
    .replaceAll("{PUBLICO}", CONFIG.publico || "clientes de Argentina que compran por internet")
    .replaceAll("{REGLAS_EXTRA}", reglasExtra())
    .replaceAll("{CANAL}", canal);
}

/**
 * datos: { textos, precio, linea, producto, mostrarPrecio }
 * Devuelve { frases: [3] | null, origen, avisos, pantallas }.
 */
export async function escribirFrases({ textos, precio = null, linea = {}, producto = "", mostrarPrecio = false }) {
  const pantallas = pantallasDelVideo(textos, { precio, linea });
  const ctx = { mostrarPrecio, linea };
  const avisos = [];
  const desdeLasPantallas = () => {
    const frases = frasesDePlantilla(textos, pantallas, precio);
    const problemas = frases ? controlarFrases(frases, pantallas, ctx) : ["los textos de las pantallas no entran en 4 segundos"];
    if (problemas.length) {
      avisos.push(`No pude armar las frases de la voz (${problemas.join("; ")}).`);
      return { frases: null, origen: "ninguno", avisos, pantallas };
    }
    return { frases, origen: "pantallas", avisos, pantallas };
  };
  if (modoTextos() === "plantillas") return desdeLasPantallas();

  const system = promptVoz(pantallas[2].boton === "WhatsApp");
  const pedido = {
    producto,
    mostrar_precio: mostrarPrecio ? "SI" : "NO",
    pantalla_1: pantallas[0],
    pantalla_2: pantallas[1],
    pantalla_3: pantallas[2],
  };
  const mensajes = [{ role: "user", content: JSON.stringify(pedido, null, 2) }];
  let ultimos = [];
  for (let intento = 1; intento <= 2; intento++) {
    let respuesta;
    try {
      respuesta = (await llamarIA(system, mensajes)).texto;
    } catch (e) {
      avisos.push(`${nombreIA()} no escribió la voz (${e.message}); la armé con los textos de las pantallas.`);
      return desdeLasPantallas();
    }
    let crudo;
    try {
      crudo = extraerJson(respuesta);
    } catch (e) {
      ultimos = [e.message];
      mensajes.push({ role: "assistant", content: respuesta }, { role: "user", content: "Respondé solo con el objeto JSON pedido." });
      continue;
    }
    const frases = (Array.isArray(crudo.voz) ? crudo.voz : []).map((f) => sinEmojis(String(f ?? "")).replace(/\s+/g, " ").trim());
    const problemas = controlarFrases(frases, pantallas, ctx);
    if (!problemas.length) return { frases, origen: modoTextos(), avisos, pantallas };
    ultimos = problemas;
    mensajes.push(
      { role: "assistant", content: respuesta },
      { role: "user", content: `Corregí estos problemas y devolvé el JSON completo de nuevo: ${problemas.join("; ")}.` },
    );
  }
  avisos.push(`Las frases de ${nombreIA()} para la voz no pasaron el control (${ultimos.slice(0, 3).join("; ")}); las armé con los textos de las pantallas.`);
  return desdeLasPantallas();
}

// ---------- Aviso de IA en el texto del posteo ----------
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Saca el aviso de voz con IA del texto del posteo y, si el video lleva voz, lo vuelve a poner antes de los hashtags. */
export function captionConAviso(caption, conVoz, aviso = CONFIG.voz.aviso) {
  const re = new RegExp(`\\n*[ \\t]*(🎙️|🎙)?\\s*${escapar(aviso)}\\.?[ \\t]*`, "giu");
  let c = String(caption || "").replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!conVoz) return c;
  const partes = c.split(/\n\n(?=#)/);
  partes[0] = `${partes[0].trimEnd()}\n🎙️ ${aviso}.`;
  c = partes.join("\n\n");
  return c;
}
