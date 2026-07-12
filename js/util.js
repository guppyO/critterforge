// ---------- math / rng / misc helpers ----------
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const angTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

// smallest signed angle difference a->b in [-PI, PI]
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// seeded rng (mulberry32)
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const rrange = (r, a, b) => a + r() * (b - a);

let _uid = Date.now() % 100000;
export const uid = () => 'c' + (_uid++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
};
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Game loop that keeps ticking when the tab is hidden (falls back to
// setTimeout, since requestAnimationFrame pauses in background tabs).
// Returns a stop() function.
export function startLoop(fn) {
  let stopped = false, id = 0, usedTimeout = false;
  const tick = (t) => {
    if (stopped) return;
    fn(t === undefined ? performance.now() : t);
    schedule();
  };
  const schedule = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      usedTimeout = true;
      id = setTimeout(() => tick(performance.now()), 33);
    } else {
      usedTimeout = false;
      id = requestAnimationFrame(tick);
    }
  };
  schedule();
  return () => {
    stopped = true;
    if (usedTimeout) clearTimeout(id); else cancelAnimationFrame(id);
  };
}

// shade a hex color by amt (-1 .. 1)
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}
