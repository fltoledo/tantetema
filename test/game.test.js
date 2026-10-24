import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, fits, GameError } from "../src/game.js";

const song = (year, title = "T" + year) => ({ year, title, artist: "A", deezerId: year });

function simGame(nTeams = 2, starters = [1980, 2000]) {
  const g = new Game({ mode: "sim", target: 3 });
  for (let i = 0; i < nTeams; i++) g.addTeam("Equipo " + i);
  g.start(starters.map((y) => song(y)));
  return g;
}

test("fits: acepta bordes y años iguales", () => {
  assert.equal(fits([1980, 1990], 0, 1975), true);
  assert.equal(fits([1980, 1990], 0, 1980), true);
  assert.equal(fits([1980, 1990], 1, 1985), true);
  assert.equal(fits([1980, 1990], 1, 1995), false);
  assert.equal(fits([1980, 1990], 2, 1990), true);
  assert.equal(fits([1980, 1990], 3, 2000), false);
  assert.equal(fits([], 0, 1999), true);
});

test("addTeam: nombres únicos y solo en el lobby", () => {
  const g = new Game();
  g.addTeam("Rojo");
  assert.throws(() => g.addTeam("rojo"), GameError);
  g.start([song(1990)]);
  assert.throws(() => g.addTeam("Azul"), /ya empezó/);
});

test("modo simultáneo: cada equipo que acierta se lleva la carta", () => {
  const g = simGame();
  const [a, b] = g.teams;
  g.newRound(song(1990));
  g.place(a.id, 1); // después de 1980: bien
  g.place(b.id, 1); // después de 2000: mal
  g.reveal();
  assert.equal(a.cards.length, 2);
  assert.equal(b.cards.length, 1);
  assert.deepEqual(g.round.results[a.id], { ok: true, slot: 1 });
  assert.equal(g.round.results[b.id].ok, false);
});

test("no se puede jugar después de revelar", () => {
  const g = simGame();
  g.newRound(song(1990));
  g.reveal();
  assert.throws(() => g.place(g.teams[0].id, 0), /Ya se reveló/);
});

test("corregir el año recalcula la ronda sin duplicar cartas", () => {
  const g = simGame();
  const [a, b] = g.teams;
  g.newRound(song(1990));
  g.place(a.id, 1);
  g.place(b.id, 0);
  g.reveal();
  assert.equal(a.cards.length, 2);
  g.correctYear(1970); // en realidad era de 1970
  assert.equal(a.cards.length, 1);
  assert.equal(b.cards.length, 2);
  g.correctYear(1970);
  assert.equal(b.cards.length, 2);
});

test("fichas: bonus con tope y compra de carta", () => {
  const g = simGame();
  const [a] = g.teams;
  g.newRound(song(1990));
  g.place(a.id, 0); // mal
  g.reveal();
  assert.throws(() => g.buy(a.id), /3 fichas/);
  g.bonus(a.id);
  assert.throws(() => g.bonus(a.id), /Ya recibieron/);
  g.buy(a.id);
  assert.equal(a.tokens, 0);
  assert.equal(a.cards.length, 2);
  assert.throws(() => g.buy(a.id), /Ya tienen/);
});

test("una carta comprada no se pierde al corregir el año", () => {
  const g = simGame();
  const [a] = g.teams;
  a.tokens = 3;
  g.newRound(song(1990));
  g.place(a.id, 0);
  g.reveal();
  g.buy(a.id);
  g.correctYear(1991);
  assert.equal(a.cards.filter((c) => c.round === g.round.n).length, 1);
});

test("gana quien llega a la meta; empate posible", () => {
  const g = simGame();
  const [a, b] = g.teams;
  for (const y of [1990, 2010]) {
    g.newRound(song(y));
    g.place(a.id, a.cards.length);
    g.place(b.id, b.cards.length);
    g.reveal();
    if (g.status !== "finished") g.endRound();
  }
  // a: 1980,1990,2010 (3) ; b: 2000 + 1990 mal + 2010 bien = 2
  assert.equal(g.status, "finished");
  assert.deepEqual(g.winners, [a.id]);
});

test("modo por turnos: solo juega el equipo en turno y el desafío roba la carta", () => {
  const g = new Game({ mode: "turn", target: 10 });
  const a = g.addTeam("A");
  const b = g.addTeam("B");
  g.start([song(1980), song(2000)]);
  g.newRound(song(1970));
  assert.equal(g.round.turnTeamId, a.id);
  assert.throws(() => g.place(b.id, 0), /No es su turno/);
  assert.throws(() => g.challenge(b.id, 0), /Primero tiene que ubicar/);
  g.place(a.id, 1); // después de 1980: mal
  g.challenge(b.id, 0); // antes de 1980: bien
  assert.equal(b.tokens, 1);
  g.reveal();
  assert.equal(a.cards.length, 1);
  assert.equal(b.cards.length, 2);
  assert.equal(g.round.results[b.id].ok, true);
  g.endRound();
  g.newRound(song(1999));
  assert.equal(g.round.turnTeamId, b.id);
});

test("vista de equipo: no filtra la canción antes de revelar", () => {
  const g = simGame();
  g.newRound({ ...song(1990, "Secreto"), preview: "https://x/p.mp3" });
  const view = JSON.stringify(g.view({ role: "team" }));
  assert.ok(!view.includes("Secreto"));
  assert.ok(!view.includes("1990"));
  assert.ok(!view.includes("p.mp3"));
  const mod = g.view({ role: "mod" });
  assert.equal(mod.round.song.hidden.title, "Secreto");
  g.reveal();
  assert.equal(g.view({ role: "team" }).round.song.title, "Secreto");
});

test("vista de equipo: no muestra dónde ubicaron los otros en modo simultáneo", () => {
  const g = simGame();
  g.newRound(song(1990));
  g.place(g.teams[0].id, 1);
  const v = g.view({ role: "team" });
  assert.deepEqual(v.round.placements, {});
  assert.deepEqual(v.round.placed, [g.teams[0].id]);
});

test("restore conserva el estado", () => {
  const g = simGame();
  g.newRound(song(1990));
  const copy = Game.restore(JSON.parse(JSON.stringify(g)));
  copy.place(copy.teams[0].id, 1);
  copy.reveal();
  assert.equal(copy.teams[0].cards.length, 2);
});
