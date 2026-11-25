#!/usr/bin/env python3
"""
Voz en off para los videos, con VoxCPM2: local, gratis y sin internet (el modelo ya tiene que estar instalado).

    voz/.venv/bin/python voz/voz_videos.py --estado [--legible]
    voz/.venv/bin/python voz/voz_videos.py --pedido /ruta/pedido.json
    voz/.venv/bin/python voz/voz_videos.py --probar ["texto"] [--voz nombre] [--salida archivo.wav]

Contrato con el motor (motor/voz.mjs). Por la salida estándar imprime UNA sola línea JSON y nada más; los demás
mensajes van a la salida de errores. Código de salida: 0 si salió bien, 2 si el pedido está mal o falta algo (voz,
modelo, instalación), 1 si falló la generación, 130 si lo cortaron (SIGTERM o Ctrl+C).

  --estado  → {"ok", "motor", "modelo", "dispositivo", "voces": [...], "version"} sin cargar el modelo.
  --pedido  → lee {"voz", "carpeta", "normalizar": true|false, "frases": [{"id", "texto"}]} y deja un WAV mono por
              frase en la carpeta: {"ok", "voz", "motor", "dispositivo", "segundos",
              "archivos": [{"id", "ruta", "duracion", "texto_leido"}]}.
Con "normalizar": true, los números, precios y medidas se pasan a palabras (texto_es.py) y se aplica
pronunciacion.txt.
"""
import os
import sys

# La salida estándar real queda reservada para la línea JSON final. Todo lo demás (avisos de las librerías,
# barras de progreso, incluso lo que escriben desde C) se manda a la salida de errores.
_SALIDA = os.fdopen(os.dup(1), "w", encoding="utf-8")
os.dup2(2, 1)

# Nunca baja nada: el modelo ya tiene que estar en disco.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import argparse  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import signal  # noqa: E402
import time  # noqa: E402
import traceback  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comun  # noqa: E402
import motores  # noqa: E402
from motores import Fallo, log  # noqa: E402

T0 = time.time()
FRASE_DE_PRUEBA = "Hola, esta es la voz de los videos. Pedí el tuyo hoy, con envío a todo el país."


class Interrumpido(BaseException):
    """SIGTERM. Hereda de BaseException para que ningún 'except Exception' lo confunda con un error."""


def _al_terminar(_sig, _frame):
    raise Interrumpido()


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise Fallo(f"Uso: voz_videos.py --estado | --pedido pedido.json | --probar [texto] ({message})", 2)


# --------------------------------------------------------------------------- #
def estado() -> tuple[dict, int]:
    cfg = comun.leer_config()
    voces = [v["nombre"] for v in comun.listar_voces()]
    if not cfg:
        return {"ok": False, "voces": voces, "version": comun.VERSION,
                "error": "La voz en off no está instalada (falta voz/config.json). Corré npm run voz-instalar."}, 2
    motor = motores.crear(cfg)
    datos = {"ok": True, "motor": motor.nombre, "modelo": comun.MODELO, "dispositivo": motor.dispositivo(),
             "voces": voces, "version": comun.VERSION}
    falta = motor.faltante()
    if falta:
        datos.update(ok=False, error=falta)
        return datos, 2
    return datos, 0


def leer_pedido(ruta: str) -> dict:
    try:
        p = json.loads(Path(ruta).read_text("utf-8"))
    except FileNotFoundError:
        raise Fallo(f"No existe el archivo de pedido: {ruta}", 2)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise Fallo(f"El pedido no es un JSON válido: {e}", 2)
    if not isinstance(p, dict):
        raise Fallo("El pedido tiene que ser un objeto JSON.", 2)
    if not isinstance(p.get("voz"), str) or not p["voz"].strip():
        raise Fallo("Falta 'voz' en el pedido.", 2)
    if not isinstance(p.get("carpeta"), str) or not p["carpeta"].strip():
        raise Fallo("Falta 'carpeta' en el pedido.", 2)
    frases = p.get("frases")
    if not isinstance(frases, list) or not frases:
        raise Fallo("Falta 'frases': una lista con al menos una frase.", 2)
    vistos = set()
    for i, f in enumerate(frases, 1):
        if not isinstance(f, dict) or not isinstance(f.get("id"), str) or not isinstance(f.get("texto"), str):
            raise Fallo(f"La frase {i} tiene que tener 'id' y 'texto' (texto).", 2)
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", f["id"]):
            raise Fallo(f"El id «{f['id']}» no sirve como nombre de archivo: usá letras, números, - o _.", 2)
        if f["id"] in vistos:
            raise Fallo(f"El id «{f['id']}» está repetido.", 2)
        if not f["texto"].strip():
            raise Fallo(f"La frase «{f['id']}» está vacía.", 2)
        vistos.add(f["id"])
    if "normalizar" in p and not isinstance(p["normalizar"], bool):
        raise Fallo("'normalizar' tiene que ser true o false.", 2)
    return p


def generar(nombre_voz: str, frases: list[dict], carpeta: Path, normalizar: bool, quien: str) -> dict:
    """frases: [{"id", "texto"}]. Deja <id>.wav en la carpeta y devuelve la respuesta del contrato."""
    cfg = comun.leer_config()
    motor = motores.crear(cfg)
    voz = comun.leer_voz(nombre_voz)
    if not voz:
        disponibles = ", ".join(v["nombre"] for v in comun.listar_voces()) or "ninguna todavía"
        raise Fallo(f"No existe la voz «{nombre_voz}» (voces guardadas: {disponibles}). "
                    "Grabala y cargala con npm run voz-preparar.", 2)
    falta = motor.faltante()
    if falta:
        raise Fallo(falta, 2)
    try:
        carpeta.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise Fallo(f"No pude crear la carpeta {carpeta}: {e.strerror}", 2)

    if normalizar:
        import texto_es
        leer = texto_es.normalizar
    else:
        def leer(texto):
            return texto
    textos = [leer(f["texto"]).strip() for f in frases]
    for f, t in zip(frases, textos):
        if not t:
            raise Fallo(f"La frase «{f['id']}» quedó vacía después de normalizarla.", 2)
    voz["_texto_leido"] = leer(voz["texto"]).strip()

    archivos = []
    t_turno = t_carga = time.time()
    with comun.turno(quien, al_esperar=lambda: log("Hay otra voz armándose; espero mi turno…")):
        t_turno = time.time()
        try:
            motor.cargar()
            t_carga = time.time()
            log(f"Motor {motor.nombre} listo en {t_carga - t_turno:.1f} s. Genero {len(frases)} frase(s) con la voz «{voz['nombre']}».")
            for f, texto in zip(frases, textos):
                t_f = time.time()
                wav, sr = motor.generar(texto, voz, carpeta)
                if wav.size == 0:
                    raise Fallo(f"La frase «{f['id']}» salió vacía.", 1)
                wav = comun.recortar_silencios(wav, sr, margen=0.08)
                wav = comun.normalizar_pico(comun.suavizar_bordes(wav, sr, 5), -1.0)
                destino = carpeta / f"{f['id']}.wav"
                temporal = carpeta / f".{f['id']}.wav.tmp"
                try:
                    comun.guardar_wav(temporal, wav, sr)
                    os.replace(temporal, destino)
                finally:
                    temporal.unlink(missing_ok=True)  # si lo cortan a mitad de escribir, no queda basura
                dur = round(wav.size / sr, 2)
                archivos.append({"id": f["id"], "ruta": str(destino), "duracion": dur, "texto_leido": texto})
                log(f"{f['id']}: {dur:.2f} s de audio en {time.time() - t_f:.1f} s")
        finally:
            motor.cerrar()
    log(f"tiempos: espera={t_turno - T0:.1f} carga={t_carga - t_turno:.1f} total={time.time() - T0:.1f}")
    return {"ok": True, "voz": voz["nombre"], "motor": motor.nombre, "dispositivo": motor.dispositivo(),
            "segundos": round(time.time() - T0, 1), "archivos": archivos}


def pedido(ruta: str) -> dict:
    p = leer_pedido(ruta)
    carpeta = Path(p["carpeta"]).expanduser().resolve()
    return generar(p["voz"].strip(), p["frases"], carpeta, p.get("normalizar") is True, "pedido del motor")


def probar(texto: str, voz: str | None, salida: str | None) -> dict:
    nombre = voz or comun.voz_elegida()
    destino = Path(salida).expanduser().resolve() if salida else \
        comun.SISTEMA / "salida" / f"voz-prueba-{time.strftime('%Y%m%d-%H%M%S')}.wav"
    carpeta = destino.parent
    r = generar(nombre, [{"id": "prueba", "texto": texto}], carpeta, True, "voz-probar")
    a = r["archivos"][0]
    os.replace(a["ruta"], destino)
    a["ruta"] = str(destino)
    return r


# --------------------------------------------------------------------------- #
def legible(datos: dict, modo: str) -> str:
    if not datos.get("ok"):
        return f"❌ {datos.get('error', 'Falló la voz.')}"
    if modo == "estado":
        voces = ", ".join(datos.get("voces") or []) or "ninguna (grabala con npm run voz-preparar)"
        elegida = comun.voz_elegida()
        marca = "" if elegida in (datos.get("voces") or []) else f"\n⚠️  La voz de los videos (VOZ_NOMBRE) es «{elegida}» y no está entre las guardadas."
        return (f"✅ Voz en off instalada: {datos['modelo']} {datos['motor']}, en {datos['dispositivo']}.\n"
                f"Voces: {voces}.{marca}")
    a = datos["archivos"][0]
    return (f"✅ Listo: {a['ruta']}\n   {a['duracion']:.1f} s de audio, armado en {datos['segundos']:.0f} s "
            f"(motor {datos['motor']}, {datos['dispositivo']}).\n   Lo que leyó: «{a['texto_leido']}»")


def main() -> int:
    signal.signal(signal.SIGTERM, _al_terminar)
    ap = Parser(prog="voz_videos.py", description="Voz en off con VoxCPM2 para los videos.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--estado", action="store_true", help="estado rápido, sin cargar el modelo")
    g.add_argument("--pedido", metavar="PEDIDO_JSON", help="genera las frases de un pedido")
    g.add_argument("--probar", nargs="?", const=FRASE_DE_PRUEBA, metavar="TEXTO", help="genera una frase para escucharla")
    ap.add_argument("--voz", help="con --probar: la voz a usar (por defecto, VOZ_NOMBRE)")
    ap.add_argument("--salida", help="con --probar: dónde guardar el WAV")
    ap.add_argument("--legible", action="store_true", help="respuesta en texto para personas, en vez de JSON")
    modo = "estado"
    try:
        args = ap.parse_args()
        if args.estado:
            datos, codigo = estado()
        elif args.pedido:
            modo = "pedido"
            datos, codigo = pedido(args.pedido), 0
        else:
            modo = "probar"
            datos, codigo = probar(args.probar, args.voz, args.salida), 0
    except Fallo as e:
        log(f"ERROR: {e}")
        datos, codigo = {"ok": False, "error": str(e)}, e.codigo
    except (Interrumpido, KeyboardInterrupt):
        datos, codigo = {"ok": False, "error": "Se interrumpió antes de terminar."}, 130
    except Exception as e:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        datos, codigo = {"ok": False, "error": f"{type(e).__name__}: {e}"[:400]}, 1
    if "--legible" in sys.argv:
        _SALIDA.write(legible(datos, modo) + "\n")
    else:
        _SALIDA.write(json.dumps(datos, ensure_ascii=False) + "\n")
    _SALIDA.flush()
    return codigo


if __name__ == "__main__":
    sys.exit(main())
