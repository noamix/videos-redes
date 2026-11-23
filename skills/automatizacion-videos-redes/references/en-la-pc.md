# En la PC: carpeta, comandos y claves

Convenciones del plugin videos-redes. Las usan `/videos-redes:armar`, `/videos-redes:chequeo` y `/videos-redes:ayuda`. Si el sistema se armó antes del plugin, en otra carpeta o con otros nombres, trabajar sobre lo que hay (no armar otro) y anotar las diferencias en su `AVANCE.md`.

## Carpeta del sistema

`~/videos-redes` (Windows: `%USERPROFILE%\videos-redes`):

| Qué | Para qué |
|---|---|
| `AVANCE.md` | Estado del armado y de cada cambio o chequeo: pasos listos, decisiones, pendientes y preguntas para el dueño. Sin secretos. Es lo primero que se lee. |
| `config/negocio.json` | Datos del negocio y lo que el dueño puede querer cambiar. Sin secretos. El motor lo lee en cada vuelta: cambiar la hora, el estilo o el WhatsApp no toca el código. |
| `config/textos-plantillas.json` | Textos sin IA que rotan cuando Gemini falla o su texto no pasa el control. |
| `.env` (permisos 600) | Claves y ajustes técnicos. Lo escriben solo `cargar-clave` e `ig-conectar`. `.env.example` tiene los nombres, sin valores. |
| `motor/`, `plantilla/`, `scripts/` | El motor (Node 22), la plantilla de HyperFrames y los comandos. |
| `n8n/` | `docker-compose.yml` y `flujo.json` (el flujo exportado). |
| `fotos/` (opcional) | Una subcarpeta por producto, si la web no deja bajar las fotos. |
| `datos/`, `salida/` | Estado interno (por ejemplo, los posteos de Buffer en seguimiento) y los videos. |
| `respaldos/` | Los de `npm run respaldo`, con permisos 600. Tienen el `.env`: no se traen, no se leen y no se suben. |
| `COMO-USARLO.md` | El manual del dueño con sus datos (paso 8 del armado). |

### `config/negocio.json`

```json
{
  "nombre": "…",
  "que_vende": "…",
  "web": "https://…",
  "cuentas": { "instagram": "@…", "tiktok": "@…", "youtube": "@…" },
  "hora_publicacion": "19:00",
  "zona_horaria": "America/Argentina/Buenos_Aires",
  "whatsapp": "",
  "estilo": { "colores": ["#…"], "descripcion": "…", "video_ejemplo": "" },
  "pausado": false
}
```

Con `pausado` en true, el motor no genera ni publica (vacaciones, o mientras se termina de armar).

## Comandos

En la carpeta del sistema, con Node 22:

| Comando | Qué hace | Quién lo corre |
|---|---|---|
| `npm run chequeo` | Revisa Node, FFmpeg, HyperFrames, Gemini, Telegram, n8n, Instagram (cuenta y cupo), Buffer (canales) y las plantillas de textos, y dice qué falla. | Claude |
| `npm run prueba` | Arma un video de prueba sin publicar: lo deja en `salida/` y lo manda al Telegram del dueño marcado PRUEBA. | Claude |
| `npm run ig-probar` | Crea un contenedor de Instagram y espera FINISHED, sin `media_publish`. | Claude |
| `npm run redes-probar` | Un borrador por red en Buffer (`saveToDraft: true`, `schedulingType: notification`) y lo borra. | Claude |
| `npm run respaldo` | `tar` de la carpeta sin `node_modules`, `salida/` ni `respaldos/`, guardado en `respaldos/` con permisos 600. | Claude, antes de cada cambio grande |
| `npm run cargar-clave -- NOMBRE` | Pide el valor sin mostrarlo y lo guarda en el `.env` (lo crea con permisos 600 si falta). Con `--generar` crea uno al azar (para `MOTOR_CLAVE`); con `--valor "…"` guarda un valor que no es secreto; con `--lista` muestra qué nombres tienen valor, sin los valores. | El dueño, en una terminal suya. Claude, solo con `--generar`, `--valor` o `--lista` |
| `npm run ig-conectar` | Pide el token largo de usuario sin mostrarlo, lo revisa con `debug_token`, guarda el token de página (no vence) y el ID de Instagram, y no imprime nada secreto. | El dueño |
| `npm run publicar-ahora` | Publica ya el video aprobado del día. | Solo el dueño |

Pegar en la terminal: Ctrl+Shift+V en Linux, Ctrl+V en Windows, Cmd+V en Mac. Mientras se pega una clave no se ve nada: es normal.

## Claves y ajustes del `.env`

`MOTOR_CLAVE`, `MOTOR_IP`, `MOTOR_PUERTO`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `GEMINI_CLAVE`, `GEMINI_MODELO`, `IG_ID`, `IG_TOKEN`, `GRAPH_VERSION`, `BUFFER_CLAVE`, `BUFFER_TIKTOK`, `BUFFER_YOUTUBE`, `BUFFER_YOUTUBE_CATEGORIA` (22 por defecto) y `N8N_WEBHOOK_ESTADO`. De respaldo, opcionales: `WORDPRESS_URL`, `WORDPRESS_USUARIO` y `WORDPRESS_CLAVE`.

Son secretos `MOTOR_CLAVE`, `TELEGRAM_TOKEN`, `GEMINI_CLAVE`, `IG_TOKEN`, `BUFFER_CLAVE` y `WORDPRESS_CLAVE`. Los demás se cargan con `--valor`.

## Servicio y n8n

- **Linux:** servicio de usuario systemd `videos-redes` (`systemctl --user restart videos-redes`; registro: `journalctl --user -u videos-redes -n 50 --no-pager`). Para que arranque después de reiniciar sin iniciar sesión: `sudo loginctl enable-linger <usuario>` (lo corre el dueño).
- **Windows o Mac (sin probar):** el motor arranca con el Programador de tareas (Windows) o con un LaunchAgent (Mac), y Docker Desktop, con la sesión. n8n llega al motor por `host.docker.internal` y el motor escucha en 127.0.0.1.
- **n8n:** proyecto de Docker Compose `videos-redes` en `n8n/` (volúmenes `videos-redes_…`), puerto solo en 127.0.0.1:5678, zona horaria del negocio en `GENERIC_TIMEZONE` y `TZ`, y `restart: unless-stopped`. Se levanta con `docker compose up -d` y se para con `docker compose stop`, o con `down` sin `-v`.

## Bloqueos automáticos

El plugin trae bloqueos (hooks) que frenan estas cosas aunque Claude se equivoque:

- mostrar, traer o pisar el `.env` o los respaldos: para saber qué claves hay, `npm run cargar-clave -- --lista`; para crear el `.env` si falta, `cp -n .env.example .env && chmod 600 .env`;
- buscar con `grep -r` en toda la carpeta sin excluir el `.env`: buscar en `motor/`, `config/`, `plantilla/` o `n8n/`, o agregar `--exclude='.env*'`;
- borrar volúmenes de Docker (`down -v`, `volume rm`, `prune` con volúmenes);
- publicar desde la terminal (`publicar-ahora`, `/publicar-pendientes`, `media_publish`, `shareNow`).

Son una red de seguridad: las reglas de la skill siguen valiendo. Si un bloqueo frena algo legítimo, hacerlo de otra forma o pedírselo al dueño; no buscarle la vuelta.
