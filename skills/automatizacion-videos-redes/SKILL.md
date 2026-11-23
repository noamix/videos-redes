---
name: automatizacion-videos-redes
description: Usar para armar o mantener un sistema gratis que hace un video corto de producto por día y lo publica solo en Instagram, TikTok y YouTube Shorts (n8n + motor propio + Gemini + Telegram + Buffer), con los caminos que funcionan en 2026. Se usa cuando el usuario pregunta por una pieza del sistema ("cómo saco el token de Instagram", "qué es el error 190", "cómo conecto TikTok o YouTube en Buffer", "por qué no la API de TikTok", "cómo se arma la plantilla del video") o cuando otra skill de videos-redes la necesita.
---

# Videos diarios automáticos para redes (gratis)

Probado en noviembre de 2026 con una pyme argentina. Todo con planes gratis; solo hace falta una PC prendida a la hora de publicar.

En el plugin videos-redes, la carpeta, los comandos y las claves de la PC están en `references/en-la-pc.md`, y los programas, servicios y cuentas con sus links, en `RECURSOS.md` (raíz del plugin, la carpeta que contiene `skills/`).

## Qué hace
1. **Elige el producto:** cada día toma uno del catálogo (una planilla) y rota por líneas de producto.
2. **Arma el video:** vertical de 15 s (1080×1920, 30 fps), en 3 pantallas de 5 s, con fotos del producto, textos y el estilo de la marca.
3. **Pide aprobación:** lo manda a Telegram con botones **Aprobar / Rehacer**. Rehacer lo regenera al toque con otros textos.
4. **Publica:** a la hora elegida sube el video aprobado del día a Instagram y, por Buffer, a TikTok y YouTube Shorts.
5. **Avisa:** manda los links por Telegram, o un aviso si algo falló.

## Reglas para trabajar con el dueño
- **Lo más simple y gratis primero.** Antes de proponer algo pago o complejo, buscá la alternativa gratis.
- **Seguí el camino de esta skill**, que ya funcionó: HyperFrames, Gemini gratis, n8n en Docker, Telegram, Instagram por Facebook Login for Business, y TikTok y YouTube Shorts por Buffer. No explores otros salvo que alguno falle.
- **Claude hace todo lo que puede y el dueño, lo mínimo:**
  - En el navegador, con Claude in Chrome: crear el bot en Telegram Web, la planilla, la app y el ajuste de Meta, los pasos del Explorador de la API Graph, la cuenta de Buffer, la clave de n8n e importar el flujo.
  - En la PC, con Claude Code: instalar, programar, probar y revisar.
  - El dueño solo inicia sesión, pone contraseñas, aprueba autorizaciones, da el OK para crear cuentas o aceptar términos, pega claves y aprueba los videos.
- **Si no es programador:** pasos cortos y numerados, y nada de jerga.
- **Secretos (tokens, claves, contraseñas):** nunca en el chat ni en informes. Se pegan solo en la terminal o en Claude Code. Si aparecen en pantalla, no se transcriben.
- **Lo que hace el dueño:** autorizaciones OAuth, consentimientos y contraseñas. Claude puede abrir la pantalla y, después, terminar las confirmaciones.
- **Pruebas:** siempre sin publicar (borradores o contenedores sin publicar). Publicar en público solo con el OK del dueño.

## Arquitectura
- **n8n (en Docker) es el reloj:**
  - cada hora de 8 a 21: planificar y generar (máximo 2 videos por vuelta);
  - cada 15 min de 8 a 23: publicar;
  - los lunes: revisar conexiones.
- **Motor:** Node 22 como servicio de usuario (systemd). Endpoints `/planificar`, `/generar`, `/publicar-pendientes`, `/renovar-token-ig` (revisión de los lunes) y `/estado`.
  - Escucha solo en la IP del gateway de la red de Docker y pide una clave.
  - Conviene fijar la subred de esa red en el compose para que la IP no cambie.
- **Planilla de Google:**
  - hoja Productos: nombre, link a la web, línea, `mostrar_precio`, activo, etc.;
  - hoja Calendario: fecha, producto, estado, archivo, caption, ganchos, link de Instagram y nota.
  - Estados: `pendiente` → `esperando_ok` → `aprobado` / `rehacer` → `publicado` | `publicar_a_mano` | `error_ig`.
- **Video:** HyperFrames (HTML + GSAP → MP4) con una plantilla que recibe variables (`data-composition-variables`). Las fotos salen de la página del producto en la web.
- **Textos:** API de Gemini en el plan gratis, sin facturación (modelo flash, con respaldos flash-lite).
  - Si falla o el texto no pasa el control, salen plantillas sin IA que rotan.
  - El control de reglas va en el código: voseo, sin precios salvo los productos marcados, sin teléfonos, sin "!" en pantalla, largos máximos.
- **Revisión:** bot de Telegram. El motor escucha los botones y avisa a un webhook de n8n, que cambia el estado.

## Orden para armarlo
1. Planilla y catálogo.
2. Bot de Telegram con @BotFather. Va el token al `.env` y el ID del chat se saca con un comando `/id` del bot.
3. Clave de Gemini en AI Studio, sin cargar tarjeta.
4. Motor y plantilla de video. Probá un render y mirá los cuadros más cargados antes del render completo.
5. Flujo de n8n con los 3 disparadores y la credencial de Google Sheets.
6. Instagram (sección siguiente).
7. Buffer para TikTok y YouTube Shorts.
8. Chequeo completo y pruebas sin publicar.

## Instagram: el camino que funciona en 2026
- **Lo que no anda:** las apps nuevas de Meta ya no ofrecen "API de Instagram con inicio de sesión de Instagram", y el "inicio de sesión unificado" pide portfolio empresarial y usuario del sistema.
- **Lo que anduvo:** **Facebook Login for Business con identificador de acceso de usuario**.
- **Requisitos:** cuenta de Instagram profesional, vinculada a una página de Facebook donde el usuario tenga las tareas MANAGE y CREATE_CONTENT. No hace falta control total del portfolio.
- **Pasos:**
  1. En developers.facebook.com, creá una app con el caso de uso de Instagram / Facebook Login for Business.
  2. Creá un **ajuste** (configuration) de inicio de sesión: variación General → identificador de acceso de **usuario** → permisos `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` y `business_management`.
     - Marcalos uno por uno y mirá el contador: las dependencias se marcan solas, y si volvés a tocarlas se desmarcan.
  3. Explorador de la API Graph → elegí la app → pestaña **Configurations** → el ajuste → **Generate Access Token**. El dueño autoriza y elige todas las páginas, empresas y cuentas.
  4. Verificá dos consultas:
     - `me/accounts?fields=id,name,tasks,instagram_business_account{id,username}`;
     - `{ig-id}/content_publishing_limit?fields=config,quota_usage` (tiene que responder 100 por día).
  5. Tocá la "i" al lado del token → herramienta de identificadores → **Ampliar** → token largo, de unos 60 días.
  6. Con el token largo, `me/accounts` da el `access_token` de la página. Ese es el **token que no vence**.
     - Un script lo guarda en el `.env` junto con el ID de Instagram, sin imprimirlo.
     - Antes, chequeá con `debug_token` que el token de usuario sea largo y tenga los permisos.
- **Publicar sin hosting (subida reanudable):**
  1. `POST /{ig-id}/media` con `media_type=REELS`, `upload_type=resumable` y `caption` → devuelve id y uri.
  2. `POST https://rupload.facebook.com/ig-api-upload/{versión}/{id}` con los headers `Authorization: OAuth <token>`, `offset: 0` y `file_size: <bytes>`, y el archivo en el cuerpo.
  3. Esperá a que `status_code` sea FINISHED.
  4. `POST /{ig-id}/media_publish` y después `GET {media}?fields=permalink,media_url`.
- **Modo desarrollo:** alcanza el acceso estándar, porque publica solo en la cuenta propia. No hace falta revisión de Meta.
- **Trampas:**
  - el token corto del explorador vence en una hora, y es normal;
  - `content_publishing_limit` cuenta solo lo publicado por la API en 24 h;
  - el error 190 quiere decir token vencido o revocado: hay que reconectar.
- **Prueba sin publicar:** creá el contenedor y esperá FINISHED sin llamar a `media_publish`. Meta lo descarta solo en 24 h.

## TikTok y YouTube Shorts por Buffer (plan gratis)
- **Por qué Buffer:**
  - la API de TikTok sin auditoría publica todo en privado, y la auditoría no aprueba herramientas internas;
  - la API de YouTube, desde proyectos sin auditar, sube en privado;
  - Buffer ya está aprobado en las dos.
  - También se descartó que Claude programe desde el navegador: depende de Claude, y la subida de archivos de la extensión tiene tope de 3,8 MB.
- **Plan gratis:**
  - 3 canales y 10 posteos en cola por canal;
  - 1 clave de API (publish.buffer.com/settings/api);
  - GraphQL en `https://api.buffer.com` con `Authorization: Bearer`;
  - límites: 150 pedidos cada 15 min, 600 por día y 1.000 por canal cada 30 días.
- **Video:** Buffer no recibe archivos, solo una URL pública. Pasale el `media_url` del Reel que acaba de salir en Instagram: anda. De respaldo, subilo a WordPress y borralo cuando la red lo publique.
- **Crear el posteo** (`createPost`):
  - `channelId`, `text`, `schedulingType: automatic`, `mode: shareNow` y `assets: [{ video: { url } }]`;
  - YouTube exige `metadata: { youtube: { title, categoryId } }` (título de hasta 100 caracteres, categoría 22 = Gente y blogs) y conviene `madeForKids: false`;
  - TikTok acepta 5 hashtags como máximo y 2.200 caracteres, y no puede usar música de TikTok en automático.
- **Seguimiento:** guardá los ids y, en cada vuelta, consultá `post(input: { id }) { status externalLink error { message } }`. Cuando dice `sent`, mandá el link por Telegram; con `error`, el aviso.
- **Prueba sin publicar:** `saveToDraft: true` con `schedulingType: notification`, por si Buffer ignorara el borrador. Después `deletePost` y revisá en Buffer que Queue y Drafts estén en 0.
- **Conectar canales:**
  - **TikTok:** antes, abrí tiktok.com con la cuenta correcta. Después de autorizar, tocá **Finish Connection** en Buffer: si no, queda sin conectar.
  - **YouTube:** entrá con la cuenta de Google **propietaria** del canal; un administrador de cuenta de marca no alcanza. Elegí el canal en la pantalla "Selecciona tu cuenta o una cuenta de marca".
    - Si en YouTube ves "Suscrito/a" en vez de "Personalizar canal", esa cuenta no es la dueña.
    - Antes de Finish Connection, revisá el nombre en "Confirm your Account": es muy fácil conectar el canal personal por error.
  - **En el motor:** YouTube se usa solo si el `.env` dice qué canal. Si hay varias cuentas de una misma red, no adivines: avisá y no la uses.
  - **Sacar un canal:** Settings → Channels → ⋮ → Disconnect Channel, y escribir "disconnect".

## Seguridad y operación
- **Archivos:** `.env` con permisos 600. Los tokens no van a logs, informes ni chats.
- **Claves temporales** (por ejemplo, la API de n8n para importar el flujo): se crean para la tarea y se revocan al terminar.
- **Antes de cada actualización:** respaldo con `tar` (sin node_modules ni videos). Nunca `docker compose down -v`, porque borra los volúmenes.
- **Actualizaciones:** paquete acumulativo con todo el motor, sin `.env` ni datos. Probalo contra servidores falsos de Meta y Buffer, y buscá secretos antes de comprimir.
- **Chequeo** (`npm run chequeo`): revisa Node, ffmpeg, HyperFrames, Gemini, Telegram, n8n, Instagram (cuenta y cupo), Buffer (canales) y las plantillas de textos.

## Contenido: lo aprendido
- **Ritmo:** 3 pantallas de 5 s se leen bien; 5 de 3 s pasan demasiado rápido.
- **Formato:** en YouTube, los Shorts con un personaje animado hecho con IA (la bolsa con cara) tuvieron unas 5 veces más vistas que los otros.
- **Videos largos de YouTube:** que respondan búsquedas reales (las preguntas que llegan por WhatsApp). Conviene mezclar: la IA hace el guion, el título y los gráficos, y el equipo filma en el lugar.
  - Medí consultas, no vistas: link de WhatsApp con texto precargado por video.
  - Se suben y programan a mano en YouTube Studio, que es gratis.
- **IA en YouTube:** no está prohibida, pero se castiga lo masivo y repetitivo ("inauthentic content"). La voz sintética realista que imita a una persona hay que declararla.
