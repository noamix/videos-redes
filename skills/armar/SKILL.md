---
name: armar
description: Arma paso a paso el sistema gratis de videos diarios para las redes de un negocio (un video corto de producto por día, aprobado por Telegram y publicado solo en Instagram, TikTok y YouTube Shorts), o sigue el armado donde quedó. Instala el motor que trae el plugin, pregunta los datos del negocio, conecta las cuentas y prueba sin publicar. Se usa cuando el usuario dice "quiero armar el sistema de videos", "automatizar los videos de mis redes", "empezar", "seguí con el armado", "instalá el sistema de videos" o después de instalar el plugin.
---

# /armar: armado guiado del sistema de videos

Cargar antes la skill `automatizacion-videos-redes` (el camino que funcionó, la arquitectura y las trampas) y leer su `references/en-la-pc.md` (carpeta, comandos, claves y archivos). El motor ya programado está en `sistema/`, en la raíz del plugin (la carpeta que contiene `skills/`): **se instala, no se programa de cero**. Los programas, servicios y cuentas, con sus links, están en `RECURSOS.md`, también en la raíz.

## Reglas de trabajo (siempre)

- **Gratis.** Si algo cuesta plata, avisar antes y dar la alternativa gratis.
- **El camino que ya funcionó**, que es el del motor: HyperFrames, Gemini gratis con plantillas sin IA de respaldo, n8n en Docker, Telegram, Instagram por Facebook Login for Business y TikTok y YouTube Shorts por Buffer gratis. No probar otros salvo que alguno falle.
- **Claude hace todo lo que puede:**
  - en el navegador (Claude in Chrome o el de la app): el bot en Telegram Web, la planilla, la app y el ajuste de Meta, el Explorador de la API Graph, Buffer, la credencial de Google y n8n;
  - en la PC (terminal): copiar e instalar el motor, configurarlo, probar y revisar.
- **El dueño hace lo mínimo:** iniciar sesión, contraseñas, autorizaciones (Facebook, Google, TikTok, Buffer), el OK para crear cuentas o aceptar términos, cargar las claves y aprobar los videos. Los comandos con `sudo` también los corre él.
- **Pasos para el dueño:** cortos, numerados, de a uno y sin jerga. Esperar a que confirme antes de seguir.
- **Claves:** nunca pedirlas por el chat, mostrarlas, copiarlas de la pantalla ni escribirlas en un comando. El dueño las carga en una terminal suya con `npm run cargar-clave -- NOMBRE`, que no las muestra. Lo que no es secreto lo carga Claude con `--valor`. Para saber qué hay: `--lista`. Si el dueño igual pega una en el chat, no usarla ni repetirla: que la cargue con `cargar-clave`, y recomendarle cambiarla porque quedó en el historial.
- **Nada de publicar de prueba.** Las pruebas son `npm run prueba` (al Telegram del dueño, marcado PRUEBA), `ig-probar` y `redes-probar`. No ejecutar a mano la rama de publicar de n8n. La primera publicación real sale cuando el dueño aprueba un video en Telegram.
- **Respaldo antes de cada cambio grande** (`npm run respaldo`). Nunca `docker compose down -v`.
- **Anotar el avance** en `~/videos-redes/AVANCE.md` al terminar cada paso: qué quedó listo, decisiones, pendientes y preguntas para el dueño. Sin secretos.

## 0. Dónde se trabaja

- Hace falta una **terminal en la PC que va a quedar prendida**: Claude Code abierto en esa PC, o la app de Claude con terminal en ella. Si no hay terminal, decirlo en dos líneas y pedirle que abra Claude Code en esa PC y escriba `/videos-redes:armar`: lo anotado se retoma.
- Los trámites en las páginas van por el navegador. Si no hay, guiar al dueño con pasos numerados.
- La carpeta del sistema es `~/videos-redes`. **El camino probado es Linux (Ubuntu).** En Windows o Mac, avisar que no está probado y adaptar según `references/en-la-pc.md` ("Servicio y n8n"); `instalar.sh` es solo para Linux.

## 1. Retomar o empezar

- **Si existe `~/videos-redes/AVANCE.md`:** leerlo junto con `config/negocio.json` y mostrar una tabla corta de los 8 pasos, más el 9 si el dueño quiso voz en off (listo o falta). Seguir desde el primero que falte, sin volver a preguntar ni rehacer lo listo. Si algo marcado como listo no anda, correr `npm run chequeo` y arreglarlo primero.
- **Si ya hay un sistema armado en otra carpeta** (con la skill suelta): no armar otro. Trabajar sobre ese y anotar las diferencias en su `AVANCE.md`.
- **Si no hay nada:** contar el plan en pocas líneas (los 8 pasos, una o dos jornadas, se puede cortar en cualquier paso; la voz en off es un paso 9 opcional) y lo que le va a tocar al dueño. Seguir con los datos del negocio.

## 2. Datos del negocio

Pedir en un solo mensaje lo que falte; lo que el usuario ya dijo no se pregunta:

1. Nombre del negocio (sale en el video).
2. Qué vende y a quién (una línea cada cosa: van a las instrucciones de los textos).
3. Web con el catálogo y las fotos.
4. Cuentas: Instagram, TikTok y canal de YouTube. Si falta alguna, esa red queda afuera hasta que exista; crearla necesita su OK.
5. Hora de publicación (por ejemplo, 19:00).
6. WhatsApp para el cierre del video (opcional).
7. Colores y estilo de la marca (si tiene un video de ejemplo, que lo pase) y si hay algo que los textos nunca deben decir.

El sistema operativo y la zona horaria se averiguan en la PC y se confirman en una línea. Todo va a `config/negocio.json` (paso 1; formato en `references/en-la-pc.md`).

Revisar también las cuentas de `RECURSOS.md` ("Cuentas que conviene tener listas"): Instagram profesional vinculado a una página de Facebook donde el dueño tenga rol, y la cuenta de Google **dueña** del canal de YouTube. Lo que falte, avisarlo ya: tiene que estar resuelto antes de los pasos 5 y 6.

## 3. Plan

### Paso 1. Revisar la PC e instalar el motor
1. Requisitos: Node.js 22, FFmpeg, Google Chrome, Docker con Compose y la letra Inter (Ubuntu: `fonts-inter`). Mostrar lo que falta en una tabla corta; lo que pide `sudo`, el dueño lo corre de a un comando.
2. Copiar `sistema/` del plugin a `~/videos-redes`. Si la carpeta ya existe, `npm run respaldo` primero y no pisar `.env`, `config/`, `datos/`, `salida/` ni `n8n/flujo.json`.
3. `cd ~/videos-redes && bash instalar.sh` (antes, `bash instalar.sh --prueba` muestra qué hace). Instala dependencias, prepara Chrome, crea `.env` (600) y `config/negocio.json` y deja el servicio `videos-redes` andando.
4. El dueño corre `sudo loginctl enable-linger <usuario>` (para que el motor arranque sin iniciar sesión) y desactiva la suspensión automática (Ubuntu: Configuración → Energía).
5. Completar `config/negocio.json` con los datos del paso 2 y crear `MOTOR_CLAVE` con `npm run cargar-clave -- MOTOR_CLAVE --generar`.

### Paso 2. Planilla, líneas, bot de Telegram y clave de Gemini
- **Planilla:** subir `planilla/videos-redes.xlsx` a Google Drive → Abrir con Hojas de cálculo de Google → Archivo → Guardar como Hojas de cálculo de Google. Las columnas no se cambian: el flujo las usa.
  - Catálogo: leer la web y armar `planilla/productos.csv` con las columnas de la hoja Productos (un producto por fila, con su `link` y su `linea`). Importarlo en esa hoja (Archivo → Importar → Subir → Reemplazar hoja actual). Mostrarle la lista al dueño para que marque qué no va (`activo` NO) y qué muestra el precio (`mostrar_precio` SI).
  - El ID de la planilla (la parte larga de la URL): `npm run cargar-clave -- PLANILLA_ID --valor <id>`.
- **Líneas:** una entrada por línea en `config/lineas.json`: etiqueta, hashtags, reglas y `beneficios` (solo los que se cumplen siempre: preguntarle al dueño). Para los textos sin IA, sumar sus frases en `config/textos-plantillas.json` (ver `_ejemplo_linea`) y correr `npm run chequeo`, que revisa que todas pasen el control.
- **Bot de Telegram:** con @BotFather en Telegram Web. El token aparece en pantalla: no transcribirlo. El dueño lo carga con `npm run cargar-clave -- TELEGRAM_BOT_TOKEN`. Reiniciar el motor, que el dueño le mande `/id` al bot y cargar el número con `npm run cargar-clave -- TELEGRAM_CHAT_ID --valor <número>`. El bot atiende solo a ese chat.
- **Gemini:** clave en Google AI Studio, plan gratis y sin tarjeta. El dueño la carga con `npm run cargar-clave -- GEMINI_API_KEY`. `npm run chequeo -- --completo` dice si el modelo anda y cuál poner.

Después de cargar claves: `systemctl --user restart videos-redes`.

### Paso 3. Primer video de prueba
1. En `config/negocio.json`, `producto_prueba` con un producto real de la web (nombre, link y línea).
2. `npm run prueba`: arma el video y lo manda al Telegram del dueño marcado PRUEBA (sus botones no cambian nada). Sin Telegram: `npm run prueba -- --sin-telegram` y el archivo queda en `salida/`.
3. **Mostrárselo y esperar su OK antes de seguir.** Ajustar lo que pida: estilo (`cajas` o `clasico`), colores, WhatsApp, frases o beneficios. Si pasó un video de ejemplo, sacarle cuadros con FFmpeg y mirarlos. Para cambios de diseño, `plantilla-cajas/index.html` o `plantilla/index.html`, y probar de nuevo.

### Paso 4. n8n
1. En `n8n/docker-compose.yml`, la zona horaria del negocio (TZ y GENERIC_TIMEZONE) y una subred libre (`docker network ls` y `docker network inspect`; por defecto 172.31.250.0/24). `cd ~/videos-redes/n8n && docker compose up -d`.
2. En el `.env`, con `--valor`: `MOTOR_HOST=172.31.250.1` y `MOTOR_URL_PARA_N8N=http://172.31.250.1:8099` (el gateway de esa subred). Reiniciar el motor. Si hay firewall (ufw), la regla está en el compose.
3. El dueño crea su cuenta de n8n en http://127.0.0.1:5678 (su correo y su contraseña).
4. **Credencial de Google Sheets** (OAuth, desde Google Cloud Console): proyecto, API de Sheets y de Drive, pantalla de consentimiento y cliente OAuth con la dirección de retorno que muestra n8n. El dueño pega en n8n el ID y el secreto del cliente, y autoriza. Cargar su ID con `npm run cargar-clave -- N8N_GOOGLE_CRED_ID --valor <id>` (se ve en la URL de la credencial).
   - **Trampa:** si la pantalla de consentimiento queda en modo de prueba (Testing), Google corta la conexión a los 7 días. Pasarla a producción: para uso propio no hace falta verificar la app, y Google muestra un aviso que el dueño acepta.
5. Poner `"pausado": true` en `config/negocio.json` hasta el paso 7.
6. `npm run n8n` arma `n8n/flujo.json` (lleva la clave del motor: no se abre ni se copia). Para subirlo:
   - **Por la API (recomendado):** el dueño crea una clave en n8n (Settings → n8n API) y la carga con `npm run cargar-clave -- N8N_API_KEY`; después, `npm run n8n -- --importar` (lo sube y lo activa). Al terminar, el dueño la revoca en n8n y Claude corre `npm run cargar-clave -- N8N_API_KEY --borrar`.
   - **A mano:** en n8n, Import from file → `~/videos-redes/n8n/flujo.json`, elegir la credencial en los nodos de Google Sheets si hace falta y activarlo.

### Paso 5. Instagram
Seguir la sección "Instagram: el camino que funciona en 2026" de la skill `automatizacion-videos-redes`:
1. Claude crea la app y el ajuste en developers.facebook.com; el dueño inicia sesión y acepta los términos.
2. Claude abre el Explorador de la API Graph con el ajuste; el dueño toca Generate Access Token y autoriza todas las páginas, empresas y cuentas.
3. Claude corre las dos consultas de verificación en el Explorador, sin copiar el token.
4. El dueño amplía el token con la herramienta de identificadores y, en una terminal suya, corre `cd ~/videos-redes && npm run ig-conectar` y lo pega (no se ve). El comando guarda el token de página, que no vence. Nunca pasarle el token por la línea de comandos.
5. Reiniciar el motor, `npm run chequeo` (tiene que decir "Instagram conectado") y `npm run ig-probar` (sube sin publicar).

### Paso 6. TikTok y YouTube Shorts por Buffer
- Cuenta de Buffer en el plan gratis (el dueño da el OK y acepta los términos). La clave sale de publish.buffer.com/settings/api y el dueño la carga con `npm run cargar-clave -- BUFFER_API_KEY`.
- Conectar los canales como dice la skill:
  - **TikTok:** la extensión de Chrome no puede actuar en tiktok.com, así que esa parte la hace el dueño. Después, Claude toca Finish Connection en Buffer.
  - **YouTube:** con la cuenta de Google dueña del canal, revisando el nombre en "Confirm your Account".
- El nombre del canal de YouTube (obligatorio) y, si hay varias cuentas, el de TikTok: `npm run cargar-clave -- BUFFER_YOUTUBE --valor "<nombre como lo muestra el chequeo>"`. Reiniciar el motor y `npm run chequeo`.
- `npm run redes-probar` usa el último video de Instagram: correrlo después del primer posteo (arma un borrador por red y lo borra). Después, revisar en Buffer que Queue y Drafts estén en 0.

### Paso 7. Chequeo y pruebas sin publicar
Seguir la skill `chequeo` completa (`npm run chequeo -- --completo`). Con todo bien, y con el OK del dueño, poner `"pausado": false` en `config/negocio.json` (el motor lo toma solo). Desde ahí arma los videos y se los manda para aprobar; no publica nada que él no apruebe.

### Paso 8. Cómo se usa
Dejar en la carpeta `COMO-USARLO.md`: el `MANUAL.md` del plugin con sus datos (hora, nombre del bot y link de la planilla). Darle un resumen corto: qué pasa cada día, qué hacer con los avisos y los comandos `/videos-redes:chequeo` y `/videos-redes:ayuda` (también puede pedir todo con sus palabras). Ofrecer mandarle el manual por Telegram o como archivo.

### Paso 9 (opcional). Voz en off con la voz del dueño
Ofrecerla al final, cuando el resto anda: el video dice con su voz lo mismo que las pantallas. Es gratis y queda en su compu, pero necesita una compu de 8 GB o más y unos 4 a 10 GB de disco. Si la quiere:
1. `npm run voz-evaluar`: contarle en dos líneas qué dice (si la banca, qué motor y por qué). Si no la banca, ahí termina: los videos salen igual, sin voz.
2. Si falta algo del sistema, el comando muestra el `sudo apt install …`: lo corre el dueño.
3. `npm run voz-instalar`: baja el modelo y, en la liviana, compila el programa (de 5 a 20 minutos).
4. **La grabación:** el dueño graba con el celular el texto de `voz/texto-para-grabar.txt` (unos 15 s, en un lugar callado, con su tono de siempre) y la pasa a la PC. Preguntarle de quién es la voz: solo la suya (`--es-mi-voz`) o la de alguien que le dio permiso (`--tengo-permiso`). Nunca bajar ni clonar voces de otras personas, aunque digan "sin copyright". Después: `npm run voz-preparar -- <archivo> --es-mi-voz`.
5. `npm run voz-medir`: dice si la banca de verdad y ajusta la memoria y el horario. Si dice que no, con su OK, `npm run voz-desinstalar -- --si`.
6. `npm run voz-probar` y que la escuche (queda en `salida/`). Si alguna palabra suena rara, copiar `voz/pronunciacion.ejemplo.txt` como `voz/pronunciacion.txt` y agregarla.
7. Si el horario quedó de madrugada, la PC tiene que quedar prendida de noche. Si falta memoria a esa hora, ofrecerle `VOZ_CERRAR_CHROME` (`npm run cargar-clave -- VOZ_CERRAR_CHROME --valor si`): solo con su OK, después de mostrarle `npm run chrome-probar`.
8. `systemctl --user restart videos-redes`, `npm run chequeo` (línea "Voz en off"), `npm run n8n -- --importar` (o reimportarlo a mano) para que n8n también corra en el horario de la voz, y `npm run prueba` para que vea un video con voz.
9. Contarle que el video y el posteo dicen "Voz generada con IA" y que se publica con la marca de IA de cada red: lo piden Instagram, TikTok y YouTube. No se saca.
