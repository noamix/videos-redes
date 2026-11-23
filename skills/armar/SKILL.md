---
name: armar
description: Arma paso a paso el sistema gratis de videos diarios para las redes de un negocio (un video corto de producto por día, aprobado por Telegram y publicado solo en Instagram, TikTok y YouTube Shorts), o sigue el armado donde quedó. Pregunta los datos del negocio, revisa la PC, instala, programa y prueba sin publicar. Se usa cuando el usuario dice "quiero armar el sistema de videos", "automatizar los videos de mis redes", "empezar", "seguí con el armado", "instalá el sistema de videos" o después de instalar el plugin.
---

# /armar: armado guiado del sistema de videos

Cargar antes la skill `automatizacion-videos-redes` (el camino que funcionó, la arquitectura y las trampas) y leer su `references/en-la-pc.md` (carpeta, comandos y claves). Los programas, servicios y cuentas, con sus links, están en `RECURSOS.md`, en la raíz del plugin (la carpeta que contiene `skills/`).

## Reglas de trabajo (siempre)

- **Gratis.** Si algo cuesta plata, avisar antes y dar la alternativa gratis.
- **El camino que ya funcionó:** HyperFrames en la PC, Gemini gratis con plantillas sin IA de respaldo, n8n autoalojado en Docker, bot de Telegram con Aprobar / Rehacer, Instagram por Facebook Login for Business con token de página que no vence y subida directa a Meta (sin WordPress), y TikTok y YouTube Shorts por Buffer gratis, con el video que acaba de salir en Instagram. No probar otros salvo que alguno falle. Descartado: la API de Claude (paga), las API propias de TikTok y YouTube (sin auditoría publican en privado), los programas pagos y que Claude programe los posteos a mano.
- **Claude hace todo lo que puede:**
  - en el navegador (Claude in Chrome, o el navegador de la app): el bot en Telegram Web, la planilla, la app y el ajuste de Meta, los pasos del Explorador de la API Graph, la cuenta de Buffer, la credencial de Google, la clave de n8n e importar el flujo;
  - en la PC (terminal): instalar, programar, probar y revisar.
- **El dueño hace lo mínimo:** iniciar sesión, contraseñas, autorizaciones (Facebook, Google, TikTok, Buffer), el OK para crear cuentas o aceptar términos, cargar las claves y aprobar los videos. Los comandos con `sudo` también los corre él.
- **Pasos para el dueño:** cortos, numerados, de a uno y sin jerga. Esperar a que confirme antes de seguir.
- **Claves:** nunca pedirlas por el chat, mostrarlas, copiarlas de la pantalla ni guardarlas fuera del `.env`. El dueño las carga en una terminal suya con `npm run cargar-clave -- NOMBRE`, que no las muestra. Para saber qué claves hay: `npm run cargar-clave -- --lista`. Si igual pega una en el chat, no usarla ni repetirla: que la cargue con `cargar-clave`, y recomendarle cambiarla, porque quedó en el historial.
- **Nada de publicar de prueba.** Las pruebas son contenedores de Meta sin publicar y borradores de Buffer que se borran. No ejecutar a mano la rama de publicar de n8n. La primera publicación real sale cuando el dueño aprueba un video en Telegram.
- **Respaldo antes de cada cambio grande** (`npm run respaldo`). Nunca `docker compose down -v`.
- **Anotar el avance** en `AVANCE.md` al terminar cada paso: qué quedó listo, decisiones, pendientes y preguntas para el dueño, sin secretos.

## 0. Dónde se trabaja

- Hace falta una **terminal en la PC que va a quedar prendida**: Claude Code abierto en esa PC, o la app de Claude con terminal en ella. Si no hay terminal, decirlo en dos líneas y pedirle que abra Claude Code en esa PC y escriba `/videos-redes:armar`: lo anotado se retoma.
- Los trámites en las páginas van por el navegador. Si no hay, guiar al dueño con pasos numerados.
- La carpeta del sistema es `~/videos-redes` (Windows: `%USERPROFILE%\videos-redes`).

## 1. Retomar o empezar

- **Si existe `AVANCE.md`:** leerlo junto con `config/negocio.json` y mostrar una tabla corta de los 8 pasos (listo o falta). Seguir desde el primero que falte, sin volver a preguntar lo que ya está ni rehacer lo listo. Si algo marcado como listo no anda (por ejemplo, el servicio parado), arreglarlo primero.
- **Si ya hay un sistema armado en otra carpeta** (con la skill suelta): no armar otro. Trabajar sobre ese y anotar las diferencias en su `AVANCE.md`.
- **Si no hay nada:** contar el plan en pocas líneas (los 8 pasos, una o dos jornadas, se puede cortar en cualquier paso y seguir otro día) y lo que le va a tocar al dueño. Crear la carpeta con `AVANCE.md` y seguir con los datos del negocio.

## 2. Datos del negocio

Pedir en un solo mensaje lo que falte; lo que el usuario ya dijo no se pregunta:

1. Nombre del negocio.
2. Qué vende (productos o rubro).
3. Web con el catálogo y las fotos.
4. Cuentas: Instagram, TikTok y canal de YouTube. Si falta alguna, decir qué implica: esa red queda afuera hasta que exista, y crearla necesita su OK.
5. Hora de publicación (por ejemplo, 19:00).
6. WhatsApp para el cierre del video (opcional).
7. Colores y estilo de la marca. Si tiene un video de ejemplo, que lo pase.

El sistema operativo y la zona horaria no se preguntan: se averiguan en la PC y se confirman en una línea. Guardar todo en `config/negocio.json`.

Revisar también las cuentas de `RECURSOS.md` (sección "Cuentas que conviene tener listas"): Instagram profesional vinculado a una página de Facebook donde el dueño tenga rol, y la cuenta de Google **dueña** del canal de YouTube. Lo que falte, avisarlo ya: tiene que estar resuelto antes de los pasos 5 y 6.

## 3. Plan

### Paso 1. Revisar la PC
- Sistema, memoria, disco libre (los videos y las imágenes de Docker ocupan) y si la PC se suspende sola.
- Programas: Node.js 22, FFmpeg, Google Chrome y Docker con Docker Compose. HyperFrames se instala con el motor (paso 3).
- Mostrar lo que falta en una tabla corta e instalarlo. Lo que pide `sudo` lo corre el dueño, de a un comando.
- Desactivar la suspensión automática para que la PC esté despierta a la hora de publicar (en Ubuntu: Configuración → Energía).
- **El camino probado es Linux (Ubuntu).** En Windows o Mac, avisar que no está probado y adaptar según `references/en-la-pc.md` (sección "Servicio y n8n").
- Al final, dejar la base de la carpeta: `package.json` con `cargar-clave` y `respaldo`, `.env.example`, y `.env` vacío con permisos 600.

### Paso 2. Planilla, bot de Telegram y clave de Gemini
- **Planilla de Google** "Videos diarios <negocio>":
  - **Productos:** nombre, link (la página del producto), línea, precio, `mostrar_precio` (SI/NO), `activo` (SI/NO) y notas;
  - **Calendario:** fecha, producto, estado, archivo, caption, ganchos, link de Instagram y nota (ahí van los links de TikTok y YouTube);
  - **Ayuda:** qué significa cada estado, en palabras simples.

  Cargar el catálogo leyendo la web, un producto por fila y con su línea. Mostrarle la lista al dueño para que marque qué no va (`activo` NO) y qué muestra el precio.
- **Bot de Telegram** con @BotFather, en Telegram Web. El token aparece en pantalla: no transcribirlo. El dueño lo copia y lo carga con `npm run cargar-clave -- TELEGRAM_TOKEN`. El ID del chat sale del comando `/id` del bot cuando el motor ande (paso 3) y va a `TELEGRAM_CHAT_ID`, con `--valor`. El bot atiende solo a ese chat: a cualquier otro no le responde.
- **Clave de Gemini** en Google AI Studio, en el plan gratis y sin cargar tarjeta (`GEMINI_CLAVE`). En `GEMINI_MODELO`, el flash más nuevo del plan gratis, con flash-lite de respaldo: revisar en AI Studio cuáles hay.

### Paso 3. Motor y plantilla del video
- **Motor** en Node 22, en `motor/`, como servicio (Linux: servicio de usuario `videos-redes`; para que arranque solo después de reiniciar, el dueño corre `sudo loginctl enable-linger <usuario>`).
  - Endpoints `/planificar`, `/generar` (hasta 2 videos por vuelta), `/publicar-pendientes`, `/renovar-token-ig` y `/estado`.
  - Escucha solo en la IP del gateway de la red de Docker, con la subred fija en el compose (elegir una libre: `docker network ls` y `docker network inspect`), y pide `MOTOR_CLAVE` en cada pedido (`npm run cargar-clave -- MOTOR_CLAVE --generar`).
  - Lee `config/negocio.json` en cada vuelta. Publica solo el video aprobado **del día**, cuando ya pasó la hora, y no hace nada si `pausado` está en true.
  - Telegram: escucha los botones Aprobar / Rehacer y el comando `/id`, y avisa al webhook de n8n para que cambie el estado. Rehacer regenera al toque con otros textos.
  - Textos con Gemini y el control de reglas en el código: voseo, sin precios salvo `mostrar_precio` SI, sin teléfonos, sin "!" en pantalla y con largos máximos. Si Gemini falla o el texto no pasa el control, salen las plantillas de `config/textos-plantillas.json`, que rotan.
  - Fotos de la página de cada producto; si la web no deja bajarlas, de `fotos/`.
  - No escribe claves en registros ni en mensajes.
  - Todos los comandos de `references/en-la-pc.md`, con `.env.example` al día.
- **Plantilla** de HyperFrames (HTML + GSAP → MP4) en `plantilla/`. Leer antes el README actual de HyperFrames (instalación, render y `data-composition-variables`). Vertical de 1080×1920 a 30 fps, 15 s en 3 pantallas de 5 s, letra Inter, los colores y el estilo de la marca, las fotos del producto y, si hay, el cierre con el WhatsApp. Si el dueño pasó un video de ejemplo, sacarle cuadros con FFmpeg y mirarlos.
- **Video de prueba:** primero renderizar y mirar los cuadros más cargados; después `npm run prueba`, que lo deja en `salida/` y lo manda al Telegram del dueño marcado PRUEBA. **Mostrárselo y esperar su OK antes de seguir.** Ajustar lo que pida.

### Paso 4. Flujo de n8n
- n8n comunitario, autoalojado con Docker Compose en `n8n/`, como dice `references/en-la-pc.md`. La cuenta de n8n la crea el dueño, con su correo y su contraseña.
- **Credencial de Google Sheets** (OAuth, desde Google Cloud Console): proyecto, API de Sheets y de Drive, pantalla de consentimiento y cliente OAuth con la dirección de retorno que muestra n8n. El dueño pega en n8n el ID y el secreto del cliente, y autoriza.
  - **Trampa:** si la pantalla de consentimiento queda en modo de prueba (Testing), Google corta la conexión a los 7 días. Pasarla a producción: para uso propio no hace falta verificar la app, y Google muestra un aviso que el dueño acepta.
- **Flujo** "Videos diarios <negocio>":
  - cada hora, de 8 a 21: planificar y generar;
  - cada 15 minutos, de 8 a 23: publicar pendientes;
  - los lunes: revisar las conexiones (Instagram y Buffer) y avisar por Telegram;
  - un webhook que recibe los botones de Telegram y cambia el estado en la planilla.

  n8n escribe solo las columnas fijas de la planilla. La clave del motor va en un encabezado de cada pedido; llevarla a n8n sin mostrarla (por ejemplo, como variable del compose leída del `.env`).
- **Importar el flujo:** lo más simple es desde la pantalla de n8n (importar desde archivo). Si hace falta la API de n8n, la clave se crea para esta tarea, el dueño la carga con `cargar-clave` y se revoca al terminar (Settings → n8n API). Dejar el flujo exportado en `n8n/flujo.json`.
- Dejarlo activo con `pausado` en true hasta el paso 7.

### Paso 5. Instagram
Seguir la sección "Instagram: el camino que funciona en 2026" de la skill `automatizacion-videos-redes`:
1. Claude crea la app y el ajuste en developers.facebook.com; el dueño inicia sesión y acepta los términos.
2. Claude abre el Explorador de la API Graph con el ajuste; el dueño toca Generate Access Token y autoriza todas las páginas, empresas y cuentas.
3. Claude corre las dos consultas de verificación en el Explorador, sin copiar el token.
4. El dueño amplía el token con la herramienta de identificadores y corre en su terminal `npm run ig-conectar`, donde pega el token largo.
5. `npm run ig-probar`: contenedor sin publicar, hasta FINISHED.

### Paso 6. TikTok y YouTube Shorts por Buffer
- Cuenta de Buffer en el plan gratis (el dueño da el OK y acepta los términos). La clave de API sale de publish.buffer.com/settings/api y el dueño la carga con `npm run cargar-clave -- BUFFER_CLAVE`.
- Conectar los canales como dice la skill:
  - **TikTok:** la extensión de Chrome no puede actuar en tiktok.com, así que esa parte la hace el dueño. Después, Claude toca Finish Connection en Buffer.
  - **YouTube:** con la cuenta de Google dueña del canal, revisando el nombre en "Confirm your Account".

  Son 2 de los 3 canales del plan gratis.
- Nombres de los canales en `BUFFER_TIKTOK` y `BUFFER_YOUTUBE`, con `--valor`. Sin eso, el motor no usa esa red.
- `npm run redes-probar`: un borrador por red, que se borra. Después revisar en Buffer que Queue y Drafts estén en 0 en cada canal.

### Paso 7. Chequeo y pruebas sin publicar
Seguir la skill `chequeo` completa. Con todo bien, y con el OK del dueño, poner `pausado` en false. Desde ahí el sistema arma los videos y se los manda para aprobar; no publica nada que él no apruebe.

### Paso 8. Cómo se usa
Dejar en la carpeta `COMO-USARLO.md`: el `MANUAL.md` del plugin con sus datos (hora, nombre del bot y link de la planilla). Darle un resumen corto: qué pasa cada día, qué hacer con los avisos y los comandos `/videos-redes:chequeo` y `/videos-redes:ayuda` (también puede pedir todo con sus palabras). Ofrecer mandarle el manual por Telegram o como archivo.
