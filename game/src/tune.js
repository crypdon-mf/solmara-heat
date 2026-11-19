// tune.js — every tunable number for Solmara Heat lives here, so a
// handling change is one edit instead of a hunt through the modules.
// Units: metres, seconds, km/h where a name says so.

export const TUNE = {
  // --- city layout ---
  block: 34,            // building block side (m)
  road: 12,             // road width (m)
  halfBlocks: 4,        // blocks each way from centre: 9x9 grid
  beachX: -215,         // west edge where sand meets the water
  waterX: -260,

  // --- clock ---
  dayLength: 420,       // seconds for a full day/night cycle
  startHour: 17.4,      // late afternoon, golden light at boot

  // --- on-foot player ---
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  jumpSpeed: 7.5,
  gravity: 22,
  punchRange: 2.1,
  punchDamage: 18,
  punchCooldown: 0.42,
  pistolDamage: 34,
  magSize: 12,
  reloadTime: 1.15,
  maxHealth: 100,

  // --- driving ---
  handbrakeGrip: 0.35,  // lateral grip multiplier while drifting
  steerMax: 0.52,       // radians at standstill
  steerSpeedFalloff: 0.012,
  crashSpeedLoss: 0.45, // speed kept after a hard hit
  damagePerHit: 7,      // car condition lost per solid impact

  // --- wanted / police ---
  heatDecay: 1.6,       // heat lost per second while unseen
  hideTime: 10,         // seconds unseen to drop a star (getaway)
  maxStars: 5,
  copRamCooldown: 2.4,
  copTopSpeed: 47,      // m/s, slightly faster than most cars
  bustedCashLoss: 0.20,

  // --- traffic & crowds ---
  trafficCount: 22,
  pedCount: 30,
  trafficSpeed: 9.5,
  pedSpeed: 1.6,
  fleeSpeed: 4.4,

  // --- missions ---
  markerBob: 0.55,      // beacon bob amplitude (m)
  checkpointRadius: 6.5,
  cashPickupRadius: 3.2,
};

// Eight rides, each with its own personality. topKmh is the headline,
// accel is m/s^2, grip is how hard the car holds a line, mass affects
// how much it shoves other cars around.
export const RIDES = [
  { id: 'taxi',    name: 'Cabbie',     topKmh: 132, accel: 11, grip: 0.92, mass: 1.0,  color: 0xf2b705, body: 'sedan',  desc: 'City taxi — honest and quick off the line' },
  { id: 'coupe',   name: 'Vela GT',    topKmh: 178, accel: 15, grip: 0.98, mass: 0.95, color: 0xc22424, body: 'sport',  desc: 'Red sportscar from the marina — the one Mara wants' },
  { id: 'sedan',   name: 'Marlin',     topKmh: 148, accel: 12, grip: 0.94, mass: 1.05, color: 0x2e6fb0, body: 'sedan',  desc: 'Solid family sedan, everywhere in Solmara' },
  { id: 'hatch',   name: 'Pip',        topKmh: 124, accel: 13, grip: 0.90, mass: 0.8,  color: 0x37b24d, body: 'hatch',  desc: 'Tiny hatchback that turns on a coin' },
  { id: 'muscle',  name: 'Bruto V8',   topKmh: 168, accel: 17, grip: 0.82, mass: 1.25, color: 0x1f1f24, body: 'muscle', desc: 'Big V8 — brutal in a straight line, loose in corners' },
  { id: 'van',     name: 'Mule',       topKmh: 118, accel: 8,  grip: 0.86, mass: 1.5,  color: 0xe8e4da, body: 'van',    desc: 'Delivery van — slow, heavy, unstoppable' },
  { id: 'pickup',  name: 'Rancho',     topKmh: 142, accel: 11, grip: 0.88, mass: 1.3,  color: 0xb0703a, body: 'pickup', desc: 'Pickup with a bed full of nothing and a lot of torque' },
  { id: 'cop',     name: 'Interceptor',topKmh: 172, accel: 16, grip: 0.97, mass: 1.15, color: 0x101418, body: 'sport',  desc: 'Police interceptor — you do not want to meet one' },
];

export const DISTRICTS = [
  { name: 'Marina',   cx: -3, cz: 0,  tint: 0x7fb8a8 },
  { name: 'Downtown', cx: 0,  cz: 0,  tint: 0x8a94a8 },
  { name: 'Old Town', cx: 0,  cz: -3, tint: 0xc9a06a },
  { name: 'Market',   cx: 3,  cz: 0,  tint: 0xb08a9a },
  { name: 'Docks',    cx: 0,  cz: 3,  tint: 0x6a7f8a },
];

// Palette for the sky at four key hours — the renderer lerps between them.
export const SKY_KEYS = [
  { hour: 0,  top: 0x060a18, low: 0x0d1526, sun: 0x1a2a4a, fog: 0x0a1220 },
  { hour: 6,  top: 0x7d9cc4, low: 0xf2b98a, sun: 0xffc98a, fog: 0xcfd8e2 },
  { hour: 12, top: 0x3f8fd2, low: 0xbfe3f2, sun: 0xfff2c8, fog: 0xcfe4ee },
  { hour: 18, top: 0x4a5a8e, low: 0xf28a5a, sun: 0xff9a4a, fog: 0xd8a88a },
  { hour: 24, top: 0x060a18, low: 0x0d1526, sun: 0x1a2a4a, fog: 0x0a1220 },
];
