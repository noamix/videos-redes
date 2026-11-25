# Cambios

## 0.3.0 (2026-11-25)

Voz en off con la voz del dueño, armada en su compu con VoxCPM2 (opcional), y lo que se aprendió al sumarla al sistema original (v1.6.1):

- **¿La banca?** `npm run voz-evaluar` revisa memoria, procesador (y AVX2), placa NVIDIA, disco y herramientas **antes de instalar nada**, y recomienda un motor o dice que no alcanza. Después de instalar, `npm run voz-medir` hace la prueba de verdad (3 frases como las de un video, con tope de memoria) y deja en el `.env` la memoria, el tope, el tiempo y el horario para esa compu.
- **Dos motores con el mismo modelo** (`sistema/voz/`): **liviana**, VoxCPM2 en GGUF con `voxcpm2-cli` de llama.cpp-omni (versión fija, se compila en la compu, sin PyTorch), para compus desde 8 GB; y **completa**, VoxCPM2 con PyTorch, para placa NVIDIA o mucha memoria. `voz-instalar` no usa sudo: si falta algo, muestra el `apt install`. La descarga se reanuda si se corta, se revisa con el sha256 de Hugging Face y se controla el formato del GGUF.
- **Tu voz:** `npm run voz-preparar` arma la voz con una grabación de 15 s leyendo un texto fijo (sin transcribir nada). Pide confirmar que es tu voz o que tenés permiso. La grabación no sale de la compu (bloqueo nuevo).
- **En el video:** una frase por pantalla con los mismos datos (control de números, largo, voseo, palabras prohibidas y WhatsApp), escrita por la IA de los textos o, si falla, con los textos de las pantallas; números, precios y medidas en palabras y `voz/pronunciacion.txt`. Cada frase entra con su pantalla, la música baja mientras habla la voz y todo queda en -16 LUFS.
- **Memoria y horario:** la voz corre con tope (`systemd-run`); si falta memoria, el video espera la vuelta siguiente (o sale sin voz si es para hoy). Con `VOZ_HORARIO`, la voz se arma en esas horas (también puede cruzar la medianoche) y n8n corre en ese horario; de día solo salen los urgentes y Rehacer queda para el horario de la voz. Opcional, `VOZ_CERRAR_CHROME`: en el horario de la voz y con la compu sin usar, cierra el navegador (Chrome, Chromium, Brave o Edge) en forma ordenada, solo el proceso principal; `npm run chrome-probar` muestra qué cerraría.
- **Aviso de IA:** "Voz generada con IA" en el video y en el posteo, y la marca oficial de Instagram (`is_ai_generated`) y de TikTok y YouTube por Buffer (`isAiGenerated`); si una red la rechaza, publica sin ella y lo anota. `ig-probar -- --ia` y `redes-probar -- --ia` la prueban sin publicar.
- **Telegram:** de 23 a 7 los mensajes llegan sin sonido (`TELEGRAM_SILENCIO`), el mensaje del video muestra lo que dice la voz y, en redes sin IPv6, ya no falla la conexión (espera de 1 s por intento).
- **Otros:** el chequeo revisa la voz y avisa si la carpeta `musica/` está vacía; `prueba -- --sin-voz`; n8n le espera 30 min a cada video; el respaldo guarda las voces pero no el modelo.
- 90 pruebas del motor (30 nuevas, con la voz simulada, un `/proc` falso de navegador y el rechazo de la marca de IA) y 26 de la voz (`npm run pruebas-voz`: evaluador, descarga con cortes, formato GGUF, texto, contrato del comando y la liviana con un `voxcpm2-cli` falso). La liviana todavía no se probó con el modelo real.

## 0.2.0 (2026-11-23)

El plugin trae el motor ya programado (`sistema/`), sacado del sistema que anda desde noviembre de 2026 en una pyme argentina y generalizado para cualquier negocio:

- **Datos del negocio en `config/negocio.json`:** marca, web, qué vende y a quién, hora, zona horaria, estilo, colores, WhatsApp, logo, rotación, reglas y palabras prohibidas para los textos, producto de prueba y pausa. El motor lo relee solo, sin reiniciar.
- **Dos estilos:** "cajas" (con los colores de la marca, precio, WhatsApp y beneficios) y "clásico" (colores por línea o los de la marca).
- **Rotación** entre las líneas de la planilla sin configurar nada, y **pausa** que frena agendar, generar y publicar.
- **Páginas de producto de cualquier tienda:** además de WooCommerce, lee los datos estándar del producto (schema.org), como los de Tiendanube y Shopify.
- **Claves:** `npm run cargar-clave` (sin mostrarlas; `--valor`, `--generar`, `--ver`, `--borrar` y `--lista`), y `ig-conectar` pide el token sin mostrarlo.
- **n8n:** `docker-compose.yml` con red propia y subred fija; `npm run n8n -- --importar` sube y activa el flujo por la API (el archivo lleva la clave del motor y queda con permisos 600).
- **Instalador para Linux** (`instalar.sh`, con `--prueba`) y desinstalador; si no puede bajar el Chrome de HyperFrames, usa el de la PC.
- **Planilla modelo** (`planilla/videos-redes.xlsx`), `npm run respaldo` y 60 pruebas contra servidores falsos (`npm run pruebas`, `-- --render` arma videos reales).
- `/videos-redes:armar` instala el motor en vez de programarlo; `chequeo`, `ayuda`, el manual y `references/en-la-pc.md` siguen los nombres reales del motor.
- Bloqueos: también el flujo de n8n y las claves escritas en un comando. Se quitó `publicar-ahora`: publicar lo decide el dueño al aprobar.
- `AVISOS-DE-TERCEROS.md` e ícono.

## 0.1.0 (2026-11-23)

Primera versión como plugin, a partir de la skill `automatizacion-videos-redes` y del prompt de armado:

- `/videos-redes:armar`: el prompt de armado hecho comando. Pregunta los datos del negocio, sigue el plan de 8 pasos y retoma donde quedó (`AVANCE.md`).
- `/videos-redes:chequeo`: revisión completa y pruebas sin publicar, con los arreglos frecuentes.
- `/videos-redes:ayuda` y `MANUAL.md`: uso diario, estados, avisos y cambios.
- `RECURSOS.md`: programas, servicios, cuentas, costo, tiempo y lo descartado.
- Convenciones de la PC: carpeta `~/videos-redes`, comandos (`chequeo`, `prueba`, `ig-probar`, `redes-probar`, `respaldo`, `cargar-clave`, `ig-conectar`, `publicar-ahora`) y claves solo en el `.env`.
- Bloqueos automáticos: el `.env` y los respaldos, los volúmenes de n8n y publicar.
- Licencia AGPL-3.0-only, como el taller 3D.
