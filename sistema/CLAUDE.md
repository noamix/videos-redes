# Sistema de videos diarios: instrucciones para Claude Code

Esta carpeta la instala el plugin **videos-redes**. Si el plugin está instalado, usá sus comandos (`/videos-redes:armar`, `/videos-redes:chequeo`, `/videos-redes:ayuda`) y su skill `automatizacion-videos-redes`. Qué es cada cosa: `README.md`.

- El dueño no es programador: castellano rioplatense, pasos cortos y numerados, de a uno, y antes de tocar algo decile qué vas a hacer.
- **Claves:** nunca las pidas por el chat, no las muestres ni las copies. El dueño las carga en su terminal con `npm run cargar-clave -- NOMBRE`. Para ver qué hay: `npm run cargar-clave -- --lista`. No leas el `.env`, `n8n/flujo.json` ni `respaldos/`.
- **Datos del negocio:** `config/negocio.json` (se relee solo). Líneas: `config/lineas.json`. Frases sin IA: `config/textos-plantillas.json` (después, `npm run chequeo`).
- **Nada de publicar de prueba:** `npm run ig-probar` y `npm run redes-probar` prueban sin publicar. No ejecutes a mano la rama de publicar de n8n.
- **Antes de un cambio grande:** `npm run respaldo`. Después de tocar el `.env` o el código: `systemctl --user restart videos-redes` y `npm run chequeo`. Si cambian el puerto, la clave del motor, la planilla o la credencial: `npm run n8n` y reimportar el flujo.
- **Nunca** `docker compose down -v`. Lo que pide `sudo` lo corre el dueño.
- **Diseño del video:** `plantilla-cajas/index.html` o `plantilla/index.html` (HyperFrames + GSAP). Zona útil para textos y producto: y=168 a y=1330 px (abajo van los botones de las apps). Probá con `npm run prueba -- --sin-telegram` y mirá cuadros con ffmpeg.
- Después de cambiar el código: `npm run pruebas` (y `-- --render` si tocaste el video).
