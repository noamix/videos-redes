"""
Los tres motores de la voz en off. Todos usan el mismo modelo, VoxCPM2 (Apache-2.0), y clonan la voz con su
grabación de referencia y lo que se dice en ella:

  liviana   VoxCPM2 comprimido (GGUF) con llama.cpp-omni (voxcpm2-cli), sin PyTorch. Para PCs comunes.
  completa  VoxCPM2 original con PyTorch (paquete voxcpm). Para PCs con placa NVIDIA o mucha memoria.
  simulada  sin modelo: un murmullo con forma de voz. Solo para las pruebas del sistema.

Cada motor tiene: nombre, dispositivo(), faltante() (None si está todo), cargar(), generar(texto, voz, carpeta)
y cerrar(). generar devuelve (muestras mono float32, frecuencia de muestreo).
"""
from __future__ import annotations

import os
import random
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

import comun


class Fallo(Exception):
    def __init__(self, mensaje: str, codigo: int = 1):
        super().__init__(mensaje)
        self.codigo = codigo


def log(msg: str) -> None:
    print(f"[voz {time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def _calidad(cfg: dict, voz: dict) -> tuple[int, float]:
    """Pasos del modelo (más = mejor y más lento) y apego a la voz de referencia."""
    pasos = int(voz.get("pasos") or cfg.get("pasos") or 10)
    apego = float(voz.get("apego") or cfg.get("apego") or 2.0)
    return max(4, min(pasos, 30)), max(1.0, min(apego, 4.0))


# --------------------------------------------------------------------------- #
class MotorSimulado:
    nombre = "simulada"

    def __init__(self, cfg: dict):
        self.cfg = cfg

    def dispositivo(self) -> str:
        return "cpu"

    def faltante(self) -> str | None:
        return None

    def cargar(self) -> None:
        time.sleep(float(os.environ.get("VOZ_SIMULADA_CARGA", "0.05")))

    def generar(self, texto: str, voz: dict, carpeta: Path) -> tuple[np.ndarray, int]:
        time.sleep(float(os.environ.get("VOZ_SIMULADA_DEMORA", "0.05")))
        if os.environ.get("VOZ_SIMULADA_FALLA"):
            raise Fallo(f"falla simulada: {os.environ['VOZ_SIMULADA_FALLA']}", 1)
        return comun.murmullo(texto, 48000, int(voz.get("semilla", 0))), 48000

    def cerrar(self) -> None:
        pass


# --------------------------------------------------------------------------- #
class MotorLiviano:
    """voxcpm2-cli de llama.cpp-omni: un proceso por frase (carga el modelo, genera y termina)."""
    nombre = "liviana"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        lv = cfg.get("liviana") or {}
        self.cli = comun.ruta_de(lv.get("cli"))
        self.base_lm = comun.ruta_de(lv.get("base_lm"))
        self.acustico = comun.ruta_de(lv.get("acustico"))
        self.gpu = bool(lv.get("gpu"))
        self.proceso: subprocess.Popen | None = None

    def dispositivo(self) -> str:
        return "gpu" if self.gpu else "cpu"

    def faltante(self) -> str | None:
        if not self.cli or not self.cli.exists() or not os.access(self.cli, os.X_OK):
            return "Falta el programa de la voz liviana (voxcpm2-cli). Corré npm run voz-instalar."
        for nombre, ruta in (("BaseLM", self.base_lm), ("Acoustic", self.acustico)):
            if not ruta or not ruta.exists() or ruta.stat().st_size < 100_000_000:
                return f"Falta el archivo del modelo ({nombre}) o está incompleto. Corré npm run voz-instalar."
        return None

    def cargar(self) -> None:
        pass  # el programa carga el modelo en cada frase

    def argumentos(self, texto: str, voz: dict, salida: Path) -> list[str]:
        pasos, apego = _calidad(self.cfg, voz)
        # Tope de pasos de audio (cada paso son 0,16 s): evita que una frase se estire si el modelo no corta solo.
        tope = max(40, min(150, int(len(texto) / 10 / 0.16) + 25))
        args = [str(self.cli), "-t", texto, "-o", str(salida),
                "--prompt-wav", voz["_referencia"], "--prompt-text", voz["_texto_leido"],
                "--seed", str(int(voz.get("semilla", 0)) % 2147483647), "--timesteps", str(pasos), "--cfg", f"{apego:g}",
                "--steps", str(tope)]
        if not self.gpu:
            args.append("--cpu")
        return args + [str(self.base_lm), str(self.acustico)]

    def generar(self, texto: str, voz: dict, carpeta: Path) -> tuple[np.ndarray, int]:
        fd, nombre = tempfile.mkstemp(prefix=".liviana-", suffix=".wav", dir=str(carpeta))
        os.close(fd)
        salida = Path(nombre)
        try:
            args = self.argumentos(texto, voz, salida)
            self.proceso = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                            start_new_session=False)
            _, err = self.proceso.communicate()
            codigo = self.proceso.returncode
            self.proceso = None
            detalle = (err or b"").decode("utf-8", "replace")
            if codigo != 0:
                ultima = [l for l in detalle.strip().splitlines() if l.strip()][-1:] or [f"código {codigo}"]
                if codigo == -signal.SIGKILL:
                    raise Fallo("el sistema cortó la voz (SIGKILL): probablemente se quedó sin memoria", 1)
                raise Fallo(f"voxcpm2-cli falló: {ultima[0][:300]}", 1)
            if not salida.exists() or salida.stat().st_size <= 44:
                raise Fallo("voxcpm2-cli no dejó el audio", 1)
            return comun.leer_wav(salida)
        finally:
            salida.unlink(missing_ok=True)

    def cerrar(self) -> None:
        p = self.proceso
        if p and p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=20)
            except subprocess.TimeoutExpired:
                p.kill()


# --------------------------------------------------------------------------- #
class MotorCompleto:
    """voxcpm (PyTorch): carga el modelo una vez y genera todas las frases."""
    nombre = "completa"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        cp = cfg.get("completa") or {}
        self.modelo_dir = comun.ruta_de(cp.get("modelo"))
        self.pedido_disp = str(cp.get("dispositivo") or "auto").lower()
        self.modelo = None

    def dispositivo(self) -> str:
        if self.pedido_disp in ("cpu", "cuda"):
            return self.pedido_disp
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:  # noqa: BLE001
            return "cpu"

    def faltante(self) -> str | None:
        d = self.modelo_dir
        if not d or not (d / "config.json").exists():
            return "Falta el modelo VoxCPM2. Corré npm run voz-instalar -- --motor completa."
        if not any(f.is_file() and f.stat().st_size > 200_000_000 for f in d.rglob("*")):
            return "El modelo VoxCPM2 está incompleto (se cortó la descarga). Volvé a correr npm run voz-instalar."
        import importlib.util
        if importlib.util.find_spec("voxcpm") is None:   # sin importarlo: el estado tiene que ser rápido
            return "Falta el paquete voxcpm. Corré npm run voz-instalar -- --motor completa."
        return None

    def cargar(self) -> None:
        from voxcpm import VoxCPM
        disp = self.dispositivo()
        log(f"Cargando VoxCPM2 en {disp}…")
        self.modelo = VoxCPM.from_pretrained(str(self.modelo_dir), load_denoiser=False, local_files_only=True,
                                             optimize=False, device=disp)

    def generar(self, texto: str, voz: dict, carpeta: Path) -> tuple[np.ndarray, int]:
        import torch
        pasos, apego = _calidad(self.cfg, voz)
        semilla = int(voz.get("semilla", 0))
        random.seed(semilla)
        np.random.seed(semilla % (2 ** 32))
        torch.manual_seed(semilla)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(semilla)
        try:
            wav = self.modelo.generate(
                text=texto, prompt_wav_path=voz["_referencia"], prompt_text=voz["_texto_leido"],
                reference_wav_path=voz["_referencia"], cfg_value=apego, inference_timesteps=pasos,
                normalize=False, denoise=False, retry_badcase=True, retry_badcase_max_times=3,
                retry_badcase_ratio_threshold=6.0)
        except Exception as e:  # noqa: BLE001
            if type(e).__name__ == "OutOfMemoryError":
                raise Fallo("se quedó sin memoria la placa de video: cerrá otros programas que la usen", 1)
            raise Fallo(f"{type(e).__name__}: {e}"[:300], 1)
        return np.asarray(wav, dtype=np.float32).reshape(-1), int(self.modelo.tts_model.sample_rate)

    def cerrar(self) -> None:
        self.modelo = None


MOTORES = {"liviana": MotorLiviano, "completa": MotorCompleto, "simulada": MotorSimulado}


def crear(cfg: dict | None):
    if not cfg:
        raise Fallo("La voz en off no está instalada. Mirá si tu compu la banca con npm run voz-evaluar "
                    "y después corré npm run voz-instalar.", 2)
    nombre = os.environ.get("VOZ_MOTOR") or cfg.get("motor") or ""
    if nombre not in MOTORES:
        raise Fallo(f"Motor de voz desconocido: «{nombre}» (en voz/config.json tiene que ser liviana o completa).", 2)
    return MOTORES[nombre](cfg)
