// Fuente offline para desarrollo y tests (SOURCE=mock). No usa red.
import { shuffle, normalizeConfig } from "./feed.js";
import { songKey } from "../text.js";

const SONGS = `1965|The Rolling Stones|(I Can't Get No) Satisfaction
1968|The Beatles|Hey Jude
1971|John Lennon|Imagine
1975|Queen|Bohemian Rhapsody
1976|ABBA|Dancing Queen
1977|Bee Gees|Stayin' Alive
1978|Gloria Gaynor|I Will Survive
1982|Toto|Africa
1983|Eurythmics|Sweet Dreams (Are Made of This)
1984|Charly García|Demoliendo hoteles
1985|a-ha|Take On Me
1986|Soda Stereo|Persiana americana
1987|Guns N' Roses|Sweet Child o' Mine
1990|Soda Stereo|De música ligera
1991|Nirvana|Smells Like Teen Spirit
1993|Los Fabulosos Cadillacs|Matador
1994|The Cranberries|Zombie
1995|Oasis|Wonderwall
1997|Andrés Calamaro|Flaca
1999|Ricky Martin|Livin' la Vida Loca
2003|OutKast|Hey Ya!
2004|Jorge Drexler|Al otro lado del río
2004|La Vela Puerca|Zafar
2006|El Cuarteto de Nos|Yendo a la casa de Damián
2008|Lady Gaga|Poker Face
2010|Shakira|Waka Waka (This Time for Africa)
2012|PSY|Gangnam Style
2014|Mark Ronson|Uptown Funk
2017|Luis Fonsi|Despacito
2019|The Weeknd|Blinding Lights
2022|Bizarrap|Quevedo: Bzrp Music Sessions, Vol. 52
2023|Miley Cyrus|Flowers
2024|Sabrina Carpenter|Espresso`
  .split("\n")
  .map((l, i) => {
    const [y, artist, title] = l.split("|");
    return { deezerId: 1000 + i, year: Number(y), artist, title, album: "", preview: null, confidence: "high", sources: { mock: Number(y) } };
  });

export function createMockFeed({ config, rnd = Math.random, exclude = [] } = {}) {
  const cfg = normalizeConfig(config);
  const ex = new Set(exclude);
  const list = shuffle(SONGS.filter((s) => s.year >= cfg.yearFrom && s.year <= cfg.yearTo && !ex.has(songKey(s.artist, s.title))), rnd);
  return {
    config: cfg,
    async next() {
      return list.shift() || null;
    },
    async take(n) {
      return list.splice(0, n);
    },
    prefetch() {},
    stats: () => ({ ready: list.length, candidates: 0, exhausted: !list.length }),
  };
}
