// San Francisco Bay geography, stylized but recognizable.
// World units = meters. Origin = SF City Hall. x=east, z=south (y=up).

export const LAT0 = 37.7793;
export const LON0 = -122.4193;
const KX = 87900; // m per degree longitude at this latitude
const KZ = 111000; // m per degree latitude

// lat,lon -> [x,z] in meters
export function ll(lat, lon) {
  return [(lon - LON0) * KX, (LAT0 - lat) * KZ];
}
const poly = (pts) => pts.map(([a, b]) => ll(a, b));

// ---------- land masses ----------
export const SF_PENINSULA = poly([
  [37.8145, -122.4765], // Fort Point (Golden Gate, SF side)
  [37.8075, -122.4430], // Marina
  [37.8075, -122.4225], // Aquatic Park
  [37.8090, -122.4100], // Fisherman's Wharf
  [37.8035, -122.3995], // Telegraph Hill foot
  [37.7995, -122.3930], // Pier 1-3
  [37.7955, -122.3938], // Ferry Building
  [37.7880, -122.3885], // China Basin
  [37.7640, -122.3845], // Mission Bay / Moscone
  [37.7400, -122.3810], // India Basin
  [37.7290, -122.3760], // China Reach
  [37.7120, -122.3695], // Hunters Point
  [37.6950, -122.3720], // Candlestick (end of SF city)
  [37.6600, -122.3900], // Daly City bayfront
  [37.6150, -122.3830], // Millbrae
  [37.5850, -122.4100], // SFO north-west
  [37.5400, -122.4000], // off-map south-east of airport
  [37.5400, -122.5200], // off-map south coast
  [37.5850, -122.5120], // Pacifica
  [37.6300, -122.5110], // Devils Slide
  [37.6800, -122.5090], // San Bruno coast
  [37.7300, -122.5090], // Ocean Beach
  [37.7690, -122.5107], // Cliff House
  [37.7855, -122.5010], // Land's End
  [37.7900, -122.4960], // Lincoln Park
  [37.8075, -122.4800], // Baker Beach
]);

export const EAST_BAY = poly([
  [38.0500, -122.6000], // off-map north-west (inland)
  [37.9350, -122.3520], // Richmond shore
  [37.8650, -122.3060], // Berkeley pier
  [37.8150, -122.2830], // Albany / Kensington shore
  [37.7980, -122.2620], // Oakland Pier
  [37.7400, -122.2200], // San Leandro shore
  [37.6600, -122.1150], // Hayward
  [37.5450, -121.9850], // Fremont / Alviso
  [37.4200, -121.9000], // off-map south bay
  [37.4200, -121.6000], // off-map south-east
  [38.0500, -121.6000], // off-map north-east
]);

export const MARIN = poly([
  [37.8295, -122.4740], // Fort Baker (Golden Gate, Marin side)
  [37.8590, -122.4785], // Sausalito
  [37.8680, -122.4700], // Tiburon neck
  [37.8830, -122.4530], // Tiburon tip
  [37.8760, -122.4690], // back shore
  [37.9050, -122.5150], // Muir side coast
  [37.9300, -122.6500], // off-map west (ocean)
  [38.1500, -122.7500], // off-map north-west
  [38.1500, -122.0500], // off-map north-east
]);

export const ANGEL_ISLAND = poly([
  [37.8740, -122.4370],
  [37.8720, -122.4160],
  [37.8590, -122.4130],
  [37.8520, -122.4280],
  [37.8560, -122.4440],
  [37.8680, -122.4460],
]);

export const YBI_TI = poly([ // Yerba Buena + Treasure Island merged blob
  [37.8320, -122.3850],
  [37.8300, -122.3590],
  [37.8140, -122.3560],
  [37.8050, -122.3720],
  [37.8100, -122.3870],
]);

export const ALAMEDA_ISLAND = poly([
  [37.7980, -122.3100], // Alameda Pt (north-west)
  [37.7950, -122.2830],
  [37.7700, -122.2600], // east end
  [37.7580, -122.2830],
  [37.7640, -122.3090], // San Leandro side
]);

export const LAND = [SF_PENINSULA, EAST_BAY, MARIN, ANGEL_ISLAND, YBI_TI, ALAMEDA_ISLAND];

// ---------- water / bay mask ----------
const BAY_HOLE = poly([
  [37.8200, -122.4765], // just north of the Golden Gate (strait)
  [37.8160, -122.4700],
  [37.8300, -122.4560], // out to sea north-west of the Gate
  [37.9000, -122.5600],
  [37.9900, -122.5600],
  [37.9900, -121.9000], // all of the bay north/east
  [37.4000, -121.9000],
  [37.4000, -122.4000], // south bay west edge (keeps ocean out)
  [37.5600, -122.4200], // tuck in past SFO east side
  [37.7000, -122.3650],
  [37.8000, -122.3900],
  [37.8140, -122.3900],
]);

const PACIFIC = poly([
  [38.2000, -123.5000],
  [37.8160, -123.5000],
  [37.8140, -122.4765], // straight across the Golden Gate mouth
  [37.8000, -122.5200], // then follow SF coast down (west of it)
  [37.7855, -122.5010],
  [37.7690, -122.5107],
  [37.7300, -122.5090],
  [37.6300, -122.5110],
  [37.5400, -122.5200],
  [37.3000, -122.5500],
  [37.3000, -123.5000],
]);

export function isWater(x, z) {
  if (inAny(x, z, LAND)) return false;
  return inPoly(x, z, BAY_HOLE) || inPoly(x, z, PACIFIC);
}

// ---------- point in polygon ----------
export function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function inAny(x, z, polys) {
  for (const p of polys) if (inPoly(x, z, p)) return true;
  return false;
}

// ---------- terrain ----------
const gauss = (x, z, cx, cz, s, h) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
export function terrainH(x, z) {
  if (isWater(x, z)) return 0;
  const g = ll; // readability
  const [tx, tz] = g(37.7544, -122.4477);   // Twin Peaks
  const [mx, mz] = g(37.7326, -122.4580);   // Mt Davidson
  const [nx, nz] = g(37.7930, -122.4170);   // Russian Hill / Nob Hill
  const [px, pz] = g(37.7614, -122.4850);   // Sutro/Twin Peaks west ridge
  const [lx, lz] = g(37.8060, -122.4790);   // Presidio hills (small)
  const [kx, kz] = g(37.8730, -122.4280);   // Angel Island hill
  const [ox, oz] = g(37.8060, -122.3710);   // YBI bump
  const [ex, ez] = g(37.9000, -122.5400);   // Marin headlands ridge
  const [wx, wz] = g(37.8600, -122.2700);   // Berkeley hills (start)
  let h = 0;
  h += gauss(x, z, tx, tz, 900, 42);
  h += gauss(x, z, mx, mz, 1100, 52);
  h += gauss(x, z, nx, nz, 650, 30);
  h += gauss(x, z, px, pz, 800, 34);
  h += gauss(x, z, lx, lz, 700, 16);
  h += gauss(x, z, kx, kz, 900, 40);
  h += gauss(x, z, ox, oz, 500, 22);
  h += gauss(x, z, ex, ez, 1400, 70);
  h += gauss(x, z, wx, wz, 2200, 45);
  return h;
}

// ---------- parks (no buildings) ----------
const [ggpX0] = ll(37.7694, -122.5090); // Golden Gate Park: long rectangle ocean->bay-ward
const [ggpX1] = ll(37.7694, -122.4475);
export const PARKS = [
  { x0: ggpX0, z0: (LAT0 - 37.7716) * KZ, x1: ggpX1, z1: (LAT0 - 37.7648) * KZ }, // GGP
];
// Presidio as polygon instead of rect (cleaner shape)
export const PRESIDIO = poly([
  [37.8145, -122.4765],
  [37.8060, -122.4790],
  [37.7900, -122.4760],
  [37.7890, -122.4600],
  [37.8075, -122.4430],
  [37.8120, -122.4430],
]);
// Golden Gate Park rect (axis aligned)
export const GGP = PARKS[0];

const parkRects = [GGP];
export function isPark(x, z) {
  if (inPoly(x, z, PRESIDIO)) return true;
  for (const r of parkRects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  // small urban parks: Dolores, Civic Center square approximations
  const [d1, d2] = ll(37.7596, -122.4269);
  if (Math.abs(x - d1) < 280 && Math.abs(z - d2) < 180) return true; // Mission Dolores + park
  const [c1, c2] = ll(37.7786, -122.4201);
  if (Math.abs(x - c1) < 200 && Math.abs(z - c2) < 150) return true; // Civic Center
  const [f1, f2] = ll(37.7699, -122.4700);
  if (Math.abs(x - f1) < 350 && Math.abs(z - f2) < 250) return true; // Forest Hill-ish green
  return false;
}

// ---------- SFO airport ----------
export const AIRPORT = (() => {
  const [x0, z0] = ll(37.6490, -122.4160);
  const [x1, z1] = ll(37.5800, -122.3700);
  return { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
})();
// runways: [latA,lonA,latB,lonB]
export const RUNWAYS = [
  [37.6400, -122.4130, 37.5900, -122.3850], // 28L/10R-ish
  [37.6540, -122.4050, 37.5980, -122.3740], // 28R
  [37.6280, -122.4150, 37.5860, -122.3720],
];

// ---------- bridges ----------
const ggbA = ll(37.8145, -122.4765); // SF anchorage
const ggbB = ll(37.8295, -122.4740); // Marin anchorage
export const GOLDEN_GATE = { a: ggbA, b: ggbB };
// Bay Bridge: SF (Yerba Buena area) -> YBI -> Oakland (straight-ish segments)
const bbA = ll(37.7955, -122.3890);
const bbM = ll(37.8100, -122.3715); // YBI
const bbB = ll(37.7990, -122.2660); // Oakland
export const BAY_BRIDGE = { a: bbA, m: bbM, b: bbB };

// ---------- districts for city generation ----------
// Each district: rotated grid of streets + height profile fn(x,z)->meters
const rotSF = -21 * Math.PI / 180;   // SF's famous tilted grid
const rotOak = 38 * Math.PI / 180;   // Oakland/Berkeley shoreline-tilted grid

function hDowntown(x, z) {
  const [fx, fz] = ll(37.7945, -122.4000); // Financial District core
  const d = Math.hypot(x - fx, (z - fz) * 0.8);
  const r = Math.max(0, 1 - d / 1500);
  let h = 34 + 460 * Math.pow(r, 1.9);
  // landmarks: Transamerica Pyramid + Salesforce Tower spires
  const [tx2, tz2] = ll(37.8000, -122.4010);
  if (Math.hypot(x - tx2, z - tz2) < 150) h = Math.max(h, 640);
  const [sx, sz] = ll(37.7898, -122.3975);
  if (Math.hypot(x - sx, z - sz) < 150) h = Math.max(h, 760);
  return h;
}
function hMid(pMax) {
  return () => pMax * (0.5 + Math.random() * 0.8);
}
export const DISTRICTS = [
  // SF: dense core
  { cx: ll(37.7945, -122.4000), size: 2600, rot: rotSF, spacing: 105, h: hDowntown, prob: 0.96, kind: 'tower' },
  // SF: Nob Hill / Russian Hill (mid-rise, on hills)
  { cx: ll(37.7920, -122.4180), size: 2400, rot: rotSF, spacing: 95, h: hMid(34), prob: 0.92, kind: 'flat' },
  // SF: Pacific Heights / Marina (low-rise)
  { cx: ll(37.8010, -122.4360), size: 2400, rot: rotSF, spacing: 95, h: hMid(18), prob: 0.9, kind: 'flat' },
  // SF: Richmond (grid)
  { cx: ll(37.7800, -122.4650), size: 3400, rot: rotSF, spacing: 100, h: hMid(15), prob: 0.93, kind: 'flat' },
  // SF: Sunset
  { cx: ll(37.7580, -122.4680), size: 3400, rot: rotSF, spacing: 100, h: hMid(13), prob: 0.93, kind: 'flat' },
  // SF: Mission / Castro / Noe
  { cx: ll(37.7560, -122.4280), size: 3000, rot: rotSF, spacing: 95, h: hMid(17), prob: 0.92, kind: 'flat' },
  // SF: Potrero / Bernal / Portola
  { cx: ll(37.7420, -122.4080), size: 2600, rot: rotSF, spacing: 100, h: hMid(14), prob: 0.9, kind: 'flat' },
  // SF: Bayview / Hunters Point industrial
  { cx: ll(37.7280, -122.3860), size: 2400, rot: rotSF, spacing: 130, h: hMid(12), prob: 0.75, kind: 'box' },
  // SF: SoMa / Mission Bay (mid-rise blocks)
  { cx: ll(37.7760, -122.3980), size: 2200, rot: rotSF, spacing: 120, h: hMid(45), prob: 0.85, kind: 'flat' },
  // Oakland
  { cx: ll(37.8040, -122.2690), size: 3200, rot: rotOak, spacing: 120, h: () => 16 + Math.random() * 26, prob: 0.85, kind: 'flat' },
  { cx: ll(37.8120, -122.2900), size: 2600, rot: rotOak, spacing: 120, h: () => 10 + Math.random() * 14, prob: 0.85, kind: 'flat' },
  // Berkeley / Albany strip
  { cx: ll(37.8560, -122.3080), size: 2600, rot: rotOak, spacing: 115, h: () => 9 + Math.random() * 14, prob: 0.85, kind: 'flat' },
  // Alameda island town grid
  { cx: ll(37.7760, -122.2830), size: 2600, rot: rotOak, spacing: 115, h: () => 8 + Math.random() * 10, prob: 0.85, kind: 'box' },
  // Sausalito / Tiburon spic'n
  { cx: ll(37.8620, -122.4700), size: 1600, rot: -0.2, spacing: 130, h: () => 7 + Math.random() * 9, prob: 0.7, kind: 'box' },
  // Daly City / Millbrae south strip
  { cx: ll(37.6400, -122.4100), size: 3600, rot: rotSF, spacing: 115, h: () => 8 + Math.random() * 12, prob: 0.85, kind: 'flat' },
];

// Market Street diagonal (for the classic SF look): from Twin Peaks NE to Ferry Building
export const MARKET = (() => {
  const a = ll(37.7640, -122.4440);
  const b = ll(37.7952, -122.3945);
  return { a, b };
})();
