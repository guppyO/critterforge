// ============================================================
// Online friend battles via PeerJS (WebRTC + free cloud broker).
// The sim is deterministic, so netplay is just a handshake:
// exchange creatures, host picks a seed, both machines run the
// exact same battle locally. No state sync needed mid-fight.
// ============================================================
import { validateDesign, budgetOf, PLANETS } from './parts.js';
import { TRAITS } from './creature.js';

export const NET_VERSION = 5; // bump when sim behavior changes
const PREFIX = 'critterforge-v5-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars

export function makeCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

let peer = null, conn = null;

export function netActive() { return !!peer; }

export function closeNet() {
  try { if (conn) conn.close(); } catch (e) {}
  try { if (peer) peer.destroy(); } catch (e) {}
  peer = null; conn = null;
}

function wire(c, cbs) {
  conn = c;
  c.on('data', (msg) => { try { cbs.onMessage(msg); } catch (e) { console.error(e); } });
  c.on('close', () => cbs.onClose && cbs.onClose());
  c.on('error', (e) => cbs.onError && cbs.onError(e));
}

export function send(msg) { if (conn && conn.open) conn.send(msg); }

// host: open a room and wait for one guest
export function host(code, cbs) {
  closeNet();
  peer = new window.Peer(PREFIX + code, { debug: 0 });
  peer.on('open', () => cbs.onReady && cbs.onReady(code));
  peer.on('connection', (c) => {
    if (conn) { c.close(); return; } // one guest only
    c.on('open', () => { wire(c, cbs); cbs.onConnected && cbs.onConnected(); });
  });
  peer.on('error', (e) => cbs.onError && cbs.onError(e));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
}

// guest: join a host's room
export function join(code, cbs) {
  closeNet();
  peer = new window.Peer({ debug: 0 });
  peer.on('open', () => {
    const c = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
    let opened = false;
    c.on('open', () => { opened = true; wire(c, cbs); cbs.onConnected && cbs.onConnected(); });
    setTimeout(() => { if (!opened) cbs.onError && cbs.onError(new Error('No room with that code (or host closed it).')); }, 9000);
  });
  peer.on('error', (e) => cbs.onError && cbs.onError(e));
}

// ---- anti-cheat-lite: validate a creature received from the network ----
export function sanitizeRemoteCreature(raw) {
  try {
    const d = raw.design;
    if (!d || typeof d !== 'object') return { err: 'bad design' };
    d.planet = PLANETS[d.planet] ? d.planet : 'meridian';
    d.size = Math.min(1.25, Math.max(0.85, Number(d.size) || 1));
    const errs = validateDesign(d);
    if (errs.length) return { err: 'illegal build: ' + errs[0] };
    if (budgetOf(d) > 100) return { err: 'over budget' };
    const level = Math.min(10, Math.max(1, Math.round(Number(raw.level) || 1)));
    const traits = Array.isArray(raw.traits) ? raw.traits.filter(t => TRAITS[t]).slice(0, 3) : [];
    const name = String(raw.name || 'Rival Critter').slice(0, 16);
    return {
      cre: {
        id: 'net-' + Math.random().toString(36).slice(2), name, design: d,
        level, traits, xp: 0,
        wins: Math.max(0, Math.round(Number(raw.wins) || 0)),
        losses: Math.max(0, Math.round(Number(raw.losses) || 0)),
        pendingTraitPicks: 0,
      },
    };
  } catch (e) { return { err: 'corrupt creature data' }; }
}

export function packCreature(cre) {
  return {
    name: cre.name, design: cre.design, level: cre.level,
    traits: cre.traits, wins: cre.wins, losses: cre.losses,
  };
}
