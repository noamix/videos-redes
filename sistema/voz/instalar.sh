#!/usr/bin/env bash
# Instala la voz en off (VoxCPM2) del sistema de videos. No usa sudo: si falta algo del sistema, lo dice.
#   npm run voz-instalar                        → instala la que recomienda npm run voz-evaluar
#   npm run voz-instalar -- --motor liviana     → la liviana: VoxCPM2 en GGUF con llama.cpp-omni (se compila acá)
#   npm run voz-instalar -- --motor completa    → la completa: VoxCPM2 con PyTorch
#   npm run voz-instalar -- --forzar            → instala aunque el evaluador diga que no alcanza
# Baja unos 4 GB (liviana) o de 8 a 12 GB (completa) y tarda un rato. Si se corta, volvé a correrlo: sigue donde quedó.
# Todo queda dentro de sistema/voz (.venv, modelos y llama.cpp-omni). Para sacarla: npm run voz-desinstalar.
set -euo pipefail
VOZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SISTEMA="$(dirname "$VOZ")"
cd "$SISTEMA"

# llama.cpp-omni (MIT) en una versión fija: se compila solo el programa voxcpm2-cli.
LLAMA_REPO="https://github.com/tc-mb/llama.cpp-omni.git"
LLAMA_COMMIT="eefebf4e399a3cc99119cb097d6f4c9e8f329365"

MOTOR=""
FORZAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --motor) MOTOR="${2:-}"; shift 2 || shift ;;
    --motor=*) MOTOR="${1#*=}"; shift ;;
    --forzar) FORZAR=1; shift ;;
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "❌ No entiendo «$1». Opciones: --motor liviana | --motor completa | --forzar"; exit 2 ;;
  esac
done
case "$MOTOR" in ""|liviana|completa) ;; *) echo "❌ --motor tiene que ser liviana o completa"; exit 2 ;; esac

NODE="${npm_node_execpath:-$(command -v node || true)}"
paso() { echo; echo "▶ $*"; }

# ---------- 1. ¿La banca? ----------
paso "1/6 Reviso la compu"
EVAL="$(mktemp)"
trap 'rm -f "$EVAL"' EXIT
python3 "$VOZ/evaluar.py" --json ${MOTOR:+--motor "$MOTOR"} > "$EVAL"
eval "$(python3 - "$EVAL" <<'PY'
import json, shlex, sys
d = json.load(open(sys.argv[1]))
motor = d.get("recomendado") or ""
op = d.get("opciones", {}).get(motor, {}) if motor else {}
v = d.get("valores", {})
salida = {
    "APTO": "1" if d.get("apto") else "0",
    "MOTOR": motor,
    "VEREDICTO": d.get("veredicto", ""),
    "GPU": "1" if op.get("gpu") else "0",
    "FALTAN": " ".join(d.get("faltan", [])),
    "COMANDO_FALTAN": d.get("comando_faltan", ""),
    "MEMORIA": v.get("VOZ_MEMORIA_MIN_MB", ""),
    "TOPE": v.get("VOZ_TOPE_MEMORIA", ""),
    "TIEMPO": v.get("VOZ_TIMEOUT_MIN", ""),
    "HORARIO": v.get("VOZ_HORARIO", ""),
    "AVISOS": " · ".join(d.get("avisos", [])),
}
for k, x in salida.items():
    print(f"{k}={shlex.quote(str(x))}")
PY
)"
if [ "$APTO" != 1 ]; then
  echo "❌ $VEREDICTO"
  if [ "$FORZAR" != 1 ] || [ -z "$MOTOR" ]; then
    echo "   Los videos siguen saliendo igual, sin voz. Si igual querés probar: npm run voz-instalar -- --motor liviana --forzar"
    exit 1
  fi
  echo "   Sigo porque pediste --forzar."
else
  echo "✅ $VEREDICTO"
fi
[ -n "$AVISOS" ] && echo "⚠️  $AVISOS"
if [ -n "$FALTAN" ]; then
  echo "❌ Antes falta instalar esto del sistema. Pegalo en una terminal (te pide tu contraseña):"
  echo "   $COMANDO_FALTAN"
  echo "   Después volvé a correr npm run voz-instalar${MOTOR:+ -- --motor $MOTOR}."
  exit 3
fi
if [ -z "$NODE" ]; then
  echo "❌ No encuentro node: corré esto con npm run voz-instalar, desde la carpeta del sistema."
  exit 2
fi

# ---------- 2. Python de la voz ----------
paso "2/6 Preparo el Python de la voz (sistema/voz/.venv)"
if [ ! -x "$VOZ/.venv/bin/python" ]; then
  python3 -m venv "$VOZ/.venv"
fi
PY="$VOZ/.venv/bin/python"
"$PY" -m pip install -q --disable-pip-version-check --upgrade pip
if [ "$MOTOR" = liviana ]; then
  "$PY" -m pip install -q --disable-pip-version-check -r "$VOZ/requisitos-liviana.txt"
else
  if [ "$GPU" = 1 ]; then
    echo "   PyTorch para la placa NVIDIA (unos 3 GB)…"
    "$PY" -m pip install -q --disable-pip-version-check torch torchaudio
  else
    echo "   PyTorch para procesador…"
    "$PY" -m pip install -q --disable-pip-version-check torch torchaudio --index-url https://download.pytorch.org/whl/cpu
  fi
  echo "   VoxCPM y lo que usa (unos minutos)…"
  "$PY" -m pip install -q --disable-pip-version-check -r "$VOZ/requisitos-completa.txt"
fi
echo "   listo"

# ---------- 3. Programa (solo la liviana) ----------
GPU_LIVIANA=false
if [ "$MOTOR" = liviana ]; then
  paso "3/6 Compilo el programa de la voz liviana (llama.cpp-omni, voxcpm2-cli). Tarda de 5 a 20 minutos."
  SRC="$VOZ/llama.cpp-omni"
  CLI="$SRC/build/bin/voxcpm2-cli"
  CUDA=OFF
  if command -v nvidia-smi >/dev/null 2>&1 && { command -v nvcc >/dev/null 2>&1 || [ -x /usr/local/cuda/bin/nvcc ]; }; then
    CUDA=ON
  fi
  if [ -x "$CLI" ] && [ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null || true)" = "$LLAMA_COMMIT" ] && [ -f "$SRC/build/.cuda-$CUDA" ]; then
    echo "   ya estaba compilado"
  else
    if [ ! -d "$SRC/.git" ]; then
      mkdir -p "$SRC"
      git -C "$SRC" init -q
      git -C "$SRC" remote add origin "$LLAMA_REPO"
    fi
    echo "   Bajo el código fuente (versión ${LLAMA_COMMIT:0:7})…"
    git -C "$SRC" fetch -q --depth 1 origin "$LLAMA_COMMIT"
    git -C "$SRC" checkout -q --force FETCH_HEAD
    # Cada compilación en paralelo usa hasta unos 2 GB: con poca memoria, menos a la vez.
    MEM_GB=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1048576 ))
    HILOS=$(nproc)
    MAX=$(( MEM_GB / 2 )); [ "$MAX" -lt 1 ] && MAX=1
    [ "$HILOS" -gt "$MAX" ] && HILOS=$MAX
    compilar() {
      rm -rf "$SRC/build"
      cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_OPENSSL=OFF -DGGML_CUDA="$1" > "$VOZ/compilacion.log" 2>&1 &&
        cmake --build "$SRC/build" -j "$HILOS" --target voxcpm2-cli >> "$VOZ/compilacion.log" 2>&1
    }
    if [ "$CUDA" = ON ]; then
      echo "   Compilo con $HILOS proceso(s) a la vez, con la placa NVIDIA (CUDA)…"
    else
      echo "   Compilo con $HILOS proceso(s) a la vez…"
    fi
    if ! compilar "$CUDA"; then
      if [ "$CUDA" = ON ]; then
        echo "   Con CUDA no compiló: pruebo para procesador."
        CUDA=OFF
        compilar OFF || { echo "❌ No se pudo compilar. Las últimas líneas de voz/compilacion.log:"; tail -n 15 "$VOZ/compilacion.log"; exit 1; }
      else
        echo "❌ No se pudo compilar. Las últimas líneas de voz/compilacion.log:"
        tail -n 15 "$VOZ/compilacion.log"
        exit 1
      fi
    fi
    touch "$SRC/build/.cuda-$CUDA"
  fi
  if ! "$CLI" --help 2>&1 | grep -q VoxCPM2; then
    echo "❌ El programa compilado no responde ($CLI)."
    exit 1
  fi
  [ "$CUDA" = ON ] && GPU_LIVIANA=true
  echo "   listo: $CLI"
else
  paso "3/6 La completa no necesita compilar nada"
fi

# ---------- 4. Modelo ----------
paso "4/6 Bajo el modelo VoxCPM2"
"$PY" "$VOZ/descargar.py" "$MOTOR" --destino "$VOZ/modelos"

# ---------- 5. Configuración de la voz ----------
paso "5/6 Guardo la configuración (sistema/voz/config.json)"
"$PY" - "$MOTOR" "$GPU_LIVIANA" "$LLAMA_COMMIT" <<'PY'
import sys, time
sys.path.insert(0, "voz")
import comun
motor, gpu, commit = sys.argv[1], sys.argv[2] == "true", sys.argv[3]
datos = {"motor": motor, "pasos": 10, "apego": 2.0, "instalada": time.strftime("%Y-%m-%d %H:%M")}
if motor == "liviana":
    datos["liviana"] = {"cli": "llama.cpp-omni/build/bin/voxcpm2-cli", "base_lm": "modelos/VoxCPM2-BaseLM-Q8_0.gguf",
                        "acustico": "modelos/VoxCPM2-Acoustic-F16.gguf", "gpu": gpu, "llama_cpp_omni": commit}
else:
    datos["completa"] = {"modelo": "modelos/VoxCPM2", "dispositivo": "auto"}
comun.guardar_config(datos)
print("   listo")
PY

# ---------- 6. Conectar con el motor ----------
paso "6/6 Conecto la voz con el motor (.env)"
COMANDO="$PY $VOZ/voz_videos.py"
case "$VOZ" in *" "*) COMANDO="'$PY' '$VOZ/voz_videos.py'" ;; esac
"$NODE" motor/cargar-clave.mjs VOZ_COMANDO --valor "$COMANDO" >/dev/null
"$NODE" motor/cargar-clave.mjs VOZ_MODO --valor auto >/dev/null
"$NODE" motor/cargar-clave.mjs VOZ_MEMORIA_MIN_MB --valor "$MEMORIA" >/dev/null
"$NODE" motor/cargar-clave.mjs VOZ_TOPE_MEMORIA --valor "$TOPE" >/dev/null
"$NODE" motor/cargar-clave.mjs VOZ_TIMEOUT_MIN --valor "$TIEMPO" >/dev/null
if [ -n "$HORARIO" ]; then
  "$NODE" motor/cargar-clave.mjs VOZ_HORARIO --valor "$HORARIO" >/dev/null
else
  "$NODE" motor/cargar-clave.mjs VOZ_HORARIO --borrar >/dev/null
fi
echo "   VOZ_COMANDO cargado · memoria mínima $MEMORIA MB · tope $TOPE · horario: ${HORARIO:-a cualquier hora} (estimados: npm run voz-medir los ajusta)"
"$PY" "$VOZ/voz_videos.py" --estado --legible || true

echo
echo "✅ Voz instalada. Faltan 3 pasos:"
echo "   1. Grabá tu voz leyendo sistema/voz/texto-para-grabar.txt (unos 15 s, con el celular está bien) y cargala:"
echo "      npm run voz-preparar -- ruta/de/la/grabacion.m4a --es-mi-voz"
echo "   2. Medí cuánto tarda en esta compu (ajusta la memoria y el horario): npm run voz-medir"
echo "   3. Escuchala (npm run voz-probar), reiniciá el motor (systemctl --user restart videos-redes),"
echo "      corré npm run chequeo y, si usás n8n, npm run n8n para que también corra en el horario de la voz."
