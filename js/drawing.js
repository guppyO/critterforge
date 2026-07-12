// ============================================================
// Procedural creature rendering (top-down).
// A creature is drawn from its design: body, legs, weapons,
// armor, organs — all animated. Local space: facing +X.
// ============================================================
import { shade, clamp } from './util.js';
import { IMG, spritesReady, kcolorOf } from './assets.js';

const BODY_SHAPES = {
  pod:      { rx: 1.0, ry: 0.82 },
  wisp:     { rx: 0.95, ry: 0.6 },
  tank:     { rx: 1.05, ry: 1.0 },
  longback: { rx: 1.35, ry: 0.62 },
};

// ---- sprite composition maps (Kenney Monster Builder, CC0) ----
const BODY_SPRITE = { pod: 'A', wisp: 'D', tank: 'B', longback: 'F' };
const LEG_SPRITE = { scuttler: 'A', springer: 'C', stomper: 'E', strider: 'B' };
const EYE_SPRITE = { round: 'eye_cute_light', big: 'eye_human', angry: 'eye_angry_red' };
const MOUTH_FOR_WEAPON = {
  jaw: ['mouth_closed_teeth', 'mouthI'],       // [idle, attacking]
  crusher: ['mouth_closed_fangs', 'mouthJ'],
  stinger: ['mouth_closed_sad', 'mouthD'],
  spitter: ['mouthA', 'mouthG'],
  horn: ['mouth_closed_happy', 'mouthE'],
  pincer: ['mouth_closed_happy', 'mouthH'],
  tailwhip: ['mouthB', 'mouthF'],
};

// pose: {x, y, ang, walkPhase, moveAmt(0..1), attack:{id,t}|null, hurt:0..1, dead:bool, legsLost}
export function drawCreature(ctx, design, stats, pose, opts = {}) {
  if (spritesReady()) return drawSpriteCreature(ctx, design, stats, pose, opts);
  return drawVectorCreature(ctx, design, stats, pose, opts);
}

// ============================================================
// SPRITE RENDERER — upright cartoon billboards on the arena
// floor (Brawl-Stars-style), mirrored by facing direction.
// ============================================================
function spr(name) { return IMG[name] || null; }

function drawSpriteCreature(ctx, design, stats, pose, opts = {}) {
  const R = (stats ? stats.R : 26 * (design.size || 1)) * (opts.scale || 1);
  const kc = kcolorOf(design);
  const bodyIm = spr('body_' + kc + (BODY_SPRITE[design.body] || 'A'));
  if (!bodyIm) return drawVectorCreature(ctx, design, stats, pose, opts);

  const atk = pose.attack;
  const atkT = atk ? Math.min(1, atk.t) : -1;
  const lunge = atk && atkT >= 0 ? Math.sin(atkT * Math.PI) * R * (atk.kind === 'ram' ? 0.9 : 0.45) : 0;
  const face = Math.cos(pose.ang || 0) >= 0 ? 1 : -1;
  const W = R * 2.35;                                  // body draw width
  const H = W * (bodyIm.height / bodyIm.width);
  const bounce = Math.abs(Math.sin((pose.walkPhase || 0) * 1.6)) * (pose.moveAmt || 0) * R * 0.12;
  const squash = 1 + Math.sin((pose.walkPhase || 0) * 3.2) * (pose.moveAmt || 0) * 0.03;

  ctx.save();
  ctx.translate(pose.x, pose.y);

  // shadow at the feet
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, R * 0.72, R * 1.05, R * 0.32, 0, 0, 7);
  ctx.fill();

  // team ring
  if (opts.teamColor) {
    ctx.strokeStyle = opts.teamColor;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(0, R * 0.72, R * 1.35, R * 0.45, 0, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.scale(face, 1);
  ctx.translate(lunge, -bounce);
  if (pose.dead) { ctx.globalAlpha = 0.85; ctx.rotate(0.35); ctx.filter = 'grayscale(60%)'; }
  else if (pose.hurt > 0.15) ctx.filter = `brightness(${1 + pose.hurt * 1.2}) saturate(${1 - pose.hurt * 0.5})`;

  const feetY = R * 0.72;
  const bodyBottom = feetY - R * 0.18;

  // ---- legs (behind body) ----
  const legIm = spr('leg_' + kc + (LEG_SPRITE[design.legs.type] || 'A'));
  if (legIm) {
    const pairs = design.legs.pairs;
    const nLegs = Math.min(6, pairs * 2);
    const lw = R * 0.62, lh = lw * (legIm.height / legIm.width);
    const spread = Math.min(R * 1.35, nLegs * R * 0.3);
    for (let i = 0; i < nLegs; i++) {
      const legIndex = i; // matches battle legsLost ordering closely enough
      if (legIndex < (pose.legsLost || 0)) continue;
      const fx = nLegs === 1 ? 0 : (i / (nLegs - 1) - 0.5) * spread;
      const swing = Math.sin((pose.walkPhase || 0) * 1.6 + i * 2.4) * (pose.moveAmt || 0) * 0.5;
      ctx.save();
      ctx.translate(fx, bodyBottom - lh * 0.15);
      ctx.rotate(swing * 0.5);
      ctx.drawImage(legIm, -lw / 2, -lh * 0.1, lw, lh);
      ctx.restore();
    }
    // stumps for severed legs
    if (pose.legsLost > 0) {
      ctx.fillStyle = 'rgba(40,25,25,0.65)';
      for (let i = 0; i < Math.min(pose.legsLost, nLegs); i++) {
        const fx = nLegs === 1 ? 0 : (i / (nLegs - 1) - 0.5) * spread;
        ctx.beginPath();
        ctx.ellipse(fx, bodyBottom, R * 0.12, R * 0.08, 0, 0, 7);
        ctx.fill();
      }
    }
  }

  // ---- arms (pincer / tailwhip get visible limbs) ----
  const hasArms = design.weapons.includes('pincer') || design.weapons.includes('tailwhip');
  if (hasArms) {
    const armIm = spr('arm_' + kc + (design.weapons.includes('pincer') ? 'E' : 'B'));
    if (armIm) {
      const aw = R * 0.85, ah = aw * (armIm.height / armIm.width);
      const armAtk = atk && (atk.id === 'pincer' || atk.id === 'tailwhip') ? Math.sin(atkT * Math.PI) : 0;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * W * 0.42, bodyBottom - H * 0.52);
        ctx.scale(side, 1);
        ctx.rotate(-0.4 - armAtk * 1.1 + Math.sin((pose.walkPhase || 0) * 1.6) * 0.1);
        ctx.drawImage(armIm, -aw * 0.15, -ah * 0.2, aw, ah);
        ctx.restore();
      }
    }
  }

  // ---- body ----
  ctx.save();
  ctx.scale(squash, 1 / squash);
  ctx.drawImage(bodyIm, -W / 2, bodyBottom - H, W, H);
  ctx.restore();

  // ---- armor overlays (kept simple + readable over sprites) ----
  if (design.armor.includes('chitin') || design.armor.includes('shell')) {
    ctx.strokeStyle = design.armor.includes('shell') ? 'rgba(40,45,60,0.85)' : 'rgba(40,45,60,0.5)';
    ctx.lineWidth = R * (design.armor.includes('shell') ? 0.16 : 0.1);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, bodyBottom - H * 0.62 + i * H * 0.16, W * 0.34, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
  if (design.armor.includes('spikes')) {
    const dIm = spr('detail_dark_horn_small');
    if (dIm) {
      const sw = R * 0.42, shh = sw * (dIm.height / dIm.width);
      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.translate(i * W * 0.26, bodyBottom - H * 0.98);
        ctx.rotate(i * 0.35);
        ctx.drawImage(dIm, -sw / 2, -shh * 0.7, sw, shh);
        ctx.restore();
      }
    }
  }

  // ---- head details for weapons/organs ----
  const headY = bodyBottom - H * 0.92;
  if (design.weapons.includes('horn')) {
    const hIm = spr('detail_' + kc + '_horn_large');
    if (hIm) {
      const hw = R * 0.8, hh = hw * (hIm.height / hIm.width);
      ctx.drawImage(hIm, W * 0.12, headY - hh * 0.55, hw, hh);
    }
  }
  if (design.weapons.includes('stinger')) {
    const aIm = spr('detail_' + kc + '_antenna_large');
    if (aIm) {
      const aw2 = R * 0.55, ah2 = aw2 * (aIm.height / aIm.width);
      ctx.drawImage(aIm, -W * 0.35, headY - ah2 * 0.75, aw2, ah2);
    }
  }
  if (design.organs.includes('gyro')) {
    const eIm = spr('detail_' + kc + '_ear_round');
    if (eIm) {
      const ew = R * 0.5, eh = ew * (eIm.height / eIm.width);
      ctx.drawImage(eIm, -W * 0.52, headY + eh * 0.1, ew, eh);
    }
  }

  // ---- face ----
  const attacking = atk && atkT > 0.15 && atkT < 0.75;
  const mouthPair = MOUTH_FOR_WEAPON[design.weapons[0]] || ['mouthA', 'mouthE'];
  const mouthIm = spr(attacking ? mouthPair[1] : mouthPair[0]) || spr(mouthPair[0]);
  if (mouthIm) {
    const mw = W * 0.34 * (attacking ? 1.25 : 1), mh = mw * (mouthIm.height / mouthIm.width);
    ctx.drawImage(mouthIm, W * 0.08 - mw / 2 + W * 0.14, bodyBottom - H * 0.38 - mh / 2, mw, mh);
  }
  const eyeName = pose.dead ? 'eye_dead' : pose.blink ? 'eye_closed_happy' : (EYE_SPRITE[design.eyes] || 'eye_cute_light');
  const eyeIm = spr(eyeName);
  if (eyeIm) {
    const es = design.eyes === 'big' ? W * 0.24 : W * 0.19;
    const eh2 = es * (eyeIm.height / eyeIm.width);
    const eyeY = bodyBottom - H * 0.66 - eh2 / 2;
    ctx.drawImage(eyeIm, W * 0.02, eyeY, es, eh2);
    ctx.drawImage(eyeIm, W * 0.3, eyeY, es, eh2);
    if (design.eyes === 'angry') {
      const bIm = spr('eyebrowB');
      if (bIm) {
        const bw = es * 1.15, bh = bw * (bIm.height / bIm.width);
        ctx.drawImage(bIm, W * 0.0, eyeY - bh * 0.8, bw, bh);
        ctx.drawImage(bIm, W * 0.28, eyeY - bh * 0.8, bw, bh);
      }
    }
  }

  ctx.filter = 'none';
  ctx.restore();
}

// ============================================================
// VECTOR RENDERER — original procedural art, kept as fallback
// (headless tests, missing assets, instant first paint).
// ============================================================
function drawVectorCreature(ctx, design, stats, pose, opts = {}) {
  const R = (stats ? stats.R : 26 * (design.size || 1)) * (opts.scale || 1);
  const sh = BODY_SHAPES[design.body] || BODY_SHAPES.pod;
  const cA = design.colors.a, cB = design.colors.b;
  const atk = pose.attack;
  const lungeT = atk && atk.kind === 'ram' ? Math.sin(Math.min(1, atk.t) * Math.PI) : 0;

  ctx.save();
  ctx.translate(pose.x, pose.y);

  // shadow
  ctx.save();
  ctx.scale(1, 0.9);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, R * 0.18, R * sh.rx * 1.05, R * sh.ry * 0.95, 0, 0, 7);
  ctx.fill();
  ctx.restore();

  // team ring
  if (opts.teamColor) {
    ctx.strokeStyle = opts.teamColor;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.45, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.rotate(pose.ang);
  if (pose.dead) ctx.globalAlpha = 0.55;

  const rx = R * sh.rx, ry = R * sh.ry;

  // ---- legs ----
  drawLegs(ctx, design, R, rx, ry, pose, cB);

  // ---- tail weapons (behind body) ----
  for (const w of design.weapons) {
    if (w === 'tailwhip') drawTail(ctx, R, rx, pose, cA, cB, atk && atk.id === 'tailwhip' ? atk.t : -1, false);
    if (w === 'stinger') drawTail(ctx, R, rx, pose, cA, cB, atk && atk.id === 'stinger' ? atk.t : -1, true);
  }

  // ---- body ----
  const grad = ctx.createRadialGradient(-rx * 0.2, -ry * 0.35, R * 0.15, 0, 0, Math.max(rx, ry) * 1.2);
  grad.addColorStop(0, shade(cA, 0.25));
  grad.addColorStop(0.65, cA);
  grad.addColorStop(1, shade(cA, -0.35));
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (design.body === 'longback') {
    // segmented capsule
    ctx.ellipse(rx * 0.45, 0, rx * 0.62, ry, 0, 0, 7);
    ctx.ellipse(-rx * 0.35, 0, rx * 0.55, ry * 0.9, 0, 0, 7);
  } else {
    ctx.ellipse(0, 0, rx, ry, 0, 0, 7);
  }
  ctx.fill();
  ctx.strokeStyle = shade(cB, -0.2);
  ctx.lineWidth = Math.max(1.5, R * 0.06);
  ctx.stroke();

  // pattern
  drawPattern(ctx, design.pattern, rx, ry, cB, R);

  // ---- armor overlays ----
  if (design.armor.includes('chitin')) {
    ctx.strokeStyle = shade(cB, -0.1);
    ctx.lineWidth = R * 0.09;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(rx * 0.15 + i * rx * 0.32, 0, ry * 0.75, -1.1, 1.1);
      ctx.stroke();
    }
  }
  if (design.armor.includes('shell')) {
    const g2 = ctx.createRadialGradient(-R * 0.1, -R * 0.1, R * 0.1, 0, 0, ry * 0.95);
    g2.addColorStop(0, shade(cB, 0.35));
    g2.addColorStop(1, shade(cB, -0.25));
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(-rx * 0.05, 0, rx * 0.62, ry * 0.8, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = shade(cB, -0.4);
    ctx.lineWidth = R * 0.05;
    ctx.stroke();
  }
  if (design.armor.includes('spikes')) {
    ctx.fillStyle = shade(cB, 0.15);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const px = Math.cos(a) * rx * 0.85, py = Math.sin(a) * ry * 0.85;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.07); ctx.lineTo(R * 0.24, 0); ctx.lineTo(0, R * 0.07);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---- front weapons ----
  const headX = design.body === 'longback' ? rx * 1.0 : rx * 0.92;
  for (const w of design.weapons) {
    const t = atk && atk.id === w ? atk.t : -1;
    if (w === 'jaw') drawJaw(ctx, headX, R, cB, t, 0.8);
    if (w === 'crusher') drawJaw(ctx, headX, R * 1.3, shade(cB, -0.15), t, 1.15);
    if (w === 'horn') drawHorn(ctx, headX, R, cB, lungeT);
    if (w === 'spitter') drawSpitter(ctx, headX, R, cA, cB, t);
    if (w === 'pincer') drawPincers(ctx, headX, R, cB, t);
  }

  // ---- eyes ----
  drawEyes(ctx, design, headX, R, ry, pose);

  // hurt flash
  if (pose.hurt > 0) {
    ctx.globalAlpha = pose.hurt * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.02, ry * 1.02, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawLegs(ctx, design, R, rx, ry, pose, cB) {
  const pairs = design.legs.pairs;
  const type = design.legs.type;
  const phase = pose.walkPhase || 0;
  const amt = pose.moveAmt !== undefined ? pose.moveAmt : 1;
  const legsLost = pose.legsLost || 0;
  const lw = { scuttler: 0.09, springer: 0.11, stomper: 0.2, strider: 0.08 }[type] * R;
  const len = { scuttler: 0.85, springer: 0.95, stomper: 0.7, strider: 1.3 }[type] * R;
  ctx.strokeStyle = shade(cB, -0.15);
  ctx.lineWidth = Math.max(2, lw);
  ctx.lineCap = 'round';
  for (let i = 0; i < pairs; i++) {
    const fx = pairs === 1 ? 0 : lerpN(-0.55, 0.55, i / (pairs - 1));
    for (const side of [-1, 1]) {
      // severed legs (injury system): rear legs go first, then alternate sides
      const legIndex = i * 2 + (side > 0 ? 1 : 0);
      if (legIndex < legsLost) {
        // stump
        ctx.beginPath();
        ctx.moveTo(fx * rx, side * ry * 0.8);
        ctx.lineTo(fx * rx + R * 0.06, side * (ry * 0.8 + R * 0.16));
        ctx.stroke();
        continue;
      }
      const p = phase + i * 1.9 + (side > 0 ? Math.PI : 0);
      const swing = Math.sin(p) * 0.45 * amt;
      const lift = Math.max(0, Math.cos(p)) * 0.15 * amt;
      const bx = fx * rx, by = side * ry * 0.8;
      const kx = bx + Math.sin(swing) * len * 0.5;
      const ky = by + side * len * (0.55 - lift);
      const ex = bx + Math.sin(swing) * len;
      const ey = by + side * len * (0.95 - lift);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      if (type === 'springer' || type === 'strider') {
        ctx.quadraticCurveTo(kx - len * 0.2, ky, ex, ey);
      } else {
        ctx.quadraticCurveTo(kx, ky, ex, ey);
      }
      ctx.stroke();
      if (type === 'stomper') {
        ctx.fillStyle = shade(cB, -0.3);
        ctx.beginPath();
        ctx.arc(ex, ey, lw * 0.75, 0, 7);
        ctx.fill();
      }
    }
  }
}

function drawPattern(ctx, pattern, rx, ry, cB, R) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.94, ry * 0.94, 0, 0, 7);
  ctx.clip();
  ctx.fillStyle = shade(cB, 0.05);
  ctx.globalAlpha = 0.85;
  if (pattern === 'spots') {
    const pts = [[-0.4, -0.3, 0.2], [0.2, 0.35, 0.16], [0.45, -0.25, 0.13], [-0.15, 0.15, 0.11], [-0.6, 0.25, 0.13]];
    for (const [x, y, r] of pts) {
      ctx.beginPath();
      ctx.ellipse(x * rx, y * ry, r * R, r * R * 0.85, 0, 0, 7);
      ctx.fill();
    }
  } else if (pattern === 'stripes') {
    ctx.lineWidth = R * 0.14;
    ctx.strokeStyle = shade(cB, 0.05);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * rx * 0.35 - rx * 0.15, -ry);
      ctx.quadraticCurveTo(i * rx * 0.35 + rx * 0.18, 0, i * rx * 0.35 - rx * 0.15, ry);
      ctx.stroke();
    }
  } else if (pattern === 'belly') {
    ctx.beginPath();
    ctx.ellipse(rx * 0.1, ry * 0.25, rx * 0.6, ry * 0.5, 0, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEyes(ctx, design, headX, R, ry, pose) {
  const ey = ry * 0.34;
  const ex = headX * 0.72;
  const er = design.eyes === 'big' ? R * 0.2 : R * 0.14;
  const blink = pose.blink ? 0.15 : 1;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, side * ey, er, er * blink, 0, 0, 7);
    ctx.fill();
    if (blink > 0.5) {
      ctx.fillStyle = '#14202e';
      ctx.beginPath();
      ctx.arc(ex + er * 0.35, side * ey, er * 0.52, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + er * 0.15, side * ey - er * 0.2, er * 0.18, 0, 7);
      ctx.fill();
    }
  }
  if (design.eyes === 'angry') {
    ctx.strokeStyle = '#14202e';
    ctx.lineWidth = R * 0.06;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ex - er, side * (ey - er * 0.9));
      ctx.lineTo(ex + er * 0.8, side * (ey - er * 0.1));
      ctx.stroke();
    }
  }
}

function drawJaw(ctx, headX, R, color, t, w) {
  // mandibles that open then snap: open widest at t≈0.4, closed at t≥0.7
  let open = 0.35;
  if (t >= 0) open = t < 0.45 ? 0.35 + t * 1.6 : Math.max(0.05, 1.05 - (t - 0.45) * 4);
  ctx.strokeStyle = shade(color, 0.1);
  ctx.lineWidth = R * 0.13 * w;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(headX * 0.92, side * R * 0.18);
    ctx.quadraticCurveTo(
      headX + R * 0.42 * w, side * (R * 0.1 + open * R * 0.38),
      headX + R * 0.62 * w, side * open * R * 0.3
    );
    ctx.stroke();
  }
}

function drawHorn(ctx, headX, R, color, lungeT) {
  const ext = 1 + lungeT * 0.35;
  ctx.fillStyle = shade(color, 0.25);
  ctx.beginPath();
  ctx.moveTo(headX * 0.8, -R * 0.22);
  ctx.lineTo(headX + R * 0.75 * ext, 0);
  ctx.lineTo(headX * 0.8, R * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.2);
  ctx.lineWidth = R * 0.04;
  ctx.stroke();
}

function drawSpitter(ctx, headX, R, cA, cB, t) {
  ctx.fillStyle = shade(cB, 0.2);
  const puff = t >= 0 && t < 0.3 ? 1.25 : 1;
  ctx.beginPath();
  ctx.ellipse(headX * 0.95, 0, R * 0.3 * puff, R * 0.22 * puff, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#0e1526';
  ctx.beginPath();
  ctx.arc(headX * 0.95 + R * 0.16, 0, R * 0.09, 0, 7);
  ctx.fill();
}

function drawPincers(ctx, headX, R, color, t) {
  let open = 0.5;
  if (t >= 0) open = t < 0.4 ? 0.5 + t : Math.max(0.1, 0.9 - (t - 0.4) * 3);
  ctx.fillStyle = shade(color, 0.15);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(headX * 0.75, side * R * 0.5);
    ctx.rotate(side * (0.5 - open * 0.5));
    ctx.beginPath();
    ctx.ellipse(R * 0.3, 0, R * 0.34, R * 0.18, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(R * 0.45, side * -R * 0.12);
    ctx.lineTo(R * 0.75, 0);
    ctx.lineTo(R * 0.45, side * R * 0.12);
    ctx.fill();
    ctx.restore();
  }
}

function drawTail(ctx, R, rx, pose, cA, cB, t, barbed) {
  // t=-1 idle wag; during attack sweeps hard
  const wag = t >= 0 ? Math.sin(t * Math.PI * 2) * 1.1 : Math.sin((pose.walkPhase || 0) * 0.7) * 0.28;
  ctx.strokeStyle = shade(cA, -0.12);
  ctx.lineWidth = R * 0.16;
  ctx.lineCap = 'round';
  const bx = -rx * 0.9;
  const tx = bx - R * 1.1, ty = wag * R * 0.9;
  ctx.beginPath();
  ctx.moveTo(bx, 0);
  ctx.quadraticCurveTo(bx - R * 0.5, wag * R * 0.35, tx, ty);
  ctx.stroke();
  if (barbed) {
    ctx.fillStyle = shade(cB, 0.3);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(Math.atan2(ty, tx - bx));
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.14); ctx.lineTo(-R * 0.38, 0); ctx.lineTo(0, R * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(tx, ty, R * 0.11, 0, 7);
    ctx.fillStyle = shade(cA, -0.12);
    ctx.fill();
  }
}

function lerpN(a, b, t) { return a + (b - a) * t; }

// ---------- card thumbnail ----------
export function renderCreatureCard(canvas, design, stats) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 260, h = canvas.clientHeight || 120;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const R = stats ? stats.R : 26;
  const scale = Math.min(1.1, (h * 0.42) / R);
  drawCreature(ctx, design, stats, {
    x: w / 2, y: h * 0.58, ang: -Math.PI / 2 + 0.35,
    walkPhase: 1.2, moveAmt: 0.25, attack: null, hurt: 0,
  }, { scale });
}
