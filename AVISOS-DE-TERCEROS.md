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
| VoxCPM2 (OpenBMB): el modelo de la voz en off (opcional) | `npm run voz-instalar` lo baja de Hugging Face (`openbmb/VoxCPM2`, completa) | Apache 2.0 |
| VoxCPM2 en GGUF (BaseLM Q8_0 y Acoustic F16) | `npm run voz-instalar` lo baja de Hugging Face (`DennisHuang648/VoxCPM2-GGUF`, liviana); se revisa con el sha256 que publica Hugging Face | Las de VoxCPM2 (Apache 2.0) |
| llama.cpp-omni (tc-mb, sobre llama.cpp y ggml) | `npm run voz-instalar` baja el código de GitHub en una versión fija y compila `voxcpm2-cli` (liviana) | MIT |
| voxcpm (paquete de Python), PyTorch y sus dependencias | `pip`, en `sistema/voz/.venv` (completa) | Apache 2.0 (voxcpm), BSD (PyTorch) y las de cada uno |
| NumPy y num2words | `pip`, en `sistema/voz/.venv` | BSD 3 (NumPy), LGPL 2.1 (num2words) |

Los servicios que usa el sistema (Google Sheets y AI Studio, Meta, Buffer, Telegram, TikTok y YouTube) tienen sus propios términos, que acepta el dueño con su cuenta. En el plan gratis de la API de Gemini, Google puede usar lo que se le manda (nombres y datos de productos) para mejorar sus servicios.

`sistema/voz/texto_es.py` (números, medidas y precios en palabras para la voz) es del mismo autor que el plugin y va con su licencia. La voz clonada es de quien la grabó: el plugin pide confirmar que es la propia o que hay permiso, y marca los videos como hechos con IA.

Las fotos y el logo de `sistema/plantilla*/assets/` son marcadores neutros hechos para el plugin: en cada video se reemplazan por las fotos del producto y el logo de la marca.
