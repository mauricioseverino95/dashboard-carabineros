// =====================================================================
//  CONFIGURACIÓN DEL DASHBOARD — edite este archivo para ajustar canales
// =====================================================================
window.DASH_CONFIG = {
  titulo: "Centro de Monitoreo de Medios",
  subtitulo: "Carabineros de Chile",

  // Usuario/repositorio de GitHub donde se publica (se usa para el botón
  // "Solicitar descarga"). Ejemplo: "miusuario/dashboard-carabineros"
  repoGithub: "mauricioseverino95/dashboard-carabineros",

  // Ciudad para el clima (Santiago de Chile)
  clima: { lat: -33.4489, lon: -70.6693, nombre: "Santiago" },

  // Canales en vivo. "fuentes" va en orden de prioridad; si una cae, el dashboard
  // pasa sola a la siguiente y cada 10 min vuelve a intentar la primera.
  //   iframe  = reproductor oficial del canal (T13 y CHV permiten insertarlo)
  //   yt-auto = transmisiones en vivo del canal oficial en YouTube (se detectan
  //             solas cada 10 min; hay varias por canal como respaldo)
  //   hls     = enlace .m3u8 directo, si el canal lo permite desde otros sitios
  // TVN, 24 Horas y Mega bloquean su reproductor fuera de sus propios sitios,
  // por eso usan sus canales oficiales de YouTube.
  canales: [
    { clave: "c13", nombre: "Canal 13 · T13 En Vivo", corto: "T13", oficial: "https://www.t13.cl/en-vivo",
      youtube: "UCsRnhjcUCR78Q3Ud6OXCTNg", videoId: "",
      fuentes: [
        { tipo: "iframe", nombre: "Señal oficial T13 (t13.cl)", url: "https://rudo.video/live/t13?autostart=1&volume=0" },
        { tipo: "yt-auto" }
      ] },
    { clave: "tvn", nombre: "TVN", corto: "TVN", oficial: "https://www.24horas.cl/envivo",
      youtube: "UCaVaCaiG6qRzDiJDuEGKOhQ", videoId: "",
      fuentes: [ { tipo: "yt-auto" } ] },
    { clave: "mega", nombre: "Meganoticias Ahora", corto: "MEGA", oficial: "https://www.meganoticias.cl/senal-en-vivo/meganoticias/",
      youtube: "UCkccyEbqhhM3uKOI6Shm-4Q", videoId: "",
      fuentes: [ { tipo: "yt-auto" } ] },
    { clave: "24h", nombre: "24 Horas · TVN", corto: "24H", oficial: "https://www.24horas.cl/envivo",
      youtube: "UCTXNz3gjAypWp3EhlIATEJQ", videoId: "",
      fuentes: [ { tipo: "yt-auto" } ] },
    { clave: "chv", nombre: "CHV Noticias", corto: "CHV", oficial: "https://www.chvnoticias.cl/senal-online/",
      youtube: "UCRsUoZYC1ULUspipMRnMhwg", videoId: "",
      fuentes: [
        { tipo: "iframe", nombre: "Señal oficial CHV Noticias", url: "https://mdstrm.com/live-stream/6491ced935a5833c47dd7f41?autoplay=true&mute=true",
          verificar: "https://mdstrm.com/live-stream-playlist/6491ced935a5833c47dd7f41.m3u8" },
        { tipo: "yt-auto" }
      ] }
  ],

  // Búsquedas rápidas en redes sociales (se abren en pestaña nueva)
  redes: [
    { nombre: "X / Twitter", url: "https://x.com/search?q=carabineros&f=live" },
    { nombre: "TikTok",      url: "https://www.tiktok.com/search?q=carabineros" },
    { nombre: "Instagram",   url: "https://www.instagram.com/explore/tags/carabineros/" },
    { nombre: "Facebook",    url: "https://www.facebook.com/search/posts?q=carabineros" },
    { nombre: "YouTube",     url: "https://www.youtube.com/results?search_query=carabineros&sp=CAI%253D" }
  ],

  // Cada cuántos segundos se recargan noticias y descargas en pantalla
  recargaSegundos: 60
};
