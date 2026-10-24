import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, songKey, isUnwantedVersion, looksLikeCompilation, yearOf } from "../src/text.js";
import { decideYear, createResolver, _clearCache } from "../src/sources/resolver.js";
import { earliestRecordingYear } from "../src/sources/musicbrainz.js";
import { createFeed, normalizeConfig } from "../src/sources/feed.js";
import { parsePlaylistRef, mapTrack } from "../src/sources/deezer.js";

test("cleanTitle saca sufijos de versión", () => {
  assert.equal(cleanTitle("Bohemian Rhapsody - Remastered 2011"), "Bohemian Rhapsody");
  assert.equal(cleanTitle("Persiana Americana (Remasterizado 2007)"), "Persiana Americana");
  assert.equal(cleanTitle("Despacito (feat. Daddy Yankee)"), "Despacito");
  assert.equal(cleanTitle("Hey Jude"), "Hey Jude");
});

test("songKey ignora acentos, mayúsculas y versiones", () => {
  assert.equal(songKey("Andrés Calamaro", "Flaca - Remastered"), songKey("andres calamaro", "FLACA"));
});

test("detecta versiones y compilados", () => {
  assert.ok(isUnwantedVersion("Zafar (En Vivo)"));
  assert.ok(isUnwantedVersion("Wonderwall", "Karaoke Hits Vol. 3"));
  assert.ok(!isUnwantedVersion("Wonderwall", "(What's the Story) Morning Glory?"));
  assert.ok(looksLikeCompilation("Grandes Éxitos"));
  assert.ok(looksLikeCompilation("The Very Best of Queen"));
  assert.ok(!looksLikeCompilation("Signos"));
});

test("yearOf valida fechas", () => {
  assert.equal(yearOf("1986-11-10"), 1986);
  assert.equal(yearOf("0000-00-00"), null);
  assert.equal(yearOf(null), null);
});

test("decideYear toma el más antiguo y marca confianza", () => {
  // Remaster: Deezer dice 2011 (álbum compilado no confiable), MusicBrainz 1975.
  assert.deepEqual(decideYear({ dzYear: 2011, dzTrusted: false, isrcYear: 2011, searchYear: 1975 }).year, 1975);
  assert.equal(decideYear({ dzYear: 1986, dzTrusted: true, isrcYear: null, searchYear: 1986 }).confidence, "high");
  assert.equal(decideYear({ dzYear: 1986, dzTrusted: true, isrcYear: null, searchYear: null }).confidence, "low");
  assert.equal(decideYear({ dzYear: 2005, dzTrusted: false, isrcYear: null, searchYear: null }), null);
});

test("earliestRecordingYear filtra por título, artista y score", () => {
  const recs = [
    { score: 100, title: "Persiana americana", "first-release-date": "1986-11-10", "artist-credit": [{ name: "Soda Stereo" }] },
    { score: 100, title: "Persiana americana (en vivo)", "first-release-date": "1980", "artist-credit": [{ name: "Soda Stereo" }] },
    { score: 95, title: "Persiana americana", "first-release-date": "1984", "artist-credit": [{ name: "Otra Banda" }] },
    { score: 40, title: "Persiana americana", "first-release-date": "1970", "artist-credit": [{ name: "Soda Stereo" }] },
  ];
  assert.equal(earliestRecordingYear(recs, { title: "Persiana Americana - Remasterizado 2007", artist: "Soda Stereo", minScore: 80 }), 1986);
});

test("parsePlaylistRef", () => {
  assert.equal(parsePlaylistRef("https://www.deezer.com/es/playlist/1282495565?utm=x"), 1282495565);
  assert.equal(parsePlaylistRef("908622995"), 908622995);
  assert.equal(parsePlaylistRef("https://open.spotify.com/playlist/abc"), null);
});

test("normalizeConfig ordena años y pone un default", () => {
  const c = normalizeConfig({ yearFrom: 2000, yearTo: 1980, countries: ["xx"] });
  assert.equal(c.yearFrom, 1980);
  assert.equal(c.yearTo, 2000);
  assert.deepEqual(c.countries, ["int"]);
});

// --- Feed con Deezer y MusicBrainz falsos ---
function fakeSources() {
  const tracks = [];
  const add = (id, artist, title, year, rank = 500000, album = "Album") => tracks.push({ id, artist: { name: artist }, title, title_short: title, rank, preview: "p" + id, album: { title: album, release_date: year + "-01-01" }, release_date: year + "-01-01", isrc: "ISRC" + id });
  add(1, "Queen", "Bohemian Rhapsody", 2011, 900000, "Greatest Hits");
  add(2, "Soda Stereo", "Persiana Americana", 1986);
  add(3, "Soda Stereo", "Nada Personal", 1985);
  add(4, "Soda Stereo", "Juego de seducción", 1985); // 3er tema del mismo artista: se descarta
  add(5, "Banda Desconocida", "Tema", 2015, 100);
  add(6, "Charly García", "Demoliendo hoteles (En vivo)", 1990);
  add(7, "a-ha", "Take On Me", 1985);
  const byId = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const deezer = {
    calls: 0,
    async searchPlaylists() {
      this.calls++;
      return [{ id: 99, title: "Hits", nbTracks: 50 }];
    },
    async playlistTracks() {
      return { total: tracks.length, tracks: tracks.map(mapTrack) };
    },
    async track(id) {
      const t = byId[id];
      return { ...mapTrack(t), isrc: t.isrc, releaseDate: t.release_date };
    },
  };
  const mbYears = { "Bohemian Rhapsody": 1975, "Persiana Americana": 1986, "Nada Personal": 1985, "Take On Me": 1984 };
  const musicbrainz = {
    async yearByIsrc() {
      return null;
    },
    async yearBySearch({ title }) {
      return mbYears[title] ?? null;
    },
  };
  return { deezer, musicbrainz };
}

test("feed: filtra versiones, popularidad y repetidos; corrige años de compilados", async () => {
  _clearCache();
  const { deezer, musicbrainz } = fakeSources();
  const feed = createFeed({ deezer, resolver: createResolver({ deezer, musicbrainz }), config: { countries: ["int"], popularity: "hits" }, rnd: () => 0.5 });
  const songs = [];
  for (let s = await feed.next(); s; s = await feed.next()) songs.push(s);
  const byTitle = Object.fromEntries(songs.map((s) => [s.title, s.year]));
  assert.equal(byTitle["Bohemian Rhapsody"], 1975);
  assert.equal(byTitle["Take On Me"], 1984);
  assert.ok(!("Tema" in byTitle), "descarta poco populares");
  assert.ok(!Object.keys(byTitle).some((t) => /vivo/i.test(t)), "descarta en vivo");
  assert.ok(songs.filter((s) => s.artist === "Soda Stereo").length <= 2, "máximo 2 por artista");
  assert.equal(new Set(songs.map((s) => s.title)).size, songs.length, "sin repetidos");
});

test("feed: respeta el rango de años", async () => {
  _clearCache();
  const { deezer, musicbrainz } = fakeSources();
  const feed = createFeed({ deezer, resolver: createResolver({ deezer, musicbrainz }), config: { countries: ["int"], yearFrom: 1980, yearTo: 1989 } });
  const songs = await feed.take(10);
  assert.ok(songs.length > 0);
  assert.ok(songs.every((s) => s.year >= 1980 && s.year <= 1989));
});

test("feed: excluye canciones ya jugadas", async () => {
  _clearCache();
  const { deezer, musicbrainz } = fakeSources();
  const feed = createFeed({ deezer, resolver: createResolver({ deezer, musicbrainz }), config: { countries: ["int"] }, exclude: [songKey("a-ha", "Take On Me")] });
  const songs = await feed.take(10);
  assert.ok(!songs.some((s) => s.title === "Take On Me"));
});
