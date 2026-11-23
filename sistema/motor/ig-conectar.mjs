// Conecta Instagram por el camino de Facebook (el de las apps nuevas de Meta).
// Recibe el token largo de usuario que da el depurador de identificadores de acceso de Meta, busca la
// página de Facebook vinculada a la cuenta de Instagram y guarda en el .env:
//   IG_USER_ID (la cuenta), IG_TOKEN (el token de la página, que no vence), IG_API_BASE e IG_CUENTA.
// Nunca muestra los tokens.
//
//   npm run ig-conectar                          → pide el token en la terminal (no se ve al pegarlo)
//   npm run ig-conectar -- --archivo <ruta>      → lo lee de un archivo
// Si tu usuario maneja varias cuentas, elige la de config/negocio.json (cuentas.instagram) o la de IG_CUENTA.
import { existsSync, readFileSync } from "node:fs";
import { CONFIG } from "./config.mjs";
import { actualizarEnv, pedirOculto } from "./env.mjs";
import { traer } from "./util.mjs";

const BASE = (process.env.IG_API_BASE_CONECTAR || "https://graph.facebook.com").replace(/\/+$/, "");
const VERSION = CONFIG.instagram.version;
const NECESARIOS = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"];

function fallar(texto, arreglo) {
  console.log(`❌ ${texto}${arreglo ? `\n   → ${arreglo}` : ""}`);
  process.exit(1);
}

async function tokenDeUsuario() {
  // Por compatibilidad; lo recomendado es que el dueño lo pegue cuando el comando lo pide (no queda en el historial).
  if (process.env.IG_TOKEN_USUARIO) return process.env.IG_TOKEN_USUARIO.trim();
  const i = process.argv.indexOf("--archivo");
  if (i > -1) {
    const ruta = process.argv[i + 1];
    if (!ruta || !existsSync(ruta)) fallar(`No encuentro el archivo ${ruta || "(falta la ruta)"}`);
    return readFileSync(ruta, "utf8").trim();
  }
  return pedirOculto("Pegá el token largo de Meta (no se va a ver) y apretá Enter: ");
}

async function meta(ruta, parametros, token) {
  const url = new URL(ruta.startsWith("http") ? ruta : `${BASE}/${VERSION}${ruta}`);
  for (const [k, v] of Object.entries(parametros || {})) url.searchParams.set(k, v);
  if (token) url.searchParams.set("access_token", token);
  const r = await traer(url.href, {}, 60000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    const e = d.error || {};
    const err = new Error(e.message || `respuesta ${r.status}`);
    err.codigo = e.code;
    throw err;
  }
  return d;
}

/** Junta todas las páginas de un listado paginado de Meta (hasta 5 vueltas). */
async function todas(ruta, parametros, token) {
  const salida = [];
  let d = await meta(ruta, parametros, token);
  for (let i = 0; i < 5; i++) {
    salida.push(...(d.data || []));
    if (!d.paging?.next) break;
    d = await meta(d.paging.next);
  }
  return salida;
}

function fecha(segundos) {
  return new Date(segundos * 1000).toLocaleDateString("es-AR", { timeZone: CONFIG.zona });
}

// ---------- 1. Token de usuario ----------
const usuario = await tokenDeUsuario();
if (!usuario) fallar("No recibí ningún token");
if (usuario.startsWith("IG")) {
  fallar("Ese token es del inicio de sesión de Instagram; este paso es para el de Facebook (empieza con EAA)");
}
if (!usuario.startsWith("EAA")) fallar("Eso no parece un token de Meta (tiene que empezar con EAA)");

try {
  const { data: t } = await meta("/debug_token", { input_token: usuario }, usuario);
  if (t.is_valid === false) fallar("Meta dice que ese token ya no sirve", "Generá uno nuevo en el Explorador de la API Graph y amplialo");
  const faltan = NECESARIOS.filter((p) => !(t.scopes || []).includes(p));
  if (faltan.length) {
    fallar(`Al token le faltan permisos: ${faltan.join(", ")}`, "Generalo con el ajuste de inicio de sesión de la app (Configurations → Generate Access Token)");
  }
  if (t.expires_at && t.expires_at * 1000 - Date.now() < 3 * 86400 * 1000) {
    fallar(
      `Ese token es corto: vence el ${fecha(t.expires_at)}`,
      'En el depurador de identificadores de acceso de Meta tocá "Ampliar identificador de acceso" y usá el token largo',
    );
  }
  console.log(`✅ Token de usuario válido${t.expires_at ? ` (vence el ${fecha(t.expires_at)})` : ""}`);
} catch (e) {
  console.log(`⚪ No pude revisar el token con Meta (${e.message}); sigo igual`);
}

// ---------- 2. Página vinculada a la cuenta de Instagram ----------
const campos = "id,name,access_token,instagram_business_account{id,username}";
let paginas;
try {
  paginas = await todas("/me/accounts", { fields: campos, limit: "100" }, usuario);
} catch (e) {
  fallar(`No pude leer tus páginas de Facebook: ${e.message}`);
}
let conInstagram = paginas.filter((p) => p.instagram_business_account?.id);
if (!conInstagram.length) {
  // Páginas que tenés solo a través de un portfolio empresarial
  try {
    const empresas = await todas(
      "/me/businesses",
      { fields: `id,name,owned_pages.limit(100){${campos}},client_pages.limit(100){${campos}}`, limit: "50" },
      usuario,
    );
    for (const b of empresas) {
      for (const p of [...(b.owned_pages?.data || []), ...(b.client_pages?.data || [])]) {
        if (p.instagram_business_account?.id && !conInstagram.some((x) => x.id === p.id)) conInstagram.push(p);
      }
    }
  } catch {}
}
if (!conInstagram.length) {
  fallar(
    "Ninguna de tus páginas de Facebook tiene una cuenta de Instagram vinculada (o no le diste acceso a la app)",
    "Vinculá la cuenta de Instagram a la página y, al generar el token, elegí todas las páginas y cuentas",
  );
}
const buscada = CONFIG.instagram.cuenta.toLowerCase();
let pagina;
if (buscada) {
  pagina = conInstagram.find((p) => p.instagram_business_account.username?.toLowerCase() === buscada);
  if (!pagina) {
    fallar(
      `No encuentro @${buscada} entre tus cuentas de Instagram`,
      `Las que veo: ${conInstagram.map((p) => `@${p.instagram_business_account.username}`).join(", ")}`,
    );
  }
} else if (conInstagram.length === 1) {
  pagina = conInstagram[0];
} else {
  fallar(
    `Tu usuario maneja varias cuentas de Instagram: ${conInstagram.map((p) => `@${p.instagram_business_account.username}`).join(", ")}`,
    "Elegí una: poné su nombre en config/negocio.json (cuentas.instagram) o cargá IG_CUENTA con npm run cargar-clave -- IG_CUENTA --valor nombre, y volvé a correrlo",
  );
}
const cuenta = pagina.instagram_business_account;
if (!pagina.access_token) {
  fallar(
    `Meta no me dio el token de la página "${pagina.name}"`,
    "Tu usuario tiene que poder crear contenido en esa página (control total o acceso parcial con contenido)",
  );
}

// ---------- 3. Probar con el token de la página ----------
const tokenPagina = pagina.access_token;
let yo;
try {
  yo = await meta(`/${cuenta.id}`, { fields: "id,username" }, tokenPagina);
} catch (e) {
  fallar(`El token de la página no entra a @${cuenta.username}: ${e.message}`);
}
let cupo = "";
try {
  const d = await meta(`/${cuenta.id}/content_publishing_limit`, { fields: "config,quota_usage" }, tokenPagina);
  const x = d.data?.[0] || {};
  cupo = `${x.quota_usage ?? 0} de ${x.config?.quota_total ?? 100} publicaciones en las últimas 24 h`;
} catch (e) {
  fallar(`Meta no deja publicar en @${yo.username}: ${e.message}`, "Revisá que el token tenga instagram_content_publish");
}
let vence = "no se pudo saber cuándo vence";
try {
  const { data: t } = await meta("/debug_token", { input_token: tokenPagina }, usuario);
  vence = t.expires_at ? `vence el ${fecha(t.expires_at)}` : "no vence";
} catch {}

// ---------- 4. Guardar ----------
actualizarEnv(
  CONFIG.archivoEnv,
  { IG_USER_ID: cuenta.id, IG_TOKEN: tokenPagina, IG_API_BASE: BASE, IG_CUENTA: yo.username || cuenta.username },
  ["IG_TOKEN_USUARIO"],
  "Instagram por Facebook (lo cargó npm run ig-conectar)",
);

console.log(`✅ Instagram conectado por Facebook: @${yo.username} (id ${cuenta.id})`);
console.log(`   Página: "${pagina.name}" (id ${pagina.id}) · el token de la página ${vence}`);
console.log(`   Cupo: ${cupo}`);
console.log(`   Guardado en ${CONFIG.archivoEnv}: IG_USER_ID, IG_TOKEN, IG_API_BASE, IG_CUENTA (el token no se muestra)`);
console.log("\nAhora: systemctl --user restart videos-redes  y después  npm run chequeo");
