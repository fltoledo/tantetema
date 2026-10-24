// Cliente mínimo de la API pública de Deezer (sin clave).
// Docs: https://developers.deezer.com/api
import { jsonp, RateLimiter, withRetry } from "./http.js";

const BASE = "https://api.deezer.com";
// Límite publicado: 50 requests cada 5 segundos.
const limiter = new RateLimiter(120);

// `request(url)` se puede inyectar (tests). Por defecto usa JSONP en el navegador.
export function createDeezer({ request = jsonp } = {}) {
  async function call(path) {
    return withRetry(async () => {
      const data = await limiter.schedule(() => request(BASE + path));
      if (data && data.error) {
        const err = new Error(`Deezer: ${data.error.message || data.error.type}`);
        err.retryable = data.error.code === 4; // 4 = cuota
        throw err;
      }
      return data;
    });
  }

  return {
    async searchPlaylists(q, limit = 25) {
      const d = await call(`/search/playlist?q=${encodeURIComponent(q)}&limit=${limit}`);
      return (d.data || []).map((p) => ({ id: p.id, title: p.title, nbTracks: p.nb_tracks ?? 0 }));
    },

    async playlistTracks(id, { limit = 100, index = 0 } = {}) {
      const d = await call(`/playlist/${id}/tracks?limit=${limit}&index=${index}`);
      return { total: d.total ?? 0, tracks: (d.data || []).map(mapTrack) };
    },

    // Detalle: trae ISRC y fecha de lanzamiento.
    async track(id) {
      const t = await call(`/track/${id}`);
      return {
        ...mapTrack(t),
        isrc: t.isrc || null,
        releaseDate: t.release_date || t.album?.release_date || null,
      };
    },
  };
}

export function mapTrack(t) {
  return {
    deezerId: t.id,
    title: t.title_short || t.title,
    fullTitle: t.title,
    artist: t.artist?.name || "",
    album: t.album?.title || "",
    rank: t.rank ?? 0,
    preview: t.preview || null,
    link: t.link || null,
    cover: t.album?.cover_medium || null,
    readable: t.readable !== false,
  };
}

// Acepta "https://www.deezer.com/xx/playlist/123" o directamente el id.
export function parsePlaylistRef(ref = "") {
  const s = String(ref).trim();
  const m = /playlist\/(\d+)/.exec(s) || /^(\d{3,})$/.exec(s);
  return m ? Number(m[1]) : null;
}
