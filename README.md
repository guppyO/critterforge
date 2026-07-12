# 🧬 CRITTERFORGE
### Build it · Train it · Unleash it

**▶ PLAY NOW: https://guppyo.github.io/critterforge/** — share this link with friends and
battle them online via *VS Friend* room codes.

A creature-building **auto-battler** inspired by Bamzooki, Toribash and Spore. You design a
creature from bodies, legs, jaws, horns and strange organs — a critter from one of **six home
planets** — then release it into the arena to **fight, shove and race entirely on its own**.
You are the engineer, not the pilot. Legs come off. Goo gets everywhere. Friends are battled.

Near-zero dependencies (PeerJS vendored for online play). Pure HTML5 canvas + ES modules +
WebAudio. Runs in any modern browser, packages to Steam via Electron or Tauri (guide below).

---

## Running the game

```bash
node server.cjs        # then open http://localhost:8642
```

(Any static file server works — ES modules just need HTTP, not `file://`. The public
GitHub Pages deployment is what you share with friends for online battles.)

---

## The Game

| | |
|---|---|
| **The Lab** | Part-based creature editor: parts, colors, home planet, live animated preview, budget meter |
| **Ranked Duel** | 1v1 auto-battle vs matched opponents. The core ranked mode |
| **🌐 VS Friend** | Online battles over WebRTC: host shares a 4-letter room code, both machines run the identical deterministic sim |
| **Sumo Showdown** | Shove them out of a shrinking ring — mass and knockback rule. Ranked |
| **Team Rumble** | 2v2 / 3v3 with your own stable. Ranked (reduced K-factor) |
| **Critter Grand Prix** | 6-racer track with mud pits and boost pads. Big DNA payouts |
| **The Gauntlet** | 10-stage push-your-luck ladder. Bank DNA each win; lose and keep only half; cash out anytime |
| **💀 Boneyard League** | Opt-in permadeath: triple rewards and streak bonuses, but a loss kills your critter forever. The Graveyard remembers |
| **📺 The Circuit** | Live AI exhibition matches, 24/7. Odds are computed by *actually simulating the matchup*; stake DNA on your pick |
| **Gene Shop** | Spend DNA on permanent part unlocks and stable slots |

**Injury system:** at health thresholds, legs tear off (slowing the victim), debris and
ichor stay on the arena floor, and KOs scatter parts. Splatter style is a setting:
🫧 Goo (colorful, default) / 🩸 Blood / 🚫 Off.

**Home planets:** Meridian (neutral), Verdantia 🌿 (+regen/−speed), Pyrion 🌋 (+damage/−hp),
Glaciem ❄️ (+armor/−speed), Zephyros 🌪️ (+speed/−hp), Umbra 🌑 (+crit+dodge/−hp). Free to
choose, small tradeoffs, themed arenas — **with live terrain**: lava vents that pulse and
scorch, ice sheets that kill your grip, grasping vines, storm gusts that shove the whole
arena, and shadow pools that make you harder to hit.

**Replays & sparring:** every battle produces a shareable replay code (`CFR1.…`) that
replays bit-identically in the Replay Theater; the Sparring Pit pits your own critters
against each other. **16 milestones** pay DNA bounties and map 1:1 to Steam achievements.

## Design decisions (the brief asked me to decide — here's what and why)

### ⚖️ Balance: the Bio-Budget
Every part costs points and **every creature gets the same 100-point budget**, in every mode,
at every rank. A walking fortress gives up speed; a speedster gives up armor. Power is a
*design puzzle*, not a grind — the Bamzooki "zook rules" idea, enforced structurally.
Leveling adds only small, capped bonuses (max ~+13% at level 10) and matchmaking matches
opponent level, so veterans win by better *designs*, not bigger numbers.

### 💀 Should losing kill the creature? **Not by default — but you can sign the waiver.**
Permadeath punishes exactly the thing the game celebrates — creative investment — so core
modes never take your creation; losses cost **rating, rewards and pride**. Stakes-lovers get
two opt-ins: **The Gauntlet** (a loss ends the run and burns half the banked prize) and the
**Boneyard League**, where entry means true permadeath — triple rewards, streak bonuses, and
a gravestone with a procedurally chosen epitaph if it goes wrong. Stakes live in the mode,
and entering them is always a choice.

### 🧪 Currency: DNA
One soft currency. Every match pays it (winning pays ~3×), so a losing streak still makes
progress. Sinks: permanent part unlocks (50–300), stable expansions (200–1600). No premium
currency, no timers, no gacha — it's a game, not a slot machine.

### 🧠 Do creatures learn? Yes — capped.
Creatures earn XP in every mode, level to 10, and pick a **trait** at levels 3/6/9
(choose 1 of 3 random — a light roguelite touch that makes two identical designs diverge).
Bonuses are deliberately small so the budget stays the great equalizer.

### 🏆 Ranked
Elo rating (K=32 duels, reduced for sumo/team), leagues **Bronze → Silver → Gold → Platinum →
Diamond → Legend**, rating floor at 800 so nobody gets buried. Opponents are procedurally
generated near your rating and level — at low ranks they field scrappy, half-built critters;
at Legend they run fully-optimized budget builds discovered by simulation (see below).

### 👥 Team fights
Supported (2v2/3v3 from your own stable) with target selection, ally separation and shared
team HP bars. Requires 2+ creatures, giving the stable a reason to exist beyond one champion.

---

## The simulation

Fixed-timestep (60 Hz), seeded-RNG deterministic core — the same engine runs headless in Node
for balance testing and on canvas for play.

**Combat model:** health / stamina / armor (diminishing returns), melee arcs with windup →
strike → recover, ranged projectiles with target leading, ram charges whose damage scales with
impact speed, poison DoT (ignores armor — the anti-tank tool), slows, crits, dodges, counters,
rage triggers, spike reflection, second-wind heals… and **positional play**: hits from behind
deal +35%, so speed converts into offense by out-turning slow builds.

**AI:** per-creature steering with independent facing and movement (backpedal/strafe), plus
tactic selection from a trade-favorability estimate — face-tank when trades win, orbit-flank
when faster, hit-and-run skirmishing with hysteresis, drive-by kiting for ranged builds,
ring-edge awareness in sumo, aggro selection and spacing in team fights.

**Judged decisions:** if the clock runs out, remaining health % decides it — kiters can win
on points, so pure evasion is a strategy but never a stall.

## Balance methodology (test/ folder)

Balance was tuned with simulation, not vibes:

- `node test/balance.mjs` — full win-rate matrix between the 8 opponent archetypes
- `node test/probe.mjs A B` — blow-by-blow log of one fight (hits, stamina, distance)
- `node test/sweep.mjs` — **meta explorer**: generates 150+ random legal builds, fights them
  all vs the field, ranks them, and reports per-part win rates

Result: per-part win rates sit in a healthy 28–55% band (no dominant part), the archetype
matrix has genuine rock-paper-scissors (lancer > juggernaut > brawler…; artillery > lancer;
scorpion > artillery), and the strongest discovered builds became the high-rank opponent pool.
The worst builds are simply *under-spent budgets* — which is the design working.

## Architecture

```
index.html            shell + sim overlay + modal/toast layers
css/style.css         complete UI theme
js/
  util.js             math, seeded RNG, DOM helpers, hidden-tab-safe game loop
  audio.js            synthesized SFX + generative ambient music (WebAudio, no assets)
  parts.js            ★ part catalog + budget + stat derivation (the balance core)
  creature.js         creature model, XP/levels, traits
  drawing.js          procedural creature renderer (bodies, animated legs, weapons, patterns)
  battle.js           ★ auto-battle engine: duel/team/sumo, AI, physics, effects
  race.js             track generation + racing sim
  opponents.js        archetype-based opponent generator scaled by rating
  league.js           profile/save, Elo, leagues, rewards, gauntlet economy
  editor.js           the Lab (builder UI + live pen)
  screens.js          menu/stable/shop/modes/gauntlet/settings/howto
  ui-bits.js          toasts + modals
  main.js             router, sim overlay runner, match orchestration, onboarding
test/                 balance.mjs · probe.mjs · sweep.mjs
```

Save data: `localStorage` (versioned, migration-safe). All art and audio are procedural —
the entire game is ~6,000 lines with **no binary assets**.

---

## 🚂 Shipping to Steam

The game is deliberately engine-free web tech, which packages cleanly:

### Electron (fastest path)
```bash
npm init -y && npm i -D electron electron-builder
```
`electron/main.js`:
```js
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1280, height: 800, autoHideMenuBar: true });
  win.loadFile('index.html');   // file:// works if you bundle; or serve internally
});
```
> Note: ES modules need `webSecurity` friendly loading — either bundle with esbuild
> (`npx esbuild js/main.js --bundle --outfile=dist/game.js`) or run the embedded static
> server from `server.cjs` inside Electron and `win.loadURL('http://localhost:8642')`.

Then `electron-builder` produces the Windows build; upload with Steamworks `steamcmd`.

### Tauri (smaller binaries, ~5 MB)
Same idea with a Rust shell: `npm create tauri-app`, point it at this folder as the dist dir.

### Steam checklist
- **Steamworks SDK**: wrap achievements ("First KO", "Legend League", "Gauntlet Champion",
  "Own every part") via `steamworks.js` (Electron) or `tauri-plugin-steamworks`
- Replace `localStorage` with Steam Cloud saves (drop-in: serialize the same `G` object)
- Capsule art, trailer of auto-battles (the sim is deterministic — record with seeds!)
- Store tags: Auto Battler · Sandbox · Creature Collector · Family Friendly

### Roadmap ideas (post-v1)
- Async PvP: export/import creature codes; fight snapshots of friends' stables
- Seasons with cosmetic rewards; weekly mutation challenges (budget 80, no armor, etc.)
- Workshop part-pack support (parts are pure data — trivially moddable)
- Replays + spectate (seeded determinism makes replays a 30-line feature)

---

*Built with zero dependencies. Every critter you'll ever see was drawn by math.* 🧮
