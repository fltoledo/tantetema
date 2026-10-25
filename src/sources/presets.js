// Búsquedas de playlists por país. Son términos para /search/playlist de Deezer:
// cada partida elige algunos al azar, así el mazo cambia cada vez.
// Para sumar un país, agregá una entrada (los PRs son bienvenidos).
// `level` es el peso por defecto (ver LEVELS). `recent` saca las pistas de década
// de las búsquedas y `minYear` descarta lo anterior a ese año.

export const PRESETS = {
  uy: {
    name: "Uruguay",
    level: 3,
    queries: ["rock uruguayo", "uruguay hits", "música uruguaya", "cumbia uruguaya", "clásicos uruguayos", "pop uruguayo", "candombe uruguayo", "murga uruguaya"],
  },
  uyNow: {
    name: "Uruguay actual",
    level: 3,
    recent: true,
    minYear: 2010,
    queries: ["top 50 uruguay", "uruguay 2020", "plena uruguaya", "cumbia uruguaya 2025", "previa uruguay", "cumbia cheta", "indie uruguay", "trap uruguayo", "uruguay hits"],
  },
  ar: {
    name: "Argentina",
    queries: ["rock nacional argentino", "clásicos rock nacional", "cumbia argentina", "argentina hits", "cuarteto", "pop argentino", "trap argentino", "folklore argentino"],
  },
  cl: {
    name: "Chile",
    queries: ["rock chileno", "clásicos chilenos", "cumbia chilena", "chile hits", "pop chileno"],
  },
  mx: {
    name: "México",
    queries: ["rock mexicano", "clásicos mexicanos", "pop mexicano", "regional mexicano", "mexico hits"],
  },
  es: {
    name: "España",
    queries: ["pop español", "rock español", "movida madrileña", "clásicos españoles", "españa hits"],
  },
  br: {
    name: "Brasil",
    queries: ["MPB clássicos", "rock brasileiro", "sertanejo", "pagode", "brasil hits", "samba"],
  },
  latam: {
    name: "Latino",
    queries: ["éxitos latinos", "reggaeton clásicos", "latin hits", "salsa clásicos", "baladas en español"],
  },
  int: {
    name: "Internacional",
    queries: ["greatest hits of all time", "classic rock hits", "pop hits", "80s hits", "90s hits", "2000s hits", "70s hits", "60s hits", "2010s hits", "disco classics"],
  },
};

// Cuánto pesa cada país o estilo en el mazo.
export const LEVELS = [
  { name: "Poco", weight: 1 },
  { name: "Normal", weight: 2 },
  { name: "Mucho", weight: 4 },
];
export const DEFAULT_LEVEL = 2;

// Sufijos de década para pedir variedad en las búsquedas.
export const DECADE_HINTS = {
  1960: ["60s", "años 60"],
  1970: ["70s", "años 70"],
  1980: ["80s", "años 80"],
  1990: ["90s", "años 90"],
  2000: ["2000s", "años 2000"],
  2010: ["2010s"],
  2020: ["2020s", "hits 2024"],
};
