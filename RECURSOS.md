# Qué hace falta: programas, servicios y cuentas

Todo con planes gratis. Lo único pago es Claude, y solo para armarlo.

## Programas en la PC (todos gratis)

- **Linux (Ubuntu)** o cualquier PC que esté prendida a la hora de publicar: ahí corre todo. Linux es el camino probado; Windows y Mac, sin probar.
- **Node.js 22:** corre el motor. https://nodejs.org
- **FFmpeg:** arma el MP4 y le pone el audio. https://ffmpeg.org
- **Google Chrome:** HyperFrames lo usa para dibujar cada cuadro del video, y sirve para configurar las cuentas.
- **Docker + Docker Compose:** corre n8n. https://www.docker.com
- **n8n**, versión comunitaria y autoalojada: es el "reloj" que planifica, genera y publica. https://n8n.io
- **HyperFrames:** convierte una página HTML con animaciones en un video MP4. Es de código abierto, de HeyGen. https://github.com/heygen-com/hyperframes
- **GSAP:** las animaciones de la plantilla. https://gsap.com
- **Fuente Inter** (Google Fonts): la letra de los videos. https://fonts.google.com
- **Servicio de usuario de systemd:** deja el motor siempre andando. Viene con Linux.

**Para la voz en off (opcional):**
- **VoxCPM2** (OpenBMB, Apache-2.0): el modelo que arma la voz, con tu voz, en tu compu. https://github.com/OpenBMB/VoxCPM · https://huggingface.co/openbmb/VoxCPM2
- **Voz liviana:** VoxCPM2 en GGUF (https://huggingface.co/DennisHuang648/VoxCPM2-GGUF) con **llama.cpp-omni** (MIT), que se compila en la compu. https://github.com/tc-mb/llama.cpp-omni. Para compilarlo: `cmake` y `build-essential` (Ubuntu).
- **Voz completa:** el paquete `voxcpm` con **PyTorch** (https://pytorch.org). Para compus con placa NVIDIA de 8 GB o mucha memoria.
- **Python 3.10 o más nuevo** con `python3-venv` (Ubuntu). `npm run voz-evaluar` dice qué falta.
- Disco: unos 4 GB la liviana, de 8 a 12 GB la completa.

El motor (`sistema/`) viene en el plugin. HyperFrames y GSAP se instalan solos con `bash instalar.sh` (versiones fijas), y n8n lo levanta su `docker-compose.yml`.

## Servicios en la red

- **Claude**, con Claude Code y la extensión Claude in Chrome: para armar todo (requiere plan pago de Claude). Después el sistema anda solo, sin Claude. https://claude.ai
- **Google Sheets:** la planilla de productos y el calendario. Gratis.
- **Google AI Studio** (API de Gemini): escribe los textos de cada video. Plan gratis, sin tarjeta. https://aistudio.google.com
- **Google Cloud Console:** la credencial OAuth para que n8n lea la planilla. Gratis. https://console.cloud.google.com
- **Telegram y @BotFather:** el bot para aprobar o rehacer cada video y los avisos. Gratis.
- **Meta for Developers:** la app para publicar en Instagram. Gratis. https://developers.facebook.com
  - Explorador de la API Graph: https://developers.facebook.com/tools/explorer
  - Depurador de identificadores de acceso: https://developers.facebook.com/tools/debug/accesstoken
- **Instagram profesional**, vinculado a una página de Facebook. Gratis.
- **Buffer, plan Free:** publica en TikTok y YouTube Shorts. Gratis. https://buffer.com
  - La clave se crea en https://publish.buffer.com/settings/api
  - Documentación de la API: https://developers.buffer.com
- **TikTok** (la cuenta) y **YouTube** (el canal; con YouTube Studio se suben a mano los videos largos). Gratis.
- **WordPress** (opcional): solo de respaldo, si Buffer no puede bajar el video. Gratis si ya tenés web.

## Cuentas que conviene tener listas

- **Google:** la planilla, Gemini y la cuenta **dueña** del canal de YouTube. Ojo: si en tu canal ves "Suscrito/a" en vez de "Personalizar canal", esa cuenta no es la dueña.
- **Facebook personal** con rol en la página del negocio, y el **Instagram profesional** vinculado a esa página.
- **TikTok.**
- **Telegram.**
- **Buffer** (se crea gratis durante el armado).

## Costo y tiempo

- **Costo mensual del sistema:** $0, todo con planes gratis. Lo único pago es Claude, para armarlo.
- **Tiempo de armado:** nosotros lo hicimos en dos jornadas, de a pasos. Se puede cortar en cualquier paso y seguir otro día.
- **Voz en off (opcional):** también gratis. Sumarla lleva una o dos horas (instalar, grabar tu voz y medir), según la compu.
- **Uso diario:** aprobar cada video en Telegram (segundos). A la hora elegida sale solo en Instagram, TikTok y YouTube Shorts, y llegan los links por Telegram.

## Lo que se descartó, y por qué

- **La API de Claude:** es paga.
- **Las API propias de TikTok y de YouTube:** sin auditoría publican en privado, y la auditoría no aprueba herramientas internas.
- **Programas pagos.**
- **Que Claude programe los posteos a mano desde el navegador:** depende de Claude, y la subida de archivos de la extensión tiene un tope de 3,8 MB.
- **WordPress para Instagram:** no hace falta, porque el video se sube directo a Meta. Queda solo de respaldo para Buffer.
- **Voces de pago o en la nube para la voz en off:** cuestan plata y mandan tu voz afuera. VoxCPM2 corre en tu compu, gratis.
- **VoxCPM 0.5B y 1.5 (más chicos):** hablan solo chino e inglés. La liviana usa el mismo VoxCPM2, comprimido.
- **Voces de otras personas "sin copyright":** la licencia de una grabación no da permiso para clonar la voz de nadie. Solo tu voz o la de alguien que te autorizó.
