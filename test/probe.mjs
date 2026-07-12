// Blow-by-blow probe of a single duel for debugging balance.
import { Battle } from '../js/battle.js';
import { newCreature, statsOf } from '../js/creature.js';

const BUILDS = {
  juggernaut: { body: 'tank', legs: { type: 'stomper', pairs: 3 }, weapons: ['crusher'], armor: ['shell'], organs: ['heart'], size: 1.2, colors: { a: '#f87171', b: '#7f1d1d' }, pattern: 'none', eyes: 'angry' },
  brawler: { body: 'pod', legs: { type: 'scuttler', pairs: 2 }, weapons: ['jaw', 'jaw'], armor: ['chitin', 'chitin'], organs: ['fat', 'heart'], size: 1.1, colors: { a: '#facc15', b: '#713f12' }, pattern: 'belly', eyes: 'angry' },
  slasher: { body: 'pod', legs: { type: 'scuttler', pairs: 3 }, weapons: ['jaw', 'tailwhip'], armor: ['chitin', 'spikes'], organs: ['heart', 'frenzy'], size: 1.0, colors: { a: '#4ade80', b: '#14532d' }, pattern: 'spots', eyes: 'round' },
  bulwark: { body: 'tank', legs: { type: 'stomper', pairs: 2 }, weapons: ['pincer', 'tailwhip'], armor: ['shell'], organs: ['heart', 'fat'], size: 1.15, colors: { a: '#94a3b8', b: '#1e293b' }, pattern: 'none', eyes: 'round' },
  dancer: { body: 'pod', legs: { type: 'scuttler', pairs: 4 }, weapons: ['jaw', 'pincer'], armor: ['chitin', 'spikes'], organs: ['gyro', 'frenzy'], size: 0.9, colors: { a: '#22d3ee', b: '#164e63' }, pattern: 'none', eyes: 'big' },
  sniper: { body: 'longback', legs: { type: 'strider', pairs: 2 }, weapons: ['spitter', 'tailwhip', 'stinger'], armor: ['chitin'], organs: ['lungs'], size: 0.95, colors: { a: '#a78bfa', b: '#4c1d95' }, pattern: 'belly', eyes: 'big' },
};

const [aName, bName] = [process.argv[2] || 'slasher', process.argv[3] || 'bulwark'];
const ca = newCreature(structuredClone(BUILDS[aName]), aName);
const cb = newCreature(structuredClone(BUILDS[bName]), bName);
for (const c of [ca, cb]) {
  const s = statsOf(c);
  console.log(`${c.name}: hp=${s.hp} armor=${s.armor} speed=${Math.round(s.speed)} turn=${s.turn.toFixed(1)} dodge=${(s.dodge*100)|0}% stamMax=${Math.round(s.stamMax)} regen=${s.regen} R=${s.R.toFixed(0)}`);
  for (const a of s.attacks) console.log(`   ${a.id}: dmg=${a.dmg.toFixed(1)} cd=${a.cd.toFixed(2)} range=${a.range.toFixed(0)} stam=${a.stam}`);
}

const b = new Battle({ teams: [[ca], [cb]], mode: 'duel', seed: 42 });
b.phase = 'fight'; b.phaseT = 0;

// wrap damage application for logging
const origApply = b.applyHit.bind(b);
let hits = { [aName]: 0, [bName]: 0 }, dmgTot = { [aName]: 0, [bName]: 0 };
b.applyHit = (src, e, atk, dmg, angle) => {
  const hpBefore = e.hp;
  origApply(src, e, atk, dmg, angle);
  const dealt = hpBefore - e.hp;
  if (dealt > 0) { hits[src.name]++; dmgTot[src.name] += dealt; }
};

const origStart = b.startAttack.bind(b);
let atkLog = [];
b.startAttack = (f, atk) => {
  const T = f.target;
  const d = T ? Math.hypot(f.x - T.x, f.y - T.y) | 0 : -1;
  atkLog.push(`${b.t.toFixed(1)}s ${f.name} ${atk.id}@${d}`);
  origStart(f, atk);
};

const dt = 1 / 60;
let t = 0, nextLog = 0;
while (!b.finished && t < 200) {
  b.slowmo = 0;
  b.step(dt);
  if (b.phase === 'end') b.finished = true;
  t += dt;
  if (t >= nextLog) {
    nextLog += 5;
    const [f1, f2] = b.fighters;
    const d = Math.hypot(f1.x - f2.x, f1.y - f2.y) | 0;
    console.log(`t=${t.toFixed(0).padStart(3)}s  ${f1.name} hp=${f1.hp.toFixed(0).padStart(3)} st=${f1.stam.toFixed(0).padStart(3)} | ${f2.name} hp=${f2.hp.toFixed(0).padStart(3)} st=${f2.stam.toFixed(0).padStart(3)} | dist=${d} | hits ${hits[aName]}/${hits[bName]} dmg ${dmgTot[aName].toFixed(0)}/${dmgTot[bName].toFixed(0)}`);
  }
}
console.log('\nAttack log:', atkLog.slice(0, 60).join(' | '));
console.log(`\nWinner: team ${b.winnerTeam} (${b.winnerTeam === 0 ? aName : b.winnerTeam === 1 ? bName : 'draw'}) via ${b.koKind} at ${b.t.toFixed(1)}s`);
console.log(`hits: ${aName}=${hits[aName]} (${dmgTot[aName].toFixed(0)} dmg), ${bName}=${hits[bName]} (${dmgTot[bName].toFixed(0)} dmg)`);
