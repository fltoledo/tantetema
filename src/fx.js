// Efectos del final de la partida: confeti para quien gana y trombón triste para quien pierde.
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function confetti({ colors = ["#ff4d8d", "#45e0bf", "#ffc53d", "#7aa7ff", "#c38bff", "#f7f1ff"], count = 180, duration = 4500 } = {}) {
  if (reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "fx";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  // Dos cañones desde abajo, uno en cada costado, más una lluvia desde arriba.
  const bits = Array.from({ length: count }, (_, i) => {
    const side = i % 3;
    const fromTop = side === 2;
    const angle = fromTop ? Math.PI / 2 : side === 0 ? -Math.PI / 3 - Math.random() * 0.5 : (-2 * Math.PI) / 3 + Math.random() * 0.5;
    const speed = fromTop ? 1 + Math.random() * 2 : 11 + Math.random() * 8;
    return {
      x: fromTop ? Math.random() * W : side === 0 ? 0 : W,
      y: fromTop ? -20 - Math.random() * H * 0.5 : H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
    };
  });

  // El reloj arranca en el primer cuadro: si la pantalla estaba apagada, se ve al volver.
  let start = null;
  function frame(now) {
    start ??= now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
    for (const b of bits) {
      b.vy += 0.25;
      b.vx *= 0.99;
      b.vy = Math.min(b.vy, 4.5);
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, Math.abs(Math.cos(b.rot * 2)) * b.h + 1);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

// El audio del navegador solo arranca después de un toque: lo destrabamos en el primero.
let audio = null;
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch {}
}

// "Wah, wah, wah, waaah".
export function sadTrombone() {
  if (!audio) return;
  const notes = [293.66, 277.18, 261.63, 246.94];
  const t0 = audio.currentTime + 0.05;
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    const start = t0 + i * 0.42;
    const len = last ? 1.4 : 0.38;
    const osc = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, start);
    osc.frequency.linearRampToValueAtTime(f * 0.97, start + len);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
    gain.gain.setValueAtTime(0.18, start + len - 0.08);
    gain.gain.linearRampToValueAtTime(0, start + len);
    if (last) {
      // Vibrato en la última nota.
      const lfo = audio.createOscillator();
      const depth = audio.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = 5;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + len);
    }
    osc.connect(filter).connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + len);
  });
}
