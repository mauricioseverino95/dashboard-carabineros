/* Radio Carabineros de Chile — banner inferior con reproducción en vivo.
   Controles: reproducir/pausa, silenciar, volumen. Reconecta solo si la señal se corta. */
(function () {
  "use strict";
  const FUENTES = (window.DASH_CONFIG && DASH_CONFIG.radio && DASH_CONFIG.radio.fuentes) || [
    "https://streaming.prositel.cl/8374/stream"
  ];
  const $ = id => document.getElementById(id);
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };

  const svg = p => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${p}</svg>`;
  const ICON = {
    play: svg('<path fill="currentColor" d="M8 5.5v13l11-6.5z"/>'),
    pausa: svg('<path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'),
    vol2: svg('<path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    vol1: svg('<path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    mudo: svg('<path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>')
  };

  const audio = new Audio();
  audio.preload = "none";
  let quiereSonar = false, fuente = 0, reintentos = 0, timerReintento = null, timerVigia = null, ultimoT = 0;

  const el = {
    bar: $("radio"), play: $("rd-play"), mute: $("rd-mute"), vol: $("rd-vol"),
    volTxt: $("rd-vol-txt"), estado: $("rd-estado")
  };
  if (!el.bar) return;

  // --- volumen y silencio recordados
  audio.volume = leer("dash.radio.vol", 0.7);
  audio.muted = leer("dash.radio.mute", false);
  el.vol.value = Math.round(audio.volume * 100);

  function pintar() {
    const sonando = quiereSonar && !audio.paused;
    el.bar.classList.toggle("on", sonando);
    el.play.innerHTML = quiereSonar ? ICON.pausa : ICON.play;
    el.play.setAttribute("aria-label", quiereSonar ? "Pausar radio" : "Reproducir radio");
    el.play.title = quiereSonar ? "Pausar" : "Reproducir";
    const v = audio.muted ? 0 : audio.volume;
    el.mute.innerHTML = audio.muted || v === 0 ? ICON.mudo : v < 0.5 ? ICON.vol1 : ICON.vol2;
    el.mute.title = audio.muted ? "Activar sonido" : "Silenciar";
    el.mute.setAttribute("aria-pressed", audio.muted ? "true" : "false");
    el.volTxt.textContent = audio.muted ? "Mudo" : Math.round(audio.volume * 100) + "%";
    el.vol.style.setProperty("--p", (audio.muted ? 0 : audio.volume * 100) + "%");
  }
  function estado(txt, tipo) {
    el.estado.textContent = txt;
    el.estado.dataset.tipo = tipo || "";
  }

  // --- conexión (siempre en vivo: al reanudar se vuelve a conectar, sin retraso)
  function conectar() {
    clearTimeout(timerReintento);
    estado("Conectando…", "carga");
    audio.src = FUENTES[fuente] + (FUENTES[fuente].includes("?") ? "&" : "?") + "_=" + Date.now();
    audio.load();
    audio.play().then(() => { reintentos = 0; }).catch(err => {
      if (err && err.name === "NotAllowedError") {          // el navegador exige un clic
        quiereSonar = false; estado("Pulse ▶ para escuchar", ""); pintar();
      } else fallo();
    });
  }
  function fallo() {
    if (!quiereSonar) return;
    reintentos++;
    if (FUENTES.length > 1) fuente = (fuente + 1) % FUENTES.length;
    const espera = Math.min(30, 2 * reintentos);
    estado(`Señal interrumpida · reintentando en ${espera}s`, "error");
    clearTimeout(timerReintento);
    timerReintento = setTimeout(() => quiereSonar && conectar(), espera * 1000);
  }
  function detener() {
    clearTimeout(timerReintento);
    audio.pause();
    audio.removeAttribute("src"); audio.load();               // corta la descarga del stream
    estado("En pausa", "");
  }

  audio.addEventListener("playing", () => { estado("En vivo", "vivo"); reintentos = 0; pintar(); });
  audio.addEventListener("waiting", () => quiereSonar && estado("Cargando…", "carga"));
  audio.addEventListener("error", () => quiereSonar && fallo());
  audio.addEventListener("ended", () => quiereSonar && fallo());
  audio.addEventListener("stalled", () => quiereSonar && estado("Señal débil…", "carga"));
  audio.addEventListener("pause", pintar);
  audio.addEventListener("volumechange", pintar);

  // Vigía: si el audio deja de avanzar 20 s estando en "play", reconectar
  timerVigia = setInterval(() => {
    if (!quiereSonar || audio.paused) return;
    if (audio.currentTime === ultimoT) { if (++audio._quieto >= 4) { audio._quieto = 0; fallo(); } }
    else audio._quieto = 0;
    ultimoT = audio.currentTime;
  }, 5000);
  audio._quieto = 0;

  // --- controles
  el.play.addEventListener("click", () => {
    quiereSonar = !quiereSonar;
    if (quiereSonar) conectar(); else detener();
    pintar();
  });
  el.mute.addEventListener("click", () => {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      if (audio.volume === 0) { audio.volume = 0.5; el.vol.value = 50; }
    } else audio.muted = true;
    guardar("dash.radio.mute", audio.muted); guardar("dash.radio.vol", audio.volume);
  });
  el.vol.addEventListener("input", () => {
    audio.volume = el.vol.value / 100;
    audio.muted = audio.volume === 0;
    guardar("dash.radio.vol", audio.volume); guardar("dash.radio.mute", audio.muted);
  });
  // Teclas de medios del teclado / auriculares
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Radio Carabineros de Chile", artist: "98.1 FM · 820 AM · En vivo",
        artwork: [{ src: "assets/logo-carabineros.png", sizes: "147x200", type: "image/png" }]
      });
      navigator.mediaSession.setActionHandler("play", () => { if (!quiereSonar) el.play.click(); });
      navigator.mediaSession.setActionHandler("pause", () => { if (quiereSonar) el.play.click(); });
    } catch { }
  }


  estado(audio.muted ? "Silenciada · pulse ▶" : "Pulse ▶ para escuchar", "");
  pintar();
})();
