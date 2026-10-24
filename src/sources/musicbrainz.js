// MusicBrainz: fecha de primera edición de una grabación.
// Reglas de uso: máximo 1 request por segundo por IP (cada moderador usa su propio celu).
// https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
import { fetchJson, RateLimiter, withRetry } from "./http.js";
import { norm, cleanTitle, yearOf, isUnwantedVersion } from "../text.js";

const BASE = "https://musicbrainz.org/ws/2";
const limiter = new RateLimiter(1100);

export function earliestRecordingYear(recordings, { title, artist = null, minScore = 0 }) {
  const nt = norm(cleanTitle(title));
  const na = artist ? norm(artist) : null;
  let best = null;
  for (const r of recordings || []) {
    if ((r.score ?? 100) < minScore) continue;
    if (isUnwantedVersion(r.title || "", r.disambiguation || "")) continue;
    if (nt && norm(cleanTitle(r.title)) !== nt) continue;
    if (na) {
      const credit = norm((r["artist-credit"] || []).map((c) => c.name + (c.joinphrase || "")).join(""));
      const main = na.split(/ and | feat | ft | x | y /)[0].trim();
      if (!credit.includes(main) && !na.includes(credit)) continue;
    }
    const y = yearOf(r["first-release-date"]);
    if (y && (best === null || y < best)) best = y;
  }
  return best;
}

export function createMusicBrainz({ fetchImpl } = {}) {
  const call = (path) => withRetry(() => limiter.schedule(() => fetchJson(BASE + path, { fetchImpl })));

  return {
    async yearByIsrc(isrc, { title }) {
      const d = await call(`/recording?query=isrc:${encodeURIComponent(isrc)}&fmt=json&limit=25`);
      return earliestRecordingYear(d.recordings, { title });
    },
    async yearBySearch({ title, artist }) {
      const q = `recording:"${cleanTitle(title).replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
      const d = await call(`/recording?query=${encodeURIComponent(q)}&fmt=json&limit=25`);
      return earliestRecordingYear(d.recordings, { title, artist, minScore: 80 });
    },
  };
}
