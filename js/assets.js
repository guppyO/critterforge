// ============================================================
// Asset loader: Kenney Monster Builder sprites (CC0), ambientCG
// floor textures (CC0). Everything degrades gracefully — if an
// image is missing (or we're headless in Node), renderers fall
// back to the procedural vector art.
// ============================================================
export const SPRITE_NAMES = ['arm_blueA','arm_blueB','arm_blueC','arm_blueD','arm_blueE','arm_darkA','arm_darkB','arm_darkC','arm_darkD','arm_darkE','arm_greenA','arm_greenB','arm_greenC','arm_greenD','arm_greenE','arm_redA','arm_redB','arm_redC','arm_redD','arm_redE','arm_whiteA','arm_whiteB','arm_whiteC','arm_whiteD','arm_whiteE','arm_yellowA','arm_yellowB','arm_yellowC','arm_yellowD','arm_yellowE','body_blueA','body_blueB','body_blueC','body_blueD','body_blueE','body_blueF','body_darkA','body_darkB','body_darkC','body_darkD','body_darkE','body_darkF','body_greenA','body_greenB','body_greenC','body_greenD','body_greenE','body_greenF','body_redA','body_redB','body_redC','body_redD','body_redE','body_redF','body_whiteA','body_whiteB','body_whiteC','body_whiteD','body_whiteE','body_whiteF','body_yellowA','body_yellowB','body_yellowC','body_yellowD','body_yellowE','body_yellowF','detail_blue_antenna_large','detail_blue_antenna_small','detail_blue_ear','detail_blue_ear_round','detail_blue_eye','detail_blue_horn_large','detail_blue_horn_small','detail_dark_antenna_large','detail_dark_antenna_small','detail_dark_ear','detail_dark_ear_round','detail_dark_eye','detail_dark_horn_large','detail_dark_horn_small','detail_green_antenna_large','detail_green_antenna_small','detail_green_ear','detail_green_ear_round','detail_green_eye','detail_green_horn_large','detail_green_horn_small','detail_red_antenna_large','detail_red_antenna_small','detail_red_ear','detail_red_ear_round','detail_red_eye','detail_red_horn_large','detail_red_horn_small','detail_white_antenna_large','detail_white_antenna_small','detail_white_ear','detail_white_ear_round','detail_white_eye','detail_white_horn_large','detail_white_horn_small','detail_yellow_antenna_large','detail_yellow_antenna_small','detail_yellow_ear','detail_yellow_ear_round','detail_yellow_eye','detail_yellow_horn_large','detail_yellow_horn_small','eye_angry_blue','eye_angry_green','eye_angry_red','eye_blue','eye_closed_feminine','eye_closed_happy','eye_cute_dark','eye_cute_light','eye_dead','eye_human','eye_human_blue','eye_human_green','eye_human_red','eye_psycho_dark','eye_psycho_light','eye_red','eye_yellow','eyebrowA','eyebrowB','eyebrowC','leg_blueA','leg_blueB','leg_blueC','leg_blueD','leg_blueE','leg_darkA','leg_darkB','leg_darkC','leg_darkD','leg_darkE','leg_greenA','leg_greenB','leg_greenC','leg_greenD','leg_greenE','leg_redA','leg_redB','leg_redC','leg_redD','leg_redE','leg_whiteA','leg_whiteB','leg_whiteC','leg_whiteD','leg_whiteE','mouth_closed_fangs','mouth_closed_happy','mouth_closed_sad','mouth_closed_teeth','mouthA','mouthB','mouthC','mouthD','mouthE','mouthF','mouthG','mouthH','mouthI','mouthJ','nose_brown','nose_green','nose_red','nose_yellow','snot_large','snot_small'];

export const TEX_NAMES = ['meridian', 'verdantia', 'pyrion', 'glaciem', 'zephyros', 'umbra'];

export const IMG = {};   // sprite name → Image
export const TEX = {};   // planet → Image (floor texture)
let _ready = false;
export const spritesReady = () => _ready;

function loadOne(store, key, src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { store[key] = im; res(true); };
    im.onerror = () => res(false);
    im.src = src;
  });
}

export function loadAssets() {
  if (typeof Image === 'undefined') return Promise.resolve(); // headless
  const jobs = [
    ...SPRITE_NAMES.map(n => loadOne(IMG, n, `assets/monster/${n}.png`)),
    ...TEX_NAMES.map(n => loadOne(TEX, 'tex_' + n, `assets/tex/${n}.jpg`)),
  ];
  return Promise.all(jobs).then(() => {
    _ready = Object.keys(IMG).length > 120; // enough parts to composite
  });
}

// Kenney's six baked sprite colors, with hex equivalents used for
// particles/ichor/UI so everything stays cohesive.
export const KCOLORS = {
  green:  { a: '#79c141', b: '#3e7220' },
  blue:   { a: '#5aa9e6', b: '#1e4e79' },
  red:    { a: '#e8593c', b: '#8a2b18' },
  yellow: { a: '#f2c231', b: '#8f6c0e' },
  white:  { a: '#e7ebee', b: '#7d868c' },
  dark:   { a: '#5b6470', b: '#23282e' },
};

const KKEYS = Object.keys(KCOLORS);

// nearest kenney color for an arbitrary hex (legacy saves / opponents)
export function nearestKColor(hex) {
  try {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    let best = 'green', bd = 1e9;
    for (const k of KKEYS) {
      const m = parseInt(KCOLORS[k].a.slice(1), 16);
      const dr = r - ((m >> 16) & 255), dg = g - ((m >> 8) & 255), db = b - (m & 255);
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  } catch (e) { return 'green'; }
}

export function kcolorOf(design) {
  if (design.kcolor && KCOLORS[design.kcolor]) return design.kcolor;
  return nearestKColor(design.colors && design.colors.a || '#79c141');
}
