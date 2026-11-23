#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 Leo y colaboradores de videos-redes
"""Bloqueos automáticos de videos-redes (hooks de Claude Code y de la app de Claude).

Modos (primer argumento):
  pre-bash    Antes de un comando de terminal (Bash, PowerShell o device_bash).
  pre-read    Antes de Read o Grep.
  pre-write   Antes de Write, Edit, MultiEdit o NotebookEdit.
  pre-stage   Antes de traer archivos de la PC al espacio de Claude (device_stage_files).
  pre-commit  Antes de escribir archivos en la PC desde el espacio de Claude (device_commit_files).

Qué frena:
  1. Las claves del sistema (~/videos-redes/.env, sus copias y los respaldos): mostrarlas, traerlas,
     pisarlas o borrarlas. Solo actúa sobre la carpeta del sistema, no sobre otros proyectos.
  2. Los datos de n8n: `docker compose down -v` del sistema, borrar sus volúmenes y podar volúmenes.
  3. Publicar: Claude no corre los comandos que publican en las redes; eso lo hace el dueño.

Bloquea con código de salida 2 y el motivo en stderr. Es una red de seguridad, no un encierro: las reglas
de la skill siguen valiendo, y ante un error propio deja pasar.
"""
from __future__ import annotations

import fnmatch
import json
import re
import sys

SISTEMA = "videos-redes"

AVISO_CLAVES = (
    "videos-redes: el .env tiene las claves y no se muestra ni se trae. Para ver qué claves hay: "
    "`npm run cargar-clave -- --lista` (solo los nombres). Para cargar o cambiar una, el dueño corre "
    "`npm run cargar-clave -- NOMBRE` en su terminal; un valor que no es secreto: "
    "`npm run cargar-clave -- NOMBRE --valor \"...\"`."
)
AVISO_PISAR = (
    "videos-redes: eso pisaría o borraría el .env con las claves. Para crearlo si falta: "
    "`cp -n .env.example .env && chmod 600 .env`. Para cambiar un valor: `npm run cargar-clave`."
)
AVISO_GREP = (
    "videos-redes: buscar en toda la carpeta del sistema mostraría el .env. Buscá en motor/, config/, "
    "plantilla/ o n8n/, o agregá --exclude='.env*'."
)
AVISO_RESPALDOS = (
    "videos-redes: los respaldos tienen el .env con las claves: no se leen, no se traen y no se suben."
)
AVISO_DOCKER = (
    "videos-redes: eso muestra las variables de entorno del contenedor, con claves. Usá `docker compose ps`, "
    "`docker compose logs` o `docker inspect --format` con el dato que necesites "
    "(por ejemplo `{{json .NetworkSettings.Networks}}`)."
)
AVISO_VOLUMENES = (
    "videos-redes: eso borra volúmenes de Docker, y en el de n8n están el flujo, las credenciales y el "
    "historial. Para parar n8n alcanza `docker compose stop` o `docker compose down` (sin -v). Si de verdad "
    "hay que borrar volúmenes, que lo corra el dueño en su terminal, después de un respaldo."
)
AVISO_PUBLICAR = (
    "videos-redes: Claude no publica en las redes. Las pruebas son sin publicar (`npm run ig-probar`, "
    "`npm run redes-probar`). Si el dueño quiere publicar ya, lo corre él en su terminal: "
    "`npm run publicar-ahora`."
)

# --- Rutas -----------------------------------------------------------------------------------------

# Plantillas sin valores: se pueden leer y escribir.
PLANTILLAS = {".env.example", ".env.ejemplo", ".env.sample", ".env.plantilla", ".env.template", ".env.dist"}
# El .env y sus copias (.env.bak, .env.viejo) como palabra suelta o al final de una ruta.
RE_ENV = re.compile(r"(?:^|(?<=[\s\"'=:/\\<>(|;&,`]))(\.env(?:\.[\w-]+)*)(?=$|[\s\"';|&)<>`,])", re.I)


def nombre_base(ruta: str) -> str:
    return re.split(r"[\\/]", ruta.strip().strip("\"'"))[-1]


def es_env_secreto(ruta: str) -> bool:
    b = nombre_base(ruta).lower()
    return (b == ".env" or b.startswith(".env.")) and b not in PLANTILLAS


def es_env_exacto(ruta: str) -> bool:
    return nombre_base(ruta).lower() == ".env"


def envs_secretos(texto: str) -> list[str]:
    return [m.group(1) for m in RE_ENV.finditer(texto) if m.group(1).lower() not in PLANTILLAS]


def del_sistema(*textos: str) -> bool:
    return any(SISTEMA in (t or "").lower() for t in textos)


def es_respaldo(ruta: str) -> bool:
    return del_sistema(ruta) and bool(re.search(r"[\\/]respaldos([\\/]|$)", ruta))


def es_raiz(ruta: str) -> bool:
    return bool(re.search(SISTEMA + r"[\\/]?$", ruta.strip().strip("\"'"), re.I))


def _textos(valor) -> list[str]:
    if isinstance(valor, str):
        return [valor]
    if isinstance(valor, dict):
        return [t for v in valor.values() for t in _textos(v)]
    if isinstance(valor, (list, tuple)):
        return [t for v in valor for t in _textos(v)]
    return []


# --- Comandos ---------------------------------------------------------------------------------------

LECTORES = {
    "cat", "less", "more", "most", "head", "tail", "bat", "batcat", "tac", "nl", "strings", "xxd", "od",
    "hexdump", "hd", "view", "vi", "vim", "nvim", "nano", "emacs", "pico", "ed", "type", "get-content", "gc",
    "sed", "awk", "gawk", "mawk", "sort", "uniq", "diff", "sdiff", "paste", "column", "jq", "yq", "base64",
    "rev", "fold", "fmt", "pr", "cut", "grep", "egrep", "fgrep", "rg", "ag", "ack", "select-string", "sls",
    "findstr", "dd", "openssl", "gpg", "iconv", "expand", "unexpand", "tr", "zcat", "gzcat", "zless", "xargs",
}
BUSCADORES = {"grep", "egrep", "fgrep", "rg", "ag", "ack", "select-string", "sls", "findstr"}
COPIAN = {"cp", "mv", "install", "rsync", "copy", "move", "copy-item", "cpi", "move-item", "mi", "ren", "rename"}
BORRAN = {"rm", "shred", "truncate", "unlink", "del", "erase", "remove-item", "ri"}
PREFIJOS = {"sudo", "doas", "command", "builtin", "exec", "nohup", "time", "nice", "stdbuf", "timeout"}
CORREDORES = {
    "curl", "wget", "http", "https", "xh", "httpie", "node", "nodejs", "npm", "npx", "pnpm", "yarn", "bun",
    "deno", "python", "python3", "py", "bash", "sh", "zsh", "dash", "pwsh", "powershell", "invoke-webrequest",
    "invoke-restmethod", "iwr", "irm", "n8n",
}
RE_PUBLICA = re.compile(r"publicar-ahora|publicar-pendientes|media_publish|sharenow", re.I)
RE_RED = re.compile(r"\b(curl|wget|xh|httpie|invoke-webrequest|invoke-restmethod|iwr|irm)\b", re.I)

RE_SENTENCIAS = re.compile(r"\|\||&&|;|\n|(?<![>&|])&(?![>&])|\$\(|`")
RE_ETAPAS = re.compile(r"(?<!\|)\|(?!\|)")
RE_PALABRAS = re.compile(r"\"[^\"]*\"|'[^']*'|\S+")
RE_REDIR_PISA = re.compile(r"(?<![>])(?:\d|&)?>\|?(?![>&])\s*(\"[^\"]*\"|'[^']*'|[^\s;|&)]+)")
RE_REDIR_LEE = re.compile(r"(?<![<])<(?![<(])\s*(\"[^\"]*\"|'[^']*'|[^\s;|&)]+)")
RE_CARGA_ENV = re.compile(r"(?:^|[\s;&|(])(?:source|\.)\s+\S*\.env\b")
RE_MUESTRA_VARS = re.compile(
    r"\bprintenv\b|(?:^|[\s;&|(])(?:env|set|declare\s+-p|export\s+-p)\s*(?=$|[;&|)])"
    r"|\becho\b[^;&|\n]*\$|\bprintf\b[^;&|\n]*\$"
)
RE_CODIGO_EN_LINEA = re.compile(
    r"\b(?:node|nodejs|python3?|py|perl|ruby|php|deno|bun|pwsh|powershell)\b[^|;&\n]*\s"
    r"(?:-e|-c|-p|-E|-r|--eval|--print|-Command)(?=\s|$)",
    re.I,
)
RE_LEE_ARCHIVO = re.compile(
    r"readFileSync|readFile\b|createReadStream|open\s*\(|read_text|readlines|File\.read|file_get_contents"
    r"|Deno\.readTextFile|Bun\.file|Get-Content|dotenv",
    re.I,
)
RE_MUESTRA_ENTORNO = re.compile(r"process\.env|os\.environ|getenv|\$env:|ENV\[", re.I)


def palabras(texto: str) -> list[str]:
    return [p.strip("\"'") for p in RE_PALABRAS.findall(texto)]


def separar(comando: str) -> tuple[str, list[str]]:
    """Devuelve el nombre del programa (sin ruta, en minúsculas) y sus argumentos."""
    tokens = palabras(comando)
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", t):
            i += 1
            continue
        base = nombre_base(t).lower()
        if base in PREFIJOS:
            i += 1
            while i < len(tokens) and (tokens[i].startswith("-") or re.fullmatch(r"\d+[smhd]?", tokens[i])):
                i += 1
            continue
        if base == "env":
            j = i + 1
            while j < len(tokens) and (tokens[j].startswith("-") or re.match(r"^[A-Za-z_]\w*=", tokens[j])):
                j += 1
            if j < len(tokens):
                i = j
                continue
        return base, tokens[i + 1:]
    return "", []


def banderas_cortas(args: list[str]) -> str:
    return "".join(a[1:] for a in args if re.fullmatch(r"-[A-Za-z]+", a))


def busca_sin_mostrar(programa: str, args: list[str]) -> bool:
    """grep -c, -q o -l: dice si hay coincidencias sin mostrar las líneas."""
    largas = {"--count", "--quiet", "--silent", "--files-with-matches", "--files-without-match"}
    if any(a in largas for a in args):
        return True
    letras = "cql" if programa == "rg" else "cqlL"
    return any(ch in letras for ch in banderas_cortas(args))


def solo_nombres(programa: str, args: list[str]) -> bool:
    """cut -d= -f1 o awk '{print $1}': muestran los nombres de las claves, no los valores."""
    junto = " ".join(args)
    if programa == "cut":
        return bool(re.search(r"(?:^|\s)(?:-f\s*1|--fields=1)(?=\s|$)", junto))
    if programa in {"awk", "gawk", "mawk"}:
        prints = re.findall(r"print\w*[^;}]*", junto)
        return bool(prints) and all(re.fullmatch(r"print\s+\$1\s*", p) for p in prints)
    return False


def edita_en_el_lugar(programa: str, args: list[str]) -> bool:
    return programa == "sed" and any(
        re.fullmatch(r"-[A-Za-z]*i[A-Za-z.]*", a) or a.startswith("--in-place") for a in args
    )


def no_pisa(args: list[str]) -> bool:
    return any(a in {"--no-clobber", "--update=none"} for a in args) or "n" in banderas_cortas(args)


def recursivo(programa: str, args: list[str]) -> bool:
    if programa == "rg":
        return any(a in {"--hidden", "--no-ignore", "-uu", "-uuu"} or a.startswith("-.") for a in args)
    if any(a in {"--recursive", "--dereference-recursive"} for a in args):
        return True
    if "-d" in args and "recurse" in args:
        return True
    letras = banderas_cortas(args)
    return "r" in letras or "R" in letras


def excluye_env(args: list[str]) -> bool:
    return any(
        (a.startswith("--exclude") or a.startswith("--glob") or a.startswith("-g") or a.startswith("!"))
        and ".env" in a
        for a in args
    )


def apunta_a_la_raiz(args: list[str], cwd: str) -> bool:
    rutas = [a for a in args if not a.startswith("-")]
    if any(es_raiz(a) for a in rutas):
        return True
    en_raiz = es_raiz(cwd)
    if en_raiz and any(a in {".", "./", "*", "./*"} for a in rutas):
        return True
    # grep -r PATRÓN sin ruta busca en la carpeta actual.
    return en_raiz and len(rutas) <= 1


def revisar_etapa(etapa: str, cwd: str) -> str | None:
    """Revisa un programa de la cadena (lo que hay entre | ). Devuelve el aviso o None."""
    programa, args = separar(etapa)
    if not programa:
        return None
    secretos = [a for a in args if es_env_secreto(a)] or envs_secretos(etapa)
    respaldos = [a for a in args if es_respaldo(a)]

    if programa in COPIAN:
        destinos = [a for a in args if not a.startswith("-")]
        if destinos and es_env_exacto(destinos[-1]) and not no_pisa(args):
            return AVISO_PISAR
        return None
    if programa in BORRAN:
        return AVISO_PISAR if any(es_env_exacto(a) for a in args) else None
    if programa == "tee":
        if any(es_env_exacto(a) for a in args if not a.startswith("-")) and not (
            "-a" in args or "--append" in args
        ):
            return AVISO_PISAR
        return None
    if programa == "find" and any(a in {"-exec", "-execdir", "-ok", "-okdir"} for a in args):
        i = next(i for i, a in enumerate(args) if a in {"-exec", "-execdir", "-ok", "-okdir"})
        ejecuta = nombre_base(args[i + 1]).lower() if i + 1 < len(args) else ""
        if ejecuta in LECTORES and (secretos or apunta_a_la_raiz(args[:i], cwd) or respaldos):
            return AVISO_CLAVES
        return None
    if programa in LECTORES:
        if respaldos:
            return AVISO_RESPALDOS
        if programa in BUSCADORES and busca_sin_mostrar(programa, args):
            return None
        if secretos:
            if solo_nombres(programa, args) or edita_en_el_lugar(programa, args):
                return None
            return AVISO_CLAVES
        if programa in BUSCADORES and recursivo(programa, args) and not excluye_env(args):
            if apunta_a_la_raiz(args, cwd):
                return AVISO_GREP
    return None


def claves_expuestas(comando: str, cwd: str) -> str | None:
    """Solo se llama cuando el comando o la carpeta actual son del sistema."""
    for m in RE_REDIR_PISA.finditer(comando):
        if es_env_exacto(m.group(1)):
            return AVISO_PISAR
    for m in RE_REDIR_LEE.finditer(comando):
        if es_env_secreto(m.group(1)):
            return AVISO_CLAVES
        if es_respaldo(m.group(1)):
            return AVISO_RESPALDOS
    if RE_CARGA_ENV.search(comando) and RE_MUESTRA_VARS.search(comando):
        return AVISO_CLAVES
    if RE_CODIGO_EN_LINEA.search(comando) and (
        (envs_secretos(comando) and RE_LEE_ARCHIVO.search(comando)) or RE_MUESTRA_ENTORNO.search(comando)
    ):
        return AVISO_CLAVES
    if re.search(r"\bdocker\s+(?:container\s+|image\s+)?inspect\b", comando) and not re.search(
        r"\s(?:--format|-f)[\s=]", comando
    ):
        return AVISO_DOCKER
    if re.search(r"\bdocker(?:\s+compose|-compose)?\s+exec\b[^;&|\n]*\s(?:env|printenv|set)\b", comando):
        return AVISO_DOCKER
    if re.search(r"\bdocker(?:\s+compose|-compose)\b[^;&|\n]*\sconfig\b", comando) and not re.search(
        r"\s(?:--services|--volumes|--images|--profiles|--networks|--hash|-q|--quiet)\b", comando
    ):
        return AVISO_DOCKER
    if re.search(r"\btar\b[^;&|\n]*\s(?:-[A-Za-z]*O[A-Za-z]*|--to-stdout)\b", comando) and "respaldo" in comando.lower():
        return AVISO_RESPALDOS
    for sentencia in RE_SENTENCIAS.split(comando):
        for etapa in RE_ETAPAS.split(sentencia):
            aviso = revisar_etapa(etapa, cwd)
            if aviso:
                return aviso
    return None


def borra_volumenes(comando: str, cwd: str) -> bool:
    c = comando.lower()
    if re.search(r"\bdocker\s+volume\s+prune\b", c):
        return True
    if re.search(r"\bdocker\s+system\s+prune\b[^;&|\n]*--volumes\b", c):
        return True
    if re.search(r"\bdocker\s+volume\s+(?:rm|remove)\b", c) and del_sistema(comando, cwd):
        return True
    down = re.search(r"\bdocker(?:\s+compose|-compose)\b[^;&|\n]*\sdown\b([^;&|\n]*)", c)
    if down and re.search(r"\s(?:-v|--volumes|-[a-z]*v[a-z]*)(?=\s|$)", down.group(1)) and del_sistema(comando, cwd):
        return True
    return False


def publica(comando: str) -> bool:
    if not RE_PUBLICA.search(comando):
        return False
    if RE_RED.search(comando):
        return True
    for sentencia in RE_SENTENCIAS.split(comando):
        if not RE_PUBLICA.search(sentencia):
            continue
        for etapa in RE_ETAPAS.split(sentencia):
            programa, args = separar(etapa)
            if programa in CORREDORES and not ("--check" in args or (programa in {"node", "nodejs"} and "-c" in args)):
                return True
    return False


def _comando(entrada: dict) -> str:
    for clave in ("command", "cmd", "script"):
        if isinstance(entrada.get(clave), str):
            return entrada[clave]
    return " ".join(str(v) for v in entrada.values() if isinstance(v, str))


# --- Modos ------------------------------------------------------------------------------------------


def pre_bash(datos: dict) -> None:
    comando = _comando(datos.get("tool_input") or {})
    if not comando.strip():
        return
    cwd = str(datos.get("cwd") or "")
    if publica(comando):
        bloquear(AVISO_PUBLICAR)
    if borra_volumenes(comando, cwd):
        bloquear(AVISO_VOLUMENES)
    if del_sistema(comando, cwd):
        aviso = claves_expuestas(comando, cwd)
        if aviso:
            bloquear(aviso)


def pre_read(datos: dict) -> None:
    entrada = datos.get("tool_input") or {}
    cwd = str(datos.get("cwd") or "")
    herramienta = str(datos.get("tool_name") or "")
    ruta = ""
    for clave in ("file_path", "path", "notebook_path"):
        valor = entrada.get(clave)
        if isinstance(valor, str) and valor.strip():
            ruta = valor
            break
    if ruta and es_respaldo(ruta):
        bloquear(AVISO_RESPALDOS)
    es_grep = herramienta == "Grep" or ("pattern" in entrada and "file_path" not in entrada)
    if not es_grep:
        if ruta and del_sistema(ruta) and es_env_secreto(ruta):
            bloquear(AVISO_CLAVES)
        return
    if (entrada.get("output_mode") or "files_with_matches") != "content":
        return
    base = ruta or cwd
    if not del_sistema(base):
        return
    if es_env_secreto(base):
        bloquear(AVISO_CLAVES)
    if es_raiz(base) and not entrada.get("type"):
        patron = entrada.get("glob")
        if not patron or fnmatch.fnmatch(".env", str(patron).split("/")[-1]):
            bloquear(AVISO_GREP)


def pre_write(datos: dict) -> None:
    entrada = datos.get("tool_input") or {}
    for clave in ("file_path", "path", "notebook_path"):
        ruta = entrada.get(clave)
        if isinstance(ruta, str) and del_sistema(ruta) and es_env_secreto(ruta):
            bloquear(AVISO_PISAR)


def pre_stage(datos: dict) -> None:
    entrada = datos.get("tool_input") or {}
    rutas = [t for clave, v in entrada.items() if clave != "artifact_ids" for t in _textos(v)]
    if any(del_sistema(r) and es_env_secreto(r) for r in rutas):
        bloquear(AVISO_CLAVES)
    if any(es_respaldo(r) for r in rutas):
        bloquear(AVISO_RESPALDOS)


def pre_commit(datos: dict) -> None:
    entrada = datos.get("tool_input") or {}
    if any(del_sistema(r) and es_env_secreto(r) for r in _textos(entrada)):
        bloquear(AVISO_PISAR)


def bloquear(mensaje: str) -> None:
    print(mensaje, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    modo = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        datos = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if not isinstance(datos, dict):
        sys.exit(0)
    acciones = {
        "pre-bash": pre_bash,
        "pre-read": pre_read,
        "pre-write": pre_write,
        "pre-stage": pre_stage,
        "pre-commit": pre_commit,
    }
    accion = acciones.get(modo)
    if accion is None:
        sys.exit(0)
    try:
        accion(datos)
    except SystemExit:
        raise
    except Exception as error:
        print(f"videos-redes (guardia): error interno, no bloqueo: {error}", file=sys.stderr)
        sys.exit(0)
    sys.exit(0)


if __name__ == "__main__":
    main()
