// ---------- creature model: identity, xp, levels, traits ----------
import { uid } from './util.js';
import { deriveStats, budgetOf } from './parts.js';

export const MAX_LEVEL = 10;
export const TRAIT_LEVELS = [3, 6, 9]; // levels that grant a trait pick

export const TRAITS = {
  vital:      { name: 'Vital',        desc: '+10% max health.' },
  thickhide:  { name: 'Thick Hide',   desc: '+10 armor.' },
  sprinter:   { name: 'Sprinter',     desc: '+8% move speed.' },
  berserker:  { name: 'Berserker',    desc: '+12% damage while below half health.' },
  secondwind: { name: 'Second Wind',  desc: 'Once per match, heal 18% when dropping under 25% health.' },
  slippery:   { name: 'Slippery',     desc: '+8% chance to dodge attacks.' },
  anchor:     { name: 'Anchor',       desc: 'Greatly resists knockback.' },
  sharp:      { name: 'Sharp',        desc: '+6% critical hit chance.' },
  marathon:   { name: 'Marathon',     desc: '+30% stamina, faster recovery.' },
  brawny:     { name: 'Brawny',       desc: '+8% damage.' },
  regrow:     { name: 'Regrow',       desc: 'Regenerate 1.5 health per second.' },
};

export const DEFAULT_DESIGN = () => ({
  body: 'pod',
  legs: { type: 'scuttler', pairs: 2 },
  weapons: ['jaw'],
  armor: ['chitin'],
  organs: ['heart'],
  size: 1.0,
  colors: { a: '#4ade80', b: '#166534' },
  pattern: 'spots',
  eyes: 'round',
  planet: 'meridian',
});

export function newCreature(design, name = 'Critter') {
  return {
    id: uid(), name, design,
    level: 1, xp: 0, traits: [],
    wins: 0, losses: 0, raceWins: 0,
    pendingTraitPicks: 0,
    createdAt: Date.now(),
  };
}

export const xpForLevel = (lv) => Math.round(40 * Math.pow(lv, 1.35));

// returns {levelsGained, traitPicksGained}
export function addXp(cre, amount) {
  let levels = 0, picks = 0;
  if (cre.level >= MAX_LEVEL) return { levels, picks };
  cre.xp += amount;
  while (cre.level < MAX_LEVEL && cre.xp >= xpForLevel(cre.level)) {
    cre.xp -= xpForLevel(cre.level);
    cre.level++;
    levels++;
    if (TRAIT_LEVELS.includes(cre.level)) { cre.pendingTraitPicks++; picks++; }
  }
  if (cre.level >= MAX_LEVEL) cre.xp = 0;
  return { levels, picks };
}

export const statsOf = (cre) => deriveStats(cre.design, cre.level, cre.traits);
export const budgetOfCre = (cre) => budgetOf(cre.design);
