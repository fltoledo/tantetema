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

// Versiones que no queremos en el mazo: suenan distinto al original y confunden con el año.
const BAD_VERSION = /\b(en vivo|ao vivo|en directo|remix|karaoke|instrumental|cover|tribute|tributo|8-bit|lullaby|medley|mashup|enganchados?|remake|sped up|slowed|nightcore|rkt)\b/i;
const BAD_ALBUM = /\b(karaoke|tribute|tributo|lullaby|covers?|en vivo|ao vivo|unplugged|remix(es|ed)?|sped up|slowed|versiones|reimagined)\b|\blive (at|in|from)\b|\(live\)/i;

// Marcas de versión: van entre paréntesis o corchetes, o después de " - ".
const versionTags = (title) => [...title.matchAll(/[([]([^)\]]*)[)\]]|\s[-–]\s(.*)$/g)].map((m) => (m[1] ?? m[2]).trim());
// Regrabaciones, versiones en otro género o idioma, sesiones y remixes de DJ.
const REMAKE_TAG = /\b(versi[oó]n|version|mix|edit|re-?recorded|regrabad[ao]|live|vivo|directo|ac[uú]stic[ao]|acoustic|unplugged|sessions?|cumbia|cuarteto|reggaeton|merengueton|turreo|cachengue|guaracha|amapiano|spanish|english|portugu[eé]s|vs)\b/i;
// Lo que nombra la grabación original ("2011 Remaster", "Radio Edit", "Album Version").
const ORIGINAL_QUAL = /remaster\w*|digital\w*|single|album|álbum|radio|international|mono|stereo|original|explicit|clean|short|extended|\blp\b|7"|12"/gi;
const JUST_VERSION = /^\W*(versi[oó]n|version|edit|mix)?\W*$/i;

function isRemakeTag(tag) {
  if (/^(feat|ft|featuring|with|con)\b/i.test(tag)) return false; // nombres de artistas invitados
  const rest = tag.replace(/\b\d{4}\b/g, "");
  const core = rest.replace(ORIGINAL_QUAL, "");
  // "Versión 2020" o "Taylor's Version" es otra grabación; "Remastered Version" es la misma.
  if (JUST_VERSION.test(core)) return /\w/.test(core) && core.length === rest.length;
  return REMAKE_TAG.test(core);
}

export function isUnwantedVersion(title = "", album = "") {
  return BAD_VERSION.test(title) || title.includes(" / ") || versionTags(title).some(isRemakeTag) || BAD_ALBUM.test(album);
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
