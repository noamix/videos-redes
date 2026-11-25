"""
Piezas compartidas de la voz en off: carpetas, configuración, voces, turno de generación y retoques de audio.

Todo vive en esta carpeta (sistema/voz):
  config.json        qué motor quedó instalado (lo escribe instalar.sh)
  voces/<nombre>/    una carpeta por voz: referencia.wav y voz.json (lo arma preparar_voz.py)
  modelos/           los archivos del modelo (los baja instalar.sh)
  .venv/             el Python de la voz (lo arma instalar.sh)
Para las pruebas, VOZ_CONFIG y VOZ_CARPETA_VOCES cambian dónde se buscan la configuración y las voces.
"""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import re
import time
import wave
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parent
SISTEMA = BASE.parent
VERSION = "1.0.0"
MODELO = "VoxCPM2"


# --------------------------------------------------------------------------- #
# Configuración
# --------------------------------------------------------------------------- #
def ruta_config() -> Path:
    return Path(os.environ.get("VOZ_CONFIG") or BASE / "config.json").expanduser()


def leer_config() -> dict | None:
    """config.json, o None si la voz no está instalada."""
    try:
        return json.loads(ruta_config().read_text("utf-8"))
    except FileNotFoundError:
        return None


def guardar_config(datos: dict) -> None:
    ruta = ruta_config()
    temporal = ruta.with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", "utf-8")
    os.replace(temporal, ruta)


def ruta_de(valor: str | None) -> Path | None:
    """Las rutas de config.json pueden ser relativas a esta carpeta."""
    if not valor:
        return None
    p = Path(str(valor)).expanduser()
    return p if p.is_absolute() else BASE / p


def leer_env_sistema() -> dict[str, str]:
    """Lo mínimo del .env del sistema (VOZ_NOMBRE y parecidos), sin claves: solo las líneas VOZ_*."""
    datos: dict[str, str] = {}
    try:
        lineas = (SISTEMA / ".env").read_text("utf-8").splitlines()
    except (FileNotFoundError, PermissionError, UnicodeDecodeError):
        return datos
    for linea in lineas:
        linea = linea.strip()
        if not linea.startswith("VOZ_") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        datos[clave.strip()] = valor.strip().strip('"').strip("'")
    return datos


def voz_elegida() -> str:
    """La voz de los videos: VOZ_NOMBRE del entorno o del .env; si no hay, mi-voz."""
    return os.environ.get("VOZ_NOMBRE") or leer_env_sistema().get("VOZ_NOMBRE") or "mi-voz"


# --------------------------------------------------------------------------- #
# Voces
# --------------------------------------------------------------------------- #
def carpeta_voces() -> Path:
    return Path(os.environ.get("VOZ_CARPETA_VOCES") or BASE / "voces").expanduser()


def nombre_valido(nombre: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,31}", nombre or ""))


def leer_voz(nombre: str) -> dict | None:
    """voz.json de esa voz, con '_carpeta' y '_referencia'. None si no existe o le falta el audio."""
    if not nombre_valido(nombre):
        return None
    carpeta = carpeta_voces() / nombre
    try:
        datos = json.loads((carpeta / "voz.json").read_text("utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    referencia = carpeta / "referencia.wav"
    if not referencia.exists() or not str(datos.get("texto") or "").strip():
        return None
    datos["nombre"] = nombre
    datos["_carpeta"] = str(carpeta)
    datos["_referencia"] = str(referencia)
    return datos


def listar_voces() -> list[dict]:
    base = carpeta_voces()
    if not base.exists():
        return []
    voces = []
    for d in sorted(base.iterdir()):
        if d.is_dir():
            v = leer_voz(d.name)
            if v:
                voces.append(v)
    return voces


# --------------------------------------------------------------------------- #
# Turno: una sola generación por vez (el motor, voz-probar y voz-medir comparten la memoria)
# --------------------------------------------------------------------------- #
@contextlib.contextmanager
def turno(quien: str, al_esperar=None):
    ruta = Path(os.environ.get("VOZ_TURNO") or BASE / ".turno.lock")
    with open(ruta, "a+", encoding="utf-8") as f:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            if al_esperar:
                al_esperar()
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            f.seek(0)
            f.truncate()
            f.write(f"{quien} pid={os.getpid()} desde={time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.flush()
            yield
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


# --------------------------------------------------------------------------- #
# Audio (mono, float32 entre -1 y 1)
# --------------------------------------------------------------------------- #
def leer_wav(ruta: Path | str) -> tuple[np.ndarray, int]:
    """WAV PCM de 16 o 32 bits (como los que escribe voxcpm2-cli y ffmpeg). Devuelve (muestras mono, frecuencia)."""
    with wave.open(str(ruta), "rb") as w:
        canales, ancho, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        datos = w.readframes(n)
    if ancho == 2:
        x = np.frombuffer(datos, dtype="<i2").astype(np.float32) / 32768.0
    elif ancho == 4:
        x = np.frombuffer(datos, dtype="<i4").astype(np.float32) / 2147483648.0
    elif ancho == 1:
        x = (np.frombuffer(datos, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise ValueError(f"WAV de {ancho * 8} bits no soportado")
    if canales > 1:
        x = x.reshape(-1, canales).mean(axis=1)
    return x.astype(np.float32), sr


def guardar_wav(ruta: Path | str, x: np.ndarray, sr: int) -> None:
    """WAV mono PCM de 16 bits."""
    pcm = (np.clip(np.asarray(x, dtype=np.float32).reshape(-1), -1.0, 1.0) * 32767.0).round().astype("<i2")
    with wave.open(str(ruta), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())


def recortar_silencios(x: np.ndarray, sr: int, umbral_db: float = -42.0, margen: float = 0.15) -> np.ndarray:
    if x.size == 0:
        return x
    pico = float(np.max(np.abs(x)))
    if pico < 1e-5:
        return x
    ventana = max(1, int(sr * 0.02))
    n = x.size // ventana
    if n < 3:
        return x
    rms = np.sqrt(np.mean(x[: n * ventana].reshape(n, ventana) ** 2, axis=1) + 1e-12)
    activos = np.nonzero(rms > pico * 10 ** (umbral_db / 20))[0]
    if activos.size == 0:
        return x
    ini = max(0, activos[0] * ventana - int(sr * margen))
    fin = min(x.size, (activos[-1] + 1) * ventana + int(sr * margen))
    return x[ini:fin]


def normalizar_pico(x: np.ndarray, db: float = -1.0) -> np.ndarray:
    pico = float(np.max(np.abs(x))) if x.size else 0.0
    return x if pico < 1e-6 else (x * (10 ** (db / 20) / pico)).astype(np.float32)


def suavizar_bordes(x: np.ndarray, sr: int, ms: float = 8.0) -> np.ndarray:
    n = min(int(sr * ms / 1000), x.size // 2)
    if n > 1:
        x = x.copy()
        rampa = np.linspace(0.0, 1.0, n, dtype=np.float32)
        x[:n] *= rampa
        x[-n:] *= rampa[::-1]
    return x


def murmullo(texto: str, sr: int = 48000, semilla: int = 0) -> np.ndarray:
    """Audio sintético con forma de voz (sílabas, pausas en la puntuación). Para el motor simulado de las pruebas."""
    import math
    rng = np.random.default_rng((semilla + sum(map(ord, texto))) % (2 ** 32))
    partes = [np.zeros(int(sr * 0.05), np.float32)]
    f0 = 120.0
    for c in texto:
        if c in ".!?…":
            partes.append(np.zeros(int(sr * 0.28), np.float32))
            continue
        if c in ",;:":
            partes.append(np.zeros(int(sr * 0.14), np.float32))
            continue
        if c.isspace():
            partes.append(np.zeros(int(sr * 0.03), np.float32))
            continue
        if not c.isalpha() or rng.random() < 0.55:
            continue  # más o menos una sílaba cada 2 o 3 letras
        n = int(sr * rng.uniform(0.11, 0.2))
        t = np.arange(n) / sr
        f0 = float(np.clip(f0 + rng.normal(0, 6), 95, 160))
        formante = rng.uniform(400, 900)
        s = np.zeros(n, np.float32)
        for k in range(1, 14):
            f = f0 * k
            peso = math.exp(-((f - formante) / 500.0) ** 2) + 0.5 * math.exp(-((f - 1700) / 400.0) ** 2)
            s += (peso / k ** 0.6) * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)).astype(np.float32)
        partes.append(s * np.hanning(n).astype(np.float32))
    partes.append(np.zeros(int(sr * 0.05), np.float32))
    x = np.concatenate(partes)
    return normalizar_pico(x, -3.0)
