// seed.js — deterministic randomness for Solmara Heat.
// Every run with the same seed builds the same city, the same traffic
// colours and the same pedestrian outfits, so staged screenshots are
// reproducible and the game never depends on Math.random for layout.

export function makeRng(seed) {
  // mulberry32 — small, fast, and good enough for placement work.
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function spread(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function whole(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function chance(rng, p) {
  return rng() < p;
}

// A shuffled copy of an array, using the seeded rng — handy for handing
// out distinct car colours or pedestrian shirts without repeats.
export function shuffled(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
