# videos-redes

Plugin para Claude que arma y mantiene un sistema **gratis** de videos diarios para las redes de un negocio: cada día hace un video corto de un producto con las fotos de tu web, te lo manda a Telegram para que lo apruebes y, a la hora que elegiste, lo publica solo en Instagram, TikTok y YouTube Shorts.

**Las pruebas son siempre sin publicar, las claves no pasan por el chat y Claude no publica por su cuenta:** lo que sale, sale porque lo aprobaste vos.

## Qué hace

1. **Elige el producto:** cada día toma uno del catálogo (una planilla de Google) y rota por líneas de producto.
2. **Arma el video:** vertical de 15 s, en 3 pantallas de 5 s, con fotos del producto, textos y el estilo de tu marca.
3. **Pide aprobación** por Telegram, con los botones **Aprobar / Rehacer**.
4. **Publica** a la hora elegida en Instagram y, por Buffer, en TikTok y YouTube Shorts.
5. **Avisa:** te manda los links por Telegram, o un aviso si algo falló.

Usa HyperFrames (HTML + GSAP a MP4) en tu PC, Gemini gratis para los textos (con plantillas sin IA de respaldo), n8n en Docker como reloj, Instagram por Facebook Login for Business y Buffer gratis para TikTok y YouTube Shorts. **Costo mensual: $0.** Lo único pago es Claude, para armarlo.

## Comandos

En la app, los comandos llevan el nombre del plugin adelante: escribí `/videos-redes:armar`, no `/armar`. También podés pedir todo con tus palabras.

| Comando | Para qué |
|---|---|
| `/videos-redes:armar` | Armar el sistema paso a paso: pregunta los datos del negocio, revisa la PC, instala, programa, te muestra un video de prueba y conecta las redes. Si lo cortás, sigue donde quedó. |
| `/videos-redes:chequeo` | Revisar que todo ande sin publicar y arreglar lo que falle: token de Instagram vencido, canal de Buffer desconectado, el motor o n8n parados. |
| `/videos-redes:ayuda` | Uso diario, qué significa cada estado y cada aviso, y cambios: hora, estilo, WhatsApp, pausar. |

Además, la skill `automatizacion-videos-redes` responde cualquier duda sobre una pieza del sistema y sabe las trampas de Meta, Buffer, TikTok y YouTube.

## Instalación

1. **Sumá el plugin a Claude desde GitHub.** Usá solo esta dirección: una copia (fork) puede traer cambios que nadie revisó.
   - **En Claude Desktop** (https://claude.ai/download): en el menú de la app, no en el chat, andá a **Plugins › Agregar › Agregar marketplace › Agregar desde un repositorio** (en inglés: *Customize → Plugins → Add marketplace*), pegá `noamix/videos-redes` (o `https://github.com/noamix/videos-redes`), tocá **Sincronizar** e instalá **videos-redes**. Para recibir una versión nueva: **Plugins › Agregar › Administrar marketplaces**, menú **⋯** de **videos-redes** → **Buscar actualizaciones** (en inglés, *Check for updates*). Hacelo a mano: en un marketplace agregado desde la app, la sincronización automática no se dispara sola.
   - **En Claude Code:**
     ```
     /plugin marketplace add noamix/videos-redes
     /plugin install videos-redes@videos-redes
     ```
     Claude Code no actualiza solo los marketplaces que no son de Anthropic: activá **Enable auto-update** en `/plugin` → **Marketplaces**, o actualizalo a mano con `claude plugin marketplace update videos-redes` y `claude plugin update videos-redes@videos-redes`, y reiniciá Claude Code.
   - Si alguien te pasó el archivo `videos-redes.plugin`, también lo podés subir con **Plugins › Agregar › Subir plugin**, pero así no se actualiza: conviene sumarlo desde GitHub.
   - Si ya tenías la skill suelta `automatizacion-videos-redes`, sacala: el plugin ya la trae.
2. **Instalá en Chrome la extensión Claude in Chrome.** Con eso Claude hace solo los trámites en las páginas: Meta, Buffer, Telegram Web, n8n y Google.
3. **Abrí Claude Code en la PC que va a quedar prendida**, que es donde corre todo, y escribí `/videos-redes:armar`.
4. Vos solo vas a tener que iniciar sesión, aprobar autorizaciones, cargar las claves en una terminal y decir "sí" cuando te lo pida.

Lo que hace falta (programas, servicios y cuentas, con sus links) está en [RECURSOS.md](RECURSOS.md). El uso diario, en el [manual](MANUAL.md).

## Seguridad

- **Claves:** viven solo en un archivo `.env` de la PC, con permisos 600. Las cargás vos en una terminal con `npm run cargar-clave -- NOMBRE`, que no las muestra. Claude no las pide, no las ve y no las escribe en informes.
- **Pruebas sin publicar:** contenedores de Meta que no se publican y borradores de Buffer que se borran.
- **Bloqueos automáticos** (`hooks/guardia.py`, en Claude Code y en la app de Claude): antes de cada comando o archivo, frenan mostrar, traer o pisar el `.env` del sistema y sus respaldos, borrar los volúmenes de Docker donde n8n guarda el flujo y las credenciales, y que Claude corra los comandos que publican. Necesitan Python 3 (viene con Linux y Mac). Solo miran el comando o el archivo de ese momento, y no mandan nada a ningún lado.
- **Respaldo** antes de cada cambio grande, en la misma PC.

## Componentes

- `skills/automatizacion-videos-redes/`: el conocimiento (qué hace, reglas, arquitectura, Instagram por Facebook Login for Business, Buffer para TikTok y YouTube Shorts, seguridad y lo aprendido sobre contenido) y `references/en-la-pc.md` (carpeta, comandos y claves).
- `skills/armar`, `chequeo` y `ayuda`: los flujos de trabajo.
- `MANUAL.md`: el manual de uso diario.
- `RECURSOS.md`: programas, servicios, cuentas, costo y tiempo.
- `hooks/`: los bloqueos automáticos y sus pruebas (`python3 hooks/pruebas_guardia.py`).

## Probado con

Ubuntu, n8n autoalojado en Docker, HyperFrames, Gemini gratis, Meta (Facebook Login for Business) y Buffer Free, en noviembre de 2026, con una pyme argentina. Windows y Mac: sin probar.

## Versión

0.1.0. Cambios en [CHANGELOG.md](CHANGELOG.md).

## Licencia

GNU Affero General Public License, versión 3 ([LICENSE](LICENSE)): podés usarlo, cambiarlo y compartirlo; si distribuís una versión cambiada, tiene que ir con la misma licencia y con su código.
