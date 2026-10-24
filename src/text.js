// Normalización de títulos y artistas para deduplicar y comparar entre fuentes.

const VERSION_NOISE = /\s*[([{-]\s*(?:\d{4}\s*)?(?:remaster(?:ed|izado)?|remix|live|en vivo|ao vivo|directo|versi[oó]n|version|edit|radio edit|single version|mono|stereo|demo|acoustic|ac[uú]stico|bonus track|deluxe|feat\.?|ft\.?|with)\b.*$/i;

export function cleanTitle(title = "") {
  return title.replace(VERSION_NOISE, "").replace(/\s+/g, " ").trim();
}

export function norm(s = "") {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function songKey(artist, title) {
  return norm(artist) + "|" + norm(cleanTitle(title));
}

// Versiones que no queremos en el mazo: el año sería el de la versión, no el del tema.
const BAD_VERSION = /\b(live|en vivo|ao vivo|directo|remix|karaoke|instrumental|cover|tribute|tributo|8-bit|lullaby|medley|mashup)\b/i;
export function isUnwantedVersion(title = "", album = "") {
  return BAD_VERSION.test(title) || /\b(karaoke|tribute|tributo|lullaby|cover)\b/i.test(album);
}

// Álbumes cuya fecha no sirve para el año del tema.
const COMPILATION = /\b(greatest hits|grandes [eé]xitos|best of|lo mejor|the very best|antolog[ií]a|colecci[oó]n|collection|essential|esenciales?|remaster|hits|[eé]xitos|anthology|gold|20th century masters|compilation|recopilaci[oó]n)\b/i;
export function looksLikeCompilation(albumTitle = "") {
  return COMPILATION.test(albumTitle);
}

export function yearOf(date) {
  const m = /^(\d{4})/.exec(String(date || ""));
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1900 && y <= new Date().getFullYear() + 1 ? y : null;
}
