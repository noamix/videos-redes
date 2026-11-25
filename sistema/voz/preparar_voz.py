#!/usr/bin/env python3
"""
Arma la voz de los videos a partir de una grabación tuya.

    npm run voz-preparar -- grabacion.m4a --es-mi-voz
    npm run voz-preparar -- grabacion.m4a --tengo-permiso --nombre otra-voz
    npm run voz-preparar -- grabacion.m4a --es-mi-voz --texto "lo que dijiste, palabra por palabra"

La grabación es leyendo voz/texto-para-grabar.txt (unos 15 segundos). Si leíste otra cosa, pasá el texto exacto
con --texto. Sirve cualquier formato de audio que abra ffmpeg (m4a, mp3, ogg, opus, wav).

Solo tu propia voz (--es-mi-voz) o la de alguien que te dio permiso para usarla (--tengo-permiso): clonar la voz
de otra persona sin su consentimiento no está permitido.

Deja voz/voces/<nombre>/referencia.wav y voz.json. El nombre por defecto es el de VOZ_NOMBRE (mi-voz).
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402

import comun  # noqa: E402

SR = 24000            # la referencia se guarda en mono, 16 bits, 24 kHz
MINIMO, MAXIMO = 5.0, 40.0


def texto_por_defecto() -> str:
    lineas = (comun.BASE / "texto-para-grabar.txt").read_text("utf-8").splitlines()
    return " ".join(l.strip() for l in lineas if l.strip() and not l.lstrip().startswith("#"))


def convertir(origen: Path, destino: Path) -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("❌ Falta ffmpeg (sudo apt install ffmpeg).")
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(origen), "-vn", "-ac", "1", "-ar", str(SR),
                        "-c:a", "pcm_s16le", str(destino)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"❌ No pude leer el audio ({(r.stderr or '').strip().splitlines()[-1:] or ['formato desconocido']}).")


def main() -> int:
    ap = argparse.ArgumentParser(description="Arma la voz de los videos con tu grabación.")
    ap.add_argument("archivo", help="la grabación (m4a, mp3, ogg, wav…)")
    ap.add_argument("--nombre", help="nombre de la voz (minúsculas, sin espacios). Por defecto, VOZ_NOMBRE o mi-voz")
    ap.add_argument("--texto", help="lo que se dice en la grabación, palabra por palabra (por defecto, texto-para-grabar.txt)")
    ap.add_argument("--es-mi-voz", action="store_true", help="la grabación es de tu propia voz")
    ap.add_argument("--tengo-permiso", action="store_true", help="es la voz de alguien que te dio permiso para usarla")
    ap.add_argument("--reemplazar", action="store_true", help="si ya hay una voz con ese nombre, la reemplaza")
    args = ap.parse_args()

    if not (args.es_mi_voz or args.tengo_permiso):
        print("❌ Falta confirmar de quién es la voz: agregá --es-mi-voz (tu propia voz) o --tengo-permiso "
              "(alguien que te autorizó a usarla). Clonar la voz de otra persona sin su permiso no está permitido.")
        return 2
    nombre = args.nombre or comun.voz_elegida()
    if not comun.nombre_valido(nombre):
        print(f"❌ «{nombre}» no sirve como nombre: usá minúsculas, números, - o _ (por ejemplo mi-voz).")
        return 2
    origen = Path(args.archivo).expanduser()
    if not origen.is_file():
        print(f"❌ No encuentro el archivo {origen}.")
        return 2
    carpeta = comun.carpeta_voces() / nombre
    if (carpeta / "voz.json").exists() and not args.reemplazar:
        print(f"❌ Ya hay una voz «{nombre}». Para reemplazarla agregá --reemplazar (o elegí otro --nombre).")
        return 2
    texto = (args.texto or texto_por_defecto()).strip()
    if len(texto.split()) < 5:
        print("❌ El texto de la grabación es muy corto: tiene que ser lo que dijiste, palabra por palabra.")
        return 2

    avisos = []
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "voz.wav"
        convertir(origen, wav)
        x, sr = comun.leer_wav(wav)
    if x.size == 0:
        print("❌ La grabación está vacía.")
        return 2
    saturadas = float(np.mean(np.abs(x) >= 0.999))
    if saturadas > 0.001:
        avisos.append("la grabación está saturada (se escucha distorsionada): si podés, grabala un poco más lejos del micrófono")
    pico = float(np.max(np.abs(x)))
    if pico < 0.02:
        print("❌ La grabación casi no tiene sonido. Revisá el micrófono y grabala de nuevo.")
        return 2
    if pico < 0.1:
        avisos.append("la grabación está muy baja: la subí, pero puede notarse el ruido de fondo")
    x = comun.recortar_silencios(x, sr, umbral_db=-40.0, margen=0.25)
    dur = x.size / sr
    if dur < MINIMO:
        print(f"❌ La grabación dura {dur:.1f} s sin los silencios: tiene que durar al menos {MINIMO:.0f} s (mejor unos 15).")
        return 2
    if dur > MAXIMO:
        print(f"❌ La grabación dura {dur:.0f} s: tiene que durar {MAXIMO:.0f} s como máximo (con unos 15 alcanza). "
              "Grabá solo el texto de voz/texto-para-grabar.txt.")
        return 2
    palabras_por_segundo = len(texto.split()) / dur
    if not 1.0 <= palabras_por_segundo <= 5.0:
        avisos.append(f"el texto no parece coincidir con la grabación ({palabras_por_segundo:.1f} palabras por segundo): "
                      "si grabaste otra cosa, pasala con --texto")
    x = comun.normalizar_pico(comun.suavizar_bordes(x, sr, 10), -1.0)

    carpeta.mkdir(parents=True, exist_ok=True)
    comun.guardar_wav(carpeta / "referencia.wav", x, sr)
    datos = {
        "nombre": nombre,
        "texto": texto,
        # La misma semilla todos los días: la voz suena igual en todos los videos.
        "semilla": random.SystemRandom().randrange(1, 2_000_000_000),
        "pasos": 10,
        "apego": 2.0,
        "duracion": round(dur, 2),
        "consentimiento": "propia" if args.es_mi_voz else "con permiso",
        "original": origen.name,
        "creada": time.strftime("%Y-%m-%d %H:%M"),
    }
    (carpeta / "voz.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"✅ Voz «{nombre}» lista: {dur:.1f} s de grabación.")
    for a in avisos:
        print(f"⚠️  {a}")
    if nombre != comun.voz_elegida():
        print(f"   Para usarla en los videos: npm run cargar-clave -- VOZ_NOMBRE --valor {nombre}")
    print("   Escuchala: npm run voz-probar   ·   Medí cuánto tarda en esta compu: npm run voz-medir")
    return 0


if __name__ == "__main__":
    sys.exit(main())
