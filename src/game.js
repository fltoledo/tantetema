// Lógica del juego, sin red ni sockets. Todo lo que cambia el estado pasa por acá.

export const MAX_TEAMS = 8;
export const START_TOKENS = 2;
export const MAX_TOKENS = 5;
export const BUY_COST = 3;
export const CHALLENGE_COST = 1;

const COLORS = ["#ff4d8d", "#45e0bf", "#ffc53d", "#7aa7ff", "#c38bff", "#ff8a4d", "#9be15d", "#f0f0f0"];

export class GameError extends Error {}
const fail = (msg) => {
  throw new GameError(msg);
};

let idSeq = 0;
const newId = (p) => p + (++idSeq).toString(36) + Math.random().toString(36).slice(2, 6);

// ¿El año entra en la posición `slot` de una línea de tiempo (años ordenados)?
export function fits(years, slot, year) {
  if (!Number.isInteger(slot) || slot < 0 || slot > years.length) return false;
  const before = slot === 0 ? -Infinity : years[slot - 1];
  const after = slot === years.length ? Infinity : years[slot];
  return before <= year && year <= after;
}

export const timelineYears = (team) => team.cards.map((c) => c.year).sort((a, b) => a - b);

export class Game {
  constructor({ mode = "sim", target = 10 } = {}) {
    this.mode = mode === "turn" ? "turn" : "sim";
    this.target = Math.max(3, Math.min(20, Number(target) || 10));
    this.status = "lobby"; // lobby | playing | finished
    this.teams = [];
    this.round = null;
    this.turnIndex = 0;
    this.history = [];
    this.winners = [];
  }

  static restore(data) {
    return Object.assign(new Game(), data);
  }

  addTeam(name) {
    if (this.status !== "lobby") fail("La partida ya empezó");
    if (this.teams.length >= MAX_TEAMS) fail("Máximo " + MAX_TEAMS + " equipos");
    const clean = String(name || "").trim().slice(0, 24) || "Equipo " + (this.teams.length + 1);
    if (this.teams.some((t) => t.name.toLowerCase() === clean.toLowerCase())) fail("Ya hay un equipo con ese nombre");
    const team = { id: newId("t"), name: clean, color: COLORS[this.teams.length % COLORS.length], cards: [], tokens: START_TOKENS };
    this.teams.push(team);
    return team;
  }

  removeTeam(teamId) {
    if (this.status !== "lobby") fail("Solo se pueden quitar equipos antes de empezar");
    this.teams = this.teams.filter((t) => t.id !== teamId);
  }

  team(teamId) {
    return this.teams.find((t) => t.id === teamId) || fail("Equipo inexistente");
  }

  // starters: una canción por equipo (se muestra revelada desde el inicio).
  start(starters) {
    if (this.status !== "lobby") fail("La partida ya empezó");
    if (this.teams.length < 1) fail("Hace falta al menos un equipo");
    if (starters.length < this.teams.length) fail("No hay suficientes canciones para empezar");
    this.teams.forEach((t, i) => {
      t.cards = [{ ...starters[i], starter: true }];
      t.tokens = START_TOKENS;
    });
    this.status = "playing";
    this.turnIndex = 0;
  }

  get turnTeamId() {
    return this.mode === "turn" && this.teams.length ? this.teams[this.turnIndex % this.teams.length].id : null;
  }

  newRound(song) {
    if (this.status !== "playing") fail("La partida no está en juego");
    // Contador propio: endRound() deja round en null y no queremos reusar números.
    this.roundCount = (this.roundCount || 0) + 1;
    const n = this.roundCount;
    this.round = { n, song, phase: "listening", placements: {}, challenges: [], results: {}, turnTeamId: this.turnTeamId };
  }

  // Reemplaza la canción actual (ej. no se puede escuchar) sin pasar el turno.
  replaceSong(song) {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "listening") fail("Ya se reveló");
    r.song = song;
    r.placements = {};
    r.challenges = [];
  }

  place(teamId, slot) {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "listening") fail("Ya se reveló");
    const team = this.team(teamId);
    if (this.mode === "turn" && r.turnTeamId !== teamId) fail("No es su turno");
    if (!Number.isInteger(slot) || slot < 0 || slot > team.cards.length) fail("Posición inválida");
    r.placements[teamId] = slot;
  }

  unplace(teamId) {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "listening") fail("Ya se reveló");
    delete r.placements[teamId];
  }

  // Modo por turnos: otro equipo apuesta a una posición distinta en la línea del equipo en turno.
  challenge(teamId, slot) {
    const r = this.round || fail("No hay ronda");
    if (this.mode !== "turn") fail("Los desafíos son del modo por turnos");
    if (r.phase !== "listening") fail("Ya se reveló");
    if (teamId === r.turnTeamId) fail("No pueden desafiarse a sí mismos");
    const team = this.team(teamId);
    const owner = this.team(r.turnTeamId);
    if (r.placements[owner.id] === undefined) fail("Primero tiene que ubicar el equipo en turno");
    if (r.challenges.some((c) => c.teamId === teamId)) fail("Ya desafiaron esta ronda");
    if (r.challenges.some((c) => c.slot === slot) || r.placements[owner.id] === slot) fail("Esa posición ya está tomada");
    if (!Number.isInteger(slot) || slot < 0 || slot > owner.cards.length) fail("Posición inválida");
    if (team.tokens < CHALLENGE_COST) fail("No tienen fichas");
    team.tokens -= CHALLENGE_COST;
    r.challenges.push({ teamId, slot });
  }

  reveal() {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "listening") fail("Ya se reveló");
    r.phase = "revealed";
    this._score();
  }

  _score() {
    const r = this.round;
    const year = r.song.year;
    // Deshacer lo otorgado antes (por si se corrige el año).
    for (const t of this.teams) t.cards = t.cards.filter((c) => c.round !== r.n || c.bought);
    r.results = {};
    if (this.mode === "sim") {
      for (const t of this.teams) {
        const slot = r.placements[t.id];
        if (slot === undefined) continue;
        const ok = fits(timelineYears(t), slot, year);
        r.results[t.id] = { ok, slot };
        if (ok) t.cards.push({ ...r.song, round: r.n });
      }
    } else {
      const owner = this.teams.find((t) => t.id === r.turnTeamId);
      if (owner) {
        const years = timelineYears(owner);
        const slot = r.placements[owner.id];
        const ok = slot !== undefined && fits(years, slot, year);
        r.results[owner.id] = { ok, slot };
        if (ok) owner.cards.push({ ...r.song, round: r.n });
        else {
          const winner = r.challenges.find((c) => fits(years, c.slot, year));
          for (const c of r.challenges) r.results[c.teamId] = { ok: c === winner, slot: c.slot, challenge: true };
          if (winner) this.team(winner.teamId).cards.push({ ...r.song, round: r.n, stolen: true });
        }
      }
    }
    this._checkWin();
  }

  // El moderador corrige el año si la metadata estaba mal; se recalcula la ronda.
  correctYear(year) {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "revealed") fail("Primero hay que revelar");
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) fail("Año inválido");
    r.song = { ...r.song, year: y, corrected: true };
    if (this.status === "finished") this.status = "playing";
    this._score();
  }

  // Adivinaron artista y título: +1 ficha (lo decide el moderador).
  bonus(teamId) {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "revealed") fail("Primero hay que revelar");
    r.bonus = r.bonus || {};
    if (r.bonus[teamId]) fail("Ya recibieron la ficha de esta ronda");
    const t = this.team(teamId);
    r.bonus[teamId] = true;
    t.tokens = Math.min(MAX_TOKENS, t.tokens + 1);
  }

  // Comprar la carta de esta ronda con fichas (si no la ganaron).
  buy(teamId) {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "revealed") fail("Primero hay que revelar");
    const t = this.team(teamId);
    if (t.cards.some((c) => c.round === r.n)) fail("Ya tienen esta carta");
    if (t.tokens < BUY_COST) fail(`Hacen falta ${BUY_COST} fichas`);
    t.tokens -= BUY_COST;
    t.cards.push({ ...r.song, round: r.n, bought: true });
    this._checkWin();
  }

  _checkWin() {
    this.winners = this.teams.filter((t) => t.cards.length >= this.target).map((t) => t.id);
    if (this.winners.length) this.status = "finished";
  }

  endRound() {
    const r = this.round || fail("No hay ronda");
    if (r.phase !== "revealed") fail("Primero hay que revelar");
    this.history.push({ n: r.n, song: r.song, results: r.results });
    if (this.mode === "turn") this.turnIndex = (this.turnIndex + 1) % this.teams.length;
    this.round = null;
  }

  // Estado para cada cliente. Los equipos no ven la canción hasta que se revela.
  view({ role, teamId } = {}) {
    const r = this.round;
    const revealed = r?.phase === "revealed";
    const showSong = revealed;
    const teams = this.teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      tokens: t.tokens,
      count: t.cards.length,
      cards: t.cards
        .slice()
        .sort((a, b) => a.year - b.year)
        .map((c) => ({ year: c.year, title: c.title, artist: c.artist, round: c.round ?? null, stolen: !!c.stolen, bought: !!c.bought })),
    }));
    let round = null;
    if (r) {
      round = {
        n: r.n,
        phase: r.phase,
        turnTeamId: r.turnTeamId,
        placed: Object.keys(r.placements),
        challenges: revealed || role === "mod" ? r.challenges : r.challenges.map((c) => ({ teamId: c.teamId, slot: c.slot })),
        placements: revealed || role === "mod" ? r.placements : teamId && r.placements[teamId] !== undefined ? { [teamId]: r.placements[teamId] } : {},
        results: revealed ? r.results : {},
        bonus: r.bonus || {},
        song: showSong
          ? songView(r.song, true)
          : role === "mod"
            ? songView(r.song, false)
            : null,
      };
      // En modo turnos los demás necesitan ver la posición del equipo en turno para desafiar.
      if (this.mode === "turn" && !revealed && r.placements[r.turnTeamId] !== undefined) {
        round.placements = { ...round.placements, [r.turnTeamId]: r.placements[r.turnTeamId] };
      }
    }
    return { status: this.status, mode: this.mode, target: this.target, teams, round, winners: this.winners, turnTeamId: this.turnTeamId };
  }
}

// El moderador recibe el audio y los links antes de revelar; el título viaja aparte
// para que la UI lo muestre solo si el moderador pide "espiar".
function songView(s, revealed) {
  if (!s) return null;
  const base = { preview: s.preview || null, spotify: spotifySearch(s), youtube: youtubeSearch(s), deezer: s.link || null, cover: revealed ? s.cover || null : null };
  return revealed
    ? { ...base, year: s.year, title: s.title, artist: s.artist, confidence: s.confidence, corrected: !!s.corrected }
    : { ...base, hidden: { year: s.year, title: s.title, artist: s.artist, confidence: s.confidence } };
}

export const spotifySearch = (s) => "https://open.spotify.com/search/" + encodeURIComponent(`${s.artist} ${s.title}`);
export const youtubeSearch = (s) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${s.artist} ${s.title}`);
