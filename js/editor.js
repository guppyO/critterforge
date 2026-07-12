// ============================================================
// The Lab: creature editor with live pen preview, budget bar,
// part pickers, appearance, validation.
// ============================================================
import { el, esc, clamp, rng, angTo, angDiff, lerp, dist, startLoop } from './util.js';
import { CATALOG, BODIES, LEGS, WEAPONS, ARMOR, ORGANS, BUDGET, PLANETS, budgetOf, validateDesign, deriveStats, displayStats } from './parts.js';
import { newCreature, DEFAULT_DESIGN } from './creature.js';
import { drawCreature } from './drawing.js';
import { G, save } from './league.js';
import { SFX } from './audio.js';
import { toast, confirmModal } from './ui-bits.js';

const PALETTES = [
  ['#f87171', '#7f1d1d'], ['#fb923c', '#7c2d12'], ['#facc15', '#713f12'], ['#4ade80', '#14532d'],
  ['#34d399', '#064e3b'], ['#22d3ee', '#164e63'], ['#60a5fa', '#1e3a8a'], ['#a78bfa', '#4c1d95'],
  ['#f472b6', '#831843'], ['#e879f9', '#701a75'], ['#94a3b8', '#1e293b'], ['#fde68a', '#92400e'],
];
const PATTERNS = ['spots', 'stripes', 'belly', 'none'];
const EYES = [['round', 'Round'], ['big', 'Big'], ['angry', 'Fierce']];

let penStop = null;

export function stopEditorLoop() { if (penStop) { penStop(); penStop = null; } }

export function renderEditor(container, { creatureId = null, onBack, onSaved }) {
  const existing = creatureId ? G.creatures.find(c => c.id === creatureId) : null;
  const design = existing ? JSON.parse(JSON.stringify(existing.design)) : DEFAULT_DESIGN();
  let name = existing ? existing.name : randomPetName();
  let tab = 'body';
  let demoAttack = null; // {id, t}

  container.innerHTML = '';
  const root = el(`<div class="screen-inner">
    <div class="sect-head">
      <button class="btn small" id="ed-back">← Back</button>
      <h1>${existing ? 'Modify' : 'Create'} Critter</h1>
      <div class="spacer"></div>
      <button class="btn small" id="ed-random">🎲 Randomize</button>
      <button class="btn primary" id="ed-save">${existing ? 'Save Changes' : 'Hatch Critter!'}</button>
    </div>
    <div class="editor">
      <div class="ed-col">
        <div class="ed-panel">
          <h4>Parts</h4>
          <div class="ed-tabs" id="ed-tabs"></div>
          <div class="ed-list" id="ed-list"></div>
        </div>
      </div>
      <div class="ed-col">
        <div class="ed-panel ed-pen">
          <canvas id="pen-canvas"></canvas>
          <div class="ed-namebar">
            <input type="text" id="ed-name" maxlength="16" placeholder="Name your critter…">
          </div>
        </div>
        <div class="ed-panel">
          <h4>Home Planet</h4>
          <div class="pattern-row" id="ed-planets"></div>
          <div class="slots-note" id="ed-planet-desc"></div>
        </div>
        <div class="ed-panel">
          <h4>Appearance</h4>
          <div class="color-row" id="ed-colors"></div>
          <div class="pattern-row" id="ed-patterns"></div>
          <div class="pattern-row" id="ed-eyes" style="margin-top:8px"></div>
          <div class="legs-row" style="margin-top:12px">
            <span class="dim" style="font-size:.82rem">Size</span>
            <input type="range" id="ed-size" min="0.85" max="1.25" step="0.05" style="flex:1">
            <b id="ed-size-val"></b>
          </div>
        </div>
      </div>
      <div class="ed-col">
        <div class="ed-panel">
          <h4>Bio-Budget</h4>
          <div class="budget-bar" id="ed-budget">
            <div class="budget-fill" id="ed-budget-fill"></div>
            <div class="budget-label" id="ed-budget-label"></div>
          </div>
          <div class="slots-note" id="ed-slots"></div>
          <div class="slots-note" id="ed-errors" style="color:var(--bad)"></div>
        </div>
        <div class="ed-panel">
          <h4>Combat Profile</h4>
          <div id="ed-bars"></div>
        </div>
        <div class="ed-panel">
          <h4>Vitals</h4>
          <div id="ed-vitals"></div>
        </div>
      </div>
    </div>
  </div>`);
  container.appendChild(root);

  const $ = (s) => root.querySelector(s);
  $('#ed-name').value = name;
  $('#ed-name').addEventListener('input', (e) => { name = e.target.value; });
  $('#ed-back').onclick = () => { SFX.click(); stopEditorLoop(); onBack(); };
  $('#ed-random').onclick = () => {
    SFX.click();
    randomizeDesign(design);
    name = randomPetName();
    $('#ed-name').value = name;
    refresh();
  };
  $('#ed-save').onclick = () => {
    const errs = validateDesign(design);
    if (errs.length) { SFX.deny(); toast(errs[0], true); return; }
    if (!name.trim()) { SFX.deny(); toast('Give your critter a name!', true); return; }
    if (existing) {
      existing.design = design; existing.name = name.trim();
      toast(`${esc(existing.name)} updated!`);
    } else {
      if (G.creatures.length >= G.slots) { SFX.deny(); toast(`Stable full! (${G.slots} slots — buy more in the Gene Shop)`, true); return; }
      const cre = newCreature(design, name.trim());
      G.creatures.push(cre);
      if (!G.activeId) G.activeId = cre.id;
      toast(`${esc(cre.name)} hatched! 🎉`);
    }
    SFX.buy();
    save();
    stopEditorLoop();
    onSaved();
  };

  // tabs
  const TABS = [['body', '🫘 Body'], ['legs', '🦵 Legs'], ['weapon', '⚔️ Weapons'], ['armor', '🛡️ Armor'], ['organ', '❤️ Organs']];
  const tabsEl = $('#ed-tabs');
  for (const [id, label] of TABS) {
    const b = el(`<button class="ed-tab" data-tab="${id}">${label}</button>`);
    b.onclick = () => { SFX.click(); tab = id; refresh(); };
    tabsEl.appendChild(b);
  }

  // size slider
  $('#ed-size').value = design.size;
  $('#ed-size').addEventListener('input', (e) => { design.size = parseFloat(e.target.value); refresh(false); });

  function refresh(rebuildList = true) {
    // tabs highlight
    tabsEl.querySelectorAll('.ed-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (rebuildList) buildList();
    buildAppearance();
    buildStats();
    $('#ed-size-val').textContent = design.size.toFixed(2) + '×';
  }

  function buildList() {
    const list = $('#ed-list');
    list.innerHTML = '';
    const tbl = CATALOG[tab];
    if (tab === 'legs') {
      // pairs stepper on top
      const row = el(`<div class="legs-row" style="margin-bottom:6px">
        <span class="dim" style="font-size:.82rem">Leg pairs</span>
        <div class="stepper">
          <button id="lp-minus">−</button><span id="lp-val">${design.legs.pairs} pair${design.legs.pairs > 1 ? 's' : ''}</span><button id="lp-plus">+</button>
        </div></div>`);
      list.appendChild(row);
      row.querySelector('#lp-minus').onclick = () => { if (design.legs.pairs > 1) { design.legs.pairs--; SFX.click(); refresh(); } };
      row.querySelector('#lp-plus').onclick = () => { if (design.legs.pairs < 4) { design.legs.pairs++; SFX.click(); refresh(); } };
    }
    for (const [id, p] of Object.entries(tbl)) {
      const key = tab + ':' + id;
      const owned = G.unlocked.includes(key);
      const selected =
        tab === 'body' ? design.body === id :
        tab === 'legs' ? design.legs.type === id :
        tab === 'weapon' ? design.weapons.includes(id) :
        tab === 'armor' ? design.armor.includes(id) :
        design.organs.includes(id);
      const costTxt = tab === 'legs' ? `${p.costPerPair}/pair` : `${p.cost} pts`;
      const card = el(`<div class="card part-card clicky ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}">
        <div class="pc-icon">${owned ? p.icon : '🔒'}</div>
        <div class="pc-body">
          <div class="pc-name">${p.name} ${selected && (tab === 'weapon' || tab === 'armor' || tab === 'organ') ? '✓' : ''}</div>
          <div class="pc-desc">${p.desc}</div>
        </div>
        <div class="pc-cost">${owned ? costTxt : '🧪 ' + p.unlock}</div>
      </div>`);
      card.onclick = () => {
        if (!owned) {
          if (G.dna >= p.unlock) {
            confirmModal(`Unlock ${p.name}?`, `Spend <b style="color:var(--dna)">${p.unlock} 🧪 DNA</b> to permanently unlock this part for all your critters?`, () => {
              G.dna -= p.unlock;
              G.unlocked.push(key);
              save(); SFX.buy();
              toast(`${p.name} unlocked!`);
              applyPart(id);
              refresh();
              window.dispatchEvent(new Event('dna-changed'));
            });
          } else { SFX.deny(); toast(`Need ${p.unlock} 🧪 DNA — earn more in matches!`, true); }
          return;
        }
        applyPart(id);
        refresh();
      };
      list.appendChild(card);
    }
  }

  function applyPart(id) {
    SFX.click();
    if (tab === 'body') {
      design.body = id;
      // trim overflowing slots
      const b = BODIES[id];
      if (design.weapons.length > b.weaponSlots) { design.weapons = design.weapons.slice(0, b.weaponSlots); toast('Extra weapons removed (fewer slots on this body).'); }
      if (design.organs.length > b.organSlots) { design.organs = design.organs.slice(0, b.organSlots); toast('Extra organs removed.'); }
      if (design.armor.length > b.armorSlots) { design.armor = design.armor.slice(0, b.armorSlots); toast('Extra armor removed.'); }
    } else if (tab === 'legs') {
      design.legs.type = id;
    } else if (tab === 'weapon') {
      const i = design.weapons.indexOf(id);
      if (i >= 0) design.weapons.splice(i, 1);
      else {
        if (design.weapons.length >= BODIES[design.body].weaponSlots) { SFX.deny(); toast(`No free weapon slots (${BODIES[design.body].weaponSlots} max on this body).`, true); return; }
        design.weapons.push(id);
        demoAttack = { id, t: 0, kind: WEAPONS[id].atk.kind };
      }
    } else if (tab === 'armor') {
      const i = design.armor.indexOf(id);
      if (i >= 0) design.armor.splice(i, 1);
      else {
        if (design.armor.length >= BODIES[design.body].armorSlots) { SFX.deny(); toast(`No free armor slots.`, true); return; }
        design.armor.push(id);
      }
    } else {
      const i = design.organs.indexOf(id);
      if (i >= 0) design.organs.splice(i, 1);
      else {
        if (design.organs.length >= BODIES[design.body].organSlots) { SFX.deny(); toast(`No free organ slots.`, true); return; }
        design.organs.push(id);
      }
    }
  }

  function buildAppearance() {
    const cr = $('#ed-colors'); cr.innerHTML = '';
    for (const [a, b] of PALETTES) {
      const s = el(`<div class="swatch ${design.colors.a === a ? 'on' : ''}" style="background:linear-gradient(135deg,${a} 55%,${b} 55%)"></div>`);
      s.onclick = () => { design.colors = { a, b }; SFX.click(); refresh(false); };
      cr.appendChild(s);
    }
    const pr = $('#ed-patterns'); pr.innerHTML = '';
    for (const p of PATTERNS) {
      const b = el(`<button class="pat-btn ${design.pattern === p ? 'on' : ''}">${p}</button>`);
      b.onclick = () => { design.pattern = p; SFX.click(); refresh(false); };
      pr.appendChild(b);
    }
    const er = $('#ed-eyes'); er.innerHTML = '';
    for (const [id, label] of EYES) {
      const b = el(`<button class="pat-btn ${design.eyes === id ? 'on' : ''}">👀 ${label}</button>`);
      b.onclick = () => { design.eyes = id; SFX.click(); refresh(false); };
      er.appendChild(b);
    }
    const pl = $('#ed-planets'); pl.innerHTML = '';
    const cur = design.planet || 'meridian';
    for (const [id, p] of Object.entries(PLANETS)) {
      const b = el(`<button class="pat-btn ${cur === id ? 'on' : ''}">${p.icon} ${p.name}</button>`);
      b.onclick = () => { design.planet = id; SFX.click(); refresh(false); };
      pl.appendChild(b);
    }
    $('#ed-planet-desc').textContent = (PLANETS[cur] || PLANETS.meridian).desc;
  }

  function buildStats() {
    const cost = budgetOf(design);
    const over = cost > BUDGET;
    $('#ed-budget').classList.toggle('budget-over', over);
    $('#ed-budget-fill').style.width = clamp(cost / BUDGET * 100, 0, 100) + '%';
    $('#ed-budget-label').textContent = `${cost} / ${BUDGET} pts${over ? ' — OVER BUDGET!' : ''}`;
    const b = BODIES[design.body];
    $('#ed-slots').textContent = `Slots — weapons ${design.weapons.length}/${b.weaponSlots} · armor ${design.armor.length}/${b.armorSlots} · organs ${design.organs.length}/${b.organSlots}`;
    const errs = validateDesign(design);
    $('#ed-errors').textContent = errs.join(' ');

    const lvl = existing ? existing.level : 1;
    const traits = existing ? existing.traits : [];
    const ds = displayStats(design, lvl, traits);
    const bars = $('#ed-bars'); bars.innerHTML = '';
    for (const [k, v] of Object.entries(ds)) {
      bars.appendChild(el(`<div>
        <div class="statline"><span>${k}</span><b>${Math.round(v * 100)}</b></div>
        <div class="statbar"><i style="width:${Math.round(v * 100)}%"></i></div>
      </div>`));
    }
    const s = deriveStats(design, lvl, traits);
    const vit = $('#ed-vitals'); vit.innerHTML = '';
    const rows = [
      ['Health', s.hp], ['Armor', Math.round(s.armor)], ['Speed', Math.round(s.speed)],
      ['Stamina', Math.round(s.stamMax)], ['Mass', Math.round(s.mass)],
      ['Crit', Math.round(s.crit * 100) + '%'], ['Dodge', Math.round(s.dodge * 100) + '%'],
      ['Regen', s.regen ? s.regen.toFixed(1) + '/s' : '—'],
    ];
    for (const [k, v] of rows) vit.appendChild(el(`<div class="statline"><span>${k}</span><b>${v}</b></div>`));
  }

  // ---------- pen preview loop ----------
  const pen = $('#pen-canvas');
  const pctx = pen.getContext('2d');
  const pr = rng(12345);
  const pet = { x: 200, y: 150, ang: 0, walkPhase: 0, moveAmt: 0, tx: 260, ty: 160, blinkT: 2 };
  let lastT = performance.now();

  function penLoop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const dpr = window.devicePixelRatio || 1;
    const w = pen.clientWidth, h = pen.clientHeight;
    if (!w) return;
    const tw = Math.round(w * dpr), th = Math.round(h * dpr);
    if (pen.width !== tw) { pen.width = tw; pen.height = th; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);

    // wander
    const stats = deriveStats(design, existing ? existing.level : 1, existing ? existing.traits : []);
    if (dist(pet.x, pet.y, pet.tx, pet.ty) < 40 || pr() < dt * 0.25) {
      pet.tx = 80 + pr() * (w - 160); pet.ty = 70 + pr() * (h - 140);
    }
    const want = angTo(pet.x, pet.y, pet.tx, pet.ty);
    pet.ang += clamp(angDiff(pet.ang, want), -stats.turn * dt, stats.turn * dt);
    const sp = stats.speed * 0.45;
    pet.x += Math.cos(pet.ang) * sp * dt;
    pet.y += Math.sin(pet.ang) * sp * dt;
    pet.walkPhase += dt * (2.5 + sp * 0.06);
    pet.moveAmt = lerp(pet.moveAmt, 0.8, dt * 4);
    pet.blinkT -= dt; if (pet.blinkT < -0.12) pet.blinkT = 2 + pr() * 3;

    // demo attack animation
    let atkPose = null;
    if (demoAttack) {
      demoAttack.t += dt * 1.6;
      if (demoAttack.t >= 1) demoAttack = null;
      else atkPose = demoAttack;
    }

    // pen floor
    pctx.strokeStyle = 'rgba(255,255,255,.07)';
    pctx.lineWidth = 2;
    pctx.beginPath(); pctx.ellipse(w / 2, h / 2 + 8, w * 0.42, h * 0.36, 0, 0, 7); pctx.stroke();

    drawCreature(pctx, design, stats, {
      x: pet.x, y: pet.y, ang: pet.ang, walkPhase: pet.walkPhase, moveAmt: pet.moveAmt,
      attack: atkPose, hurt: 0, blink: pet.blinkT < 0,
    }, {});
  }
  stopEditorLoop();
  penStop = startLoop(penLoop);

  refresh();
}

// random valid design from unlocked parts
export function randomizeDesign(design) {
  const r = rng(Math.floor(Math.random() * 1e9));
  const has = (cat, id) => G.unlocked.includes(cat + ':' + id);
  const bodies = Object.keys(BODIES).filter(b => has('body', b));
  const legs = Object.keys(LEGS).filter(l => has('legs', l));
  design.body = bodies[Math.floor(r() * bodies.length)];
  design.legs = { type: legs[Math.floor(r() * legs.length)], pairs: 1 + Math.floor(r() * 3) };
  design.weapons = []; design.armor = []; design.organs = [];
  const b = BODIES[design.body];
  const ws = Object.keys(WEAPONS).filter(w => has('weapon', w));
  const as = Object.keys(ARMOR).filter(a => has('armor', a));
  const os = Object.keys(ORGANS).filter(o => has('organ', o));
  // greedily add parts while under budget
  design.weapons.push(ws[Math.floor(r() * ws.length)]);
  const tryAdd = (arr, pool, max) => {
    const cand = pool[Math.floor(r() * pool.length)];
    if (!arr.includes(cand) && arr.length < max) {
      arr.push(cand);
      if (budgetOf(design) > BUDGET) arr.pop();
    }
  };
  for (let i = 0; i < 8; i++) {
    const roll = r();
    if (roll < 0.33) tryAdd(design.weapons, ws, b.weaponSlots);
    else if (roll < 0.6) tryAdd(design.armor, as, b.armorSlots);
    else tryAdd(design.organs, os, b.organSlots);
  }
  while (budgetOf(design) > BUDGET && design.legs.pairs > 1) design.legs.pairs--;
  design.size = 0.85 + Math.round(r() * 8) * 0.05;
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  design.colors = { a: pal[0], b: pal[1] };
  design.pattern = PATTERNS[Math.floor(r() * PATTERNS.length)];
  design.eyes = ['round', 'big', 'angry'][Math.floor(r() * 3)];
  const planetIds = Object.keys(PLANETS);
  design.planet = planetIds[Math.floor(r() * planetIds.length)];
}

const PET_A = ['Boop', 'Ziggy', 'Munch', 'Pebble', 'Waffle', 'Turbo', 'Noodle', 'Biscuit', 'Gadget', 'Pickle', 'Sprout', 'Rocket', 'Mochi', 'Bumble', 'Chomper', 'Dizzy'];
const PET_B = ['', '', ' Jr.', 'zilla', 'ston', 'bert', 'ina', 'ple', 'doodle', 'sworth'];
export function randomPetName() {
  const a = PET_A[Math.floor(Math.random() * PET_A.length)];
  const b = PET_B[Math.floor(Math.random() * PET_B.length)];
  return (a + b).slice(0, 16);
}
