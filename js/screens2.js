// ============================================================
// Screens: Boneyard League (permadeath) + Graveyard,
// The Circuit (spectate & bet), VS Friend (online lobby).
// ============================================================
import { el, esc, fmt } from './util.js';
import { G, save, BONEYARD_WIN_DNA, BONEYARD_STREAK_BONUS } from './league.js';
import { statsOf } from './creature.js';
import { PLANETS } from './parts.js';
import { renderCreatureCard } from './drawing.js';
import { SFX } from './audio.js';
import { toast, confirmModal } from './ui-bits.js';

// ---------------- BONEYARD ----------------
export function showBoneyard(container, nav) {
  container.innerHTML = '';
  const active = G.creatures.find(c => c.id === G.activeId) || G.creatures[0];
  const by = G.boneyard;
  const bonuses = Object.entries(BONEYARD_STREAK_BONUS).map(([k, v]) => `${k} wins → +${v}`).join(' · ');

  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="by-back">← Back</button>
      <h1>💀 Boneyard League</h1>
      <div class="spacer"></div>
      <div class="dim">Streak: <b style="color:var(--acc2)">${by.streak}</b> · Best: ${by.best}</div>
    </div>
    <div class="ed-panel" style="border-color:rgba(255,107,129,.4)">
      <h4 style="color:var(--bad)">⚠ The one rule of the Boneyard</h4>
      <p class="dim" style="line-height:1.6">Win and earn <b style="color:var(--dna)">${BONEYARD_WIN_DNA} 🧪</b> per fight — triple the usual — plus streak bonuses (${bonuses}).
      Lose, and your critter <b style="color:var(--bad)">dies forever</b>. No rebuilds. No refunds. Only a gravestone.</p>
    </div>
    ${active ? `
    <div class="ed-panel" style="max-width:460px;margin-top:14px">
      <h4>Challenger</h4>
      <canvas class="cc-canvas" id="by-canvas"></canvas>
      <div style="font-weight:800;font-size:1.1rem;margin-top:6px">⭐ ${esc(active.name)}
        <span class="badge lvl">LV ${active.level}</span>
        <span class="badge">${(PLANETS[active.design.planet] || PLANETS.meridian).icon} ${(PLANETS[active.design.planet] || PLANETS.meridian).name}</span>
      </div>
      <div class="modal-btns" style="justify-content:flex-start">
        <button class="btn danger" id="by-fight">💀 Fight in the Boneyard</button>
      </div>
    </div>` : `<p class="sub" style="margin-top:14px">You need a critter first. (A living one.)</p>`}
    <div style="margin-top:26px">
      <h3 style="margin-bottom:10px">🪦 Graveyard</h3>
      ${G.graveyard.length === 0 ? '<p class="dim">No fallen heroes yet. The Boneyard is patient.</p>' : ''}
      <div class="grid cols3" id="by-graves"></div>
    </div>
  </div>`);
  container.appendChild(root);
  root.querySelector('#by-back').onclick = () => { SFX.click(); nav.modes(); };
  if (active) {
    requestAnimationFrame(() => renderCreatureCard(root.querySelector('#by-canvas'), active.design, statsOf(active)));
    root.querySelector('#by-fight').onclick = () => {
      confirmModal(`Send ${esc(active.name)} to the Boneyard?`,
        `If they lose — by knockout, ring-out or judges — they are <b style="color:var(--bad)">gone forever</b>. Their level ${active.level}, their ${active.wins} wins, everything.<br><br>Triple rewards if they survive. Are you sure?`,
        () => nav.boneyardFight(), 'To the Boneyard 💀');
    };
  }
  const graves = root.querySelector('#by-graves');
  for (const g of G.graveyard) {
    const p = PLANETS[g.planet] || PLANETS.meridian;
    graves.appendChild(el(`<div class="card" style="border-color:rgba(255,255,255,.06)">
      <div style="font-size:1.6rem">🪦</div>
      <h3>${esc(g.name)}</h3>
      <div class="cc-badges">
        <span class="badge lvl">LV ${g.level}</span>
        <span class="badge wl">${g.wins}W–${g.losses}L</span>
        <span class="badge">${p.icon} ${p.name}</span>
        ${g.streak > 0 ? `<span class="badge" style="color:var(--acc2)">☠ streak ${g.streak}</span>` : ''}
      </div>
      <div class="dim" style="margin-top:8px;font-style:italic">“${esc(g.epitaph)}”</div>
      <div class="dim" style="margin-top:4px;font-size:.72rem">${new Date(g.diedAt).toLocaleDateString()}</div>
    </div>`));
  }
}

// ---------------- THE CIRCUIT ----------------
// matchup: {a, b, odds:[mA, mB], pA}
export function showCircuit(container, nav, matchup) {
  container.innerHTML = '';
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="ci-back">← Back</button>
      <h1>📺 The Circuit</h1>
      <div class="spacer"></div>
      <div class="tb-chip dna">🧪 <span>${fmt(G.dna)}</span></div>
    </div>
    <p class="sub">Tonight's exhibition bout — two wild critters, one winner. Back a fighter with DNA or just enjoy the show.
      <span class="dim">(Record: ${G.stats.betsWon}W–${G.stats.betsLost}L, ${G.stats.betProfit >= 0 ? '+' : ''}${fmt(G.stats.betProfit)} 🧪 lifetime)</span></p>
    <div style="display:flex;gap:14px;align-items:stretch;flex-wrap:wrap">
      ${['a', 'b'].map((side, i) => {
        const c = matchup[side];
        const p = PLANETS[c.design.planet] || PLANETS.meridian;
        return `<div class="card" style="flex:1;min-width:260px">
          <canvas class="cc-canvas" id="ci-cv-${side}"></canvas>
          <h3>${esc(c.name)}</h3>
          <div class="cc-badges">
            <span class="badge lvl">LV ${c.level}</span>
            <span class="badge wl">${c.wins}W–${c.losses}L</span>
            <span class="badge">${p.icon} ${p.name}</span>
          </div>
          <div style="margin-top:10px;font-size:1.3rem;font-weight:900;color:var(--acc2)">pays ${matchup.odds[i].toFixed(2)}×</div>
          <button class="btn gold" style="width:100%;margin-top:10px" data-back="${i}">💰 Back ${esc(c.name.split(' ')[0])}</button>
        </div>`;
      }).join('<div style="align-self:center;font-size:1.8rem;font-weight:900;color:var(--acc2)">VS</div>')}
    </div>
    <div class="ed-panel" style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="dim">Stake:</span>
      ${[25, 50, 100, 250].map(v => `<button class="ed-tab stake" data-stake="${v}">${v} 🧪</button>`).join('')}
      <div class="spacer" style="flex:1"></div>
      <button class="btn" id="ci-watch">🎬 Just watch (no bet)</button>
      <button class="btn small" id="ci-next">↻ New matchup</button>
    </div>
  </div>`);
  container.appendChild(root);

  let stake = 50;
  const stakes = root.querySelectorAll('.stake');
  const setStake = (v) => { stake = v; stakes.forEach(x => x.classList.toggle('on', parseInt(x.dataset.stake) === v)); };
  setStake(50);
  stakes.forEach(b => b.onclick = () => { SFX.tick(); setStake(parseInt(b.dataset.stake)); });

  requestAnimationFrame(() => {
    renderCreatureCard(root.querySelector('#ci-cv-a'), matchup.a.design, statsOf(matchup.a));
    renderCreatureCard(root.querySelector('#ci-cv-b'), matchup.b.design, statsOf(matchup.b));
  });

  root.querySelector('#ci-back').onclick = () => { SFX.click(); nav.modes(); };
  root.querySelector('#ci-next').onclick = () => { SFX.click(); nav.circuit(); };
  root.querySelector('#ci-watch').onclick = () => { SFX.click(); nav.circuitWatch(matchup, -1, 0); };
  root.querySelectorAll('[data-back]').forEach(b => b.onclick = () => {
    const side = parseInt(b.dataset.back);
    if (G.dna < stake) { SFX.deny(); toast('Not enough DNA for that stake!', true); return; }
    SFX.coin();
    nav.circuitWatch(matchup, side, stake);
  });
}

// ---------------- VS FRIEND (link lobby) ----------------
export function showLink(container, nav) {
  container.innerHTML = '';
  const active = G.creatures.find(c => c.id === G.activeId) || G.creatures[0];
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="lk-back">← Back</button>
      <h1>🌐 VS Friend</h1>
      <div class="spacer"></div>
      <div class="dim">Friendlies: ${G.stats.friendWins}W–${G.stats.friendLosses}L</div>
    </div>
    ${!active ? '<p class="sub">You need a critter first — hit the Lab!</p>' : `
    <p class="sub">Battle a friend over the internet. One of you hosts and shares the 4-letter code; the other joins. Your champion: <b>⭐ ${esc(active.name)}</b>${G.creatures.length > 1 ? ' (Tag Duo adds your next-best critter)' : ''}.</p>
    <div class="ed-panel" style="max-width:520px">
      <h4>Your trainer name</h4>
      <div class="ed-namebar" style="margin-top:4px">
        <input type="text" id="lk-name" maxlength="14" placeholder="e.g. MaxThunder" value="${esc(G.playerName || '')}">
      </div>
    </div>
    <div class="grid cols3" style="margin-top:14px;max-width:760px">
      <div class="card mode-card"><div class="mc-emoji">🏠</div><h3>Host a battle</h3>
        <p>Pick the mode, create a room, send the code.</p>
        <div class="pattern-row" style="margin-top:8px">
          <button class="pat-btn on" data-lmode="duel">⚔️ Duel</button>
          <button class="pat-btn" data-lmode="sumo">🟡 Sumo</button>
          <button class="pat-btn" data-lmode="race">🏁 Race</button>
          <button class="pat-btn" data-lmode="team">👥 Tag Duo</button>
        </div>
        <button class="btn primary" style="width:100%;margin-top:10px" id="lk-host">Create room</button>
      </div>
      <div class="card mode-card"><div class="mc-emoji">🔗</div><h3>Join a battle</h3>
        <p>Got a code? Punch it in.</p>
        <div class="ed-namebar" style="margin-top:8px">
          <input type="text" id="lk-code" maxlength="4" placeholder="CODE" style="text-transform:uppercase;text-align:center;letter-spacing:6px;font-size:1.2rem">
        </div>
        <button class="btn primary" style="width:100%;margin-top:10px" id="lk-join">Join room</button>
      </div>
    </div>
    <p class="dim" style="margin-top:14px;font-size:.8rem">Connection is peer-to-peer (WebRTC). Both players need this page open at the same time. Results count toward your friendly record — no ranked rating at stake.</p>
    `}
  </div>`);
  container.appendChild(root);
  root.querySelector('#lk-back').onclick = () => { SFX.click(); nav.menu(); };
  if (!active) return;
  const nameInput = root.querySelector('#lk-name');
  nameInput.addEventListener('input', () => { G.playerName = nameInput.value.slice(0, 14); save(); });
  let hostMode = 'duel';
  root.querySelectorAll('[data-lmode]').forEach(b => b.onclick = () => {
    SFX.click();
    hostMode = b.dataset.lmode;
    root.querySelectorAll('[data-lmode]').forEach(x => x.classList.toggle('on', x.dataset.lmode === hostMode));
  });
  root.querySelector('#lk-host').onclick = () => { SFX.click(); nav.linkHost(hostMode); };
  root.querySelector('#lk-join').onclick = () => {
    const code = root.querySelector('#lk-code').value.trim().toUpperCase();
    if (code.length !== 4) { SFX.deny(); toast('Codes are 4 letters, like KRZT', true); return; }
    SFX.click();
    nav.linkJoin(code);
  };
}
