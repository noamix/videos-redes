# Sistema de videos diarios (motor)

Arma solo un video vertical de 15 s por día (3 pantallas de 5 s) con un producto del catálogo, te lo manda a Telegram para aprobar y, a la hora elegida, lo publica en Instagram y, por Buffer, en TikTok y YouTube Shorts.

Esta carpeta es la que el plugin **videos-redes** copia a la PC (`~/videos-redes`). Se arma con `/videos-redes:armar`, se revisa con `/videos-redes:chequeo` y el uso diario está en `COMO-USARLO.md` (o `/videos-redes:ayuda`).

## El circuito

```
            PLANILLA (Google Sheets): Productos · Calendario (un día por fila) · Ayuda
                     ▲                         │
                     │ n8n lee y escribe        │
 n8n ── cada hora 8–21 ──► MOTOR: elige el producto del día (rota por líneas), lee su página en la web,
                           escribe los textos (Gemini o plantillas), arma el video (HyperFrames)
                           y lo manda a TELEGRAM con  ✅ Aprobar  🔁 Rehacer
 n8n ── cada 15 min ─────► MOTOR: a partir de la hora de publicación, publica el aprobado del día en
                           INSTAGRAM y se lo pasa a BUFFER para TIKTOK y YOUTUBE SHORTS; avisa con los links
 n8n ── lunes 10 h ──────► MOTOR: revisa que Instagram y Buffer sigan conectados
```

## Qué es cada cosa

| Qué | Dónde |
|---|---|
| Datos del negocio (marca, web, hora, estilo, colores, WhatsApp, reglas, pausa) | `config/negocio.json` (se relee solo, sin reiniciar) |
| Líneas de productos: etiqueta, colores, beneficios, reglas, hashtags | `config/lineas.json` |
| Frases de los textos sin IA (respaldo de Gemini) | `config/textos-plantillas.json` |
| Instrucciones para Gemini | `prompts/textos.md` |
| Claves y ajustes técnicos (permisos 600, no se muestran) | `.env` (modelo: `.env.example`) |
| Diseño del video | `plantilla-cajas/` (estilo "cajas") y `plantilla/` (estilo clásico) |
| n8n (Docker Compose) y el flujo | `n8n/docker-compose.yml` y `n8n/flujo.json` (lleva la clave del motor) |
| Planilla modelo | `planilla/videos-redes.xlsx` |
| Videos, estado interno y respaldos | `salida/`, `datos/`, `respaldos/` |

## Comandos

| Comando | Qué hace |
|---|---|
| `bash instalar.sh` | Instala dependencias, prepara Chrome, crea `.env` y `config/negocio.json` y deja el motor como servicio (`--prueba` muestra qué haría) |
| `npm run chequeo` | Revisa todo y dice qué falta (`-- --completo` también prueba Telegram y Gemini) |
| `npm run prueba` | Arma un video de prueba con `producto_prueba` de `negocio.json` (`-- --sin-telegram` para no mandarlo) |
| `npm run cargar-clave -- NOMBRE` | Carga una clave sin mostrarla. `--valor "…"` para lo que no es secreto, `--generar`, `--ver`, `--borrar`, `--lista` |
| `npm run n8n` | Arma `n8n/flujo.json` (`-- --importar` lo sube a n8n y lo activa) |
| `npm run ig-conectar` | Conecta Instagram por la página de Facebook (pide el token largo sin mostrarlo) |
| `npm run ig-probar` / `npm run redes-probar` | Prueban Instagram y Buffer **sin publicar** |
| `npm run respaldo` | Respaldo de la carpeta en `respaldos/` (permisos 600) |
| `npm run pruebas` | Pruebas del motor contra servidores falsos (`-- --render` también arma videos) |
| `npm run vista-previa` | Abre la plantilla del video en el navegador |

Servicio: `systemctl --user restart videos-redes` · registro: `journalctl --user -u videos-redes -f`.

## Reglas

- Las claves no se muestran, no se copian y no se suben. El `.env`, `n8n/flujo.json` y `respaldos/` las tienen.
- Las pruebas son siempre sin publicar. Publicar lo decide el dueño (aprobando en Telegram).
- Nunca `docker compose down -v`: borra el flujo, las credenciales y el historial de n8n.
- HyperFrames con la telemetría apagada (`HYPERFRAMES_NO_TELEMETRY=1`). No uses `publish`, `cloud`, `share` ni `feedback`, porque mandan datos afuera.
