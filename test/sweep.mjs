// Meta explorer: generate many random valid builds, fight them against the
// archetype field, rank them. Reveals dominant strategies and dead parts.
// Run: node test/sweep.mjs [nBuilds] [runsPerPair]
import { simulate } from '../js/battle.js';
import { newCreature } from '../js/creature.js';
import { BODIES, LEGS, WEAPONS, ARMOR, ORGANS, budgetOf, validateDesign, deriveStats } from '../js/parts.js';
import { rng } from '../js/util.js';

const N = parseInt(process.argv[2] || '120', 10);
const RUNS = parseInt(process.argv[3] || '3', 10);

const FIELD = {
  juggernaut: { body: 'tank', legs: { type: 'stomper', pairs: 3 }, weapons: ['crusher'], armor: ['shell'], organs: ['heart'], size: 1.2 },
  slasher: { body: 'pod', legs: { type: 'scuttler', pairs: 3 }, weapons: ['jaw', 'tailwhip'], armor: ['chitin', 'spikes'], organs: ['heart', 'frenzy'], size: 1.0 },
  rammer: { body: 'pod', legs: { type: 'springer', pairs: 3 }, weapons: ['horn', 'jaw'], armor: ['chitin'], organs: ['adrenal', 'heart'], size: 1.05 },
  sniper: { body: 'longback', legs: { type: 'strider', pairs: 2 }, weapons: ['spitter', 'tailwhip', 'stinger'], armor: ['chitin'], organs: ['lungs'], size: 0.95 },
  venomist: { body: 'pod', legs: { type: 'springer', pairs: 2 }, weapons: ['stinger', 'pincer'], armor: ['chitin', 'spikes'], organs: ['heart', 'gyro'], size: 0.95 },
  bulwark: { body: 'tank', legs: { type: 'stomper', pairs: 2 }, weapons: ['pincer', 'tailwhip'], armor: ['shell'], organs: ['heart', 'fat'], size: 1.15 },
  brawler: { body: 'pod', legs: { type: 'scuttler', pairs: 2 }, weapons: ['jaw', 'jaw'], armor: ['chitin', 'chitin'], organs: ['fat', 'heart'], size: 1.1 },
};
for (const d of Object.values(FIELD)) { d.colors = { a: '#888888', b: '#333333' }; d.pattern = 'none'; d.eyes = 'round'; }

const r = rng(20260711);
function randBuild() {
  const bodies = Object.keys(BODIES), legs = Object.keys(LEGS);
  const ws = Object.keys(WEAPONS), as = Object.keys(ARMOR), os = Object.keys(ORGANS);
  const d = {
    body: bodies[(r() * bodies.length) | 0],
    legs: { type: legs[(r() * legs.length) | 0], pairs: 1 + ((r() * 4) | 0) },
    weapons: [], armor: [], organs: [],
    size: 0.85 + ((r() * 9) | 0) * 0.05,
    colors: { a: '#5eead4', b: '#0f766e' }, pattern: 'none', eyes: 'round',
  };
  const b = BODIES[d.body];
  d.weapons.push(ws[(r() * ws.length) | 0]);
  for (let i = 0; i < 10; i++) {
    const roll = r();
    const tryAdd = (arr, pool, max) => {
      const c = pool[(r() * pool.length) | 0];
      if (arr.length < max && (arr === d.weapons || !arr.includes(c))) {
        arr.push(c);
        if (budgetOf(d) > 100) arr.pop();
      }
    };
    if (roll < 0.35) tryAdd(d.weapons, ws, b.weaponSlots);
    else if (roll < 0.6) tryAdd(d.armor, as, b.armorSlots);
    else tryAdd(d.organs, os, b.organSlots);
  }
  while (budgetOf(d) > 100 && d.legs.pairs > 1) d.legs.pairs--;
  if (validateDesign(d).length) return null;
  return d;
}

const fieldNames = Object.keys(FIELD);
const results = [];
for (let i = 0; i < N; i++) {
  const d = randBuild();
  if (!d) continue;
  let wins = 0, total = 0;
  for (const fn of fieldNames) {
    for (let k = 0; k < RUNS; k++) {
      const me = newCreature(structuredClone(d), 'me');
      const foe = newCreature(structuredClone(FIELD[fn]), fn);
      const res = simulate([[me], [foe]], 'duel', 9000 + i * 131 + k * 7);
      if (res.winnerTeam === 0) wins++;
      else if (res.winnerTeam === -1) wins += 0.5;
      total++;
    }
  }
  results.push({ d, winRate: wins / total });
}

results.sort((a, b) => b.winRate - a.winRate);
const show = (x) => {
  const d = x.d;
  const s = deriveStats(d);
  return `${(x.winRate * 100).toFixed(0).padStart(3)}%  ${d.body}/${d.legs.type}x${d.legs.pairs} [${d.weapons.join('+')}] {${d.armor.join('+') || '-'}} (${d.organs.join('+') || '-'}) sz${d.size.toFixed(2)} bud${budgetOf(d)} spd${Math.round(s.speed)} hp${s.hp}`;
};
console.log(`TOP 12 of ${results.length} random builds (vs field of ${fieldNames.length}):`);
for (const x of results.slice(0, 12)) console.log('  ' + show(x));
console.log('BOTTOM 6:');
for (const x of results.slice(-6)) console.log('  ' + show(x));

// aggregate: win-rate by part usage
const partScore = {};
for (const x of results) {
  const tag = (k) => { partScore[k] = partScore[k] || [0, 0]; partScore[k][0] += x.winRate; partScore[k][1]++; };
  tag('body:' + x.d.body); tag('legs:' + x.d.legs.type);
  for (const w of new Set(x.d.weapons)) tag('w:' + w);
  for (const a of x.d.armor) tag('a:' + a);
  for (const o of x.d.organs) tag('o:' + o);
}
console.log('\nAvg win% when part present:');
const rows = Object.entries(partScore).map(([k, [s, n]]) => [k, s / n * 100, n]).sort((a, b) => b[1] - a[1]);
for (const [k, p, n] of rows) console.log(`  ${k.padEnd(14)} ${p.toFixed(0).padStart(3)}% (n=${n})`);
