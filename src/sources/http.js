// Utilidades de red que corren en el navegador y en Node (tests).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cola que garantiza un intervalo mínimo entre requests a la misma API.
export class RateLimiter {
  constructor(minIntervalMs) {
    this.minIntervalMs = minIntervalMs;
    this.chain = Promise.resolve();
    this.last = 0;
  }
  schedule(fn) {
    const run = this.chain.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      return fn();
    });
    this.chain = run.catch(() => {});
    return run;
  }
}

export async function withRetry(fn, { retries = 2, baseDelay = 800 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries && e.retryable !== false) {
        await sleep(baseDelay * (i + 1));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

// fetch JSON con timeout. MusicBrainz habilita CORS, así que funciona desde el navegador.
export async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// JSONP: la API de Deezer no manda cabeceras CORS, pero soporta output=jsonp.
let jsonpSeq = 0;
export function jsonp(url, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = `__dz${Date.now().toString(36)}${++jsonpSeq}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[cb];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Object.assign(new Error("Timeout"), { retryable: true }));
    }, timeoutMs);
    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(Object.assign(new Error("Error de red"), { retryable: true }));
    };
    script.src = url + (url.includes("?") ? "&" : "?") + `output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}
