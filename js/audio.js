// ---------- procedural WebAudio sfx + tiny music sequencer ----------
let ctx = null, master = null, musicGain = null, sfxGain = null;
let musicTimer = null, musicOn = false;
const S = { sfx: 0.8, music: 0.35 };

function ensure() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = S.sfx; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = S.music; musicGain.connect(master);
    return true;
  } catch (e) { return false; }
}

export function setVolumes(sfx, music) {
  S.sfx = sfx; S.music = music;
  if (sfxGain) sfxGain.gain.value = sfx;
  if (musicGain) musicGain.gain.value = music;
  if (music <= 0.001) stopMusic(); else if (!musicOn && ctx) startMusic();
}

function tone(freq, dur, type = 'sine', vol = 0.5, dest = null, slideTo = null, when = 0) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.4, freq = 1000, q = 1, when = 0) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t0);
}

export const SFX = {
  click()   { tone(660, 0.06, 'triangle', 0.25); },
  hover()   { tone(880, 0.03, 'sine', 0.08); },
  buy()     { tone(523, 0.08, 'triangle', 0.3); tone(784, 0.12, 'triangle', 0.3, null, null, 0.07); },
  deny()    { tone(180, 0.15, 'sawtooth', 0.2, null, 120); },
  coin()    { tone(988, 0.07, 'square', 0.15); tone(1319, 0.16, 'square', 0.15, null, null, 0.06); },
  hit()     { noise(0.09, 0.5, 500, 0.8); tone(160, 0.1, 'sine', 0.4, null, 60); },
  bigHit()  { noise(0.16, 0.7, 300, 0.7); tone(110, 0.2, 'sine', 0.6, null, 40); },
  swish()   { noise(0.12, 0.25, 2200, 1.5); },
  spit()    { tone(500, 0.1, 'sine', 0.2, null, 900); },
  ko()      { tone(90, 0.6, 'sine', 0.7, null, 35); noise(0.4, 0.5, 200, 0.6); },
  bell()    { tone(1568, 0.5, 'sine', 0.35); tone(2093, 0.4, 'sine', 0.2, null, null, 0.02); },
  countdown(){ tone(440, 0.12, 'square', 0.25); },
  go()      { tone(880, 0.28, 'square', 0.3); },
  cheer()   { for (let i = 0; i < 5; i++) noise(0.5, 0.12, 800 + i * 300, 0.5, i * 0.05); },
  fanfare() {
    const seq = [[523,0],[659,0.12],[784,0.24],[1047,0.38]];
    for (const [f, w] of seq) tone(f, 0.28, 'triangle', 0.32, null, null, w);
  },
  sad()     { tone(392, 0.25, 'triangle', 0.28); tone(311, 0.4, 'triangle', 0.28, null, null, 0.22); },
  levelup() {
    const seq = [[659,0],[784,0.1],[988,0.2],[1319,0.32]];
    for (const [f, w] of seq) tone(f, 0.25, 'square', 0.18, null, null, w);
  },
  whistle() { tone(2000, 0.3, 'sine', 0.25, null, 2400); },
  pop()     { tone(320, 0.08, 'square', 0.35, null, 90); noise(0.12, 0.5, 900, 0.9); },
  splat()   { noise(0.14, 0.45, 300, 0.6); tone(140, 0.12, 'sine', 0.3, null, 60); },
  knell()   { tone(196, 1.4, 'sine', 0.5); tone(147, 1.6, 'sine', 0.35, null, null, 0.05); tone(98, 2.0, 'sine', 0.3, null, null, 0.1); },
  jackpot() {
    const seq = [[784,0],[988,0.09],[1175,0.18],[1568,0.28],[1976,0.4]];
    for (const [f, w] of seq) tone(f, 0.22, 'square', 0.2, null, null, w);
    for (let i = 0; i < 6; i++) tone(1200 + Math.random() * 1200, 0.12, 'sine', 0.12, null, null, 0.5 + i * 0.06);
  },
  tick()    { tone(1100, 0.04, 'square', 0.12); },
  connect() { tone(523, 0.12, 'sine', 0.25); tone(784, 0.2, 'sine', 0.25, null, null, 0.1); },
};

// --- ambient music: gentle 2-bar loop, randomized notes from a pentatonic scale ---
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
let step = 0;
function musicTick() {
  if (!ctx || !musicOn) return;
  const bass = SCALE[[0, 0, 3, 4][Math.floor(step / 8) % 4]] / 2;
  if (step % 8 === 0) tone(bass, 0.9, 'triangle', 0.25, musicGain);
  if (step % 2 === 0 && Math.random() < 0.75) {
    const n = SCALE[Math.floor(Math.random() * SCALE.length)];
    tone(n * 2, 0.3, 'sine', 0.1, musicGain);
  }
  if (step % 4 === 2) noise(0.03, 0.05, 6000, 2);
  step++;
}
export function startMusic() {
  if (!ensure() || musicOn || S.music <= 0.001) return;
  musicOn = true;
  musicTimer = setInterval(musicTick, 240);
}
export function stopMusic() {
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
export function unlockAudio() { // call on first user gesture
  if (ensure() && ctx.state === 'suspended') ctx.resume();
}
