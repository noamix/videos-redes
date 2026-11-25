#!/usr/bin/env bash
# Saca el servicio del motor. No borra nada más: la carpeta (con el .env y los videos) y los datos de n8n quedan.
#   bash desinstalar.sh
set -uo pipefail
systemctl --user disable --now videos-redes 2>/dev/null && echo "✅ Servicio videos-redes parado y desactivado" || echo "⚪ El servicio no estaba"
rm -f "$HOME/.config/systemd/user/videos-redes.service"
systemctl --user daemon-reload 2>/dev/null || true
echo
echo "Queda en tus manos:"
echo "  • n8n: cd n8n && docker compose stop   (NO uses down -v: borra el flujo, las credenciales y el historial)"
echo "  • La carpeta del sistema: borrala cuando quieras. Tiene el .env con las claves y los respaldos."
echo "  • Si instalaste la voz en off: su programa y su modelo (varios GB) están en voz/; tu grabación, en voz/voces."
echo "  • Revocá las claves que ya no uses: el bot (@BotFather → /revoke), Gemini (AI Studio), Buffer y la app de Meta."
