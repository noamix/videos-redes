---
name: ayuda
description: Explica cómo se usa el sistema de videos diarios todos los días y qué hacer si algo falla, con el manual de uso (aprobar o rehacer en Telegram, la planilla y sus estados, los avisos y los comandos), y hace los cambios que pide el dueño (hora, estilo, WhatsApp, pausar o reanudar, dejar una red). Se usa cuando el usuario pregunta "cómo lo uso", "qué hago todos los días", "qué significa este estado", "qué hago con este aviso", "cómo cambio la hora", "pausá los videos", "manual" o "ayuda con los videos".
---

# /ayuda: uso diario, avisos y cambios

El manual está en `<raíz del plugin>/MANUAL.md` (la raíz es la carpeta que contiene `skills/`). Leerlo y responder lo que el usuario necesita, sin pegarlo entero. Si existe `~/videos-redes/COMO-USARLO.md`, tiene los datos de su negocio (hora, bot y planilla): usar esos.

- **"¿Cómo funciona?" o "¿qué hago todos los días?":** los 5 pasos de "Qué hace solo", en una línea cada uno, y lo que le toca a él: aprobar o rehacer en Telegram.
- **Un estado de la planilla o un aviso de Telegram:** qué significa y qué hacer, con las tablas del manual. Si es una falla, seguir la skill `chequeo`.
- **Un cambio:**
  1. Los productos los maneja él en la planilla (`activo` y `mostrar_precio`): explicarle cómo.
  2. La hora, el estilo, el WhatsApp y la pausa viven en `config/negocio.json`; las redes, en el `.env` (`references/en-la-pc.md` de la skill `automatizacion-videos-redes`). Hacer `npm run respaldo`, el cambio, reiniciar el servicio, probar sin publicar (`npm run prueba` si cambió el estilo) y anotarlo en `AVANCE.md`.
  3. Hace falta terminal en la PC del sistema. Si no hay, pedirle que abra Claude Code en esa PC y lo pida ahí.
- **Si quiere el manual a mano:** ofrecer mandarlo como archivo o dejarlo en la carpeta del sistema.

Al nombrar comandos, escribirlos con el prefijo del plugin (`/videos-redes:chequeo`) y recordar que también puede pedir todo con sus palabras. Responder breve y en el idioma del usuario. No prometer lo que el sistema no hace: videos largos (se suben a mano en YouTube Studio), música de TikTok en las publicaciones automáticas y publicar sin su aprobación.
