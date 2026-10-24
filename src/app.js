// UI: pantallas de inicio, moderador y equipo. Render por strings + delegación de eventos.
import { PRESETS } from "./sources/presets.js";
import { createHost, roomCode, savedHost, clearSavedHost } from "./host.js";
import { createTeamClient, savedTeam, clearSavedTeam } from "./team.js";
import { hasRemote } from "./net/transport.js";
import { BUY_COST, CHALLENGE_COST, MAX_TOKENS } from "./game.js";

const $ = (s) => document.querySelector(s);
const app = $("#app");
const player = $("#player");
const params = new URLSearchParams(location.search);
const MOCK = params.has("mock");
const THIS_YEAR = new Date().getFullYear();

const ui = {
  screen: "home",
  setup: loadSetup(),
  host: null,
  team: null,
  joinCode: (params.get("sala") || "").toUpperCase().slice(0, 4),
  joinName: "",
  mySlot: null, // { n, slot } jugada local del equipo
  peek: false,
  confirmEnd: false,
  joining: false,
};

function loadSetup() {
  const def = { countries: ["uy", "ar", "int"], queries: "", playlists: "", yearFrom: 1960, yearTo: THIS_YEAR, popularity: "mix", mode: "sim", target: 10 };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem("tantetema.setup")) };
  } catch {
    return def;
  }
}
function saveSetup() {
  try {
    localStorage.setItem("tantetema.setup", JSON.stringify(ui.setup));
  } catch {}
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DECADE_COLORS = { 1950: "#9fd8ff", 1960: "#b8f28f", 1970: "#ffd166", 1980: "#ff8fb8", 1990: "#c3a6ff", 2000: "#7ef0d6", 2010: "#ffb27a", 2020: "#f6f1a0" };
const decadeColor = (y) => DECADE_COLORS[Math.floor(y / 10) * 10] || "#e8e0ff";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 2600);
}

let wakeLock = null;
async function keepAwake() {
  try {
    if (!wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && (ui.host || ui.team) && keepAwake());

/* ---------------- render ---------------- */
function render() {
  // Conservar lo que se está escribiendo cuando llega un estado nuevo.
  const active = document.activeElement?.id;
  const values = {};
  app.querySelectorAll("input[id],textarea[id],select[id]").forEach((el) => (values[el.id] = el.value));

  const s = ui.screen;
  app.innerHTML =
    s === "setup" ? setupView() : s === "host" ? hostView() : s === "join" ? joinView() : s === "team" ? teamView() : homeView();

  for (const [id, v] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el && el.dataset.keep !== "no") el.value = v;
  }
  if (active) document.getElementById(active)?.focus();
  drawQr();
  syncAudio();
}

function homeView() {
  const h = savedHost();
  const t = savedTeam();
  return `
  <header class="stack">
    <div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <h1>Tante<span>tema</span></h1>
    <p class="muted">Escuchá, adiviná el año y armá tu línea de tiempo. Un celu pone la música y cada equipo juega desde el suyo.</p>
  </header>
  ${!hasRemote() ? `<p class="banner">Modo local: la sincronización entre celus no está configurada. Podés probar abriendo varias pestañas en este navegador.</p>` : ""}
  ${h || t?.teamId ? `<section class="panel"><span class="label">Partida en curso</span><div class="row">
      ${h ? `<button class="go" data-a="resumeHost">Volver a moderar ${esc(h.code)}</button>` : ""}
      ${t?.teamId ? `<button class="go" data-a="resumeTeam">Volver a la sala ${esc(t.code)}</button>` : ""}
    </div></section>` : ""}
  <div class="roles">
    <button class="role mod" data-a="toSetup"><b>Moderador</b><span>Crea la sala, pone las canciones y revela el año.</span></button>
    <button class="role team" data-a="toJoin"><b>Equipo</b><span>Entrá con el código de la sala y armá tu línea de tiempo.</span></button>
  </div>
  <section class="panel how"><h2>Cómo se juega</h2>
    <ol>
      <li>El moderador crea la sala. Los equipos escanean el QR o ponen el código de 4 letras.</li>
      <li>Cada equipo arranca con una carta revelada.</li>
      <li>Suena una canción. Cada equipo marca en su celu dónde va en su línea de tiempo.</li>
      <li>El moderador revela el año: si la ubicaron bien, se quedan la carta.</li>
      <li>Si además adivinan artista y canción, ganan una ficha. Con ${BUY_COST} fichas compran una carta. Gana el primero que llega a la meta.</li>
    </ol>
  </section>
  <p class="small muted">Canciones y previews: Deezer. Años verificados con MusicBrainz.</p>`;
}

function setupView() {
  const s = ui.setup;
  const decades = [];
  for (let y = 1950; y <= THIS_YEAR; y += 5) decades.push(y);
  const opts = (sel, list) => list.map((y) => `<option value="${y}" ${y === sel ? "selected" : ""}>${y}</option>`).join("");
  return `
  <div class="topbar"><button class="ghost sm" data-a="home">← Volver</button><span class="label">Nueva sala</span></div>
  <section class="panel"><h2>¿Qué música?</h2>
    <div class="stack"><span class="label">Países y estilos</span>
      <div class="chips">${Object.entries(PRESETS).map(([k, p]) => `<button class="chip" aria-pressed="${s.countries.includes(k)}" data-a="country" data-k="${k}">${esc(p.name)}</button>`).join("")}</div>
    </div>
    <div class="stack"><label class="label" for="queries">Búsquedas extra (separadas por coma)</label>
      <input id="queries" placeholder="cumbia villera, murga, reggaeton 2000s" value="${esc(s.queries)}"></div>
    <div class="stack"><label class="label" for="playlists">Playlists de Deezer (una por línea, opcional)</label>
      <textarea id="playlists" placeholder="https://www.deezer.com/playlist/1234567">${esc(s.playlists)}</textarea>
      <p class="small muted">Las canciones cambian en cada partida: se eligen al azar de playlists públicas de Deezer que coinciden con lo que elegiste.</p></div>
  </section>
  <section class="panel"><h2>Filtros</h2>
    <div class="grid2">
      <div class="stack"><label class="label" for="yearFrom">Desde</label><select id="yearFrom">${opts(s.yearFrom, decades)}</select></div>
      <div class="stack"><label class="label" for="yearTo">Hasta</label><select id="yearTo">${opts(s.yearTo, [...decades.filter((y) => y > 1950), THIS_YEAR].filter((v, i, a) => a.indexOf(v) === i))}</select></div>
    </div>
    <div class="stack"><span class="label">Popularidad</span>
      <div class="chips">${[["hits", "Solo hits"], ["mix", "Mezcla"], ["any", "Todo"]].map(([k, l]) => `<button class="chip" aria-pressed="${s.popularity === k}" data-a="popularity" data-k="${k}">${l}</button>`).join("")}</div></div>
  </section>
  <section class="panel"><h2>Reglas</h2>
    <div class="stack"><span class="label">Cartas para ganar</span>
      <div class="stepper"><button class="ghost" data-a="target" data-d="-1" aria-label="Menos">−</button><output>${s.target}</output><button class="ghost" data-a="target" data-d="1" aria-label="Más">+</button></div></div>
    <div class="stack"><span class="label">Modo</span>
      <div class="chips"><button class="chip" aria-pressed="${s.mode === "sim"}" data-a="mode" data-k="sim">Todos a la vez</button><button class="chip" aria-pressed="${s.mode === "turn"}" data-a="mode" data-k="turn">Por turnos</button></div>
      <p class="small muted">${s.mode === "sim" ? "Cada canción la ubican todos los equipos en su propia línea. Nadie queda esperando." : `Ubica un equipo por vez. Los demás pueden desafiar con ${CHALLENGE_COST} ficha: si el equipo en turno erra y el desafío acierta, se roban la carta.`}</p></div>
  </section>
  <button class="primary block" data-a="createRoom">Crear sala</button>`;
}

function readSetupInputs() {
  const s = ui.setup;
  if ($("#queries")) s.queries = $("#queries").value;
  if ($("#playlists")) s.playlists = $("#playlists").value;
  if ($("#yearFrom")) s.yearFrom = Number($("#yearFrom").value);
  if ($("#yearTo")) s.yearTo = Number($("#yearTo").value);
  saveSetup();
}

/* ---------- moderador ---------- */
function hostView() {
  const h = ui.host;
  if (!h) return `<p class="muted">Conectando…</p>`;
  const g = h.game.view({ role: "mod" });
  const head = `<div class="topbar"><span class="label"><span class="dot ${h.status}"></span> Sala <b class="tabular">${h.code}</b>${g.round ? ` · Ronda ${g.round.n}` : ""}</span>
    ${ui.confirmEnd ? `<span class="row"><button class="danger sm" data-a="endHost">Terminar</button><button class="ghost sm" data-a="cancelEnd">No</button></span>` : `<button class="ghost sm" data-a="askEnd">Terminar</button>`}</div>`;
  const err = h.error ? `<p class="banner">${esc(h.error)}</p>` : "";
  const busy = h.busy ? `<div class="row"><span class="spinner"></span><span class="muted">${esc(h.busy)}</span></div>` : "";

  if (g.status === "lobby") {
    const link = joinLink(h.code);
    const st = h.feedStats();
    return `${head}
    <section class="panel"><span class="label">Código de la sala</span>
      <div class="bigcode">${h.code}</div>
      <div class="qr" id="qr" data-link="${esc(link)}" aria-label="Código QR para unirse"></div>
      <div class="row between"><span class="small muted" style="min-width:0;overflow-wrap:anywhere">${esc(link)}</span><button class="ghost sm" data-a="copyLink">Copiar link</button></div>
    </section>
    <section class="panel"><h2>Equipos</h2>
      ${g.teams.length ? `<div class="teams">${g.teams.map((t) => `<div class="teamline"><span class="name"><i class="swatch" style="background:${t.color}"></i>${esc(t.name)}</span><button class="ghost sm" data-a="removeTeam" data-id="${t.id}">Quitar</button></div>`).join("")}</div>` : `<p class="muted">Todavía no entró nadie. Cada equipo entra desde su celu con el código o el QR.</p>`}
    </section>
    <p class="small muted">${st.ready ? `${st.ready} canciones listas` : "Buscando canciones…"}</p>
    ${err}${busy}
    <button class="primary block" data-a="start" ${g.teams.length && !h.busy ? "" : "disabled"}>Empezar partida</button>`;
  }

  const r = g.round;
  const song = r?.song;
  const scoreboard = scoreboardView(g);
  if (!r) return `${head}${err}${busy}${scoreboard}`;

  const turnTeam = g.teams.find((t) => t.id === r.turnTeamId);
  const placedNames = g.teams.map((t) => {
    const done = r.placed.includes(t.id) || r.challenges.some((c) => c.teamId === t.id);
    return `<span class="pill ${done ? "ok" : ""}">${done ? "✓" : "…"} ${esc(t.name)}</span>`;
  });

  let body;
  if (r.phase === "listening") {
    body = `
    ${g.mode === "turn" && turnTeam ? `<div class="turn">Le toca a ${esc(turnTeam.name)}</div>` : ""}
    <div class="card back">
      <span class="num">RONDA ${r.n}</span>
      ${song.preview ? `<button class="play ${player.paused ? "" : "on"}" data-a="togglePlay" aria-label="Reproducir o pausar">${player.paused ? "▶" : "❚❚"}</button><div class="bar"><i id="prog"></i></div>` : `<p class="muted">Esta canción no tiene preview. Usá Spotify o cambiala.</p>`}
      <span class="num">NO MUESTRES LA PANTALLA</span>
    </div>
    <div class="links">
      <a class="btn spotify" href="${song.spotify}" target="_blank" rel="noopener">Spotify</a>
      <a class="btn ghost" href="${song.youtube}" target="_blank" rel="noopener">YouTube</a>
      <button class="ghost" data-a="peek">${ui.peek ? "Ocultar" : "Espiar"}</button>
    </div>
    ${ui.peek ? `<p class="peek">${esc(song.hidden.artist)} · ${esc(song.hidden.title)} · <span class="tabular">${song.hidden.year}</span>${song.hidden.confidence !== "high" ? " · año a verificar" : ""}</p>` : ""}
    <div class="chips">${placedNames.join("")}</div>
    ${err}${busy}
    <button class="go block" data-a="reveal" ${h.busy ? "disabled" : ""}>Revelar año</button>
    <button class="ghost block" data-a="replace" ${h.busy ? "disabled" : ""}>Cambiar canción</button>`;
  } else {
    body = `
    ${frontCard(song, r.n)}
    ${song.confidence !== "high" || song.corrected ? `<p class="small"><span class="pill warn">${song.corrected ? "Año corregido" : "Año a verificar"}</span></p>` : ""}
    <section class="panel"><h3>Resultados</h3>
      <div class="teams">${g.teams.map((t) => {
        const res = r.results[t.id];
        const got = t.cards.some((c) => c.round === r.n);
        const tag = res ? (res.ok ? `<span class="pill ok">${res.challenge ? "Robó la carta" : "Acertó"}</span>` : `<span class="pill no">${res.challenge ? "Desafío fallido" : "Erró"}</span>`) : got ? `<span class="pill ok">Compró la carta</span>` : `<span class="pill">No jugó</span>`;
        return `<div class="teamline"><span class="name"><i class="swatch" style="background:${t.color}"></i>${esc(t.name)} ${tag}</span>
          <button class="ghost sm" data-a="bonus" data-id="${t.id}" ${r.bonus[t.id] || t.tokens >= MAX_TOKENS ? "disabled" : ""}>${r.bonus[t.id] ? "Ficha ✓" : "+1 ficha"}</button></div>`;
      }).join("")}</div>
      <p class="small muted">+1 ficha a quien dijo bien artista y canción.</p>
    </section>
    <details class="panel"><summary>Corregir el año</summary>
      <div class="row" style="margin-top:12px"><input id="fixYear" type="number" inputmode="numeric" min="1900" max="${THIS_YEAR}" placeholder="${song.year}" style="flex:1;min-width:0"><button class="ghost" data-a="fixYear">Corregir</button></div>
      <p class="small muted">Si la metadata trajo el año de un remaster o compilado. Se recalculan los resultados de esta ronda.</p>
    </details>
    ${g.status === "finished" ? winnersView(g, true) : `${err}${busy}<button class="primary block" data-a="next" ${h.busy ? "disabled" : ""}>Siguiente canción →</button>`}`;
  }
  return `${head}${body}${scoreboard}`;
}

function winnersView(g, isHost) {
  const names = g.teams.filter((t) => g.winners.includes(t.id)).map((t) => esc(t.name));
  return `<div class="win">${names.length > 1 ? "¡Empate! Ganan " + names.join(" y ") : "¡Ganó " + names[0] + "!"}</div>
  ${isHost ? `<div class="row"><button class="go" data-a="keepPlaying">Seguir jugando (meta +5)</button><button class="ghost" data-a="newGame">Nueva partida</button></div>` : ""}`;
}

function scoreboardView(g) {
  const sorted = g.teams.slice().sort((a, b) => b.count - a.count);
  return `<section class="panel"><div class="row between"><h3>Tabla</h3><span class="small muted">Meta: ${g.target} cartas</span></div>
    <div class="teams">${sorted.map((t) => `<div class="stack" style="gap:6px">
      <div class="teamline"><span class="name"><i class="swatch" style="background:${t.color}"></i>${esc(t.name)}</span><span class="tabular">${t.count} · ${"●".repeat(t.tokens)}<span class="muted">${"○".repeat(Math.max(0, MAX_TOKENS - t.tokens))}</span></span></div>
      <div class="progress"><i style="width:${Math.min(100, (t.count / g.target) * 100)}%;background:${t.color}"></i></div></div>`).join("")}</div></section>`;
}

function frontCard(song, n) {
  return `<div class="card front" style="background:${decadeColor(song.year)}">
    ${song.cover ? `<img class="cover" src="${esc(song.cover)}" alt="">` : ""}
    <span class="num">RONDA ${n}</span>
    <span class="yr">${song.year}</span>
    <div><div class="song">${esc(song.title)}</div><div class="art">${esc(song.artist)}</div></div>
  </div>`;
}

/* ---------- equipo ---------- */
function joinView() {
  return `
  <div class="topbar"><button class="ghost sm" data-a="home">← Volver</button><span class="label">Unirse</span></div>
  <section class="panel">
    <div class="stack"><label class="label" for="joinCode">Código de la sala</label>
      <input id="joinCode" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(ui.joinCode)}" placeholder="ABCD"></div>
    <div class="stack"><label class="label" for="joinName">Nombre del equipo</label>
      <input id="joinName" maxlength="24" value="${esc(ui.joinName)}" placeholder="Los del fondo"></div>
    <button class="go block" data-a="join" ${ui.joining ? "disabled" : ""}>${ui.joining ? "Entrando…" : "Entrar"}</button>
  </section>`;
}

function teamView() {
  const t = ui.team;
  const st = t?.state;
  const head = `<div class="topbar"><span class="label"><span class="dot ${t?.status || ""}"></span> Sala <b class="tabular">${esc(t?.code || "")}</b></span>
    ${ui.confirmEnd ? `<span class="row"><button class="danger sm" data-a="leaveTeam">Salir</button><button class="ghost sm" data-a="cancelEnd">No</button></span>` : `<button class="ghost sm" data-a="askEnd">Salir</button>`}</div>`;
  if (!st) return `${head}<div class="row"><span class="spinner"></span><span class="muted">Esperando al moderador…</span></div>`;
  const me = st.teams.find((x) => x.id === t.teamId);
  if (!me) return `${head}<p class="muted">Este equipo ya no está en la partida.</p><button class="go" data-a="rejoin">Volver a entrar</button>`;

  const score = `<div class="row between"><h2 style="color:${me.color}">${esc(me.name)}</h2>
    <div class="score"><span><b>${me.count}</b><span class="muted">/${st.target}</span></span><span class="tabular" aria-label="${me.tokens} fichas">${"●".repeat(me.tokens)}<span class="muted">${"○".repeat(Math.max(0, MAX_TOKENS - me.tokens))}</span></span></div></div>
    <div class="progress"><i style="width:${Math.min(100, (me.count / st.target) * 100)}%"></i></div>`;

  if (st.status === "lobby") {
    return `${head}${score}<section class="panel"><h3>¡Están adentro!</h3><p class="muted">Esperen a que el moderador empiece. En la sala:</p>
      <div class="chips">${st.teams.map((x) => `<span class="pill"><i class="swatch" style="background:${x.color};display:inline-block;vertical-align:middle"></i> ${esc(x.name)}</span>`).join("")}</div></section>`;
  }

  const r = st.round;
  if (ui.mySlot && (!r || ui.mySlot.n !== r.n)) ui.mySlot = null;
  let status = "";
  let tl;
  if (!r) {
    status = `<div class="row"><span class="spinner"></span><span class="muted">Esperando la próxima canción…</span></div>`;
    tl = timeline(me, null);
  } else if (r.phase === "listening") {
    const myTurn = st.mode !== "turn" || r.turnTeamId === me.id;
    if (myTurn) {
      const slot = ui.mySlot?.slot;
      status = `${st.mode === "turn" ? `<div class="turn">¡Les toca!</div>` : ""}
      <div class="card back" style="min-height:150px"><span class="num">RONDA ${r.n}</span><span class="verdict">?</span>
      <span class="num">${slot == null ? "TOQUEN DÓNDE VA ↓" : "UBICADA · ESPEREN LA REVELACIÓN"}</span></div>`;
      tl = timeline(me, { mode: "place", selected: slot });
    } else {
      const owner = st.teams.find((x) => x.id === r.turnTeamId);
      const ownerSlot = r.placements[owner.id];
      const mine = r.challenges.find((c) => c.teamId === me.id);
      status = `<div class="turn">Le toca a ${esc(owner.name)}</div>
      ${ownerSlot === undefined ? `<p class="muted">Esperen a que ubiquen la canción. Después pueden desafiar.</p>`
        : mine ? `<p class="muted">Desafío hecho. Esperen la revelación.</p>`
        : me.tokens >= CHALLENGE_COST ? `<p class="muted">¿Creen que erraron? Toquen otra posición en su línea para desafiar (cuesta ${CHALLENGE_COST} ficha).</p>` : `<p class="muted">No tienen fichas para desafiar.</p>`}`;
      tl = ownerSlot === undefined ? timeline(me, null) : timeline(owner, { mode: mine || me.tokens < CHALLENGE_COST ? "view" : "challenge", owner: ownerSlot, taken: r.challenges, mine: mine?.slot, title: "Línea de " + owner.name });
    }
  } else {
    const res = r.results[me.id];
    const got = me.cards.some((c) => c.round === r.n);
    const song = r.song;
    status = `${frontCard(song, r.n)}
      ${res ? `<p class="verdict ${res.ok ? "ok" : "no"}">${res.ok ? (res.challenge ? "¡Se la robaron!" : "¡Bien ubicada! Es suya.") : res.challenge ? "El desafío no salió." : "Uh, no iba ahí."}</p>` : got ? `<p class="verdict ok">Carta comprada.</p>` : ""}
      ${!got && me.tokens >= BUY_COST && st.status === "playing" ? `<button class="ghost block" data-a="buy">Comprar esta carta (${BUY_COST} fichas)</button>` : ""}
      ${st.status === "finished" ? winnersView(st, false) : `<p class="small muted">Esperando la próxima canción…</p>`}`;
    tl = timeline(me, null, r.n);
  }

  const others = st.teams.filter((x) => x.id !== me.id);
  return `${head}${score}${status}${tl}
  ${others.length ? `<section class="panel"><span class="label">Los demás</span><div class="teams">${others.map((x) => `<div class="teamline"><span class="name"><i class="swatch" style="background:${x.color}"></i>${esc(x.name)}</span><span class="tabular">${x.count}/${st.target}</span></div>`).join("")}</div></section>` : ""}`;
}

// opts.mode: "place" (propia), "challenge" (línea ajena), "view"
function timeline(team, opts, highlightRound) {
  const cards = team.cards;
  const slot = (k) => {
    if (!opts || opts.mode === "view") {
      if (opts && (opts.owner === k || opts.mine === k)) return `<div class="slot taken" role="note">${opts.owner === k ? "Eligieron acá" : "Su desafío"}</div>`;
      return "";
    }
    const label = cards.length === 0 ? "Acá" : k === 0 ? `Antes de ${cards[0].year}` : k === cards.length ? `Después de ${cards[k - 1].year}` : `Entre ${cards[k - 1].year} y ${cards[k].year}`;
    if (opts.mode === "challenge") {
      if (opts.owner === k) return `<div class="slot taken" role="note">Eligieron acá</div>`;
      if (opts.taken.some((c) => c.slot === k)) return `<div class="slot taken" role="note">Ya desafiado</div>`;
      return `<button class="slot" data-a="challenge" data-k="${k}">${label}</button>`;
    }
    return `<button class="slot" aria-pressed="${opts.selected === k}" data-a="place" data-k="${k}">${label}</button>`;
  };
  return `<section class="stack"><span class="label">${esc(opts?.title || "Su línea de tiempo")}</span>
    <div class="tl">${slot(0)}${cards.map((c, i) => `<div class="tcard ${highlightRound && c.round === highlightRound ? "new" : ""}" style="background:${decadeColor(c.year)}"><span class="y">${c.year}</span><span class="t"><b>${esc(c.title)}</b><span>${esc(c.artist)}</span></span></div>${slot(i + 1)}`).join("")}</div></section>`;
}

/* ---------------- audio, QR ---------------- */
function syncAudio() {
  const song = ui.screen === "host" && ui.host?.game.round?.song;
  const src = song?.preview || "";
  const listening = ui.host?.game.round?.phase === "listening";
  if (player.dataset.src !== src) {
    player.pause();
    player.dataset.src = src;
    if (src) player.src = src;
    else player.removeAttribute("src");
  }
  if (!listening && !player.paused) {
    // Al revelar sigue sonando: es lindo escuchar el final con el título a la vista.
  }
}
player.addEventListener("timeupdate", () => {
  const p = document.getElementById("prog");
  if (p && player.duration) p.style.width = (player.currentTime / player.duration) * 100 + "%";
});
["play", "pause", "ended"].forEach((ev) => player.addEventListener(ev, () => ui.screen === "host" && render()));

function joinLink(code) {
  const u = new URL(location.href);
  u.search = "?sala=" + code + (MOCK ? "&mock" : "");
  u.hash = "";
  return u.toString();
}
function drawQr() {
  const el = document.getElementById("qr");
  if (!el || !window.qrcode) return;
  const qr = window.qrcode(0, "M");
  qr.addData(el.dataset.link);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
window.addEventListener("load", drawQr);

/* ---------------- acciones ---------------- */
async function startHost({ code, config, gameData, mock }) {
  ui.host?.close();
  ui.screen = "host";
  ui.host = await createHost({ code, config, gameData, mock, onChange: render });
  keepAwake();
  render();
}

async function startTeam(code, teamId) {
  ui.team?.close();
  ui.team = await createTeamClient({ code, teamId, onChange: render, onError: toast });
  return ui.team;
}

const A = {
  home: () => go("home"),
  toSetup: () => go("setup"),
  toJoin: () => go("join"),
  country(el) {
    readSetupInputs();
    const c = ui.setup.countries;
    ui.setup.countries = c.includes(el.dataset.k) ? c.filter((x) => x !== el.dataset.k) : [...c, el.dataset.k];
    saveSetup();
    render();
  },
  popularity: (el) => (readSetupInputs(), (ui.setup.popularity = el.dataset.k), saveSetup(), render()),
  mode: (el) => (readSetupInputs(), (ui.setup.mode = el.dataset.k), saveSetup(), render()),
  target: (el) => (readSetupInputs(), (ui.setup.target = Math.max(3, Math.min(20, ui.setup.target + Number(el.dataset.d)))), saveSetup(), render()),
  async createRoom() {
    readSetupInputs();
    const s = ui.setup;
    const config = {
      countries: s.countries,
      queries: s.queries.split(",").map((q) => q.trim()).filter(Boolean),
      playlists: s.playlists.split(/\s+/).filter(Boolean),
      yearFrom: s.yearFrom,
      yearTo: s.yearTo,
      popularity: s.popularity,
      mode: s.mode,
      target: s.target,
    };
    if (!config.countries.length && !config.queries.length && !config.playlists.length) return toast("Elegí al menos un país, una búsqueda o una playlist");
    clearSavedHost();
    await startHost({ code: roomCode(), config, mock: MOCK });
  },
  async resumeHost() {
    const h = savedHost();
    if (!h) return go("home");
    await startHost({ code: h.code, config: h.config, gameData: h.game, mock: h.mock });
  },
  async resumeTeam() {
    const t = savedTeam();
    if (!t) return go("home");
    ui.screen = "team";
    render();
    await startTeam(t.code, t.teamId);
    keepAwake();
  },
  copyLink() {
    const link = joinLink(ui.host.code);
    navigator.clipboard?.writeText(link).then(() => toast("Link copiado"), () => toast(link));
  },
  removeTeam: (el) => hostDo(() => ui.host.removeTeam(el.dataset.id)),
  start: () => hostDo(() => ui.host.start()),
  reveal: () => hostDo(() => ui.host.reveal()),
  next: () => {
    ui.peek = false;
    player.pause();
    return hostDo(() => ui.host.next());
  },
  replace: () => {
    ui.peek = false;
    return hostDo(() => ui.host.replace());
  },
  bonus: (el) => hostDo(() => ui.host.bonus(el.dataset.id)),
  fixYear: () => hostDo(() => ui.host.correctYear(Number($("#fixYear").value))),
  keepPlaying: () => hostDo(() => ui.host.keepPlaying()),
  newGame() {
    ui.host?.close();
    ui.host = null;
    clearSavedHost();
    go("setup");
  },
  peek: () => ((ui.peek = !ui.peek), render()),
  togglePlay() {
    if (player.paused) player.play().catch(() => toast("No se pudo reproducir. Probá con Spotify."));
    else player.pause();
  },
  askEnd: () => ((ui.confirmEnd = true), render()),
  cancelEnd: () => ((ui.confirmEnd = false), render()),
  endHost() {
    player.pause();
    ui.host?.close();
    ui.host = null;
    clearSavedHost();
    go("home");
  },
  leaveTeam() {
    ui.team?.close();
    ui.team = null;
    clearSavedTeam();
    go("home");
  },
  rejoin() {
    ui.joinCode = ui.team?.code || "";
    ui.team?.close();
    ui.team = null;
    clearSavedTeam();
    go("join");
  },
  async join() {
    const code = $("#joinCode").value.trim().toUpperCase();
    const name = $("#joinName").value.trim();
    ui.joinCode = code;
    ui.joinName = name;
    if (!/^[A-Z]{4}$/.test(code)) return toast("El código tiene 4 letras");
    if (!name) return toast("Pongan un nombre de equipo");
    ui.joining = true;
    render();
    try {
      const t = await startTeam(code, null);
      await t.join(name);
      ui.screen = "team";
      keepAwake();
    } catch (e) {
      ui.team?.close();
      ui.team = null;
      toast(e.message);
    } finally {
      ui.joining = false;
      render();
    }
  },
  place(el) {
    const k = Number(el.dataset.k);
    const n = ui.team.state.round.n;
    if (ui.mySlot?.slot === k) {
      ui.mySlot = null;
      ui.team.act("unplace");
    } else {
      ui.mySlot = { n, slot: k };
      ui.team.act("place", k);
    }
    render();
  },
  challenge(el) {
    ui.team.act("challenge", Number(el.dataset.k));
  },
  buy: () => ui.team.act("buy"),
};

async function hostDo(fn) {
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  }
  render();
}

function go(screen) {
  ui.screen = screen;
  ui.confirmEnd = false;
  render();
  window.scrollTo(0, 0);
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-a]");
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (fn) {
    ev.preventDefault();
    fn(el);
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && (ev.target.id === "joinName" || ev.target.id === "joinCode")) A.join();
});

// Inicio: si viene ?sala=XXXX desde el QR, directo a unirse.
if (ui.joinCode) {
  const t = savedTeam();
  if (t?.teamId && t.code === ui.joinCode) A.resumeTeam();
  else go("join");
} else render();
