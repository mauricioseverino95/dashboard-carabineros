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
  const tiles = {};          // clave -> {tile, iframe, player, canal, src}
  let ytReady = false;
  let audioKey = null;
  let featuredKey = store.get("dash.featured", (CFG.canales || [])[0]?.clave);

  // =================== MOTOR DE SEÑALES ===================
  // Cada canal tiene una lista de fuentes en orden de prioridad (config.js → fuentes).
  //  - "hls":    transmisión oficial directa (m3u8) — se vigila y si cae, pasa a la siguiente
  //  - "yt":     YouTube (video detectado automáticamente o transmisión del canal)
  //  - "iframe": reproductor oficial insertado
  // Un vigilante revisa cada 15 s que el video avance. Cada 10 min se recargan los
  // enlaces (data/live.json) y se vuelve a intentar la fuente principal.
  const YT_Q = () => new URLSearchParams({ autoplay: "1", mute: "1", playsinline: "1", rel: "0", modestbranding: "1", enablejsapi: "1", origin: location.origin }).toString();
  let LIVE = {};
  function sources(canal) {
    const out = [];
    const live = LIVE[canal.clave] || {};
    (canal.fuentes || []).forEach(f => {
      if (f.tipo === "yt-auto") {
        const vids = [canal.videoId, live.videoId, ...(live.alts || [])].filter(Boolean);
        [...new Set(vids)].forEach(v => out.push({ type: "yt", label: "YouTube oficial del canal", src: "https://www.youtube.com/embed/" + encodeURIComponent(v) + "?" + YT_Q() }));
        if (canal.youtube) out.push({ type: "yt", label: "YouTube oficial del canal", src: "https://www.youtube.com/embed/live_stream?channel=" + encodeURIComponent(canal.youtube) + "&" + YT_Q() });
      } else if (f.tipo === "hls") {
        out.push({ type: "hls", label: f.nombre || "Señal oficial", src: f.url });
      } else if (f.tipo === "iframe") {
        out.push({ type: "iframe", label: f.nombre || "Señal oficial", src: f.url, check: f.verificar || null });
      }
    });
    return out;
  }
  const sig = list => list.map(x => x.src).join("|");

  let hlsLib = null;
  function loadHls() {
    if (hlsLib) return hlsLib;
    hlsLib = new Promise(res => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
      sc.onload = () => res(window.Hls); sc.onerror = () => res(null);
      document.head.append(sc);
    });
    return hlsLib;
  }

  function buildTV() {
    const grid = $("#tv-grid");
    grid.innerHTML = "";
    (CFG.canales || []).forEach((canal, i) => {
      const box = el("div", { class: "tile-video" });
      const badge = el("span", { class: "src-badge" });
      const btnAudio = el("button", { class: "tbtn", title: "Activar audio", text: "🔇", onclick: () => toggleAudio(canal.clave) });
      const btnFeat = el("button", { class: "tbtn", title: "Destacar en grande", text: "⤢", onclick: () => setFeatured(canal.clave) });
      const btnNext = el("button", { class: "tbtn tb-opt", title: "Cambiar a la señal alternativa", text: "⇄", onclick: () => startTile(canal.clave, tiles[canal.clave].idx + 1, true) });
      const btnFull = el("button", { class: "tbtn tb-opt", title: "Pantalla completa", text: "⛶", onclick: () => full(canal.clave) });
      const tile = el("article", { class: "tile", "data-key": canal.clave, style: "order:" + (i + 1) },
        el("div", { class: "tile-head" },
          el("span", { class: "live-dot" }),
          el("span", { class: "tile-name" }, el("span", { class: "n-full", text: canal.nombre }), el("span", { class: "n-short", text: canal.corto || canal.nombre })),
          badge, btnAudio, btnFeat, btnNext, btnFull,
          el("a", { class: "tbtn", href: canal.oficial, target: "_blank", rel: "noopener", title: "Abrir página oficial", text: "↗" })
        ),
        box
      );
      tiles[canal.clave] = { tile, box, canal, btnAudio, badge, list: sources(canal), idx: 0, media: null, player: null, hls: null, lastT: -1, stuck: 0, started: 0, ok: false };
      grid.append(tile);
    });
    grid.append(el("article", { class: "forecast", style: "order:99" },
      el("div", { class: "tile-head" }, el("span", { class: "tile-name", text: "Pronóstico · " + ((CFG.clima || {}).nombre || "Santiago") })),
      el("div", { class: "fc-body", id: "fc-body" }, el("div", { class: "empty", style: "grid-column:1/-1", text: "Cargando pronóstico…" }))
    ));
    setFeatured(featuredKey, true);
    Object.keys(tiles).forEach(k => startTile(k, 0));
  }

  function teardown(t) {
    try { t.hls && t.hls.destroy(); } catch { }
    try { t.player && t.player.destroy && t.player.destroy(); } catch { }
    t.hls = null; t.player = null; t.media = null;
    t.box.innerHTML = "";
  }

  // Carga la fuente idx (si no hay más, vuelve a empezar: nunca queda sin señal)
  async function startTile(key, idx, manual) {
    const t = tiles[key];
    if (!t.list.length) return;
    if (idx >= t.list.length) idx = 0;
    teardown(t);
    t.idx = idx; t.ok = false; t.lastT = -1; t.stuck = 0; t.started = Date.now();
    const s = t.list[idx];
    const audio = audioKey === key;
    t.badge.textContent = s.type === "yt" ? "YOUTUBE" : "OFICIAL";
    t.badge.title = s.label + (t.list.length > 1 ? " · fuente " + (idx + 1) + " de " + t.list.length : "");
    t.tile.classList.toggle("is-oficial", s.type !== "yt");

    if (s.type === "hls") {
      const v = el("video", { autoplay: true, playsinline: true, controls: true });
      v.muted = !audio;
      t.box.append(v); t.media = v;
      const fail = () => { if (tiles[key] === t && t.media === v) startTile(key, idx + 1); };
      v.addEventListener("playing", () => { t.ok = true; });
      v.addEventListener("error", fail);
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = s.src;
      } else {
        const Hls = await loadHls();
        if (t.media !== v) return;
        if (!Hls || !Hls.isSupported()) return fail();
        const h = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3 });
        t.hls = h;
        h.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { try { h.recoverMediaError(); return; } catch { } }
          fail();
        });
        h.loadSource(s.src); h.attachMedia(v);
      }
      v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
    } else if (s.type === "yt") {
      const f = el("iframe", { src: audio ? s.src.replace("mute=1", "mute=0") : s.src, title: t.canal.nombre,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin" });
      t.box.append(f); t.media = f;
      if (ytReady) attachYT(t, f, idx);
    } else {
      const f = el("iframe", { src: s.src, title: t.canal.nombre, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, referrerpolicy: "no-referrer-when-downgrade" });
      t.box.append(f); t.media = f; t.ok = true; // no se puede vigilar desde fuera
    }
  }
  function attachYT(t, f, idx) {
    if (t.player || !window.YT || !YT.Player) return;
    const key = t.canal.clave;
    try {
      t.player = new YT.Player(f, { events: {
        onError: () => { if (t.idx === idx && t.media === f) startTile(key, idx + 1); },
        onStateChange: e => { if (e.data === 1) t.ok = true; }
      } });
    } catch { }
  }
  window.onYouTubeIframeAPIReady = function () {
    ytReady = true;
    Object.values(tiles).forEach(t => { if (t.list[t.idx]?.type === "yt" && t.media) attachYT(t, t.media, t.idx); });
  };

  // Señales oficiales insertadas: si tienen URL de verificación, se comprueba cada 60 s
  setInterval(() => {
    Object.values(tiles).forEach(async t => {
      const s = t.list[t.idx];
      if (!s || s.type !== "iframe" || !s.check) return;
      const idx = t.idx;
      try {
        const r = await fetch(s.check + (s.check.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        t.checkFails = 0;
      } catch {
        t.checkFails = (t.checkFails || 0) + 1;
        if (t.checkFails >= 2 && t.idx === idx) { t.checkFails = 0; startTile(t.canal.clave, idx + 1); }
      }
    });
  }, 60000);

  // Vigilante: cada 15 s comprueba que cada señal esté avanzando
  setInterval(() => {
    Object.values(tiles).forEach(t => {
      const s = t.list[t.idx]; if (!s) return;
      const edad = Date.now() - t.started;
      if (s.type === "hls" && t.media) {
        const ct = t.media.currentTime;
        if (!t.media.paused && ct === t.lastT) t.stuck++; else t.stuck = 0;
        t.lastT = ct;
        if ((t.stuck >= 3) || (!t.ok && edad > 30000)) startTile(t.canal.clave, t.idx + 1);
      } else if (s.type === "yt") {
        let st = -1;
        try { st = t.player && t.player.getPlayerState ? t.player.getPlayerState() : -1; } catch { }
        if (st === 1) { t.ok = true; t.stuck = 0; }
        else if (st === 0) t.stuck = 9;            // transmisión terminó
        else if (st === 3 || st === -1 || st === 5) t.stuck++;
        if (t.stuck >= 3 || (!t.ok && edad > 30000)) startTile(t.canal.clave, t.idx + 1);
      }
    });
  }, 15000);

  function toggleAudio(key) {
    const prev = audioKey;
    audioKey = prev === key ? null : key;
    Object.entries(tiles).forEach(([k, t]) => {
      const on = k === audioKey;
      t.tile.classList.toggle("audio-on", on);
      t.btnAudio.textContent = on ? "🔊" : "🔇";
      t.btnAudio.classList.toggle("on", on);
      const s = t.list[t.idx]; if (!s || !t.media) return;
      if (s.type === "hls") { t.media.muted = !on; if (on) t.media.play().catch(() => { }); }
      else if (s.type === "yt") {
        if (t.player && typeof t.player.mute === "function") {
          try { on ? (t.player.unMute(), t.player.setVolume(100), t.player.playVideo()) : t.player.mute(); } catch { }
        } else if (on || k === prev) t.media.src = s.src.replace("mute=1", "mute=" + (on ? "0" : "1"));
      }
    });
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

  async function refreshLinks(force) {
    try { LIVE = (await getJSON("data/live.json")).channels || {}; } catch { }
    Object.values(tiles).forEach(t => {
      const nueva = sources(t.canal);
      const cambio = sig(nueva) !== sig(t.list);
      const actual = t.list[t.idx];
      t.list = nueva;
      // Volver a la fuente principal si cambió la lista o si se está usando una de respaldo
      if (force || cambio || t.idx !== 0 || !actual) startTile(t.canal.clave, 0);
    });
  }
  async function initTV() {
    try { LIVE = (await getJSON("data/live.json")).channels || {}; } catch { }
    buildTV();
    setInterval(() => refreshLinks(false), 60 * 60 * 1000);   // cada 1 hora
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

  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // ---- Rotación en vivo: cada pocos segundos entra una noticia por arriba.
  // Primero las realmente nuevas (marca NUEVA); si no hay, vuelve a subir una ya publicada
  // (marca ↻) para que la columna siempre se mueva. La hora mostrada es siempre la real.
  const ROTAR_MS = (CFG.rotacionSegundos || 7) * 1000;
  let feed = [];                 // orden mostrado (ids)
  const porId = new Map();       // id -> noticia
  const ultimaSubida = new Map();// id -> momento en que subió por última vez
  let pendientes = [];           // nuevas aún no mostradas
  let pausaHasta = 0;

  const filtrando = () => newsFilter !== "todas" || !!newsQuery;

  function itemLi(n, marca) {
    const li = el("li", { class: "news-item" + (seen.has(n.id) ? "" : " is-new"), "data-id": n.id },
      el("div", { class: "news-meta" },
        el("span", { class: "kind kind-" + n.kind, text: KINDS[n.kind] || n.kind }),
        el("span", { class: "src", text: n.source || "" }),
        marca === "nueva" ? el("span", { class: "nw-tag nw-nueva", text: "Nueva" }) :
        marca === "rep" ? el("span", { class: "nw-tag nw-rep", title: "Noticia vuelta a destacar", text: "↻" }) : null,
        el("time", { datetime: n.published || "", title: n.published ? fCorta.format(new Date(n.published)) : "", text: hace(n.published) })
      ),
      el("h3", {}, el("a", { href: n.url, target: "_blank", rel: "noopener", text: n.title })),
      n.summary ? el("p", { text: n.summary }) : null
    );
    return li;
  }

  function renderNews() {
    const list = $("#news-list");
    const q = norm(newsQuery);
    const base = filtrando() ? news : feed.map(id => porId.get(id)).filter(Boolean);
    const items = base.filter(n =>
      (newsFilter === "todas" || n.kind === newsFilter) &&
      (!q || norm(n.title + " " + n.summary + " " + n.source).includes(q)));
    $("#news-count").textContent = items.length;
    list.innerHTML = "";
    list.classList.toggle("rotando", !filtrando());
    if (!items.length) { list.append(el("li", { class: "empty", text: news.length ? "Sin resultados para este filtro." : "Aún no hay noticias. Se actualizan cada minuto." })); return; }
    const frag = document.createDocumentFragment();
    items.slice(0, 300).forEach(n => frag.append(itemLi(n)));
    list.append(frag);
  }

  function subir(id, marca) {
    const n = porId.get(id); if (!n) return;
    feed = [id, ...feed.filter(x => x !== id)].slice(0, 300);
    ultimaSubida.set(id, Date.now());
    if (filtrando()) return;
    const list = $("#news-list");
    const viejo = list.querySelector(`li[data-id="${CSS.escape(id)}"]`);
    const antesScroll = list.scrollTop;
    if (viejo) viejo.remove();
    list.querySelector(".empty")?.remove();
    const li = itemLi(n, marca);
    li.classList.add("entra");
    list.prepend(li);
    while (list.children.length > 300) list.lastElementChild.remove();
    // si el usuario está leyendo más abajo, no mover lo que está mirando
    if (antesScroll > 4) list.scrollTop = antesScroll + li.offsetHeight;
    $("#news-count").textContent = list.querySelectorAll(".news-item").length;
    setTimeout(() => li.classList.remove("entra"), 1600);
  }

  function rotar() {
    if (document.hidden || filtrando() || Date.now() < pausaHasta || !feed.length) return;
    if (pendientes.length) { subir(pendientes.shift(), "nueva"); return; }
    // repetir: la noticia que hace más tiempo no sube, fuera de las 8 de arriba
    const candidatas = feed.slice(8, 120);
    if (!candidatas.length) return;
    let elegida = candidatas[0], menor = Infinity;
    for (const id of candidatas) {
      const t = ultimaSubida.get(id) || 0;
      if (t < menor) { menor = t; elegida = id; }
    }
    subir(elegida, "rep");
  }
  setInterval(rotar, ROTAR_MS);
  // pausa mientras se lee (cursor encima o toque) para que nada se mueva bajo el mouse
  const listaNews = $("#news-list");
  listaNews.addEventListener("mouseenter", () => { pausaHasta = Infinity; });
  listaNews.addEventListener("mouseleave", () => { pausaHasta = Date.now() + 2000; });
  listaNews.addEventListener("touchstart", () => { pausaHasta = Date.now() + 20000; }, { passive: true });
  // refrescar el "hace X min" de cada noticia
  setInterval(() => {
    listaNews.querySelectorAll(".news-item").forEach(li => {
      const t = li.querySelector("time"); if (t && t.dateTime) t.textContent = hace(t.dateTime);
    });
  }, 60000);

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
      const primera = !feed.length;
      news.forEach(n => porId.set(n.id, n));
      const vigentes = new Set(news.map(n => n.id));
      if (primera) {
        feed = news.map(n => n.id).slice(0, 300);
      } else {
        feed = feed.filter(id => vigentes.has(id));
        // nuevas: entran de a una (la más antigua primero, así la más reciente queda arriba)
        const enFeed = new Set([...feed, ...pendientes]);
        const nuevas = news.filter(n => !enFeed.has(n.id)).reverse().map(n => n.id);
        pendientes = [...pendientes.filter(id => vigentes.has(id)), ...nuevas].slice(-60);
      }
      for (const id of porId.keys()) if (!vigentes.has(id)) porId.delete(id);
      $("#news-updated").textContent = d.updated ? "act. " + hace(d.updated) : "";
      if (primera || filtrando()) renderNews();
      renderTicker();
      // marcar como vistas para la próxima carga
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

  // ---------------- Videos, descargas y cámaras ----------------
  const REPO = repoGithub();
  const API = "https://api.github.com/repos/" + REPO;
  let clips = [], tvItems = [], cams = [], dlTab = "videos", dlQuery = "";
  let jobs = store.get("dash.jobs", []);              // descargas iniciadas en este equipo
  const blobs = {};                                    // archivos descargados en esta sesión
  const saveJobs = () => store.set("dash.jobs", jobs.slice(0, 40));
  const token = () => store.get("dash.ghtoken", "");

  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    dlTab = b.dataset.tab;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
    renderDL();
  }));
  $("#dl-search").addEventListener("input", e => { dlQuery = norm(e.target.value.trim()); renderDL(); });

  const mb = b => b ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : "";
  const dur = s => { if (!s) return ""; s = Math.round(s); const m = Math.floor(s / 60); return m + ":" + String(s % 60).padStart(2, "0"); };
  const vidOf = u => ((u || "").match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/) || [])[1];

  // ---- Compartir: copia el enlace de la noticia
  async function copiar(c) {
    const url = c.source_url || c.url;
    const texto = (c.title ? c.title + "\n" : "") + url;
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch { }
    if (!ok) { const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = texto; document.body.append(ta); ta.select(); try { ok = document.execCommand("copy"); } catch { } ta.remove(); }
    toast(ok ? "Enlace copiado. Péguelo en WhatsApp o donde lo necesite." : "No se pudo copiar: " + url);
  }

  // ---- Configuración del token
  const dlg = $("#dl-dialog");
  function abrirConfig(msg) {
    $("#dl-token").value = token();
    if (msg) toast(msg);
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
  }
  $("#dl-config").addEventListener("click", () => abrirConfig());
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue === "borrar") { store.set("dash.ghtoken", ""); toast("Token eliminado de este equipo."); return; }
    if (dlg.returnValue !== "ok") return;
    const raw = $("#dl-token").value;
    const m = raw.match(/(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,})/);
    if (!m) { toast("Eso no es un token: debe empezar con github_pat_. Copie el código con el ícono de copiar en GitHub."); return; }
    store.set("dash.ghtoken", m[1]);
    try {
      const r = await gh("");
      const ok = r.ok && (await gh("/actions/workflows/clips.yml")).ok;
      toast(ok ? "✅ Token válido. Descargas activadas en este equipo." : "⚠ GitHub rechazó el token (" + r.status + "). Revise que tenga acceso al repositorio y permiso Actions: lectura y escritura.");
    } catch { toast("Token guardado. No se pudo comprobar con GitHub (sin conexión)."); }
  });

  async function gh(path, opts = {}) {
    const r = await fetch(path.startsWith("http") ? path : API + path, Object.assign({}, opts, {
      headers: Object.assign({ Accept: "application/vnd.github+json", Authorization: "Bearer " + token(), "X-GitHub-Api-Version": "2022-11-28" }, opts.headers || {})
    }));
    return r;
  }

  // ---- Motor de descarga
  const PASOS = { "Set up job": 15, "Run actions/checkout@v4": 20, "Run actions/setup-python@v5": 25, "Instalar herramientas": 35, "Descargar y comprimir clips": 70, "Guardar cambios": 85 };
  function setJob(j, patch) { Object.assign(j, patch); saveJobs(); if (dlTab === "descargas") renderDL(); updCount(); }

  // ---- Descargador de este PC (yt-dlp + ffmpeg locales, ver carpeta descargador/)
  // YouTube bloquea las descargas desde servidores en la nube; desde el PC del operador no.
  const LOCAL = "http://localhost:8737";
  const ZIP_DESCARGADOR = "https://github.com/" + REPO + "/raw/main/descargador/DescargadorCarabineros.zip";
  const local = { ok: false, carpeta: "", ytdlp: "", visto: 0, activo: store.get("dash.local", false) };
  const espera = ms => new Promise(r => setTimeout(r, ms));
  async function revisarLocal(forzar) {
    if (!forzar && Date.now() - local.visto < 20000) return local.ok;
    local.visto = Date.now();
    const antes = local.ok;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2000);
      const d = await (await fetch(LOCAL + "/ping", { signal: ctl.signal, cache: "no-store" })).json();
      clearTimeout(t);
      local.ok = !!d.ok; local.carpeta = d.carpeta || ""; local.ytdlp = d.ytdlp || "";
    } catch { local.ok = false; }
    if (local.ok && !local.activo) { local.activo = true; store.set("dash.local", true); }
    if (antes !== local.ok && dlTab === "descargas") renderDL();
    return local.ok;
  }
  async function descargarLocal(c, url, silencioso) {
    try {
      const r = await fetch(LOCAL + "/descargar", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title: c.title || "", channel: c.channel || "", published: c.published || "", ref: c.videoId || "" }) });
      const d = await r.json();
      if (!r.ok || !d.id) throw new Error(d.error || r.status);
      if (!jobs.some(j => j.localId === d.id)) {
        jobs.unshift({ id: "L" + d.id, localId: d.id, local: true, url, title: c.title, channel: c.channel, thumb: c.thumb,
          state: "en cola", pct: 3, msg: "En cola en este PC…", t: Date.now() });
        saveJobs();
      }
      if (!silencioso) { irA("descargas"); toast(d.repetido ? "Ese video ya está descargado o en curso." : "⬇ Descargando en este PC…"); }
      renderDL(); updCount(); vigilarLocal();
      return true;
    } catch (e) {
      if (!silencioso) toast("El descargador de este PC no respondió. ¿Está instalado y encendido?");
      return false;
    }
  }
  let vigilandoLocal = false;
  async function vigilarLocal() {
    if (vigilandoLocal) return; vigilandoLocal = true;
    let fallos = 0;
    try {
      while (jobs.some(j => j.local && !["listo", "error"].includes(j.state))) {
        await espera(2000);
        try {
          const d = await (await fetch(LOCAL + "/estado", { cache: "no-store" })).json();
          fallos = 0;
          let cambio = false;
          for (const t of d.trabajos || []) {
            const j = jobs.find(x => x.localId === t.id); if (!j) continue;
            const state = t.estado === "listo" ? "listo" : t.estado === "error" ? "error" : "procesando";
            const msg = t.estado === "listo" ? "Guardado en " + (t.nombre || "la carpeta") + " · " + [dur(t.duracion), mb(t.tam)].filter(Boolean).join(" · ") : t.msg;
            if (j.state !== state || j.pct !== t.pct || j.msg !== msg) { Object.assign(j, { state, pct: t.pct, msg, file: t.nombre, size: t.tam }); cambio = true; }
          }
          if (cambio) { saveJobs(); if (dlTab === "descargas") renderDL(); updCount(); }
        } catch {
          if (++fallos >= 30) {
            jobs.filter(j => j.local && !["listo", "error"].includes(j.state)).forEach(j => Object.assign(j, { state: "error", msg: "El descargador de este PC dejó de responder." }));
            saveJobs(); renderDL(); break;
          }
        }
      }
    } finally { vigilandoLocal = false; }
  }
  function abrirLocal(j) { fetch(LOCAL + "/abrir?id=" + encodeURIComponent(j.localId)).catch(() => toast("El descargador de este PC no respondió.")); }
  // Vocerías del día: descarga automática opcional en este PC
  async function autoVocerias() {
    if (!store.get("dash.autovoc", false) || !local.activo || !(await revisarLocal())) return;
    const hechas = new Set(store.get("dash.autovoc.hechas", []));
    const nuevas = tvItems.filter(c => c.voceria && c.hoy && c.videoId && !hechas.has(c.videoId)).slice(0, 3);
    for (const c of nuevas) {
      if (await descargarLocal(c, c.url, true)) hechas.add(c.videoId);
    }
    if (nuevas.length) { store.set("dash.autovoc.hechas", [...hechas].slice(-300)); toast("⬇ " + nuevas.length + " vocería(s) nueva(s) descargándose en este PC."); }
  }
  if (jobs.some(j => j.local && !["listo", "error"].includes(j.state))) vigilarLocal();
  if (local.activo) revisarLocal(true);

  // Si el descargador de este PC aún no está instalado: guía de instalación y,
  // apenas responde, se descarga solo el video que se pidió.
  let guiaDlg = null, guiaPendiente = null;
  function guiaInstalar(c, url) {
    guiaPendiente = { c, url };
    if (!guiaDlg) {
      guiaDlg = el("dialog", { class: "dl-guia" },
        el("div", { class: "dlg" },
          el("h3", { text: "⬇ Falta un paso para descargar" }),
          el("p", {}, "Los videos se descargan con ", el("b", { text: "yt-dlp" }), " en este computador (YouTube bloquea las descargas desde la nube). Instálelo una sola vez:"),
          el("ol", {},
            el("li", {}, el("a", { class: "btn btn-dl", href: ZIP_DESCARGADOR, text: "⬇ Descargar instalador (ZIP)" })),
            el("li", {}, "Abra el ZIP y haga doble clic en ", el("b", { text: "«Instalar descargador.bat»" }), ". Si Windows avisa, elija ", el("b", { text: "Más información › Ejecutar de todas formas" }), "."),
            el("li", {}, "Cuando diga ", el("b", { text: "LISTO" }), ", este video se descargará solo. Si Chrome pregunta por acceso a aplicaciones de este equipo, elija ", el("b", { text: "Permitir" }), ".")),
          el("p", { class: "dl-guia-video" }),
          el("p", { class: "dl-guia-estado", text: "⏳ Esperando al descargador de este PC…" }),
          el("div", { class: "dlg-actions" },
            el("button", { class: "btn btn-ghost", text: "Cerrar", onclick: () => guiaDlg.close() }))));
      document.body.append(guiaDlg);
    }
    guiaDlg.querySelector(".dl-guia-video").textContent = "Video pendiente: " + (c.title || url);
    try { guiaDlg.showModal(); } catch { guiaDlg.setAttribute("open", ""); }
    esperarInstalacion();
  }
  let esperando = false;
  async function esperarInstalacion() {
    if (esperando) return; esperando = true;
    const fin = Date.now() + 20 * 60 * 1000;
    try {
      while (guiaDlg && guiaDlg.open && Date.now() < fin) {
        if (await revisarLocal(true)) {
          guiaDlg.querySelector(".dl-guia-estado").textContent = "✅ Descargador conectado. Iniciando la descarga…";
          await espera(900);
          guiaDlg.close();
          toast("✅ Descargador conectado.");
          if (guiaPendiente) { const p = guiaPendiente; guiaPendiente = null; descargarLocal(p.c, p.url); }
          return;
        }
        await espera(3000);
      }
    } finally { esperando = false; }
  }

  async function descargar(c) {
    const url = c.source_url || c.url;
    const ya = clips.find(x => x.source_url === url || (vidOf(url) && x.videoId === vidOf(url)));
    if (ya) { return bajarArchivo(ya, null); }
    // Siempre con yt-dlp en este PC; si no está instalado, guía de instalación (la descarga
    // desde GitHub queda solo si se activa a propósito: YouTube la bloquea sin cookies).
    if (await revisarLocal(true)) return descargarLocal(c, url);
    if (!token() || !store.get("dash.usarNube", false)) return guiaInstalar(c, url);
    if (jobs.some(j => j.url === url && !["listo", "error"].includes(j.state))) { toast("Ese video ya se está descargando."); return irA("descargas"); }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const j = { id, url, title: c.title, channel: c.channel, thumb: c.thumb, state: "solicitando", pct: 5, msg: "Enviando solicitud…", t: Date.now() };
    jobs.unshift(j); saveJobs(); irA("descargas");
    try {
      const r = await gh("/actions/workflows/clips.yml/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: { url, id } }) });
      if (r.status === 401 || r.status === 403) { setJob(j, { state: "error", msg: "Token inválido o sin permisos. Revise ⚙." }); return; }
      if (!r.ok) { setJob(j, { state: "error", msg: "GitHub rechazó la solicitud (" + r.status + ")." }); return; }
      setJob(j, { state: "en cola", pct: 10, msg: "En cola en el descargador…" });
      vigilar(j);
    } catch (e) { setJob(j, { state: "error", msg: "Sin conexión con GitHub." }); }
  }

  async function vigilar(j) {
    const fin = Date.now() + 20 * 60 * 1000;
    while (Date.now() < fin && !["listo", "error"].includes(j.state)) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        if (!j.run) {
          const r = await gh("/actions/workflows/clips.yml/runs?event=workflow_dispatch&per_page=15");
          const d = await r.json();
          const run = (d.workflow_runs || []).find(x => (x.display_title || x.name || "").includes(j.id));
          if (run) setJob(j, { run: run.id });
          continue;
        }
        const rr = await (await gh("/actions/runs/" + j.run)).json();
        if (rr.status !== "completed") {
          const jb = await (await gh("/actions/runs/" + j.run + "/jobs")).json();
          const steps = (jb.jobs && jb.jobs[0] && jb.jobs[0].steps) || [];
          const cur = steps.find(s => s.status === "in_progress") || steps.filter(s => s.status === "completed").pop();
          const pct = cur ? (PASOS[cur.name] || j.pct) : 12;
          const msg = !cur ? "Esperando un servidor libre…" : cur.name === "Descargar y comprimir clips" ? "Descargando y comprimiendo el video…" :
            cur.name === "Guardar cambios" ? "Publicando el archivo…" : "Preparando el descargador…";
          setJob(j, { state: "procesando", pct: Math.max(j.pct, pct), msg });
          continue;
        }
        if (rr.conclusion !== "success") { setJob(j, { state: "error", msg: "El descargador falló. Intente de nuevo." }); break; }
        // Leer clips.json actualizado
        const cj = await (await gh("/contents/data/clips.json?ref=main&t=" + Date.now(), { headers: { Accept: "application/vnd.github.raw+json" } })).json();
        const item = (cj.items || []).find(x => x.request_id === j.id);
        if (!item) {
          const err = (cj.errors || {})[j.id];
          setJob(j, { state: "error", msg: err || "No se pudo obtener el video desde la fuente." });
          break;
        }
        clips = cj.items || clips;
        setJob(j, { state: "bajando", pct: 90, msg: "Bajando archivo…", file: item.file, size: item.size, duration: item.duration, download_url: item.download_url });
        await bajarArchivo(item, j);
      } catch (e) { /* reintenta en el próximo ciclo */ }
    }
    if (!["listo", "error"].includes(j.state)) setJob(j, { state: "error", msg: "Tiempo de espera agotado." });
  }

  // Baja el MP4 dentro de la página (sin abrir otra pestaña) y lo guarda en el equipo
  async function bajarArchivo(item, j) {
    const guardar = (blob) => {
      const u = URL.createObjectURL(blob);
      blobs[item.file] = u;
      const a = el("a", { href: u, download: item.file, style: "display:none" });
      document.body.append(a); a.click(); a.remove();
    };
    if (blobs[item.file]) {
      const a = el("a", { href: blobs[item.file], download: item.file, style: "display:none" });
      document.body.append(a); a.click(); a.remove();
      if (!j) toast("Guardando " + item.file);
      return;
    }
    try {
      let r = null;
      if (token()) {
        const rel = await (await gh("/releases/tags/clips")).json();
        const as = (rel.assets || []).find(x => x.name === item.file);
        if (as) r = await gh("/releases/assets/" + as.id, { headers: { Accept: "application/octet-stream" } });
      }
      if (!r || !r.ok || !r.body) throw new Error("sin stream");
      const total = +r.headers.get("content-length") || item.size || 0;
      const reader = r.body.getReader(); const parts = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        parts.push(value); got += value.length;
        if (j && total) setJob(j, { pct: 90 + Math.round(got / total * 10), msg: "Bajando archivo… " + mb(got) + " de " + mb(total) });
      }
      guardar(new Blob(parts, { type: "video/mp4" }));
    } catch {
      // Alternativa: descarga directa en un marco oculto (el archivo se guarda sin salir de la página)
      const fr = el("iframe", { src: item.download_url, style: "display:none", title: "descarga" });
      document.body.append(fr); setTimeout(() => fr.remove(), 120000);
    }
    if (j) setJob(j, { state: "listo", pct: 100, msg: "Descargado · " + [dur(item.duration), mb(item.size)].filter(Boolean).join(" · ") });
    else toast("Descargando " + item.file);
  }

  function irA(tab) { const b = document.querySelector('.tab[data-tab="' + tab + '"]'); if (b) b.click(); }
  function updCount() {
    const act = jobs.filter(j => !["listo", "error"].includes(j.state)).length;
    $("#dl-active").textContent = act ? String(act) : "";
  }

  function acciones(c) {
    return el("div", { class: "dl-actions" },
      el("button", { class: "btn btn-share", text: "🔗 Compartir", title: "Copiar enlace de la noticia", onclick: () => copiar(c) }),
      el("button", { class: "btn btn-dl", text: "⬇ Descargar", title: "Descargar video comprimido", onclick: () => descargar(c) }),
      el("a", { class: "btn btn-ghost", href: c.source_url || c.url, target: "_blank", rel: "noopener", text: "▶ Ver", title: "Abrir la fuente del video" })
    );
  }

  function itemVideo(c, extra) {
    return el("li", { class: "dl-item" },
      el("img", { class: "dl-thumb", src: c.thumb || (vidOf(c.source_url || c.url) ? "https://i.ytimg.com/vi/" + vidOf(c.source_url || c.url) + "/mqdefault.jpg" : ""), alt: "", loading: "lazy" }),
      el("div", { class: "dl-info" },
        el("h3", { title: c.title, text: c.title }),
        el("div", { class: "dl-meta" }, el("b", { text: c.channel || "" }), " · " + hace(c.published || (c.t && new Date(c.t).toISOString()))),
        extra || null,
        acciones(c)
      ));
  }

  function bannerLocal() {
    if (local.ok) {
      const auto = el("input", { type: "checkbox" });
      auto.checked = store.get("dash.autovoc", false);
      auto.addEventListener("change", () => { store.set("dash.autovoc", auto.checked); if (auto.checked) { toast("Las vocerías del día se descargarán solas en este PC."); autoVocerias(); } });
      return el("li", { class: "dl-local ok" },
        el("div", { class: "dl-local-t" }, el("span", { class: "live-dot" }), "Descargador de este PC conectado",
          el("small", { text: local.ytdlp ? " · yt-dlp " + local.ytdlp : "" })),
        el("div", { class: "dl-local-c", title: local.carpeta, text: "Carpeta: " + local.carpeta }),
        el("div", { class: "dl-actions" },
          el("button", { class: "btn btn-ghost", text: "📂 Abrir carpeta", onclick: () => fetch(LOCAL + "/carpeta").catch(() => { }) })),
        el("label", { class: "dl-auto" }, auto, " Descargar automáticamente las vocerías del día"));
    }
    return el("li", { class: "dl-local" },
      el("div", { class: "dl-local-t", text: "⬇ Descargas con yt-dlp en este PC" }),
      el("p", { text: "YouTube bloquea las descargas desde servidores en la nube. Instale el descargador una vez en este computador (Windows) y los videos se guardarán comprimidos para WhatsApp en Descargas › Carabineros - Videos." }),
      el("div", { class: "dl-actions" },
        el("a", { class: "btn btn-dl", href: ZIP_DESCARGADOR, text: "⬇ Instalar descargador" }),
        el("button", { class: "btn btn-ghost", text: "↻ Ya lo instalé: conectar", onclick: async () => { toast((await revisarLocal(true)) ? "✅ Descargador conectado." : "No se encontró el descargador en este PC. ¿Terminó la instalación?"); renderDL(); } })));
  }
  const videosVistos = new Set();   // para marcar y animar los videos que llegan en vivo
  function renderDL() {
    const list = $("#dl-list"), camsBox = $("#cams");
    const isCam = dlTab === "camaras";
    list.hidden = isCam; camsBox.hidden = !isCam;
    $("#dl-search-wrap").hidden = dlTab !== "videos";
    $("#dl-note").textContent = isCam ? "Cámaras en vivo de Santiago. Si una se cae, se reemplaza sola por otra." :
      "Compartir copia el enlace · Descargar baja el video comprimido (MP4 480p) · Ver abre la fuente.";
    $("#dl-count").textContent = isCam ? cams.length : dlTab === "videos" ? tvItems.length : jobs.length + clips.length;
    if (isCam) { renderCams(); return; }
    const scrollAntes = list.scrollTop;
    list.innerHTML = "";
    const frag = document.createDocumentFragment();
    if (dlTab === "videos") {
      const items = tvItems.filter(c => !dlQuery || norm(c.title + " " + c.channel).includes(dlQuery));
      // Prioridad: 1) vocerías/cuñas de Carabineros de hoy, 2) Carabineros hoy, 3) el resto; dentro, lo más reciente arriba
      const grupo = c => c.hoy && c.voceria ? 0 : c.hoy && c.relevant ? 1 : c.relevant ? 2 : 3;
      items.sort((a, b) => grupo(a) - grupo(b) || (b.published || "").localeCompare(a.published || ""));
      if (!items.length) list.append(el("li", { class: "empty", text: "Sin videos recientes." }));
      const TIT = ["🎙 Vocerías y cuñas de Carabineros · hoy", "Carabineros · hoy", "Carabineros · días anteriores", "Otros videos recientes de los canales"];
      const primera = !videosVistos.size;
      let g0 = -1;
      items.slice(0, 180).forEach(c => {
        const g = grupo(c);
        if (g !== g0) { frag.append(el("li", { class: "dl-sec" + (g === 0 ? " dl-sec-voc" : ""), text: TIT[g] })); g0 = g; }
        const nuevo = !primera && !videosVistos.has(c.videoId);
        const tags = el("div", { class: "dl-tags" },
          nuevo ? el("span", { class: "nw-tag nw-nueva", text: "Nuevo" }) : null,
          c.voceria ? el("span", { class: "tag-voc", text: "Vocería" }) : null,
          c.relevant && !c.voceria ? el("span", { class: "tag-cc", text: "Carabineros" }) : null);
        const li = itemVideo(c, tags.childNodes.length ? tags : null);
        if (c.voceria && c.hoy) li.classList.add("dl-voc");
        if (nuevo) li.classList.add("entra");
        frag.append(li);
      });
      items.forEach(c => videosVistos.add(c.videoId));
      list.append(frag);
      list.scrollTop = scrollAntes;
      return;
    } else {
      frag.append(bannerLocal());
      if (!jobs.length && !clips.length) frag.append(el("li", { class: "empty", text: "Aún no hay descargas. Use «Descargar» en un video." }));
      if (jobs.length) frag.append(el("li", { class: "dl-sec", text: "En este equipo" }));
      jobs.forEach(j => {
        const fin = j.state === "listo", err = j.state === "error";
        const bar = el("div", { class: "prog" + (err ? " err" : fin ? " ok" : "") }, el("span", { style: "width:" + (err ? 100 : j.pct) + "%" }));
        const extra = el("div", { class: "job" }, bar, el("div", { class: "job-msg", text: (fin ? "✅ " : err ? "⚠ " : "⏳ ") + j.msg }),
          el("div", { class: "dl-actions" },
            el("button", { class: "btn btn-share", text: "🔗", title: "Copiar enlace de la noticia", onclick: () => copiar(j) }),
            el("a", { class: "btn btn-ghost", href: j.url, target: "_blank", rel: "noopener", text: "▶", title: "Ver la fuente" }),
            fin && j.local ? el("button", { class: "btn btn-dl", text: "📂 Abrir", title: "Mostrar el archivo en la carpeta", onclick: () => abrirLocal(j) }) : null,
            fin && !j.local ? el("button", { class: "btn btn-dl", text: "💾 Guardar otra vez", onclick: () => bajarArchivo({ file: j.file, size: j.size, duration: j.duration, download_url: j.download_url }, null) }) : null,
            err ? el("button", { class: "btn btn-dl", text: "↻ Reintentar", onclick: () => { jobs = jobs.filter(x => x !== j); saveJobs(); descargar(j); } }) : null,
            (fin || err) ? el("button", { class: "btn btn-ghost", text: "✕", title: "Quitar de la lista", onclick: () => { jobs = jobs.filter(x => x !== j); saveJobs(); renderDL(); } }) : null));
        frag.append(el("li", { class: "dl-item" },
          el("img", { class: "dl-thumb", src: j.thumb || (vidOf(j.url) ? "https://i.ytimg.com/vi/" + vidOf(j.url) + "/mqdefault.jpg" : ""), alt: "" }),
          el("div", { class: "dl-info" }, el("h3", { text: j.title || j.url }), el("div", { class: "dl-meta" }, el("b", { text: j.channel || "" }), " · " + hace(new Date(j.t).toISOString())), extra)));
      });
      if (clips.length) frag.append(el("li", { class: "dl-sec", text: "Archivos disponibles" }));
      clips.forEach(c => frag.append(itemVideo(c, el("div", { class: "dl-meta", text: "MP4 · " + [dur(c.duration), mb(c.size)].filter(Boolean).join(" · ") }))));
    }
    list.append(frag);
  }

  // ---- Cámaras de Santiago con reemplazo automático
  const CAM_SLOTS = 4;
  const camState = { slots: [], used: new Set() };
  function camSrc(id) { return "https://www.youtube.com/embed/" + id + "?" + YT_Q(); }
  function nextCam() { return cams.find(c => !camState.used.has(c.id)); }
  function loadCam(slot, cam) {
    if (slot.cam) camState.used.delete(slot.cam.id);
    slot.cam = cam || null; slot.ok = false; slot.stuck = 0; slot.started = Date.now();
    slot.player = null;
    slot.box.innerHTML = "";
    if (!cam) { slot.box.append(el("div", { class: "empty", text: "Buscando otra cámara…" })); slot.title.textContent = "Sin señal"; return; }
    camState.used.add(cam.id);
    slot.title.textContent = cam.title.replace(/\s*[|·].*$/, "").slice(0, 60) || cam.channel;
    slot.title.title = cam.title;
    const f = el("iframe", { src: camSrc(cam.id), allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, title: cam.title });
    slot.box.append(f);
    if (ytReady) try { slot.player = new YT.Player(f, { events: { onError: () => slot.cam === cam && replaceCam(slot), onStateChange: e => { if (e.data === 1) slot.ok = true; } } }); } catch { }
  }
  function replaceCam(slot) { const n = nextCam(); if (slot.cam) camState.used.delete(slot.cam.id); loadCam(slot, n || cams[(cams.indexOf(slot.cam) + 1) % cams.length]); }
  function renderCams() {
    const box = $("#cams");
    if (camState.slots.length) return;      // ya construidas (no recargar videos al cambiar de pestaña)
    box.innerHTML = "";
    if (!cams.length) { box.append(el("div", { class: "empty", text: "Buscando cámaras en vivo de Santiago…" })); return; }
    for (let i = 0; i < Math.min(CAM_SLOTS, cams.length); i++) {
      const title = el("span", { class: "cam-t" });
      const vbox = el("div", { class: "cam-v" });
      const slot = { box: vbox, title };
      const card = el("div", { class: "cam" },
        el("div", { class: "cam-h" }, el("span", { class: "live-dot" }), title,
          el("button", { class: "tbtn", title: "Cambiar cámara", text: "⇄", onclick: () => replaceCam(slot) }),
          el("button", { class: "tbtn", title: "Pantalla completa", text: "⛶", onclick: () => (card.requestFullscreen || function () { }).call(card) }),
          el("button", { class: "tbtn", title: "Ver en YouTube", text: "↗", onclick: () => slot.cam && window.open("https://www.youtube.com/watch?v=" + slot.cam.id, "_blank", "noopener") })),
        vbox);
      box.append(card); camState.slots.push(slot);
      loadCam(slot, nextCam());
    }
  }
  // Vigilante de cámaras (cada 20 s)
  setInterval(() => {
    camState.slots.forEach(slot => {
      if (!slot.cam) { const n = nextCam(); if (n) loadCam(slot, n); return; }
      let st = -1; try { st = slot.player && slot.player.getPlayerState ? slot.player.getPlayerState() : -1; } catch { }
      if (st === 1) { slot.ok = true; slot.stuck = 0; } else if (st === 0) slot.stuck = 9; else if (st !== 2) slot.stuck++;
      if (slot.stuck >= 3 || (!slot.ok && Date.now() - slot.started > 40000)) replaceCam(slot);
    });
  }, 20000);

  async function loadDL() {
    try { clips = (await getJSON("data/clips.json")).items || []; } catch { clips = []; }
    try { tvItems = (await getJSON("data/tv.json")).items || []; } catch { tvItems = []; }
    try {
      const nuevas = (await getJSON("data/camaras.json")).items || [];
      if (nuevas.length) {
        cams = nuevas;
        // cámaras que ya no están en vivo: reemplazarlas
        camState.slots.forEach(sl => { if (sl.cam && !cams.some(c => c.id === sl.cam.id)) replaceCam(sl); });
      }
    } catch { }
    if (local.activo) { await revisarLocal(); autoVocerias(); }
    if (dlTab !== "camaras" || !camState.slots.length) renderDL();
    updCount();
  }
  loadDL();
  setInterval(loadDL, (CFG.recargaSegundos || 120) * 1000);
  // retomar descargas que quedaron en curso
  jobs.filter(j => !["listo", "error"].includes(j.state)).forEach(j => { if (Date.now() - j.t < 20 * 60 * 1000) vigilar(j); else setJob(j, { state: "error", msg: "Se interrumpió la descarga." }); });
})();
