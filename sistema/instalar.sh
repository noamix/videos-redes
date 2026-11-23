#!/usr/bin/env bash
# Instala el sistema de videos en esta carpeta (Linux; probado en Ubuntu). Se puede correr más de una vez:
# saltea lo que ya está y no pisa el .env ni config/negocio.json.
#   bash instalar.sh            → instala
#   bash instalar.sh --prueba   → muestra qué haría, sin cambiar nada
# Lo que necesita sudo (Node, FFmpeg, Docker, letras, loginctl) no lo hace: lo avisa para que lo corra el dueño.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"
PRUEBA=0
[[ "${1:-}" == "--prueba" ]] && PRUEBA=1
hacer() { if [[ $PRUEBA == 1 ]]; then echo "  (prueba) $*"; else "$@"; fi; }
ok() { echo "✅ $*"; }
ojo() { echo "⚠️  $*"; }
export HYPERFRAMES_NO_TELEMETRY=1

echo "Sistema de videos: instalación en $DIR"
[[ $PRUEBA == 1 ]] && echo "(modo prueba: no cambia nada)"

# ---------- Requisitos ----------
NODE="${NODE:-$(command -v node || true)}"
if [[ -z "$NODE" ]]; then
  echo "❌ Falta Node.js 22 o más nuevo (https://nodejs.org). Instalalo y volvé a correr este instalador."
  exit 1
fi
MAYOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if (( MAYOR < 22 )); then
  echo "❌ Node.js $("$NODE" -v) es viejo: hace falta 22 o más nuevo (o indicá otro con NODE=/ruta/a/node bash instalar.sh)."
  exit 1
fi
NPM="$(dirname "$NODE")/npm"
[[ -x "$NPM" ]] || NPM="$(command -v npm)"
ok "Node.js $("$NODE" -v)"
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && ok "FFmpeg" || ojo "Falta FFmpeg: sudo apt install -y ffmpeg"
command -v docker >/dev/null && ok "Docker" || ojo "Falta Docker (para n8n): https://docs.docker.com/engine/install/ubuntu/"
if command -v fc-list >/dev/null; then
  # Sin -q: con pipefail, grep -q corta la salida de fc-list y da un falso "falta".
  if fc-list : family 2>/dev/null | grep -i "inter" >/dev/null; then ok "Letra Inter"; else ojo "Falta la letra Inter: sudo apt install -y fonts-inter"; fi
fi

# ---------- Dependencias (HyperFrames y GSAP) ----------
if [[ -f package-lock.json ]]; then
  hacer "$NPM" ci --no-audit --no-fund
else
  hacer "$NPM" install --no-audit --no-fund
fi
for p in plantilla plantilla-cajas; do
  hacer mkdir -p "$p/assets/vendor"
  hacer cp -f node_modules/gsap/dist/gsap.min.js "$p/assets/vendor/gsap.min.js"
done
ok "Dependencias instaladas"

# ---------- Configuración (no pisa lo que ya existe) ----------
if [[ ! -f .env ]]; then hacer cp .env.example .env; fi
hacer chmod 600 .env
if [[ ! -f config/negocio.json ]]; then hacer cp config/negocio.example.json config/negocio.json; fi
hacer mkdir -p salida datos trabajos fotos musica respaldos
hacer chmod 700 datos respaldos
ok "Carpetas y configuración (.env con permisos 600)"

# ---------- Chrome para que HyperFrames dibuje los cuadros ----------
# Primero, el Chrome rápido de HyperFrames (lo baja la primera vez). Si no se puede, el Google Chrome de la PC.
# (hyperframes doctor puede decir "Chrome OK" por el de la PC y aun así el render intentar bajar el suyo.)
if [[ $PRUEBA == 0 ]]; then
  if "$NODE" node_modules/hyperframes/bin/hyperframes.mjs browser ensure; then
    ok "Chrome para el render (el de HyperFrames)"
  else
    CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)"
    if [[ -n "$CHROME" ]]; then
      "$NODE" motor/cargar-clave.mjs HYPERFRAMES_BROWSER_PATH --valor "$CHROME" >/dev/null
      ok "HyperFrames va a usar el Chrome de la PC ($CHROME)"
    else
      ojo "No pude preparar Chrome: instalá Google Chrome o probá después npx hyperframes browser ensure"
    fi
  fi
fi

# ---------- Servicio de usuario (el motor siempre andando) ----------
UNIDAD="$HOME/.config/systemd/user/videos-redes.service"
TEMPORAL="$(mktemp)"
cat > "$TEMPORAL" <<EOF
[Unit]
Description=Motor de videos diarios para redes (videos-redes)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/motor/servidor.mjs
Restart=always
RestartSec=10
Environment=PATH=$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin
Environment=HYPERFRAMES_NO_TELEMETRY=1
Environment=HYPERFRAMES_SKIP_SKILLS=1

[Install]
WantedBy=default.target
EOF
hacer mkdir -p "$(dirname "$UNIDAD")"
hacer cp "$TEMPORAL" "$UNIDAD"
rm -f "$TEMPORAL"
hacer systemctl --user daemon-reload
hacer systemctl --user enable videos-redes
hacer systemctl --user restart videos-redes
ok "Servicio videos-redes (logs: journalctl --user -u videos-redes -f)"

echo
echo "Listo. Pendientes para el dueño:"
echo "  • Para que el motor arranque solo después de reiniciar, sin iniciar sesión: sudo loginctl enable-linger ${USER:-$(id -un)}"
echo "  • Completar config/negocio.json y cargar las claves con: npm run cargar-clave -- NOMBRE"
echo "  • Revisar todo: npm run chequeo"
