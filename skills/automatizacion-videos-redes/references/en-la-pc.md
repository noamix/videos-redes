# En la PC: carpeta, comandos, claves y archivos

Convenciones del motor que trae el plugin videos-redes (`sistema/` en la raíz del plugin, instalado en `~/videos-redes`). Las usan `/videos-redes:armar`, `/videos-redes:chequeo` y `/videos-redes:ayuda`. Si el sistema se armó antes del plugin, en otra carpeta o con otros nombres, trabajar sobre lo que hay (no armar otro) y anotar las diferencias en su `AVANCE.md`.

## Carpeta del sistema (`~/videos-redes`)

| Qué | Para qué |
|---|---|
| `AVANCE.md` | Estado del armado y de cada cambio o chequeo: pasos listos, decisiones, pendientes y preguntas para el dueño. Sin secretos. Es lo primero que se lee. |
| `config/negocio.json` | Datos del negocio (formato abajo). Sin secretos. El motor lo relee solo cuando cambia: no hace falta reiniciarlo. Modelo: `config/negocio.example.json`. |
| `config/lineas.json` | Una entrada por línea de productos (el nombre es el de la columna `linea` de la planilla): `etiqueta`, `hashtags`, `reglas`, `beneficios` (estilo cajas: hasta 3 que se cumplen siempre), `palabras_prohibidas` y, opcionales, colores del estilo clásico (`color_fondo`, `color_tinta`, `color_acento`, `color_acento_tinta`). `default` vale para los productos sin línea. |
| `config/textos-plantillas.json` | Frases de los textos sin IA (respaldo de Gemini): `comunes`, `lineas` (formato en `_ejemplo_linea`), `productos` y `rasgos`. Después de tocarlo, `npm run chequeo`. |
| `prompts/textos.md`, `prompts/voz.md` | Instrucciones para Gemini (textos y frases de la voz), con los datos y reglas de `negocio.json`. |
| `.env` (600) | Claves y ajustes técnicos. Lo escriben solo `cargar-clave` e `ig-conectar`. Modelo: `.env.example`. |
| `plantilla-cajas/`, `plantilla/` | Los dos estilos del video (HyperFrames + GSAP): "cajas" (colores de la marca, precio, WhatsApp, beneficios) y "clásico" (colores por línea). |
| `motor/`, `pruebas/` | El motor (Node 22) y sus pruebas contra servidores falsos. |
| `n8n/docker-compose.yml` | n8n en Docker (abajo). `n8n/flujo.json`: el flujo armado; **lleva la clave del motor** (600): no se lee ni se copia. |
| `planilla/videos-redes.xlsx` | La planilla modelo (Productos, Calendario y Ayuda). |
| `fotos/`, `musica/` | Fotos propias (si la web no deja bajarlas) y temas libres de derechos (opcional; sin ellos, el video sale sin música). |
| `datos/`, `salida/`, `trabajos/` | Estado interno (respuestas de Telegram, envíos de Buffer), los videos (se borran a los 60 días) y los renders en curso. |
| `respaldos/` | Los de `npm run respaldo` (600). Tienen el `.env`: no se traen, no se leen y no se suben. |
| `COMO-USARLO.md` | El manual del dueño con sus datos (paso 8 del armado). |
| `voz/` | Voz en off (opcional). Los programas (`evaluar.py`, `instalar.sh`, `voz_videos.py`…) vienen con el plugin; `voz-instalar` agrega `.venv/`, `modelos/`, `llama.cpp-omni/` (liviana) y `config.json`; `voz-preparar`, `voces/<nombre>/` (la grabación del dueño: no sale de la compu); `voz-medir`, `medicion.json`. `pronunciacion.txt` (modelo: `pronunciacion.ejemplo.txt`) corrige cómo se dicen palabras puntuales. |

### `config/negocio.json`

```json
{
  "nombre": "TU MARCA",
  "web": "https://www.tumarca.com.ar",
  "web_texto": "",
  "que_vende": "una fábrica argentina de … para comercios y emprendedores",
  "publico": "comercios, emprendedores y tiendas online de Argentina",
  "cuentas": { "instagram": "@tumarca", "tiktok": "@tumarca", "youtube": "@tumarca" },
  "hora_publicacion": "19:00",
  "zona_horaria": "America/Argentina/Buenos_Aires",
  "whatsapp": "",
  "estilo": "cajas",
  "colores": { "principal": "#F7CE00", "oscuro": "#0B0B0B" },
  "logo": "",
  "rotacion": [],
  "dias_adelante": 7,
  "max_por_corrida": 2,
  "reglas_textos": "",
  "palabras_prohibidas": [],
  "producto_prueba": { "producto": "", "link": "", "linea": "" },
  "pausado": false
}
```

- `web_texto`: lo que se lee en el botón del video (si está vacío, sale de `web` sin `https://` ni `www.`).
- `estilo`: `cajas` o `clasico`. `colores`: los dos de la marca (en el clásico, para las líneas sin colores propios). `logo`: PNG transparente dentro de la carpeta, por ejemplo `fotos/logo.png`.
- `rotacion`: el orden de las líneas; vacío = todas las de la hoja Productos, en el orden en que aparecen.
- `reglas_textos` y `palabras_prohibidas`: reglas propias para Gemini; las palabras también las controla el motor (sin importar tildes).
- `pausado` en true: no se agenda, no se genera y no se publica nada (vacaciones, o mientras se termina de armar).

## Comandos (en `~/videos-redes`)

| Comando | Qué hace | Quién lo corre |
|---|---|---|
| `bash instalar.sh` | Dependencias, Chrome, `.env` y `negocio.json` (sin pisarlos) y el servicio `videos-redes`. `--prueba`: muestra qué haría | Claude |
| `npm run chequeo` | Revisa todo y dice qué falta. `-- --completo`: además prueba Telegram y Gemini | Claude |
| `npm run prueba` | Video de prueba con `producto_prueba`, al Telegram del dueño marcado PRUEBA. `-- --sin-telegram`: solo el archivo en `salida/` | Claude |
| `npm run cargar-clave -- NOMBRE` | Pide el valor sin mostrarlo y lo guarda en el `.env` (600) | El dueño, en una terminal suya |
| `npm run cargar-clave -- NOMBRE --valor "…"` · `--generar` · `--ver` · `--borrar` · `--lista` | Lo que no es secreto · clave al azar · ver un valor no secreto · sacar una clave · qué nombres tienen valor | Claude |
| `npm run n8n` | Arma `n8n/flujo.json`. `-- --importar`: lo sube a n8n por la API y lo activa (con `N8N_API_KEY`) | Claude |
| `npm run ig-conectar` | Pide el token largo sin mostrarlo, lo revisa y guarda el token de página (no vence) | El dueño |
| `npm run ig-probar` / `npm run redes-probar` | Instagram y Buffer **sin publicar** | Claude |
| `npm run respaldo` | `respaldos/respaldo-<fecha>.tgz` (600), sin `node_modules`, `salida` ni respaldos | Claude, antes de cada cambio grande |
| `npm run pruebas` | Pruebas del motor contra servidores falsos (`-- --render`: también arma videos) | Claude, después de tocar el código |
| `npm run vista-previa` | La plantilla del video en el navegador | Claude o el dueño |
| `npm run voz-evaluar` | ¿La compu banca la voz? Recomienda liviana o completa, sin instalar nada | Claude |
| `npm run voz-instalar` | Instala la voz (`-- --motor liviana` o `completa`). Si falta algo del sistema, muestra el `sudo apt install …` | Claude (el sudo, el dueño) |
| `npm run voz-preparar -- archivo --es-mi-voz` | Arma la voz con la grabación (`--tengo-permiso` si es de otra persona que autorizó; `--reemplazar`) | Claude, con el OK del dueño |
| `npm run voz-medir` | Mide tiempo y memoria con 3 frases y ajusta el `.env` (`-- --sin-guardar`: solo informa) | Claude |
| `npm run voz-probar -- "frase"` · `npm run voz-estado` | Una frase en `salida/` para escucharla · estado de la voz | Claude o el dueño |
| `npm run chrome-probar` | Qué navegador cerraría el motor para hacerle lugar a la voz. `-- --cerrar` lo cierra de verdad | Claude; `--cerrar`, solo con el OK del dueño |
| `npm run voz-desinstalar` | Muestra qué borraría; `-- --si` saca la voz (las grabaciones quedan; `--todo` también las borra) | Claude, con el OK del dueño |
| `npm run pruebas-voz` | Pruebas de la voz sin modelo | Claude, después de tocar `voz/` |

Pegar en la terminal: Ctrl+Shift+V en Linux. Mientras se pega una clave no se ve nada: es normal.

## Claves y ajustes del `.env`

- **Secretas** (las carga el dueño): `MOTOR_CLAVE` (con `--generar`), `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `IG_TOKEN` (la carga `ig-conectar`), `BUFFER_API_KEY`, `N8N_API_KEY` (temporal), `WP_CLAVE_APLICACION` (opcional).
- **No secretas** (con `--valor`): `TELEGRAM_CHAT_ID`, `TELEGRAM_SILENCIO` (horas sin sonido, por defecto `23-7`), `PLANILLA_ID`, `N8N_GOOGLE_CRED_ID`, `MOTOR_HOST`, `MOTOR_URL_PARA_N8N`, `MOTOR_PUERTO`, `GEMINI_MODELO`, `TEXTOS_MODO`, `BUFFER_YOUTUBE`, `BUFFER_TIKTOK`, `BUFFER_REDES`, `BUFFER_YOUTUBE_CATEGORIA`, `IG_CUENTA`, `HYPERFRAMES_BROWSER_PATH`, `WP_URL`, `WP_USUARIO`.
- **Voz en off** (no secretas; las carga `voz-instalar` y las ajusta `voz-medir`): `VOZ_MODO` (`auto` o `no`), `VOZ_COMANDO`, `VOZ_NOMBRE`, `VOZ_MEMORIA_MIN_MB`, `VOZ_TOPE_MEMORIA`, `VOZ_TOPE_SWAP`, `VOZ_HORARIO` (vacío = a cualquier hora), `VOZ_CERRAR_CHROME`, `VOZ_INACTIVO_MIN`, `VOZ_TIMEOUT_MIN`, `VOZ_URGENTE_DIAS`, `VOZ_AVISO` y `VOZ_TEMPO_MAX`. Para borrar un valor (por ejemplo, `VOZ_HORARIO` para que sea a cualquier hora): `--borrar`.
- Después de cambiar el `.env`: `systemctl --user restart videos-redes`. Si cambian el puerto, la clave del motor, `PLANILLA_ID`, la credencial o `VOZ_HORARIO`: `npm run n8n` y volver a subir el flujo.

## Servicio y n8n

- **Linux:** servicio de usuario systemd `videos-redes` (`systemctl --user restart videos-redes`; registro: `journalctl --user -u videos-redes -n 50 --no-pager`). Para que arranque sin iniciar sesión: `sudo loginctl enable-linger <usuario>` (lo corre el dueño).
- **n8n:** `n8n/docker-compose.yml`, proyecto `videos-redes`, imagen n8n 2.31.6, puerto solo en 127.0.0.1:5678, zona horaria del negocio, `restart: unless-stopped` y red propia con subred fija (por defecto 172.31.250.0/24, puente `br-videos-redes`). El motor escucha en el gateway (`MOTOR_HOST=172.31.250.1`) y n8n lo llama en `MOTOR_URL_PARA_N8N=http://172.31.250.1:8099`, con la clave del motor en cada pedido. Se levanta con `docker compose up -d` y se para con `docker compose stop`, o con `down` sin `-v`.
- **Windows o Mac (sin probar):** no hay instalador. El motor arranca con el Programador de tareas (Windows) o un LaunchAgent (Mac), y Docker Desktop con la sesión; n8n llega al motor por `host.docker.internal` y el motor escucha en 127.0.0.1.
- **HyperFrames:** usa su propio Chrome (`npx hyperframes browser ensure`); si no lo puede bajar, el de la PC (`HYPERFRAMES_BROWSER_PATH`, lo carga `instalar.sh`). Telemetría apagada. No usar `publish`, `cloud`, `share` ni `feedback`.

## Bloqueos automáticos

El plugin trae bloqueos (hooks) que frenan estas cosas aunque Claude se equivoque:

- mostrar, traer, pisar o borrar el `.env`, `n8n/flujo.json` o los respaldos: para saber qué claves hay, `npm run cargar-clave -- --lista`; para crear el `.env` si falta, `cp -n .env.example .env && chmod 600 .env`;
- escribir una clave en un comando (`IG_TOKEN_USUARIO='EAA…'`, `--valor` con una clave): la carga el dueño con `cargar-clave`;
- buscar con `grep -r` en toda la carpeta sin excluir el `.env`: buscar en `motor/`, `config/`, `plantilla*/` o `n8n/docker-compose.yml`, o agregar `--exclude='.env*'`;
- borrar volúmenes de Docker (`down -v`, `volume rm`, `prune` con volúmenes);
- publicar desde la terminal (`/publicar-pendientes`, `media_publish`, `shareNow`);
- traer al espacio de Claude la grabación de la voz del dueño (`voz/voces/`).

Son una red de seguridad: las reglas de la skill siguen valiendo. Si un bloqueo frena algo legítimo, hacerlo de otra forma o pedírselo al dueño; no buscarle la vuelta.
