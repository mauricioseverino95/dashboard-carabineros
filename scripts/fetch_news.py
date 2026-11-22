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
import re
import sys
import unicodedata
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


def resolve_live(ch):
    """Intenta obtener el videoId de la transmisión en vivo actual del canal."""
    try:
        page = fetch(f"https://www.youtube.com/channel/{ch['youtube']}/live", timeout=20).decode("utf-8", "ignore")
    except Exception as e:  # noqa: BLE001
        log("live", ch["clave"], "error", e)
        return None
    m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', page)
    if m and ('"isLiveNow":true' in page or '"isLive":true' in page or "hlsManifestUrl" in page):
        return m.group(1)
    return None


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
    tv.sort(key=lambda v: v["published"] or "", reverse=True)

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
    write("tv.json", {"updated": NOW.isoformat(), "items": tv[:120]})

    # --- Señales en vivo
    with ThreadPoolExecutor(5) as ex:
        lives = list(ex.map(resolve_live, channels))
    live = {c["clave"]: {"videoId": v} for c, v in zip(channels, lives)}
    log("en vivo:", {k: v["videoId"] for k, v in live.items()})
    write("live.json", {"updated": NOW.isoformat(), "channels": live})
    log(f"OK: {len(items)} noticias, {len(tv)} videos TV")


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
