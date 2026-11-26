# Sistema de videos diarios (motor)

Arma solo un video vertical de 15 s por día (3 pantallas de 5 s) con un producto del catálogo, te lo manda a Telegram para aprobar y, a la hora elegida, lo publica en Instagram y, por Buffer, en TikTok y YouTube Shorts. Si la compu la banca, el video puede llevar **voz en off con tu propia voz** (VoxCPM2, en tu compu y gratis).

Esta carpeta es la que el plugin **videos-redes** copia a la PC (`~/videos-redes`). Se arma con `/videos-redes:armar`, se revisa con `/videos-redes:chequeo` y el uso diario está en `COMO-USARLO.md` (o `/videos-redes:ayuda`).

## El circuito

```
            PLANILLA (Google Sheets): Productos · Calendario (un día por fila) · Ayuda
                     ▲                         │
                     │ n8n lee y escribe        │
 n8n ── cada hora 8–21 ──► MOTOR: elige el producto del día (rota por líneas), lee su página en la web,
                           escribe los textos (Gemini o plantillas), arma la voz en off (opcional),
                           arma el video (HyperFrames) y lo manda a TELEGRAM con  ✅ Aprobar  🔁 Rehacer
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
| Instrucciones para Gemini | `prompts/textos.md` y, para las frases de la voz, `prompts/voz.md` |
| Voz en off (opcional): programa, modelo, voces y su configuración | `voz/` (ver "Voz en off") |
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
| `npm run pruebas` | Pruebas del motor contra servidores falsos (`-- --render` también arma videos) · `npm run pruebas-voz`: las de la voz |
| `npm run vista-previa` | Abre la plantilla del video en el navegador |
| `npm run voz-evaluar` | Dice si la compu banca la voz en off y cuál conviene, **antes de instalar nada** |
| `npm run voz-instalar` | Instala la voz (`-- --motor liviana` o `completa`); sin sudo: si falta algo, lo dice |
| `npm run voz-preparar -- archivo --es-mi-voz` | Arma tu voz con una grabación tuya leyendo `voz/texto-para-grabar.txt` |
| `npm run voz-medir` | Prueba de verdad: mide tiempo y memoria y deja los valores en el `.env` |
| `npm run voz-probar -- "frase"` / `npm run voz-estado` | Genera una frase para escucharla / estado de la voz |
| `npm run voz-desinstalar` | Saca la voz (`-- --si` para hacerlo) |
| `npm run chrome-probar` | Muestra qué navegador cerraría el motor para hacerle lugar a la voz, sin tocar nada |

Servicio: `systemctl --user restart videos-redes` · registro: `journalctl --user -u videos-redes -f`.

## Voz en off (opcional)

El video puede llevar una voz que dice lo mismo que cada pantalla, con tu voz, armada en tu compu con **VoxCPM2** (OpenBMB, Apache-2.0): sin pagar y sin mandar nada afuera. Los dos motores usan el mismo modelo:

| Motor | Qué es | Para qué compu |
|---|---|---|
| **liviana** | VoxCPM2 comprimido (GGUF, unos 3,6 GB) con [llama.cpp-omni](https://github.com/tc-mb/llama.cpp-omni), sin PyTorch. Se compila en la compu (hace falta `cmake` y `build-essential`) | Compus comunes, desde 8 GB de memoria |
| **completa** | VoxCPM2 original con PyTorch | Placa NVIDIA de 8 GB o más (rápida). En procesador usa unos 11 GB y tarda unos 20 s por cada segundo de voz |

1. **¿La banca?** `npm run voz-evaluar` mira memoria, procesador, placa de video y disco, y recomienda una (o dice que no alcanza). No instala nada.
2. **Instalar:** `npm run voz-instalar`. Si falta algo del sistema, muestra el `sudo apt install …` para que lo corras vos. Deja todo en `voz/` y carga `VOZ_COMANDO` en el `.env`.
3. **Tu voz:** grabá con el celular el texto de `voz/texto-para-grabar.txt` (unos 15 s) y cargalo con `npm run voz-preparar -- grabacion.m4a --es-mi-voz`. Solo tu voz o la de alguien que te dio permiso.
4. **Medir:** `npm run voz-medir` arma 3 frases como las de un video y dice si la banca de verdad (hasta 12 min por video), cuánto tarda y cuánta memoria usa, y ajusta `VOZ_MEMORIA_MIN_MB`, `VOZ_TOPE_MEMORIA`, `VOZ_TIMEOUT_MIN` y `VOZ_HORARIO`.
5. **Escuchar y activar:** `npm run voz-probar`, `systemctl --user restart videos-redes`, `npm run chequeo` y `npm run n8n` (para que n8n también corra en el horario de la voz).

Cómo la usa el motor:
- **Frases:** una por pantalla, con los mismos datos (los números tienen que estar en su pantalla). Las escribe la IA de los textos (`prompts/voz.md`) y pasan su control; si no, salen de los textos de las pantallas. Los números, precios y medidas se leen con palabras, y `voz/pronunciacion.txt` (modelo: `pronunciacion.ejemplo.txt`) corrige palabras puntuales.
- **Memoria:** antes de llamar a la voz mira la memoria libre. Si no alcanza y el video no es urgente, queda pendiente para la vuelta siguiente; si es para hoy, sale sin voz. La voz corre dentro de un tope (`systemd-run`): si se pasa, se corta solo la voz.
- **Horario** (`VOZ_HORARIO`, por ejemplo `1-6`): la voz se arma en esas horas y de día solo salen los urgentes. Con `VOZ_CERRAR_CHROME=si`, en ese horario y con la compu sin usar, el motor cierra el navegador en forma ordenada si hace falta memoria (`npm run chrome-probar` muestra qué cerraría).
- **Aviso de IA:** el video y el posteo dicen "Voz generada con IA" y se publica con la marca de IA de cada red. Instagram y TikTok piden declarar las voces realistas hechas con IA; YouTube no lo pide si es la propia voz clonada (la marca no baja el alcance). No lo saques sin pensarlo: si una red rechaza su marca, el texto es lo que queda.
- **Otro programa de voz:** sirve cualquier comando que cumpla el contrato de `voz/voz_videos.py` (`--estado` y `--pedido`, una línea JSON por la salida).

## Reglas

- Las claves no se muestran, no se copian y no se suben. El `.env`, `n8n/flujo.json` y `respaldos/` las tienen.
- Las pruebas son siempre sin publicar. Publicar lo decide el dueño (aprobando en Telegram).
- Nunca `docker compose down -v`: borra el flujo, las credenciales y el historial de n8n.
- La voz en off solo con la voz del dueño o de alguien que dio permiso, y siempre con el aviso de IA. La grabación (`voz/voces/`) no sale de la compu.
- HyperFrames con la telemetría apagada (`HYPERFRAMES_NO_TELEMETRY=1`). No uses `publish`, `cloud`, `share` ni `feedback`, porque mandan datos afuera.
