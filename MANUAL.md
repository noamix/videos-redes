# Manual de uso: videos diarios para redes

## Qué hace solo, todos los días

1. Elige un producto de tu planilla, rotando por líneas de producto.
2. Arma un video vertical de 15 segundos con las fotos de tu web, los textos y los colores de tu marca.
3. Te lo manda a Telegram con dos botones: **Aprobar** y **Rehacer**.
4. A la hora que elegiste lo publica en Instagram y, por Buffer, en TikTok y YouTube Shorts.
5. Te manda los links por Telegram, o un aviso si algo falló.

## Lo que hacés vos

- **Aprobar o rehacer el video en Telegram.** Lleva segundos. Rehacer arma otro al toque, con otros textos.
- Si lo aprobás después de la hora, sale en la próxima vuelta: cada 15 minutos, hasta las 23.
- Si no lo aprobás, ese día no se publica nada.
- **Dejar la PC prendida** a la hora de publicar. Si se apagó, al prenderla todo arranca solo; si todavía no son las 23, el video aprobado del día sale en la próxima vuelta. Si ya pasó el día, queda `aprobado`: cambiá la fecha de esa fila a hoy y sale en la próxima vuelta.

## La planilla

**Productos:** para sumar uno, agregá una fila con el nombre, el link de su página en tu web y su línea.
- `activo`: SI entra en la rotación; NO lo saca.
- `mostrar_precio`: SI muestra el precio en el video. Si no, el video no habla de precios.

**Calendario:** una fila por día, con su estado.

| Estado | Qué quiere decir |
|---|---|
| `pendiente` | Está planificado; el video todavía no se armó. |
| `esperando_ok` | Te llegó a Telegram y espera que lo apruebes. |
| `aprobado` | Sale a la hora elegida. |
| `rehacer` | Se está armando otro. |
| `publicado` | Salió. Los links están en la fila. |
| `publicar_a_mano` | No se pudo publicar solo. El video está en la carpeta `salida` y el texto en la fila: subilo vos desde el celular. |
| `error_ig` | Falló Instagram. Mirá el aviso de Telegram. |
| `error` | Falló el armado del video. El detalle está en la columna `nota`; cuando esté resuelto, poné `pendiente`. |
| `pausado` | Ese día no hay video (lo ponés vos). |

No cambies los nombres de las hojas ni de las columnas: el sistema los usa.

**Otro producto un día:** cambiá `producto_id` y `producto`, borrá los textos y poné `pendiente`. **Tus propios textos:** editalos en la fila y poné `pendiente`: el video sale con tus textos tal cual.

## Los avisos de Telegram

| Aviso | Qué hacer |
|---|---|
| Instagram desconectado (token vencido o revocado, error 190) | Pasa si cambiás la contraseña de Facebook o sacás permisos. Abrí Claude Code en la PC y decile "se desconectó Instagram, reconectalo". Vos autorizás. |
| Un canal de Buffer desconectado | Decile a Claude "reconectá TikTok en Buffer" (o YouTube). |
| Salió en Instagram pero falló TikTok o YouTube | Decile a Claude "falló TikTok", o escribí `/videos-redes:chequeo`. |
| La revisión de los lunes encontró un problema | Escribí `/videos-redes:chequeo`. |
| No te llegó el video del día | Fijate si la PC estuvo prendida. Si lo estuvo, `/videos-redes:chequeo`. |

## Cambios que le podés pedir a Claude

Con tus palabras, en Claude Code en la PC del sistema:

- "Cambiá la hora a las 20."
- "Pausá los videos hasta el lunes." / "Volvé a activar los videos."
- "Pasá al estilo clásico." / "Sumá el logo en el cierre."
- "Que los textos nunca digan de dónde somos."
- "Cambiá los colores del video a…" (si tenés un video de ejemplo, pasáselo).
- "Sacá el WhatsApp del cierre." / "Cambiá el WhatsApp a…"
- "Dejá de publicar en TikTok."

Antes de cambiar algo hace un respaldo, después prueba sin publicar y te avisa.

## Si necesitás que salga antes de la hora

Claude no publica por su cuenta: lo que sale, sale porque lo aprobaste vos. Si un día necesitás publicar antes, tenés dos caminos:

- Subir vos el video desde la carpeta `salida` (el texto está en la planilla).
- Pedirle a Claude que cambie la hora de publicación (y que después la vuelva a poner).

## Las claves

Las claves (Telegram, Gemini, Instagram, Buffer) están en un archivo de la PC que solo vos y el sistema pueden leer. Si tenés que cargar o cambiar una, Claude te va a pedir que corras en una terminal `npm run cargar-clave -- NOMBRE` y la pegues ahí. Mientras la pegás no se ve: es normal. **No la pegues nunca en el chat.**

## Comandos del plugin

| Comando | Para qué |
|---|---|
| `/videos-redes:armar` | Armar el sistema, o seguir el armado donde quedó |
| `/videos-redes:chequeo` | Revisar que todo ande, sin publicar, y arreglar lo que falle |
| `/videos-redes:ayuda` | Este manual, los avisos y los cambios |

También podés pedir todo con tus palabras.

## Lo que no hace

- **Videos largos de YouTube:** se suben y se programan a mano en YouTube Studio, que es gratis.
- **Música de TikTok:** las publicaciones automáticas no pueden usarla.
- **Publicar sin tu aprobación.**

## Costos

$0 por mes con los planes gratis. Claude (pago) se usa solo para armarlo y para arreglos o cambios.
