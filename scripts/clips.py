#!/usr/bin/env python3
"""
Genera clips comprimidos (MP4 480p, ideal para WhatsApp) de las notas de TV
sobre Carabineros y los publica como archivos descargables en GitHub Releases.

Uso:
  python scripts/clips.py                 # procesa automáticamente notas relevantes
  python scripts/clips.py URL [URL ...]   # procesa enlaces específicos (YouTube u otros)

Requiere: yt-dlp, ffmpeg y la CLI de GitHub (gh) — disponibles en GitHub Actions.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TAG = "clips"
MAX_POR_EJECUCION = 6
MAX_CLIPS = 60                # clips que se mantienen publicados
MAX_DUR_AUTO = 20 * 60        # 20 min para clips automáticos
MAX_DUR_MANUAL = 90 * 60      # 90 min para solicitudes manuales
OBJETIVO_MB = 15              # tamaño objetivo por clip
MAX_INTENTOS = 3
NOW = dt.datetime.now(dt.timezone.utc)
REPO = os.environ.get("GITHUB_REPOSITORY", "")
REQ_ID = os.environ.get("REQ_ID", "").strip()


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def run(cmd, check=True, **kw):
    log("$", " ".join(str(c) for c in cmd)[:300])
    return subprocess.run(cmd, check=check, text=True, capture_output=True, **kw)


def slug(s, n=50):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:n].strip("-") or "clip"


def load(name, default):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def ensure_release():
    if run(["gh", "release", "view", TAG], check=False).returncode != 0:
        run(["gh", "release", "create", TAG, "--title", "Clips para WhatsApp",
             "--notes", "Clips comprimidos generados automáticamente por el dashboard.", "--latest=false"])


def ytdlp_args(tmp):
    args = ["yt-dlp", "--no-playlist", "--no-progress", "--restrict-filenames",
            "-f", "bv*[height<=480]+ba/b[height<=480]/bv*+ba/b",
            "--merge-output-format", "mp4", "--write-info-json",
            "-o", str(Path(tmp) / "in.%(ext)s")]
    cookies = os.environ.get("YT_COOKIES", "").strip()
    if cookies:
        cf = Path(tmp) / "cookies.txt"
        cf.write_text(cookies, encoding="utf-8")
        args += ["--cookies", str(cf)]
    return args


def process(url, meta, max_dur):
    with tempfile.TemporaryDirectory() as tmp:
        r = run(ytdlp_args(tmp) + ["--match-filter", f"duration <= {max_dur} & !is_live", url], check=False)
        files = [p for p in Path(tmp).glob("in.*") if p.suffix not in (".json", ".part") and p.name != "cookies.txt"]
        if r.returncode != 0 or not files:
            raise RuntimeError((r.stderr or r.stdout or "descarga fallida")[-400:])
        info = {}
        infos = list(Path(tmp).glob("*.info.json"))
        if infos:
            info = json.loads(infos[0].read_text(encoding="utf-8"))
        duration = float(info.get("duration") or 0)
        if not duration:
            p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(files[0])])
            duration = float(p.stdout.strip() or 60)

        # Bitrate para quedar cerca del tamaño objetivo (WhatsApp-friendly)
        total_kbps = OBJETIVO_MB * 8192 / max(duration, 1)
        v_kbps = int(max(220, min(900, total_kbps - 64)))
        title = meta.get("title") or info.get("title") or "Clip"
        channel = meta.get("channel") or info.get("channel") or info.get("uploader") or ""
        published = meta.get("published") or NOW.isoformat()
        stamp = dt.datetime.fromisoformat(published).astimezone(dt.timezone(dt.timedelta(hours=-3))).strftime("%Y%m%d-%H%M")
        name = f"{stamp}_{slug(channel, 12)}_{slug(title)}.mp4"
        out = Path(tmp) / name
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(files[0]),
             "-vf", "scale=-2:'min(480,ih)':flags=bicubic,format=yuv420p",
             "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main",
             "-b:v", f"{v_kbps}k", "-maxrate", f"{int(v_kbps * 1.4)}k", "-bufsize", f"{v_kbps * 2}k",
             "-c:a", "aac", "-b:a", "64k", "-ac", "2", "-ar", "44100",
             "-movflags", "+faststart", str(out)])
        run(["gh", "release", "upload", TAG, str(out), "--clobber"])
        vid = meta.get("videoId") or info.get("id") or slug(url, 20)
        return {
            "videoId": vid, "title": title, "channel": channel, "published": published,
            "duration": round(duration), "size": out.stat().st_size, "file": name,
            "download_url": f"https://github.com/{REPO}/releases/download/{TAG}/{name}",
            "thumb": meta.get("thumb") or info.get("thumbnail") or "",
            "source_url": url, "created": NOW.isoformat(), "request_id": REQ_ID if meta.get("manual") else "",
        }


def main():
    DATA.mkdir(exist_ok=True)
    clips = load("clips.json", {"items": [], "failed": {}})
    clips.setdefault("items", []); clips.setdefault("failed", {})
    done = {c["videoId"] for c in clips["items"]} | {c.get("source_url") for c in clips["items"]}

    queue = []
    manual = [u for a in sys.argv[1:] for u in re.split(r"[\s,]+", a) if u.startswith("http")]
    tv = {v["url"]: v for v in load("tv.json", {"items": []})["items"]}
    for u in manual:
        m = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([\w-]{11})", u)
        meta = dict(next((v for v in tv.values() if m and v["videoId"] == m.group(1)), {}))
        meta["manual"] = True
        queue.append((u, meta, MAX_DUR_MANUAL))
    if not manual:
        for v in tv.values():
            if not v.get("relevant") or v["videoId"] in done:
                continue
            if clips["failed"].get(v["videoId"], 0) >= MAX_INTENTOS:
                continue
            if v.get("published") and (NOW - dt.datetime.fromisoformat(v["published"])).days >= 2:
                continue
            queue.append((v["url"], v, MAX_DUR_AUTO))
    queue = queue[:MAX_POR_EJECUCION]
    log(f"En cola: {len(queue)}")
    if not queue:
        return

    ensure_release()
    for url, meta, max_dur in queue:
        try:
            item = process(url, meta, max_dur)
            clips["items"] = [c for c in clips["items"] if c["file"] != item["file"]]
            clips["items"].insert(0, item)
            log("OK", item["file"], round(item["size"] / 1048576, 1), "MB")
        except Exception as e:  # noqa: BLE001
            key = meta.get("videoId") or url
            clips["failed"][key] = clips["failed"].get(key, 0) + 1
            msg = str(e)[-300:]
            log("ERROR", url, msg)
            if meta.get("manual") and REQ_ID:
                clips.setdefault("errors", {})[REQ_ID] = ("YouTube bloqueó la descarga (requiere cookies)" if ("cookies" in msg or "Sign in" in msg) else msg[-160:])
        save("clips.json", clips | {"updated": NOW.isoformat()})

    # Limpiar clips antiguos
    clips["items"].sort(key=lambda c: c.get("created") or c.get("published") or "", reverse=True)
    for old in clips["items"][MAX_CLIPS:]:
        run(["gh", "release", "delete-asset", TAG, old["file"], "-y"], check=False)
    clips["items"] = clips["items"][:MAX_CLIPS]
    clips["failed"] = dict(list(clips["failed"].items())[-300:])
    save("clips.json", clips | {"updated": NOW.isoformat()})


if __name__ == "__main__":
    main()
