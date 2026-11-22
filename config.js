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

  // Canales en vivo (YouTube). "videoId" es opcional: si lo completa, se fuerza
  // ese video en vivo. Si queda vacío, el sistema detecta solo la transmisión.
  canales: [
    { clave: "c13",  nombre: "Canal 13 · T13 En Vivo", corto: "T13",
      youtube: "UCsRnhjcUCR78Q3Ud6OXCTNg", videoId: "", oficial: "https://www.t13.cl/en-vivo" },
    { clave: "tvn",  nombre: "TVN", corto: "TVN",
      youtube: "UCaVaCaiG6qRzDiJDuEGKOhQ", videoId: "", oficial: "https://www.tvn.cl" },
    { clave: "mega", nombre: "Meganoticias Ahora", corto: "MEGA",
      youtube: "UCkccyEbqhhM3uKOI6Shm-4Q", videoId: "", oficial: "https://www.meganoticias.cl/senal-en-vivo/" },
    { clave: "24h",  nombre: "24 Horas · TVN", corto: "24H",
      youtube: "UCTXNz3gjAypWp3EhlIATEJQ", videoId: "", oficial: "https://www.24horas.cl" },
    { clave: "chv",  nombre: "CHV Noticias", corto: "CHV",
      youtube: "UCRsUoZYC1ULUspipMRnMhwg", videoId: "", oficial: "https://www.chvnoticias.cl" }
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
  recargaSegundos: 120
};
