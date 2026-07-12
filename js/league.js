// ============================================================
// Profile, save/load, Elo leagues, rewards, gauntlet economy.
// Design decisions:
//  - No permadeath: losses cost rating + missed rewards, never
//    your creation. Stakes live in the opt-in Gauntlet (run-based).
//  - DNA is the single soft currency: matches → DNA → parts/slots.
// ============================================================
import { clamp } from './util.js';
import { FREE_PARTS, CATALOG } from './parts.js';

const TOTAL_PARTS = Object.values(CATALOG).reduce((s, t) => s + Object.keys(t).length, 0);

const KEY = 'critterforge_save_v1';

export const LEAGUES = [
  { name: 'Bronze', icon: '🥉', min: 0 },
  { name: 'Silver', icon: '🥈', min: 1100 },
  { name: 'Gold', icon: '🥇', min: 1250 },
  { name: 'Platinum', icon: '💠', min: 1400 },
  { name: 'Diamond', icon: '💎', min: 1550 },
  { name: 'Legend', icon: '👑', min: 1700 },
];
export const RATING_FLOOR = 800;
export const SLOT_PRICES = [200, 400, 700, 1100, 1600]; // slots 4..8

export let G = null;

export function defaultProfile() {
  return {
    ver: 1,
    dna: 150,
    rating: 1000, bestRating: 1000,
    unlocked: [...FREE_PARTS],
    creatures: [],
    activeId: null,
    slots: 3,
    settings: { sfx: 0.8, music: 0.3, speed: 1, gore: 'goo' }, // gore: 'goo' | 'blood' | 'off'
    seenIntro: false,
    stats: { battles: 0, wins: 0, losses: 0, draws: 0, races: 0, raceWins: 0, gauntletBest: 0, dnaEarned: 0,
             friendWins: 0, friendLosses: 0, betsWon: 0, betsLost: 0, betProfit: 0, boneyardWins: 0,
             tourneyBetsWon: 0, tourneys: 0 },
    gauntlet: null, // {creId, stage, bank}
    boneyard: { streak: 0, best: 0 },
    graveyard: [], // fallen critters: {name, level, wins, losses, traits, planet, epitaph, diedAt, streak}
    playerName: '',
    lastWinDay: '',
    milestones: [],
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      G = JSON.parse(raw);
      // migrate-safe defaults (top level + nested stats/settings/boneyard)
      const d = defaultProfile();
      for (const k of Object.keys(d)) if (G[k] === undefined) G[k] = d[k];
      for (const k of Object.keys(d.stats)) if (G.stats[k] === undefined) G.stats[k] = d.stats[k];
      for (const k of Object.keys(d.settings)) if (G.settings[k] === undefined) G.settings[k] = d.settings[k];
      for (const k of Object.keys(d.boneyard)) if (G.boneyard[k] === undefined) G.boneyard[k] = d.boneyard[k];
      return G;
    }
  } catch (e) { console.warn('save corrupt, resetting', e); }
  G = defaultProfile();
  return G;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} }
export function hardReset() { localStorage.removeItem(KEY); G = defaultProfile(); save(); }

export function leagueOf(rating) {
  let cur = LEAGUES[0];
  for (const l of LEAGUES) if (rating >= l.min) cur = l;
  return cur;
}
export function nextLeague(rating) {
  for (const l of LEAGUES) if (rating < l.min) return l;
  return null;
}

// ---------- Elo ----------
export function eloDelta(player, opp, score /*1 win, 0.5 draw, 0 loss*/) {
  const expected = 1 / (1 + Math.pow(10, (opp - player) / 400));
  return Math.round(32 * (score - expected));
}
export function applyRating(delta) {
  G.rating = Math.max(RATING_FLOOR, G.rating + delta);
  G.bestRating = Math.max(G.bestRating, G.rating);
}

// ---------- rewards ----------
function today() { return new Date().toISOString().slice(0, 10); }

export function battleRewards(mode, outcome /*'win'|'loss'|'draw'*/, hpFrac = 0) {
  const base = { duel: [40, 12, 20], sumo: [45, 12, 22], team: [60, 18, 30] }[mode] || [40, 12, 20];
  let dna = outcome === 'win' ? base[0] : outcome === 'loss' ? base[1] : base[2];
  const rows = [{ label: outcome === 'win' ? 'Victory' : outcome === 'loss' ? 'Consolation' : 'Draw', dna }];
  if (outcome === 'win' && hpFrac > 0.6) {
    const bonus = Math.round(15 * hpFrac);
    dna += bonus;
    rows.push({ label: 'Dominant win', dna: bonus });
  }
  if (outcome === 'win' && G.lastWinDay !== today()) {
    G.lastWinDay = today();
    dna += 50;
    rows.push({ label: 'First win of the day', dna: 50 });
  }
  const xp = outcome === 'win' ? 26 : outcome === 'loss' ? 12 : 18;
  return { dna, xp, rows };
}

export function raceRewards(place, entrants) {
  const table = [55, 32, 20, 12, 10, 8];
  const dna = table[Math.min(place - 1, table.length - 1)];
  const rows = [{ label: `Finished ${ordinal(place)} of ${entrants}`, dna }];
  let total = dna;
  if (place === 1 && G.lastWinDay !== today()) {
    G.lastWinDay = today();
    total += 50;
    rows.push({ label: 'First win of the day', dna: 50 });
  }
  const xp = Math.max(8, 26 - (place - 1) * 5);
  return { dna: total, xp, rows };
}

// Gauntlet: push-your-luck ladder. Win stage n → bank grows.
// Lose → run over, keep HALF the bank. Cash out anytime → keep all.
export function gauntletStageReward(stage) { return 20 + stage * 10; }

// Boneyard League: permadeath duels. Triple rewards, streak bonuses —
// but a loss means your critter is gone forever.
export const BONEYARD_WIN_DNA = 120;
export const BONEYARD_STREAK_BONUS = { 3: 150, 5: 300, 7: 500, 10: 1000 };

const EPITAPHS = [
  'Fought bravely. Bounced softly.', 'Gone, but the goo remains.', 'It never skipped leg day. Until now.',
  'Beloved. Bitey. Brave.', 'The arena remembers.', 'Went out mid-backflip. Probably.',
  'Too fierce for this world.', '10/10 would hatch again.', 'Left every fight a little messier.',
  'Its last words: "grrrbl".', 'Never knew when to quit. Literally.', 'A legend of the Boneyard.',
];
export function randomEpitaph() { return EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)]; }

export function buryCreature(cre, streak) {
  G.graveyard.unshift({
    name: cre.name, level: cre.level, wins: cre.wins, losses: cre.losses,
    traits: [...cre.traits], planet: cre.design.planet || 'meridian',
    epitaph: randomEpitaph(), diedAt: Date.now(), streak,
  });
  if (G.graveyard.length > 60) G.graveyard.pop();
  G.creatures = G.creatures.filter(c => c.id !== cre.id);
  if (G.activeId === cre.id) G.activeId = G.creatures[0] ? G.creatures[0].id : null;
}

export function grantDna(amount) {
  G.dna += amount;
  G.stats.dnaEarned += Math.max(0, amount);
}

export function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }

// opponent rating for matchmaking: near player, slight upward pull at low ratings
export function opponentRating(r) {
  return clamp(Math.round(r + (Math.random() - 0.48) * 130), 780, 2200);
}

// ---------- milestones (maps 1:1 to Steam achievements later) ----------
export const MILESTONES = [
  { id: 'hatchling',  icon: '🐣', name: 'Hatchling',          desc: 'Create your first critter',            dna: 30,  check: (g) => g.creatures.length >= 1 || g.stats.battles > 0 },
  { id: 'firstwin',   icon: '🏆', name: 'First Goo Drawn',    desc: 'Win your first battle',                dna: 40,  check: (g) => g.stats.wins >= 1 },
  { id: 'veteran',    icon: '⚔️', name: 'Arena Veteran',      desc: 'Win 25 battles',                       dna: 150, check: (g) => g.stats.wins >= 25 },
  { id: 'podium',     icon: '🏁', name: 'Photo Finish',       desc: 'Win a Grand Prix race',                dna: 60,  check: (g) => g.stats.raceWins >= 1 },
  { id: 'speeddemon', icon: '💨', name: 'Speed Demon',        desc: 'Win 5 races',                          dna: 150, check: (g) => g.stats.raceWins >= 5 },
  { id: 'silver',     icon: '🥈', name: 'Silver Standard',    desc: 'Reach Silver League (1100)',           dna: 80,  check: (g) => g.bestRating >= 1100 },
  { id: 'gold',       icon: '🥇', name: 'Gold Rush',          desc: 'Reach Gold League (1250)',             dna: 120, check: (g) => g.bestRating >= 1250 },
  { id: 'diamond',    icon: '💎', name: 'Unbreakable',        desc: 'Reach Diamond League (1550)',          dna: 250, check: (g) => g.bestRating >= 1550 },
  { id: 'legend',     icon: '👑', name: 'Living Legend',      desc: 'Reach Legend League (1700)',           dna: 500, check: (g) => g.bestRating >= 1700 },
  { id: 'gauntlet10', icon: '🔥', name: 'Gauntlet Champion',  desc: 'Clear all 10 Gauntlet stages',         dna: 300, check: (g) => g.stats.gauntletBest >= 10 },
  { id: 'boneyard3',  icon: '💀', name: 'Boneyard Survivor',  desc: 'Reach a 3-win Boneyard streak',        dna: 200, check: (g) => g.boneyard.best >= 3 },
  { id: 'mourner',    icon: '🪦', name: 'Pour One Out',       desc: 'Lose a critter in the Boneyard',       dna: 60,  check: (g) => g.graveyard.length >= 1 },
  { id: 'bettor',     icon: '💰', name: 'Sharp Bettor',       desc: 'Win 5 Circuit bets',                   dna: 100, check: (g) => g.stats.betsWon >= 5 },
  { id: 'social',     icon: '🌐', name: 'Friendly Rivalry',   desc: 'Beat a friend online',                 dna: 80,  check: (g) => g.stats.friendWins >= 1 },
  { id: 'maxlevel',   icon: '✨', name: 'Final Form',         desc: 'Raise a critter to level 10',          dna: 200, check: (g) => g.creatures.some(c => c.level >= 10) },
  { id: 'collector',  icon: '🧩', name: 'Gene Collector',     desc: 'Unlock every part in the Gene Shop',   dna: 400, check: (g) => g.unlocked.length >= TOTAL_PARTS },
  { id: 'kingmaker',  icon: '🎪', name: 'Kingmaker',          desc: 'Win an outright tournament bet',       dna: 150, check: (g) => (g.stats.tourneyBetsWon || 0) >= 1 },
];

// returns newly-completed milestones (and grants their DNA)
export function checkMilestones() {
  const fresh = [];
  for (const m of MILESTONES) {
    if (G.milestones.includes(m.id)) continue;
    let done = false;
    try { done = m.check(G); } catch (e) {}
    if (done) {
      G.milestones.push(m.id);
      grantDna(m.dna);
      fresh.push(m);
    }
  }
  if (fresh.length) save();
  return fresh;
}
