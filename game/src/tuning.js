// SOLMARA HEAT v2 — tuning table. Every number the game balances on lives
// here so a single file can retune the feel without touching the systems.
export const TUNE = {
  // City layout
  pitch: 34,          // distance between road centrelines
  roadHalf: 4,        // half width of a road
  blocks: 5,          // blocks from centre to edge (city spans -5..5)
  groundSize: 420,

  // Clock / day-night
  dayLengthSec: 480,  // one full day in real seconds
  startHour: 9.5,     // morning start so the first drive is golden light

  // Player on foot
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  jumpSpeed: 7.5,
  gravity: 22,
  punchRange: 2.2,
  punchDamage: 12,
  punchCooldown: 0.45,

  // Pistol
  magSize: 12,
  reserveMax: 96,
  gunDamage: 34,
  gunRange: 70,
  reloadSec: 1.1,
  fireCooldown: 0.22,

  // Driving (per car kind: accel, topSpeed, grip, steer, brake, mass)
  cars: {
    taxi:     { accel: 16, top: 26, grip: 5.2, steer: 1.9, brake: 30, hp: 120, color: 0xf2b705, name: 'Taxi Cab' },
    sedan:    { accel: 15, top: 27, grip: 5.0, steer: 1.8, brake: 28, hp: 110, color: 0x3f6fb5, name: 'Sedan' },
    sport:    { accel: 26, top: 42, grip: 6.4, steer: 2.4, brake: 36, hp: 90,  color: 0xd21f3c, name: 'Sportscar' },
    van:      { accel: 11, top: 21, grip: 4.2, steer: 1.5, brake: 24, hp: 170, color: 0x8a8f96, name: 'Van' },
    truck:    { accel: 9,  top: 19, grip: 3.8, steer: 1.3, brake: 20, hp: 220, color: 0x4a7a4a, name: 'Truck' },
    muscle:   { accel: 21, top: 34, grip: 5.4, steer: 2.0, brake: 30, hp: 130, color: 0x1f1f24, name: 'Muscle' },
    police:   { accel: 22, top: 36, grip: 6.0, steer: 2.3, brake: 34, hp: 150, color: 0x11131a, name: 'Interceptor' },
    coupe:    { accel: 19, top: 32, grip: 5.6, steer: 2.1, brake: 32, hp: 100, color: 0xe07b39, name: 'Coupe' },
  },
  driftGrip: 1.7,     // grip while handbraking
  crashDamageSpeed: 14,
  carSmokeHp: 45,     // below this hp a car smokes

  // Traffic / pedestrians
  trafficCount: 22,
  pedCount: 30,
  trafficSpeed: [7, 12],

  // Wanted
  heatDecay: 2.2,     // per second while unseen
  heatDecaySeen: 0.4,
  starThresholds: [0, 18, 38, 60, 82, 105],
  maxPolice: [0, 1, 2, 3, 4, 6],
  policeSight: 55,
  bustedRange: 3.2,
  bustedTime: 2.5,

  // Money
  startCash: 150,
  bustedFine: 0.2,

  // Camera
  camDist: 11,
  camHeight: 5.2,
};

// The eight jobs of the v2 story, in order. Mara Voss calls, Jax drives.
export const JOBS = [
  { id: 'fare',    name: 'First Fare',       pay: 200,  brief: 'Mara: "A client needs a cab at the hotel, Jax. Take the taxi and get there. No drama."', kind: 'goto' },
  { id: 'wheels',  name: 'Hot Wheels',       pay: 600,  brief: 'Mara: "A red sportscar is parked at the marina. Bring it to my garage. Quietly."', kind: 'steal' },
  { id: 'getaway', name: 'Getaway',          pay: 500,  brief: 'Mara: "Cops are on you. Lose them — break sight and stay hidden till the heat dies."', kind: 'escape' },
  { id: 'courier', name: 'Courier Run',      pay: 800,  brief: 'Mara: "Four drops, one clock. Hit every checkpoint before it runs out."', kind: 'checkpoints' },
  { id: 'silent',  name: 'Silent Pickup',    pay: 900,  brief: 'Mara: "A package waits in Old Town. The cops are watching — get in and out without being seen."', kind: 'stealth' },
  { id: 'tail',    name: 'Tail Chase',       pay: 1100, brief: 'Mara: "A courier is running with our money. Stay on his tail — ram him till he stops."', kind: 'chase' },
  { id: 'night',   name: 'Night Delivery',   pay: 1300, brief: 'Mara: "Midnight run across the city. Fast, and keep the cops off you — they are everywhere at night."', kind: 'nightrun' },
  { id: 'bigone',  name: 'The Big One',      pay: 2500, brief: 'Mara: "The bank. Grab the cash, then run the four-star chase to the boat at the pier. This is the one, Jax."', kind: 'heist' },
];

// District palette + character, keyed by block quadrant.
export const DISTRICTS = {
  downtown: { color: 0x2b3a55, accent: 0x7fb2ff, minH: 26, maxH: 64, name: 'Downtown' },
  marina:   { color: 0xe8a2a2, accent: 0xffd9a0, minH: 8,  maxH: 16, name: 'Marina' },
  oldtown:  { color: 0x9a6b4f, accent: 0xffc46b, minH: 10, maxH: 20, name: 'Old Town' },
  beach:    { color: 0xf2e3c6, accent: 0x7fd4ff, minH: 12, maxH: 26, name: 'Beachfront' },
  industrial:{ color: 0x5c6066, accent: 0xffb347, minH: 8,  maxH: 14, name: 'Industrial' },
};
