// ============================================================
// Auto-battle engine: duel / team / sumo.
// Deterministic fixed-timestep sim with seeded RNG.
// ============================================================
import { clamp, lerp, dist, angTo, angDiff, rng } from './util.js';
import { statsOf } from './creature.js';
import { drawCreature } from './drawing.js';
import { PLANETS } from './parts.js';

const TEAM_COLORS = ['#5eead4', '#ff8fa3'];
const TEAM_NAMES = ['Teal', 'Coral'];
const LIMB_THRESH = [0.62, 0.34, 0.15]; // hp fractions where a leg tears off

export class Battle {
  // teams: [ [creature,...], [creature,...] ]
  constructor({ teams, mode = 'duel', seed = 1, labels = null, onEvent = null, gore = 'goo', planet = null }) {
    this.mode = mode;
    this.r = rng(seed);
    this.onEvent = onEvent || (() => {});
    this.labels = labels || TEAM_NAMES;
    this.W = mode === 'team' ? 1060 : 920;
    this.H = mode === 'team' ? 720 : 660;
    this.ringR = mode === 'sumo' ? 265 : 0;
    this.timeLimit = mode === 'sumo' ? 60 : mode === 'team' ? 90 : 75;
    this.t = 0;
    this.phase = 'intro'; this.phaseT = 0;
    this.finished = false; this.winnerTeam = -2; // -1 draw
    this.particles = []; this.floaters = []; this.projectiles = [];
    this.debris = []; this.splats = [];
    this.shake = 0; this.slowmo = 0; this.hitstop = 0;
    this.gore = gore; // 'goo' | 'blood' | 'off' — VISUAL ONLY, never touches sim
    this.fighters = [];
    this.koKind = null;
    // arena world: given, or drawn from the contestants' home planets
    // (uses sim rng in the constructor — deterministic for a given seed)
    const homes = teams.flat().map(c => c.design.planet || 'meridian');
    this.planet = planet || homes[Math.floor(this.r() * homes.length)];
    this.arena = (PLANETS[this.planet] || PLANETS.meridian).arena;

    teams.forEach((crew, team) => {
      crew.forEach((cre, i) => {
        const stats = statsOf(cre);
        const n = crew.length;
        const cx = this.W / 2, cy = this.H / 2;
        const off = (i - (n - 1) / 2) * 130;
        const fx = team === 0 ? cx - this.W * 0.30 : cx + this.W * 0.30;
        this.fighters.push({
          cre, stats, team, name: cre.name,
          maxHp: stats.hp, hp: stats.hp,
          stam: stats.stamMax,
          x: fx, y: cy + off,
          vx: 0, vy: 0,
          ang: team === 0 ? 0 : Math.PI,
          walkPhase: this.r() * 6, moveAmt: 0,
          attack: null,           // {atk, t, total, windup, done, dashT}
          cds: stats.attacks.map(() => 0.3 + this.r() * 0.6),
          poison: 0, poisonT: 0, slowT: 0, slowMul: 1,
          hurtT: 0, dead: false, koT: 0, kind: null,
          exhausted: false, usedSecondWind: false,
          target: null, strafeDir: this.r() < 0.5 ? -1 : 1, retimer: 0, skirmishOut: false, kiteOut: false,
          lastHitT: -9, blinkT: this.r() * 4,
          dustT: 0,
          legsLost: 0, maxLegsLose: Math.min(3, Math.max(0, cre.design.legs.pairs * 2 - 2)),
        });
      });
    });
  }

  emit(ev, d) { this.onEvent(ev, d); }

  alive(team) { return this.fighters.filter(f => !f.dead && f.team === team); }

  // ---------------- step ----------------
  step(dt) {
    if (this.finished) return;
    const ts = this.slowmo > 0 ? 0.28 : 1;
    this.slowmo = Math.max(0, this.slowmo - dt);
    dt *= ts;
    this.t += dt; this.phaseT += dt;
    this.shake = Math.max(0, this.shake - dt * 40);

    if (this.phase === 'intro') {
      // walk-in + countdown handled by draw; creatures idle
      for (const f of this.fighters) this.animIdle(f, dt);
      if (this.phaseT >= 3.0) { this.phase = 'fight'; this.phaseT = 0; this.emit('go'); }
      this.updateFx(dt);
      return;
    }

    if (this.phase === 'end') {
      for (const f of this.fighters) this.animIdle(f, dt);
      this.updateFx(dt);
      if (this.phaseT >= 2.2) this.finished = true;
      return;
    }

    // sumo ring shrink pressure
    if (this.mode === 'sumo' && this.phaseT > 22) {
      this.ringR = Math.max(150, 265 - (this.phaseT - 22) * 4.5);
    }

    for (const f of this.fighters) if (!f.dead) this.stepFighter(f, dt);
    this.stepProjectiles(dt);
    this.collideFighters();
    this.checkEnd(dt);
    this.updateFx(dt);
  }

  animIdle(f, dt) {
    f.walkPhase += dt * 2;
    f.moveAmt = lerp(f.moveAmt, 0.15, dt * 3);
    f.blinkT -= dt;
    if (f.blinkT < -0.12) f.blinkT = 2 + this.r() * 3;
    f.hurtT = Math.max(0, f.hurtT - dt * 4);
  }

  stepFighter(f, dt) {
    const s = f.stats;
    f.blinkT -= dt;
    if (f.blinkT < -0.12) f.blinkT = 2 + this.r() * 3;
    f.hurtT = Math.max(0, f.hurtT - dt * 4);
    f.lastHitT += dt;

    // status: poison
    if (f.poisonT > 0) {
      f.poisonT -= dt;
      this.damage(f, f.poison * dt, null, { silent: true, poison: true });
      if (this.r() < dt * 6) this.puff(f.x, f.y, '#84cc16', 1);
    }
    if (f.slowT > 0) { f.slowT -= dt; } else f.slowMul = 1;

    // regen
    if (s.regen > 0 && f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + s.regen * dt);

    // rage / berserk multipliers
    const lowHp = f.hp / f.maxHp;
    f.rageOn = s.rage && lowHp < 0.35;
    const spdBuff = (f.rageOn ? 1.15 : 1);

    // stamina
    f.stam = Math.min(s.stamMax, f.stam + s.stamRegen * dt);
    f.exhausted = f.stam < 12;

    // cooldowns
    for (let i = 0; i < f.cds.length; i++) f.cds[i] = Math.max(0, f.cds[i] - dt);

    // --- pick target ---
    if (!f.target || f.target.dead || (f.retimer -= dt) <= 0) {
      f.retimer = 0.8 + this.r() * 0.6;
      const foes = this.alive(1 - f.team);
      if (foes.length === 0) return;
      let best = null, bestScore = 1e9;
      for (const e of foes) {
        const d = dist(f.x, f.y, e.x, e.y);
        const score = d * (0.7 + 0.6 * (e.hp / e.maxHp)) * (e === f.target ? 0.7 : 1);
        if (score < bestScore) { bestScore = score; best = e; }
      }
      f.target = best;
      // estimate whether a straight slugfest is winnable; if not, prefer
      // mobility tactics (when we have the legs for them)
      const E = f.target;
      const dpsOf = (x) => x.stats.attacks.reduce((sum, a) => sum + a.dmg / a.cd * (a.kind === 'ram' ? 0.6 : 1), 0);
      const red = (ar) => 1 - ar / (ar + 110);
      const myKill = (E.hp + E.stats.regen * 10) / Math.max(0.1, dpsOf(f) * red(E.stats.armor) * (1 - E.stats.dodge));
      const itsKill = (f.hp + s.regen * 10) / Math.max(0.1, dpsOf(E) * red(s.armor) * (1 - s.dodge));
      f.preferHitRun = myKill > itsKill * 0.9;
    }
    const T = f.target;
    if (!T) return;

    const dT = dist(f.x, f.y, T.x, T.y);
    const aT = angTo(f.x, f.y, T.x, T.y);

    // --- attack in progress ---
    if (f.attack) {
      this.stepAttack(f, dt);
    } else {
      // --- choose an attack ---
      const usable = s.attacks.filter((a, i) =>
        f.cds[i] <= 0 && f.stam >= a.stam &&
        (a.kind === 'ranged' ? dT < a.range && dT > s.R * 2.2 :
         a.kind === 'ram' ? dT < a.range && dT > s.R * 1.2 :
         dT < a.range + T.stats.R * 0.7));
      if (usable.length && Math.abs(angDiff(f.ang, aT)) < (usable[0].arc / 2 + 0.5)) {
        const atk = usable[Math.floor(this.r() * usable.length)];
        this.startAttack(f, atk);
      }
    }

    // --- movement intent ---
    // Facing (where I point, gates attacks) and movement direction are
    // independent: critters can backpedal and strafe while facing a foe.
    let faceAng = aT, moveAng = aT, thrust = 1;
    const hasRanged = s.attacks.some(a => a.kind === 'ranged');
    const allRanged = hasRanged && !s.attacks.some(a => a.kind !== 'ranged');
    const kite = hasRanged && (allRanged || s.speed > T.stats.speed * 1.02);
    const retreating = f.exhausted && !f.rageOn && dT < 160;
    // skirmisher: fast melee builds hit-and-run instead of slugging
    const meleeReady = s.attacks.some((a, i) => a.kind !== 'ranged' && f.cds[i] < 0.2 && f.stam >= a.stam);
    const skirmishCapable = !hasRanged && s.speed > T.stats.speed * 1.18 && !!f.preferHitRun;
    const enemyReach = T.stats.attacks.reduce((m, a) => Math.max(m, a.kind === 'ranged' ? 0 : a.range), 60);

    // flee direction that blends "away from target" with "toward arena
    // center" so kiters don't trap themselves in corners
    const fleeAng = () => {
      const away = aT + Math.PI;
      const toC = angTo(f.x, f.y, this.W / 2, this.H / 2);
      const dC = dist(f.x, f.y, this.W / 2, this.H / 2);
      const bias = clamp((dC - 160) / 220, 0, 0.75);
      return away + angDiff(away, toC) * bias;
    };

    if (f.attack && f.attack.atk.kind === 'ram' && f.attack.phase === 'dash') {
      faceAng = moveAng = aT; thrust = 2.6; // committed charge
    } else if (retreating) {
      faceAng = moveAng = fleeAng(); thrust = 0.85;
    } else if (kite) {
      // drive-by pattern with hysteresis: sprint out at full speed (back
      // exposed!) until the gap is truly open, then wheel round and shoot
      const rangedAtk = s.attacks.find(a => a.kind === 'ranged');
      const band = rangedAtk.range * 0.78;
      if (f.kiteOut) { if (dT > band + 55) f.kiteOut = false; }
      else if (dT < band - 20) f.kiteOut = true;
      if (f.kiteOut) { faceAng = moveAng = fleeAng(); thrust = 1; }
      else if (dT > band + 30) { faceAng = moveAng = aT; thrust = 1; }
      else { faceAng = aT; moveAng = aT + Math.PI / 2 * f.strafeDir; thrust = 0.7; }
    } else if (f.attack && f.attack.phase === 'recover' && skirmishCapable) {
      // finished the bite — bail out immediately while recovering
      faceAng = aT; moveAng = fleeAng(); thrust = 1;
    } else if (skirmishCapable && (f.skirmishOut || !meleeReady)) {
      // hysteresis: stay OUT of the kill zone until the next bite is ready,
      // then dive back in. Speed becomes attack denial.
      if (f.skirmishOut) {
        if (meleeReady && dT > enemyReach + 50) f.skirmishOut = false;
      } else if (!f.attack) f.skirmishOut = true;
      if (f.skirmishOut) {
        if (dT < enemyReach + 120) {
          // full-speed escape, back turned — the price of running
          faceAng = moveAng = fleeAng() + 0.35 * f.strafeDir; thrust = 1;
        } else { faceAng = aT; moveAng = aT + Math.PI / 2 * f.strafeDir; thrust = 0.6; }
      }
    } else if (s.speed > T.stats.speed * 1.3 && dT > s.R + T.stats.R + 20 && dT < 320) {
      // flanking: fast critters swing toward the target's rear
      const bx = T.x - Math.cos(T.ang) * (T.stats.R + s.R + 8);
      const by = T.y - Math.sin(T.ang) * (T.stats.R + s.R + 8);
      faceAng = moveAng = angTo(f.x, f.y, bx, by); thrust = 1;
    } else if (dT < s.R + T.stats.R + 26 && f.cds.every(c => c > 0.15)) {
      // circle while everything is on cooldown
      faceAng = aT;
      moveAng = aT + Math.PI / 2 * f.strafeDir; thrust = 0.65;
      if (this.r() < dt * 0.7) f.strafeDir *= -1;
    }

    // sumo: stay in ring — hard override near edge
    if (this.mode === 'sumo') {
      const cx = this.W / 2, cy = this.H / 2;
      const dC = dist(f.x, f.y, cx, cy);
      if (dC > this.ringR - s.R * 1.6) {
        const inward = angTo(f.x, f.y, cx, cy);
        faceAng = moveAng = inward; thrust = 1.4;
      }
    }

    // teammates: gentle separation
    for (const m of this.fighters) {
      if (m === f || m.dead || m.team !== f.team) continue;
      const d = dist(f.x, f.y, m.x, m.y);
      if (d < 90 && d > 0.01) {
        const away = angTo(m.x, m.y, f.x, f.y);
        f.vx += Math.cos(away) * 45 * dt;
        f.vy += Math.sin(away) * 45 * dt;
      }
    }

    // --- steering ---
    const turnSp = s.turn * (f.attack && f.attack.phase === 'dash' ? 0.6 : 1);
    const dA = angDiff(f.ang, faceAng);
    f.ang += clamp(dA, -turnSp * dt, turnSp * dt);

    // velocity-seeking locomotion: speed stat is the true travel speed,
    // accel stat is responsiveness. Reduced power sideways/backwards.
    const eff = 0.55 + 0.45 * Math.max(0, Math.cos(angDiff(f.ang, moveAng)));
    const spd = s.speed * spdBuff * f.slowMul * (f.exhausted ? 0.62 : 1) * (1 - 0.09 * f.legsLost);
    const dashMul = f.attack && f.attack.phase === 'dash' ? 2.0 : 1;
    const tv = spd * Math.min(1.15, thrust) * eff * dashMul;
    const rate = Math.min(1, (s.accel / 55) * dt);
    f.vx += (Math.cos(moveAng) * tv - f.vx) * rate;
    f.vy += (Math.sin(moveAng) * tv - f.vy) * rate;
    const v = Math.hypot(f.vx, f.vy);

    f.x += f.vx * dt; f.y += f.vy * dt;

    // walls (not sumo)
    if (this.mode !== 'sumo') {
      const m = s.R + 14;
      if (f.x < m) { f.x = m; f.vx = Math.abs(f.vx) * 0.4; }
      if (f.x > this.W - m) { f.x = this.W - m; f.vx = -Math.abs(f.vx) * 0.4; }
      if (f.y < m) { f.y = m; f.vy = Math.abs(f.vy) * 0.4; }
      if (f.y > this.H - m) { f.y = this.H - m; f.vy = -Math.abs(f.vy) * 0.4; }
    } else {
      // ring-out check
      const dC = dist(f.x, f.y, this.W / 2, this.H / 2);
      if (dC > this.ringR + s.R * 0.4) this.eliminate(f, 'ringout');
    }

    // anim
    f.moveAmt = lerp(f.moveAmt, clamp(v / 90, 0.1, 1), dt * 6);
    f.walkPhase += dt * (3 + v * 0.055);
    f.dustT -= dt;
    if (v > 120 && f.dustT <= 0) { this.puff(f.x - Math.cos(f.ang) * s.R, f.y - Math.sin(f.ang) * s.R, 'rgba(200,200,220,0.5)', 1); f.dustT = 0.09; }
  }

  // ---------------- attacks ----------------
  startAttack(f, atk) {
    const idx = f.stats.attacks.indexOf(atk);
    f.stam -= atk.stam;
    const windup = atk.kind === 'ram' ? 0.16 : 0.22;
    const active = atk.kind === 'ram' ? 0.62 : 0.02;
    const recover = atk.kind === 'ram' ? 0.3 : 0.26;
    f.attack = { atk, idx, t: 0, windup, active, recover, total: windup + active + recover, phase: 'windup', hitDone: false };
    if (atk.kind === 'ranged') this.emit('spit'); else this.emit('swish');
  }

  stepAttack(f, dt) {
    const A = f.attack;
    A.t += dt;
    if (A.phase === 'windup' && A.t >= A.windup) {
      A.phase = A.atk.kind === 'ram' ? 'dash' : 'strike';
      if (A.atk.kind === 'melee') this.resolveMelee(f, A.atk);
      if (A.atk.kind === 'ranged') this.fireProjectile(f, A.atk);
    }
    if (A.phase === 'dash') {
      // contact check during dash
      for (const e of this.fighters) {
        if (e.dead || e.team === f.team || A.hitDone) continue;
        const d = dist(f.x, f.y, e.x, e.y);
        if (d < f.stats.R + e.stats.R + 6) {
          A.hitDone = true;
          const v = Math.hypot(f.vx, f.vy);
          const dmg = A.atk.dmg * (0.6 + v / 260);
          this.applyHit(f, e, A.atk, dmg, angTo(f.x, f.y, e.x, e.y));
          // self recoil
          f.vx *= -0.25; f.vy *= -0.25;
        }
      }
      if (A.t >= A.windup + A.active) A.phase = 'recover';
    }
    if (A.phase === 'strike' && A.t >= A.windup + A.active) A.phase = 'recover';
    if (A.t >= A.total) {
      f.cds[A.idx] = A.atk.cd * (0.9 + this.r() * 0.2);
      // global cooldown: other weapons need a beat before swinging,
      // so stacking many cheap weapons can't machine-gun
      const gcd = 0.48 * (f.stats.gcdMul || 1);
      for (let i = 0; i < f.cds.length; i++) if (i !== A.idx) f.cds[i] = Math.max(f.cds[i], gcd);
      f.attack = null;
    }
  }

  resolveMelee(f, atk) {
    let hitAny = false;
    for (const e of this.fighters) {
      if (e.dead || e.team === f.team) continue;
      const d = dist(f.x, f.y, e.x, e.y);
      if (d > atk.range + e.stats.R * 0.7) continue;
      const a = angTo(f.x, f.y, e.x, e.y);
      if (Math.abs(angDiff(f.ang, a)) > atk.arc / 2 + 0.35) continue;
      let dmg = atk.dmg;
      if (atk.counter && f.lastHitT < 1.2) dmg *= 1 + atk.counter;
      this.applyHit(f, e, atk, dmg, a);
      hitAny = true;
      if (this.mode !== 'team') break; // single hit in duel; cleave in team fights feels fun? keep single target consistent
    }
    if (!hitAny) this.floater(f.x + Math.cos(f.ang) * 40, f.y + Math.sin(f.ang) * 40, 'whiff', '#8899bb', 13);
  }

  fireProjectile(f, atk) {
    const T = f.target; if (!T) return;
    // lead the target slightly
    const tt = dist(f.x, f.y, T.x, T.y) / atk.projSpeed;
    const px = T.x + T.vx * tt * 0.7, py = T.y + T.vy * tt * 0.7;
    const a = angTo(f.x, f.y, px, py);
    this.projectiles.push({
      x: f.x + Math.cos(f.ang) * f.stats.R, y: f.y + Math.sin(f.ang) * f.stats.R,
      vx: Math.cos(a) * atk.projSpeed, vy: Math.sin(a) * atk.projSpeed,
      team: f.team, atk, src: f, life: 2.2,
      color: f.cre.design.colors.a,
    });
  }

  stepProjectiles(dt) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (this.r() < dt * 20) this.puff(p.x, p.y, p.color, 0.6);
      for (const e of this.fighters) {
        if (e.dead || e.team === p.team || p.life <= 0) continue;
        if (dist(p.x, p.y, e.x, e.y) < e.stats.R + 7) {
          this.applyHit(p.src, e, p.atk, p.atk.dmg, Math.atan2(p.vy, p.vx));
          p.life = 0;
        }
      }
      if (p.x < 0 || p.x > this.W || p.y < 0 || p.y > this.H) p.life = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  applyHit(src, e, atk, dmg, angle) {
    // dodge
    if (this.r() < e.stats.dodge) {
      this.floater(e.x, e.y - 30, 'dodge!', '#9fd8ff', 14);
      this.emit('swish');
      return;
    }
    // crit
    let crit = false;
    if (this.r() < src.stats.crit) { dmg *= 1.6; crit = true; }
    // backstab: hits landing from behind the target strike +25% harder.
    // Fast, agile builds out-position slow turners — speed becomes offense.
    let backstab = false;
    if (Math.abs(angDiff(e.ang, angle)) < 0.95) { dmg *= 1.35; backstab = true; }
    // berserker trait
    if (src.stats.berserker && src.hp / src.maxHp < 0.5) dmg *= 1.12;
    // rage organ
    if (src.rageOn) dmg *= 1.25;
    // armor (diminishing returns)
    dmg *= 1 - e.stats.armor / (e.stats.armor + 110);

    this.damage(e, dmg, src, { crit, backstab });
    e.lastHitT = 0;

    // knockback
    const kb = atk.kb * (1 - e.stats.kbRes) / Math.sqrt(e.stats.mass);
    e.vx += Math.cos(angle) * kb * 2.6;
    e.vy += Math.sin(angle) * kb * 2.6;

    // effects
    if (atk.poison) { e.poison = atk.poison.dps; e.poisonT = atk.poison.dur; }
    if (atk.slow) { e.slowMul = atk.slow.mul; e.slowT = atk.slow.dur; }

    // spikes reflect (melee only)
    if (atk.kind !== 'ranged' && e.stats.reflect > 0 && src) {
      this.damage(src, dmg * e.stats.reflect, null, { silent: false, reflectFx: true });
    }

    // fx (visual particles use Math.random — keep sim rng clean)
    const big = dmg > 14 || crit;
    this.emit(big ? 'bigHit' : 'hit');
    this.shake = Math.min(14, this.shake + (big ? 9 : 4));
    if (big) this.hitstop = Math.max(this.hitstop, 0.045);
    for (let i = 0; i < (big ? 10 : 6); i++) {
      this.particles.push({
        x: e.x, y: e.y, vx: Math.cos(angle + (Math.random() - 0.5) * 1.6) * (60 + Math.random() * 160),
        vy: Math.sin(angle + (Math.random() - 0.5) * 1.6) * (60 + Math.random() * 160),
        life: 0.35 + Math.random() * 0.3, maxLife: 0.6, r: 2 + Math.random() * 3,
        color: crit ? '#ffd166' : '#ffffff',
      });
    }
    // ichor spray
    const ic = this.goreColor(e);
    if (ic) {
      const n = big ? 7 : 3;
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: e.x, y: e.y,
          vx: Math.cos(angle + (Math.random() - 0.5) * 1.1) * (80 + Math.random() * 190),
          vy: Math.sin(angle + (Math.random() - 0.5) * 1.1) * (80 + Math.random() * 190),
          life: 0.35 + Math.random() * 0.35, maxLife: 0.7, r: 1.8 + Math.random() * 3, color: ic, splat: true,
        });
      }
      if (big && Math.random() < 0.55) this.addSplat(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, 8 + Math.random() * 14, ic);
    }
  }

  goreColor(f) {
    if (this.gore === 'off') return null;
    return this.gore === 'blood' ? '#a81f2e' : f.cre.design.colors.a;
  }

  severLimb(f) {
    f.legsLost++;
    this.emit('pop');
    this.shake = Math.min(16, this.shake + 8);
    this.hitstop = Math.max(this.hitstop, 0.07);
    this.floater(f.x, f.y - f.stats.R - 26, 'LEG OFF!', '#ff9f43', 18);
    // severed leg tumbles away (visuals may use Math.random freely)
    const a = Math.random() * Math.PI * 2;
    this.debris.push({
      type: 'leg', x: f.x, y: f.y,
      vx: Math.cos(a) * (120 + Math.random() * 120), vy: Math.sin(a) * (120 + Math.random() * 120),
      rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 14,
      color: f.cre.design.colors.b, len: f.stats.R * 0.9, w: Math.max(3, f.stats.R * 0.12),
    });
    const ic = this.goreColor(f);
    if (ic) {
      this.addSplat(f.x, f.y, f.stats.R * (0.8 + Math.random() * 0.5), ic);
      for (let i = 0; i < 12; i++) {
        const b = Math.random() * Math.PI * 2;
        this.particles.push({
          x: f.x, y: f.y, vx: Math.cos(b) * (40 + Math.random() * 200), vy: Math.sin(b) * (40 + Math.random() * 200),
          life: 0.4 + Math.random() * 0.4, maxLife: 0.8, r: 2 + Math.random() * 3.5, color: ic, splat: true,
        });
      }
    }
  }

  addSplat(x, y, r, color) {
    this.splats.push({ x, y, r, color, a: 0.55, rot: Math.random() * 6.28 });
    if (this.splats.length > 70) this.splats.shift();
  }

  damage(e, dmg, src, opts = {}) {
    if (e.dead || dmg <= 0) return;
    e.hp -= dmg;
    // limb loss at fixed hp thresholds — deterministic (part of the sim),
    // costs speed; the gore *visuals* around it are cosmetic only
    while (e.hp > 0 && e.legsLost < e.maxLegsLose && e.hp / e.maxHp < LIMB_THRESH[e.legsLost]) this.severLimb(e);
    if (!opts.silent) {
      e.hurtT = 1;
      this.floater(e.x + (this.r() - 0.5) * 24, e.y - e.stats.R - 10,
        Math.round(dmg) + (opts.backstab ? '!' : ''),
        opts.crit ? '#ffd166' : opts.poison ? '#a3e635' : opts.backstab ? '#ffb46b' : '#ffffff',
        opts.crit ? 22 : opts.backstab ? 18 : 15);
    }
    // second wind
    if (e.hp > 0 && e.hp / e.maxHp < 0.25 && e.stats.secondwind && !e.usedSecondWind) {
      e.usedSecondWind = true;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.18);
      this.floater(e.x, e.y - e.stats.R - 26, 'second wind!', '#7bed9f', 15);
      for (let i = 0; i < 12; i++) this.puff(e.x + (this.r() - 0.5) * 40, e.y + (this.r() - 0.5) * 40, '#7bed9f', 1.4);
    }
    if (e.hp <= 0) this.eliminate(e, 'ko');
  }

  eliminate(f, kind) {
    if (f.dead) return;
    f.dead = true; f.hp = 0; f.kind = kind; f.koT = this.t;
    this.emit('ko');
    this.shake = 16;
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.floater(f.x, f.y - 40, kind === 'ringout' ? 'RING OUT!' : 'K.O.!', '#ff6b81', 26);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: f.x, y: f.y, vx: Math.cos(a) * (40 + Math.random() * 220), vy: Math.sin(a) * (40 + Math.random() * 220),
        life: 0.5 + Math.random() * 0.5, maxLife: 1, r: 2 + Math.random() * 4,
        color: ['#ffd166', '#ff8fa3', '#5eead4', '#ffffff'][Math.floor(Math.random() * 4)],
      });
    }
    // KO: bits fly off (visual)
    if (kind === 'ko') {
      const d = f.cre.design;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        this.debris.push({
          type: i === 0 ? 'chunk' : 'leg', x: f.x, y: f.y,
          vx: Math.cos(a) * (140 + Math.random() * 180), vy: Math.sin(a) * (140 + Math.random() * 180),
          rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * 16,
          color: i === 0 ? d.colors.a : d.colors.b, len: f.stats.R * 0.8, w: Math.max(3, f.stats.R * 0.13),
        });
      }
      const ic = this.goreColor(f);
      if (ic) {
        this.addSplat(f.x, f.y, f.stats.R * 1.5, ic);
        this.addSplat(f.x + (Math.random() - 0.5) * 60, f.y + (Math.random() - 0.5) * 60, f.stats.R * 0.8, ic);
      }
    }
  }

  collideFighters() {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i], b = fs[j];
        if (a.dead || b.dead) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        const min = a.stats.R + b.stats.R;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const ax = (a.x - b.x) / d, ay = (a.y - b.y) / d;
          const ma = a.stats.mass, mb = b.stats.mass, tm = ma + mb;
          a.x += ax * push * 2 * (mb / tm); a.y += ay * push * 2 * (mb / tm);
          b.x -= ax * push * 2 * (ma / tm); b.y -= ay * push * 2 * (ma / tm);
          // momentum transfer (sumo shoving)
          const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
          const rel = dvx * ax + dvy * ay;
          if (rel < 0) {
            const imp = -rel * 0.8;
            a.vx += ax * imp * (mb / tm); a.vy += ay * imp * (mb / tm);
            b.vx -= ax * imp * (ma / tm); b.vy -= ay * imp * (ma / tm);
          }
        }
      }
    }
  }

  checkEnd(dt) {
    const a0 = this.alive(0).length, a1 = this.alive(1).length;
    let over = false;
    if (a0 === 0 || a1 === 0) {
      this.winnerTeam = a0 === 0 && a1 === 0 ? -1 : a0 === 0 ? 1 : 0;
      this.koKind = 'ko';
      over = true;
    } else if (this.phaseT >= this.timeLimit) {
      // judge decision: total remaining hp fraction
      const s0 = this.alive(0).reduce((s, f) => s + f.hp / f.maxHp, 0);
      const s1 = this.alive(1).reduce((s, f) => s + f.hp / f.maxHp, 0);
      this.winnerTeam = Math.abs(s0 - s1) < 0.02 ? -1 : s0 > s1 ? 0 : 1;
      this.koKind = 'judge';
      over = true;
      this.emit('whistle');
    }
    if (over) {
      this.phase = 'end'; this.phaseT = 0;
      this.slowmo = this.koKind === 'ko' ? 1.0 : 0;
      this.emit(this.winnerTeam >= 0 ? 'cheer' : 'whistle');
      // survivors celebrate
      for (const f of this.fighters) { f.attack = null; }
    }
  }

  // ---------------- fx ----------------
  puff(x, y, color, scale = 1) {
    this.particles.push({
      x, y, vx: (this.r() - 0.5) * 30, vy: (this.r() - 0.5) * 30 - 12,
      life: 0.4 + this.r() * 0.25, maxLife: 0.65, r: (2.5 + this.r() * 2.5) * scale, color,
    });
  }
  floater(x, y, text, color, size) {
    this.floaters.push({ x, y, text: String(text), color, size, life: 1, vy: -46 });
  }
  updateFx(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt;
      // ichor droplets leave a little stain where they land
      if (p.splat && p.life <= 0 && Math.random() < 0.3) this.addSplat(p.x, p.y, 2.5 + Math.random() * 4, p.color);
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const fl of this.floaters) { fl.y += fl.vy * dt; fl.vy *= 0.93; fl.life -= dt * 0.9; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    for (const d of this.debris) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vrot * dt;
      d.vx *= Math.pow(0.02, dt); d.vy *= Math.pow(0.02, dt); d.vrot *= Math.pow(0.05, dt);
    }
    for (const s of this.splats) if (s.a > 0.22) s.a -= dt * 0.01;
  }

  // ---------------- draw ----------------
  draw(ctx, cw, ch) {
    // NOTE: draw paths must never consume this.r() — the sim RNG stream has
    // to stay identical across machines for online play. Visual jitter uses
    // Math.random() instead.
    const scale = Math.min(cw / (this.W + 60), ch / (this.H + 100));
    const ox = (cw - this.W * scale) / 2 + (Math.random() - 0.5) * this.shake;
    const oy = (ch - this.H * scale) / 2 + 20 * scale + (Math.random() - 0.5) * this.shake;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    this.drawArena(ctx);

    // floor stains
    for (const s of this.splats) {
      ctx.save();
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.color;
      ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r, s.r * 0.7, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s.r * 0.8, s.r * 0.3, s.r * 0.3, s.r * 0.22, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // debris (severed bits) under the fighters
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      if (d.type === 'leg') {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = d.w; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-d.len / 2, 0);
        ctx.quadraticCurveTo(0, d.w * 1.2, d.len / 2, 0);
        ctx.stroke();
      } else {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.len * 0.55, d.len * 0.38, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }

    // draw order by y
    const order = [...this.fighters].sort((a, b) => a.y - b.y);
    for (const f of order) this.drawFighter(ctx, f);

    // projectiles
    for (const p of this.projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(p.x - p.vx * 0.008, p.y - p.vy * 0.008, 4, 0, 7); ctx.fill();
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floaters
    for (const fl of this.floaters) {
      ctx.globalAlpha = Math.min(1, fl.life * 2);
      ctx.font = `900 ${fl.size}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;

    // intro countdown / end banner
    if (this.phase === 'intro') {
      const n = Math.ceil(3 - this.phaseT);
      const tIn = 1 - (this.phaseT % 1);
      ctx.font = `900 ${90 + tIn * 30}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, tIn * 2);
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const txt = n > 0 ? String(n) : 'FIGHT!';
      ctx.strokeText(txt, this.W / 2, this.H / 2 - 40);
      ctx.fillStyle = n > 0 ? '#ffd166' : '#5eead4';
      ctx.fillText(txt, this.W / 2, this.H / 2 - 40);
      ctx.globalAlpha = 1;
    }
    if (this.phase === 'end') {
      ctx.font = '900 64px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const txt = this.winnerTeam === -1 ? 'DRAW!' : `${this.labels[this.winnerTeam].toUpperCase()} WINS!`;
      ctx.strokeText(txt, this.W / 2, this.H / 2 - 30);
      ctx.fillStyle = this.winnerTeam === -1 ? '#9fb0d0' : TEAM_COLORS[this.winnerTeam];
      ctx.fillText(txt, this.W / 2, this.H / 2 - 30);
      if (this.koKind === 'judge') {
        ctx.font = '700 22px "Segoe UI", sans-serif';
        ctx.fillStyle = '#9fb0d0';
        ctx.fillText('— judges’ decision —', this.W / 2, this.H / 2 + 8);
      }
    }

    ctx.restore();

    // top HP bars (screen space)
    this.drawTeamBars(ctx, cw);
  }

  drawArena(ctx) {
    const A = this.arena;
    if (this.mode === 'sumo') {
      // sand circle on planet-tinted ground
      ctx.fillStyle = A.floorB;
      ctx.fillRect(-40, -40, this.W + 80, this.H + 80);
      const cx = this.W / 2, cy = this.H / 2;
      const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, this.ringR);
      g.addColorStop(0, '#e8cf9e'); g.addColorStop(1, '#c9a86a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, this.ringR, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a6a33'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(cx, cy, this.ringR - 5, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, this.ringR - 16, 0, 7); ctx.stroke();
    } else {
      // planet-themed arena floor
      const g = ctx.createRadialGradient(this.W / 2, this.H / 2, 60, this.W / 2, this.H / 2, this.W * 0.7);
      g.addColorStop(0, A.floorA); g.addColorStop(1, A.floorB);
      ctx.fillStyle = g;
      roundRect(ctx, 0, 0, this.W, this.H, 34);
      ctx.fill();
      // floor rings
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.lineWidth = 2;
      for (const r of [90, 180, 270]) {
        ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, r, 0, 7); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.moveTo(this.W / 2, 20); ctx.lineTo(this.W / 2, this.H - 20); ctx.stroke();
      // walls
      ctx.strokeStyle = A.wall; ctx.lineWidth = 10;
      roundRect(ctx, -5, -5, this.W + 10, this.H + 10, 38);
      ctx.stroke();
      ctx.strokeStyle = A.accent; ctx.lineWidth = 3;
      roundRect(ctx, -10, -10, this.W + 20, this.H + 20, 40);
      ctx.stroke();
    }
    this.drawAmbient(ctx);
  }

  // planet weather — purely visual, spawned with Math.random
  drawAmbient(ctx) {
    if (!this.amb) this.amb = [];
    const kind = this.arena.ambient;
    if (this.amb.length < 26 && Math.random() < 0.3) {
      this.amb.push({
        x: Math.random() * this.W, y: kind === 'embers' ? this.H + 10 : -10,
        vx: (Math.random() - 0.5) * 20 + (kind === 'wind' ? 90 : kind === 'leaves' ? 15 : 0),
        vy: kind === 'embers' ? -(22 + Math.random() * 30) : kind === 'stars' ? 0 : 18 + Math.random() * 26,
        r: kind === 'stars' ? 1 + Math.random() * 1.6 : 2 + Math.random() * 3,
        p: Math.random() * 6.28, life: 12,
        ...(kind === 'stars' ? { x: Math.random() * this.W, y: Math.random() * this.H } : {}),
      });
    }
    const colors = { leaves: 'rgba(140,215,120,.5)', embers: 'rgba(255,150,70,.6)', snow: 'rgba(235,245,255,.55)', wind: 'rgba(200,200,235,.28)', stars: 'rgba(210,180,255,.6)', dust: 'rgba(160,175,215,.25)' };
    ctx.fillStyle = colors[kind] || colors.dust;
    for (const a of this.amb) {
      a.p += 0.05; a.life -= 1 / 60;
      a.x += (a.vx + Math.sin(a.p) * 12) / 60; a.y += a.vy / 60;
      if (kind === 'wind') {
        ctx.fillRect(a.x, a.y, 14, 1.4);
      } else if (kind === 'stars') {
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(a.p * 0.7));
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
      }
    }
    this.amb = this.amb.filter(a => a.life > 0 && a.x > -30 && a.x < this.W + 30 && a.y > -30 && a.y < this.H + 30);
  }

  drawFighter(ctx, f) {
    const atkAnim = f.attack ? { id: f.attack.atk.id, kind: f.attack.atk.kind, t: f.attack.t / f.attack.total } : null;
    drawCreature(ctx, f.cre.design, f.stats, {
      x: f.x, y: f.y, ang: f.ang,
      walkPhase: f.walkPhase, moveAmt: f.moveAmt,
      attack: atkAnim, hurt: f.hurtT, dead: f.dead,
      blink: f.blinkT < 0, legsLost: f.legsLost,
    }, { teamColor: TEAM_COLORS[f.team] });

    if (!f.dead) {
      // hp bar
      const w = 64, x = f.x - w / 2, y = f.y - f.stats.R - 26;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      roundRect(ctx, x - 1, y - 1, w + 2, 9, 4); ctx.fill();
      const frac = clamp(f.hp / f.maxHp, 0, 1);
      ctx.fillStyle = frac > 0.5 ? '#7bed9f' : frac > 0.25 ? '#ffd166' : '#ff6b81';
      roundRect(ctx, x, y, w * frac, 7, 3.2); ctx.fill();
      // stamina sliver
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      roundRect(ctx, x, y + 9, w, 3.4, 2); ctx.fill();
      ctx.fillStyle = '#6ea8ff';
      roundRect(ctx, x, y + 9, w * clamp(f.stam / f.stats.stamMax, 0, 1), 3.4, 2); ctx.fill();
      // name
      ctx.font = '700 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = TEAM_COLORS[f.team];
      ctx.fillText(f.name, f.x, y - 6);
      // status icons
      let ic = '';
      if (f.poisonT > 0) ic += '🟢';
      if (f.rageOn) ic += '🔥';
      if (f.slowT > 0) ic += '🕸️';
      if (ic) { ctx.font = '11px sans-serif'; ctx.fillText(ic, f.x, y - 20); }
    } else {
      // X eyes / dizzy stars
      ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      const sp = (this.t - f.koT) * 3;
      for (let i = 0; i < 3; i++) {
        const a = sp + i * 2.1;
        ctx.globalAlpha = 0.8;
        ctx.fillText('✦', f.x + Math.cos(a) * 26, f.y - f.stats.R - 8 + Math.sin(a) * 7);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawTeamBars(ctx, cw) {
    const teams = [0, 1];
    ctx.save();
    for (const t of teams) {
      const members = this.fighters.filter(f => f.team === t);
      const total = members.reduce((s, f) => s + f.maxHp, 0);
      const cur = members.reduce((s, f) => s + Math.max(0, f.hp), 0);
      const w = Math.min(330, cw * 0.34);
      const x = t === 0 ? 24 : cw - 24 - w;
      const y = 58;
      ctx.fillStyle = 'rgba(6,10,22,.7)';
      roundRect(ctx, x - 6, y - 22, w + 12, 44, 12); ctx.fill();
      ctx.font = '800 13px "Segoe UI", sans-serif';
      ctx.textAlign = t === 0 ? 'left' : 'right';
      ctx.fillStyle = TEAM_COLORS[t];
      ctx.fillText(this.labels[t], t === 0 ? x + 2 : x + w - 2, y - 7);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      roundRect(ctx, x, y, w, 12, 6); ctx.fill();
      const frac = total ? cur / total : 0;
      ctx.fillStyle = TEAM_COLORS[t];
      if (frac > 0) { roundRect(ctx, t === 0 ? x : x + w * (1 - frac), y, w * frac, 12, 6); ctx.fill(); }
    }
    // timer
    if (this.phase === 'fight') {
      const rem = Math.max(0, this.timeLimit - this.phaseT);
      ctx.font = '900 20px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = rem < 10 ? '#ff6b81' : '#eaf2ff';
      ctx.fillText(Math.ceil(rem), cw / 2, 78);
    }
    ctx.restore();
  }

  // result summary for rewards
  summary() {
    const hpFrac = (t) => {
      const m = this.fighters.filter(f => f.team === t);
      return m.reduce((s, f) => s + Math.max(0, f.hp), 0) / m.reduce((s, f) => s + f.maxHp, 0);
    };
    return {
      winnerTeam: this.winnerTeam, kind: this.koKind,
      duration: this.t, hp0: hpFrac(0), hp1: hpFrac(1),
    };
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// headless runner for balance testing
export function simulate(teams, mode = 'duel', seed = 1) {
  const b = new Battle({ teams, mode, seed });
  b.phase = 'fight'; b.phaseT = 0;
  const dt = 1 / 60;
  let guard = 0;
  while (!b.finished && guard++ < 60 * 300) {
    b.slowmo = 0;
    b.step(dt);
    if (b.phase === 'end') { b.finished = true; }
  }
  return b.summary();
}
