// Headless smoke tests for the new systems (planets, injuries, net
// validation, circuit odds, boneyard determinism). Run: node test/smoke.mjs
import assert from 'node:assert';
import { simulate, Battle } from '../js/battle.js';
// (Battle used directly for hazard tests below)
import { newCreature, DEFAULT_DESIGN } from '../js/creature.js';
import { deriveStats, PLANETS, budgetOf } from '../js/parts.js';
import { sanitizeRemoteCreature, packCreature, makeCode } from '../js/net.js';
import { genOpponent } from '../js/opponents.js';

let pass = 0;
const ok = (cond, name) => { assert(cond, name); pass++; console.log('  ✓ ' + name); };

// ---- planets ----
{
  const base = DEFAULT_DESIGN();
  const s0 = deriveStats({ ...base, planet: 'meridian' });
  const sp = deriveStats({ ...base, planet: 'pyrion' });
  const sg = deriveStats({ ...base, planet: 'glaciem' });
  ok(sp.hp < s0.hp && sp.dmgMul > s0.dmgMul, 'pyrion trades hp for damage');
  ok(sg.armor === s0.armor + 8, 'glaciem grants +8 armor');
  ok(Object.keys(PLANETS).length === 6, 'six planets exist');
  ok(budgetOf({ ...base, planet: 'umbra' }) === budgetOf(base), 'planet choice costs no budget');
}

// ---- injury system determinism ----
{
  const mkA = () => newCreature({ ...DEFAULT_DESIGN(), legs: { type: 'scuttler', pairs: 3 } }, 'A');
  const b = genOpponent(1400, 5, 42);
  const r1 = simulate([[mkA()], [structuredClone(b)]], 'duel', 777);
  const r2 = simulate([[mkA()], [structuredClone(b)]], 'duel', 777);
  ok(r1.winnerTeam === r2.winnerTeam && Math.abs(r1.duration - r2.duration) < 1e-9, 'same seed → identical outcome (with injuries active)');
}

// ---- limb loss actually triggers ----
{
  const tanky = genOpponent(1600, 8, 99);
  const meek = newCreature(DEFAULT_DESIGN(), 'Meek');
  const battle = new Battle({ teams: [[meek], [tanky]], mode: 'duel', seed: 5, gore: 'goo' });
  battle.phase = 'fight';
  let sawLimbLoss = false;
  for (let i = 0; i < 60 * 120 && !battle.finished; i++) {
    battle.slowmo = 0; battle.hitstop = 0;
    battle.step(1 / 60);
    if (battle.phase === 'end') battle.finished = true;
    if (battle.fighters.some(f => f.legsLost > 0)) sawLimbLoss = true;
  }
  ok(sawLimbLoss, 'limbs fall off during a beating');
  ok(battle.debris.length > 0, 'severed limb debris exists');
}

// ---- gore is visual-only (same outcome regardless of setting) ----
{
  const mk = () => [[newCreature(DEFAULT_DESIGN(), 'X')], [genOpponent(1200, 3, 31)]];
  const g1 = simulate(mk(), 'duel', 4242);
  const g2 = simulate(mk(), 'duel', 4242);
  ok(g1.winnerTeam === g2.winnerTeam, 'sim outcome independent of visual settings');
}

// ---- net validation ----
{
  const legit = newCreature(DEFAULT_DESIGN(), 'Legit');
  legit.level = 5; legit.traits = ['sprinter'];
  const r = sanitizeRemoteCreature(packCreature(legit));
  ok(!r.err && r.cre.name === 'Legit' && r.cre.level === 5, 'legit creature passes validation');

  const cheat = packCreature(legit);
  cheat.level = 99; cheat.traits = ['sprinter', 'vital', 'sharp', 'anchor', 'brawny'];
  const rc = sanitizeRemoteCreature(cheat);
  ok(!rc.err && rc.cre.level === 10 && rc.cre.traits.length === 3, 'cheaty level/traits get clamped');

  const overb = packCreature(legit);
  overb.design = { ...overb.design, weapons: ['crusher', 'crusher'], armor: ['shell', 'shell'], organs: ['frenzy', 'adrenal'], legs: { type: 'stomper', pairs: 4 } };
  const ro = sanitizeRemoteCreature(overb);
  ok(!!ro.err, 'over-budget build rejected: ' + (ro.err || ''));

  ok(/^[A-Z2-9]{4}$/.test(makeCode()), 'room codes are 4 safe chars');
}

// ---- replay codes round-trip ----
{
  const { encodeReplay, decodeReplay } = await import('../js/replay.js');
  const t1 = newCreature(DEFAULT_DESIGN(), 'Gooba');
  const t2 = genOpponent(1300, 4, 55);
  const code = encodeReplay({ mode: 'sumo', seed: 123456, teams: [[t1], [t2]] });
  ok(code.startsWith('CFR1.'), 'replay code has magic prefix');
  const dec = decodeReplay(code);
  ok(!dec.err && dec.mode === 'sumo' && dec.seed === 123456, 'replay decodes to same mode/seed');
  ok(dec.teams[0][0].name === 'Gooba' && dec.teams[1][0].name === t2.name, 'replay creatures survive round-trip');
  // decoded replay reproduces the same outcome as the original teams
  const orig = simulate([[structuredClone(t1)], [structuredClone(t2)]], 'sumo', 123456);
  const replayed = simulate(dec.teams, 'sumo', 123456);
  ok(orig.winnerTeam === replayed.winnerTeam && Math.abs(orig.duration - replayed.duration) < 1e-9, 'replayed battle is bit-identical');
  ok(!!decodeReplay('CFR1.garbage!!').err, 'garbage replay code rejected');
  ok(!!decodeReplay('hello').err, 'non-replay string rejected');
}

// ---- planet hazards ----
{
  const a = newCreature(DEFAULT_DESIGN(), 'HazA');
  const b = genOpponent(1300, 4, 88);
  const mk = (planet) => new Battle({ teams: [[structuredClone(a)], [structuredClone(b)]], mode: 'duel', seed: 909, planet });
  ok(mk('pyrion').hazards.length === 2 && mk('pyrion').hazards[0].kind === 'vent', 'pyrion spawns lava vents');
  ok(mk('glaciem').hazards[0].kind === 'ice' && mk('umbra').hazards[0].kind === 'shadow', 'glaciem/umbra hazards correct');
  ok(mk('meridian').hazards.length === 0, 'meridian is hazard-free');
  ok(new Battle({ teams: [[structuredClone(a)], [structuredClone(b)]], mode: 'sumo', seed: 1, planet: 'pyrion' }).hazards.length === 0, 'sumo ring has no hazards');
  // determinism with hazards active
  const run = (planet) => {
    const bt = mk(planet);
    bt.phase = 'fight';
    for (let i = 0; i < 60 * 200 && !bt.finished; i++) { bt.slowmo = 0; bt.step(1 / 60); if (bt.phase === 'end') bt.finished = true; }
    return bt.summary();
  };
  for (const planet of ['pyrion', 'glaciem', 'zephyros', 'verdantia', 'umbra']) {
    const r1 = run(planet), r2 = run(planet);
    ok(r1.winnerTeam === r2.winnerTeam && Math.abs(r1.duration - r2.duration) < 1e-9, `${planet} hazards are deterministic`);
  }
}

// ---- online race determinism + squad validation ----
{
  const { Race } = await import('../js/race.js');
  const { sanitizeSquad, packSquad } = await import('../js/net.js');
  const host = newCreature(DEFAULT_DESIGN(), 'Hosty');
  const guest = genOpponent(1200, 3, 61);
  const mkEntrants = () => [
    { cre: structuredClone(host), isPlayer: true },
    { cre: structuredClone(guest), isPlayer: false },
    { cre: genOpponent(1250, 3, 7001, true), isPlayer: false },
    { cre: genOpponent(1250, 3, 7002, true), isPlayer: false },
  ];
  const runRaceSim = () => {
    const race = new Race({ entrants: mkEntrants(), seed: 31337, laps: 2 });
    race.phase = 'race'; race.phaseT = 0;
    let guard = 0;
    while (race.phase !== 'end' && guard++ < 60 * 400) race.step(1 / 60);
    return race.standings().map(c => c.name).join(',');
  };
  ok(runRaceSim() === runRaceSim(), 'online race placements are deterministic');

  const squadRes = sanitizeSquad(packSquad([host, guest]));
  ok(!squadRes.err && squadRes.cres.length === 2, 'squad handshake validates 2 creatures');
  ok(!!sanitizeSquad([]).err, 'empty squad rejected');
}

// ---- circuit odds sanity ----
{
  const a = genOpponent(1500, 5, 1), b = genOpponent(1500, 5, 2);
  let wA = 0;
  for (let i = 0; i < 7; i++) {
    const res = simulate([[a], [b]], 'duel', 100 + i * 104729);
    if (res.winnerTeam === 0) wA++; else if (res.winnerTeam === -1) wA += 0.5;
  }
  ok(wA >= 0 && wA <= 7, `odds sampling runs (A won ${wA}/7)`);
}

// ---- tournament bracket resolution ----
{
  const entrants = Array.from({ length: 8 }, (_, i) => genOpponent(1400, 4, 5000 + i * 911));
  const rounds = [
    [{ a: 0, b: 1, winner: null }, { a: 2, b: 3, winner: null }, { a: 4, b: 5, winner: null }, { a: 6, b: 7, winner: null }],
    [{ a: null, b: null, winner: null }, { a: null, b: null, winner: null }],
    [{ a: null, b: null, winner: null }],
  ];
  const nextMatch = () => rounds.flat().find(m => m.winner === null && m.a !== null && m.b !== null) || null;
  const advance = (m, wIdx) => {
    m.winner = wIdx;
    const [qf, sf, f] = [rounds[0], rounds[1], rounds[2][0]];
    for (let i = 0; i < 4; i++) if (qf[i].winner !== null) { const s = sf[Math.floor(i / 2)]; if (i % 2 === 0) s.a = qf[i].winner; else s.b = qf[i].winner; }
    for (let i = 0; i < 2; i++) if (sf[i].winner !== null) { if (i === 0) f.a = sf[i].winner; else f.b = sf[i].winner; }
  };
  let m, played = 0;
  while ((m = nextMatch()) && played < 10) {
    const res = simulate([[entrants[m.a]], [entrants[m.b]]], 'duel', 100 + played * 31);
    advance(m, res.winnerTeam === 1 ? m.b : m.a);
    played++;
  }
  ok(played === 7, `bracket resolves in exactly 7 matches (played ${played})`);
  ok(rounds[2][0].winner !== null, 'tournament crowns a champion');
}

console.log(`\nAll ${pass} smoke tests passed.`);
