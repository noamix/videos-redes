#!/usr/bin/env bash
# Saca la voz en off: la apaga en el .env y borra el programa y el modelo (sistema/voz/.venv, modelos y
# llama.cpp-omni). Las voces grabadas (sistema/voz/voces) quedan, salvo con --todo.
#   npm run voz-desinstalar                  → muestra qué borraría, sin tocar nada
#   npm run voz-desinstalar -- --si          → lo hace
#   npm run voz-desinstalar -- --si --todo   → también borra las voces grabadas
set -euo pipefail
VOZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SISTEMA="$(dirname "$VOZ")"
cd "$SISTEMA"
SI=0
TODO=0
for a in "$@"; do
  case "$a" in
    --si) SI=1 ;;
    --todo) TODO=1 ;;
    *) echo "❌ No entiendo «$a». Opciones: --si, --todo"; exit 2 ;;
  esac
done
BORRAR=("$VOZ/.venv" "$VOZ/modelos" "$VOZ/llama.cpp-omni" "$VOZ/config.json" "$VOZ/medicion.json" "$VOZ/compilacion.log")
[ "$TODO" = 1 ] && BORRAR+=("$VOZ/voces")
echo "La voz en off se apaga en el .env (VOZ_MODO=no, sin VOZ_COMANDO) y se borra:"
for b in "${BORRAR[@]}"; do
  if [ -e "$b" ]; then
    echo "   $b ($(du -sh "$b" 2>/dev/null | cut -f1))"
  fi
done
[ "$TODO" = 1 ] || echo "   (las voces grabadas en $VOZ/voces quedan; con --todo también se borran)"
if [ "$SI" != 1 ]; then
  echo "Para hacerlo: npm run voz-desinstalar -- --si"
  exit 0
fi
NODE="${npm_node_execpath:-$(command -v node || true)}"
if [ -n "$NODE" ]; then
  "$NODE" motor/cargar-clave.mjs VOZ_MODO --valor no >/dev/null
  "$NODE" motor/cargar-clave.mjs VOZ_COMANDO --borrar >/dev/null
fi
for b in "${BORRAR[@]}"; do
  rm -rf -- "$b"
done
echo "✅ Listo. Reiniciá el motor para que tome el cambio: systemctl --user restart videos-redes"
