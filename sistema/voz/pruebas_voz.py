#!/usr/bin/env python3
"""
Pruebas de la voz en off, sin modelo y sin internet: el evaluador, la descarga (contra un servidor falso), el
formato GGUF, el texto en castellano, el comando de los videos con el motor simulado y la voz liviana con un
voxcpm2-cli falso que revisa los argumentos igual que el de verdad.

    npm run pruebas-voz
Necesitan numpy y num2words (los tiene el Python de la voz: voz/.venv). Con otro Python: VOZ_PYTHON=/ruta/python.
"""
from __future__ import annotations

import hashlib
import http.server
import json
import os
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

try:
    import numpy as np  # noqa: F401
    import num2words  # noqa: F401
except ImportError:
    venv = BASE / ".venv" / "bin" / "python"
    otro = os.environ.get("VOZ_PYTHON") or (str(venv) if venv.exists() else "")
    if otro and Path(otro).resolve() != Path(sys.executable).resolve():
        os.execv(otro, [otro, __file__, *sys.argv[1:]])
    print("⚪ Pruebas de la voz salteadas: hace falta un Python con numpy y num2words "
          "(npm run voz-instalar lo arma, o pasá VOZ_PYTHON=/ruta/python).")
    sys.exit(0)

import comun  # noqa: E402
import descargar  # noqa: E402
import evaluar  # noqa: E402
import texto_es  # noqa: E402

TMP = Path(tempfile.mkdtemp(prefix="voz-pruebas-"))
PY = sys.executable


def maquina(**cambios) -> dict:
    m = {
        "sistema": "Linux", "distro": "Ubuntu 24.04", "familia": "ubuntu debian", "arquitectura": "x86_64",
        "memoria": {"total": 15800, "disponible": 9000, "swap_total": 4096, "swap_libre": 4000},
        "procesador": "Intel Core i5", "hilos": 12, "avx2": True, "avx512": False, "nvidia": [], "nvcc": False,
        "disco_libre": 50000, "python": "3.12.3",
        "herramientas": {"cmake": True, "compilador": True, "make": True, "git": True, "venv": True, "ffmpeg": True, "systemd-run": True},
    }
    for k, v in cambios.items():
        if k in ("memoria", "herramientas"):
            m[k] = {**m[k], **v}
        else:
            m[k] = v
    return m


def gguf(ruta: Path, claves: dict) -> None:
    """Un GGUF mínimo (solo encabezado) con esas claves: textos, enteros, decimales y listas de textos."""
    def texto(s: str) -> bytes:
        b = s.encode()
        return struct.pack("<Q", len(b)) + b
    datos = b"GGUF" + struct.pack("<IQQ", 3, 0, len(claves))
    for k, v in claves.items():
        datos += texto(k)
        if isinstance(v, str):
            datos += struct.pack("<I", 8) + texto(v)
        elif isinstance(v, float):
            datos += struct.pack("<If", 6, v)
        elif isinstance(v, list):
            datos += struct.pack("<IIQ", 9, 8, len(v)) + b"".join(texto(x) for x in v)
        else:
            datos += struct.pack("<II", 4, v)
    ruta.write_bytes(datos)


# --------------------------------------------------------------------------- #
class Texto(unittest.TestCase):
    def test_numeros_medidas_y_precios(self):
        n = texto_es.normalizar
        self.assertEqual(n("Bolsas de 30x40 cm"), "Bolsas de treinta por cuarenta centímetros")
        self.assertEqual(n("Pack x100"), "Pack por cien")
        self.assertIn("doce mil quinientos pesos", n("A $12.500"))
        self.assertIn("una caja", n("1 caja"))
        self.assertIn("veintiún kilos", n("21 kg"))

    def test_pronunciacion(self):
        archivo = TMP / "pron.txt"
        archivo.write_text("# comentario\nWhatsApp = guasap\nonline = onláin\n", "utf-8")
        os.environ["PRONUNCIACION"] = str(archivo)
        try:
            self.assertEqual(texto_es.normalizar("Escribinos por WhatsApp, compra online."), "Escribinos por guasap, compra onláin.")
        finally:
            del os.environ["PRONUNCIACION"]


class Evaluador(unittest.TestCase):
    def test_compu_de_16_gb_sin_placa(self):
        r = evaluar.evaluar(maquina())
        self.assertTrue(r["apto"])
        self.assertEqual(r["recomendado"], "liviana")
        self.assertEqual(r["valores"]["VOZ_HORARIO"], "")
        self.assertTrue(r["opciones"]["completa"]["apto"])

    def test_compu_de_8_gb(self):
        r = evaluar.evaluar(maquina(memoria={"total": 7700, "disponible": 3000}))
        self.assertEqual(r["recomendado"], "liviana")
        self.assertEqual(r["valores"]["VOZ_HORARIO"], "1-6")
        self.assertTrue(any("8 GB" in a for a in r["avisos"]))
        self.assertTrue(any("cerrá el navegador" in a for a in r["avisos"]))

    def test_compu_de_4_gb_no_la_banca(self):
        r = evaluar.evaluar(maquina(memoria={"total": 3900}))
        self.assertFalse(r["apto"])
        self.assertIn("No la banca", r["veredicto"])

    def test_placa_nvidia_grande(self):
        r = evaluar.evaluar(maquina(nvidia=[{"nombre": "RTX 3060", "memoria": 12288}]))
        self.assertEqual(r["recomendado"], "completa")
        self.assertTrue(r["opciones"]["completa"]["gpu"])
        self.assertEqual(r["valores"]["VOZ_HORARIO"], "")

    def test_sin_avx2_y_pocos_hilos(self):
        r = evaluar.evaluar(maquina(avx2=False, hilos=2))
        self.assertTrue(r["apto"])
        self.assertTrue(any("AVX2" in a for a in r["avisos"]))
        self.assertTrue(any("2 hilos" in a for a in r["avisos"]))

    def test_faltan_paquetes(self):
        r = evaluar.evaluar(maquina(herramientas={"cmake": False, "compilador": False, "venv": False}))
        self.assertEqual(r["faltan"], ["cmake", "build-essential", "python3-venv"])
        self.assertEqual(r["comando_faltan"], "sudo apt install -y cmake build-essential python3-venv")

    def test_la_completa_no_necesita_compilar(self):
        r = evaluar.evaluar(maquina(herramientas={"cmake": False}, nvidia=[{"nombre": "RTX 4070", "memoria": 12282}]))
        self.assertEqual(r["faltan"], [])

    def test_motor_elegido(self):
        r = evaluar.evaluar(maquina(memoria={"total": 7700}), "completa")
        self.assertFalse(r["apto"])
        self.assertIn("completa no entra", r["veredicto"])

    def test_poco_disco_y_otro_sistema(self):
        self.assertFalse(evaluar.evaluar(maquina(disco_libre=3000))["apto"])
        self.assertIn("Linux", evaluar.evaluar(maquina(sistema="Windows"))["veredicto"])

    def test_lectura_de_proc(self):
        mem = evaluar.leer_meminfo("MemTotal:       16303800 kB\nMemAvailable:    9000000 kB\nSwapTotal: 4194300 kB\n")
        self.assertEqual((mem["total"], mem["disponible"], mem["swap_total"]), (15921, 8789, 4095))
        cpu = evaluar.leer_cpuinfo("processor : 0\nmodel name : Intel(R) Core(TM) i5\nflags : fpu sse2 avx avx2 fma\n")
        self.assertEqual(cpu["modelo"], "Intel(R) Core(TM) i5")
        self.assertIn("avx2", cpu["flags"])

    def test_veredicto_de_la_medicion(self):
        bien = evaluar.veredicto_medicion(90, 10, 4000, 15800)
        self.assertTrue(bien["apto"])
        self.assertEqual(bien["valores"]["VOZ_HORARIO"], "")
        self.assertEqual(bien["valores"]["VOZ_MEMORIA_MIN_MB"], "4900")
        self.assertEqual(bien["valores"]["VOZ_TOPE_MEMORIA"], "5632M")
        lenta = evaluar.veredicto_medicion(420, 10, 5000, 15800)
        self.assertTrue(lenta["apto"])
        self.assertEqual(lenta["valores"]["VOZ_HORARIO"], "1-6")
        self.assertEqual(lenta["valores"]["VOZ_TIMEOUT_MIN"], "12")
        self.assertFalse(evaluar.veredicto_medicion(13 * 60, 10, 5000, 15800)["apto"])
        self.assertFalse(evaluar.veredicto_medicion(60, 10, 7500, 7800)["apto"])


class FormatoGGUF(unittest.TestCase):
    def test_formato_actual(self):
        a = TMP / "nuevo.gguf"
        gguf(a, {"general.architecture": "voxcpm2", "voxcpm.patch_size": 4, "voxcpm.model_version": 2.0, "tokenizer.ggml.tokens": ["a", "bb", "ccc"]})
        self.assertIsNone(descargar.revisar_acustico(a))
        self.assertEqual(descargar.claves_gguf(a)["voxcpm.patch_size"], 4)

    def test_formato_viejo(self):
        a = TMP / "viejo.gguf"
        gguf(a, {"voxcpm2.patch_size": 4})
        self.assertIn("formato viejo", descargar.revisar_acustico(a))

    def test_otro_modelo_o_roto(self):
        a = TMP / "viejito.gguf"
        gguf(a, {"voxcpm.patch_size": 2, "voxcpm.model_version": 0.5})
        self.assertIn("castellano", descargar.revisar_acustico(a))
        roto = TMP / "roto.gguf"
        roto.write_bytes(b"GGUF\x03\x00")
        self.assertIn("no pude leer", descargar.revisar_acustico(roto))


class ServidorFalso(http.server.BaseHTTPRequestHandler):
    archivos: dict = {}
    cortar_una_vez: set = set()
    pedidos: list = []

    def log_message(self, *_):
        pass

    def do_GET(self):
        ServidorFalso.pedidos.append((self.path, self.headers.get("Range")))
        if self.path.startswith("/api/models/"):
            lista = [{"type": "file", "path": n, "size": 100, "lfs": {"oid": hashlib.sha256(d).hexdigest(), "size": len(d)}}
                     for n, d in self.archivos.items()]
            cuerpo = json.dumps(lista).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        nombre = self.path.rsplit("/", 1)[-1]
        datos = self.archivos.get(nombre)
        if datos is None:
            self.send_response(404)
            self.end_headers()
            return
        desde = int(self.headers["Range"].split("=")[1].split("-")[0]) if self.headers.get("Range") else 0
        parte = datos[desde:]
        self.send_response(206 if desde else 200)
        self.send_header("Content-Length", str(len(parte)))
        self.end_headers()
        if nombre in self.cortar_una_vez:   # corta la conexión a la mitad, una vez
            self.cortar_una_vez.discard(nombre)
            self.wfile.write(parte[: len(parte) // 2])
            self.wfile.flush()
            self.connection.shutdown(2)
            return
        self.wfile.write(parte)


class Descarga(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ServidorFalso)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        os.environ["HF_ENDPOINT"] = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        del os.environ["HF_ENDPOINT"]

    def test_baja_reanuda_y_revisa(self):
        acustico = TMP / "acu.gguf"
        gguf(acustico, {"voxcpm.patch_size": 4, "voxcpm.model_version": 2.0, "relleno": "x" * 300_000})
        ServidorFalso.archivos = {"VoxCPM2-BaseLM-Q8_0.gguf": os.urandom(700_000), "VoxCPM2-Acoustic-F16.gguf": acustico.read_bytes()}
        ServidorFalso.cortar_una_vez = {"VoxCPM2-BaseLM-Q8_0.gguf"}
        destino = TMP / "modelos"
        (destino).mkdir(exist_ok=True)
        descargar.liviana(destino)
        for n, d in ServidorFalso.archivos.items():
            self.assertEqual((destino / n).read_bytes(), d)
        self.assertTrue(any(r for p, r in ServidorFalso.pedidos if r), "tendría que haber reanudado con Range")
        antes = len(ServidorFalso.pedidos)
        descargar.liviana(destino)   # la segunda vez no baja nada
        self.assertEqual([p for p, _ in ServidorFalso.pedidos[antes:] if "resolve" in p], [])

    def test_archivo_danado(self):
        ServidorFalso.archivos = {"x.bin": b"bien" * 1000}
        destino = TMP / "danado.bin"
        with self.assertRaises(SystemExit) as e:
            descargar.bajar(f"{os.environ['HF_ENDPOINT']}/r/resolve/main/x.bin", destino, 4000, "0" * 64)
        self.assertIn("dañado", str(e.exception))
        self.assertFalse(destino.exists())


# --------------------------------------------------------------------------- #
def setUpModule():
    """Una voz «mi-voz» armada con preparar_voz.py (con una grabación sintética), para el comando y la liviana."""
    Comando.dir = TMP / "comando"
    Comando.dir.mkdir()
    Comando.env = {**os.environ, "VOZ_CONFIG": str(Comando.dir / "config.json"), "VOZ_CARPETA_VOCES": str(Comando.dir / "voces"),
                   "VOZ_TURNO": str(Comando.dir / "turno.lock"), "VOZ_NOMBRE": "mi-voz", "PRONUNCIACION": str(Comando.dir / "nada.txt")}
    (Comando.dir / "config.json").write_text('{"motor": "simulada"}')
    Comando.texto = (BASE / "texto-para-grabar.txt").read_text("utf-8").strip().splitlines()[-1]
    grabacion = Comando.dir / "grabacion.wav"
    comun.guardar_wav(grabacion, comun.murmullo(Comando.texto, 44100, 7) * 0.6, 44100)
    r = Comando.correr("preparar_voz.py", str(grabacion), "--es-mi-voz")
    assert r.returncode == 0, r.stdout + r.stderr


class Comando(unittest.TestCase):
    """voz_videos.py como lo llama el motor: una línea JSON por la salida estándar y códigos de salida."""
    dir: Path
    env: dict
    texto: str

    @classmethod
    def correr(cls, programa: str, *args: str, env: dict | None = None, **kw) -> subprocess.CompletedProcess:
        return subprocess.run([PY, str(BASE / programa), *args], capture_output=True, text=True, env=env or cls.env, **kw)

    def pedido(self, frases: list[str], carpeta: str = "salida") -> Path:
        p = self.dir / f"pedido-{time.time_ns()}.json"
        p.write_text(json.dumps({"voz": "mi-voz", "carpeta": str(self.dir / carpeta), "normalizar": True,
                                 "frases": [{"id": f"p{i + 1}", "texto": t} for i, t in enumerate(frases)]}), "utf-8")
        return p

    def test_estado(self):
        r = self.correr("voz_videos.py", "--estado")
        d = json.loads(r.stdout)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout.count("\n"), 1)
        self.assertEqual((d["motor"], d["voces"]), ("simulada", ["mi-voz"]))

    def test_pedido(self):
        r = self.correr("voz_videos.py", "--pedido", str(self.pedido(["Hola.", "Bolsas de 30x40 cm.", "Pedilas hoy."])))
        d = json.loads(r.stdout)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([a["id"] for a in d["archivos"]], ["p1", "p2", "p3"])
        self.assertEqual(d["archivos"][1]["texto_leido"], "Bolsas de treinta por cuarenta centímetros.")
        x, sr = comun.leer_wav(d["archivos"][1]["ruta"])
        self.assertEqual(sr, 48000)
        self.assertAlmostEqual(x.size / sr, d["archivos"][1]["duracion"], places=1)

    def test_errores(self):
        mal = self.dir / "mal.json"
        mal.write_text('{"voz": "mi-voz"}')
        self.assertEqual(self.correr("voz_videos.py", "--pedido", str(mal)).returncode, 2)
        otra = self.dir / "otra.json"
        otra.write_text(json.dumps({"voz": "nadie", "carpeta": str(self.dir / "x"), "frases": [{"id": "a", "texto": "hola"}]}))
        r = self.correr("voz_videos.py", "--pedido", str(otra))
        self.assertEqual(r.returncode, 2)
        self.assertIn("No existe la voz", json.loads(r.stdout)["error"])
        sin = self.correr("voz_videos.py", "--estado", env={**self.env, "VOZ_CONFIG": str(self.dir / "no-hay.json")})
        self.assertEqual(sin.returncode, 2)
        self.assertIn("no está instalada", json.loads(sin.stdout)["error"])

    def test_sigterm(self):
        env = {**self.env, "VOZ_SIMULADA_DEMORA": "20"}
        p = subprocess.Popen([PY, str(BASE / "voz_videos.py"), "--pedido", str(self.pedido(["Hola."], "lenta"))],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        time.sleep(1.5)
        p.send_signal(signal.SIGTERM)
        salida, _ = p.communicate(timeout=10)
        self.assertEqual(p.returncode, 130)
        self.assertIn("interrumpió", json.loads(salida)["error"])
        self.assertFalse(list((self.dir / "lenta").glob("*.tmp")))

    def test_probar(self):
        destino = self.dir / "prueba.wav"
        r = self.correr("voz_videos.py", "--legible", "--probar", "Hola, probando 1, 2, 3.", "--salida", str(destino))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("uno, dos, tres", r.stdout)
        self.assertTrue(destino.exists())

    def test_preparar_voz(self):
        silencio = self.dir / "silencio.wav"
        comun.guardar_wav(silencio, np.zeros(44100 * 10, np.float32), 44100)
        corta = self.dir / "corta.wav"
        comun.guardar_wav(corta, comun.murmullo("Hola.", 44100) * 0.5, 44100)
        larga = self.dir / "larga.wav"
        comun.guardar_wav(larga, np.tile(comun.murmullo(self.texto, 44100) * 0.5, 4), 44100)
        for archivo, mensaje in ((silencio, "no tiene sonido"), (corta, "al menos"), (larga, "como máximo")):
            r = self.correr("preparar_voz.py", str(archivo), "--es-mi-voz", "--nombre", "otra")
            self.assertEqual(r.returncode, 2, archivo)
            self.assertIn(mensaje, r.stdout)
        r = self.correr("preparar_voz.py", str(corta), "--es-mi-voz")
        self.assertIn("Ya hay una voz", r.stdout)


class Liviana(unittest.TestCase):
    """La voz liviana con un voxcpm2-cli falso: mismos argumentos que el de verdad (tools/omni/voxcpm2/voxcpm2_cli.cpp)."""

    def setUp(self):
        self.dir = TMP / f"liviana-{time.time_ns()}"
        (self.dir / "modelos").mkdir(parents=True)
        for n, tam in (("VoxCPM2-BaseLM-Q8_0.gguf", 1800), ("VoxCPM2-Acoustic-F16.gguf", 1900)):
            with open(self.dir / "modelos" / n, "wb") as f:
                f.truncate(tam * 1024 * 1024)
        self.registro = self.dir / "llamadas.jsonl"
        cli = self.dir / "voxcpm2-cli"
        cli.write_text(f"""#!{PY}
import json, os, sys
sys.path.insert(0, {str(BASE)!r})
import comun
a, cfg, i = sys.argv[1:], {{"pos": []}}, 0
con_valor = {{"-t", "--text", "-o", "--output", "-r", "--reference", "--prompt-wav", "--prompt-text", "--steps",
              "--timesteps", "--cfg", "--temperature", "--seed", "--n-gpu-layers"}}
while i < len(a):
    if a[i] in ("--cpu", "--stream"):
        cfg[a[i]] = True; i += 1
    elif a[i] in con_valor:
        cfg[a[i]] = a[i + 1]; i += 2
    elif a[i].startswith("-"):
        sys.exit("opción desconocida " + a[i])
    else:
        cfg["pos"].append(a[i]); i += 1
open({str(self.registro)!r}, "a").write(json.dumps(cfg) + "\\n")
if os.environ.get("CLI_FALLA"):
    print("ggml: error de prueba", file=sys.stderr); sys.exit(1)
comun.guardar_wav(cfg["-o"], comun.murmullo(cfg["-t"], 48000, int(cfg["--seed"])), 48000)
""")
        cli.chmod(0o755)
        (self.dir / "config.json").write_text(json.dumps({"motor": "liviana", "liviana": {
            "cli": str(cli), "base_lm": str(self.dir / "modelos/VoxCPM2-BaseLM-Q8_0.gguf"),
            "acustico": str(self.dir / "modelos/VoxCPM2-Acoustic-F16.gguf"), "gpu": False}}))
        self.env = {**Comando.env, "VOZ_CONFIG": str(self.dir / "config.json")}

    def test_argumentos(self):
        pedido = self.dir / "pedido.json"
        pedido.write_text(json.dumps({"voz": "mi-voz", "carpeta": str(self.dir / "salida"), "normalizar": True,
                                      "frases": [{"id": "p1", "texto": "Hola."}, {"id": "p2", "texto": "Pack x100."}]}))
        r = subprocess.run([PY, str(BASE / "voz_videos.py"), "--pedido", str(pedido)], capture_output=True, text=True, env=self.env)
        d = json.loads(r.stdout)
        self.assertTrue(d["ok"], r.stderr)
        self.assertEqual((d["motor"], d["dispositivo"]), ("liviana", "cpu"))
        llamadas = [json.loads(l) for l in self.registro.read_text().splitlines()]
        self.assertEqual(len(llamadas), 2)
        c = llamadas[1]
        self.assertEqual(c["-t"], "Pack por cien.")
        self.assertEqual([Path(p).name for p in c["pos"]], ["VoxCPM2-BaseLM-Q8_0.gguf", "VoxCPM2-Acoustic-F16.gguf"])
        self.assertTrue(c["--cpu"])
        self.assertTrue(c["--prompt-wav"].endswith("mi-voz/referencia.wav"))
        self.assertTrue(c["--prompt-text"].startswith("Hola, ¿cómo estás?"))
        self.assertEqual((c["--timesteps"], c["--cfg"]), ("10", "2"))
        self.assertGreaterEqual(int(c["--steps"]), 40)
        self.assertEqual(c["--seed"], llamadas[0]["--seed"])
        self.assertFalse(list((self.dir / "salida").glob(".liviana-*")))

    def test_falla_y_faltantes(self):
        pedido = self.dir / "pedido.json"
        pedido.write_text(json.dumps({"voz": "mi-voz", "carpeta": str(self.dir / "salida"), "frases": [{"id": "p1", "texto": "Hola."}]}))
        r = subprocess.run([PY, str(BASE / "voz_videos.py"), "--pedido", str(pedido)], capture_output=True, text=True,
                           env={**self.env, "CLI_FALLA": "1"})
        self.assertEqual(r.returncode, 1)
        self.assertIn("error de prueba", json.loads(r.stdout)["error"])
        (self.dir / "modelos/VoxCPM2-Acoustic-F16.gguf").unlink()
        r = subprocess.run([PY, str(BASE / "voz_videos.py"), "--estado"], capture_output=True, text=True, env=self.env)
        self.assertEqual(r.returncode, 2)
        self.assertIn("Acoustic", json.loads(r.stdout)["error"])


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        import shutil
        shutil.rmtree(TMP, ignore_errors=True)
