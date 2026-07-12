// Headless balance harness: pits the opponent-generator archetypes against
// each other and prints a win-rate matrix. Run: node test/balance.mjs [runs]
import { simulate } from '../js/battle.js';
import { newCreature } from '../js/creature.js';
import { budgetOf, validateDesign } from '../js/parts.js';

const RUNS = parseInt(process.argv[2] || '40', 10);

// mirror of opponents.js archetypes at full quality
const BUILDS = {
  scorpion: { body: 'pod', legs: { type: 'stomper', pairs: 2 }, weapons: ['stinger', 'pincer'], armor: ['spikes', 'shell'], organs: ['eyes', 'heart'], size: 1.15 },
  juggernaut: { body: 'tank', legs: { type: 'stomper', pairs: 3 }, weapons: ['crusher'], armor: ['shell'], organs: ['heart'], size: 1.2 },
  lancer: { body: 'pod', legs: { type: 'strider', pairs: 3 }, weapons: ['horn', 'crusher'], armor: ['spikes', 'chitin'], organs: ['heart', 'lungs'], size: 1.2 },
  artillery: { body: 'longback', legs: { type: 'springer', pairs: 1 }, weapons: ['spitter', 'spitter', 'crusher'], armor: ['shell'], organs: ['fat'], size: 1.25 },
  phantom: { body: 'wisp', legs: { type: 'strider', pairs: 1 }, weapons: ['crusher'], armor: ['spikes'], organs: ['frenzy', 'gyro'], size: 1.25 },
  slasher: { body: 'longback', legs: { type: 'scuttler', pairs: 3 }, weapons: ['jaw', 'jaw', 'crusher'], armor: ['spikes'], organs: ['frenzy'], size: 1.05 },
  bulwark: { body: 'tank', legs: { type: 'scuttler', pairs: 2 }, weapons: ['horn', 'stinger'], armor: ['shell', 'spikes'], organs: [], size: 1.15 },
  brawler: { body: 'pod', legs: { type: 'scuttler', pairs: 2 }, weapons: ['jaw', 'jaw'], armor: ['chitin', 'chitin'], organs: ['fat', 'heart'], size: 1.1 },
};
for (const d of Object.values(BUILDS)) { d.colors = { a: '#888888', b: '#333333' }; d.pattern = 'none'; d.eyes = 'round'; }

const names = Object.keys(BUILDS);
console.log('Build validation + budgets:');
for (const n of names) {
  const errs = validateDesign(BUILDS[n]);
  console.log(`  ${n.padEnd(11)} budget ${String(budgetOf(BUILDS[n])).padStart(3)}/100 ${errs.length ? 'INVALID: ' + errs.join('; ') : 'ok'}`);
}

console.log(`\nDuel win-rate matrix (row vs col, ${RUNS} runs each):`);
const totals = Object.fromEntries(names.map(n => [n, 0]));
let judges = 0, totalDur = 0, fights = 0, draws = 0;

process.stdout.write(''.padEnd(12) + names.map(n => n.slice(0, 6).padStart(7)).join('') + '\n');
for (const a of names) {
  let row = a.padEnd(12);
  for (const b of names) {
    if (a === b) { row += '      —'; continue; }
    let wins = 0;
    for (let i = 0; i < RUNS; i++) {
      const ca = newCreature(structuredClone(BUILDS[a]), a);
      const cb = newCreature(structuredClone(BUILDS[b]), b);
      const res = simulate([[ca], [cb]], 'duel', 1000 + i * 7919);
      if (res.winnerTeam === 0) wins++;
      else if (res.winnerTeam === -1) { wins += 0.5; draws++; }
      if (res.kind === 'judge') judges++;
      totalDur += res.duration; fights++;
    }
    totals[a] += wins;
    row += String(Math.round(100 * wins / RUNS)).padStart(6) + '%';
  }
  console.log(row);
}

console.log('\nOverall win% (vs field):');
const field = names.map(n => [n, totals[n] / (RUNS * (names.length - 1)) * 100]).sort((x, y) => y[1] - x[1]);
for (const [n, p] of field) console.log(`  ${n.padEnd(11)} ${p.toFixed(1)}%`);
console.log(`\nAvg fight: ${(totalDur / fights).toFixed(1)}s · judge decisions: ${(100 * judges / fights).toFixed(1)}% · draws: ${(100 * draws / fights).toFixed(2)}%`);

// sumo + team sanity
let decisive = 0;
for (let i = 0; i < 20; i++) {
  const ca = newCreature(structuredClone(BUILDS.juggernaut), 'jug');
  const cb = newCreature(structuredClone(BUILDS.phantom), 'phantom');
  const res = simulate([[ca], [cb]], 'sumo', 555 + i * 31);
  if (res.winnerTeam !== -1) decisive++;
}
console.log(`Sumo decisive endings: ${decisive}/20`);
const t1 = [newCreature(structuredClone(BUILDS.slasher), 's1'), newCreature(structuredClone(BUILDS.scorpion), 's2')];
const t2 = [newCreature(structuredClone(BUILDS.brawler), 'b1'), newCreature(structuredClone(BUILDS.lancer), 'b2')];
const tr = simulate([t1, t2], 'team', 99);
console.log(`Team 2v2 sample: winner=${tr.winnerTeam} kind=${tr.kind} dur=${tr.duration.toFixed(1)}s`);
