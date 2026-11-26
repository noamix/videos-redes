#!/usr/bin/env python3
"""
¿Tu compu banca la voz en off? Revisa la máquina ANTES de instalar nada y recomienda el motor.

    npm run voz-evaluar              → informe para leer (no instala ni cambia nada)
    npm run voz-evaluar -- --json    → lo mismo en JSON (lo usa instalar.sh)
    npm run voz-medir                → DESPUÉS de instalar y grabar la voz: la prueba de verdad. Arma 3 frases
                                       como las de un video, mide cuánto tarda y cuánta memoria usa, y deja en el
                                       .env los valores para esta compu (VOZ_MEMORIA_MIN_MB, VOZ_TOPE_MEMORIA,
                                       VOZ_TIMEOUT_MIN y VOZ_HORARIO). Con --sin-guardar solo informa.

Los dos motores usan el mismo modelo, VoxCPM2:
  liviana   comprimido (GGUF) con llama.cpp-omni: unos 3,6 GB de archivos y sin PyTorch. Para PCs comunes.
  completa  el original con PyTorch: unos 11 GB de memoria en procesador; rápido con placa NVIDIA.
Los números de memoria de la liviana son estimados hasta que corre voz-medir en tu compu.

Solo usa la biblioteca estándar de Python, así anda antes de instalar nada.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import platform
import resource
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
SISTEMA = BASE.parent

# ---------- Requisitos (MB) ----------
# Liviana: modelo de 3,6 GB (BaseLM Q8_0 1,73 GB + Acoustic F16 1,83 GB) más lo que usa al generar.
LIVIANA_RAM_MINIMA = 7000        # compus de 8 GB (Linux informa entre 7,1 y 7,8 GB)
LIVIANA_RAM_COMODA = 15000       # con 16 GB entra junto con el navegador y el resto
LIVIANA_MEMORIA_ESTIMADA = 5500  # estimado hasta medir (npm run voz-medir lo ajusta)
LIVIANA_DISCO = 6500             # modelo 3,6 GB + programa compilado + Python
# Completa: medido en una PC de 16 GB sin placa de video: unos 11 GB y 20 s por cada segundo de voz.
COMPLETA_RAM_CPU = 15000
COMPLETA_MEMORIA_CPU = 11000
COMPLETA_VRAM = 8000             # placa NVIDIA con 8 GB o más
COMPLETA_MEMORIA_GPU = 6000
COMPLETA_DISCO = 14000           # modelo 5 GB + PyTorch y compañía
# Lo máximo que puede tardar la voz de un video: n8n le espera 30 min a cada video y el motor corta la voz a los 12.
MAX_MIN_POR_VIDEO = 12


def mb(n: float | int | None) -> str:
    if n is None:
        return "sin dato"
    return f"{n / 1024:.1f} GB".replace(".", ",") if n >= 1024 else f"{int(n)} MB"


# --------------------------------------------------------------------------- #
# Datos de la máquina
# --------------------------------------------------------------------------- #
def leer_meminfo(texto: str) -> dict:
    d = {}
    for linea in texto.splitlines():
        partes = linea.split()
        if len(partes) >= 2 and partes[0].endswith(":") and partes[1].isdigit():
            d[partes[0][:-1]] = int(partes[1]) // 1024
    return {"total": d.get("MemTotal"), "disponible": d.get("MemAvailable"),
            "swap_total": d.get("SwapTotal"), "swap_libre": d.get("SwapFree")}


def leer_cpuinfo(texto: str) -> dict:
    modelo, flags = "", set()
    for linea in texto.splitlines():
        if ":" not in linea:
            continue
        clave, valor = (x.strip() for x in linea.split(":", 1))
        if clave in ("model name", "Model", "Hardware") and not modelo:
            modelo = valor
        elif clave in ("flags", "Features") and not flags:
            flags = set(valor.split())
    return {"modelo": modelo, "flags": flags}


def leer_archivo(ruta: str) -> str:
    try:
        return Path(ruta).read_text("utf-8", "replace")
    except OSError:
        return ""


def correr(args: list[str], timeout: int = 15) -> tuple[int, str]:
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.TimeoutExpired) as e:
        return -1, str(e)


def placas_nvidia() -> list[dict]:
    if not shutil.which("nvidia-smi"):
        return []
    codigo, salida = correr(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
    placas = []
    if codigo == 0:
        for linea in salida.strip().splitlines():
            partes = [p.strip() for p in linea.split(",")]
            if len(partes) == 2 and partes[1].isdigit():
                placas.append({"nombre": partes[0], "memoria": int(partes[1])})
    return placas


def tiene_venv() -> bool:
    """En Ubuntu y Debian, python3 -m venv necesita el paquete python3-venv (trae ensurepip)."""
    import importlib.util
    return importlib.util.find_spec("ensurepip") is not None


def datos_maquina() -> dict:
    mem = leer_meminfo(leer_archivo("/proc/meminfo"))
    cpu = leer_cpuinfo(leer_archivo("/proc/cpuinfo"))
    try:
        hilos = len(os.sched_getaffinity(0))
    except AttributeError:
        hilos = os.cpu_count() or 1
    so = {}
    for linea in leer_archivo("/etc/os-release").splitlines():
        if "=" in linea:
            k, v = linea.split("=", 1)
            so[k] = v.strip().strip('"')
    compilador = shutil.which("g++") or shutil.which("c++") or shutil.which("clang++")
    return {
        "sistema": platform.system(),
        "distro": so.get("PRETTY_NAME", ""),
        "familia": f"{so.get('ID', '')} {so.get('ID_LIKE', '')}".strip(),
        "arquitectura": platform.machine(),
        "memoria": mem,
        "procesador": cpu["modelo"],
        "hilos": hilos,
        "avx2": "avx2" in cpu["flags"],
        "avx512": "avx512f" in cpu["flags"],
        "nvidia": placas_nvidia(),
        "nvcc": bool(shutil.which("nvcc") or Path("/usr/local/cuda/bin/nvcc").exists()),
        "disco_libre": shutil.disk_usage(BASE).free // (1024 * 1024),
        "python": platform.python_version(),
        "herramientas": {
            "cmake": bool(shutil.which("cmake")),
            "compilador": bool(compilador),
            "make": bool(shutil.which("make")),
            "git": bool(shutil.which("git")),
            "venv": tiene_venv(),
            "ffmpeg": bool(shutil.which("ffmpeg")),
            "systemd-run": bool(shutil.which("systemd-run")),
        },
    }


# --------------------------------------------------------------------------- #
# Veredicto (sin tocar la máquina: recibe los datos, así se puede probar)
# --------------------------------------------------------------------------- #
def paquetes_faltantes(m: dict, motor: str) -> list[str]:
    h = m["herramientas"]
    faltan = []
    if motor == "liviana":
        if not h["cmake"]:
            faltan.append("cmake")
        if not h["compilador"] or not h["make"]:
            faltan.append("build-essential")
        if not h["git"]:
            faltan.append("git")
    if not h["venv"]:
        faltan.append("python3-venv")
    if not h["ffmpeg"]:
        faltan.append("ffmpeg")
    return faltan


def evaluar(m: dict, pedido: str | None = None) -> dict:
    """pedido: liviana o completa para evaluar ese motor en vez del recomendado."""
    total = m["memoria"].get("total") or 0
    disponible = m["memoria"].get("disponible")
    vram = max((p["memoria"] for p in m["nvidia"]), default=0)
    r = {"apto": False, "recomendado": None, "veredicto": "", "motivos": [], "avisos": [], "opciones": {},
         "valores": {}, "faltan": [], "comando_faltan": "", "maquina": m}

    if m["sistema"] != "Linux":
        r["veredicto"] = f"No: el instalador de la voz es para Linux y esta compu tiene {m['sistema']}."
        return r
    py = tuple(int(x) for x in m["python"].split(".")[:2])
    if py < (3, 10):
        r["veredicto"] = f"No: hace falta Python 3.10 o más nuevo y esta compu tiene {m['python']}."
        return r

    # ---- Liviana ----
    liv = {"apto": True, "motivo": ""}
    if total < LIVIANA_RAM_MINIMA:
        liv = {"apto": False, "motivo": f"tiene {mb(total)} de memoria y la liviana necesita una compu de 8 GB o más"}
    elif m["hilos"] < 2:
        liv = {"apto": False, "motivo": "el procesador tiene un solo hilo"}
    elif m["arquitectura"] not in ("x86_64", "amd64", "aarch64", "arm64"):
        liv = {"apto": False, "motivo": f"el procesador es {m['arquitectura']} (hace falta x86_64 o ARM de 64 bits)"}
    elif m["disco_libre"] < LIVIANA_DISCO:
        liv = {"apto": False, "motivo": f"hay {mb(m['disco_libre'])} libres en el disco y la liviana necesita {mb(LIVIANA_DISCO)}"}
    r["opciones"]["liviana"] = liv

    # ---- Completa ----
    com = {"apto": False, "motivo": "", "gpu": False}
    if vram >= COMPLETA_VRAM:
        com = {"apto": True, "motivo": f"placa NVIDIA de {mb(vram)}", "gpu": True}
    elif total >= COMPLETA_RAM_CPU:
        com = {"apto": True, "motivo": "en procesador: unos 11 GB de memoria y unos 20 s por cada segundo de voz", "gpu": False}
    else:
        com["motivo"] = f"necesita una placa NVIDIA de 8 GB o una compu de 16 GB, y esta tiene {mb(total)}"
    if com["apto"] and m["disco_libre"] < COMPLETA_DISCO:
        com = {"apto": False, "motivo": f"hay {mb(m['disco_libre'])} libres y la completa necesita {mb(COMPLETA_DISCO)}", "gpu": com["gpu"]}
    r["opciones"]["completa"] = com

    # ---- Recomendación ----
    if pedido:
        if not r["opciones"][pedido]["apto"]:
            r["recomendado"] = pedido
            r["veredicto"] = f"No: la voz {pedido} no entra en esta compu: {r['opciones'][pedido]['motivo']}."
            return r
        motor = pedido
    elif com["apto"] and com["gpu"]:
        motor = "completa"
        r["motivos"].append(f"Tiene placa NVIDIA de {mb(vram)}: la voz completa corre en la placa y es rápida.")
    elif liv["apto"]:
        motor = "liviana"
        r["motivos"].append(f"Tiene {mb(total)} de memoria y {m['hilos']} hilos de procesador, sin placa NVIDIA grande: "
                            "la liviana es la indicada (mismo modelo y misma voz, comprimido).")
        if com["apto"]:
            r["motivos"].append("La completa también entraría, pero en procesador usa unos 11 GB y es más lenta.")
    else:
        motor = None
    r["recomendado"] = motor
    r["apto"] = motor is not None
    if not motor:
        r["veredicto"] = f"No la banca: {liv['motivo']}. Los videos salen igual, sin voz en off."
        return r

    # ---- Avisos de velocidad ----
    if motor == "liviana":
        if m["arquitectura"] in ("x86_64", "amd64") and not m["avx2"]:
            r["avisos"].append("El procesador no tiene AVX2: la voz liviana va a andar, pero muy lenta.")
        if m["arquitectura"] in ("aarch64", "arm64"):
            r["avisos"].append("Procesador ARM: va a andar, pero puede ser lenta.")
        if m["hilos"] < 4:
            r["avisos"].append(f"El procesador tiene {m['hilos']} hilos: va a ser lenta (con 4 o más anda mejor).")
        if total < 11500:
            r["avisos"].append("Con 8 GB la voz entra justa: se arma de madrugada, con el navegador y los demás programas cerrados.")
        if vram and vram < COMPLETA_VRAM:
            r["avisos"].append(f"La placa NVIDIA tiene {mb(vram)}: no alcanza para la completa.")
    if not m["herramientas"]["systemd-run"]:
        r["avisos"].append("No está systemd-run: la voz va a correr sin tope de memoria.")

    # ---- Valores iniciales para el .env (npm run voz-medir los ajusta con la medición real) ----
    if motor == "liviana":
        memoria = LIVIANA_MEMORIA_ESTIMADA
        horario = "" if total >= LIVIANA_RAM_COMODA else "1-6"
    elif com["gpu"]:
        memoria, horario = COMPLETA_MEMORIA_GPU, ""
    else:
        memoria, horario = COMPLETA_MEMORIA_CPU, "1-6"
    r["valores"] = {
        "VOZ_MEMORIA_MIN_MB": str(memoria),
        "VOZ_TOPE_MEMORIA": f"{int(math.ceil(memoria * 1.35 / 256) * 256)}M",
        "VOZ_TIMEOUT_MIN": str(MAX_MIN_POR_VIDEO),
        "VOZ_HORARIO": horario,
    }
    if disponible is not None and disponible < memoria:
        r["avisos"].append(f"Ahora hay {mb(disponible)} libres y la voz necesita unos {mb(memoria)}: "
                           "para instalarla y medirla, cerrá el navegador y los programas pesados.")

    r["faltan"] = paquetes_faltantes(m, motor)
    if r["faltan"]:
        familia = m.get("familia", "")
        if "debian" in familia or "ubuntu" in familia:
            r["comando_faltan"] = f"sudo apt install -y {' '.join(r['faltan'])}"
        else:
            r["comando_faltan"] = f"instalá con el gestor de paquetes de tu sistema: {', '.join(r['faltan'])}"
    nombre = "liviana" if motor == "liviana" else ("completa (en la placa NVIDIA)" if com["gpu"] else "completa")
    r["veredicto"] = f"Sí la banca: la voz {nombre}." if pedido else f"Sí la banca: te recomiendo la voz {nombre}."
    return r


def informe(r: dict) -> str:
    m = r["maquina"]
    mem = m["memoria"]
    gpu = ", ".join(f"{p['nombre']} ({mb(p['memoria'])})" for p in m["nvidia"]) or "sin placa NVIDIA"
    lineas = [
        "VOZ EN OFF: ¿TU COMPU LA BANCA?",
        "",
        f"Sistema: {m['distro'] or m['sistema']} ({m['arquitectura']}) · Python {m['python']}",
        f"Procesador: {m['procesador'] or 'sin dato'} · {m['hilos']} hilos · AVX2: {'sí' if m['avx2'] else 'no'}",
        f"Memoria: {mb(mem.get('total'))} en total, {mb(mem.get('disponible'))} libres ahora · swap {mb(mem.get('swap_total'))}",
        f"Placa de video: {gpu}",
        f"Disco libre: {mb(m['disco_libre'])}",
        "",
        f"{'✅' if r['apto'] else '❌'} {r['veredicto']}",
    ]
    lineas += [f"   {x}" for x in r["motivos"]]
    for nombre, o in r["opciones"].items():
        if o.get("motivo") and nombre != r["recomendado"]:
            lineas.append(f"   · {nombre}: {'entra' if o['apto'] else 'no entra'}: {o['motivo']}")
    if r["avisos"]:
        lineas.append("")
        lineas += [f"⚠️  {x}" for x in r["avisos"]]
    if r["apto"]:
        lineas.append("")
        if r["faltan"]:
            lineas.append("Antes de instalar falta esto del sistema (lo corre el dueño de la compu, con su contraseña):")
            lineas.append(f"   {r['comando_faltan']}")
        disco = "unos 4 GB" if r["recomendado"] == "liviana" else "unos 8 a 12 GB"
        lineas += [
            f"Para instalarla: npm run voz-instalar (baja {disco} y tarda un rato; la liviana se compila en la compu).",
            "Después: grabá tu voz (npm run voz-preparar) y medí de verdad cuánto tarda (npm run voz-medir).",
            "La velocidad real recién se sabe con voz-medir. Si tarda demasiado, npm run voz-desinstalar la saca y los videos siguen sin voz.",
        ]
    return "\n".join(lineas)


# --------------------------------------------------------------------------- #
# Medición real (después de instalar)
# --------------------------------------------------------------------------- #
FRASES_MEDICION = [
    "Mirá lo nuevo que llegó para tu negocio.",
    "Viene en 3 medidas, de 30x40 a 50x60 centímetros.",
    "Pedilo hoy y escribinos por WhatsApp.",
]


def disponible_ahora() -> int | None:
    return leer_meminfo(leer_archivo("/proc/meminfo")).get("disponible")


def leer_env_voz() -> dict:
    datos = {}
    for linea in leer_archivo(str(SISTEMA / ".env")).splitlines():
        linea = linea.strip()
        if linea.startswith("VOZ_") and "=" in linea:
            k, v = linea.split("=", 1)
            datos[k.strip()] = v.strip().strip('"').strip("'")
    return datos


def guardar_en_env(valores: dict) -> list[str]:
    """Carga los valores con el mismo comando que usa el dueño (npm run cargar-clave -- NOMBRE --valor X)."""
    node = os.environ.get("npm_node_execpath") or shutil.which("node") or "node"
    hechos = []
    for clave, valor in valores.items():
        r = subprocess.run([node, str(SISTEMA / "motor" / "cargar-clave.mjs"), clave, "--valor", valor],
                           capture_output=True, text=True, cwd=str(SISTEMA))
        if r.returncode != 0:
            raise RuntimeError(f"no pude guardar {clave}: {(r.stdout + r.stderr).strip()[-300:]}")
        hechos.append(f"{clave}={valor}")
    return hechos


def veredicto_medicion(segundos: float, audio: float, usado: int, total: int) -> dict:
    """De la medición (3 frases = la voz de un video) a un veredicto y los valores para el .env."""
    por_video = segundos / 60
    if por_video > MAX_MIN_POR_VIDEO:
        return {"apto": False, "veredicto": f"No la banca: la voz de un video tarda {por_video:.0f} min y el máximo es {MAX_MIN_POR_VIDEO}."}
    if total and usado > total * 0.85:
        return {"apto": False, "veredicto": f"No la banca: usa {mb(usado)} de {mb(total)} (casi toda la memoria)."}
    memoria = int(math.ceil((usado * 1.15 + 300) / 100) * 100)
    valores = {
        "VOZ_MEMORIA_MIN_MB": str(memoria),
        "VOZ_TOPE_MEMORIA": f"{int(math.ceil(usado * 1.35 / 256) * 256)}M",
        "VOZ_TIMEOUT_MIN": str(min(MAX_MIN_POR_VIDEO, max(4, math.ceil(por_video * 2.5)))),
        "VOZ_HORARIO": "" if (por_video <= 4 and (not total or usado < total * 0.4)) else "1-6",
    }
    if por_video > 4:
        texto = f"La banca, pero lenta: {por_video:.1f} min por video. Conviene armarla de madrugada (de 1 a 6 h)."
    elif valores["VOZ_HORARIO"]:
        texto = f"La banca: {por_video:.1f} min por video, pero usa bastante memoria. Conviene de madrugada (de 1 a 6 h)."
    else:
        texto = f"La banca bien: {por_video:.1f} min por video. Puede armarse a cualquier hora."
    return {"apto": True, "veredicto": texto, "valores": valores, "rtf": round(segundos / audio, 1) if audio else None}


def medir(guardar: bool) -> int:
    py = BASE / ".venv" / "bin" / "python"
    if not py.exists() or not (BASE / "config.json").exists():
        print("❌ La voz no está instalada todavía: corré npm run voz-instalar.")
        return 2
    env_voz = leer_env_voz()
    nombre = os.environ.get("VOZ_NOMBRE") or env_voz.get("VOZ_NOMBRE") or "mi-voz"
    if not (BASE / "voces" / nombre / "voz.json").exists() and not os.environ.get("VOZ_CARPETA_VOCES"):
        print(f"❌ Falta la voz «{nombre}»: grabala leyendo voz/texto-para-grabar.txt y cargala con npm run voz-preparar.")
        return 2
    m = datos_maquina()
    total = m["memoria"].get("total") or 0
    antes = disponible_ahora()
    carpeta = SISTEMA / "trabajos" / f"voz-medicion-{time.strftime('%Y%m%d-%H%M%S')}"
    carpeta.mkdir(parents=True, exist_ok=True)
    pedido = {"voz": nombre, "carpeta": str(carpeta), "normalizar": True,
              "frases": [{"id": f"p{i + 1}", "texto": t} for i, t in enumerate(FRASES_MEDICION)]}
    archivo = carpeta / "pedido.json"
    archivo.write_text(json.dumps(pedido, ensure_ascii=False), "utf-8")
    print(f"Midiendo la voz «{nombre}» con 3 frases, como en un video (memoria libre: {mb(antes)}). Puede tardar varios minutos…", flush=True)

    minimo = [antes]
    seguir = [True]

    def vigilar():
        while seguir[0]:
            d = disponible_ahora()
            if d is not None and (minimo[0] is None or d < minimo[0]):
                minimo[0] = d
            time.sleep(0.25)

    hilo = threading.Thread(target=vigilar, daemon=True)
    hilo.start()
    comando = [str(py), str(BASE / "voz_videos.py"), "--pedido", str(archivo)]
    # Con tope de memoria (si se puede), así una compu justa no se queda colgada durante la prueba.
    if shutil.which("systemd-run") and total:
        tope = int(total * 0.85)
        con_tope = ["systemd-run", "--user", "--scope", "--quiet", "-p", f"MemoryMax={tope}M", "-p", "MemorySwapMax=1G", "--"] + comando
        if correr(["systemd-run", "--user", "--scope", "--quiet", "-p", "MemoryMax=256M", "--", "true"])[0] == 0:
            comando = con_tope
    t0 = time.time()
    try:
        r = subprocess.run(comando, capture_output=True, text=True, timeout=45 * 60)
        salida, error, codigo = r.stdout, r.stderr, r.returncode
    except subprocess.TimeoutExpired:
        salida, error, codigo = "", "pasaron 45 min", -9
    segundos = time.time() - t0
    seguir[0] = False
    hilo.join(timeout=2)
    pico = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss // 1024
    usado = max(pico, (antes - minimo[0]) if (antes is not None and minimo[0] is not None) else 0)
    try:
        resp = json.loads([l for l in salida.splitlines() if l.strip().startswith("{")][-1])
    except (IndexError, json.JSONDecodeError):
        resp = {"ok": False, "error": (error.strip().splitlines() or [f"código {codigo}"])[-1]}
    shutil.rmtree(carpeta, ignore_errors=True)
    if codigo in (-9, 137) or (codigo != 0 and not resp.get("error")):
        resp = {"ok": False, "error": "el sistema cortó la voz (se quedó sin memoria o tardó demasiado)"}
    if not resp.get("ok"):
        print(f"❌ No la banca o falló la voz: {resp.get('error')}")
        print(f"   (tardó {segundos:.0f} s y llegó a usar {mb(usado)})")
        (BASE / "medicion.json").write_text(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "ok": False,
                                                        "error": resp.get("error"), "segundos": round(segundos),
                                                        "memoria_usada_mb": usado}, ensure_ascii=False, indent=2), "utf-8")
        return 1
    audio = sum(float(a.get("duracion") or 0) for a in resp.get("archivos", []))
    v = veredicto_medicion(segundos, audio, usado, total)
    datos = {"fecha": time.strftime("%Y-%m-%d %H:%M"), "ok": v["apto"], "motor": resp.get("motor"),
             "dispositivo": resp.get("dispositivo"), "segundos": round(segundos), "audio_segundos": round(audio, 1),
             "segundos_por_segundo_de_voz": v.get("rtf"), "memoria_usada_mb": usado, "memoria_total_mb": total,
             "veredicto": v["veredicto"], "valores": v.get("valores", {})}
    (BASE / "medicion.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2), "utf-8")
    print(f"{'✅' if v['apto'] else '❌'} {v['veredicto']}")
    print(f"   Motor {resp.get('motor')} en {resp.get('dispositivo')}: {segundos:.0f} s para {audio:.1f} s de voz "
          f"({v.get('rtf') or '?'} s por cada segundo), y llegó a usar {mb(usado)} de memoria.")
    if not v["apto"]:
        print("   Los videos siguen saliendo sin voz. Para apagarla del todo: npm run cargar-clave -- VOZ_MODO --valor no")
        return 0
    if guardar:
        try:
            hechos = guardar_en_env(v["valores"])
            print(f"   Guardé en el .env: {' · '.join(hechos) if hechos else 'nada'}")
            print("   Para que el motor los use: systemctl --user restart videos-redes")
        except RuntimeError as e:
            print(f"⚠️  {e}")
            return 1
    else:
        print(f"   Valores para el .env: {v['valores']}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="¿La compu banca la voz en off?")
    ap.add_argument("--json", action="store_true", help="resultado en JSON")
    ap.add_argument("--medir", action="store_true", help="medición real (después de instalar y grabar la voz)")
    ap.add_argument("--sin-guardar", action="store_true", help="con --medir: no cambia el .env")
    ap.add_argument("--motor", choices=["liviana", "completa"], help="evaluar ese motor en vez del recomendado")
    args = ap.parse_args()
    if args.medir:
        return medir(not args.sin_guardar)
    r = evaluar(datos_maquina(), args.motor)
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2, default=sorted))
    else:
        print(informe(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
