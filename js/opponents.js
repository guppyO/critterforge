// ============================================================
// Procedural opponents: archetype builds whose quality scales
// with the player's rating. Low ranks face scrappy underbuilt
// critters; Legend faces fully-optimized budget builds.
// ============================================================
import { rng, pick, clamp } from './util.js';
import { newCreature } from './creature.js';
import { budgetOf, PLANETS } from './parts.js';

// archetype → home planet flavor (with some drift)
const ARCH_PLANET = {
  scorpion: 'umbra', juggernaut: 'glaciem', lancer: 'pyrion', artillery: 'meridian',
  phantom: 'zephyros', slasher: 'verdantia', bulwark: 'glaciem', brawler: 'verdantia',
};

const SYL_A = ['Gro', 'Zik', 'Mun', 'Bla', 'Skri', 'Twy', 'Vor', 'Chi', 'Ras', 'Glu', 'Pom', 'Kra', 'Yol', 'Fizz', 'Dru', 'Sna', 'Web', 'Quill', 'Bog', 'Nib'];
const SYL_B = ['bble', 'zzle', 'gnar', 'pod', 'mite', 'fang', 'back', 'stomp', 'wick', 'dart', 'runt', 'clank', 'thorn', 'whisk', 'snap', 'gob', 'lash', 'crush', 'zoom', 'chomp'];

export function genName(r) {
  let n = pick(r, SYL_A) + pick(r, SYL_B);
  if (r() < 0.25) n += ' ' + pick(r, ['Jr.', 'II', 'the Bold', 'the Damp', 'Prime', 'X', 'of Doom', 'the Swift', 'Supreme', 'McFangs']);
  return n;
}

const PALETTES = [
  ['#f87171', '#7f1d1d'], ['#fb923c', '#7c2d12'], ['#facc15', '#713f12'], ['#4ade80', '#14532d'],
  ['#34d399', '#064e3b'], ['#22d3ee', '#164e63'], ['#60a5fa', '#1e3a8a'], ['#a78bfa', '#4c1d95'],
  ['#f472b6', '#831843'], ['#e879f9', '#701a75'], ['#94a3b8', '#1e293b'], ['#fbbf24', '#78350f'],
];

// archetype recipes discovered via test/sweep.mjs meta exploration —
// all strong, stylistically diverse builds. High quality uses the full
// recipe; low quality strips organs/armor and drops leg pairs.
const ARCHETYPES = [
  { id: 'scorpion', body: 'pod', legs: ['stomper', 2], weapons: ['stinger', 'pincer'], armor: ['spikes', 'shell'], organs: ['eyes', 'heart'], size: 1.15, eyes: 'angry' },
  { id: 'juggernaut', body: 'tank', legs: ['stomper', 3], weapons: ['crusher'], armor: ['shell'], organs: ['heart'], size: 1.2, eyes: 'angry' },
  { id: 'lancer', body: 'pod', legs: ['strider', 3], weapons: ['horn', 'crusher'], armor: ['spikes', 'chitin'], organs: ['heart', 'lungs'], size: 1.2, eyes: 'round' },
  { id: 'artillery', body: 'longback', legs: ['springer', 1], weapons: ['spitter', 'spitter', 'crusher'], armor: ['shell'], organs: ['fat'], size: 1.25, eyes: 'big' },
  { id: 'phantom', body: 'wisp', legs: ['strider', 1], weapons: ['crusher'], armor: ['spikes'], organs: ['frenzy', 'gyro'], size: 1.25, eyes: 'big' },
  { id: 'slasher', body: 'longback', legs: ['scuttler', 3], weapons: ['jaw', 'jaw', 'crusher'], armor: ['spikes'], organs: ['frenzy'], size: 1.05, eyes: 'round' },
  { id: 'bulwark', body: 'tank', legs: ['scuttler', 2], weapons: ['horn', 'stinger'], armor: ['shell', 'spikes'], organs: [], size: 1.15, eyes: 'round' },
  { id: 'brawler', body: 'pod', legs: ['scuttler', 2], weapons: ['jaw', 'jaw'], armor: ['chitin', 'chitin'], organs: ['fat', 'heart'], size: 1.1, eyes: 'angry' },
];

const TRAIT_POOL = ['vital', 'thickhide', 'sprinter', 'berserker', 'slippery', 'anchor', 'sharp', 'marathon', 'brawny', 'regrow'];

// quality 0..1 from rating (800 → 0.15, 1800+ → 1)
export function qualityFromRating(rating) {
  return clamp((rating - 750) / 1000, 0.12, 1);
}

export function genOpponent(rating, playerLevel = 1, seed = Math.floor(Math.random() * 1e9), preferRacer = false) {
  const r = rng(seed);
  const q = qualityFromRating(rating);
  let pool = ARCHETYPES;
  if (preferRacer) pool = ARCHETYPES.filter(a => ['phantom', 'slasher', 'lancer', 'brawler'].includes(a.id));
  const arch = pick(r, pool);

  const design = {
    body: arch.body,
    legs: { type: arch.legs[0], pairs: arch.legs[1] },
    weapons: [...arch.weapons],
    armor: [...arch.armor],
    organs: [...arch.organs],
    size: arch.size * (0.94 + r() * 0.12),
    colors: (() => { const p = pick(r, PALETTES); return { a: p[0], b: p[1] }; })(),
    pattern: pick(r, ['spots', 'stripes', 'belly', 'none']),
    eyes: arch.eyes,
    planet: r() < 0.7 ? (ARCH_PLANET[arch.id] || 'meridian') : pick(r, Object.keys(PLANETS)),
  };

  // degrade build at low quality: strip parts until it feels "scrappy"
  const strip = Math.round((1 - q) * 3.2);
  for (let i = 0; i < strip; i++) {
    const roll = r();
    if (roll < 0.4 && design.organs.length > 0) design.organs.pop();
    else if (roll < 0.7 && design.armor.length > 0) design.armor.pop();
    else if (design.legs.pairs > 1 && r() < 0.6) design.legs.pairs--;
    else if (design.weapons.length > 1) design.weapons.pop();
  }
  // safety: fit budget (shouldn't trigger, but guard)
  let guard = 0;
  while (budgetOf(design) > 100 && guard++ < 10) {
    if (design.organs.length) design.organs.pop();
    else if (design.armor.length) design.armor.pop();
    else if (design.legs.pairs > 1) design.legs.pairs--;
    else design.size = Math.max(0.85, design.size - 0.05);
  }

  const cre = newCreature(design, genName(r));
  // level near player's, biased by quality
  const jitter = Math.round((r() - 0.45) * 2);
  cre.level = clamp(playerLevel + jitter, 1, 10);
  // traits for its level (picks at 3/6/9)
  const nTraits = cre.level >= 9 ? 3 : cre.level >= 6 ? 2 : cre.level >= 3 ? 1 : 0;
  const tp = [...TRAIT_POOL];
  for (let i = 0; i < nTraits; i++) cre.traits.push(tp.splice(Math.floor(r() * tp.length), 1)[0]);
  cre.wins = Math.floor(r() * rating / 12);
  cre.losses = Math.floor(r() * rating / 16);
  return cre;
}

export function genTeam(rating, playerLevels, count, seed) {
  const r = rng(seed);
  const team = [];
  for (let i = 0; i < count; i++) {
    const lvl = playerLevels[i % playerLevels.length] || 1;
    team.push(genOpponent(rating, lvl, Math.floor(r() * 1e9)));
  }
  return team;
}
