---
name: chequeo
description: Revisa que el sistema de videos diarios ande de punta a punta sin publicar nada (motor, n8n, planilla, Telegram, Gemini, Instagram, Buffer con TikTok y YouTube, y la voz en off si está), encuentra lo que falla y lo arregla o dice qué tiene que hacer el dueño. Se usa cuando el usuario dice "chequeo", "revisá que ande", "¿está andando?", "no salió el video", "no me llegó el video para aprobar", "me llegó un aviso de error", "se desconectó Instagram", "falló TikTok" o al terminar el armado.
---

# /chequeo: revisión completa, sin publicar

Cargar antes la skill `automatizacion-videos-redes` y su `references/en-la-pc.md`. Todo es sin publicar: contenedores de Meta sin publicar y borradores de Buffer que se borran. No ejecutar a mano la rama de publicar de n8n.

Hace falta terminal en la PC del sistema. Si no hay, decirlo y pedirle al dueño que abra Claude Code en esa PC y escriba `/videos-redes:chequeo`.

## 1. Estado general

- Leer `~/videos-redes/AVANCE.md` y `config/negocio.json`. Si no existen, ofrecer `/videos-redes:armar`.
- `cd ~/videos-redes && npm run chequeo -- --completo`. Revisa el negocio (y si está en pausa), Node, FFmpeg, GSAP, HyperFrames y Chrome, letras, el motor, el estilo, las frases sin IA, Gemini, Telegram (manda un mensaje de prueba), n8n, Instagram (cuenta y cupo), WordPress, Buffer (canales), la música y la voz en off (si está: el comando, la voz, la memoria, el tope y las frases sin IA). Cada ❌ trae su arreglo al lado.
  - Si el sistema se armó antes del plugin y el comando no existe o es otro, revisar a mano lo mismo.
- Motor: `systemctl --user status videos-redes` y `journalctl --user -u videos-redes -n 50 --no-pager`.
- n8n: `cd ~/videos-redes/n8n && docker compose ps`, el flujo activo y las últimas ejecuciones sin error (pantalla de n8n, Executions).
- Planilla: la fila de hoy y su estado, y filas trabadas en `error`, `error_ig`, `rehacer` o `publicar_a_mano` (el detalle está en `nota`).
- La PC: que no se suspenda sola y que haya disco libre.

## 2. Pruebas sin publicar

1. `npm run prueba`: video al Telegram del dueño, marcado PRUEBA.
2. `npm run ig-probar`: sube a Meta y espera FINISHED, sin `media_publish`.
3. `npm run redes-probar`: un borrador por red con el último video de Instagram, que se borra. Después revisar en Buffer que Queue y Drafts estén en 0.
4. Si hay voz en off: `npm run voz-estado` y, si el dueño quiere escucharla, `npm run voz-probar`.
5. Si se tocó el código: `npm run pruebas` (y `-- --render` si se tocó el video); si se tocó `voz/`, `npm run pruebas-voz`.

## 3. Resultado

Una línea con lo más importante y una tabla corta: pieza, estado (anda, falla o falta) y qué hacer.

## 4. Arreglos frecuentes

Antes de tocar código o configuración: `npm run respaldo`. Las reconexiones las autoriza siempre el dueño.

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Instagram: error 190 ("se venció o se revocó") | Cambió la contraseña de Facebook, sacó permisos o perdió acceso a la página | Reconectar como dice la skill: Explorador → Generate Access Token → Ampliar, y el dueño corre `npm run ig-conectar` en su terminal |
| Buffer: el canal no aparece o "needs to be refreshed" | Faltó Finish Connection o el canal se desconectó | Reconectarlo en Buffer (el dueño autoriza) y tocar Finish Connection |
| YouTube publica en otro canal | Se conectó el canal personal | Con el OK del dueño, desconectarlo y conectar el bueno con la cuenta dueña, revisando "Confirm your Account"; `BUFFER_YOUTUBE` con el nombre correcto |
| No llega el video para aprobar | Motor o n8n parados, flujo inactivo, `pausado` en true, ningún producto activo o la PC suspendida | `systemctl --user restart videos-redes`, `docker compose up -d` (nunca `down -v`), activar el flujo, revisar `negocio.json` y la planilla |
| Telegram no responde a los botones | Motor parado o token del bot cambiado | Reiniciar el servicio; si cambió el token, el dueño lo carga con `cargar-clave`. Las respuestas que no llegaron a n8n se reintentan solas cada minuto |
| Textos repetidos o sin IA | Gemini sin cupo, clave inválida o modelo dado de baja (salen las plantillas) | `npm run chequeo -- --completo` dice el modelo que anda: cargarlo con `--valor` en `GEMINI_MODELO`. No es urgente |
| n8n no lee la planilla | Venció la credencial de Google (app en modo de prueba: 7 días) | Reconectar la credencial y pasar la app a producción |
| n8n no llega al motor | Subred cambiada, motor escuchando en otra IP o firewall | `MOTOR_HOST`, `MOTOR_URL_PARA_N8N` y la subred del compose tienen que coincidir; regla de ufw del compose; `npm run n8n -- --importar` si cambió algo |
| Salió en Instagram pero no en TikTok o YouTube | Buffer no pudo bajar el video o la red lo rechazó | Leer el error del aviso; `npm run redes-probar`; el video está en `salida/` para subirlo a mano |
| `publicar_a_mano` o `error_ig` | Falló la publicación automática | El detalle está en `nota`. Para reintentar, poner `aprobado` (si es de hoy); si no, el video está en `salida/` para subirlo a mano |
| La PC estaba apagada a la hora | Ese día no se publicó y quedó `aprobado` | Si todavía es hoy, sale solo en la próxima vuelta; si no, cambiar la fecha de la fila a hoy |
| Nota "Espera la voz" | Faltó memoria cuando tocaba armar la voz | Es normal: se reintenta en la vuelta siguiente del horario de la voz. Si pasa siempre: cerrar programas a esa hora, `VOZ_CERRAR_CHROME` (con el OK del dueño) o `npm run voz-medir` |
| El video salió sin voz | La nota dice el motivo: memoria (y era para hoy), una frase que no entra en su pantalla, o el comando falló | `npm run voz-estado`; si una frase no entra, revisar los textos de esa fila y rehacer. Si el comando tarda demasiado, `npm run voz-medir` |
| La voz pronuncia mal una palabra | El modelo no la conoce | Agregarla en `voz/pronunciacion.txt` (`palabra = cómo se dice`) y probar con `npm run voz-probar -- "frase"` |

Al terminar, anotar en `AVANCE.md` el chequeo: fecha, qué falló, qué se arregló y qué queda pendiente.
