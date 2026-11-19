// walkers.js — pedestrians for Solmara Heat.
// They stroll the sidewalks, chat in place sometimes, and sprint away
// from gunshots, crashes and speeding cars. Simple capsule people with
// seeded shirt colours; legs swing as they walk.

import * as THREE from 'three';
import { TUNE } from './tune.js';
import { makeRng, pick, spread, whole, chance } from './seed.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00b894];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037, 0x1a1a2e];

function buildWalker(rng) {
  const g = new THREE.Group();
  const shirt = pick(rng, SHIRTS);
  const skin = pick(rng, SKINS);
  const pants = pick(rng, PANTS);
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), mat(shirt));
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(skin));
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  if (chance(rng, 0.6)) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(pick(rng, [0x1a1a1a, 0x4a2c14, 0x777777])));
    hair.position.y = 1.74;
    g.add(hair);
  }

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), mat(pants));
  legL.position.set(-0.15, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legL, legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), mat(shirt));
  armL.position.set(-0.36, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(armL, armR);

  return { group: g, legL, legR, armL, armR };
}

export function makeWalkers(city, seed) {
  const rng = makeRng(seed + 202);
  const people = [];
  const lines = city.roadLines;

  function sidewalkSpot() {
    const line = pick(rng, lines);
    const along = spread(rng, -4 * city.pitch, 4 * city.pitch);
    const side = (rng() < 0.5 ? -1 : 1) * (TUNE.road / 2 + 1.6);
    return rng() < 0.5
      ? { x: line + side, z: along }
      : { x: along, z: line + side };
  }

  for (let i = 0; i < TUNE.pedCount; i++) {
    const spot = sidewalkSpot();
    const parts = buildWalker(rng);
    parts.group.position.set(spot.x, 0, spot.z);
    city.group.add(parts.group);
    people.push({
      ...parts,
      x: spot.x, z: spot.z,
      heading: spread(rng, 0, Math.PI * 2),
      speed: 0,
      walkPhase: spread(rng, 0, 6),
      fleeing: 0,          // seconds of panic left
      fleeX: 0, fleeZ: 0,  // what they are running from
      pause: spread(rng, 0, 4),
    });
  }

  return {
    people,

    // Scare everyone near (x, z) — gunshots, crashes, near misses.
    scare(x, z, radius = 26) {
      for (const p of people) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < radius) {
          p.fleeing = spread(rng, 2.5, 5);
          p.fleeX = x; p.fleeZ = z;
        }
      }
    },

    update(dt) {
      for (const p of people) {
        if (p.fleeing > 0) {
          p.fleeing -= dt;
          const dx = p.x - p.fleeX, dz = p.z - p.fleeZ;
          const d = Math.hypot(dx, dz) || 1;
          p.heading = Math.atan2(dx / d, dz / d);
          p.speed = TUNE.fleeSpeed;
        } else if (p.pause > 0) {
          p.pause -= dt;
          p.speed = 0;
        } else {
          p.speed = TUNE.pedSpeed;
          if (rng() < dt * 0.06) p.pause = spread(rng, 2, 7); // stop and chat
          if (rng() < dt * 0.12) p.heading += spread(rng, -0.9, 0.9); // wander
        }
        // Keep them on sidewalks: steer back toward the nearest road line.
        const nearest = city.nearestRoad(p.x, p.z);
        const offRoad = Math.min(Math.abs(p.x - nearest), Math.abs(p.z - nearest));
        if (offRoad > 9 && p.fleeing <= 0) {
          p.heading = Math.atan2(nearest - p.x, nearest - p.z) * 0.2 + p.heading * 0.8;
        }
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        p.x = Math.max(-200, Math.min(200, p.x));
        p.z = Math.max(-200, Math.min(200, p.z));
        p.walkPhase += dt * p.speed * 2.4;
        const swing = Math.sin(p.walkPhase) * 0.55 * Math.min(1, p.speed / 2);
        p.legL.rotation.x = swing;
        p.legR.rotation.x = -swing;
        p.armL.rotation.x = -swing * 0.8;
        p.armR.rotation.x = swing * 0.8;
        p.group.position.set(p.x, 0, p.z);
        p.group.rotation.y = p.heading;
      }
    },

    // Someone close enough to punch or shove.
    nearest(x, z, maxD = 2.4) {
      let best = null, bd = maxD;
      for (const p of people) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
  };
}
