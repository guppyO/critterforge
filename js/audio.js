// ============================================================
// Audio: real CC0 samples (Kenney) with synth fallback, plus
// streamed CC0 music (Juhani Junkala). Synth stays for anything
// that has no file — nothing ever hard-fails.
// ============================================================
let ctx = null, master = null, musicGain = null, sfxGain = null;
let musicTimer = null, musicOn = false;
const S = { sfx: 0.8, music: 0.35 };

// ---------- sample library ----------
const SAMPLE_FILES = {
  hit: 5, bighit: 5, pop: 5, splat: 5, step: 5,
  ko: 1, shell: 1, click: 1, select: 1, confirm: 1, deny: 1, coin: 1,
  fanfare_up: 1, sad_down: 1, notify: 1, levelup: 1, bell: 1,
};
const buffers = {}; // name → AudioBuffer[]

export async function loadSamples() {
  if (typeof fetch === 'undefined' || !ensure()) return;
  const jobs = [];
  for (const [name, count] of Object.entries(SAMPLE_FILES)) {
    buffers[name] = [];
    for (let i = 0; i < count; i++) {
      const file = count > 1 ? `assets/audio/${name}_${i}.ogg` : `assets/audio/${name}.ogg`;
      jobs.push(fetch(file)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => { buffers[name].push(buf); })
        .catch(() => {}));
    }
  }
  await Promise.all(jobs);
}

// play a sample variant; returns false if unavailable (caller falls back to synth)
function sample(name, vol = 0.9, rate = 1) {
  const list = buffers[name];
  if (!ctx || !list || !list.length) return false;
  const src = ctx.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(sfxGain);
  src.start();
  return true;
}

// ---------- streamed music ----------
let musicEl = null, musicName = '';
export function playMusic(name /* 'menu' | 'battle' */) {
  if (typeof Audio === 'undefined') return;
  if (musicName === name && musicEl && !musicEl.paused) return;
  stopMusic();
  try {
    const el = new Audio(`assets/audio/music_${name}.ogg`);
    el.loop = true;
    el.volume = Math.min(1, S.music * 0.85);
    el.play().then(() => { musicEl = el; musicName = name; })
      .catch(() => { startMusic(); }); // autoplay blocked / file missing → generative fallback
    musicEl = el; musicName = name;
  } catch (e) { startMusic(); }
}

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
  if (musicEl) musicEl.volume = Math.min(1, music * 0.85);
  if (music <= 0.001) stopMusic();
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
  click()   { if (!sample('click', 0.5)) tone(660, 0.06, 'triangle', 0.25); },
  hover()   { tone(880, 0.03, 'sine', 0.08); },
  buy()     { if (!sample('confirm', 0.6)) { tone(523, 0.08, 'triangle', 0.3); tone(784, 0.12, 'triangle', 0.3, null, null, 0.07); } },
  deny()    { if (!sample('deny', 0.55)) tone(180, 0.15, 'sawtooth', 0.2, null, 120); },
  coin()    { if (!sample('coin', 0.6, 1.1)) { tone(988, 0.07, 'square', 0.15); tone(1319, 0.16, 'square', 0.15, null, null, 0.06); } },
  hit()     { if (!sample('hit', 0.8, 0.92 + Math.random() * 0.18)) { noise(0.09, 0.5, 500, 0.8); tone(160, 0.1, 'sine', 0.4, null, 60); } },
  bigHit()  { if (!sample('bighit', 1, 0.9 + Math.random() * 0.18)) { noise(0.16, 0.7, 300, 0.7); tone(110, 0.2, 'sine', 0.6, null, 40); } },
  swish()   { noise(0.12, 0.25, 2200, 1.5); },
  spit()    { tone(500, 0.1, 'sine', 0.2, null, 900); },
  ko()      { if (!sample('ko', 1)) { tone(90, 0.6, 'sine', 0.7, null, 35); noise(0.4, 0.5, 200, 0.6); } sample('bighit', 0.9, 0.7); },
  bell()    { if (!sample('bell', 0.6)) { tone(1568, 0.5, 'sine', 0.35); tone(2093, 0.4, 'sine', 0.2, null, null, 0.02); } },
  countdown(){ tone(440, 0.12, 'square', 0.25); },
  go()      { if (!sample('notify', 0.7, 1.15)) tone(880, 0.28, 'square', 0.3); },
  cheer()   { for (let i = 0; i < 5; i++) noise(0.5, 0.12, 800 + i * 300, 0.5, i * 0.05); },
  fanfare() { if (!sample('fanfare_up', 0.8)) { const seq = [[523,0],[659,0.12],[784,0.24],[1047,0.38]]; for (const [f, w] of seq) tone(f, 0.28, 'triangle', 0.32, null, null, w); } },
  sad()     { if (!sample('sad_down', 0.7)) { tone(392, 0.25, 'triangle', 0.28); tone(311, 0.4, 'triangle', 0.28, null, null, 0.22); } },
  levelup() { if (!sample('levelup', 0.7)) { const seq = [[659,0],[784,0.1],[988,0.2],[1319,0.32]]; for (const [f, w] of seq) tone(f, 0.25, 'square', 0.18, null, null, w); } },
  whistle() { tone(2000, 0.3, 'sine', 0.25, null, 2400); },
  pop()     { if (!sample('pop', 0.9, 0.9 + Math.random() * 0.2)) { tone(320, 0.08, 'square', 0.35, null, 90); noise(0.12, 0.5, 900, 0.9); } },
  splat()   { if (!sample('splat', 0.8, 0.9 + Math.random() * 0.2)) { noise(0.14, 0.45, 300, 0.6); tone(140, 0.12, 'sine', 0.3, null, 60); } },
  step()    { sample('step', 0.25, 0.85 + Math.random() * 0.3); },
  knell()   { if (!sample('ko', 0.9, 0.55)) tone(196, 1.4, 'sine', 0.5); tone(147, 1.6, 'sine', 0.3, null, null, 0.05); },
  jackpot() {
    sample('coin', 0.7, 1.3);
    const seq = [[784,0],[988,0.09],[1175,0.18],[1568,0.28],[1976,0.4]];
    for (const [f, w] of seq) tone(f, 0.22, 'square', 0.2, null, null, w);
  },
  tick()    { if (!sample('select', 0.35, 1.2)) tone(1100, 0.04, 'square', 0.12); },
  connect() { if (!sample('confirm', 0.7)) { tone(523, 0.12, 'sine', 0.25); tone(784, 0.2, 'sine', 0.25, null, null, 0.1); } },
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
  if (musicEl) { try { musicEl.pause(); } catch (e) {} musicEl = null; musicName = ''; }
}
export function unlockAudio() { // call on first user gesture
  if (ensure() && ctx.state === 'suspended') ctx.resume();
}
