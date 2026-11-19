// cops.js — the wanted system and the Solmara PD.
// Stars 0–5. Crimes add heat; heat decays while no cop can see you.
// Police cars spawn at the city edge and chase; on-foot officers chase
// and punch. Busted = caught on foot with no health, or boxed in while
// wanted. Wasted = health hits zero any other way.

import * as THREE from 'three';
import { TUNE, RIDES } from './tune.js';
import { makeCar } from './rides.js';
import { makeRng, spread } from './seed.js';

const CRIME_HEAT = {
  carjack: 1.2,
  punch: 0.7,
  shoot: 1.6,
  kill: 2.2,
  speeding: 0.35,  // past a cop, over 120 km/h
};

export function makeCops(city, seed) {
  const rng = makeRng(seed + 303);
  const spec = RIDES.find((r) => r.id === 'cop');
  const cruisers = [];   // police cars
  const officers = [];   // on-foot cops (simple dark figures)
  let stars = 0;
  let heat = 0;           // 0..5, fractional; stars = ceil(heat)
  let unseenFor = 0;
  let ramClock = 0;
  let sirenPhase = 0;

  function edgeSpawn() {
    const side = Math.floor(rng() * 4);
    const along = spread(rng, -150, 150);
    if (side === 0) return { x: -180, z: along, heading: Math.PI / 2 };
    if (side === 1) return { x: 180, z: along, heading: -Math.PI / 2 };
    if (side === 2) return { x: along, z: -180, heading: Math.PI };
    return { x: along, z: 180, heading: 0 };
  }

  function wantCount() {
    return stars <= 1 ? 1 : stars <= 2 ? 2 : stars <= 3 ? 3 : stars <= 4 ? 4 : 6;
  }

  function spawnCruiser() {
    const s = edgeSpawn();
    const car = makeCar(spec, s.x, s.z, s.heading, true);
    city.group.add(car.mesh);
    cruisers.push(car);
    return car;
  }

  function spawnOfficer(x, z) {
    const g = makeOfficerMesh();
    g.position.set(x, 0, z);
    city.group.add(g);
    officers.push({ mesh: g, x, z, heading: 0, punchTimer: 0, walkPhase: 0 });
  }

  function makeOfficerMesh() {
    // Dark uniform, cap, badge dot. Kept local so cops.js owns its figures.
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), mat(0x1a2436));
    torso.position.y = 1.16; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(0xe0ac69));
    head.position.y = 1.7; g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 10), mat(0x0e1520));
    cap.position.y = 1.86; g.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    badge.position.set(-0.16, 1.32, 0.17); g.add(badge);
    for (const sx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), mat(0x0e1520));
      leg.position.set(sx, 0.42, 0); g.add(leg);
    }
    return g;
  }

  function canSee(tx, tz, px, pz) {
    // Line of sight: within 70 m and roughly facing the player, and no
    // building between them. Cheap segment-vs-AABB check.
    const dx = px - tx, dz = pz - tz;
    const d = Math.hypot(dx, dz);
    if (d > 70) return false;
    for (const b of city.colliders) {
      if (segmentHitsBox(tx, tz, px, pz, b)) return false;
    }
    return true;
  }

  function segmentHitsBox(x1, z1, x2, z2, b) {
    // Slab test in 2D.
    let tmin = 0, tmax = 1;
    const dx = x2 - x1, dz = z2 - z1;
    for (const [p, d, lo, hi] of [[x1, dx, b.minX, b.maxX], [z1, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) return false;
      } else {
        let t1 = (lo - p) / d, t2 = (hi - p) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }
    return true;
  }

  return {
    get stars() { return stars; },
    get heat() { return heat; },
    cruisers, officers,

    addCrime(kind) {
      heat = Math.min(TUNE.maxStars, heat + (CRIME_HEAT[kind] || 0.5));
      stars = Math.ceil(heat);
      unseenFor = 0;
    },
    setStars(n) {
      stars = Math.max(0, Math.min(TUNE.maxStars, n));
      heat = stars;
      unseenFor = 0;
    },
    clear() {
      stars = 0; heat = 0; unseenFor = 0;
      for (const c of cruisers) city.group.remove(c.mesh);
      cruisers.length = 0;
      for (const o of officers) city.group.remove(o.mesh);
      officers.length = 0;
    },

    update(dt, player, playerCar, colliders, events) {
      ramClock -= dt;
      sirenPhase += dt;
      const px = playerCar ? playerCar.x : player.x;
      const pz = playerCar ? playerCar.z : player.z;
      const playerSpeed = playerCar ? Math.abs(playerCar.speed) : 0;

      // --- visibility: any cop with line of sight resets the hide clock ---
      let seen = false;
      for (const c of cruisers) if (canSee(c.x, c.z, px, pz)) { seen = true; break; }
      if (!seen) for (const o of officers) if (canSee(o.x, o.z, px, pz)) { seen = true; break; }
      if (seen) unseenFor = 0; else unseenFor += dt;

      // --- heat decay while hidden; a star drops after the hide time ---
      if (stars > 0 && !seen) {
        heat = Math.max(0, heat - TUNE.heatDecay * dt * 0.25);
        const newStars = Math.ceil(heat);
        if (newStars < stars) { stars = newStars; }
      }
      if (stars > 0 && unseenFor > TUNE.hideTime) {
        stars = Math.max(0, stars - 1);
        heat = stars;
        unseenFor = 0;
        events?.onStarDrop?.(stars);
      }

      // --- spawn / despawn cruisers to match the wanted level ---
      const want = stars > 0 ? wantCount() : 0;
      while (cruisers.length < want) spawnCruiser();
      while (cruisers.length > want) {
        const c = cruisers.pop();
        city.group.remove(c.mesh);
      }
      // On-foot officers appear when the player is on foot and wanted.
      if (stars > 0 && !playerCar && officers.length < Math.min(3, stars)) {
        const s = edgeSpawn();
        spawnOfficer(px + spread(rng, -25, 25), pz + spread(rng, -25, 25));
      }
      if (stars === 0 && officers.length > 0) {
        for (const o of officers) city.group.remove(o.mesh);
        officers.length = 0;
      }

      // --- cruiser pursuit: steer toward the player, ram on contact ---
      for (const c of cruisers) {
        const dx = px - c.x, dz = pz - c.z;
        const dist = Math.hypot(dx, dz) || 1;
        const wantHeading = Math.atan2(dx, dz);
        let diff = wantHeading - c.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const input = {
          up: dist > 6,
          down: false,
          left: diff > 0.12,
          right: diff < -0.12,
          brake: dist < 5,
        };
        c.drive(input, dt, colliders, [...cruisers, ...(playerCar ? [playerCar] : [])], null);
        if (dist < 4.6 && ramClock <= 0) {
          ramClock = TUNE.copRamCooldown;
          events?.onRam?.(c);
        }
        // Siren light bar blink.
        const r = c.mesh.getObjectByName('sirenR');
        const b = c.mesh.getObjectByName('sirenB');
        const on = Math.sin(sirenPhase * 9) > 0;
        if (r) r.material.color.set(on ? 0xff2222 : 0x551111);
        if (b) b.material.color.set(on ? 0x111155 : 0x2266ff);
        // Headlight beams at night are handled by scene.js via isNight.
      }

      // --- officers chase on foot and punch ---
      for (const o of officers) {
        const dx = px - o.x, dz = pz - o.z;
        const dist = Math.hypot(dx, dz) || 1;
        o.heading = Math.atan2(dx, dz);
        const step = (dist > 2 ? 5.4 : 0) * dt;
        o.x += Math.sin(o.heading) * step;
        o.z += Math.cos(o.heading) * step;
        o.walkPhase += dt * 6;
        o.mesh.position.set(o.x, 0, o.z);
        o.mesh.rotation.y = o.heading;
        o.punchTimer -= dt;
        if (dist < 2.2 && o.punchTimer <= 0 && !playerCar) {
          o.punchTimer = 0.9;
          events?.onOfficerPunch?.(12);
        }
      }

      // --- speeding past a cop adds heat ---
      if (playerCar && playerSpeed * 3.6 > 120 && stars < TUNE.maxStars) {
        for (const c of cruisers) {
          if (Math.hypot(c.x - px, c.z - pz) < 40) {
            this.addCrime('speeding');
            break;
          }
        }
      }
      return { seen, unseenFor };
    },
  };
}
