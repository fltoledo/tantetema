# Tantetema: contexto para Claude

Juego de fiesta estilo "línea de tiempo musical": un celu modera y pone la música, y cada equipo ubica las canciones por año desde su propio celu. Autor: Fede (Federico Toledo). Todo en español rioplatense.

## Decisiones tomadas

- **Sitio estático en GitHub Pages**, sin backend propio. Deploy con `.github/workflows/pages.yml` (tests → deploy).
- **Sincronización**: Supabase Realtime *broadcast* (sin tablas). La URL y la publishable key están en `src/config.js`; son públicas por diseño. Sin config, cae a `BroadcastChannel` (pestañas del mismo navegador).
- **El celu del moderador es la fuente de verdad** (`src/host.js`): corre `Game`, elige las canciones y publica `game.view({ role: "team" })`, que no incluye la canción antes de revelar. Los equipos (`src/team.js`) mandan acciones `place`, `unplace`, `challenge` y `buy`.
- **Canciones al azar desde Deezer** (API pública, por JSONP porque no tiene CORS): búsqueda de playlists por país o estilo (`src/sources/presets.js`) más búsquedas y playlists propias del moderador. Se filtran por `rank`, versiones (en vivo, remix, karaoke), un máximo de 2 por artista y sin repetidos.
- **El año se resuelve cruzando fuentes** (`src/sources/resolver.js`): fecha de Deezer (si el álbum no es compilado) + MusicBrainz por ISRC + MusicBrainz por artista y título → se toma el más antiguo. Si no hay dato confiable, el tema se descarta. MusicBrainz permite 1 request por segundo.
- **No se usa la API de Spotify**: desde feb-2026 el modo desarrollo exige Premium, tiene un tope de 5 usuarios, no devuelve `popularity` y no lee playlists ajenas. Spotify y YouTube quedan solo como links de búsqueda.
- **Reglas**: modo "todos a la vez" (por defecto) o "por turnos" con desafíos (1 ficha). Fichas: +1 si adivinan artista y canción (lo otorga el moderador), comprar carta por 3, máximo 5. El moderador puede corregir el año después de revelar y la ronda se recalcula.

## Desarrollo

- Sin build ni dependencias. `npm run dev` sirve el sitio y `npm test` corre los tests con `node:test`.
- `?mock` en la URL usa canciones fijas, sin red.
- La lógica del juego (`src/game.js`) y las fuentes no tocan el DOM, para que sean testeables desde Node.

## Pendiente

- **Probar con red real**: Deezer por JSONP, MusicBrainz por CORS y Supabase Realtime. Nunca se probaron fuera del entorno de desarrollo (allí esos servicios estaban bloqueados).
- Verificar que los previews de Deezer reproduzcan en iOS Safari.
- Ajustar los umbrales de `rank` en `feed.js` según cómo salgan los mazos por país.
