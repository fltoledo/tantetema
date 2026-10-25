// Fuente de canciones de una partida: arma candidatos al azar desde Deezer,
// resuelve el año de cada uno y mantiene un buffer de canciones listas.
import { PRESETS, DECADE_HINTS, LEVELS, DEFAULT_LEVEL } from "./presets.js";
import { parsePlaylistRef } from "./deezer.js";
import { songKey, isUnwantedVersion } from "../text.js";

const RANK_MIN = { hits: 250000, mix: 80000, any: 0 };
const MAX_PER_ARTIST = 2;

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalizeConfig(c = {}) {
  const countries = (c.countries || []).filter((k) => PRESETS[k]);
  const queries = (c.queries || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 10);
  const playlists = (c.playlists || []).map(parsePlaylistRef).filter(Boolean).slice(0, 10);
  if (!countries.length && !queries.length && !playlists.length) countries.push("int");
  const levels = {};
  for (const k of countries) {
    const l = Number(c.levels?.[k]);
    levels[k] = LEVELS[l - 1] ? l : PRESETS[k].level || DEFAULT_LEVEL;
  }
  const from = clampYear(c.yearFrom ?? 1950);
  const to = clampYear(c.yearTo ?? new Date().getFullYear());
  return {
    countries,
    levels,
    queries,
    playlists,
    yearFrom: Math.min(from, to),
    yearTo: Math.max(from, to),
    popularity: RANK_MIN[c.popularity] !== undefined ? c.popularity : "mix",
  };
}
const clampYear = (y) => Math.max(1900, Math.min(new Date().getFullYear(), Number(y) || 1950));

// Cada país o estilo es una fuente con su propio mazo de candidatos. Las búsquedas
// y playlists propias del moderador van juntas en una fuente más, con peso normal.
function buildSources(cfg) {
  const sources = cfg.countries.map((k) => ({
    key: k,
    queries: PRESETS[k].queries,
    playlists: [],
    recent: !!PRESETS[k].recent,
    minYear: PRESETS[k].minYear || 0,
    weight: LEVELS[cfg.levels[k] - 1].weight,
  }));
  if (cfg.queries.length || cfg.playlists.length) {
    sources.push({ key: "custom", queries: cfg.queries, playlists: cfg.playlists, recent: false, minYear: 0, weight: LEVELS[DEFAULT_LEVEL - 1].weight });
  }
  return sources.map((s) => ({ ...s, candidates: [], usedQueries: new Set(), refills: 0, exhausted: false }));
}

export function createFeed({ deezer, resolver, config, rnd = Math.random, log = () => {}, bufferSize = 4, exclude = [] }) {
  const cfg = normalizeConfig(config);
  const sources = buildSources(cfg);
  const seen = new Set(exclude);
  const artistCount = new Map();
  const ready = [];
  let filling = null;

  function decadeHint() {
    const decades = Object.keys(DECADE_HINTS).map(Number).filter((d) => d + 9 >= cfg.yearFrom && d <= cfg.yearTo);
    if (!decades.length || rnd() < 0.4) return "";
    const d = decades[Math.floor(rnd() * decades.length)];
    const hints = DECADE_HINTS[d];
    return " " + hints[Math.floor(rnd() * hints.length)];
  }

  function pickQueries(src) {
    const fresh = shuffle(src.queries.filter((q) => !src.usedQueries.has(q)), rnd);
    const chosen = (fresh.length ? fresh : shuffle(src.queries, rnd)).slice(0, 2);
    chosen.forEach((q) => src.usedQueries.add(q));
    return chosen;
  }

  // Con la década agregada, los términos locales muchas veces no encuentran nada:
  // en ese caso se repite la búsqueda sin la década.
  async function searchPlaylists(q, recent) {
    const usable = (lists) => lists.filter((p) => p.nbTracks >= 15);
    const hint = recent ? "" : decadeHint();
    if (hint) {
      const lists = usable(await deezer.searchPlaylists(q + hint, 25));
      if (lists.length >= 3) return lists;
    }
    return usable(await deezer.searchPlaylists(q, 25));
  }

  async function tracksFromPlaylist(id, nbTracks) {
    const limit = 100;
    const maxIndex = Math.max(0, (nbTracks || 0) - limit);
    const index = Math.floor(rnd() * (maxIndex + 1));
    const { tracks } = await deezer.playlistTracks(id, { limit, index });
    return tracks;
  }

  async function gather(src) {
    const found = [];
    // 1) Playlists que pegó el moderador (en la primera vuelta, completas).
    if (src.refills === 1) {
      for (const id of src.playlists) {
        try {
          for (let index = 0; index < 400; index += 100) {
            const { tracks, total } = await deezer.playlistTracks(id, { limit: 100, index });
            found.push(...tracks);
            if (index + 100 >= total) break;
          }
        } catch (e) {
          log("playlist", id, e.message);
        }
      }
    }
    // 2) Búsquedas del país, estilo o términos libres.
    if (src.queries.length) {
      for (const q of pickQueries(src)) {
        try {
          const lists = await searchPlaylists(q, src.recent);
          for (const p of shuffle(lists.slice(0, 12), rnd).slice(0, 2)) {
            found.push(...(await tracksFromPlaylist(p.id, p.nbTracks)));
          }
        } catch (e) {
          log("search", q, e.message);
        }
      }
    }
    return found;
  }

  function accept(list, rankMin) {
    const out = [];
    for (const t of list) {
      const key = songKey(t.artist, t.title);
      if (seen.has(key)) continue;
      if (!t.readable || !t.artist || !t.title) continue;
      if (isUnwantedVersion(t.fullTitle || t.title, t.album)) continue;
      if (t.rank < rankMin) continue;
      const ac = artistCount.get(t.artist.toLowerCase()) || 0;
      if (ac >= MAX_PER_ARTIST) continue;
      seen.add(key);
      artistCount.set(t.artist.toLowerCase(), ac + 1);
      out.push(t);
    }
    return out;
  }

  async function refill(src) {
    if (src.refills >= 6 || (src.refills >= 1 && !src.queries.length)) {
      src.exhausted = true;
      return;
    }
    src.refills++;
    const raw = await gather(src);
    let fresh = accept(raw, RANK_MIN[cfg.popularity]);
    // Si los filtros dejaron muy poco (música local suele tener rank más bajo), aflojamos.
    if (fresh.length < 10 && cfg.popularity !== "any") fresh = fresh.concat(accept(raw, RANK_MIN.any));
    src.candidates = src.candidates.concat(shuffle(fresh, rnd));
    if (!raw.length && src.refills >= 2) src.exhausted = true;
  }

  const alive = () => sources.filter((s) => s.candidates.length || !s.exhausted);

  // Fuente de la próxima canción, al azar según el peso de cada una.
  function pickSource() {
    const list = alive();
    let r = rnd() * list.reduce((sum, s) => sum + s.weight, 0);
    for (const s of list) if ((r -= s.weight) < 0) return s;
    return list[list.length - 1] || null;
  }

  async function fill(target) {
    while (ready.length < target) {
      const src = pickSource();
      if (!src) return;
      if (!src.candidates.length) {
        await refill(src);
        continue;
      }
      const c = src.candidates.shift();
      try {
        const song = await resolver.resolve(c);
        if (!song) continue;
        if (song.confidence === "low") continue;
        if (song.year < cfg.yearFrom || song.year > cfg.yearTo || song.year < src.minYear) continue;
        ready.push(song);
      } catch (e) {
        log("resolve", c.deezerId, e.message);
      }
    }
  }

  function ensure(target = bufferSize) {
    if (!filling) {
      filling = fill(target).finally(() => {
        filling = null;
      });
    }
    return filling;
  }

  return {
    config: cfg,
    // Devuelve la siguiente canción lista (espera si hace falta) o null si no hay más.
    async next() {
      while (!ready.length) {
        await ensure(1);
        if (!ready.length && !alive().length) return null;
      }
      const s = ready.shift();
      ensure().catch(() => {}); // precarga en segundo plano
      return s;
    },
    async take(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const s = await this.next();
        if (!s) break;
        out.push(s);
      }
      return out;
    },
    prefetch: () => ensure().catch(() => {}),
    stats: () => ({ ready: ready.length, candidates: sources.reduce((n, s) => n + s.candidates.length, 0), exhausted: !alive().length }),
  };
}
