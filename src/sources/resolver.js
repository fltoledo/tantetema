// Decide el año "de la canción" cruzando fuentes.
//
// Problema: Deezer/Spotify informan la fecha del ÁLBUM donde está esa pista.
// Si es un remaster o un compilado, el año queda mal (Bohemian Rhapsody 2011).
// Solución: tomar el año más antiguo entre
//   - fecha de Deezer (si el álbum no parece compilado/remaster)
//   - primera edición en MusicBrainz por ISRC
//   - primera edición en MusicBrainz buscando artista + título
// y descartar la pista si no hay ningún dato confiable.
import { looksLikeCompilation, yearOf } from "../text.js";

const cache = new Map(); // deezerId -> resultado

export function createResolver({ deezer, musicbrainz, log = () => {} }) {
  return {
    async resolve(track) {
      if (cache.has(track.deezerId)) return cache.get(track.deezerId);
      const detail = await deezer.track(track.deezerId);
      const t = { ...track, ...detail };

      const dzYear = yearOf(t.releaseDate);
      const dzTrusted = dzYear && !looksLikeCompilation(t.album);

      let isrcYear = null;
      let searchYear = null;
      try {
        if (t.isrc) isrcYear = await musicbrainz.yearByIsrc(t.isrc, t);
      } catch (e) {
        log("mb isrc", e.message);
      }
      try {
        searchYear = await musicbrainz.yearBySearch(t);
      } catch (e) {
        log("mb search", e.message);
      }

      const out = decideYear({ dzYear, dzTrusted, isrcYear, searchYear });
      const result = out ? { ...t, year: out.year, confidence: out.confidence, sources: out.sources } : null;
      cache.set(track.deezerId, result);
      return result;
    },
  };
}

export function decideYear({ dzYear, dzTrusted, isrcYear, searchYear }) {
  const candidates = [];
  if (dzYear && dzTrusted) candidates.push(["deezer", dzYear]);
  if (isrcYear) candidates.push(["musicbrainz-isrc", isrcYear]);
  if (searchYear) candidates.push(["musicbrainz", searchYear]);
  // Si Deezer es lo único que hay pero parece compilado, no sirve.
  if (!candidates.length) return null;

  const year = Math.min(...candidates.map((c) => c[1]));
  const agree = candidates.filter((c) => Math.abs(c[1] - year) <= 1).length;
  let confidence = "low";
  if (candidates.length >= 2 && agree >= 2) confidence = "high";
  else if (searchYear || isrcYear) confidence = "medium";
  return { year, confidence, sources: Object.fromEntries(candidates) };
}

export function _clearCache() {
  cache.clear();
}
