#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 Leo y colaboradores de videos-redes
"""Pruebas de los bloqueos de videos-redes. Correr con: python3 hooks/pruebas_guardia.py"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

GUARDIA = Path(__file__).resolve().parent / "guardia.py"
RAIZ = "/home/usuario/videos-redes"
OTRO = "/home/usuario/otro-proyecto"

BLOQUEA, PASA = 2, 0

BASH = [
    # Claves
    ("cat ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("cd ~/videos-redes && cat .env", "/home/usuario", BLOQUEA),
    ("cat .env", RAIZ, BLOQUEA),
    ("grep TOKEN ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("grep -rn IG_TOKEN ~/videos-redes", "/home/usuario", BLOQUEA),
    ("grep -rn IG_TOKEN .", RAIZ, BLOQUEA),
    ("grep -rn IG_TOKEN", RAIZ, BLOQUEA),
    ("head -5 /home/usuario/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("source ~/videos-redes/.env && echo $IG_TOKEN", "/home/usuario", BLOQUEA),
    ("set -a; . ./.env; set +a; env", RAIZ, BLOQUEA),
    ('echo "X=1" > ~/videos-redes/.env', "/home/usuario", BLOQUEA),
    ("cp ~/videos-redes/.env.example ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("rm ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("echo X=1 | tee ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("less ~/videos-redes/.env.bak", "/home/usuario", BLOQUEA),
    ("awk '{print}' ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("sed -n '1,5p' ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("while read l; do echo $l; done < ~/videos-redes/.env", "/home/usuario", BLOQUEA),
    ("node -e \"console.log(require('fs').readFileSync('/home/usuario/videos-redes/.env','utf8'))\"", "/home/usuario", BLOQUEA),
    ("node --env-file=.env -e \"console.log(process.env.IG_TOKEN)\"", RAIZ, BLOQUEA),
    ("docker inspect videos-redes-n8n-1", "/home/usuario", BLOQUEA),
    ("docker compose config", RAIZ + "/n8n", BLOQUEA),
    ("docker compose exec n8n printenv", RAIZ + "/n8n", BLOQUEA),
    ("find ~/videos-redes -name '.env*' -exec cat {} +", "/home/usuario", BLOQUEA),
    ("zcat ~/videos-redes/respaldos/respaldo-20261123.tgz", "/home/usuario", BLOQUEA),
    ("tar xzf ~/videos-redes/respaldos/respaldo-20261123.tgz -O ./.env", "/home/usuario", BLOQUEA),
    ("type C:\\Users\\leo\\videos-redes\\.env", "C:\\Users\\leo", BLOQUEA),
    ("Get-Content C:\\Users\\leo\\videos-redes\\.env", "C:\\Users\\leo", BLOQUEA),
    ("sudo cat /home/usuario/videos-redes/.env", "/home/usuario", BLOQUEA),
    # El flujo de n8n (lleva la clave del motor)
    ("cat ~/videos-redes/n8n/flujo.json", "/home/usuario", BLOQUEA),
    ("cat n8n/flujo.json", RAIZ, BLOQUEA),
    ("jq . flujo.json", RAIZ + "/n8n", BLOQUEA),
    ("grep -n clave ~/videos-redes/n8n/flujo.json", "/home/usuario", BLOQUEA),
    ("python3 -c 'print(1)' < ~/videos-redes/n8n/flujo.json", "/home/usuario", BLOQUEA),
    # Claves escritas en un comando
    ("IG_TOKEN_USUARIO='EAAabc123456789' npm run ig-conectar", RAIZ, BLOQUEA),
    ('echo "GEMINI_API_KEY=AIzaSyAbc123def456" >> ~/videos-redes/.env', "/home/usuario", BLOQUEA),
    ("npm run cargar-clave -- GEMINI_API_KEY --valor AIzaSyAbc123", RAIZ, BLOQUEA),
    ("export BUFFER_API_KEY=abcdef123456 && npm run chequeo", RAIZ, BLOQUEA),
    # Volúmenes
    ("docker compose down -v", RAIZ + "/n8n", BLOQUEA),
    ("cd ~/videos-redes/n8n && docker compose down --volumes", "/home/usuario", BLOQUEA),
    ("docker compose -p videos-redes down -v --remove-orphans", "/home/usuario", BLOQUEA),
    ("docker volume rm videos-redes_n8n_datos", "/home/usuario", BLOQUEA),
    ("docker volume prune -f", OTRO, BLOQUEA),
    ("docker system prune -a --volumes", OTRO, BLOQUEA),
    # Publicar
    ("npm run publicar-ahora", RAIZ, BLOQUEA),
    ("cd ~/videos-redes && npm run publicar-ahora", "/home/usuario", BLOQUEA),
    ("curl -s -X POST -H \"x-clave: $K\" http://172.30.0.1:8099/publicar-pendientes", "/home/usuario", BLOQUEA),
    ("curl -X POST 'https://graph.facebook.com/v21.0/123/media_publish?creation_id=1'", "/home/usuario", BLOQUEA),
    ("node -e \"fetch('https://api.buffer.com',{method:'POST',body:'mutation{createPost(input:{mode:shareNow})}'})\"", "/home/usuario", BLOQUEA),
    ("echo '{\"query\":\"mutation { createPost(input:{mode: shareNow}) }\"}' | curl -d @- https://api.buffer.com", "/home/usuario", BLOQUEA),
    ("curl -d @- https://api.buffer.com <<'EOF'\n{\"query\":\"mutation { createPost(input:{mode: shareNow}) }\"}\nEOF", "/home/usuario", BLOQUEA),
    ("bash -c 'curl http://172.30.0.1:8099/publicar-pendientes'", "/home/usuario", BLOQUEA),
    # Lo que tiene que pasar
    ("ls -la ~/videos-redes", "/home/usuario", PASA),
    ("chmod 600 ~/videos-redes/.env", "/home/usuario", PASA),
    ("grep -c '^IG_TOKEN=.' ~/videos-redes/.env", "/home/usuario", PASA),
    ("grep -q TELEGRAM_TOKEN ~/videos-redes/.env && echo ok", "/home/usuario", PASA),
    ("grep -l TOKEN ~/videos-redes/.env", "/home/usuario", PASA),
    ("cut -d= -f1 ~/videos-redes/.env", "/home/usuario", PASA),
    ("awk -F= '{print $1}' ~/videos-redes/.env", "/home/usuario", PASA),
    ("cp -n ~/videos-redes/.env.example ~/videos-redes/.env && chmod 600 ~/videos-redes/.env", "/home/usuario", PASA),
    ("cp .env respaldos/.env.bak", RAIZ, PASA),
    ("cat ~/videos-redes/.env.example", "/home/usuario", PASA),
    ("echo 'GEMINI_MODELO=x' >> ~/videos-redes/.env", "/home/usuario", PASA),
    ("sed -i '/^VIEJA=/d' ~/videos-redes/.env", "/home/usuario", PASA),
    ("node --env-file=/home/usuario/videos-redes/.env motor/index.mjs", RAIZ, PASA),
    ("set -a; . ./.env; set +a; npm run chequeo", RAIZ, PASA),
    ("docker compose --env-file ../.env up -d", RAIZ + "/n8n", PASA),
    ("docker compose down", RAIZ + "/n8n", PASA),
    ("docker compose stop", RAIZ + "/n8n", PASA),
    ("docker compose ps", RAIZ + "/n8n", PASA),
    ("docker compose logs --tail 50 n8n", RAIZ + "/n8n", PASA),
    ("docker compose config --services", RAIZ + "/n8n", PASA),
    ("docker inspect --format '{{json .NetworkSettings.Networks}}' videos-redes-n8n-1", "/home/usuario", PASA),
    ("docker volume ls", "/home/usuario", PASA),
    ("cd ~/videos-redes && npm run chequeo", "/home/usuario", PASA),
    ("npm run ig-probar && npm run redes-probar && npm run prueba", RAIZ, PASA),
    ("npm run cargar-clave -- --lista", RAIZ, PASA),
    ("npm run cargar-clave -- MOTOR_CLAVE --generar", RAIZ, PASA),
    ("npm run cargar-clave -- BUFFER_YOUTUBE --valor 'Mi canal'", RAIZ, PASA),
    ("grep -rn media_publish ~/videos-redes/motor", "/home/usuario", PASA),
    ("grep -rn shareNow motor/ | head -20", RAIZ, PASA),
    ("grep -rn --exclude='.env*' IG_ ~/videos-redes", "/home/usuario", PASA),
    ("rg IG_TOKEN ~/videos-redes", "/home/usuario", PASA),
    ("node --check ~/videos-redes/motor/publicar-pendientes.mjs", "/home/usuario", PASA),
    ("tar czf respaldos/respaldo.tgz --exclude=node_modules --exclude=salida --exclude=respaldos .", RAIZ, PASA),
    ("tar tzf ~/videos-redes/respaldos/respaldo.tgz", "/home/usuario", PASA),
    ("journalctl --user -u videos-redes -n 50 --no-pager", "/home/usuario", PASA),
    ("systemctl --user restart videos-redes", "/home/usuario", PASA),
    ("cat ~/videos-redes/config/negocio.json", "/home/usuario", PASA),
    ("echo listo", RAIZ, PASA),
    ("cat ~/videos-redes/n8n/docker-compose.yml", "/home/usuario", PASA),
    ("ls -la ~/videos-redes/n8n", "/home/usuario", PASA),
    ("grep -c motor ~/videos-redes/n8n/flujo.json", "/home/usuario", PASA),
    ("npm run n8n -- --importar", RAIZ, PASA),
    ("npm run cargar-clave -- GEMINI_API_KEY", RAIZ, PASA),
    ("npm run cargar-clave -- N8N_API_KEY --borrar", RAIZ, PASA),
    ("npm run cargar-clave -- PLANILLA_ID --valor 1AbCdEfGh123", RAIZ, PASA),
    ("grep -c '^IG_TOKEN=.' .env", RAIZ, PASA),
    ("sed -i '/^IG_TOKEN_USUARIO=/d' .env", RAIZ, PASA),
    ("npm run pruebas", RAIZ, PASA),
    ("docker compose up -d", RAIZ + "/n8n", PASA),
    # Otros proyectos: no se meten
    ("cat .env", OTRO, PASA),
    ("docker compose down -v", OTRO, PASA),
    ("grep -rn TOKEN .", OTRO, PASA),
]

LEER = [
    ({"file_path": RAIZ + "/.env"}, "Read", "/home/usuario", BLOQUEA),
    ({"file_path": RAIZ + "/.env.bak"}, "Read", "/home/usuario", BLOQUEA),
    ({"file_path": RAIZ + "/respaldos/respaldo.tgz"}, "Read", "/home/usuario", BLOQUEA),
    ({"file_path": RAIZ + "/.env.example"}, "Read", "/home/usuario", PASA),
    ({"file_path": RAIZ + "/config/negocio.json"}, "Read", "/home/usuario", PASA),
    ({"file_path": OTRO + "/.env"}, "Read", "/home/usuario", PASA),
    ({"file_path": RAIZ + "/n8n/flujo.json"}, "Read", "/home/usuario", BLOQUEA),
    ({"file_path": RAIZ + "/n8n/docker-compose.yml"}, "Read", "/home/usuario", PASA),
    ({"pattern": "clave", "path": RAIZ + "/n8n/flujo.json", "output_mode": "content"}, "Grep", "/home/usuario", BLOQUEA),
    ({"pattern": "clave", "path": RAIZ + "/n8n/flujo.json"}, "Grep", "/home/usuario", PASA),
    ({"pattern": "TOKEN", "path": RAIZ, "output_mode": "content"}, "Grep", "/home/usuario", BLOQUEA),
    ({"pattern": "TOKEN", "path": RAIZ + "/.env", "output_mode": "content"}, "Grep", "/home/usuario", BLOQUEA),
    ({"pattern": "x", "output_mode": "content"}, "Grep", RAIZ, BLOQUEA),
    ({"pattern": "TOKEN", "path": RAIZ, "output_mode": "content", "glob": "**/*"}, "Grep", "/home/usuario", BLOQUEA),
    ({"pattern": "TOKEN", "path": RAIZ, "output_mode": "content", "glob": "*.mjs"}, "Grep", "/home/usuario", PASA),
    ({"pattern": "TOKEN", "path": RAIZ, "output_mode": "content", "type": "js"}, "Grep", "/home/usuario", PASA),
    ({"pattern": "TOKEN", "path": RAIZ + "/.env"}, "Grep", "/home/usuario", PASA),
    ({"pattern": "TOKEN", "path": RAIZ}, "Grep", "/home/usuario", PASA),
    ({"pattern": "TOKEN", "path": RAIZ + "/motor", "output_mode": "content"}, "Grep", "/home/usuario", PASA),
]

ESCRIBIR = [
    ({"file_path": RAIZ + "/.env", "content": "X=1"}, BLOQUEA),
    ({"file_path": RAIZ + "/.env", "old_string": "a", "new_string": "b"}, BLOQUEA),
    ({"file_path": RAIZ + "/.env.example", "content": "X="}, PASA),
    ({"file_path": RAIZ + "/config/negocio.json", "content": "{}"}, PASA),
    ({"file_path": OTRO + "/.env", "content": "X=1"}, PASA),
]

TRAER = [
    ({"paths": [RAIZ + "/.env"]}, BLOQUEA),
    ({"paths": ["~/videos-redes/respaldos/respaldo.tgz"]}, BLOQUEA),
    ({"paths": [RAIZ + "/AVANCE.md", RAIZ + "/config/negocio.json"]}, PASA),
    ({"paths": [OTRO + "/.env"]}, PASA),
    ({"paths": [RAIZ + "/n8n/flujo.json"]}, BLOQUEA),
    ({"paths": [RAIZ + "/n8n/docker-compose.yml"]}, PASA),
    ({"paths": [RAIZ + "/voz/voces/mi-voz/referencia.wav"]}, BLOQUEA),
    ({"paths": ["~/videos-redes/voz/voces"]}, BLOQUEA),
    ({"paths": [RAIZ + "/voz/medicion.json", RAIZ + "/voz/compilacion.log"]}, PASA),
]

LLEVAR = [
    ({"files": [{"devicePath": RAIZ + "/.env", "stagedPath": "/mnt/user-data/outputs/.env"}]}, BLOQUEA),
    ({"files": [{"devicePath": RAIZ + "/motor/index.mjs", "stagedPath": "/mnt/user-data/outputs/index.mjs"}]}, PASA),
    ({"files": [{"devicePath": RAIZ + "/.env.example", "stagedPath": "/mnt/user-data/outputs/.env.example"}]}, PASA),
]


def correr(modo: str, datos: dict) -> tuple[int, str]:
    r = subprocess.run(
        [sys.executable, "-I", str(GUARDIA), modo],
        input=json.dumps(datos), capture_output=True, text=True, timeout=20,
    )
    return r.returncode, r.stderr.strip()


def main() -> int:
    fallas = 0
    total = 0

    def ver(descripcion: str, esperado: int, obtenido: int, mensaje: str) -> None:
        nonlocal fallas, total
        total += 1
        if obtenido != esperado:
            fallas += 1
            que = "bloquear" if esperado == BLOQUEA else "dejar pasar"
            print(f"FALLA (tenía que {que}, salió {obtenido}): {descripcion}\n    {mensaje}")

    for comando, cwd, esperado in BASH:
        codigo, msg = correr("pre-bash", {"tool_name": "Bash", "tool_input": {"command": comando}, "cwd": cwd})
        ver(f"[{cwd}] {comando!r}", esperado, codigo, msg)
    codigo, msg = correr("pre-bash", {"tool_name": "mcp__remote-devices__device_bash",
                                      "tool_input": {"command": "cat ~/videos-redes/.env"}, "cwd": "/tmp"})
    ver("device_bash cat .env", BLOQUEA, codigo, msg)
    for entrada, herramienta, cwd, esperado in LEER:
        codigo, msg = correr("pre-read", {"tool_name": herramienta, "tool_input": entrada, "cwd": cwd})
        ver(f"{herramienta} {entrada} [{cwd}]", esperado, codigo, msg)
    for entrada, esperado in ESCRIBIR:
        codigo, msg = correr("pre-write", {"tool_name": "Write", "tool_input": entrada, "cwd": "/home/usuario"})
        ver(f"Write {entrada['file_path']}", esperado, codigo, msg)
    for entrada, esperado in TRAER:
        codigo, msg = correr("pre-stage", {"tool_name": "mcp__remote-devices__device_stage_files", "tool_input": entrada})
        ver(f"stage {entrada}", esperado, codigo, msg)
    for entrada, esperado in LLEVAR:
        codigo, msg = correr("pre-commit", {"tool_name": "mcp__remote-devices__device_commit_files", "tool_input": entrada})
        ver(f"commit {entrada}", esperado, codigo, msg)
    # Entradas raras: nunca bloquean ni rompen.
    for modo, cuerpo in (("pre-bash", "no es json"), ("pre-bash", "[]"), ("modo-raro", "{}")):
        r = subprocess.run([sys.executable, "-I", str(GUARDIA), modo], input=cuerpo, capture_output=True, text=True)
        ver(f"entrada rara {modo} {cuerpo!r}", PASA, r.returncode, r.stderr.strip())

    print(f"{total - fallas}/{total} pruebas bien")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
