# Avisos de terceros

El plugin y su motor (`sistema/`) son de Leo y colaboradores, con licencia AGPL-3.0-only ([LICENSE](LICENSE)). El motor sale del sistema de videos diarios que Leo armó para su pyme, generalizado para cualquier negocio.

El plugin **no incluye** programas de terceros: se instalan en la PC de cada uno, desde sus fuentes oficiales, cuando se arma el sistema.

| Programa | Cómo llega | Licencia |
|---|---|---|
| HyperFrames (HeyGen) | `npm install` (versión fija en `sistema/package.json`) | Apache 2.0 |
| GSAP (GreenSock, de Webflow) | `npm install` (versión fija); `instalar.sh` lo copia a las plantillas | Licencia estándar sin cargo de GSAP (https://gsap.com/standard-license) |
| n8n (versión comunitaria) | Imagen de Docker oficial (versión fija en `sistema/n8n/docker-compose.yml`) | Sustainable Use License (https://docs.n8n.io/sustainable-use-license/) |
| Node.js, FFmpeg, Google Chrome, Docker | Los instala el dueño | Las de cada uno |
| Letras Inter y Archivo Black | Las instala el dueño (paquete del sistema o Google Fonts) | SIL Open Font License 1.1 |

Los servicios que usa el sistema (Google Sheets y AI Studio, Meta, Buffer, Telegram, TikTok y YouTube) tienen sus propios términos, que acepta el dueño con su cuenta. En el plan gratis de la API de Gemini, Google puede usar lo que se le manda (nombres y datos de productos) para mejorar sus servicios.

Las fotos y el logo de `sistema/plantilla*/assets/` son marcadores neutros hechos para el plugin: en cada video se reemplazan por las fotos del producto y el logo de la marca.
