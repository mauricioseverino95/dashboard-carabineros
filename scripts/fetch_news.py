#!/usr/bin/env python3
"""
Recolector de noticias para el Dashboard de Monitoreo de Medios.

Genera (en la carpeta data/):
  news.json  -> noticias de medios web, agregadores, redes y TV, deduplicadas
  tv.json    -> últimos videos publicados por los 5 canales (YouTube)
  live.json  -> ID del video en vivo actual de cada canal

Solo usa la biblioteca estándar de Python. Lo ejecuta GitHub Actions cada 15 min.
"""
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
MAX_ITEMS = 400
MAX_AGE_H = 72
NOW = dt.datetime.now(dt.timezone.utc)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Language": "es-CL,es;q=0.9",
        "Cookie": "CONSENT=YES+cb; SOCS=CAI"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def clean(text, limit=None):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:") + "…"
    return text


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc)


def local(tag):
    return tag.rsplit("}", 1)[-1]


def child(node, name):
    for c in node:
        if local(c.tag) == name:
            return c
    return None


def text_of(node, *names):
    for n in names:
        c = child(node, n)
        if c is not None and (c.text or "").strip():
            return c.text.strip()
    return ""


def parse_feed(raw):
    """Devuelve lista de dicts {title, link, summary, date, source} para RSS 2.0 o Atom."""
    root = ET.fromstring(raw)
    out = []
    entries = [e for e in root.iter() if local(e.tag) in ("item", "entry")]
    for e in entries:
        link = text_of(e, "link")
        if not link:
            for c in e:
                if local(c.tag) == "link" and c.get("href"):
                    if c.get("rel", "alternate") == "alternate":
                        link = c.get("href")
                        break
        src = child(e, "source")
        if src is None:
            src = child(e, "Source")  # Bing: <News:Source>
        out.append({
            "title": clean(text_of(e, "title")),
            "link": link,
            "summary": text_of(e, "description", "summary", "encoded", "content"),
            "date": parse_date(text_of(e, "pubDate", "published", "updated", "date")),
            "source": clean(src.text) if src is not None and src.text else "",
            "_node": e,
        })
    return out


def item_id(title):
    key = re.sub(r"[^a-z0-9]+", " ", norm(title)).strip()[:80]
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def matches(text, keywords):
    t = norm(text)
    return any(k in t for k in keywords)


# ---------------------------------------------------------------- canales
def load_channels():
    cfg = (ROOT / "config.js").read_text(encoding="utf-8")
    chans = []
    for m in re.finditer(r"\{[^{}]*?clave:\s*\"([^\"]+)\"[^{}]*?nombre:\s*\"([^\"]+)\"[^{}]*?youtube:\s*\"([^\"]+)\"", cfg, re.S):
        chans.append({"clave": m.group(1), "nombre": m.group(2), "youtube": m.group(3)})
    return chans


def youtube_feed(ch):
    url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + ch["youtube"]
    items = []
    for it in parse_feed(fetch(url)):
        node = it["_node"]
        vid = text_of(node, "videoId")
        desc = ""
        thumb = f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
        for g in node.iter():
            if local(g.tag) == "description" and g.text:
                desc = g.text
        items.append({
            "videoId": vid, "title": it["title"], "url": f"https://www.youtube.com/watch?v={vid}",
            "channel": ch["nombre"], "channelKey": ch["clave"],
            "published": it["date"].isoformat() if it["date"] else None,
            "thumb": thumb, "description": clean(desc, 260),
        })
    return items


PREFIERE = ["noticia", "en vivo", "24/7", "senal", "24 horas", "meganoticias", "chv", "t13", "teletrece"]
EVITA = ["react", "golf", "maraton", "especial", "mejor de", "non stop", "masterchef", "partido", "futbol"]


def _score(title):
    t = norm(title)
    return sum(2 for w in PREFIERE if w in t) - sum(5 for w in EVITA if w in t)


def resolve_live(ch):
    """Devuelve la lista de videos EN VIVO del canal, ordenada (el mejor primero)."""
    found = []
    try:
        page = fetch(f"https://www.youtube.com/channel/{ch['youtube']}/streams", timeout=25).decode("utf-8", "ignore")
        for m in re.finditer(r'"imageName":"LIVE"', page):
            after = page[m.start():m.start() + 12000]
            v = re.search(r'"videoId":"([\w-]{11})"', after)
            t = re.search(r'"title":\{"content":"([^"]{0,120})', after) or re.search(r'"accessibilityText":"([^"]{0,120})', after)
            if v and v.group(1) not in [x[0] for x in found]:
                found.append((v.group(1), t.group(1) if t else ""))
    except Exception as e:  # noqa: BLE001
        log("streams", ch["clave"], "error", e)
    if not found:
        try:
            page = fetch(f"https://www.youtube.com/channel/{ch['youtube']}/live", timeout=20).decode("utf-8", "ignore")
            m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', page)
            if m and '"isUpcoming":true' not in page:
                found.append((m.group(1), ""))
        except Exception as e:  # noqa: BLE001
            log("live", ch["clave"], "error", e)
    found.sort(key=lambda x: -_score(x[1]))
    log("en vivo", ch["clave"], found)
    return [v for v, _ in found]




# ---------------------------------------------------------------- mapa
LUG = json.loads((ROOT / "scripts" / "lugares.json").read_text(encoding="utf-8"))
_COORD = {}
for _n, _la, _lo, _r in LUG["comunas"]:
    _COORD[norm(_n)] = (_n, _la, _lo, _r)
_AMBIG = {norm(a) for a in LUG["ambiguas"]}
_PATTERNS = []
for key, val in list(_COORD.items()):
    _PATTERNS.append((key, val))
for a, target in LUG["alias"].items():
    t = _COORD.get(norm(target))
    if t:
        _PATTERNS.append((norm(a), t))
_PATTERNS.sort(key=lambda x: -len(x[0]))
_CTX = r"(?:\ben|\bde|\bdesde|\bhacia|comuna de|sector de|ciudad de|region de)\s+"

GRAVEDAD = [
    (4, "Violencia grave", ["homicidio", "asesin", "muert", "muere", "fallec", "balead", "balacera", "baleo", "disparo",
                            "tiroteo", "secuestr", "femicidio", "ataque armado", "emboscada", "acribill", "apunal",
                            "cadaver", "sin vida", "martir", "victima fatal", "fatal", "tragedia"]),
    (3, "Delito violento / emergencia", ["robo con violencia", "portonazo", "turbazo", "asalto", "encerrona", "incendio",
                                         "persecucion", "narco", "droga", "arma", "explosiv", "agresion", "agredid", "herido",
                                         "lesionad", "violencia", "amenaza", "atropell", "volcamiento", "derrumbe", "aluvion",
                                         "tsunami", "sismo", "terremoto", "evacuacion", "toma de", "detonacion"]),
    (2, "Procedimiento policial", ["detenid", "detien", "detuv", "aprehend", "detencion", "operativo", "allanamiento", "fiscalizacion", "control", "incaut",
                                   "decomis", "accidente", "choque", "colision", "desalojo", "manifestacion", "protesta",
                                   "barricada", "robo", "hurto", "estafa", "infraccion", "denuncia", "formalizad", "prision preventiva"]),
]
CATEGORIAS = [("Homicidio / armas", ["homicidio", "asesin", "balead", "balacera", "disparo", "tiroteo", "arma", "femicidio", "baleo"]),
              ("Robo / asalto", ["robo", "portonazo", "turbazo", "asalto", "encerrona", "hurto", "estafa"]),
              ("Drogas", ["droga", "narco", "cocaina", "marihuana", "pasta base"]),
              ("Incendio / emergencia", ["incendio", "sismo", "terremoto", "aluvion", "evacuacion", "temporal", "derrumbe", "tsunami"]),
              ("Accidente de tránsito", ["accidente", "choque", "colision", "atropell", "volcamiento"]),
              ("Protesta / orden público", ["protesta", "manifestacion", "barricada", "desorden", "toma de"]),
              ("Operativo policial", ["operativo", "detenid", "detien", "detuv", "allanamiento", "fiscalizacion", "control", "incaut", "decomis"])]


def gravedad(text):
    t = norm(text)
    for nivel, _, words in GRAVEDAD:
        if any(w in t for w in words):
            return nivel
    return 1


def categoria(text):
    t = norm(text)
    for nombre, words in CATEGORIAS:
        if any(w in t for w in words):
            return nombre
    return "Información general"


def ubicar(title, summary, source, region_hint=None):
    """Busca la comuna/región mencionada. Devuelve (lugar, lat, lon, precision) o None."""
    for texto, prec in ((title, "comuna"), (summary, "comuna"), (source, "fuente")):
        t = " " + norm(texto or "") + " "
        if len(t) < 4:
            continue
        mejor = None
        for key, val in _PATTERNS:
            if key in _AMBIG or len(key) <= 3:
                m = re.search(_CTX + re.escape(key) + r"\b", t)
            else:
                m = re.search(r"(?<![a-z0-9])" + re.escape(key) + r"(?![a-z0-9])", t)
            if m and (mejor is None or m.start() < mejor[0]):
                mejor = (m.start(), val)
        if mejor:
            n, la, lo, _ = mejor[1]
            return n, la, lo, prec
    if region_hint:
        v = _COORD.get(norm(region_hint))
        if v:
            return v[0], v[1], v[2], "region"
    return None


def _jitter(id_, lat, lon, prec):
    h = int(hashlib.md5(id_.encode()).hexdigest()[:8], 16)
    r = 0.004 if prec == "comuna" else 0.03
    return round(lat + ((h % 1000) / 1000 - .5) * r * 2, 5), round(lon + (((h // 1000) % 1000) / 1000 - .5) * r * 2, 5)


REGION_QUERIES = ["Arica", "Iquique", "Antofagasta", "Copiapó", "La Serena", "Valparaíso", "Santiago", "Rancagua", "Talca",
                  "Chillán", "Concepción", "Temuco", "Valdivia", "Puerto Montt", "Coyhaique", "Punta Arenas"]


def build_map(rss_results, news_items, keywords):
    """Arma data/mapa.json con todas las noticias de Chile ubicables."""
    pts = {}

    def put(title, summary, url, source, published, region_hint=None, carab=None):
        if not title or not url:
            return
        if published:
            try:
                if (NOW - dt.datetime.fromisoformat(published)).total_seconds() > 72 * 3600:
                    return
            except ValueError:
                pass
        iid = item_id(title)
        if iid in pts:
            return
        g = ubicar(title, summary, source, region_hint)
        if not g:
            return
        lugar, la, lo, prec = g
        la, lo = _jitter(iid, la, lo, prec)
        txt = title + " " + (summary or "")
        pts[iid] = {"id": iid, "title": title, "summary": (summary or "")[:220], "url": url, "source": source,
                    "published": published, "lat": la, "lon": lo, "lugar": lugar, "precision": prec,
                    "gravedad": gravedad(txt), "categoria": categoria(txt),
                    "carab": bool(carab if carab is not None else matches(txt, keywords))}

    for it in news_items:
        put(it["title"], it.get("summary"), it["url"], it.get("source"), it.get("published"), carab=True)
    for src, entries in rss_results:
        for e in entries:
            title, source = e["title"], e["source"] or src["nombre"]
            if src.get("agregador") and " - " in title:
                title, _, tail = title.rpartition(" - ")
                source = e["source"] or tail
            summary = clean(e["summary"], 280)
            if norm(summary).startswith(norm(title)[:40]):
                summary = ""
            put(title, summary, e["link"], source, e["date"].isoformat() if e["date"] else None,
                region_hint=src.get("region"))
    items = sorted(pts.values(), key=lambda x: x["published"] or "", reverse=True)[:700]
    try:
        old = json.loads((DATA / "mapa.json").read_text(encoding="utf-8")).get("items", [])
        ids = {i["id"] for i in items}
        for o in old:
            if o["id"] not in ids and o.get("published"):
                try:
                    if (NOW - dt.datetime.fromisoformat(o["published"])).total_seconds() <= 72 * 3600:
                        items.append(o)
                except ValueError:
                    pass
        items = sorted(items, key=lambda x: x["published"] or "", reverse=True)[:900]
    except (OSError, ValueError):
        pass
    write("mapa.json", {"updated": NOW.isoformat(), "items": items})
    log(f"mapa: {len(items)} puntos")

# ---------------------------------------------------------------- cámaras
CAM_BUSQUEDAS = ["santiago chile en vivo camara", "santiago de chile live cam", "camara en vivo santiago chile",
                 "costanera center en vivo", "santiago en vivo webcam", "providencia en vivo camara"]
CAM_INCLUYE = ["santiago", "costanera", "sanhattan", "providencia", "las condes", "vitacura", "nunoa",
               "maipu", "valle nevado", "farellones", "la florida", "puente alto", "cerro san cristobal"]
CAM_EXCLUYE = ["noticia", "teletrece", "t13", "meganoticias", "24 horas", "chv", "cnn", "musica para", "argentina"]


def _js_unescape(t):
    try:
        return json.loads('"' + t + '"')
    except ValueError:
        return t


def resolve_cams():
    found = {}
    for q in CAM_BUSQUEDAS:
        try:
            url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(q) + "&sp=EgJAAQ%253D%253D"
            page = fetch(url, timeout=25).decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            log("cams", q, "error", e)
            continue
        for m in re.finditer(r'"videoRenderer":\{"videoId":"([\w-]{11})"', page):
            chunk = page[m.start():m.start() + 6000]
            if not re.search(r'BADGE_STYLE_TYPE_LIVE_NOW|"style":"LIVE"', chunk):
                continue
            t = re.search(r'"title":\{"runs":\[\{"text":"([^"]{0,140})', chunk)
            c = re.search(r'"ownerText":\{"runs":\[\{"text":"([^"]{0,60})', chunk)
            title = t.group(1) if t else ""
            nt = norm(title + " " + (c.group(1) if c else ""))
            if not any(w in nt for w in CAM_INCLUYE) or any(w in nt for w in CAM_EXCLUYE):
                continue
            vid = m.group(1)
            if vid not in found:
                found[vid] = {"id": vid, "title": _js_unescape(title),
                              "channel": c.group(1) if c else "", "hits": 0}
            found[vid]["hits"] += 1
    items = sorted(found.values(), key=lambda x: -x["hits"])
    log("camaras:", [(i["id"], i["title"][:40]) for i in items])
    return items

# ---------------------------------------------------------------- vocerías y cuñas
# Búsquedas en YouTube de videos subidos HOY con declaraciones de Carabineros.
VOC_BUSQUEDAS = [
    "carabineros", "carabineros de chile", "carabineros noticias", "carabineros declaraciones",
    "carabineros vocería", "general director carabineros", "carabineros detenidos", "carabineros operativo",
]
VOC_TERMINOS = ["vocer", "punto de prensa", "conferencia", "declarac", "declara ", "cuna", "entrevista",
                "general ", "coronel", "teniente", "mayor ", "capitan", "comisario", "prefect", "jefe de zona",
                "director general", "subdirector", "jefe de", "explica", "entrega detalles", "entrego detalles",
                "informa", "balance", "dijo", "aseguro", "senalo", "afirmo", "habla", "palabras de"]


def _rel_a_fecha(txt):
    """'hace 5 h' / 'hace 3 horas' / '20 minutes ago' / 'Transmitido hace 2 d' -> datetime aproximado."""
    t = norm(txt or "")
    m = re.search(r"(\d+)\s*([a-z]+)", t.replace("hace", " "))
    if not m:
        return None
    n, u = int(m.group(1)), m.group(2)
    if u.startswith(("seg", "sec", "s")) and not u.startswith("sem"):
        seg = 1
    elif u.startswith("min") or u == "m":
        seg = 60
    elif u.startswith(("h", "hor")):
        seg = 3600
    elif u.startswith(("d", "dia", "day")):
        seg = 86400
    elif u.startswith(("sem", "w")):
        seg = 604800
    else:
        return None
    return NOW - dt.timedelta(seconds=n * seg)


def buscar_vocerias(keywords):
    found = {}
    for q in VOC_BUSQUEDAS:
        try:
            # sp=EgIIAg== : filtro "Hoy"
            url = ("https://www.youtube.com/results?search_query=" + urllib.parse.quote(q) +
                   "&sp=EgIIAg%3D%3D&hl=es-419&gl=CL")
            page = fetch(url, timeout=25).decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            log("vocerias", q, "error", e)
            continue
        for m in re.finditer(r'"videoRenderer":\{"videoId":"([\w-]{11})"', page):
            vid = m.group(1)
            chunk = page[m.start():m.start() + 7000]
            t = re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.){0,200})', chunk)
            c = re.search(r'"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.){0,80})', chunk)
            pt = re.search(r'"publishedTimeText":\{"simpleText":"([^"]{0,60})', chunk)
            d = re.search(r'"snippetText":\{"runs":\[(.{0,600}?)\]', chunk)
            title = _js_unescape(t.group(1)) if t else ""
            desc = ""
            if d:
                desc = _js_unescape(" ".join(re.findall(r'"text":"((?:[^"\\]|\\.)*)"', d.group(1))))
            if not title or not matches(title + " " + desc, keywords):
                continue
            fecha = _rel_a_fecha(pt.group(1) if pt else "")
            if vid not in found:
                found[vid] = {
                    "videoId": vid, "title": title, "url": f"https://www.youtube.com/watch?v={vid}",
                    "channel": _js_unescape(c.group(1)) if c else "", "channelKey": "yt",
                    "published": fecha.isoformat() if fecha else None,
                    "thumb": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                    "description": clean(desc, 260), "hits": 0,
                }
            found[vid]["hits"] += 1
    log("vocerias:", len(found))
    return list(found.values())


def clasificar_video(v, keywords):
    """prioridad: 3 = vocería/cuña de Carabineros, 2 = relacionado con Carabineros, 0 = otro."""
    txt = norm(v.get("title", "") + " " + v.get("description", ""))
    carab = matches(txt, keywords)
    voc = carab and any(w in txt for w in VOC_TERMINOS)
    v["relevant"] = carab
    v["voceria"] = voc
    v["prioridad"] = 3 if voc else 2 if carab else 0
    try:
        fecha = dt.datetime.fromisoformat(v["published"]) if v.get("published") else None
    except ValueError:
        fecha = None
    v["hoy"] = bool(fecha and (NOW - fecha) < dt.timedelta(hours=24))
    return v


# ---------------------------------------------------------------- principal
def main():
    DATA.mkdir(exist_ok=True)
    conf = json.loads((ROOT / "scripts" / "fuentes.json").read_text(encoding="utf-8"))
    keywords = [norm(k) for k in conf.get("palabras_clave", ["carabiner"])]
    channels = load_channels()
    log("canales:", [c["clave"] for c in channels])

    collected = {}

    def add(item):
        if not item["title"] or not item["url"]:
            return
        if item["published"]:
            age = NOW - dt.datetime.fromisoformat(item["published"])
            if age.total_seconds() > MAX_AGE_H * 3600:
                return
        prev = collected.get(item["id"])
        if prev is None:
            collected[item["id"]] = item
            return
        # Duplicado: conservar la primera fuente, completar el resumen y la fecha más antigua
        if len(item["summary"]) > len(prev["summary"]):
            prev["summary"] = item["summary"]
        dates = [d for d in (prev["published"], item["published"]) if d]
        prev["published"] = min(dates) if dates else None

    # --- RSS de medios / agregadores / redes
    def get_rss(src):
        try:
            return src, parse_feed(fetch(src["url"]))
        except Exception as e:  # noqa: BLE001
            log("RSS error", src["nombre"], e)
            return src, []

    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(get_rss, conf.get("rss", [])))
    # Fuentes extra solo para el mapa (todas las noticias de Chile, por región)
    extra = [{"nombre": "Google Noticias", "tipo": "web", "agregador": True, "region": r,
              "url": "https://news.google.com/rss/search?q=" + urllib.parse.quote('"' + r + '" when:1d') + "&hl=es-419&gl=CL&ceid=CL:es-419"}
             for r in REGION_QUERIES]
    extra += [{"nombre": "Google Noticias", "tipo": "web", "agregador": True,
               "url": "https://news.google.com/rss/search?q=" + urllib.parse.quote(q) + "&hl=es-419&gl=CL&ceid=CL:es-419"}
              for q in ["Chile policial when:1d", "PDI OR fiscalía Chile when:1d", "incendio OR accidente Chile when:1d", "Chile noticias when:1d"]]
    with ThreadPoolExecutor(8) as ex:
        map_results = list(ex.map(get_rss, extra))

    for src, entries in results:
        n = 0
        for e in entries:
            title, source = e["title"], e["source"] or src["nombre"]
            if src.get("agregador"):
                # Google News: "Título - Medio"
                if " - " in title and (not e["source"] or title.endswith(" - " + e["source"])):
                    title, _, tail = title.rpartition(" - ")
                    source = e["source"] or tail
            summary = clean(e["summary"], 280)
            if norm(summary).startswith(norm(title)[:40]):
                summary = ""
            if src.get("filtrar") and not matches(title + " " + summary, keywords):
                continue
            add({
                "id": item_id(title), "title": title, "summary": summary, "url": e["link"],
                "source": source, "kind": src.get("tipo", "web"),
                "published": e["date"].isoformat() if e["date"] else None,
            })
            n += 1
        log(f"{src['nombre']}: {n}")

    # --- YouTube de los canales
    tv = []
    with ThreadPoolExecutor(5) as ex:
        for ch, res in zip(channels, ex.map(lambda c: _safe(youtube_feed, c), channels)):
            tv.extend(res)
            log(f"YouTube {ch['clave']}: {len(res)}")
    for v in tv:
        v["relevant"] = matches(v["title"] + " " + v["description"], keywords)
        if v["relevant"]:
            add({
                "id": item_id(v["title"]), "title": v["title"], "summary": v["description"],
                "url": v["url"], "source": v["channel"], "kind": "tv", "published": v["published"],
            })
    # --- Vocerías y cuñas de Carabineros subidas hoy a YouTube (búsqueda cada ~5 min)
    voc_cache = DATA / "vocerias.json"
    if _edad_min("vocerias.json") >= 4.5 or os.environ.get("FORZAR_VIVO"):
        voc = _safe(buscar_vocerias, keywords)
        try:
            prev_voc = json.loads(voc_cache.read_text(encoding="utf-8")).get("items", [])
        except (OSError, ValueError):
            prev_voc = []
        vistos = {v["videoId"] for v in voc}
        for v in prev_voc:                           # conservar las de hoy ya encontradas
            if v["videoId"] not in vistos and v.get("published") and \
                    NOW - dt.datetime.fromisoformat(v["published"]) < dt.timedelta(hours=30):
                voc.append(v)
        write("vocerias.json", {"updated": NOW.isoformat(), "items": voc[:150]})
    else:
        try:
            voc = json.loads(voc_cache.read_text(encoding="utf-8")).get("items", [])
        except (OSError, ValueError):
            voc = []
    for v in voc:
        if v.get("published"):
            add({"id": item_id(v["title"]), "title": v["title"], "summary": v.get("description", ""),
                 "url": v["url"], "source": v["channel"] or "YouTube", "kind": "tv", "published": v["published"]})
    ids_tv = {v["videoId"] for v in tv}
    tv.extend(v for v in voc if v["videoId"] not in ids_tv)
    for v in tv:
        clasificar_video(v, keywords)
    tv.sort(key=lambda v: v["published"] or "", reverse=True)
    tv.sort(key=lambda v: (v["hoy"] and v["prioridad"]), reverse=True)   # estable: hoy+prioridad, luego fecha

    # --- Mantener historial anterior (para no perder notas que salen del RSS)
    try:
        old = json.loads((DATA / "news.json").read_text(encoding="utf-8")).get("items", [])
        for it in old:
            if it["id"] not in collected:
                add(it)
    except (OSError, ValueError, KeyError):
        pass

    items = sorted(collected.values(), key=lambda x: x["published"] or "", reverse=True)[:MAX_ITEMS]
    write("news.json", {"updated": NOW.isoformat(), "items": items})
    try:
        build_map(results + map_results, items, keywords)
    except Exception as e:  # noqa: BLE001
        log("mapa error", e)
    write("tv.json", {"updated": NOW.isoformat(), "items": tv[:180]})

    # --- Señales en vivo: cada ~1 hora (si una se cae, el dashboard cambia solo a la de respaldo)
    if _edad_min("live.json") >= 59 or os.environ.get("FORZAR_VIVO"):
        with ThreadPoolExecutor(5) as ex:
            lives = list(ex.map(resolve_live, channels))
        try:
            prev = json.loads((DATA / "live.json").read_text(encoding="utf-8")).get("channels", {})
        except (OSError, ValueError):
            prev = {}
        live = {}
        for c, vids in zip(channels, lives):
            if vids:
                live[c["clave"]] = {"videoId": vids[0], "alts": vids[1:5]}
            else:  # si ahora no se pudo detectar, conservar lo último conocido
                live[c["clave"]] = prev.get(c["clave"]) or {"videoId": None, "alts": []}
        log("en vivo:", {k: v["videoId"] for k, v in live.items()})
        write("live.json", {"updated": NOW.isoformat(), "channels": live})
    else:
        log("señales en vivo sin cambios (se revisan cada hora)")

    # --- Cámaras de Santiago: cada ~10 minutos
    if _edad_min("camaras.json") >= 9 or os.environ.get("FORZAR_VIVO"):
        cams = resolve_cams()
        if not cams:
            try:
                cams = json.loads((DATA / "camaras.json").read_text(encoding="utf-8")).get("items", [])
            except (OSError, ValueError):
                cams = []
        write("camaras.json", {"updated": NOW.isoformat(), "items": cams[:12]})
        log(f"camaras: {len(cams)}")
    log(f"OK: {len(items)} noticias, {len(tv)} videos TV")


def _edad_min(name):
    try:
        u = json.loads((DATA / name).read_text(encoding="utf-8"))["updated"]
        return (NOW - dt.datetime.fromisoformat(u)).total_seconds() / 60
    except (OSError, ValueError, KeyError, TypeError):
        return 999


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception as e:  # noqa: BLE001
        log("error", fn.__name__, a[0].get("clave") if a else "", e)
        return []


def write(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
