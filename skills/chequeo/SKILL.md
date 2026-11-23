---
name: chequeo
description: Revisa que el sistema de videos diarios ande de punta a punta sin publicar nada (motor, n8n, planilla, Telegram, Gemini, Instagram y Buffer con TikTok y YouTube), encuentra lo que falla y lo arregla o dice qué tiene que hacer el dueño. Se usa cuando el usuario dice "chequeo", "revisá que ande", "¿está andando?", "no salió el video", "no me llegó el video para aprobar", "me llegó un aviso de error", "se desconectó Instagram", "falló TikTok" o al terminar el armado.
---

# /chequeo: revisión completa, sin publicar

Cargar antes la skill `automatizacion-videos-redes` y su `references/en-la-pc.md`. Todo es sin publicar: contenedores de Meta sin publicar y borradores de Buffer que se borran. No ejecutar a mano la rama de publicar de n8n.

Hace falta terminal en la PC del sistema. Si no hay, decirlo y pedirle al dueño que abra Claude Code en esa PC y escriba `/videos-redes:chequeo`.

## 1. Estado general

- Leer `~/videos-redes/AVANCE.md` y `config/negocio.json`. Si no existen, ofrecer `/videos-redes:armar`.
- `npm run chequeo`. Si el comando no existe (sistema armado antes del plugin), revisar a mano lo mismo: Node, FFmpeg, HyperFrames, Gemini, Telegram, n8n, Instagram (cuenta y cupo), Buffer (canales) y las plantillas de textos.
- Motor: el servicio activo y sus últimas líneas de registro (Linux: `systemctl --user status videos-redes` y `journalctl --user -u videos-redes -n 50 --no-pager`).
- n8n: el contenedor arriba (`docker compose ps` en `n8n/`), el flujo activo y las últimas ejecuciones sin error (pantalla de n8n, Executions).
- Planilla: la fila de hoy y su estado, y filas trabadas en `rehacer`, `error_ig` o `publicar_a_mano`.
- La PC: que no se suspenda sola y que haya disco libre.
- `pausado` en `config/negocio.json`: si está en true, no se genera ni se publica nada.

## 2. Pruebas sin publicar

1. `npm run prueba`: video al Telegram del dueño, marcado PRUEBA.
2. `npm run ig-probar`: contenedor hasta FINISHED, sin `media_publish`.
3. `npm run redes-probar`: un borrador por red, que se borra. Después revisar en Buffer que Queue y Drafts estén en 0 en cada canal.

## 3. Resultado

Una línea con lo más importante y una tabla corta: pieza, estado (anda, falla o falta) y qué hacer.

## 4. Arreglos frecuentes

Antes de tocar código o configuración: `npm run respaldo`. Las reconexiones las autoriza siempre el dueño.

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Instagram: error 190 | Token vencido o revocado (por ejemplo, cambió la contraseña de Facebook o sacó permisos) | Reconectar como dice la skill: Explorador → Generate Access Token → Ampliar, y el dueño corre `npm run ig-conectar` |
| Buffer: el canal no aparece | Faltó Finish Connection o el canal se desconectó | Reconectarlo en Buffer (el dueño autoriza) y tocar Finish Connection |
| YouTube publica en otro canal | Se conectó el canal personal | Con el OK del dueño, desconectarlo y conectar el bueno con la cuenta dueña, revisando "Confirm your Account" |
| No llega el video para aprobar | Motor o n8n parados, `pausado` en true, ningún producto activo o la PC suspendida | Lo que diga el chequeo: `systemctl --user restart videos-redes`, `docker compose up -d` (nunca `down -v`), revisar `negocio.json` y la planilla |
| Telegram no responde a los botones | Motor parado o token del bot cambiado | Reiniciar el servicio; si cambió el token, el dueño lo carga con `cargar-clave` |
| Textos repetidos o sin IA | Gemini sin cupo, clave inválida o modelo dado de baja (salen las plantillas) | Revisar la clave y el modelo en AI Studio; no es urgente |
| n8n no lee la planilla | Venció la credencial de Google (app en modo de prueba: 7 días) | Reconectar la credencial y pasar la app a producción |
| Salió en Instagram pero no en TikTok o YouTube | Buffer no pudo bajar el video o la red lo rechazó | Leer el error del aviso; reintentar con el `media_url`; de respaldo, WordPress |
| Estado `publicar_a_mano` | Falló la publicación automática | El video está en `salida/` y el texto en la planilla: lo sube el dueño a mano |

Al terminar, anotar en `AVANCE.md` el chequeo: fecha, qué falló, qué se arregló y qué queda pendiente.
