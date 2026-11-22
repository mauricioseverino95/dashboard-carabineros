# Centro de Monitoreo de Medios · Carabineros de Chile

Dashboard web gratuito y siempre en línea: 5 señales en vivo, hora y clima de Santiago, noticias de todos los medios y clips de TV comprimidos para WhatsApp.

Dirección: https://mauricioseverino95.github.io/dashboard-carabineros/

## Logos

Suba los archivos oficiales a la carpeta `assets/` con estos nombres exactos: `logo-carabineros.png` (principal) y `logo-secundario.png` (opcional). PNG con fondo transparente, unos 200 px de alto.

## Uso diario

- **Canales**: 🔇/🔊 audio (un canal a la vez), ⤢ destacar en grande, ↻ recargar, ⛶ pantalla completa, ↗ señal oficial.
- **Noticias**: se actualizan cada 15 minutos. Las nuevas aparecen con franja dorada. Buscador y filtros Web / TV / Redes.
- **Descargas → Listos para WhatsApp**: MP4 480p (~15 MB) generados cada 30 minutos cuando un canal publica una nota sobre Carabineros.
- **Descargas → Todo lo emitido**: «Solicitar» copia el enlace y abre GitHub Actions → *Clips para WhatsApp* → **Run workflow** → pegue el enlace.

## Personalizar

- `config.js`: título, canales, ciudad del clima, enlaces a redes.
- `scripts/fuentes.json`: palabras clave y fuentes RSS.
- `css/styles.css`: colores (`--verde`, `--oro`).

## Limitaciones

- Las señales dependen de que cada canal transmita en YouTube; si no, el recuadro ofrece la señal oficial.
- X, Instagram, TikTok y Facebook no permiten lectura automática gratuita: hay botones de búsqueda en vivo.
- YouTube a veces bloquea descargas desde la nube. Si fallan seguido, agregue el secret `YT_COOKIES` (Settings → Secrets and variables → Actions) con cookies de una cuenta de YouTube dedicada.
- Los videos pertenecen a cada canal: solo para monitoreo interno. El repositorio es público.
