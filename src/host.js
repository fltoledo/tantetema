// El celu del moderador es el "servidor" de la partida: tiene el estado real,
// elige las canciones y le manda a los equipos una vista sin spoilers.
import { Game } from "./game.js";
import { openRoom } from "./net/transport.js";
import { createDeezer } from "./sources/deezer.js";
import { createMusicBrainz } from "./sources/musicbrainz.js";
import { createResolver } from "./sources/resolver.js";
import { createFeed } from "./sources/feed.js";
import { createMockFeed } from "./sources/mock.js";
import { songKey } from "./text.js";

const STORE = "tantetema.host";
const TEAM_ACTIONS = new Set(["place", "unplace", "challenge", "buy"]);

export function roomCode() {
  const A = "BCDFGHJKLMNPQRSTVWXZ";
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");
}

export function savedHost() {
  try {
    return JSON.parse(localStorage.getItem(STORE));
  } catch {
    return null;
  }
}
export function clearSavedHost() {
  try {
    localStorage.removeItem(STORE);
  } catch {}
}

export async function createHost({ code, config, gameData = null, mock = false, onChange = () => {}, log = console.warn }) {
  const game = gameData ? Game.restore(gameData) : new Game({ mode: config.mode, target: config.target });
  const deezer = createDeezer();
  const exclude = [];
  for (const t of game.teams) for (const c of t.cards) exclude.push(songKey(c.artist, c.title));
  for (const h of game.history) exclude.push(songKey(h.song.artist, h.song.title));
  const feed = mock
    ? createMockFeed({ config, exclude })
    : createFeed({ deezer, resolver: createResolver({ deezer, musicbrainz: createMusicBrainz(), log }), config, exclude, log });

  const host = {
    code,
    config,
    game,
    status: "connecting",
    busy: null, // texto de lo que está cargando
    error: null,
    feedStats: () => feed.stats(),
  };

  let room = null;
  room = await openRoom(code, {
    onMessage: handle,
    onStatus: (s) => {
      host.status = s;
      if (s === "connected") broadcast();
      onChange();
    },
  });

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ code, config, mock, game, savedAt: Date.now() }));
    } catch {}
  }

  function broadcast() {
    persist();
    if (!room) return onChange();
    room.send({ type: "state", code, state: game.view({ role: "team" }), at: Date.now() }).catch(() => {});
    onChange();
  }

  function reply(clientId, msg) {
    room?.send({ ...msg, clientId }).catch(() => {});
  }

  function handle(msg) {
    if (!msg || !msg.type) return;
    try {
      if (msg.type === "hello") {
        broadcast();
      } else if (msg.type === "join") {
        // Reintentos del mismo celu no crean equipos duplicados.
        const existing = game.teams.find((t) => t.clientId === msg.clientId);
        const team = existing || game.addTeam(msg.name);
        team.clientId = msg.clientId;
        reply(msg.clientId, { type: "joined", teamId: team.id });
        broadcast();
      } else if (msg.type === "action") {
        if (!TEAM_ACTIONS.has(msg.action)) return;
        const team = game.teams.find((t) => t.id === msg.teamId);
        if (!team) throw new Error("Ese equipo ya no está en la partida");
        game[msg.action](msg.teamId, ...(msg.args || []));
        broadcast();
      }
    } catch (e) {
      if (msg.clientId) reply(msg.clientId, { type: "error", message: e.message });
    }
  }

  async function busy(label, fn) {
    host.busy = label;
    host.error = null;
    onChange();
    try {
      return await fn();
    } catch (e) {
      host.error = e.message;
      throw e;
    } finally {
      host.busy = null;
      onChange();
    }
  }

  // Los links de preview de Deezer vencen: los pedimos de nuevo al empezar cada ronda.
  async function freshPreview(song) {
    if (mock || !song.deezerId) return song;
    try {
      const t = await deezer.track(song.deezerId);
      return { ...song, preview: t.preview || song.preview };
    } catch {
      return song;
    }
  }

  async function nextSong() {
    const s = await feed.next();
    if (!s) throw new Error("No encontramos más canciones con esos filtros. Probá sumar países o ampliar los años.");
    return freshPreview(s);
  }

  Object.assign(host, {
    prefetch: () => feed.prefetch(),
    async start() {
      await busy("Buscando canciones…", async () => {
        const starters = await feed.take(game.teams.length);
        game.start(starters);
        game.newRound(await nextSong());
      });
      broadcast();
    },
    reveal() {
      game.reveal();
      broadcast();
    },
    async next() {
      await busy("Buscando la próxima canción…", async () => {
        if (game.round?.phase === "revealed") game.endRound();
        game.newRound(await nextSong());
      });
      broadcast();
    },
    async replace() {
      await busy("Cambiando la canción…", async () => game.replaceSong(await nextSong()));
      broadcast();
    },
    correctYear(y) {
      game.correctYear(y);
      broadcast();
    },
    bonus(teamId) {
      game.bonus(teamId);
      broadcast();
    },
    removeTeam(teamId) {
      game.removeTeam(teamId);
      broadcast();
    },
    keepPlaying() {
      // Seguir después de que alguien llegó a la meta (subiendo la meta).
      game.target += 5;
      game.status = "playing";
      game.winners = [];
      broadcast();
    },
    close() {
      room.close();
    },
    resend: broadcast,
  });

  // Mantener sincronizados a los que se conectan tarde o pierden un mensaje.
  const beat = setInterval(() => host.status === "connected" && broadcast(), 15000);
  const close = host.close;
  host.close = () => {
    clearInterval(beat);
    close();
  };

  broadcast();
  if (game.status === "lobby") feed.prefetch();
  persist();
  return host;
}
