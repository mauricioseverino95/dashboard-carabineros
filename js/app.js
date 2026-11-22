/* =========================================================
   Dashboard de Monitoreo de Medios — lógica principal
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.DASH_CONFIG || {};
  const TZ = "America/Santiago";
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
  };
  function toast(msg) {
    const t = el("div", { class: "toast", text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }
  async function getJSON(path) {
    const r = await fetch(path + (path.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }

  // Repo de GitHub (para "Solicitar descarga"): config o deducido de la URL de GitHub Pages
  function repoGithub() {
    if (CFG.repoGithub) return CFG.repoGithub;
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const user = h.split(".")[0];
      const seg = location.pathname.split("/").filter(Boolean)[0];
      return seg ? `${user}/${seg}` : `${user}/${h}`;
    }
    return "";
  }

  // ---------------- Textos de cabecera ----------------
  if (CFG.titulo) { $("#titulo").textContent = CFG.titulo; }
  if (CFG.subtitulo) { $("#subtitulo").textContent = CFG.subtitulo; }

  // ---------------- Reloj Santiago ----------------
  const fHora = new Intl.DateTimeFormat("es-CL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const fFecha = new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  function tick() {
    const now = new Date();
    $("#hora").textContent = fHora.format(now);
    $("#fecha").textContent = fFecha.format(now) + " · Santiago";
  }
  tick(); setInterval(tick, 1000);

  const fRel = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const fCorta = new Intl.DateTimeFormat("es-CL", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  function hace(iso) {
    if (!iso) return "";
    const d = new Date(iso), s = (d - Date.now()) / 1000;
    if (isNaN(s)) return "";
    if (s > -60) return "ahora";
    if (s > -3600) return fRel.format(Math.round(s / 60), "minute");
    if (s > -86400) return fRel.format(Math.round(s / 3600), "hour");
    return fCorta.format(d);
  }

  // ---------------- Clima (Open-Meteo, gratuito y sin clave) ----------------
  const WMO = {
    0: ["☀️", "Despejado"], 1: ["🌤️", "Mayormente despejado"], 2: ["⛅", "Parcialmente nublado"], 3: ["☁️", "Nublado"],
    45: ["🌫️", "Niebla"], 48: ["🌫️", "Niebla escarchada"],
    51: ["🌦️", "Llovizna débil"], 53: ["🌦️", "Llovizna"], 55: ["🌧️", "Llovizna intensa"],
    56: ["🌧️", "Llovizna helada"], 57: ["🌧️", "Llovizna helada"],
    61: ["🌧️", "Lluvia débil"], 63: ["🌧️", "Lluvia"], 65: ["🌧️", "Lluvia intensa"],
    66: ["🌧️", "Lluvia helada"], 67: ["🌧️", "Lluvia helada"],
    71: ["🌨️", "Nieve débil"], 73: ["🌨️", "Nieve"], 75: ["❄️", "Nieve intensa"], 77: ["🌨️", "Granizo fino"],
    80: ["🌦️", "Chubascos"], 81: ["🌧️", "Chubascos"], 82: ["⛈️", "Chubascos fuertes"],
    85: ["🌨️", "Chubascos de nieve"], 86: ["🌨️", "Chubascos de nieve"],
    95: ["⛈️", "Tormenta"], 96: ["⛈️", "Tormenta con granizo"], 99: ["⛈️", "Tormenta con granizo"]
  };
  const wmo = c => WMO[c] || ["🌡️", "—"];
  const fDia = new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "short" });

  async function loadWeather() {
    const c = CFG.clima || { lat: -33.4489, lon: -70.6693 };
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + c.lat + "&longitude=" + c.lon +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max" +
      "&timezone=" + encodeURIComponent(TZ) + "&forecast_days=4";
    try {
      const r = await fetch(url);
      const d = await r.json();
      const cur = d.current, [ic, desc] = wmo(cur.weather_code);
      $("#w-icon").textContent = ic;
      $("#w-temp").textContent = Math.round(cur.temperature_2m) + "°";
      $("#w-desc").textContent = desc + " · " + (c.nombre || "Santiago");
      $("#w-extra").innerHTML = "";
      $("#w-extra").append(
        el("div", { text: "Sensación " + Math.round(cur.apparent_temperature) + "° · Hum. " + cur.relative_humidity_2m + "%" }),
        el("div", { text: "Viento " + Math.round(cur.wind_speed_10m) + " km/h · Máx " + Math.round(d.daily.temperature_2m_max[0]) + "° / Mín " + Math.round(d.daily.temperature_2m_min[0]) + "°" })
      );
      renderForecast(d);
    } catch (e) {
      $("#w-desc").textContent = "Clima no disponible";
    }
  }
  function renderForecast(d) {
    const body = $("#fc-body");
    if (!body) return;
    body.innerHTML = "";
    d.daily.time.forEach((t, i) => {
      const [ic] = wmo(d.daily.weather_code[i]);
      const label = i === 0 ? "Hoy" : fDia.format(new Date(t + "T12:00:00-03:00")).replace(".", "");
      body.append(el("div", { class: "fc-day" },
        el("b", { text: label }),
        el("span", { class: "ic", text: ic }),
        el("div", { class: "t" }, Math.round(d.daily.temperature_2m_max[i]) + "° ", el("span", { text: Math.round(d.daily.temperature_2m_min[i]) + "°" })),
        el("div", { class: "p", text: "💧 " + (d.daily.precipitation_probability_max[i] ?? 0) + "%" })
      ));
    });
    body.append(el("div", { class: "fc-now" },
      el("span", {}, "UV máx: ", el("b", { text: String(Math.round(d.daily.uv_index_max[0] ?? 0)) })),
      el("span", {}, "Precipitación: ", el("b", { text: (d.current.precipitation ?? 0) + " mm" }))
    ));
  }
  loadWeather(); setInterval(loadWeather, 15 * 60 * 1000);

  // ---------------- Canales en vivo ----------------
  const tiles = {};
  let ytReady = false;
  let audioKey = null;
  let featuredKey = store.get("dash.featured", (CFG.canales || [])[0]?.clave);

  function liveSrc(canal, liveInfo) {
    const vid = canal.videoId || (liveInfo && liveInfo.videoId);
    const base = vid
      ? "https://www.youtube.com/embed/" + encodeURIComponent(vid)
      : "https://www.youtube.com/embed/live_stream?channel=" + encodeURIComponent(canal.youtube);
    const q = new URLSearchParams({ autoplay: "1", mute: "1", playsinline: "1", rel: "0", modestbranding: "1", enablejsapi: "1", origin: location.origin });
    return base + (base.includes("?") ? "&" : "?") + q.toString();
  }

  function buildTV(live) {
    const grid = $("#tv-grid");
    grid.innerHTML = "";
    (CFG.canales || []).forEach((canal, i) => {
      const iframe = el("iframe", {
        src: liveSrc(canal, live[canal.clave]), title: canal.nombre + " en vivo",
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, loading: "eager",
        referrerpolicy: "strict-origin-when-cross-origin"
      });
      const btnAudio = el("button", { class: "tbtn", title: "Activar audio", text: "🔇", onclick: () => toggleAudio(canal.clave) });
      const btnFeat = el("button", { class: "tbtn", title: "Destacar en grande", text: "⤢", onclick: () => setFeatured(canal.clave) });
      const btnFull = el("button", { class: "tbtn tb-opt", title: "Pantalla completa", text: "⛶", onclick: () => full(canal.clave) });
      const btnReload = el("button", { class: "tbtn tb-opt", title: "Recargar señal", text: "↻", onclick: () => reloadTile(canal.clave) });
      const tile = el("article", { class: "tile", "data-key": canal.clave, style: "order:" + (i + 1) },
        el("div", { class: "tile-head" },
          el("span", { class: "live-dot" }),
          el("span", { class: "tile-name" }, el("span", { class: "n-full", text: canal.nombre }), el("span", { class: "n-short", text: canal.corto || canal.nombre })),
          btnAudio, btnFeat, btnReload, btnFull,
          el("a", { class: "tbtn", href: canal.oficial, target: "_blank", rel: "noopener", title: "Abrir señal oficial", text: "↗" })
        ),
        el("div", { class: "tile-video" }, iframe,
          el("div", { class: "tile-fallback" },
            el("div", {}, "Esta señal no está transmitiendo en YouTube en este momento.", el("br"),
              el("a", { href: canal.oficial, target: "_blank", rel: "noopener", text: "Ver en sitio oficial" })))
        )
      );
      tiles[canal.clave] = { tile, iframe, canal, btnAudio, src: iframe.src, player: null };
      grid.append(tile);
    });

    grid.append(el("article", { class: "forecast", style: "order:99" },
      el("div", { class: "tile-head" }, el("span", { class: "tile-name", text: "Pronóstico · " + ((CFG.clima || {}).nombre || "Santiago") })),
      el("div", { class: "fc-body", id: "fc-body" }, el("div", { class: "empty", style: "grid-column:1/-1", text: "Cargando pronóstico…" }))
    ));
    setFeatured(featuredKey, true);
    if (ytReady) attachPlayers();
  }

  function attachPlayers() {
    Object.values(tiles).forEach(t => {
      if (t.player || !window.YT || !YT.Player) return;
      try {
        t.player = new YT.Player(t.iframe, {
          events: {
            onError: () => t.tile.classList.add("failed"),
            onStateChange: () => t.tile.classList.remove("failed")
          }
        });
      } catch { }
    });
  }
  window.onYouTubeIframeAPIReady = function () { ytReady = true; attachPlayers(); };

  function toggleAudio(key) {
    const next = audioKey === key ? null : key;
    Object.entries(tiles).forEach(([k, t]) => {
      const on = k === next;
      t.tile.classList.toggle("audio-on", on);
      t.btnAudio.textContent = on ? "🔊" : "🔇";
      t.btnAudio.classList.toggle("on", on);
      if (t.player && typeof t.player.mute === "function") {
        try { on ? (t.player.unMute(), t.player.setVolume(100), t.player.playVideo()) : t.player.mute(); } catch { }
      } else if (on || k === audioKey) {
        t.iframe.src = t.src.replace("mute=1", "mute=" + (on ? "0" : "1"));
      }
    });
    audioKey = next;
  }
  function setFeatured(key, silent) {
    if (!tiles[key]) key = Object.keys(tiles)[0];
    featuredKey = key;
    store.set("dash.featured", key);
    let n = 1;
    Object.entries(tiles).forEach(([k, t]) => {
      const f = k === key;
      t.tile.classList.toggle("featured", f);
      t.tile.style.order = f ? 0 : n++;
    });
    if (!silent) tiles[key].tile.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function full(key) {
    const t = tiles[key].tile;
    (t.requestFullscreen || t.webkitRequestFullscreen || function () { }).call(t);
  }
  function reloadTile(key, src) {
    const t = tiles[key];
    t.tile.classList.remove("failed");
    if (src) t.src = src;
    t.player = null;
    t.iframe.src = t.src;
    if (ytReady) setTimeout(attachPlayers, 300);
  }

  async function initTV() {
    let live = {};
    try { live = (await getJSON("data/live.json")).channels || {}; } catch { }
    buildTV(live);
    setInterval(async () => {
      try {
        const l = (await getJSON("data/live.json")).channels || {};
        Object.values(tiles).forEach(t => {
          const nuevo = liveSrc(t.canal, l[t.canal.clave]);
          if (nuevo !== t.src && !t.canal.videoId) reloadTile(t.canal.clave, nuevo);
        });
      } catch { }
    }, 10 * 60 * 1000);
  }
  initTV();

  // ---------------- Noticias ----------------
  let news = [], newsFilter = "todas", newsQuery = "";
  const seen = new Set(store.get("dash.seen", []));
  const KINDS = { todas: "Todas", web: "Web", tv: "TV", social: "Redes" };

  const chips = $("#news-chips");
  Object.entries(KINDS).forEach(([k, label]) => {
    chips.append(el("button", {
      class: "chip" + (k === newsFilter ? " active" : ""), "data-k": k, text: label,
      onclick: e => { newsFilter = k; chips.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === e.currentTarget)); renderNews(); }
    }));
  });
  $("#news-search").addEventListener("input", e => { newsQuery = e.target.value.trim().toLowerCase(); renderNews(); });

  const social = $("#social");
  if ((CFG.redes || []).length) {
    social.append(el("span", { text: "Buscar ahora en redes" }));
    CFG.redes.forEach(r => social.append(el("a", { href: r.url, target: "_blank", rel: "noopener", text: r.nombre })));
  } else social.remove();

  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function renderNews() {
    const list = $("#news-list");
    const q = norm(newsQuery);
    const items = news.filter(n =>
      (newsFilter === "todas" || n.kind === newsFilter) &&
      (!q || norm(n.title + " " + n.summary + " " + n.source).includes(q)));
    $("#news-count").textContent = items.length;
    list.innerHTML = "";
    if (!items.length) { list.append(el("li", { class: "empty", text: news.length ? "Sin resultados para este filtro." : "Aún no hay noticias. Se actualizan cada 15 minutos." })); return; }
    const frag = document.createDocumentFragment();
    items.slice(0, 300).forEach(n => {
      frag.append(el("li", { class: "news-item" + (seen.has(n.id) ? "" : " is-new") },
        el("div", { class: "news-meta" },
          el("span", { class: "kind kind-" + n.kind, text: KINDS[n.kind] || n.kind }),
          el("span", { class: "src", text: n.source || "" }),
          el("time", { datetime: n.published || "", title: n.published ? fCorta.format(new Date(n.published)) : "", text: hace(n.published) })
        ),
        el("h3", {}, el("a", { href: n.url, target: "_blank", rel: "noopener", text: n.title })),
        n.summary ? el("p", { text: n.summary }) : null
      ));
    });
    list.append(frag);
  }

  function renderTicker() {
    const move = $("#ticker-move");
    move.innerHTML = "";
    const top = news.slice(0, 15);
    if (!top.length) { move.textContent = "Sin titulares por ahora."; return; }
    top.forEach((n, i) => {
      if (i) move.append(el("span", { class: "sep", text: "◆" }));
      move.append(el("a", { href: n.url, target: "_blank", rel: "noopener" }, el("b", { text: (n.source || "") + ": " }), n.title));
    });
    move.style.animationDuration = Math.max(60, top.length * 9) + "s";
  }

  let lastUpdate = null;
  async function loadNews() {
    try {
      const d = await getJSON("data/news.json");
      news = d.items || [];
      lastUpdate = d.updated;
      $("#news-updated").textContent = d.updated ? "act. " + hace(d.updated) : "";
      renderNews(); renderTicker();
      setTimeout(() => { news.forEach(n => seen.add(n.id)); store.set("dash.seen", [...seen].slice(-1500)); }, 15000);
      status();
    } catch (e) {
      $("#news-list").innerHTML = "";
      $("#news-list").append(el("li", { class: "empty", text: location.protocol === "file:" ? "Abra el dashboard desde su dirección web (GitHub Pages) para ver noticias." : "No se pudieron cargar las noticias." }));
      $("#foot-status").textContent = "Sin conexión con datos";
    }
  }
  function status() {
    $("#foot-status").textContent = lastUpdate ? "Noticias actualizadas " + hace(lastUpdate) : "";
    if (lastUpdate) $("#news-updated").textContent = "act. " + hace(lastUpdate);
  }
  loadNews();
  setInterval(loadNews, (CFG.recargaSegundos || 120) * 1000);
  setInterval(status, 30000);

  // ---------------- Descargas ----------------
  let clips = [], tvItems = [], dlTab = "listos";
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    dlTab = b.dataset.tab;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
    renderDL();
  }));

  const mb = b => b ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : "";
  const dur = s => { if (!s) return ""; s = Math.round(s); const m = Math.floor(s / 60); return m + ":" + String(s % 60).padStart(2, "0"); };
  const wa = text => "https://wa.me/?text=" + encodeURIComponent(text);

  async function share(title, url) {
    if (navigator.share) { try { await navigator.share({ title, text: title, url }); return; } catch { } }
    window.open(wa(title + "\n" + url), "_blank", "noopener");
  }
  async function requestDownload(url) {
    try { await navigator.clipboard.writeText(url); } catch { }
    const repo = repoGithub();
    if (repo) {
      window.open("https://github.com/" + repo + "/actions/workflows/clips.yml", "_blank", "noopener");
      toast("Enlace copiado. En GitHub pulse «Run workflow», pegue el enlace y en unos minutos aparecerá en «Listos para WhatsApp».");
    } else {
      toast("Enlace copiado. Configure «repoGithub» en config.js para solicitar descargas.");
    }
  }

  function renderDL() {
    const list = $("#dl-list");
    list.innerHTML = "";
    const items = dlTab === "listos" ? clips : tvItems;
    $("#dl-count").textContent = clips.length;
    if (!items.length) {
      list.append(el("li", { class: "empty", text: dlTab === "listos" ? "Todavía no hay clips comprimidos. Se generan automáticamente cada 30 minutos." : "Sin videos recientes de los canales." }));
      return;
    }
    const frag = document.createDocumentFragment();
    items.slice(0, 150).forEach(c => {
      const ready = dlTab === "listos";
      const pageUrl = c.source_url || c.url;
      frag.append(el("li", { class: "dl-item" },
        el("img", { class: "dl-thumb", src: c.thumb || "", alt: "", loading: "lazy" }),
        el("div", { class: "dl-info" },
          el("h3", { title: c.title, text: c.title }),
          el("div", { class: "dl-meta" }, el("b", { text: c.channel || "" }), " · " + hace(c.published) +
            (ready ? " · " + [dur(c.duration), mb(c.size)].filter(Boolean).join(" · ") : "")),
          el("div", { class: "dl-actions" },
            ready
              ? [el("a", { class: "btn btn-dl", href: c.download_url, download: c.file || true, text: "⬇ Descargar" }),
                 el("button", { class: "btn btn-wa", text: "WhatsApp", onclick: () => share(c.title, c.download_url) })]
              : [el("button", { class: "btn btn-dl", text: "⬇ Solicitar", title: "Pedir versión comprimida para WhatsApp", onclick: () => requestDownload(pageUrl) }),
                 el("button", { class: "btn btn-wa", text: "WhatsApp", onclick: () => share(c.title, pageUrl) })],
            el("a", { class: "btn btn-ghost", href: pageUrl, target: "_blank", rel: "noopener", text: "Ver" })
          )
        )
      ));
    });
    list.append(frag);
  }

  async function loadDL() {
    try { clips = (await getJSON("data/clips.json")).items || []; } catch { clips = []; }
    try { tvItems = (await getJSON("data/tv.json")).items || []; } catch { tvItems = []; }
    renderDL();
  }
  loadDL();
  setInterval(loadDL, (CFG.recargaSegundos || 120) * 1000);
})();
