// Solmara Heat — tuning constants. One place for every number the rest of the
// game leans on, so balancing is editing values here, not hunting through logic.
export const WORLD = {
  roadSpacing: 52,
  roadCount: 9,          // road centre lines from -208 to +208 on both axes
  roadWidth: 12,
  blockSize: 40,
  cityHalf: 234,         // playable city edge; beach and water lie beyond +z
  beachStart: 242,
  waterStart: 268,
};

export const PLAYER_TUNING = {
  walkSpeed: 6,
  sprintSpeed: 10.5,
  accel: 40,
  friction: 30,
  jumpSpeed: 8,
  gravity: 22,
  radius: 0.7,
  maxHealth: 100,
};

export const CAR_TUNING = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 34,
  maxReverse: 10,
  drag: 0.55,
  steerRate: 1.9,
  steerGrip: 0.86,
  handbrakeDrag: 3.2,
  radius: 1.6,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;

export const WANTED = {
  decayPerSecond: 4,     // heat lost while no cop can see the player
  hideSeconds: 10,       // hidden time that clears a Getaway mission
  maxStars: 5,
};

export const MISSIONS = [
  { id: 1, name: 'First Fare', reward: 150, time: 150 },
  { id: 2, name: 'Hot Wheels', reward: 400, time: 240 },
  { id: 3, name: 'Getaway', reward: 350, time: 180 },
  { id: 4, name: 'Courier Run', reward: 600, time: 210 },
  { id: 5, name: 'The Big One', reward: 2500, time: 300 },
];

export const SAVE_KEY = 'solmara-heat-save-v1';
export const START_CASH = 120;
export const PISTOL_MAG = 12;
