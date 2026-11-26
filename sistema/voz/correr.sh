#!/usr/bin/env bash
# Corre un programa de la voz con su Python (voz/.venv), que arma npm run voz-instalar.
#   bash voz/correr.sh voz_videos.py --estado --legible
set -euo pipefail
VOZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$VOZ/.venv/bin/python"
if [ ! -x "$PY" ]; then
  echo "❌ La voz en off no está instalada todavía."
  echo "   1. Mirá si tu compu la banca: npm run voz-evaluar"
  echo "   2. Instalala: npm run voz-instalar"
  exit 2
fi
programa="$1"
shift
exec "$PY" "$VOZ/$programa" "$@"
