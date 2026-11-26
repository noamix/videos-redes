#!/usr/bin/env python3
"""
Baja el modelo de la voz y comprueba que llegó entero. Lo usa instalar.sh; se puede cortar y volver a correr:
sigue donde quedó.

    python3 voz/descargar.py liviana  [--destino voz/modelos]   → VoxCPM2 en GGUF (unos 3,6 GB), solo biblioteca estándar
    python3 voz/descargar.py completa [--destino voz/modelos]   → VoxCPM2 original (unos 5 GB), con huggingface_hub
    python3 voz/descargar.py --revisar archivo.gguf             → solo mira que el GGUF sea del formato que entiende el programa

Los archivos vienen de Hugging Face. HF_ENDPOINT cambia el servidor (por ejemplo, un espejo).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO_LIVIANA = "DennisHuang648/VoxCPM2-GGUF"
ARCHIVOS_LIVIANA = ["VoxCPM2-BaseLM-Q8_0.gguf", "VoxCPM2-Acoustic-F16.gguf"]
REPO_COMPLETA = "openbmb/VoxCPM2"
REVISION = "main"
AGENTE = "videos-redes-voz/1.0"


def servidor() -> str:
    return (os.environ.get("HF_ENDPOINT") or "https://huggingface.co").rstrip("/")


def pedir(url: str, desde: int = 0, timeout: int = 60):
    cabeceras = {"User-Agent": AGENTE}
    if desde:
        cabeceras["Range"] = f"bytes={desde}-"
    return urllib.request.urlopen(urllib.request.Request(url, headers=cabeceras), timeout=timeout)


def lista_de_archivos(repo: str) -> dict:
    """{ruta: {"tamano", "sha256"}} según la API de Hugging Face."""
    with pedir(f"{servidor()}/api/models/{repo}/tree/{REVISION}") as r:
        datos = json.loads(r.read().decode("utf-8"))
    archivos = {}
    for d in datos:
        if d.get("type") != "file":
            continue
        lfs = d.get("lfs") or {}
        archivos[d["path"]] = {"tamano": int(lfs.get("size") or d.get("size") or 0), "sha256": lfs.get("oid") or ""}
    return archivos


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(bloque)
    return h.hexdigest()


def bajar(url: str, destino: Path, tamano: int, esperado: str) -> None:
    """Descarga con reanudación (.part) y verifica el sha256. Hasta 5 intentos."""
    marca = destino.with_name(destino.name + ".ok")
    if destino.exists() and destino.stat().st_size == tamano:
        if marca.exists() and marca.read_text().strip() == esperado:
            print(f"   {destino.name}: ya estaba", flush=True)
            return
        print(f"   {destino.name}: ya estaba, lo reviso…", flush=True)
        if not esperado or sha256(destino) == esperado:
            marca.write_text(esperado)
            return
        destino.unlink()
    parte = destino.with_name(destino.name + ".part")
    for intento in range(1, 6):
        hecho = parte.stat().st_size if parte.exists() else 0
        if tamano and hecho > tamano:
            parte.unlink()
            hecho = 0
        try:
            with pedir(url, hecho) as r:
                if hecho and r.status != 206:   # el servidor no reanuda: empiezo de cero
                    hecho = 0
                    parte.unlink(missing_ok=True)
                ultimo = time.time()
                with open(parte, "ab") as f:
                    while True:
                        bloque = r.read(1024 * 1024)
                        if not bloque:
                            break
                        f.write(bloque)
                        hecho += len(bloque)
                        if time.time() - ultimo > 10 and tamano:
                            print(f"   {destino.name}: {hecho * 100 // tamano} % ({hecho >> 20} de {tamano >> 20} MB)", flush=True)
                            ultimo = time.time()
            # Si la conexión se cortó sin error, el archivo quedó corto: se reintenta desde donde quedó.
            if tamano and hecho < tamano:
                raise ConnectionError(f"la conexión se cortó en {hecho >> 20} de {tamano >> 20} MB")
            break
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            if intento == 5:
                raise SystemExit(f"❌ No pude bajar {destino.name}: {e}. Volvé a correr npm run voz-instalar: sigue donde quedó.")
            print(f"   {destino.name}: se cortó ({e}); reintento en {intento * 5} s…", flush=True)
            time.sleep(intento * 5)
    if tamano and parte.stat().st_size != tamano:
        raise SystemExit(f"❌ {destino.name} quedó incompleto ({parte.stat().st_size} de {tamano} bytes). Volvé a correr el instalador.")
    print(f"   {destino.name}: reviso que esté entero…", flush=True)
    if esperado and sha256(parte) != esperado:
        parte.unlink()
        raise SystemExit(f"❌ {destino.name} llegó dañado (no coincide su sha256). Volvé a correr el instalador.")
    os.replace(parte, destino)
    marca.write_text(esperado)
    print(f"   {destino.name}: listo", flush=True)


# --------------------------------------------------------------------------- #
# GGUF: solo se leen las claves del encabezado
# --------------------------------------------------------------------------- #
_FIJOS = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}
_FORMATOS = {0: "<B", 1: "<b", 2: "<H", 3: "<h", 4: "<I", 5: "<i", 6: "<f", 7: "<?", 10: "<Q", 11: "<q", 12: "<d"}


def _leer(f, n: int) -> bytes:
    b = f.read(n)
    if len(b) != n:
        raise ValueError("archivo GGUF cortado")
    return b


def _texto(f) -> str:
    (n,) = struct.unpack("<Q", _leer(f, 8))
    if n > 1 << 24:
        raise ValueError("texto demasiado largo en el GGUF")
    return _leer(f, n).decode("utf-8", "replace")


def _valor(f, tipo: int):
    if tipo in _FORMATOS:
        return struct.unpack(_FORMATOS[tipo], _leer(f, _FIJOS[tipo]))[0]
    if tipo == 8:
        return _texto(f)
    if tipo == 9:
        (sub,) = struct.unpack("<I", _leer(f, 4))
        (n,) = struct.unpack("<Q", _leer(f, 8))
        if sub in _FIJOS:
            f.seek(_FIJOS[sub] * n, 1)
        elif sub == 8:
            for _ in range(n):
                (largo,) = struct.unpack("<Q", _leer(f, 8))
                f.seek(largo, 1)
        else:
            raise ValueError(f"tipo de lista desconocido en el GGUF: {sub}")
        return f"[{n} elementos]"
    raise ValueError(f"tipo desconocido en el GGUF: {tipo}")


def claves_gguf(ruta: Path) -> dict:
    with open(ruta, "rb") as f:
        if _leer(f, 4) != b"GGUF":
            raise ValueError("no es un archivo GGUF")
        (version,) = struct.unpack("<I", _leer(f, 4))
        if version < 2:
            raise ValueError(f"GGUF versión {version}, demasiado vieja")
        _tensores, n = struct.unpack("<QQ", _leer(f, 16))
        claves = {}
        for _ in range(n):
            clave = _texto(f)
            (tipo,) = struct.unpack("<I", _leer(f, 4))
            claves[clave] = _valor(f, tipo)
        return claves


def revisar_acustico(ruta: Path) -> str | None:
    """None si el archivo Acoustic es del formato actual de llama.cpp-omni; si no, el problema."""
    try:
        claves = claves_gguf(ruta)
    except (OSError, ValueError, struct.error) as e:
        return f"no pude leer {ruta.name}: {e}"
    if any(k.startswith("voxcpm2.") for k in claves):
        return (f"{ruta.name} está en el formato viejo (claves voxcpm2.*) y el programa ya no lo entiende. "
                "Avisá en el repositorio del plugin (github.com/noamix/videos-redes/issues); mientras tanto los "
                "videos salen sin voz")
    if "voxcpm.patch_size" not in claves:
        return f"{ruta.name} no parece un modelo VoxCPM (le falta voxcpm.patch_size)"
    version = claves.get("voxcpm.model_version")
    if version is not None and float(version) < 2:
        return f"{ruta.name} es de VoxCPM {version}, que no habla castellano: hace falta VoxCPM2"
    return None


# --------------------------------------------------------------------------- #
def liviana(destino: Path) -> None:
    destino.mkdir(parents=True, exist_ok=True)
    print(f"   Busco los archivos en Hugging Face ({REPO_LIVIANA})…", flush=True)
    try:
        lista = lista_de_archivos(REPO_LIVIANA)
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"❌ No pude ver la lista de archivos del modelo: {e}. ¿Hay internet?")
    for nombre in ARCHIVOS_LIVIANA:
        info = lista.get(nombre)
        if not info:
            raise SystemExit(f"❌ {nombre} ya no está en {REPO_LIVIANA}. Avisá en el repositorio del plugin.")
        bajar(f"{servidor()}/{REPO_LIVIANA}/resolve/{REVISION}/{nombre}", destino / nombre, info["tamano"], info["sha256"])
    problema = revisar_acustico(destino / "VoxCPM2-Acoustic-F16.gguf")
    if problema:
        raise SystemExit(f"❌ {problema}")
    print("   Formato del modelo: OK", flush=True)


def completa(destino: Path) -> None:
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        raise SystemExit("❌ Falta huggingface_hub en el Python de la voz (lo instala npm run voz-instalar -- --motor completa).")
    carpeta = destino / "VoxCPM2"
    print(f"   Bajo {REPO_COMPLETA} a {carpeta} (unos 5 GB)…", flush=True)
    snapshot_download(REPO_COMPLETA, local_dir=str(carpeta))
    if not (carpeta / "config.json").exists():
        raise SystemExit("❌ El modelo bajó incompleto. Volvé a correr el instalador.")
    print("   listo", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Baja el modelo de la voz.")
    ap.add_argument("motor", nargs="?", choices=["liviana", "completa"])
    ap.add_argument("--destino", default=str(BASE / "modelos"))
    ap.add_argument("--revisar", metavar="GGUF", help="solo revisa el formato de un archivo Acoustic")
    args = ap.parse_args()
    if args.revisar:
        problema = revisar_acustico(Path(args.revisar))
        print(f"❌ {problema}" if problema else "✅ Formato OK")
        return 1 if problema else 0
    if not args.motor:
        ap.error("falta el motor: liviana o completa")
    (liviana if args.motor == "liviana" else completa)(Path(args.destino))
    return 0


if __name__ == "__main__":
    sys.exit(main())
