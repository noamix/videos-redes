"""
Preparación de texto en castellano (Argentina) para síntesis de voz.

- normalizar(): pasa a palabras números, precios, porcentajes, medidas
  (30x40 cm, 50 micrones), horas, fechas, ordinales y abreviaturas comunes,
  para que el modelo los lea como lo diría una persona.
- dividir(): parte textos largos en tramos cortos (no lo usan los videos: cada
  frase ya es corta).
- pronunciacion.txt (junto a este archivo, o donde diga PRONUNCIACION): una línea
  por palabra, «palabra = cómo se dice», sin distinguir mayúsculas. normalizar()
  la aplica primero, sobre las palabras tal como están escritas.
"""
from __future__ import annotations

import os
import re
import unicodedata
from pathlib import Path

try:
    from num2words import num2words as _n2w
except ImportError:  # sin num2words se deja el texto como está
    _n2w = None

DISPONIBLE = _n2w is not None

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
DIGITOS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"]

# Palabras que no son sustantivos: delante de ellas el número se lee "suelto" ("uno de cada tres").
PALABRAS_FUNCION = {
    "y", "e", "o", "u", "ni", "de", "del", "a", "al", "en", "con", "sin", "por", "para", "que",
    "qué", "es", "son", "era", "eran", "fue", "fueron", "será", "serán", "sea", "más", "menos",
    "entre", "hasta", "desde", "cada", "como", "cómo", "pero", "se", "lo", "la", "las", "el",
    "los", "le", "les", "un", "una", "unos", "unas", "mi", "mis", "tu", "tus", "su", "sus", "me",
    "te", "nos", "vs", "x", "hay", "sobre", "según", "tras", "ante", "bajo", "contra", "hacia",
    "mediante", "durante", "aproximadamente", "también", "solo", "sólo", "ya", "no", "si", "sí",
    "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "aquí", "acá", "allá", "ahí",
    "veces_",  # marcador interno, no se usa
}
FEMENINOS = {
    "mano", "manos", "foto", "fotos", "moto", "motos", "radio", "imagen", "imágenes", "vez",
    "veces", "luz", "luces", "red", "redes", "flor", "flores", "piel", "sal", "miel", "nariz",
    "voz", "voces", "noche", "noches", "tarde", "tardes", "clase", "clases", "parte", "partes",
    "gente", "llave", "llaves", "carne", "leche", "fuente", "fuentes", "frase", "frases", "base",
    "bases", "calle", "calles", "suerte", "muerte", "sede", "sedes", "serie", "series",
    "superficie", "superficies", "torre", "torres", "nube", "nubes", "fe", "mitad", "ley", "leyes",
    "cárcel", "señal", "señales", "orden", "órdenes", "vocal", "vocales",
}
MASCULINOS = {
    "día", "días", "mapa", "mapas", "problema", "problemas", "sistema", "sistemas", "programa",
    "programas", "tema", "temas", "clima", "climas", "idioma", "idiomas", "planeta", "planetas",
    "sofá", "sofás", "drama", "dramas", "poema", "poemas", "esquema", "esquemas", "diploma",
    "diplomas", "dilema", "dilemas", "aroma", "aromas", "fantasma", "fantasmas", "panorama",
    "diagrama", "diagramas", "síntoma", "síntomas", "tranvía", "tranvías", "pijama", "pijamas",
    "cometa", "cometas", "telegrama", "telegramas", "lema", "lemas",
}

# unidad -> (singular, plural, género)
UNIDADES = {
    "km/h": ("kilómetro por hora", "kilómetros por hora", "m"),
    "cm": ("centímetro", "centímetros", "m"), "cms": ("centímetro", "centímetros", "m"),
    "mm": ("milímetro", "milímetros", "m"),
    "m": ("metro", "metros", "m"), "mts": ("metro", "metros", "m"), "mt": ("metro", "metros", "m"),
    "km": ("kilómetro", "kilómetros", "m"), "kms": ("kilómetro", "kilómetros", "m"),
    "m2": ("metro cuadrado", "metros cuadrados", "m"), "m²": ("metro cuadrado", "metros cuadrados", "m"),
    "m3": ("metro cúbico", "metros cúbicos", "m"), "m³": ("metro cúbico", "metros cúbicos", "m"),
    "kg": ("kilo", "kilos", "m"), "kgs": ("kilo", "kilos", "m"),
    "g": ("gramo", "gramos", "m"), "gr": ("gramo", "gramos", "m"), "grs": ("gramo", "gramos", "m"),
    "mg": ("miligramo", "miligramos", "m"),
    "ml": ("mililitro", "mililitros", "m"), "cc": ("centímetro cúbico", "centímetros cúbicos", "m"),
    "l": ("litro", "litros", "m"), "lt": ("litro", "litros", "m"), "lts": ("litro", "litros", "m"),
    "µm": ("micrón", "micrones", "m"), "µ": ("micrón", "micrones", "m"), "mic": ("micrón", "micrones", "m"),
    "micras": ("micrón", "micrones", "m"), "μm": ("micrón", "micrones", "m"), "μ": ("micrón", "micrones", "m"),
    "hs": ("hora", "horas", "f"), "h": ("hora", "horas", "f"), "hrs": ("hora", "horas", "f"),
    "min": ("minuto", "minutos", "m"), "seg": ("segundo", "segundos", "m"),
    "unid": ("unidad", "unidades", "f"), "unids": ("unidad", "unidades", "f"),
    "°c": ("grado", "grados", "m"),
}
# Orden: las unidades más largas primero para que "km/h" gane a "km" y "mm" a "m".
_UNIDADES_RE = "|".join(re.escape(u) for u in sorted(UNIDADES, key=len, reverse=True))

ABREVIATURAS = [
    (r"\bc/u\b", "cada uno"),
    (r"\bc/(?=\s?\w)", "con "),
    (r"\bs/(?=\s?\w)", "sin "),
    (r"\bp/(?=\s?\w)", "para "),
    (r"\bSra\.", "señora"), (r"\bSr\.", "señor"), (r"\bSres\.", "señores"),
    (r"\bDra\.", "doctora"), (r"\bDr\.", "doctor"), (r"\bIng\.", "ingeniero"),
    (r"\bLic\.", "licenciado"), (r"\bProf\.", "profesor"), (r"\bGral\.", "general"),
    (r"\bAv\.", "avenida"), (r"\bAvda\.", "avenida"), (r"\bPje\.", "pasaje"),
    (r"\bB[º°]\s?", "barrio "), (r"\bN[º°]\s?", "número "), (r"\b[Nn]ro\.\s?", "número "),
    (r"\b[Nn]úm\.\s?", "número "), (r"\b[Tt]el\.?:?\s?(?=\d)", "teléfono "),
    (r"\b[Cc]el\.?:?\s?(?=\d)", "celular "), (r"\betc\.", "etcétera"),
    (r"\baprox\.", "aproximadamente"), (r"\bpág\.", "página"), (r"\bpags?\.", "página"),
    (r"(?:(?<=\s)|^)[xX](?=\s)", "por"),      # "venta x mayor" -> "venta por mayor"
    (r"(?:(?<=\s)|^)[xX](?=\d)", "por "),     # "pack x100" -> "pack por 100"
    (r"\s&\s", " y "),
    (r"\s\+\s", " más "),
]


# --------------------------------------------------------------------------- #
# Números
# --------------------------------------------------------------------------- #
def _cardinal(n: int) -> str:
    t = _n2w(n, lang="es")
    # num2words dice "veintiuno mil" o "treinta y uno millones": va con apócope
    t = re.sub(r"\bveintiuno (mil|millones)\b", r"veintiún \1", t)
    t = re.sub(r"\buno (mil|millones|millón)\b", r"un \1", t)
    return t


def numero(n: int, genero: str | None = None) -> str:
    """Número en palabras.

    genero=None: suelto ("uno", "veintiuno").
    genero="m":  delante de sustantivo masculino ("un kilo", "veintiún pesos").
    genero="f":  delante de sustantivo femenino ("una caja", "quinientas cajas").
    """
    palabras = _cardinal(n).split()
    if genero is None:
        return " ".join(palabras)
    # El género concuerda con lo que viene después del último "millón/millones"
    # ("doscientos millones de cajas", pero "doscientas mil cajas").
    corte = 0
    for i, p in enumerate(palabras):
        if p in ("millón", "millones", "billón", "billones"):
            corte = i + 1
    for i in range(corte, len(palabras)):
        p = palabras[i]
        if genero == "f":
            if p == "uno":
                palabras[i] = "una"
            elif p == "veintiuno":
                palabras[i] = "veintiuna"
            elif p.endswith("ientos"):
                palabras[i] = p[:-2] + "as"
        elif i == len(palabras) - 1:
            if p == "uno":
                palabras[i] = "un"
            elif p == "veintiuno":
                palabras[i] = "veintiún"
    return " ".join(palabras)


def _con_de(palabras: str) -> str:
    """'un millón' + sustantivo lleva 'de': 'un millón de pesos'."""
    return palabras + " de" if palabras.split()[-1] in ("millón", "millones", "billón", "billones") else palabras


def _digitos(s: str) -> str:
    return " ".join(DIGITOS[int(c)] for c in s if c.isdigit())


def _decimales(dec: str) -> str:
    if dec.startswith("0") or len(dec) > 3:
        return _digitos(dec)
    return numero(int(dec))


def _parse(s: str):
    """'12.500' -> (12500, None); '2,5' -> (2, '5'); '1.250,50' -> (1250, '50')."""
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", s):
        ent, _, dec = s.partition(",")
        return int(ent.replace(".", "")), (dec or None)
    if re.fullmatch(r"\d+,\d+", s):
        ent, dec = s.split(",")
        return int(ent), dec
    if re.fullmatch(r"\d+\.\d+", s):
        ent, dec = s.split(".")
        return int(ent), dec
    if s.isdigit():
        return int(s), None
    return None


def _num_a_palabras(s: str, genero: str | None = None) -> str:
    p = _parse(s)
    if p is None:  # p. ej. una IP: 192.168.0.1
        return " punto ".join(numero(int(x)) for x in re.findall(r"\d+", s))
    ent, dec = p
    if dec is not None:
        return numero(ent) + " coma " + _decimales(dec)
    return numero(ent, genero)


def genero_de(palabra: str | None) -> str | None:
    if not palabra:
        return None
    p = palabra.lower().strip(".,;:!?¡¿()\"'«»")
    if not p or not p[0].isalpha() or p in PALABRAS_FUNCION:
        return None
    if p in FEMENINOS:
        return "f"
    if p in MASCULINOS:
        return "m"
    if p.endswith(("a", "as", "ión", "iones", "dad", "dades", "tud", "tudes", "umbre", "umbres")):
        return "f"
    return "m"


_PALABRA_SIGUIENTE = re.compile(r"\s*([^\W\d_][\w/]*)")


def _siguiente(texto: str, pos: int) -> str | None:
    m = _PALABRA_SIGUIENTE.match(texto, pos)
    return m.group(1) if m else None


# Fragmento numérico: "12.500", "2,5", "1.5", "300"
_NUM = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\.\d{1,2}(?!\d)|\d+(?:,\d+)?"


# --------------------------------------------------------------------------- #
# Pasos de la normalización
# --------------------------------------------------------------------------- #
def _limpiar_simbolos(t: str) -> str:
    t = unicodedata.normalize("NFC", t)
    t = t.replace("‍", "").replace("️", "")
    t = "".join(c for c in t if c == "°" or unicodedata.category(c) not in ("So", "Cs", "Co"))
    t = t.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    t = re.sub(r"[*_#`~]+", "", t)          # markdown y hashtags
    t = re.sub(r"\s[–—]\s", ", ", t)          # guion largo como pausa
    t = re.sub(r"(?m)^[ \t]*[-–—•·▪►][ \t]*", "", t)  # viñetas al principio de línea
    return t


def _urls_y_mails(t: str) -> str:
    def mail(m):
        usuario, dominio = m.group(1), m.group(2)
        return usuario + " arroba " + dominio.replace(".", " punto ")
    t = re.sub(r"\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b", mail, t)

    def url(m):
        d = re.sub(r"^(https?://)?(www\.)?", "", m.group(0), flags=re.I)
        d = d.split("/")[0]
        return d.replace(".", " punto ")
    return re.sub(r"\b(?:https?://)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|gob|gov|edu|io|ai|app|shop|store|info|ar)(?:\.[a-z]{2})?\b(?:/\S*)?",
                  url, t, flags=re.I)


def _abreviaturas(t: str) -> str:
    for patron, reemplazo in ABREVIATURAS:
        t = re.sub(patron, reemplazo, t)
    return t


def _fracciones(t: str) -> str:
    def f(m):
        frac = m.group(1)
        sig = genero_de(_siguiente(m.string, m.end()))
        if frac == "1/2":
            return "medio" if sig == "m" else ("media" if sig == "f" else "un medio")
        return {"1/4": "un cuarto", "3/4": "tres cuartos", "1/3": "un tercio", "2/3": "dos tercios"}[frac] + (" de" if sig else "")
    t = re.sub(r"(?<![\d/])24/7(?![\d/])", "veinticuatro siete", t)
    return re.sub(r"(?<![\d/])(1/2|1/4|3/4|1/3|2/3)(?![\d/])", f, t)


def _fechas(t: str) -> str:
    def f(m):
        d, mes, anio = int(m.group(1)), int(m.group(2)), m.group(3)
        s = ("primero" if d == 1 else numero(d)) + " de " + MESES[mes - 1]
        if anio:
            a = int(anio)
            if len(anio) == 2:
                a += 2000
            s += " de " + numero(a)
        return s
    return re.sub(r"(?<![\d/])(0?[1-9]|[12]\d|3[01])/(0?[1-9]|1[0-2])(?:/(\d{4}|\d{2}))?(?![\d/])", f, t)


def _horas(t: str) -> str:
    def f(m):
        h, mi, suf = int(m.group(1)), int(m.group(2)), m.group(3)
        s = numero(h, "f") if h in (1, 21) else numero(h)
        if mi:
            s += " y " + numero(mi)
        if suf:
            s += " horas"
        return s
    return re.sub(r"(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?:\s?(hs\.?|hrs\.?|h\b|horas\b))?", f, t)


def _monedas(t: str) -> str:
    def f(m):
        sim, num, mult = m.group(1).upper().replace(" ", ""), m.group(2), m.group(3)
        sing, plur = ("dólar", "dólares") if ("US" in sim or "U$" in sim) else \
                     (("euro", "euros") if sim in ("€", "EUR") else ("peso", "pesos"))
        p = _parse(num)
        if p is None:
            return m.group(0)
        ent, dec = p
        if mult:  # "$1,5 millones", "$12 mil"
            base = (numero(ent) + " coma " + _decimales(dec)) if dec else numero(ent, "m")
            mult = "millones" if mult in ("M", "millón", "millones") and not (ent == 1 and not dec) else mult
            mult = "millón" if mult in ("M", "millones") and ent == 1 and not dec else mult
            return f"{base} {mult}" + (" de " if mult in ("millón", "millones") else " ") + plur
        centavos = int(dec.ljust(2, "0")[:2]) if dec else 0
        if ent == 0 and centavos:
            return numero(centavos, "m") + (" centavo" if centavos == 1 else " centavos")
        s = _con_de(numero(ent, "m")) + " " + (sing if ent == 1 else plur)
        if centavos:
            s += " con " + numero(centavos, "m") + (" centavo" if centavos == 1 else " centavos")
        return s
    return re.sub(r"(US\$|U\$S|u\$s|USD|US\s\$|\$|€|EUR)\s?(" + _NUM + r")(?:\s?(mil|millones|millón|M)\b)?", f, t)


def _porcentajes(t: str) -> str:
    t = re.sub(r"(" + _NUM + r")\s?%", lambda m: _num_a_palabras(m.group(1)) + " por ciento", t)
    return t.replace("%", " por ciento")


def _medidas(t: str) -> str:
    """30x40, 30 x 40 cm, 40x50x10."""
    def f(m):
        partes = [x for x in m.group(1, 2, 3) if x]
        s = " por ".join(_num_a_palabras(x) for x in partes)
        u = m.group(4)
        if u:
            s += " " + UNIDADES[u.lower()][1]
        return s
    return re.sub(r"(?<![\w.,])(" + _NUM + r")\s?[xX×]\s?(" + _NUM + r")(?:\s?[xX×]\s?(" + _NUM + r"))?"
                  r"(?:\s?(" + _UNIDADES_RE + r")(?![\w/]))?", f, t, flags=re.I)


def _ordinales(t: str) -> str:
    def grados(m):
        return _num_a_palabras(m.group(1)) + " grados"
    t = re.sub(r"(" + _NUM + r")\s?°\s?C\b", grados, t)

    def f(m):
        n, suf = int(m.group(1)), (m.group(2) or m.group(3)).lower()
        fem = suf in ("ª", "ra", "da", "ta", "va", "na", "ma", "a")
        o = _n2w(n, lang="es", to="ordinal")
        o = re.sub(r"décimo(?=[a-z])", "decimo", o)
        if fem:
            return " ".join(w[:-1] + "a" if w.endswith("o") else w for w in o.split())
        if genero_de(_siguiente(m.string, m.end())) == "m":
            o = re.sub(r"\b(prim|terc)ero$", r"\1er", o)
        return o
    return re.sub(r"(?<![\w.,])(\d{1,3})(?:\s?(°|º|ª)|(ro|ra|er|do|da|to|ta|mo|ma|vo|va|no|na))(?![\w])", f, t)


def _unidades(t: str) -> str:
    def f(m):
        num, u = m.group(1), m.group(2).lower()
        sing, plur, gen = UNIDADES[u]
        p = _parse(num)
        if p is None:
            return m.group(0)
        ent, dec = p
        if dec is None and ent == 1:
            return numero(1, gen) + " " + sing
        return _num_a_palabras(num, gen) + " " + plur
    return re.sub(r"(?<![\w.,])(" + _NUM + r")\s?(" + _UNIDADES_RE + r")(?![\w/²³])", f, t, flags=re.I)


def _unidades_u(t: str) -> str:
    """'100 u.' o '100u' son unidades; '7 u 8' no se toca."""
    def f(m):
        ent = int(m.group(1))
        return ("una unidad" if ent == 1 else numero(ent, "f") + " unidades") + (m.group(2) or "")
    t = re.sub(r"(?<![\w.,])(\d+)\s?u\.(\s|$)", f, t)
    return re.sub(r"(?<![\w.,])(\d+)u(?![\w])()", f, t)


def _digitos_largos(t: str) -> str:
    return re.sub(r"(?<![\w.,])\d{7,}(?![\w.,]\d)", lambda m: _digitos(m.group(0)), t)


def _numeros(t: str) -> str:
    def f(m):
        s = m.group(1)
        p = _parse(s)
        sig = _siguiente(m.string, m.end())
        if p is None or p[1] is not None:
            return _num_a_palabras(s)
        ent = p[0]
        if sig and sig.lower() in ("mil", "millón", "millones"):
            # "200 mil cajas": el género sale de la palabra después de "mil"
            despues = _siguiente(m.string, m.end() + len(re.match(r"\s*\S+", m.string[m.end():]).group(0)))
            gen = "m" if sig.lower() != "mil" else (genero_de(despues) or "m")
            return numero(ent, gen)
        gen = genero_de(sig)
        if gen:
            return _con_de(numero(ent, gen))
        return numero(ent)
    return re.sub(r"(?<![\w])(" + _NUM + r")(?![\w])", f, t)


# --------------------------------------------------------------------------- #
# Pronunciación: palabra = cómo se dice
# --------------------------------------------------------------------------- #
_PRON_CACHE: dict = {"clave": None, "re": None, "mapa": {}}


def ruta_pronunciacion() -> Path:
    return Path(os.environ.get("PRONUNCIACION") or Path(__file__).resolve().parent / "pronunciacion.txt").expanduser()


def leer_pronunciacion(ruta: Path | None = None) -> dict[str, str]:
    """{palabra en minúsculas: cómo se dice}. Ignora líneas vacías, comentarios (#) y líneas sin '='."""
    ruta = ruta or ruta_pronunciacion()
    mapa: dict[str, str] = {}
    try:
        lineas = ruta.read_text("utf-8-sig").splitlines()
    except (FileNotFoundError, IsADirectoryError, PermissionError, UnicodeDecodeError):
        return mapa
    for linea in lineas:
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        palabra, dicha = (x.strip() for x in linea.split("=", 1))
        if palabra and dicha:
            mapa[re.sub(r"\s+", " ", palabra).lower()] = dicha
    return mapa


def _pronunciacion() -> tuple[re.Pattern | None, dict[str, str]]:
    ruta = ruta_pronunciacion()
    try:
        info = ruta.stat()
        clave = (str(ruta), info.st_mtime_ns, info.st_size)
    except OSError:
        clave = (str(ruta), None, None)
    if clave != _PRON_CACHE["clave"]:   # se relee solo cuando el archivo cambia
        mapa = leer_pronunciacion(ruta)
        patron = None
        if mapa:
            # Las frases más largas primero ("papel madera" antes que "madera"); una sola pasada
            alternativas = "|".join(r"\s+".join(map(re.escape, p.split(" "))) for p in sorted(mapa, key=len, reverse=True))
            patron = re.compile(r"(?<!\w)(?:" + alternativas + r")(?!\w)", re.IGNORECASE)
        _PRON_CACHE.update(clave=clave, re=patron, mapa=mapa)
    return _PRON_CACHE["re"], _PRON_CACHE["mapa"]


def cantidad_pronunciacion() -> int:
    return len(_pronunciacion()[1])


def aplicar_pronunciacion(t: str) -> str:
    patron, mapa = _pronunciacion()
    if not patron:
        return t

    def f(m):
        dicha = mapa[re.sub(r"\s+", " ", m.group(0)).lower()]
        antes = m.string[:m.start()].rstrip()
        al_empezar_oracion = not antes or antes[-1] in ".!?¡¿:\n"
        return dicha[0].upper() + dicha[1:] if al_empezar_oracion and dicha[0].islower() else dicha
    return patron.sub(f, t)


def normalizar(texto: str) -> str:
    """Devuelve el texto listo para leer en voz alta."""
    if not texto:
        return texto
    t = _limpiar_simbolos(texto)
    t = aplicar_pronunciacion(t)
    t = _urls_y_mails(t)
    t = _abreviaturas(t)
    if DISPONIBLE:
        t = _fracciones(t)
        t = _fechas(t)
        t = _horas(t)
        t = _monedas(t)
        t = _porcentajes(t)
        t = _medidas(t)
        t = _ordinales(t)
        t = _unidades(t)
        t = _unidades_u(t)
        t = _digitos_largos(t)
        t = _numeros(t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" +([,.;:!?])", r"\1", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return "\n".join(linea.strip() for linea in t.split("\n")).strip()


# --------------------------------------------------------------------------- #
# División en tramos
# --------------------------------------------------------------------------- #
def _unir_lineas(parrafo: str) -> str:
    lineas = [re.sub(r"^[-–—•·*]\s*", "", l.strip()) for l in parrafo.splitlines()]
    lineas = [l for l in lineas if l]
    out = ""
    for l in lineas:
        if not out:
            out = l
        elif l[0].islower():
            out += " " + l
        else:
            if out[-1] not in ".!?…:;,":
                out += "."
            out += " " + l
    return out


def _partir_largo(oracion: str, maximo: int) -> list[str]:
    if len(oracion) <= maximo:
        return [oracion]
    piezas, actual = [], ""
    for p in re.split(r"(?<=[,;:])\s+", oracion):
        if len(p) > maximo:  # sin comas: se corta por palabras
            palabras, sub = p.split(), ""
            for w in palabras:
                if sub and len(sub) + 1 + len(w) > maximo:
                    piezas.append(sub)
                    sub = w
                else:
                    sub = (sub + " " + w).strip()
            p = sub
        if actual and len(actual) + 1 + len(p) > maximo:
            piezas.append(actual)
            actual = p
        else:
            actual = (actual + " " + p).strip()
    if actual:
        piezas.append(actual)
    return piezas


def dividir(texto: str, maximo: int = 300) -> list[tuple[str, str]]:
    """Lista de (tramo, pausa_despues) con pausa 'frase' o 'parrafo'."""
    maximo = max(80, int(maximo))
    tramos: list[tuple[str, str]] = []
    for parrafo in re.split(r"\n\s*\n", (texto or "").strip()):
        unido = _unir_lineas(parrafo)
        if not unido:
            continue
        grupo = ""
        for oracion in re.split(r"(?<=[.!?…])\s+", unido):
            for pedazo in _partir_largo(oracion.strip(), maximo):
                if not pedazo:
                    continue
                if not grupo:
                    grupo = pedazo
                elif len(grupo) + 1 + len(pedazo) <= maximo:
                    grupo += " " + pedazo
                else:
                    tramos.append((grupo, "frase"))
                    grupo = pedazo
        if grupo:
            tramos.append((grupo, "frase"))
        if tramos:
            tramos[-1] = (tramos[-1][0], "parrafo")
    return tramos
