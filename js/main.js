// ============================================================
// Critterforge — boot, router, sim overlay, match orchestration.
// ============================================================
import { el, esc, fmt, startLoop } from './util.js';
import { SFX, setVolumes, startMusic, unlockAudio } from './audio.js';
import { load, save, G, leagueOf, eloDelta, applyRating, opponentRating, battleRewards, raceRewards, gauntletStageReward, grantDna, ordinal, buryCreature, BONEYARD_WIN_DNA, BONEYARD_STREAK_BONUS, checkMilestones } from './league.js';
import { statsOf, addXp, TRAITS, xpForLevel } from './creature.js';
import { CATALOG } from './parts.js';
import { renderCreatureCard } from './drawing.js';
import { Battle, simulate } from './battle.js';
import { Race } from './race.js';
import { genOpponent, genTeam, genName } from './opponents.js';
import { renderEditor, stopEditorLoop } from './editor.js';
import { showMenu, showStable, showModes, showShop, showGauntlet, showHowto, showSettings, stopMenuLoop } from './screens.js';
import { showBoneyard, showCircuit, showLink, showTournament } from './screens2.js';
import * as net from './net.js';
import { encodeReplay, decodeReplay } from './replay.js';
import { toast, showModal, closeModal, confirmModal } from './ui-bits.js';
import { rng, clamp } from './util.js';

const gore = () => G.settings.gore || 'goo';

// last battle, capturable as a replay code
let lastReplay = null;
function copyText(t) {
  try { navigator.clipboard.writeText(t).then(() => toast('Replay code copied! 📼')); }
  catch (e) { window.prompt('Copy this replay code:', t); }
}
function wireReplayCopy(box) {
  const b = box.querySelector('[data-replay-copy]');
  if (b) b.onclick = () => { SFX.click(); if (lastReplay) copyText(encodeReplay(lastReplay)); };
}
const replayBtnHtml = () => lastReplay ? '<button class="btn small" data-replay-copy>📼 Copy replay</button>' : '';

const screenEl = document.getElementById('screen');
const topbar = document.getElementById('topbar');
const simwrap = document.getElementById('simwrap');
const simcanvas = document.getElementById('simcanvas');

// ---------------- topbar ----------------
function refreshTopbar() {
  // milestone sweep: any newly-earned milestone pays out with a toast
  for (const m of checkMilestones()) {
    toast(`${m.icon} Milestone: ${m.name} — +${m.dna} 🧪`);
    SFX.levelup();
  }
  document.getElementById('tb-dna').textContent = fmt(G.dna);
  const lg = leagueOf(G.rating);
  document.getElementById('tb-league').innerHTML = `${lg.icon} ${lg.name} · <b>${G.rating}</b>`;
}
window.addEventListener('dna-changed', refreshTopbar);

// ---------------- router ----------------
function leaveScreens() {
  stopEditorLoop();
  stopMenuLoop();
  closeModal();
}
const nav = {
  back: null,
  boot() { nav.menu(); },
  menu() { leaveScreens(); nav.back = null; refreshTopbar(); showMenu(screenEl, nav); },
  stable(opts) { leaveScreens(); refreshTopbar(); showStable(screenEl, nav, opts); },
  modes() { leaveScreens(); nav.back = null; showModes(screenEl, nav); },
  shop() { leaveScreens(); refreshTopbar(); showShop(screenEl, nav); },
  howto() { leaveScreens(); showHowto(screenEl, nav); },
  settings() { leaveScreens(); showSettings(screenEl, nav); },
  gauntlet() { leaveScreens(); showGauntlet(screenEl, nav); },
  editor(creId) {
    leaveScreens();
    renderEditor(screenEl, {
      creatureId: creId,
      onBack: () => nav.stable(),
      onSaved: () => {
        refreshTopbar();
        // first-creature onboarding: offer the first duel
        if (G.creatures.length === 1 && G.stats.battles === 0) {
          const box = showModal(`
            <h2>Your first critter! 🎉</h2>
            <p class="dim" style="margin-top:8px">Time to see what it's made of. Ready for its debut ranked duel?</p>
            <div class="modal-btns">
              <button class="btn" id="ob-later">Later</button>
              <button class="btn primary" id="ob-fight">⚔️ FIGHT!</button>
            </div>`);
          box.querySelector('#ob-later').onclick = () => { SFX.click(); closeModal(); nav.stable(); };
          box.querySelector('#ob-fight').onclick = () => { SFX.click(); closeModal(); nav.quickDuel('duel'); };
        } else nav.stable();
      },
    });
  },

  // ---------- matches ----------
  quickDuel(mode /* 'duel' | 'sumo' */) {
    const cre = activeCreature();
    if (!cre) return noCreatureFlow();
    const oppR = opponentRating(G.rating);
    const opp = genOpponent(oppR, cre.level, Math.floor(Math.random() * 1e9));
    vsModal([cre], [opp], mode, () => {
      runBattle({ teams: [[cre], [opp]], mode, ranked: true, oppRating: oppR, labels: [cre.name, opp.name], returnTo: () => nav.menu() });
    });
  },

  teamSetup() {
    if (G.creatures.length < 2) {
      SFX.deny();
      toast('Team Rumble needs at least 2 critters in your stable!', true);
      return;
    }
    nav.back = () => nav.modes();
    nav.stable({
      pick: {
        min: 2, max: 3, title: 'Pick your squad',
        onPicked: (ids) => {
          const squad = ids.map(id => G.creatures.find(c => c.id === id));
          const oppR = opponentRating(G.rating);
          const foes = genTeam(oppR, squad.map(c => c.level), squad.length, Math.floor(Math.random() * 1e9));
          vsModal(squad, foes, 'team', () => {
            runBattle({ teams: [squad, foes], mode: 'team', ranked: true, oppRating: oppR, labels: ['Your Squad', 'Rivals'], returnTo: () => nav.modes() });
          });
        },
      },
    });
  },

  race() {
    const cre = activeCreature();
    if (!cre) return noCreatureFlow();
    const entrants = [{ cre, isPlayer: true }];
    for (let i = 0; i < 5; i++) {
      entrants.push({ cre: genOpponent(opponentRating(G.rating), cre.level, Math.floor(Math.random() * 1e9), true), isPlayer: false });
    }
    runRace(entrants);
  },

  gauntletStart() {
    const cre = activeCreature();
    if (!cre) return noCreatureFlow();
    G.gauntlet = { creId: cre.id, stage: 1, bank: 0 };
    save();
    nav.gauntlet();
  },
  gauntletFight() {
    const run = G.gauntlet;
    if (!run) return nav.gauntlet();
    const cre = G.creatures.find(c => c.id === run.creId) || activeCreature();
    if (!cre) { G.gauntlet = null; save(); return nav.gauntlet(); }
    const oppR = Math.max(880, G.rating - 120) + run.stage * 85;
    const opp = genOpponent(oppR, Math.min(10, cre.level + Math.floor(run.stage / 3)), Math.floor(Math.random() * 1e9));
    vsModal([cre], [opp], 'duel', () => {
      runBattle({ teams: [[cre], [opp]], mode: 'duel', ranked: false, gauntlet: true, labels: [cre.name, opp.name], returnTo: () => nav.gauntlet() });
    }, `GAUNTLET · STAGE ${run.stage}`);
  },
  gauntletCashout() {
    const run = G.gauntlet;
    if (!run) return;
    grantDna(run.bank);
    toast(`Cashed out ${fmt(run.bank)} 🧪 DNA! 💰`);
    SFX.coin();
    G.stats.gauntletBest = Math.max(G.stats.gauntletBest, run.stage - 1);
    G.gauntlet = null;
    save(); refreshTopbar();
    nav.gauntlet();
  },

  traitPick(cre) { traitPickModal(cre, () => nav.stable()); },

  // ---------- Boneyard (permadeath) ----------
  boneyard() { leaveScreens(); refreshTopbar(); showBoneyard(screenEl, nav); },
  boneyardFight() {
    const cre = activeCreature();
    if (!cre) return noCreatureFlow();
    const oppR = G.rating + 80 + Math.floor(Math.random() * 80);
    const opp = genOpponent(oppR, cre.level, Math.floor(Math.random() * 1e9));
    runBoneyardBattle(cre, opp);
  },

  // ---------- The Circuit (spectate + bet) ----------
  circuit() {
    leaveScreens(); refreshTopbar();
    const seedBase = Math.floor(Math.random() * 1e9);
    const lvl = 2 + Math.floor(Math.random() * 7);
    const a = genOpponent(opponentRating(G.rating + 100), lvl, seedBase);
    const b = genOpponent(opponentRating(G.rating + 100), lvl, seedBase + 7777);
    // odds from actual simulation sampling (7 quick headless fights)
    let wA = 0;
    for (let i = 0; i < 7; i++) {
      const res = simulate([[a], [b]], 'duel', seedBase + i * 104729);
      if (res.winnerTeam === 0) wA++; else if (res.winnerTeam === -1) wA += 0.5;
    }
    const pA = clamp(wA / 7, 0.08, 0.92);
    const odds = [
      Math.round(clamp(0.87 / pA, 1.05, 6) * 100) / 100,
      Math.round(clamp(0.87 / (1 - pA), 1.05, 6) * 100) / 100,
    ];
    showCircuit(screenEl, nav, { a, b, odds, pA });
  },
  circuitWatch(matchup, side, stake) {
    if (side >= 0) { G.dna -= stake; save(); refreshTopbar(); }
    const seed = Math.floor(Math.random() * 1e9);
    lastReplay = { mode: 'duel', seed, teams: [[matchup.a], [matchup.b]] };
    const battle = new Battle({
      teams: [[matchup.a], [matchup.b]], mode: 'duel', seed,
      labels: [matchup.a.name, matchup.b.name], gore: gore(),
    });
    runSim(battle, {
      title: `THE CIRCUIT — ${matchup.a.name} vs ${matchup.b.name}${side >= 0 ? ` · ${stake} 🧪 on ${[matchup.a, matchup.b][side].name}` : ''}`,
      onDone: () => finishCircuit(battle, matchup, side, stake),
    });
  },

  // ---------- VS Friend ----------
  link() { leaveScreens(); net.closeNet(); refreshTopbar(); showLink(screenEl, nav); },
  linkHost(mode = 'duel') { startLink('host', null, mode); },
  linkJoin(code) { startLink('join', code); },

  // ---------- Tournament of 8 ----------
  tournament() {
    leaveScreens(); refreshTopbar();
    const seedBase = Math.floor(Math.random() * 1e9);
    const lvl = 2 + Math.floor(Math.random() * 7);
    const entrants = Array.from({ length: 8 }, (_, i) => genOpponent(opponentRating(G.rating + 150), lvl, seedBase + i * 911));
    // scouting sims → single-match strength → rough champion odds
    const w = new Array(8).fill(0);
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 3; k++) {
        const j = (i + 1 + (k * 2 + i) % 7) % 8;
        const res = simulate([[entrants[i]], [entrants[j]]], 'duel', seedBase + i * 97 + k * 13);
        if (res.winnerTeam === 0) w[i]++; else if (res.winnerTeam === -1) w[i] += 0.5;
      }
    }
    const strength = w.map(x => Math.pow(x + 0.5, 2.2));
    const sSum = strength.reduce((a, b) => a + b, 0);
    const odds = strength.map(s => Math.round(clamp(0.85 / (s / sSum), 1.6, 15) * 10) / 10);
    tourney = {
      entrants, odds, bet: null, started: false,
      rounds: [
        [{ a: 0, b: 1, winner: null }, { a: 2, b: 3, winner: null }, { a: 4, b: 5, winner: null }, { a: 6, b: 7, winner: null }],
        [{ a: null, b: null, winner: null }, { a: null, b: null, winner: null }],
        [{ a: null, b: null, winner: null }],
      ],
    };
    renderTournament();
  },

  // ---------- Sparring Pit (fight your own critters, no stakes) ----------
  sparSetup() {
    if (G.creatures.length < 2) {
      SFX.deny();
      toast('The Sparring Pit needs at least 2 critters in your stable!', true);
      return;
    }
    nav.back = () => nav.modes();
    nav.stable({
      pick: {
        min: 2, max: 2, title: 'Pick two sparring partners',
        onPicked: (ids) => {
          const [a, b] = ids.map(id => G.creatures.find(c => c.id === id));
          runSpar(a, b);
        },
      },
    });
  },

  // ---------- Replay Theater ----------
  replayTheater() {
    const box = showModal(`
      <h2>📼 Replay Theater</h2>
      <p class="dim" style="margin-top:8px">Paste a replay code from a friend (or your own — every results screen has a “Copy replay” button) and watch the exact battle, blow for blow.</p>
      <div class="ed-namebar" style="margin-top:12px">
        <input type="text" id="rt-code" placeholder="CFR1.…" spellcheck="false">
      </div>
      <div class="modal-btns">
        ${lastReplay ? '<button class="btn" data-replay-copy>📼 Copy last battle</button>' : ''}
        <button class="btn" id="rt-cancel">Cancel</button>
        <button class="btn primary" id="rt-watch">▶ Watch</button>
      </div>`);
    wireReplayCopy(box);
    box.querySelector('#rt-cancel').onclick = () => { SFX.click(); closeModal(); };
    box.querySelector('#rt-watch').onclick = () => {
      const res = decodeReplay(box.querySelector('#rt-code').value);
      if (res.err) { SFX.deny(); toast(res.err, true); return; }
      SFX.click(); closeModal();
      const labels = res.teams.map(t => t.length === 1 ? t[0].name : t[0].name + ' & co.');
      const battle = new Battle({ teams: res.teams, mode: res.mode, seed: res.seed, labels, gore: gore() });
      lastReplay = { mode: res.mode, seed: res.seed, teams: res.teams };
      runSim(battle, {
        title: `📼 REPLAY — ${labels[0]} vs ${labels[1]}`,
        onDone: () => {
          const box2 = showModal(`
            <h2 style="text-align:center">📼 That's how it went down.</h2>
            <div class="modal-btns" style="justify-content:center">
              <button class="btn" id="rt2-again">↻ Watch again</button>
              <button class="btn primary" id="rt2-done">Done</button>
            </div>`, { dismissable: false });
          box2.querySelector('#rt2-again').onclick = () => {
            SFX.click(); closeModal();
            const b2 = new Battle({ teams: res.teams, mode: res.mode, seed: res.seed, labels, gore: gore() });
            runSim(b2, { title: `📼 REPLAY — ${labels[0]} vs ${labels[1]}`, onDone: () => nav.modes() });
          };
          box2.querySelector('#rt2-done').onclick = () => { SFX.click(); closeModal(); nav.modes(); };
        },
      });
    };
  },
};

function activeCreature() {
  return G.creatures.find(c => c.id === G.activeId) || G.creatures[0] || null;
}
function noCreatureFlow() {
  const box = showModal(`
    <h2>No critter yet!</h2>
    <p class="dim" style="margin-top:8px">You need to build a creature before you can compete. To the Lab!</p>
    <div class="modal-btns"><button class="btn primary" id="nc-go">🧬 Create Critter</button></div>`);
  box.querySelector('#nc-go').onclick = () => { SFX.click(); closeModal(); nav.editor(null); };
}

// ---------------- VS modal ----------------
function vsModal(teamA, teamB, mode, onFight, subtitle = null) {
  const modeName = { duel: 'RANKED DUEL', sumo: 'SUMO SHOWDOWN', team: 'TEAM RUMBLE' }[mode] || 'MATCH';
  const cardHtml = (cre, i, side) => `
    <div style="flex:1;min-width:0">
      <canvas class="cc-canvas" id="vs-${side}-${i}"></canvas>
      <div style="text-align:center;font-weight:800;margin-top:4px">${esc(cre.name)}</div>
      <div style="text-align:center" class="dim">LV ${cre.level} · ${cre.wins}W–${cre.losses}L</div>
    </div>`;
  const box = showModal(`
    <h2 style="text-align:center">${subtitle || modeName}</h2>
    <div style="display:flex;gap:10px;align-items:center;margin-top:14px">
      <div style="flex:1;display:flex;gap:8px;flex-direction:column">${teamA.map((c, i) => cardHtml(c, i, 'a')).join('')}</div>
      <div style="font-size:2rem;font-weight:900;color:var(--acc2);padding:0 6px">VS</div>
      <div style="flex:1;display:flex;gap:8px;flex-direction:column">${teamB.map((c, i) => cardHtml(c, i, 'b')).join('')}</div>
    </div>
    <div class="modal-btns" style="justify-content:center">
      <button class="btn" id="vs-cancel">Cancel</button>
      <button class="btn primary" id="vs-fight" style="min-width:160px">FIGHT! ⚔️</button>
    </div>`);
  requestAnimationFrame(() => {
    teamA.forEach((c, i) => renderCreatureCard(box.querySelector(`#vs-a-${i}`), c.design, statsOf(c)));
    teamB.forEach((c, i) => renderCreatureCard(box.querySelector(`#vs-b-${i}`), c.design, statsOf(c)));
  });
  box.querySelector('#vs-cancel').onclick = () => { SFX.click(); closeModal(); };
  box.querySelector('#vs-fight').onclick = () => { SFX.bell(); closeModal(); onFight(); };
}

// ---------------- sim overlay runner ----------------
let simStop = null, simSpeed = 1;
const SOUND_MAP = {
  hit: () => SFX.hit(), bigHit: () => SFX.bigHit(), ko: () => SFX.ko(),
  swish: () => SFX.swish(), spit: () => SFX.spit(), go: () => SFX.go(),
  cheer: () => SFX.cheer(), whistle: () => SFX.whistle(), bell: () => SFX.bell(),
  fanfare: () => SFX.fanfare(), pop: () => { SFX.pop(); SFX.splat(); },
};

function runSim(sim, { title, onDone }) {
  topbar.classList.add('hidden');
  simwrap.classList.remove('hidden');
  document.getElementById('sim-topline').textContent = title;
  simSpeed = G.settings.speed || 1;
  const spdBtns = simwrap.querySelectorAll('.spd');
  spdBtns.forEach(b => {
    b.classList.toggle('on', parseInt(b.dataset.speed) === simSpeed);
    b.onclick = () => {
      simSpeed = parseInt(b.dataset.speed);
      SFX.click();
      spdBtns.forEach(x => x.classList.toggle('on', parseInt(x.dataset.speed) === simSpeed));
    };
  });
  let muted = false;
  sim.onEvent = (ev) => { if (!muted && SOUND_MAP[ev]) SOUND_MAP[ev](); };
  document.getElementById('btn-skip').onclick = () => {
    SFX.click();
    muted = true;
    let guard = 0;
    while (!sim.finished && guard++ < 60 * 400) { sim.slowmo = 0; sim.step(1 / 60); }
    muted = false;
  };

  const ctx = simcanvas.getContext('2d');
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(t) {
    const dtReal = Math.min(0.08, (t - last) / 1000); last = t;
    const dpr = window.devicePixelRatio || 1;
    const w = simwrap.clientWidth, h = simwrap.clientHeight;
    const tw = Math.round(w * dpr);
    if (simcanvas.width !== tw) { simcanvas.width = tw; simcanvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // fixed-timestep accumulator: the sim only ever advances in exact 1/60
    // quanta, so identical seeds produce identical battles on any machine
    // (required for online play). hitstop pauses stepping, not sim state.
    if (sim.hitstop && sim.hitstop > 0) sim.hitstop -= dtReal;
    else {
      acc += dtReal * simSpeed;
      const maxSteps = 6 * simSpeed;
      let n = 0;
      while (acc >= STEP && !sim.finished && n++ < maxSteps) { sim.step(STEP); acc -= STEP; }
      if (acc > STEP * maxSteps) acc = 0; // avoid spiral of death on hiccups
    }
    sim.draw(ctx, w, h);

    if (sim.finished) {
      if (simStop) { simStop(); simStop = null; }
      simwrap.classList.add('hidden');
      topbar.classList.remove('hidden');
      onDone();
    }
  }
  if (simStop) simStop();
  simStop = startLoop(frame);
}

// ---------------- battle flow ----------------
function runBattle({ teams, mode, ranked, oppRating = 0, gauntlet = false, labels, returnTo }) {
  const seed = Math.floor(Math.random() * 1e9);
  lastReplay = { mode, seed, teams };
  const battle = new Battle({ teams, mode, seed, labels, gore: gore() });
  const modeName = { duel: 'RANKED DUEL', sumo: 'SUMO SHOWDOWN', team: 'TEAM RUMBLE' }[mode];
  runSim(battle, {
    title: `${gauntlet ? 'THE GAUNTLET' : modeName} — ${labels[0]} vs ${labels[1]}`,
    onDone: () => finishBattle(battle, { teams, mode, ranked, oppRating, gauntlet, returnTo }),
  });
}

function finishBattle(battle, { teams, mode, ranked, oppRating, gauntlet, returnTo }) {
  const sum = battle.summary();
  const won = sum.winnerTeam === 0, draw = sum.winnerTeam === -1;
  const outcome = draw ? 'draw' : won ? 'win' : 'loss';
  const playerTeam = teams[0];

  // stats & records
  G.stats.battles++;
  if (won) G.stats.wins++; else if (draw) G.stats.draws++; else G.stats.losses++;
  for (const c of playerTeam) { if (won) c.wins++; else if (!draw) c.losses++; }

  // rating
  let delta = 0;
  if (ranked) {
    const k = mode === 'duel' ? 1 : 0.75;
    delta = Math.round(eloDelta(G.rating, oppRating, won ? 1 : draw ? 0.5 : 0) * k);
    applyRating(delta);
  }

  // DNA + XP
  let rows, dna = 0, xpAmt = 0;
  if (gauntlet) {
    const run = G.gauntlet;
    rows = [];
    if (won && run) {
      const reward = gauntletStageReward(run.stage);
      run.bank += reward;
      rows.push({ label: `Stage ${run.stage} cleared — banked`, dna: reward });
      run.stage++;
      G.stats.gauntletBest = Math.max(G.stats.gauntletBest, run.stage - 1);
      if (run.stage > 10) {
        rows.push({ label: '👑 GAUNTLET CHAMPION bonus', dna: 300 });
        grantDna(run.bank + 300);
        rows.push({ label: 'Bank cashed out', dna: run.bank });
        G.gauntlet = null;
      }
    } else if (run) {
      const kept = Math.floor(run.bank / 2);
      rows.push({ label: `Run over — kept half the bank`, dna: kept });
      grantDna(kept);
      G.stats.gauntletBest = Math.max(G.stats.gauntletBest, run.stage - 1);
      G.gauntlet = null;
    }
    xpAmt = won ? 26 : 12;
  } else {
    const rw = battleRewards(mode, outcome, sum.hp0);
    rows = rw.rows; dna = rw.dna; xpAmt = rw.xp;
    grantDna(dna);
  }

  // XP + levelups
  const levelUps = [];
  for (const c of playerTeam) {
    const before = c.level;
    addXp(c, xpAmt);
    if (c.level > before) levelUps.push({ cre: c, from: before, to: c.level });
  }
  save();
  refreshTopbar();

  resultsModal({
    outcome, mode, delta, ranked, rows, xpAmt, levelUps, playerTeam, gauntlet,
    onClose: () => {
      const pending = playerTeam.filter(c => c.pendingTraitPicks > 0);
      const nextPick = () => {
        const c = pending.find(x => x.pendingTraitPicks > 0);
        if (c) traitPickModal(c, nextPick);
        else returnTo();
      };
      nextPick();
    },
  });
}

function resultsModal({ outcome, mode, delta, ranked, rows, xpAmt, levelUps, playerTeam, gauntlet, onClose }) {
  const banner = outcome === 'win' ? '🏆 VICTORY!' : outcome === 'draw' ? '🤝 DRAW' : '💥 DEFEAT';
  const bannerColor = outcome === 'win' ? 'var(--good)' : outcome === 'draw' ? 'var(--ink-dim)' : 'var(--bad)';
  if (outcome === 'win') SFX.fanfare(); else if (outcome === 'loss') SFX.sad();

  const rowsHtml = rows.map(r => `<div class="reward-row"><span>${r.label}</span><b class="dna">+${fmt(r.dna)} 🧪</b></div>`).join('');
  const xpHtml = playerTeam.map(c => {
    const lu = levelUps.find(l => l.cre === c);
    return `<div class="reward-row"><span>${esc(c.name)} ${lu ? `<b style="color:var(--dna)">LEVEL UP! ${lu.from}→${lu.to} ✨</b>` : ''}</span><b>+${xpAmt} XP</b></div>`;
  }).join('');

  const box = showModal(`
    <h2 style="text-align:center;color:${bannerColor};font-size:1.9rem">${banner}</h2>
    ${ranked ? `<div class="rating-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta} rating → ${G.rating} ${leagueOf(G.rating).icon}</div>` : ''}
    ${rowsHtml}${xpHtml}
    <div class="modal-btns">
      ${replayBtnHtml()}
      ${gauntlet ? '' : mode === 'duel' || mode === 'sumo' ? '<button class="btn" id="rs-again">⚔️ Fight again</button>' : ''}
      <button class="btn primary" id="rs-ok">Continue</button>
    </div>`, { dismissable: false });
  if (levelUps.length) SFX.levelup();
  wireReplayCopy(box);
  box.querySelector('#rs-ok').onclick = () => { SFX.click(); closeModal(); onClose(); };
  const again = box.querySelector('#rs-again');
  if (again) again.onclick = () => { SFX.click(); closeModal(); onClose(); setTimeout(() => nav.quickDuel(mode), 60); };
}

// ---------------- race flow ----------------
function runRace(entrants) {
  const race = new Race({ entrants, seed: Math.floor(Math.random() * 1e9), laps: 2 });
  runSim(race, {
    title: `CRITTER GRAND PRIX — ${entrants[0].cre.name} + ${entrants.length - 1} rivals`,
    onDone: () => {
      const standings = race.standings();
      const me = standings.findIndex(c => c.isPlayer) + 1;
      const cre = entrants[0].cre;
      G.stats.races++;
      if (me === 1) { G.stats.raceWins++; cre.raceWins = (cre.raceWins || 0) + 1; }
      const rw = raceRewards(me, entrants.length);
      grantDna(rw.dna);
      const before = cre.level;
      addXp(cre, rw.xp);
      const levelUps = cre.level > before ? [{ cre, from: before, to: cre.level }] : [];
      save(); refreshTopbar();
      resultsModal({
        outcome: me === 1 ? 'win' : me <= 3 ? 'draw' : 'loss',
        mode: 'race', delta: 0, ranked: false,
        rows: rw.rows, xpAmt: rw.xp, levelUps, playerTeam: [cre], gauntlet: false,
        onClose: () => {
          if (cre.pendingTraitPicks > 0) traitPickModal(cre, () => nav.modes());
          else nav.modes();
        },
      });
    },
  });
}

// ---------------- Tournament of 8 ----------------
let tourney = null;

function tourneyNextMatch() {
  if (!tourney) return null;
  return tourney.rounds.flat().find(m => m.winner === null && m.a !== null && m.b !== null) || null;
}

function tourneyAdvance(m, winnerIdx) {
  m.winner = winnerIdx;
  const T = tourney;
  // feed winners forward
  const qf = T.rounds[0], sf = T.rounds[1], f = T.rounds[2][0];
  for (let i = 0; i < 4; i++) {
    if (qf[i].winner !== null) {
      const slot = sf[Math.floor(i / 2)];
      if (i % 2 === 0) slot.a = qf[i].winner; else slot.b = qf[i].winner;
    }
  }
  for (let i = 0; i < 2; i++) {
    if (sf[i].winner !== null) {
      if (i === 0) f.a = sf[i].winner; else f.b = sf[i].winner;
    }
  }
  if (f.winner !== null) tourneySettle();
}

function tourneyWinnerOf(m, summary) {
  if (summary.winnerTeam === 0) return m.a;
  if (summary.winnerTeam === 1) return m.b;
  return summary.hp0 >= summary.hp1 ? m.a : m.b; // draws: judges lean to hp
}

function tourneySettle() {
  const T = tourney;
  const champ = T.rounds[2][0].winner;
  G.stats.tourneys++;
  if (T.bet) {
    if (T.bet.idx === champ) {
      const payout = Math.round(T.bet.stake * T.odds[T.bet.idx]);
      G.dna += payout;
      G.stats.tourneyBetsWon++;
      G.stats.betProfit += payout - T.bet.stake;
      SFX.jackpot();
      toast(`👑 Your champion delivered! +${fmt(payout)} 🧪`);
    } else {
      G.stats.betProfit -= T.bet.stake;
      SFX.sad();
      toast(`Your champion fell. ${T.bet.stake} 🧪 gone.`, true);
    }
  } else SFX.cheer();
  save(); refreshTopbar();
}

function renderTournament() {
  showTournament(screenEl, nav, tourney, {
    onBet(idx, stake) {
      if (idx !== null) { G.dna -= stake; tourney.bet = { idx, stake }; save(); refreshTopbar(); }
      tourney.started = true;
      renderTournament();
    },
    onPlay() {
      const m = tourneyNextMatch();
      if (!m) return renderTournament();
      const [a, b] = [tourney.entrants[m.a], tourney.entrants[m.b]];
      const seed = Math.floor(Math.random() * 1e9);
      lastReplay = { mode: 'duel', seed, teams: [[a], [b]] };
      const roundName = tourney.rounds[0].includes(m) ? 'QUARTERFINAL' : tourney.rounds[1].includes(m) ? 'SEMIFINAL' : 'GRAND FINAL';
      const battle = new Battle({ teams: [[a], [b]], mode: 'duel', seed, labels: [a.name, b.name], gore: gore() });
      runSim(battle, {
        title: `🎪 ${roundName} — ${a.name} vs ${b.name}`,
        onDone: () => {
          tourneyAdvance(m, tourneyWinnerOf(m, battle.summary()));
          leaveScreens();
          renderTournament();
        },
      });
    },
    onSimRest() {
      let m, guard = 0;
      while ((m = tourneyNextMatch()) && guard++ < 8) {
        const res = simulate([[tourney.entrants[m.a]], [tourney.entrants[m.b]]], 'duel', Math.floor(Math.random() * 1e9));
        tourneyAdvance(m, tourneyWinnerOf(m, res));
      }
      renderTournament();
    },
    onNew() { nav.tournament(); },
    onLeave() {
      // walking out mid-tournament resolves it off-screen (bets settle)
      if (tourney && tourney.started && tourney.rounds[2][0].winner === null) {
        let m, guard = 0;
        while ((m = tourneyNextMatch()) && guard++ < 8) {
          const res = simulate([[tourney.entrants[m.a]], [tourney.entrants[m.b]]], 'duel', Math.floor(Math.random() * 1e9));
          tourneyAdvance(m, tourneyWinnerOf(m, res));
        }
        toast('Tournament resolved while you left — check your DNA.');
      }
      tourney = null;
      nav.circuit();
    },
  });
}

// ---------------- Sparring Pit ----------------
function runSpar(a, b) {
  const seed = Math.floor(Math.random() * 1e9);
  lastReplay = { mode: 'duel', seed, teams: [[a], [b]] };
  const battle = new Battle({ teams: [[a], [b]], mode: 'duel', seed, labels: [a.name, b.name], gore: gore() });
  runSim(battle, {
    title: `🥊 SPARRING — ${a.name} vs ${b.name}`,
    onDone: () => {
      const w = battle.summary().winnerTeam;
      const box = showModal(`
        <h2 style="text-align:center">${w === -1 ? '🤝 Even match!' : `🥊 ${esc([a, b][w].name)} takes the round!`}</h2>
        <p class="dim" style="text-align:center;margin-top:8px">Sparring — no XP, no records, no hard feelings.</p>
        <div class="modal-btns" style="justify-content:center">
          ${replayBtnHtml()}
          <button class="btn" id="sp-done">Done</button>
          <button class="btn primary" id="sp-again">🥊 Again!</button>
        </div>`, { dismissable: false });
      wireReplayCopy(box);
      box.querySelector('#sp-done').onclick = () => { SFX.click(); closeModal(); nav.modes(); };
      box.querySelector('#sp-again').onclick = () => { SFX.click(); closeModal(); runSpar(a, b); };
    },
  });
}

// ---------------- Boneyard battle ----------------
function runBoneyardBattle(cre, opp) {
  const seed = Math.floor(Math.random() * 1e9);
  lastReplay = { mode: 'duel', seed, teams: [[cre], [opp]] };
  const battle = new Battle({
    teams: [[cre], [opp]], mode: 'duel', seed,
    labels: [cre.name, opp.name], gore: gore(),
  });
  runSim(battle, {
    title: `💀 BONEYARD — ${cre.name} vs ${opp.name} · streak ${G.boneyard.streak}`,
    onDone: () => {
      const sum = battle.summary();
      const won = sum.winnerTeam === 0;
      G.stats.battles++;
      if (won) {
        G.stats.wins++; cre.wins++;
        G.boneyard.streak++;
        G.boneyard.best = Math.max(G.boneyard.best, G.boneyard.streak);
        G.stats.boneyardWins++;
        const rows = [{ label: 'Boneyard victory (3× purse)', dna: BONEYARD_WIN_DNA }];
        let dna = BONEYARD_WIN_DNA;
        const bonus = BONEYARD_STREAK_BONUS[G.boneyard.streak];
        if (bonus) { rows.push({ label: `🔥 ${G.boneyard.streak}-win streak bonus`, dna: bonus }); dna += bonus; }
        grantDna(dna);
        const before = cre.level;
        addXp(cre, 30);
        const levelUps = cre.level > before ? [{ cre, from: before, to: cre.level }] : [];
        save(); refreshTopbar();
        resultsModal({
          outcome: 'win', mode: 'duel', delta: 0, ranked: false, rows, xpAmt: 30,
          levelUps, playerTeam: [cre], gauntlet: true, // hides "fight again" btn
          onClose: () => {
            const next = () => nav.boneyard();
            if (cre.pendingTraitPicks > 0) traitPickModal(cre, next); else next();
          },
        });
      } else if (sum.winnerTeam === -1) {
        // dead-even judges' draw: spared, but the streak dies instead
        G.stats.draws++;
        G.boneyard.streak = 0;
        save(); refreshTopbar();
        const box = showModal(`
          <h2 style="text-align:center">⚖️ SPARED</h2>
          <p class="dim" style="margin-top:10px;text-align:center">A dead-even draw. The judges let ${esc(cre.name)} crawl out alive… but the streak is dust.</p>
          <div class="modal-btns" style="justify-content:center"><button class="btn primary" id="by-ok">Phew.</button></div>`, { dismissable: false });
        box.querySelector('#by-ok').onclick = () => { SFX.click(); closeModal(); nav.boneyard(); };
      } else {
        // death.
        G.stats.losses++;
        const streak = G.boneyard.streak;
        G.boneyard.streak = 0;
        buryCreature(cre, streak);
        save(); refreshTopbar();
        SFX.knell();
        const grave = G.graveyard[0];
        const box = showModal(`
          <h2 style="text-align:center;color:var(--bad)">💀 ${esc(cre.name)} HAS FALLEN</h2>
          <div style="text-align:center;font-size:3rem;margin:14px 0">🪦</div>
          <p class="dim" style="text-align:center">Level ${grave.level} · ${grave.wins} wins · ${grave.losses} losses${streak ? ` · died on a ${streak}-win streak` : ''}</p>
          <p style="text-align:center;font-style:italic;margin-top:10px">“${esc(grave.epitaph)}”</p>
          <div class="modal-btns" style="justify-content:center">
            <button class="btn" id="by-grave">Visit grave</button>
            <button class="btn primary" id="by-lab">🧬 Build anew</button>
          </div>`, { dismissable: false });
        box.querySelector('#by-grave').onclick = () => { SFX.click(); closeModal(); nav.boneyard(); };
        box.querySelector('#by-lab').onclick = () => { SFX.click(); closeModal(); nav.editor(null); };
      }
    },
  });
}

// ---------------- Circuit payout ----------------
function finishCircuit(battle, matchup, side, stake) {
  const sum = battle.summary();
  const w = sum.winnerTeam;
  let html, sfxWin = false;
  if (side < 0) {
    html = `<h2 style="text-align:center">${w === -1 ? '🤝 A draw!' : `🏆 ${esc([matchup.a, matchup.b][w].name)} takes it!`}</h2>
      <p class="dim" style="text-align:center;margin-top:8px">The crowd goes mild. (No bet placed.)</p>`;
  } else if (w === -1) {
    G.dna += stake;
    html = `<h2 style="text-align:center">🤝 DRAW — stake returned</h2>
      <p class="dim" style="text-align:center;margin-top:8px">Your ${stake} 🧪 shuffles back into your pocket.</p>`;
  } else if (w === side) {
    const mult = matchup.odds[side];
    const payout = Math.round(stake * mult);
    G.dna += payout;
    G.stats.betsWon++;
    G.stats.betProfit += payout - stake;
    sfxWin = true;
    html = `<h2 style="text-align:center;color:var(--good)">💰 WINNER!</h2>
      <div style="text-align:center;font-size:2rem;font-weight:900;color:var(--dna);margin:10px 0">+${fmt(payout)} 🧪</div>
      <p class="dim" style="text-align:center">${esc([matchup.a, matchup.b][side].name)} paid ${mult.toFixed(2)}× on your ${stake} 🧪 stake.</p>`;
  } else {
    G.stats.betsLost++;
    G.stats.betProfit -= stake;
    html = `<h2 style="text-align:center;color:var(--bad)">📉 Busted</h2>
      <p class="dim" style="text-align:center;margin-top:8px">${esc([matchup.a, matchup.b][side].name)} let you down. ${stake} 🧪 gone with the goo.</p>`;
  }
  save(); refreshTopbar();
  if (sfxWin) SFX.jackpot(); else if (side >= 0 && w !== -1) SFX.sad();
  const box = showModal(`${html}
    <div class="modal-btns" style="justify-content:center">
      ${replayBtnHtml()}
      <button class="btn" id="ci-leave">Leave</button>
      <button class="btn primary" id="ci-again">📺 Next match</button>
    </div>`, { dismissable: false });
  wireReplayCopy(box);
  box.querySelector('#ci-leave').onclick = () => { SFX.click(); closeModal(); nav.modes(); };
  box.querySelector('#ci-again').onclick = () => { SFX.click(); closeModal(); nav.circuit(); };
}

// ---------------- VS Friend flow ----------------
let link = null; // {role, code, myCres, remote:{name,cres}, started, connected, mode}
const NET_MODE_LABEL = { duel: '⚔️ Duel', sumo: '🟡 Sumo', race: '🏁 Race', team: '👥 Tag Duo' };

// squad = active critter first, then strongest others (for Tag Duo / fallbacks)
function mySquad() {
  const active = activeCreature();
  if (!active) return [];
  const rest = G.creatures.filter(c => c.id !== active.id).sort((a, b) => b.level - a.level);
  return [active, ...rest].slice(0, 3);
}

function startLink(role, code = null, mode = 'duel') {
  const squad = mySquad();
  if (!squad.length) return noCreatureFlow();
  if (role === 'host' && mode === 'team' && squad.length < 2) {
    SFX.deny();
    toast('Tag Duo needs at least 2 critters in your stable!', true);
    return;
  }
  net.closeNet();
  link = { role, code: role === 'host' ? net.makeCode() : code, myCres: squad, remote: null, started: false, connected: false, mode };

  const waitHtml = (status) => `
    <h2 style="text-align:center">🌐 ${role === 'host' ? 'Hosting' : 'Joining'} — ${role === 'host' ? NET_MODE_LABEL[mode] : 'friend match'}</h2>
    ${role === 'host' ? `<div style="text-align:center;margin:16px 0">
      <div class="dim">Send your friend this code:</div>
      <div style="font-size:3rem;font-weight:900;letter-spacing:14px;color:var(--acc);margin-top:6px">${link.code}</div>
    </div>` : ''}
    <p class="dim" style="text-align:center" id="lk-status">${status}</p>
    <div class="modal-btns" style="justify-content:center"><button class="btn" id="lk-cancel">Cancel</button></div>`;
  const box = showModal(waitHtml(role === 'host' ? 'Waiting for your friend to join…' : 'Connecting to room ' + code + '…'), { dismissable: false });
  box.querySelector('#lk-cancel').onclick = () => { SFX.click(); net.closeNet(); link = null; closeModal(); nav.link(); };

  const setStatus = (s) => { const el2 = document.getElementById('lk-status'); if (el2) el2.textContent = s; };

  const cbs = {
    onReady: () => setStatus('Room open. Waiting for your friend…'),
    onConnected: () => {
      link.connected = true;
      SFX.connect();
      setStatus('Connected! Exchanging critters…');
      net.send({ t: 'hello', v: net.NET_VERSION, name: (G.playerName || 'Trainer').slice(0, 14), cres: net.packSquad(link.myCres) });
    },
    onMessage: (msg) => handleNetMessage(msg, setStatus),
    onClose: () => {
      if (!link) return;
      link.connected = false;
      toast('Friend disconnected.', true);
      // battles finish fine offline (deterministic) — only lobby needs the link
      if (!link.started) { net.closeNet(); link = null; closeModal(); nav.link(); }
    },
    onError: (e) => {
      const m = (e && e.message) || String(e);
      toast(m.includes('Could not connect to peer') ? 'No room with that code.' : 'Connection error: ' + m.slice(0, 60), true);
      net.closeNet(); link = null; closeModal(); nav.link();
    },
  };
  if (role === 'host') net.host(link.code, cbs);
  else net.join(code, cbs);
}

function handleNetMessage(msg, setStatus) {
  if (!link || !msg || typeof msg !== 'object') return;
  if (msg.t === 'hello') {
    if (msg.v !== net.NET_VERSION) {
      toast('Version mismatch — you two are running different game versions! Both refresh the page.', true);
      net.closeNet(); link = null; closeModal(); nav.link();
      return;
    }
    const res = net.sanitizeSquad(msg.cres || (msg.cre ? [msg.cre] : []));
    if (res.err) {
      toast(`Rejected opponent squad (${res.err})`, true);
      net.closeNet(); link = null; closeModal(); nav.link();
      return;
    }
    link.remote = { name: String(msg.name || 'Rival').slice(0, 14), cres: res.cres };
    if (link.role === 'host') {
      // downgrade Tag Duo if either side lacks the critters
      let mode = link.mode;
      if (mode === 'team' && (link.myCres.length < 2 || link.remote.cres.length < 2)) {
        mode = 'duel';
        toast('Friend has only one critter — switching to Duel.', true);
      }
      const seed = Math.floor(Math.random() * 1e9);
      net.send({ t: 'start', seed, mode });
      startNetMatch(seed, mode);
    } else setStatus('Ready! Waiting for host to start…');
  } else if (msg.t === 'start') {
    if (!link.remote) return;
    const mode = ['sumo', 'race', 'team'].includes(msg.mode) ? msg.mode : 'duel';
    startNetMatch(msg.seed >>> 0, mode);
  }
}

function startNetMatch(seed, mode) {
  if (!link || !link.remote) return;
  link.started = true;
  link.mode = mode;
  closeModal();
  const iAmHost = link.role === 'host';
  const myName = (G.playerName || 'You').slice(0, 14);

  if (mode === 'race') {
    // canonical entrant order: host, guest, then 4 seeded wildcard racers
    const r = rng(seed ^ 0x5f3759df);
    const hostCre = iAmHost ? link.myCres[0] : link.remote.cres[0];
    const guestCre = iAmHost ? link.remote.cres[0] : link.myCres[0];
    const lvl = Math.max(hostCre.level, guestCre.level);
    const entrants = [
      { cre: hostCre, isPlayer: iAmHost },
      { cre: guestCre, isPlayer: !iAmHost },
    ];
    for (let i = 0; i < 4; i++) entrants.push({ cre: genOpponent(1150 + Math.floor(r() * 300), lvl, Math.floor(r() * 1e9), true), isPlayer: false });
    const race = new Race({ entrants, seed, laps: 2 });
    runSim(race, {
      title: `🌐 FRIENDLY GRAND PRIX — ${myName} vs ${link.remote.name}`,
      onDone: () => finishNetRace(race, iAmHost),
    });
    return;
  }

  const n = mode === 'team' ? 2 : 1;
  const mine = link.myCres.slice(0, n), theirs = link.remote.cres.slice(0, n);
  // canonical order: host = team 0 on BOTH machines → identical sim
  const teams = iAmHost ? [mine, theirs] : [theirs, mine];
  const labelOf = (cres) => cres.length === 1 ? cres[0].name : cres[0].name + ' & ' + cres[1].name;
  const labels = teams.map(labelOf);
  lastReplay = { mode, seed, teams };
  const battle = new Battle({ teams, mode, seed, labels, gore: gore() });
  runSim(battle, {
    title: `🌐 FRIENDLY ${{ sumo: 'SUMO', team: 'TAG DUO' }[mode] || 'DUEL'} — ${myName} vs ${link.remote.name}`,
    onDone: () => finishNetBattle(battle, iAmHost),
  });
}

function finishNetRace(race, iAmHost) {
  const standings = race.standings();
  const myIdx = iAmHost ? 0 : 1;
  const myEntrant = race.racers[myIdx];
  const place = standings.indexOf(myEntrant) + 1;
  const friendPlace = standings.indexOf(race.racers[1 - myIdx]) + 1;
  const cre = link ? link.myCres[0] : null;
  if (!cre) { closeModal(); return nav.link(); }
  const beatFriend = place < friendPlace;
  if (beatFriend) { G.stats.friendWins++; } else if (friendPlace < place) { G.stats.friendLosses++; }
  G.stats.races++;
  if (place === 1) { G.stats.raceWins++; cre.raceWins = (cre.raceWins || 0) + 1; }
  const dna = [40, 28, 18, 12, 10, 8][Math.min(place - 1, 5)];
  grantDna(dna);
  const before = cre.level;
  addXp(cre, Math.max(8, 18 - (place - 1) * 3));
  save(); refreshTopbar();
  if (beatFriend) SFX.fanfare(); else SFX.sad();
  const connected = link && link.connected;
  const box = showModal(`
    <h2 style="text-align:center;color:${beatFriend ? 'var(--good)' : 'var(--bad)'}">${beatFriend ? '🏁 BRAGGING RIGHTS!' : '🏁 Beaten to the line…'}</h2>
    <p class="dim" style="text-align:center;margin-top:8px">You: ${ordinal(place)} · ${esc(link.remote.name)}: ${ordinal(friendPlace)} (of ${race.racers.length})</p>
    <div class="reward-row"><span>Race payout</span><b class="dna">+${dna} 🧪</b></div>
    <div class="reward-row"><span>${esc(cre.name)}${cre.level > before ? ` <b style="color:var(--dna)">LEVEL UP! ✨</b>` : ''}</span><b>XP</b></div>
    <div class="modal-btns" style="justify-content:center">
      <button class="btn" id="nr-leave">Leave</button>
      ${connected && iAmHost ? '<button class="btn primary" id="nr-again">🏁 Race again</button>' : ''}
      ${connected && !iAmHost ? '<span class="dim" style="align-self:center">Host picks the rematch…</span>' : ''}
    </div>`, { dismissable: false });
  box.querySelector('#nr-leave').onclick = () => {
    SFX.click(); net.closeNet(); link = null; closeModal();
    if (cre.pendingTraitPicks > 0) traitPickModal(cre, () => nav.link()); else nav.link();
  };
  const ag = box.querySelector('#nr-again');
  if (ag) ag.onclick = () => {
    SFX.click();
    const seed = Math.floor(Math.random() * 1e9);
    net.send({ t: 'start', seed, mode: 'race' });
    closeModal();
    startNetMatch(seed, 'race');
  };
}

function finishNetBattle(battle, iAmHost) {
  const sum = battle.summary();
  const myTeam = iAmHost ? 0 : 1;
  const won = sum.winnerTeam === myTeam;
  const draw = sum.winnerTeam === -1;
  const used = link ? link.myCres.slice(0, link.mode === 'team' ? 2 : 1) : [];
  if (!used.length) { closeModal(); return nav.link(); }

  if (won) G.stats.friendWins++; else if (!draw) G.stats.friendLosses++;
  const dna = won ? 30 : draw ? 15 : 10;
  grantDna(dna);
  const xpAmt = won ? 16 : 8;
  const levelNotes = used.map(c => {
    const before = c.level;
    if (won) c.wins++; else if (!draw) c.losses++;
    addXp(c, xpAmt);
    return { c, up: c.level > before };
  });
  save(); refreshTopbar();

  const connected = link && link.connected;
  const banner = draw ? '🤝 DRAW' : won ? '🏆 VICTORY!' : '💥 DEFEAT';
  const color = draw ? 'var(--ink-dim)' : won ? 'var(--good)' : 'var(--bad)';
  if (won) SFX.fanfare(); else if (!draw) SFX.sad();
  const box = showModal(`
    <h2 style="text-align:center;color:${color};font-size:1.8rem">${banner}</h2>
    <div class="reward-row"><span>Friendly ${NET_MODE_LABEL[link.mode] || 'match'}</span><b class="dna">+${dna} 🧪</b></div>
    ${levelNotes.map(({ c, up }) => `<div class="reward-row"><span>${esc(c.name)}${up ? ` <b style="color:var(--dna)">LEVEL UP! ✨</b>` : ''}</span><b>+${xpAmt} XP</b></div>`).join('')}
    ${connected ? '' : '<p class="dim" style="margin-top:8px">Friend disconnected — no rematch available.</p>'}
    <div class="modal-btns" style="justify-content:center">
      ${replayBtnHtml()}
      <button class="btn" id="nb-leave">Leave</button>
      ${connected && iAmHost ? '<button class="btn primary" id="nb-rematch">⚔️ Rematch</button>' : ''}
      ${connected && !iAmHost ? '<span class="dim" style="align-self:center">Host picks the rematch…</span>' : ''}
    </div>`, { dismissable: false });
  wireReplayCopy(box);
  box.querySelector('#nb-leave').onclick = () => {
    SFX.click(); net.closeNet(); link = null; closeModal();
    const pending = used.find(c => c.pendingTraitPicks > 0);
    if (pending) traitPickModal(pending, () => nav.link()); else nav.link();
  };
  const rm = box.querySelector('#nb-rematch');
  if (rm) rm.onclick = () => {
    SFX.click();
    const seed = Math.floor(Math.random() * 1e9);
    net.send({ t: 'start', seed, mode: link.mode });
    closeModal();
    startNetMatch(seed, link.mode);
  };
}

// ---------------- trait picking ----------------
function traitPickModal(cre, onDone) {
  const available = Object.keys(TRAITS).filter(t => !cre.traits.includes(t));
  const options = [];
  while (options.length < 3 && available.length) {
    options.push(available.splice(Math.floor(Math.random() * available.length), 1)[0]);
  }
  if (!options.length) { cre.pendingTraitPicks = 0; save(); return onDone(); }
  const box = showModal(`
    <h2>✨ ${esc(cre.name)} learned something!</h2>
    <p class="dim" style="margin-top:6px">Reached level ${cre.level >= 9 ? 9 : cre.level >= 6 ? 6 : 3}+ — choose one permanent trait:</p>
    <div class="trait-pick">
      ${options.map(t => `<button class="trait-opt" data-t="${t}"><b>${TRAITS[t].name}</b><span>${TRAITS[t].desc}</span></button>`).join('')}
    </div>`, { dismissable: false });
  box.querySelectorAll('.trait-opt').forEach(b => b.onclick = () => {
    cre.traits.push(b.dataset.t);
    cre.pendingTraitPicks = Math.max(0, cre.pendingTraitPicks - 1);
    save();
    SFX.levelup();
    toast(`${esc(cre.name)} gained ${TRAITS[b.dataset.t].name}!`);
    closeModal();
    if (cre.pendingTraitPicks > 0) traitPickModal(cre, onDone);
    else onDone();
  });
}

// ---------------- onboarding ----------------
function maybeOnboard() {
  if (G.seenIntro) return;
  G.seenIntro = true;
  save();
  const box = showModal(`
    <h2>🧬 Welcome to Critterforge!</h2>
    <p class="dim" style="margin-top:10px;line-height:1.6">
      Here, <b>you're the designer</b> — build a creature from bodies, legs, jaws, horns and strange organs,
      then release it into the arena to fight, shove and race <b>all by itself</b>.<br><br>
      Every critter gets the same <b>100-point Bio-Budget</b>, so battles are won by clever design, not
      deep pockets. Earn 🧪 DNA from every match, unlock weirder parts, climb from Bronze to
      <b>Legend League</b>… and maybe brave the Gauntlet.<br><br>
      Your critters never die. Worst case? They lose, learn, and wobble home. 💚
    </p>
    <div class="modal-btns" style="justify-content:center">
      <button class="btn primary" id="ob-go" style="font-size:1.05rem">🧪 Build my first critter!</button>
    </div>`, { dismissable: false });
  box.querySelector('#ob-go').onclick = () => { SFX.click(); closeModal(); nav.editor(null); };
}

// ---------------- boot ----------------
function boot() {
  load();

  // dev cheats (strip for release builds): ?dna=N grants DNA once,
  // and window.critter offers console helpers
  const qp = new URLSearchParams(location.search);
  if (qp.has('dna')) {
    const n = parseInt(qp.get('dna'), 10);
    if (Number.isFinite(n) && n > 0) {
      G.dna += n;
      save();
      setTimeout(() => toast(`🧪 +${fmt(n)} DNA (dev grant)`), 600);
    }
    history.replaceState(null, '', location.pathname);
  }
  window.critter = {
    addDna(n = 1000) { G.dna += n; save(); refreshTopbar(); return G.dna; },
    unlockAll() {
      for (const [cat, tbl] of Object.entries(CATALOG))
        for (const id of Object.keys(tbl))
          if (!G.unlocked.includes(cat + ':' + id)) G.unlocked.push(cat + ':' + id);
      save(); refreshTopbar();
      return 'all parts unlocked';
    },
  };

  setVolumes(G.settings.sfx, G.settings.music);
  topbar.classList.remove('hidden');
  refreshTopbar();
  document.getElementById('btn-home').onclick = () => { SFX.click(); nav.menu(); };

  // surface unexpected errors as toasts so players can report them
  let errToasts = 0;
  window.addEventListener('error', (e) => {
    if (errToasts++ < 3) toast(`⚠ Bug: ${String(e.message).slice(0, 80)} — screenshot this!`, true);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (errToasts++ < 3) toast(`⚠ Bug: ${String(e.reason && e.reason.message || e.reason).slice(0, 80)}`, true);
  });

  // audio unlock on first gesture
  const unlock = () => {
    unlockAudio();
    startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  nav.menu();
  maybeOnboard();
}
boot();
