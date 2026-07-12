// ============================================================
// Shareable replay codes. The sim is deterministic, so a whole
// battle compresses to: creatures + mode + seed. Paste a code
// into the Replay Theater and watch the exact same fight.
// ============================================================
import { NET_VERSION, sanitizeRemoteCreature, packCreature } from './net.js';

const MAGIC = 'CFR1.';

export function encodeReplay({ mode, seed, teams }) {
  const data = { v: NET_VERSION, m: mode, s: seed >>> 0, t: teams.map(team => team.map(packCreature)) };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return MAGIC + b64;
}

export function decodeReplay(code) {
  try {
    code = String(code || '').trim();
    if (!code.startsWith(MAGIC)) return { err: 'That doesn’t look like a replay code.' };
    let b64 = code.slice(MAGIC.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (data.v !== NET_VERSION) return { err: 'Replay is from a different game version.' };
    if (!['duel', 'sumo', 'team'].includes(data.m)) return { err: 'Unknown battle mode.' };
    const teams = [];
    for (const rawTeam of (data.t || []).slice(0, 2)) {
      const team = [];
      for (const raw of rawTeam.slice(0, 3)) {
        const res = sanitizeRemoteCreature(raw);
        if (res.err) return { err: 'Bad creature in replay: ' + res.err };
        team.push(res.cre);
      }
      if (!team.length) return { err: 'Empty team in replay.' };
      teams.push(team);
    }
    if (teams.length !== 2) return { err: 'Replay needs two teams.' };
    return { mode: data.m, seed: data.s >>> 0, teams };
  } catch (e) { return { err: 'Corrupt replay code.' }; }
}
