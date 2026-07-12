// ============================================================
// Parts catalog + stat derivation.
// BALANCE CORE: every part costs Bio-Budget points; all creatures
// must fit in BUDGET. Power is a design tradeoff, not a grind.
// ============================================================
export const BUDGET = 100;

// ---------- home planets ----------
// Every critter hails from one of six worlds. Planets are a free choice
// (no budget cost) of small, balanced tradeoffs + a visual identity.
export const PLANETS = {
  meridian:  { name: 'Meridian',  icon: '🪐', desc: 'The neutral trade world. No strengths, no weaknesses.',
               mod: {}, arena: { floorA: '#26355e', floorB: '#141d38', wall: '#3b4d85', accent: 'rgba(94,234,212,.25)', ambient: 'dust' } },
  verdantia: { name: 'Verdantia', icon: '🌿', desc: 'Overgrown jungle world. Life finds a way: +1.2 regen, −4% speed.',
               mod: { regen: 1.2, speedMul: 0.96 }, arena: { floorA: '#1d4028', floorB: '#0d2114', wall: '#2e6b3e', accent: 'rgba(122,220,140,.3)', ambient: 'leaves' } },
  pyrion:    { name: 'Pyrion',    icon: '🌋', desc: 'Volcanic furnace world. Hot-blooded: +6% damage, −6% health.',
               mod: { dmgMul: 1.06, hpMul: 0.94 }, arena: { floorA: '#4a2019', floorB: '#220d0a', wall: '#7a3222', accent: 'rgba(255,140,80,.35)', ambient: 'embers' } },
  glaciem:   { name: 'Glaciem',   icon: '❄️', desc: 'Frozen tundra world. Thick-skinned: +8 armor, −4% speed.',
               mod: { armor: 8, speedMul: 0.96 }, arena: { floorA: '#274a63', floorB: '#122736', wall: '#3e6f8f', accent: 'rgba(180,230,255,.35)', ambient: 'snow' } },
  zephyros:  { name: 'Zephyros',  icon: '🌪️', desc: 'Endless storm plains. Wind-born: +5% speed, −5% health.',
               mod: { speedMul: 1.05, hpMul: 0.95 }, arena: { floorA: '#3d3a55', floorB: '#1c1a2e', wall: '#5b568a', accent: 'rgba(200,190,255,.3)', ambient: 'wind' } },
  umbra:     { name: 'Umbra',     icon: '🌑', desc: 'The lightless deep. Strikes unseen: +5% crit, +3% dodge, −6% health.',
               mod: { crit: 0.05, dodge: 0.03, hpMul: 0.94 }, arena: { floorA: '#231b33', floorB: '#0e0a18', wall: '#463263', accent: 'rgba(192,132,252,.3)', ambient: 'stars' } },
};

export const BODIES = {
  pod:      { name:'Pod Body',    icon:'🫘', cost:10, unlock:0,   hp:100, mass:10, weaponSlots:2, organSlots:2, armorSlots:2, speedMul:1.0,  turnMul:1.0,  dmgMul:1.0,
              desc:'The all-rounder chassis. Two weapon and two organ slots.' },
  wisp:     { name:'Wisp Body',   icon:'🪶', cost:6,  unlock:0,   hp:82,  mass:7,  weaponSlots:1, organSlots:2, armorSlots:1, speedMul:1.22, turnMul:1.25, dmgMul:1.15, dodge:0.06,
              desc:'Featherweight frame. Fragile but vicious, quick and hard to hit.' },
  tank:     { name:'Tank Body',   icon:'🪨', cost:22, unlock:150, hp:150, mass:16, weaponSlots:2, organSlots:2, armorSlots:2, speedMul:0.9,  turnMul:0.85, dmgMul:0.75,
              desc:'A slab of muscle. Huge health pool, but ponderous and soft-hitting.' },
  longback: { name:'Longback',    icon:'🐛', cost:14, unlock:200, hp:110, mass:12, weaponSlots:3, organSlots:1, armorSlots:1, speedMul:0.97, turnMul:0.95, dmgMul:1.03,
              desc:'Extended spine fits a third weapon at the cost of organ space.' },
};

export const LEGS = {
  scuttler: { name:'Scuttler Legs', icon:'🕷️', costPerPair:4, unlock:0,   speed:1.0,  accel:1.15, mass:1.0, turn:1.05, kbRes:0,
              desc:'Skittery and light. Great acceleration.' },
  springer: { name:'Springer Legs', icon:'🦗', costPerPair:5, unlock:0,   speed:0.92, accel:1.0,  mass:1.2, turn:1.0,  kbRes:0, lunge:true,
              desc:'Coiled for pouncing — unlocks a lunge that closes distance fast.' },
  stomper:  { name:'Stomper Legs',  icon:'🦏', costPerPair:7, unlock:120, speed:0.78, accel:0.85, mass:2.0, turn:0.9,  kbRes:0.35,
              desc:'Planted like tree trunks. Very hard to shove around.' },
  strider:  { name:'Strider Legs',  icon:'🦩', costPerPair:5, unlock:140, speed:1.22, accel:0.9,  mass:1.4, turn:0.85, kbRes:0,
              desc:'Long and loping. Top speed champion, wide turning circle.' },
};

export const WEAPONS = {
  jaw:      { name:'Snapper Jaw',  icon:'🦷', cost:12, unlock:0,   desc:'Reliable bite. Quick cooldown, honest damage.',
              atk:{ kind:'melee', dmg:10, cd:0.9, range:1.15, arc:1.1, stam:6,  kb:90 } },
  crusher:  { name:'Crusher Jaw',  icon:'🦈', cost:20, unlock:220, desc:'Slow, bone-rattling chomp with heavy knockback.',
              atk:{ kind:'melee', dmg:26, cd:1.9, range:1.2,  arc:1.0, stam:13, kb:220 } },
  horn:     { name:'Ram Horn',     icon:'🦬', cost:14, unlock:180, desc:'Charge attack — damage scales with your speed on impact.',
              atk:{ kind:'ram',   dmg:16, cd:2.0, range:3.2,  arc:0.5, stam:11, kb:260 } },
  tailwhip: { name:'Whip Tail',    icon:'🦎', cost:10, unlock:0,   desc:'Sweeping strike; hits +60% harder right after you take a hit.',
              atk:{ kind:'melee', dmg:7,  cd:1.1, range:1.3,  arc:2.4, stam:5,  kb:120, counter:0.6 } },
  spitter:  { name:'Glob Spitter', icon:'💧', cost:16, unlock:260, desc:'Lobs sticky globs from a distance. Kiting tool.',
              atk:{ kind:'ranged',dmg:11, cd:1.3, range:5.6,  arc:0.4, stam:8,  kb:40, projSpeed:460 } },
  stinger:  { name:'Venom Sting',  icon:'🦂', cost:15, unlock:240, desc:'Small hit, big problem: venom deals damage over time.',
              atk:{ kind:'melee', dmg:5,  cd:1.3, range:1.2,  arc:1.0, stam:7,  kb:60, poison:{dps:4.0, dur:3.6} } },
  pincer:   { name:'Pincer Claw',  icon:'🦀', cost:13, unlock:160, desc:'Crushing grip briefly slows whatever it catches.',
              atk:{ kind:'melee', dmg:9,  cd:0.85,range:1.1,  arc:0.9, stam:6,  kb:70, slow:{mul:0.6, dur:1.4} } },
};

export const ARMOR = {
  chitin: { name:'Chitin Plates', icon:'🛡️', cost:8,  unlock:0,   armor:15, mass:2, speedMul:1.0,  reflect:0,
            desc:'Light overlapping plates. Cheap, dependable protection.' },
  shell:  { name:'Heavy Shell',   icon:'🐢', cost:20, unlock:200, armor:32, mass:6, speedMul:0.88, reflect:0,
            desc:'A fortress on your back. Serious armor, serious weight.' },
  spikes: { name:'Spike Coat',    icon:'🦔', cost:12, unlock:180, armor:8,  mass:2, speedMul:1.0,  reflect:0.12,
            desc:'Attackers regret it: reflects part of melee damage taken.' },
};

export const ORGANS = {
  heart:   { name:'Big Heart',     icon:'❤️', cost:10, unlock:0,   desc:'Regenerates health steadily through the fight.',        mod:{ regen:2.0 } },
  fat:     { name:'Fat Reserves',  icon:'🧈', cost:8,  unlock:0,   desc:'Extra padding: +25 max health, a little extra weight.', mod:{ hpAdd:25, massAdd:2 } },
  lungs:   { name:'Bellows Lungs', icon:'🫁', cost:8,  unlock:100, desc:'Bigger tank: +40% stamina and faster stamina recovery.',mod:{ stamMul:1.4, stamRegenMul:1.4 } },
  adrenal: { name:'Adrenal Gland', icon:'⚡', cost:12, unlock:220, desc:'Below 35% health: +25% damage and +15% speed. Rage!',   mod:{ rage:true } },
  eyes:    { name:'Keen Eyes',     icon:'👁️', cost:6,  unlock:120, desc:'Spot weak points: +8% critical hit chance.',            mod:{ crit:0.08 } },
  frenzy:  { name:'Frenzy Core',   icon:'🔥', cost:14, unlock:300, desc:'Attacks recharge 18% faster. Pure aggression.',         mod:{ cdMul:0.82 } },
  gyro:    { name:'Gyro Organ',    icon:'🌀', cost:9,  unlock:140, desc:'Uncanny balance: +6% dodge and sharper turning.',       mod:{ dodge:0.06, turnMul:1.15 } },
};

export const CATALOG = { body: BODIES, legs: LEGS, weapon: WEAPONS, armor: ARMOR, organ: ORGANS };
export const FREE_PARTS = [];
for (const [cat, tbl] of Object.entries(CATALOG))
  for (const [id, p] of Object.entries(tbl))
    if (!p.unlock) FREE_PARTS.push(cat + ':' + id);

// ---------- budget ----------
export function budgetOf(d) {
  let c = BODIES[d.body].cost + LEGS[d.legs.type].costPerPair * d.legs.pairs;
  for (const w of d.weapons) c += WEAPONS[w].cost;
  for (const a of d.armor) c += ARMOR[a].cost;
  for (const o of d.organs) c += ORGANS[o].cost;
  return c;
}

export function validateDesign(d) {
  const errs = [];
  const b = BODIES[d.body];
  if (!b) errs.push('No body selected.');
  else {
    if (d.weapons.length < 1) errs.push('Needs at least one weapon.');
    if (d.weapons.length > b.weaponSlots) errs.push(`Too many weapons (max ${b.weaponSlots} on this body).`);
    if (d.organs.length > b.organSlots) errs.push(`Too many organs (max ${b.organSlots} on this body).`);
    if (d.armor.length > b.armorSlots) errs.push(`Too much armor (max ${b.armorSlots} on this body).`);
  }
  if (d.legs.pairs < 1 || d.legs.pairs > 4) errs.push('Legs: 1–4 pairs.');
  if (budgetOf(d) > BUDGET) errs.push(`Over Bio-Budget (${budgetOf(d)}/${BUDGET}).`);
  return errs;
}

// ---------- stat derivation ----------
// R (creature radius in world units) ~ 26 * size. Ranges are in radii.
export function deriveStats(d, level = 1, traits = []) {
  const b = BODIES[d.body], lg = LEGS[d.legs.type];
  const size = d.size || 1;
  const T = (id) => traits.includes(id);
  const P = (PLANETS[d.planet] || PLANETS.meridian).mod;

  let mass = b.mass * Math.pow(size, 1.8) + lg.mass * d.legs.pairs;
  let hp = b.hp * Math.pow(size, 1.5) * (P.hpMul || 1);
  let armor = P.armor || 0, reflect = 0, speedMul = b.speedMul * (P.speedMul || 1),
      regen = P.regen || 0, crit = 0.03 + (P.crit || 0), dodge = 0.02 + (b.dodge || 0) + (P.dodge || 0);
  let stamMax = 100, stamRegen = 19, cdMul = 1, rage = false, turnMul = b.turnMul * lg.turn;

  for (const a of d.armor) {
    const A = ARMOR[a];
    armor += A.armor; mass += A.mass; speedMul *= A.speedMul; reflect += A.reflect;
  }
  for (const o of d.organs) {
    const m = ORGANS[o].mod;
    if (m.regen) regen += m.regen;
    if (m.hpAdd) hp += m.hpAdd;
    if (m.massAdd) mass += m.massAdd;
    if (m.stamMul) stamMax *= m.stamMul;
    if (m.stamRegenMul) stamRegen *= m.stamRegenMul;
    if (m.crit) crit += m.crit;
    if (m.cdMul) cdMul *= m.cdMul;
    if (m.dodge) dodge += m.dodge;
    if (m.turnMul) turnMul *= m.turnMul;
    if (m.rage) rage = true;
  }

  // locomotion: legs vs mass (compressed so slow:fast ≈ 1:2.5)
  const legPower = lg.speed * Math.pow(d.legs.pairs, 0.45);
  let speed = 58 + 92 * legPower * speedMul * Math.pow(10 / Math.max(6, mass), 0.35);
  let accel = 420 * lg.accel * Math.pow(10 / Math.max(6, mass), 0.3);
  let turn = 3.4 * turnMul;
  let kbRes = clamp01(lg.kbRes + mass / 60);
  // speed grants evasiveness: fast critters are harder to land hits on
  dodge += clamp01((speed - 140) / 900) * 0.9;

  // level bonus: modest, capped (max level 10 => +13.5% hp/dmg, +7.2% speed)
  const lv = Math.min(10, Math.max(1, level)) - 1;
  const hpLvl = 1 + lv * 0.015, dmgLvl = 1 + lv * 0.015, spdLvl = 1 + lv * 0.008;
  hp *= hpLvl; speed *= spdLvl;

  // traits
  if (T('vital')) hp *= 1.10;
  if (T('thickhide')) armor += 10;
  if (T('sprinter')) speed *= 1.08;
  if (T('slippery')) dodge += 0.08;
  if (T('anchor')) kbRes = clamp01(kbRes + 0.4);
  if (T('sharp')) crit += 0.06;
  if (T('marathon')) { stamMax *= 1.3; stamRegen *= 1.15; }
  if (T('regrow')) regen += 1.5;

  let dmgMul = dmgLvl * (b.dmgMul || 1) * (P.dmgMul || 1) * (T('brawny') ? 1.08 : 1);

  const R = 26 * size;
  const attacks = d.weapons.map((w, i) => {
    const a = WEAPONS[w].atk;
    return {
      id: w, slot: i, kind: a.kind,
      dmg: a.dmg * dmgMul,
      cd: a.cd * cdMul, range: a.range * R + R, // melee reach from center
      arc: a.arc, stam: a.stam, kb: a.kb,
      counter: a.counter || 0,
      poison: a.poison || null, slow: a.slow || null,
      projSpeed: a.projSpeed || 0,
      timer: 0,
    };
  });

  return {
    hp: Math.round(hp), mass, armor, reflect, regen,
    speed, accel, turn, kbRes, dodge: Math.min(0.35, dodge), crit: Math.min(0.5, crit),
    stamMax, stamRegen, rage, dmgMul, R, gcdMul: cdMul,
    lunge: !!lg.lunge, legPairs: d.legs.pairs, legType: d.legs.type,
    attacks,
    berserker: T('berserker'), secondwind: T('secondwind'),
  };
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// 0..1 display bars for the editor radar
export function displayStats(d, level = 1, traits = []) {
  const s = deriveStats(d, level, traits);
  const burst = s.attacks.reduce((m, a) => Math.max(m, a.dmg / a.cd), 0);
  const utility = (s.regen > 0) + (s.crit > 0.05) + (s.dodge > 0.05) + s.attacks.some(a => a.poison || a.slow || a.kind === 'ranged') + s.rage;
  return {
    Power: Math.min(1, burst / 16),
    Speed: Math.min(1, s.speed / 210),
    Toughness: Math.min(1, (s.hp * (1 + s.armor / 90)) / 260),
    Stamina: Math.min(1, s.stamMax / 160),
    Tricks: Math.min(1, utility / 4),
  };
}
