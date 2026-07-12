// ============================================================
// Screen renderers. Each takes (container, nav) where nav is
// the router/orchestrator defined in main.js.
// ============================================================
import { el, esc, fmt, rng, startLoop } from './util.js';
import { G, save, LEAGUES, leagueOf, nextLeague, SLOT_PRICES, hardReset } from './league.js';
import { statsOf, budgetOfCre, xpForLevel, MAX_LEVEL, TRAITS } from './creature.js';
import { CATALOG, BUDGET } from './parts.js';
import { drawCreature, renderCreatureCard } from './drawing.js';
import { deriveStats } from './parts.js';
import { genOpponent } from './opponents.js';
import { SFX, setVolumes } from './audio.js';
import { toast, confirmModal, showModal, closeModal } from './ui-bits.js';

let menuStop = null;
export function stopMenuLoop() { if (menuStop) { menuStop(); menuStop = null; } }

// ---------------- MAIN MENU ----------------
export function showMenu(container, nav) {
  const league = leagueOf(G.rating);
  const nxt = nextLeague(G.rating);
  const prog = nxt ? Math.round(((G.rating - league.min) / (nxt.min - league.min)) * 100) : 100;
  const s = G.stats;

  container.innerHTML = '';
  const root = el(`<div>
    <canvas id="menu-bg"></canvas>
    <div class="menu-wrap">
      <div class="game-logo">CRITTERFORGE</div>
      <div class="game-tag">Build it · Train it · Unleash it</div>
      <div class="league-banner" style="width:min(430px,90vw)">
        <div class="league-icon">${league.icon}</div>
        <div class="lb-body">
          <div class="lb-name">${league.name} League</div>
          <div class="lb-sub">${nxt ? `${nxt.min - G.rating} rating to ${nxt.name}` : 'Top of the world!'}</div>
          <div class="lb-progress"><i style="width:${prog}%"></i></div>
        </div>
        <div class="lb-rating">${G.rating}</div>
      </div>
      <div class="menu-btns">
        <button class="btn primary" id="m-duel">⚔️ Ranked Duel<span class="mode-sub">Fight for rating — the main event</span></button>
        <button class="btn" id="m-link">🌐 VS Friend<span class="mode-sub">Online battles with a room code</span></button>
        <button class="btn" id="m-modes">🎮 Game Modes<span class="mode-sub">Sumo · Teams · Racing · Gauntlet · Circuit · Boneyard</span></button>
        <button class="btn" id="m-stable">🧬 My Critters<span class="mode-sub">${G.creatures.length}/${G.slots} in your stable</span></button>
        <button class="btn" id="m-shop">🛒 Gene Shop<span class="mode-sub">Unlock parts & upgrades</span></button>
        <button class="btn" id="m-howto">❓ How to Play</button>
        <button class="btn" id="m-settings">⚙️ Settings</button>
      </div>
      <div class="menu-foot">Battles: ${s.wins}W – ${s.losses}L – ${s.draws}D · Race wins: ${s.raceWins} · Best rating: ${G.bestRating}</div>
    </div>
  </div>`);
  container.appendChild(root);

  root.querySelector('#m-duel').onclick = () => { SFX.click(); nav.quickDuel('duel'); };
  root.querySelector('#m-link').onclick = () => { SFX.click(); nav.link(); };
  root.querySelector('#m-modes').onclick = () => { SFX.click(); nav.modes(); };
  root.querySelector('#m-stable').onclick = () => { SFX.click(); nav.stable(); };
  root.querySelector('#m-shop').onclick = () => { SFX.click(); nav.shop(); };
  root.querySelector('#m-howto').onclick = () => { SFX.click(); nav.howto(); };
  root.querySelector('#m-settings').onclick = () => { SFX.click(); nav.settings(); };

  // animated background: player's critters (or random ones) strolling
  const bg = root.querySelector('#menu-bg');
  const ctx = bg.getContext('2d');
  const r = rng(777);
  const walkers = [];
  const src = G.creatures.length ? G.creatures : [genOpponent(1000, 1, 42), genOpponent(1200, 3, 43), genOpponent(1500, 5, 44)];
  for (let i = 0; i < Math.min(4, src.length + 1); i++) {
    const cre = src[i % src.length];
    walkers.push({
      design: cre.design, stats: statsOf(cre),
      x: r() * 800, y: r() * 500, ang: r() * 6.28, walkPhase: r() * 6, t: r() * 10,
    });
  }
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const w = container.clientWidth, h = container.clientHeight;
    if (bg.width !== w) { bg.width = w; bg.height = h; }
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.16;
    for (const wk of walkers) {
      wk.t += dt;
      wk.ang += Math.sin(wk.t * 0.6) * dt * 0.5;
      wk.x += Math.cos(wk.ang) * 34 * dt;
      wk.y += Math.sin(wk.ang) * 34 * dt;
      if (wk.x < -80) wk.x = w + 80; if (wk.x > w + 80) wk.x = -80;
      if (wk.y < -80) wk.y = h + 80; if (wk.y > h + 80) wk.y = -80;
      wk.walkPhase += dt * 4;
      drawCreature(ctx, wk.design, wk.stats, {
        x: wk.x, y: wk.y, ang: wk.ang, walkPhase: wk.walkPhase, moveAmt: 0.7, attack: null, hurt: 0,
      }, { scale: 1.4 });
    }
    ctx.globalAlpha = 1;
  }
  stopMenuLoop();
  menuStop = startLoop(loop);
}

// ---------------- STABLE ----------------
// opts.pick = {min, max, title, onPicked(ids)} → selection mode
export function showStable(container, nav, opts = {}) {
  container.innerHTML = '';
  const pick = opts.pick || null;
  const picked = new Set();
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="st-back">← Back</button>
      <h1>${pick ? pick.title : 'My Critters'}</h1>
      <div class="spacer"></div>
      ${pick ? `<button class="btn primary" id="st-go" disabled>Start!</button>`
             : `<button class="btn primary" id="st-new">+ New Critter</button>`}
    </div>
    ${pick ? `<p class="sub">Choose ${pick.min === pick.max ? pick.min : pick.min + '–' + pick.max} critters.</p>` : `<p class="sub">⭐ marks your active critter — it fights your ranked duels, sumo bouts and races.</p>`}
    <div class="grid cols3" id="st-grid"></div>
  </div>`);
  container.appendChild(root);
  root.querySelector('#st-back').onclick = () => { SFX.click(); nav.back ? nav.back() : nav.menu(); };
  if (!pick) root.querySelector('#st-new').onclick = () => {
    if (G.creatures.length >= G.slots) { SFX.deny(); toast(`Stable full (${G.slots} slots). Expand in the Gene Shop!`, true); return; }
    SFX.click(); nav.editor(null);
  };
  else root.querySelector('#st-go').onclick = () => {
    SFX.click(); pick.onPicked([...picked]);
  };

  const grid = root.querySelector('#st-grid');
  const thumbs = [];
  for (const cre of G.creatures) {
    const isActive = G.activeId === cre.id;
    const xpNeed = xpForLevel(cre.level);
    const traitNames = cre.traits.map(t => TRAITS[t].name).join(', ');
    const card = el(`<div class="card ${pick ? 'clicky' : ''}" data-id="${cre.id}">
      <canvas class="cc-canvas"></canvas>
      <h3>${isActive ? '⭐ ' : ''}${esc(cre.name)}</h3>
      <div class="cc-badges">
        <span class="badge lvl">LV ${cre.level}${cre.level < MAX_LEVEL ? ` · ${cre.xp}/${xpNeed} XP` : ' · MAX'}</span>
        <span class="badge wl">${cre.wins}W–${cre.losses}L</span>
        <span class="badge">${budgetOfCre(cre)}/${BUDGET} pts</span>
      </div>
      ${traitNames ? `<div class="dim" style="margin-top:6px;font-size:.76rem">✨ ${traitNames}</div>` : ''}
      ${cre.pendingTraitPicks > 0 ? `<div style="margin-top:6px;font-size:.78rem;color:var(--acc2)">🎁 Trait pick available!</div>` : ''}
      ${pick ? '' : `<div class="cc-row">
        <button class="btn small" data-act="active" ${isActive ? 'disabled' : ''}>⭐ Active</button>
        <button class="btn small" data-act="edit">🔧 Edit</button>
        <button class="btn small danger" data-act="release">✖</button>
      </div>`}
    </div>`);
    grid.appendChild(card);
    thumbs.push([card.querySelector('.cc-canvas'), cre]);

    if (pick) {
      card.onclick = () => {
        SFX.click();
        if (picked.has(cre.id)) picked.delete(cre.id);
        else if (picked.size < pick.max) picked.add(cre.id);
        card.classList.toggle('selected', picked.has(cre.id));
        root.querySelector('#st-go').disabled = picked.size < pick.min;
      };
    } else {
      card.querySelector('[data-act=active]').onclick = () => {
        G.activeId = cre.id; save(); SFX.click();
        showStable(container, nav, opts);
      };
      card.querySelector('[data-act=edit]').onclick = () => { SFX.click(); nav.editor(cre.id); };
      card.querySelector('[data-act=release]').onclick = () => {
        confirmModal(`Release ${esc(cre.name)}?`, `They'll scamper off to a happy critter meadow. This can't be undone — their level and record go with them.`, () => {
          G.creatures = G.creatures.filter(c => c.id !== cre.id);
          if (G.activeId === cre.id) G.activeId = G.creatures[0] ? G.creatures[0].id : null;
          save(); toast(`${esc(cre.name)} released 🍃`);
          showStable(container, nav, opts);
        }, 'Release');
      };
      if (cre.pendingTraitPicks > 0) {
        card.style.borderColor = 'var(--acc2)';
        card.classList.add('clicky');
        card.querySelector('.cc-canvas').onclick = () => nav.traitPick(cre);
      }
    }
  }
  if (!pick && G.creatures.length < G.slots) {
    const add = el(`<div class="card clicky" style="display:flex;align-items:center;justify-content:center;min-height:220px;flex-direction:column;gap:8px;color:var(--ink-faint)">
      <div style="font-size:2.4rem">＋</div><div>New Critter</div></div>`);
    add.onclick = () => { SFX.click(); nav.editor(null); };
    grid.appendChild(add);
  }
  // draw thumbnails after layout
  requestAnimationFrame(() => { for (const [cv, cre] of thumbs) renderCreatureCard(cv, cre.design, statsOf(cre)); });
}

// ---------------- MODES ----------------
export function showModes(container, nav) {
  container.innerHTML = '';
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="mo-back">← Back</button>
      <h1>Game Modes</h1>
    </div>
    <div class="grid cols3">
      <div class="card clicky mode-card" id="mo-duel"><div class="mc-emoji">⚔️</div><h3>Ranked Duel</h3>
        <p>Your active critter vs a matched opponent. Win rating, climb leagues. The classic.</p></div>
      <div class="card clicky mode-card" id="mo-sumo"><div class="mc-emoji">🟡</div><h3>Sumo Showdown</h3>
        <p>Shove them out of the shrinking ring — or knock them out. Heavy builds shine. Ranked!</p></div>
      <div class="card clicky mode-card" id="mo-team"><div class="mc-emoji">👥</div><h3>Team Rumble</h3>
        <p>2v2 or 3v3 chaos with your own squad. Needs at least 2 critters in your stable. Ranked!</p></div>
      <div class="card clicky mode-card" id="mo-race"><div class="mc-emoji">🏁</div><h3>Critter Grand Prix</h3>
        <p>Six racers, mud pits, boost pads. Speedy builds finally get their moment. Big DNA payouts.</p></div>
      <div class="card clicky mode-card" id="mo-gauntlet"><div class="mc-emoji">🔥</div><h3>The Gauntlet</h3>
        <p>Ten fights, rising difficulty, growing DNA bank. Lose and you keep only half. Cash out anytime…</p></div>
      <div class="card clicky mode-card" id="mo-circuit"><div class="mc-emoji">📺</div><h3>The Circuit</h3>
        <p>Live exhibition matches, all day long. Study the fighters, read the odds, and put your DNA where your gut is.</p></div>
      <div class="card clicky mode-card" id="mo-boneyard" style="border-color:rgba(255,107,129,.35)"><div class="mc-emoji">💀</div><h3>Boneyard League</h3>
        <p>Triple rewards. Streak bonuses. One rule: <b>lose and your critter is gone forever.</b></p></div>
      <div class="card clicky mode-card" id="mo-link"><div class="mc-emoji">🌐</div><h3>VS Friend</h3>
        <p>Battle a friend online — share a 4-letter room code and let your creations settle it. Duel or sumo!</p></div>
      <div class="card clicky mode-card" id="mo-replay"><div class="mc-emoji">📼</div><h3>Replay Theater</h3>
        <p>Every battle has a shareable code. Paste one here to rewatch any fight, exactly as it happened.</p></div>
    </div>
  </div>`);
  container.appendChild(root);
  root.querySelector('#mo-back').onclick = () => { SFX.click(); nav.menu(); };
  root.querySelector('#mo-duel').onclick = () => { SFX.click(); nav.quickDuel('duel'); };
  root.querySelector('#mo-sumo').onclick = () => { SFX.click(); nav.quickDuel('sumo'); };
  root.querySelector('#mo-team').onclick = () => { SFX.click(); nav.teamSetup(); };
  root.querySelector('#mo-race').onclick = () => { SFX.click(); nav.race(); };
  root.querySelector('#mo-gauntlet').onclick = () => { SFX.click(); nav.gauntlet(); };
  root.querySelector('#mo-circuit').onclick = () => { SFX.click(); nav.circuit(); };
  root.querySelector('#mo-boneyard').onclick = () => { SFX.click(); nav.boneyard(); };
  root.querySelector('#mo-link').onclick = () => { SFX.click(); nav.link(); };
  root.querySelector('#mo-replay').onclick = () => { SFX.click(); nav.replayTheater(); };
}

// ---------------- SHOP ----------------
export function showShop(container, nav) {
  container.innerHTML = '';
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="sh-back">← Back</button>
      <h1>Gene Shop</h1>
      <div class="spacer"></div>
      <div class="tb-chip dna" style="font-size:1.05rem">🧪 <span>${fmt(G.dna)}</span> DNA</div>
    </div>
    <p class="sub">Unlocked parts are available to ALL your critters, forever. Earn DNA by battling and racing.</p>
    <div id="sh-sections"></div>
  </div>`);
  container.appendChild(root);
  root.querySelector('#sh-back').onclick = () => { SFX.click(); nav.menu(); };

  const sections = root.querySelector('#sh-sections');

  // stable slots
  if (G.slots < 3 + SLOT_PRICES.length) {
    const price = SLOT_PRICES[G.slots - 3];
    const sec = el(`<div class="ed-panel" style="margin-bottom:16px">
      <h4>Stable</h4>
      <div class="card part-card">
        <div class="pc-icon">🏠</div>
        <div class="pc-body"><div class="pc-name">Stable Expansion</div>
        <div class="pc-desc">Room for one more critter (currently ${G.slots} slots).</div></div>
        <button class="btn small gold" id="sh-slot">🧪 ${price}</button>
      </div></div>`);
    sections.appendChild(sec);
    sec.querySelector('#sh-slot').onclick = () => {
      if (G.dna < price) { SFX.deny(); toast('Not enough DNA!', true); return; }
      confirmModal('Expand stable?', `Spend <b style="color:var(--dna)">${price} 🧪</b> for a permanent extra slot?`, () => {
        G.dna -= price; G.slots++; save(); SFX.buy(); toast('Stable expanded! 🏠');
        showShop(container, nav);
        window.dispatchEvent(new Event('dna-changed'));
      });
    };
  }

  const CAT_LABELS = { body: '🫘 Bodies', legs: '🦵 Legs', weapon: '⚔️ Weapons', armor: '🛡️ Armor', organ: '❤️ Organs' };
  for (const [cat, tbl] of Object.entries(CATALOG)) {
    const locked = Object.entries(tbl).filter(([id]) => !G.unlocked.includes(cat + ':' + id));
    const ownedCount = Object.keys(tbl).length - locked.length;
    const sec = el(`<div class="ed-panel" style="margin-bottom:16px">
      <h4>${CAT_LABELS[cat]} · ${ownedCount}/${Object.keys(tbl).length} owned</h4>
      <div class="grid cols3" id="sec-grid"></div></div>`);
    const g = sec.querySelector('#sec-grid');
    if (!locked.length) g.appendChild(el(`<div class="dim" style="padding:6px">All parts owned! 🎉</div>`));
    for (const [id, p] of locked) {
      const card = el(`<div class="card part-card">
        <div class="pc-icon">${p.icon}</div>
        <div class="pc-body"><div class="pc-name">${p.name}</div><div class="pc-desc">${p.desc}</div></div>
        <button class="btn small gold">🧪 ${p.unlock}</button>
      </div>`);
      card.querySelector('button').onclick = () => {
        if (G.dna < p.unlock) { SFX.deny(); toast('Not enough DNA — go win some matches!', true); return; }
        confirmModal(`Unlock ${p.name}?`, `Spend <b style="color:var(--dna)">${p.unlock} 🧪 DNA</b> to unlock this part permanently?`, () => {
          G.dna -= p.unlock; G.unlocked.push(cat + ':' + id); save(); SFX.buy();
          toast(`${p.name} unlocked!`);
          showShop(container, nav);
          window.dispatchEvent(new Event('dna-changed'));
        });
      };
      g.appendChild(card);
    }
    sections.appendChild(sec);
  }
}

// ---------------- GAUNTLET ----------------
export function showGauntlet(container, nav) {
  container.innerHTML = '';
  const run = G.gauntlet;
  const active = G.creatures.find(c => c.id === G.activeId);
  const runCre = run ? G.creatures.find(c => c.id === run.creId) : null;

  let inner;
  if (!run) {
    inner = `
      <p class="sub">Ten fights. Each stage banks more DNA — but lose and you keep only <b>half</b> your bank. Cash out any time to keep it all. Your critter never gets hurt for real. 😉</p>
      ${active ? `<div class="ed-panel" style="max-width:420px">
        <h4>Challenger</h4>
        <div style="font-weight:800;font-size:1.1rem">⭐ ${esc(active.name)} <span class="badge lvl">LV ${active.level}</span></div>
        <div class="modal-btns" style="justify-content:flex-start">
          <button class="btn primary" id="ga-start">🔥 Enter the Gauntlet</button>
        </div>
      </div>` : `<p>You need a critter first! Create one in the Lab.</p>
        <button class="btn primary" id="ga-create">🧬 Create Critter</button>`}`;
  } else {
    const nodes = Array.from({ length: 10 }, (_, i) => {
      const st = i + 1;
      const cls = st < run.stage ? 'done' : st === run.stage ? 'next' : '';
      return `<div class="g-node ${cls}">${st < run.stage ? '✓' : st}</div>`;
    }).join('');
    inner = `
      <p class="sub">Stage <b>${run.stage}</b> of 10 · Bank: <b style="color:var(--dna)">${fmt(run.bank)} 🧪</b> · Fighting with <b>${runCre ? esc(runCre.name) : '???'}</b></p>
      <div class="gauntlet-track">${nodes}</div>
      <div class="modal-btns" style="justify-content:flex-start">
        <button class="btn primary" id="ga-fight">⚔️ Fight Stage ${run.stage}</button>
        <button class="btn gold" id="ga-cashout" ${run.bank <= 0 ? 'disabled' : ''}>💰 Cash Out (${fmt(run.bank)} 🧪)</button>
      </div>`;
  }

  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="ga-back">← Back</button>
      <h1>🔥 The Gauntlet</h1>
      <div class="spacer"></div>
      <div class="dim">Best run: stage ${G.stats.gauntletBest}</div>
    </div>
    ${inner}
  </div>`);
  container.appendChild(root);
  root.querySelector('#ga-back').onclick = () => { SFX.click(); nav.modes(); };
  const q = (s) => root.querySelector(s);
  if (q('#ga-start')) q('#ga-start').onclick = () => { SFX.click(); nav.gauntletStart(); };
  if (q('#ga-create')) q('#ga-create').onclick = () => { SFX.click(); nav.editor(null); };
  if (q('#ga-fight')) q('#ga-fight').onclick = () => { SFX.click(); nav.gauntletFight(); };
  if (q('#ga-cashout')) q('#ga-cashout').onclick = () => { SFX.click(); nav.gauntletCashout(); };
}

// ---------------- HOW TO PLAY ----------------
export function showHowto(container, nav) {
  container.innerHTML = '';
  const root = el(`<div class="screen-inner howto">
    <div class="sect-head">
      <button class="btn small" id="ht-back">← Back</button>
      <h1>How to Play</h1>
    </div>
    <div class="ed-panel"><h4>🧬 The Big Idea</h4>
      <p class="dim">Design a creature in the Lab, then watch it fight, shove and race <b>on its own</b>. You're the engineer, not the pilot — victory is decided by how well you built it.</p></div>
    <div class="ed-panel"><h4>⚖️ Bio-Budget = Fairness</h4>
      <p class="dim">Every part costs points and every critter gets the same <b>${BUDGET}-point budget</b>. A walking fortress gives up speed; a speedster gives up armor. There is no "best" build — only best <i>for a strategy</i>. Rock, paper, critters.</p></div>
    <div class="ed-panel"><h4>⚔️ Combat</h4>
      <p class="dim">Critters have <b>health</b> (run out = KO), <b>stamina</b> (attacks cost it; exhausted critters slow down) and <b>armor</b> (reduces damage). Weapons attack automatically when in range. If the clock runs out, the judges score remaining health. Watch for venom, rage, crits and counters!</p></div>
    <div class="ed-panel"><h4>🏆 Ranked & Leagues</h4>
      <p class="dim">Duels, Sumo and Team Rumble change your <b>rating</b>. Climb Bronze → Silver → Gold → Platinum → Diamond → <b>Legend</b>. Higher leagues face smarter, meaner opponent builds.</p></div>
    <div class="ed-panel"><h4>🧪 DNA & Growth</h4>
      <p class="dim">Every match pays DNA (win or lose — losing just pays less). Spend it on new parts and stable slots. Critters also earn XP, level up (small, capped bonuses) and pick <b>traits</b> at levels 3, 6 and 9. Your critter never dies — losses cost rating and rewards, never your creation.</p></div>
    <div class="ed-panel"><h4>🔥 The Gauntlet</h4>
      <p class="dim">A push-your-luck ladder of 10 fights. Each win banks DNA. Cash out to keep it all… or fight on. Lose, and half the bank scampers away.</p></div>
    <div class="ed-panel"><h4>🪐 Home Planets</h4>
      <p class="dim">Every critter hails from one of six worlds — pick in the Lab. Each grants a small, free tradeoff (Pyrion hits harder but bruises easier; Glaciem is armored but slow…) and battles on that world get its scenery.</p></div>
    <div class="ed-panel"><h4>🦵 Injuries</h4>
      <p class="dim">Take enough of a beating and <b>legs come off</b> — each lost leg slows you down, and the arena keeps the mess. Adjust the splatter style (goo, blood, or none) in Settings.</p></div>
    <div class="ed-panel"><h4>💀 Boneyard League</h4>
      <p class="dim">The opt-in permadeath ladder: triple DNA, streak bonuses — but lose once and that critter is <b>gone forever</b>, remembered only in the Graveyard. Only enter with a critter you're ready to mourn.</p></div>
    <div class="ed-panel"><h4>📺 The Circuit</h4>
      <p class="dim">Round-the-clock exhibition matches between wild critters. Watch live, study the odds (they're computed by actually simulating the matchup!), and stake DNA on your pick.</p></div>
    <div class="ed-panel"><h4>🌐 VS Friend</h4>
      <p class="dim">Battle friends online: one player hosts and shares a 4-letter code, the other joins. Both machines run the exact same deterministic battle — no lag, no server, just critters.</p></div>
  </div>`);
  container.appendChild(root);
  root.querySelector('#ht-back').onclick = () => { SFX.click(); nav.menu(); };
}

// ---------------- SETTINGS ----------------
export function showSettings(container, nav) {
  container.innerHTML = '';
  const st = G.settings;
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="se-back">← Back</button>
      <h1>Settings</h1>
    </div>
    <div class="ed-panel" style="max-width:560px">
      <div class="set-row"><label>Sound effects</label><input type="range" id="se-sfx" min="0" max="1" step="0.05" value="${st.sfx}"></div>
      <div class="set-row"><label>Music</label><input type="range" id="se-music" min="0" max="1" step="0.05" value="${st.music}"></div>
      <div class="set-row"><label>Default match speed</label>
        <div class="ed-tabs" style="margin:0">
          ${[1, 2, 4].map(s => `<button class="ed-tab ${st.speed === s ? 'on' : ''}" data-spd="${s}">${s}×</button>`).join('')}
        </div></div>
      <div class="set-row"><label>Battle mess (splatter)</label>
        <div class="ed-tabs" style="margin:0">
          ${[['goo', '🫧 Goo'], ['blood', '🩸 Blood'], ['off', '🚫 Off']].map(([v, l]) =>
            `<button class="ed-tab ${(st.gore || 'goo') === v ? 'on' : ''}" data-gore="${v}">${l}</button>`).join('')}
        </div></div>
      <div class="set-row"><label>Reset all progress</label><button class="btn small danger" id="se-reset">Reset save</button></div>
    </div>
    <p class="sub" style="margin-top:14px">Critterforge — a creature-building auto-battler. All critters are drawn procedurally from your design. 🧬</p>
  </div>`);
  container.appendChild(root);
  root.querySelector('#se-back').onclick = () => { SFX.click(); nav.menu(); };
  root.querySelector('#se-sfx').oninput = (e) => { st.sfx = parseFloat(e.target.value); setVolumes(st.sfx, st.music); save(); };
  root.querySelector('#se-sfx').onchange = () => SFX.hit();
  root.querySelector('#se-music').oninput = (e) => { st.music = parseFloat(e.target.value); setVolumes(st.sfx, st.music); save(); };
  root.querySelectorAll('[data-spd]').forEach(b => b.onclick = () => {
    st.speed = parseInt(b.dataset.spd); save(); SFX.click();
    root.querySelectorAll('[data-spd]').forEach(x => x.classList.toggle('on', parseInt(x.dataset.spd) === st.speed));
  });
  root.querySelectorAll('[data-gore]').forEach(b => b.onclick = () => {
    st.gore = b.dataset.gore; save(); SFX.splat();
    root.querySelectorAll('[data-gore]').forEach(x => x.classList.toggle('on', x.dataset.gore === st.gore));
  });
  root.querySelector('#se-reset').onclick = () => {
    confirmModal('Reset EVERYTHING?', 'All critters, DNA, rating and unlocks will be permanently deleted.', () => {
      hardReset(); toast('Save wiped. Fresh start!');
      nav.boot();
    }, 'Wipe it');
  };
}
