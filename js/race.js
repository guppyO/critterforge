// ============================================================
// Race mode: seeded loop track, waypoint steering, stamina
// sprint management, mud + boost zones, placements.
// ============================================================
import { clamp, lerp, dist, angTo, angDiff, rng } from './util.js';
import { statsOf } from './creature.js';
import { drawCreature } from './drawing.js';

const RACER_COLORS = ['#5eead4', '#ff8fa3', '#ffd166', '#a78bfa', '#7bed9f', '#6ea8ff'];

export class Race {
  // entrants: [{cre, isPlayer}]
  constructor({ entrants, seed = 1, laps = 2, onEvent = null }) {
    this.r = rng(seed);
    this.onEvent = onEvent || (() => {});
    this.laps = laps;
    this.W = 1100; this.H = 760;
    this.t = 0; this.phase = 'intro'; this.phaseT = 0;
    this.finished = false;
    this.particles = []; this.floaters = [];
    this.trackW = 92;

    // --- build loop track ---
    const cx = this.W / 2, cy = this.H / 2 + 10;
    const n = 16;
    this.wps = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 0.78 + this.r() * 0.3;
      this.wps.push({
        x: cx + Math.cos(a) * this.W * 0.36 * wob,
        y: cy + Math.sin(a) * this.H * 0.33 * (0.82 + this.r() * 0.26),
      });
    }
    // smooth pass
    for (let k = 0; k < 2; k++) {
      const s = this.wps.map((p, i) => {
        const a = this.wps[(i + n - 1) % n], b = this.wps[(i + 1) % n];
        return { x: (a.x + b.x + p.x * 2) / 4, y: (a.y + b.y + p.y * 2) / 4 };
      });
      this.wps = s;
    }

    // --- hazards / boosts on segment midpoints ---
    this.zones = [];
    const idxs = [...Array(n).keys()].filter(i => i > 1);
    for (let z = 0; z < 3; z++) {
      const i = idxs.splice(Math.floor(this.r() * idxs.length), 1)[0];
      const a = this.wps[i], b = this.wps[(i + 1) % n];
      this.zones.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 55, type: 'mud' });
    }
    for (let z = 0; z < 2; z++) {
      const i = idxs.splice(Math.floor(this.r() * idxs.length), 1)[0];
      const a = this.wps[i], b = this.wps[(i + 1) % n];
      this.zones.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 46, type: 'boost', ang: angTo(a.x, a.y, b.x, b.y) });
    }

    // --- racers ---
    this.racers = entrants.map((e, i) => {
      const stats = statsOf(e.cre);
      const start = this.wps[0];
      const perp = angTo(this.wps[0].x, this.wps[0].y, this.wps[1].x, this.wps[1].y) + Math.PI / 2;
      const lane = (i - (entrants.length - 1) / 2) * 34;
      return {
        cre: e.cre, stats, isPlayer: !!e.isPlayer, name: e.cre.name,
        color: RACER_COLORS[i % RACER_COLORS.length],
        x: start.x + Math.cos(perp) * lane - Math.cos(angTo(start.x, start.y, this.wps[1].x, this.wps[1].y)) * 30,
        y: start.y + Math.sin(perp) * lane,
        vx: 0, vy: 0, ang: angTo(start.x, start.y, this.wps[1].x, this.wps[1].y),
        wp: 1, lap: 0, done: false, finishT: 0, place: 0,
        stam: stats.stamMax, sprint: true,
        walkPhase: this.r() * 6, moveAmt: 0, blinkT: this.r() * 3,
        boostT: 0, stumbleT: 0,
        // racing spec: normalize into race pace
        pace: 0.9 + this.r() * 0.06,
        laneOff: (this.r() - 0.5) * 40,
      };
    });
    this.placeCounter = 1;
  }

  emit(e, d) { this.onEvent(e, d); }

  step(dt) {
    if (this.finished) return;
    this.t += dt; this.phaseT += dt;

    if (this.phase === 'intro') {
      for (const c of this.racers) { c.walkPhase += dt * 2; c.moveAmt = lerp(c.moveAmt, 0.15, dt * 3); }
      if (this.phaseT >= 3.0) { this.phase = 'race'; this.phaseT = 0; this.emit('go'); }
      this.updateFx(dt);
      return;
    }
    if (this.phase === 'end') {
      this.updateFx(dt);
      if (this.phaseT > 2.2) this.finished = true;
      return;
    }

    for (const c of this.racers) if (!c.done) this.stepRacer(c, dt);

    // soft collisions
    for (let i = 0; i < this.racers.length; i++)
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i], b = this.racers[j];
        const d = dist(a.x, a.y, b.x, b.y), min = a.stats.R + b.stats.R;
        if (d < min && d > 0.01) {
          const px = (a.x - b.x) / d, py = (a.y - b.y) / d, push = (min - d) / 2;
          a.x += px * push; a.y += py * push;
          b.x -= px * push; b.y -= py * push;
        }
      }

    // end conditions: all done, or grace period after first finisher
    const done = this.racers.filter(c => c.done).length;
    if (done === this.racers.length || (done > 0 && this.phaseT > this.firstFinishT + 10)) {
      // force-finish stragglers by current progress order
      const rest = this.racers.filter(c => !c.done).sort((a, b) => this.progress(b) - this.progress(a));
      for (const c of rest) { c.done = true; c.place = this.placeCounter++; }
      this.phase = 'end'; this.phaseT = 0;
      this.emit('cheer');
    }
    this.updateFx(dt);
  }

  progress(c) {
    const wp = this.wps[c.wp % this.wps.length];
    return c.lap * 10000 + c.wp * 100 - dist(c.x, c.y, wp.x, wp.y) * 0.05;
  }

  stepRacer(c, dt) {
    const s = c.stats;
    c.blinkT -= dt; if (c.blinkT < -0.12) c.blinkT = 2 + this.r() * 3;

    // stamina sprint cycle: sprint until low, jog to recover
    if (c.sprint && c.stam < s.stamMax * 0.15) c.sprint = false;
    if (!c.sprint && c.stam > s.stamMax * 0.7) c.sprint = true;
    if (c.sprint) c.stam = Math.max(0, c.stam - dt * 9);
    else c.stam = Math.min(s.stamMax, c.stam + s.stamRegen * dt * 0.55);

    let spdMul = c.sprint ? 1.18 : 0.86;

    // zones
    for (const z of this.zones) {
      if (dist(c.x, c.y, z.x, z.y) < z.r) {
        if (z.type === 'mud') { spdMul *= 0.55; if (this.r() < dt * 8) this.puff(c.x, c.y, '#7a5f2f', 1); }
        else if (z.type === 'boost' && c.boostT <= 0) {
          c.boostT = 1.1; this.emit('swish');
          this.floater(c.x, c.y - 40, 'BOOST!', '#5eead4', 15);
        }
      }
    }
    if (c.boostT > 0) { c.boostT -= dt; spdMul *= 1.5; if (this.r() < dt * 14) this.puff(c.x, c.y, '#5eead4', 1); }

    // occasional stumble for very low-turn heavy builds; adds drama, seeded
    if (c.stumbleT > 0) { c.stumbleT -= dt; spdMul *= 0.35; }
    else if (this.r() < dt * 0.02 * (s.mass > 20 ? 1.6 : 0.7)) {
      c.stumbleT = 0.5;
      this.floater(c.x, c.y - 40, 'stumble!', '#ffb3c0', 13);
    }

    // steer to waypoint (with lane offset for personality)
    const wp = this.wps[c.wp % this.wps.length];
    const nxt = this.wps[(c.wp + 1) % this.wps.length];
    const perp = angTo(wp.x, wp.y, nxt.x, nxt.y) + Math.PI / 2;
    const tx = wp.x + Math.cos(perp) * c.laneOff;
    const ty = wp.y + Math.sin(perp) * c.laneOff;
    const want = angTo(c.x, c.y, tx, ty);
    const dA = angDiff(c.ang, want);
    c.ang += clamp(dA, -s.turn * 1.1 * dt, s.turn * 1.1 * dt);

    const align = Math.max(0.25, Math.cos(dA));
    const spd = s.speed * c.pace * spdMul * align;
    c.vx = lerp(c.vx, Math.cos(c.ang) * spd, dt * 3.2);
    c.vy = lerp(c.vy, Math.sin(c.ang) * spd, dt * 3.2);
    c.x += c.vx * dt; c.y += c.vy * dt;

    // waypoint reached
    if (dist(c.x, c.y, wp.x, wp.y) < 78) {
      c.wp++;
      if (c.wp % this.wps.length === 0) {
        c.wp = 0; c.lap++;
        if (c.isPlayer && c.lap < this.laps) this.emit('bell');
        if (c.lap >= this.laps) {
          c.done = true; c.place = this.placeCounter++;
          c.finishT = this.t;
          if (this.placeCounter === 2) this.firstFinishT = this.phaseT;
          this.floater(c.x, c.y - 46, place(c.place) + '!', c.place === 1 ? '#ffd166' : '#9fb0d0', 22);
          if (c.place === 1) this.emit('fanfare');
        }
      }
    }

    const v = Math.hypot(c.vx, c.vy);
    c.moveAmt = lerp(c.moveAmt, clamp(v / 90, 0.15, 1), dt * 6);
    c.walkPhase += dt * (3 + v * 0.06);
  }

  // ---------------- fx ----------------
  puff(x, y, color, sc) {
    this.particles.push({ x, y, vx: (this.r() - .5) * 30, vy: (this.r() - .5) * 30, life: .4, maxLife: .4, r: 3 * sc, color });
  }
  floater(x, y, text, color, size) { this.floaters.push({ x, y, text, color, size, life: 1, vy: -40 }); }
  updateFx(dt) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const f of this.floaters) { f.y += f.vy * dt; f.vy *= .93; f.life -= dt * .9; }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  standings() {
    return [...this.racers].sort((a, b) =>
      (a.done && b.done) ? a.place - b.place :
      a.done ? -1 : b.done ? 1 :
      this.progress(b) - this.progress(a));
  }

  // ---------------- draw ----------------
  draw(ctx, cw, ch) {
    const scale = Math.min(cw / (this.W + 40), ch / (this.H + 80));
    const ox = (cw - this.W * scale) / 2, oy = (ch - this.H * scale) / 2 + 14 * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(scale, scale);

    // grass
    const g = ctx.createRadialGradient(this.W / 2, this.H / 2, 100, this.W / 2, this.H / 2, this.W * 0.62);
    g.addColorStop(0, '#1d3a2f'); g.addColorStop(1, '#0f2019');
    ctx.fillStyle = g;
    ctx.fillRect(-30, -30, this.W + 60, this.H + 60);

    // track path
    const path = new Path2D();
    const n = this.wps.length;
    path.moveTo((this.wps[n - 1].x + this.wps[0].x) / 2, (this.wps[n - 1].y + this.wps[0].y) / 2);
    for (let i = 0; i < n; i++) {
      const p = this.wps[i], q = this.wps[(i + 1) % n];
      path.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    path.closePath();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3d3a45'; ctx.lineWidth = this.trackW + 14; ctx.stroke(path);
    ctx.strokeStyle = '#55505e'; ctx.lineWidth = this.trackW; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]); ctx.stroke(path); ctx.setLineDash([]);

    // start / finish line
    const s0 = this.wps[0], s1 = this.wps[1];
    const fa = angTo(s0.x, s0.y, s1.x, s1.y) + Math.PI / 2;
    ctx.save();
    ctx.translate(s0.x, s0.y); ctx.rotate(fa);
    for (let i = -4; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#222';
        ctx.fillRect(i * 12, -12 + j * 12, 12, 12);
      }
    ctx.restore();

    // zones
    for (const z of this.zones) {
      if (z.type === 'mud') {
        ctx.fillStyle = 'rgba(122,95,47,.85)';
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0.3, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(90,68,30,.9)';
        ctx.beginPath(); ctx.ellipse(z.x - 10, z.y + 6, z.r * .5, z.r * .35, 0.3, 0, 7); ctx.fill();
      } else {
        ctx.save();
        ctx.translate(z.x, z.y); ctx.rotate(z.ang);
        ctx.fillStyle = 'rgba(94,234,212,.22)';
        ctx.beginPath(); ctx.arc(0, 0, z.r, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(94,234,212,.85)';
        const bob = (this.t * 60) % 20;
        for (let i = 0; i < 2; i++) {
          const off = -14 + i * 20 + bob * 0.4;
          ctx.beginPath();
          ctx.moveTo(off - 8, -14); ctx.lineTo(off + 8, 0); ctx.lineTo(off - 8, 14);
          ctx.lineTo(off - 2, 0); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }

    // racers by y
    for (const c of [...this.racers].sort((a, b) => a.y - b.y)) {
      drawCreature(ctx, c.cre.design, c.stats, {
        x: c.x, y: c.y, ang: c.ang, walkPhase: c.walkPhase, moveAmt: c.moveAmt,
        attack: null, hurt: 0, blink: c.blinkT < 0, dead: false,
      }, { teamColor: c.isPlayer ? '#ffd166' : null });
      ctx.font = '700 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = c.color;
      ctx.fillText(c.name, c.x, c.y - c.stats.R - 12);
    }

    // fx
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `900 ${f.size}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // countdown / finish banner
    if (this.phase === 'intro') {
      const nC = Math.ceil(3 - this.phaseT);
      const tIn = 1 - (this.phaseT % 1);
      ctx.font = `900 ${86 + tIn * 26}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const txt = nC > 0 ? String(nC) : 'GO!';
      ctx.strokeText(txt, this.W / 2, this.H / 2 - 20);
      ctx.fillStyle = nC > 0 ? '#ffd166' : '#5eead4';
      ctx.fillText(txt, this.W / 2, this.H / 2 - 20);
    }
    if (this.phase === 'end') {
      const winner = this.racers.find(c => c.place === 1);
      ctx.font = '900 56px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const txt = `${winner ? winner.name.toUpperCase() : '???'} WINS!`;
      ctx.strokeText(txt, this.W / 2, this.H / 2 - 20);
      ctx.fillStyle = '#ffd166'; ctx.fillText(txt, this.W / 2, this.H / 2 - 20);
    }
    ctx.restore();

    // standings HUD (screen space)
    const st = this.standings();
    ctx.save();
    ctx.font = '700 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    const bx = 16, by = 58;
    ctx.fillStyle = 'rgba(6,10,22,.72)';
    rr(ctx, bx - 6, by - 20, 190, st.length * 21 + 30, 12); ctx.fill();
    ctx.fillStyle = '#9fb0d0';
    const pl = this.racers.find(c => c.isPlayer);
    ctx.fillText(`LAP ${Math.min(this.laps, (pl ? pl.lap : 0) + 1)}/${this.laps}`, bx + 4, by - 4);
    st.forEach((c, i) => {
      ctx.fillStyle = c.isPlayer ? '#ffd166' : '#eaf2ff';
      ctx.fillText(`${i + 1}. ${c.name}${c.done ? ' 🏁' : ''}`, bx + 4, by + 16 + i * 21);
    });
    ctx.restore();
  }
}

function place(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
