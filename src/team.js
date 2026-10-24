// Cliente de un equipo: se une a la sala, recibe el estado y manda jugadas.
import { openRoom } from "./net/transport.js";

const STORE = "tantetema.team";

function clientId() {
  try {
    let id = sessionStorage.getItem("tantetema.client");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("tantetema.client", id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function savedTeam() {
  try {
    return JSON.parse(localStorage.getItem(STORE));
  } catch {
    return null;
  }
}
export function clearSavedTeam() {
  try {
    localStorage.removeItem(STORE);
  } catch {}
}

export async function createTeamClient({ code, teamId = null, onChange = () => {}, onError = () => {} }) {
  const me = clientId();
  const t = {
    code: code.toUpperCase(),
    teamId,
    state: null,
    status: "connecting",
    lastSeen: 0,
  };
  let joinWaiter = null;

  let room = null;
  room = await openRoom(t.code, {
    onStatus: (s) => {
      t.status = s;
      if (s === "connected") room?.send({ type: "hello", clientId: me }).catch(() => {});
      onChange();
    },
    onMessage: (msg) => {
      if (!msg) return;
      if (msg.type === "state" && msg.code === t.code) {
        t.state = msg.state;
        t.lastSeen = Date.now();
        if (t.teamId && !msg.state.teams.some((x) => x.id === t.teamId)) {
          t.teamId = null; // nos sacaron de la partida
          persist();
        }
        onChange();
      } else if (msg.clientId === me && msg.type === "joined") {
        t.teamId = msg.teamId;
        persist();
        joinWaiter?.resolve();
        onChange();
      } else if (msg.clientId === me && msg.type === "error") {
        if (joinWaiter) joinWaiter.reject(new Error(msg.message));
        else onError(msg.message);
      }
    },
  });

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ code: t.code, teamId: t.teamId }));
    } catch {}
  }

  room.send({ type: "hello", clientId: me }).catch(() => {});

  // Si no llega estado (mensaje perdido), volvemos a saludar.
  const poke = setInterval(() => {
    if (Date.now() - t.lastSeen > 20000) room.send({ type: "hello", clientId: me }).catch(() => {});
  }, 4000);

  Object.assign(t, {
    async join(name) {
      const p = new Promise((resolve, reject) => {
        joinWaiter = { resolve, reject };
        setTimeout(() => reject(new Error("No encontramos esa sala. Revisá el código y que el moderador tenga la app abierta.")), 8000);
      }).finally(() => (joinWaiter = null));
      await room.send({ type: "join", clientId: me, name });
      return p;
    },
    act(action, ...args) {
      if (!t.teamId) return;
      room.send({ type: "action", clientId: me, teamId: t.teamId, action, args }).catch(() => onError("No se pudo enviar. Revisá la conexión."));
    },
    close() {
      clearInterval(poke);
      room.close();
    },
  });
  return t;
}
