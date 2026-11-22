/* =========================================================
   Mapa en vivo de noticias de Chile
   ========================================================= */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const TZ = "America/Santiago";
  const NIVEL = {
    4: { nombre: "Crítica", color: "#E53935" },
    3: { nombre: "Alta", color: "#FB8C00" },
    2: { nombre: "Media", color: "#C9A227" },
    1: { nombre: "Informativa", color: "#2E9E5B" }
  };
  const ICONO = {
    "Homicidio / armas": "✸", "Robo / asalto": "⚑", "Drogas": "⬢", "Incendio / emergencia": "🔥",
    "Accidente de tránsito": "⚠", "Protesta / orden público": "✊", "Operativo policial": "★", "Información general": "●"
  };
  const CAPAS = {
    tactico: { n: "Táctico", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", a: "&copy; OpenStreetMap &copy; CARTO" },
    calles: { n: "Calles", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", a: "&copy; OpenStreetMap &copy; CARTO" },
    satelite: { n: "Satélite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", a: "Imágenes &copy; Esri" }
  };

  let map, capa, capaActual = "tactico", layerGroup, items = [], marcadores = {}, seen = new Set(), timer = null;
  const filtro = { niveles: new Set([1, 2, 3, 4]), horas: 24, soloCarab: false, q: "" };

  const fRel = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const fHora = new Intl.DateTimeFormat("es-CL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: false });
  function hace(iso) {
    if (!iso) return "";
    const s = (new Date(iso) - Date.now()) / 1000;
    if (s > -60) return "ahora";
    if (s > -3600) return fRel.format(Math.round(s / 60), "minute");
    if (s > -86400) return fRel.format(Math.round(s / 3600), "hour");
    return fHora.format(new Date(iso));
  }
  const esc = t => String(t || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function cargarLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((res, rej) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.append(css);
      const js = document.createElement("script");
      js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      js.onload = res; js.onerror = rej;
      document.head.append(js);
    });
  }

  function construirUI() {
    const ov = document.createElement("div");
    ov.id = "mapa-ov"; ov.className = "mp-ov"; ov.hidden = true;
    ov.innerHTML = `
      <header class="mp-top">
        <div class="mp-brand"><span class="mp-live"><i></i>EN VIVO</span><b>Mapa de noticias · Chile</b></div>
        <div class="mp-stats" id="mp-stats"></div>
        <div class="mp-tools">
          <div class="mp-seg" id="mp-horas">
            <button data-h="6">6 h</button><button data-h="24" class="on">24 h</button><button data-h="72">72 h</button>
          </div>
          <div class="mp-seg" id="mp-capas">
            <button data-c="tactico" class="on">Táctico</button><button data-c="calles">Calles</button><button data-c="satelite">Satélite</button>
          </div>
          <button class="mp-close" id="mp-close" title="Cerrar mapa (Esc)">✕</button>
        </div>
      </header>
      <div class="mp-body">
        <aside class="mp-side">
          <input type="search" id="mp-q" placeholder="Buscar lugar o tema…">
          <div class="mp-niv" id="mp-niv"></div>
          <label class="mp-chk"><input type="checkbox" id="mp-carab"> Solo noticias de Carabineros</label>
          <ul class="mp-list" id="mp-list"></ul>
        </aside>
        <div class="mp-map" id="mp-map"></div>
      </div>
      <div class="mp-ticker"><span>ÚLTIMO</span><div class="mp-tt"><div id="mp-tick"></div></div></div>`;
    document.body.append(ov);

    const niv = $("#mp-niv");
    [4, 3, 2, 1].forEach(n => {
      const b = document.createElement("button");
      b.className = "on"; b.dataset.n = n;
      b.innerHTML = `<i style="background:${NIVEL[n].color}"></i>${NIVEL[n].nombre} <b id="mp-c${n}">0</b>`;
      b.onclick = () => { filtro.niveles.has(n) ? filtro.niveles.delete(n) : filtro.niveles.add(n); b.classList.toggle("on"); pintar(); };
      niv.append(b);
    });
    $("#mp-horas").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      filtro.horas = +b.dataset.h;
      $("#mp-horas").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      pintar();
    });
    $("#mp-capas").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      $("#mp-capas").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      ponerCapa(b.dataset.c);
    });
    $("#mp-q").addEventListener("input", e => { filtro.q = norm(e.target.value.trim()); pintar(); });
    $("#mp-carab").addEventListener("change", e => { filtro.soloCarab = e.target.checked; pintar(); });
    $("#mp-close").onclick = cerrar;
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) cerrar(); });
  }

  function ponerCapa(k) {
    capaActual = k;
    if (capa) map.removeLayer(capa);
    capa = L.tileLayer(CAPAS[k].url, { attribution: CAPAS[k].a, maxZoom: 18, subdomains: "abcd" }).addTo(map);
    document.getElementById("mp-map").dataset.capa = k;
  }

  function icono(it, nuevo) {
    const c = NIVEL[it.gravedad] || NIVEL[1];
    const size = 14 + it.gravedad * 3;
    return L.divIcon({
      className: "mp-pin",
      html: `<span class="mp-dot${it.gravedad >= 3 ? " pulse" : ""}${nuevo ? " nuevo" : ""}" style="--c:${c.color};--s:${size}px"><em>${ICONO[it.categoria] || "●"}</em></span>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
  }

  function visibles() {
    const lim = Date.now() - filtro.horas * 3600 * 1000;
    return items.filter(it =>
      filtro.niveles.has(it.gravedad) &&
      (!filtro.soloCarab || it.carab) &&
      (!it.published || new Date(it.published).getTime() >= lim) &&
      (!filtro.q || norm(it.title + " " + it.lugar + " " + it.categoria + " " + it.source).includes(filtro.q)));
  }

  function popup(it) {
    const c = NIVEL[it.gravedad];
    return `<div class="mp-pop">
      <div class="mp-pop-h"><span style="background:${c.color}">${c.nombre}</span>${esc(it.categoria)}</div>
      <h4>${esc(it.title)}</h4>
      ${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
      <div class="mp-pop-m">📍 ${esc(it.lugar)}${it.precision !== "comuna" ? " (aprox.)" : ""} · ${esc(it.source)} · ${hace(it.published)}</div>
      <a href="${esc(it.url)}" target="_blank" rel="noopener">Abrir noticia ↗</a></div>`;
  }

  function pintar() {
    if (!map) return;
    const vis = visibles();
    const ids = new Set(vis.map(v => v.id));
    Object.keys(marcadores).forEach(id => { if (!ids.has(id)) { layerGroup.removeLayer(marcadores[id]); delete marcadores[id]; } });
    vis.slice().sort((a, b) => a.gravedad - b.gravedad).forEach(it => {
      if (marcadores[it.id]) return;
      const nuevo = seen.size && !seen.has(it.id);
      const m = L.marker([it.lat, it.lon], { icon: icono(it, nuevo), riseOnHover: true, zIndexOffset: it.gravedad * 100 })
        .bindPopup(popup(it), { maxWidth: 320, className: "mp-popup" })
        .bindTooltip(esc(it.title), { direction: "top", offset: [0, -8], className: "mp-tip" });
      layerGroup.addLayer(m); marcadores[it.id] = m;
    });
    // contadores
    const base = items.filter(it => (!filtro.soloCarab || it.carab) && (!it.published || new Date(it.published).getTime() >= Date.now() - filtro.horas * 3600e3));
    [1, 2, 3, 4].forEach(n => { const e = $("#mp-c" + n); if (e) e.textContent = base.filter(i => i.gravedad === n).length; });
    const regiones = new Set(vis.map(v => v.lugar)).size;
    $("#mp-stats").innerHTML = `<span><b>${vis.length}</b> eventos</span><span><b>${regiones}</b> lugares</span><span><b>${vis.filter(v => v.gravedad === 4).length}</b> críticos</span>`;
    // lista
    const ul = $("#mp-list"); ul.innerHTML = "";
    vis.slice(0, 250).forEach(it => {
      const li = document.createElement("li");
      li.className = seen.size && !seen.has(it.id) ? "nuevo" : "";
      li.innerHTML = `<i style="background:${NIVEL[it.gravedad].color}"></i><div><b>${esc(it.title)}</b>
        <small>📍 ${esc(it.lugar)} · ${esc(it.categoria)} · ${hace(it.published)}</small></div>`;
      li.onclick = () => { map.flyTo([it.lat, it.lon], Math.max(map.getZoom(), 12), { duration: .8 }); setTimeout(() => marcadores[it.id] && marcadores[it.id].openPopup(), 850); };
      ul.append(li);
    });
    if (!vis.length) ul.innerHTML = `<li class="vacio">Sin eventos para estos filtros.</li>`;
    // cinta
    $("#mp-tick").innerHTML = vis.slice(0, 15).map(it => `<span><i style="background:${NIVEL[it.gravedad].color}"></i><b>${esc(it.lugar)}:</b> ${esc(it.title)}</span>`).join("");
  }

  async function cargarDatos() {
    try {
      const r = await fetch("data/mapa.json?t=" + Date.now(), { cache: "no-store" });
      const d = await r.json();
      const prev = new Set(items.map(i => i.id));
      items = (d.items || []).filter(i => typeof i.lat === "number");
      if (!seen.size) items.forEach(i => seen.add(i.id));
      else {
        // marcadores nuevos: redibujar para que destaquen
        items.forEach(i => { if (!prev.has(i.id) && marcadores[i.id]) { layerGroup.removeLayer(marcadores[i.id]); delete marcadores[i.id]; } });
      }
      pintar();
      setTimeout(() => items.forEach(i => seen.add(i.id)), 60000);
    } catch (e) {
      $("#mp-stats").innerHTML = "<span>No se pudieron cargar los datos del mapa</span>";
    }
  }

  async function abrir() {
    if (!$("#mapa-ov")) construirUI();
    $("#mapa-ov").hidden = false;
    document.body.classList.add("mp-abierto");
    try { await cargarLeaflet(); } catch { $("#mp-stats").innerHTML = "<span>No se pudo cargar el mapa</span>"; return; }
    if (!map) {
      map = L.map("mp-map", { zoomControl: true, worldCopyJump: false, minZoom: 3 }).setView([-33.45, -70.66], 6);
      ponerCapa(capaActual);
      layerGroup = L.layerGroup().addTo(map);
      L.control.scale({ imperial: false }).addTo(map);
      let primero = true;
      const ajustar = () => {
        map.invalidateSize();
        if (primero && $("#mp-map").clientWidth > 300) { primero = false; map.fitBounds([[-41.5, -74.5], [-18.3, -68.5]]); }
      };
      if (window.ResizeObserver) new ResizeObserver(ajustar).observe($("#mp-map"));
      window.addEventListener("resize", ajustar);
      ajustar();
    }
    [50, 300, 900].forEach(t => setTimeout(() => map.invalidateSize(), t));
    await cargarDatos();
    clearInterval(timer);
    timer = setInterval(cargarDatos, 60000);          // actualización constante (cada minuto)
  }
  function cerrar() {
    $("#mapa-ov").hidden = true;
    document.body.classList.remove("mp-abierto");
    clearInterval(timer);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("btn-mapa");
    if (b) b.addEventListener("click", abrir);
  });
  if (document.readyState !== "loading") { const b = document.getElementById("btn-mapa"); if (b) b.addEventListener("click", abrir); }
})();
