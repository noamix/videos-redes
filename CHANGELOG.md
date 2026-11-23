# Cambios

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
