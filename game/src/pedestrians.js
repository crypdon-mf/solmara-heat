// Pedestrians: Solmara's foot traffic. They stroll the sidewalks, turn at
// corners, and run when they hear a gunshot or a car comes at them fast.
// Each one is a small low-poly figure with a walk swing, a home sidewalk and
// a flee timer the combat code can trigger.
import { roadLines } from './world.js';
import { pick, range, clamp } from './random.js';

const SHIRT_COLORS = [0xe8e8e8, 0xd8433c, 0x3c6fd8, 0xe8c93c, 0x3cd87a, 0xd87a3c, 0x9e4fd8, 0xf5a8c9];
const PANTS_COLORS = [0x2c3e50, 0x3a3a3a, 0x5d4a3a, 0x27364a];

export function createPedMesh(THREE, shirt, pants) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.85, 0.36),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 1.0;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xd8a67a }),
  );
  head.position.y = 1.68;
  group.add(head);
  for (const sx of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.58, 0.28),
      new THREE.MeshLambertMaterial({ color: pants }),
    );
    leg.position.set(sx, 0.29, 0);
    leg.name = sx < 0 ? 'legL' : 'legR';
    group.add(leg);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}

export function spawnPedestrians(THREE, scene, rng, count) {
  const peds = [];
  const lines = roadLines();
  for (let i = 0; i < count; i += 1) {
    const line = pick(rng, lines);
    const along = range(rng, -210, 210);
    const vertical = rng() < 0.5;
    const side = rng() < 0.5 ? 8 : -8;
    const mesh = createPedMesh(THREE, pick(rng, SHIRT_COLORS), pick(rng, PANTS_COLORS));
    const x = vertical ? line + side : along;
    const z = vertical ? along : line + side;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z,
      heading: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.2),
      vertical, line, side,
      flee: 0, fleeX: 0, fleeZ: 0,
      walkPhase: rng() * 6,
      alive: true,
    });
  }
  return peds;
}

// Everyone within `radius` of (x, z) runs away from it for a few seconds.
export function scarePeds(peds, x, z, radius) {
  for (const ped of peds) {
    if (!ped.alive) continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    const d = Math.hypot(dx, dz);
    if (d < radius) {
      ped.flee = 4;
      ped.fleeX = dx / (d || 1);
      ped.fleeZ = dz / (d || 1);
    }
  }
}

export function updatePedestrians(peds, rng, dt, time) {
  for (const ped of peds) {
    if (!ped.alive) continue;
    if (ped.flee > 0) {
      ped.flee -= dt;
      ped.x += ped.fleeX * 5.5 * dt;
      ped.z += ped.fleeZ * 5.5 * dt;
      ped.heading = Math.atan2(ped.fleeX, ped.fleeZ);
    } else {
      // Stroll along the sidewalk; at a corner, sometimes turn.
      const step = ped.speed * dt;
      ped.x += Math.sin(ped.heading) * step;
      ped.z += Math.cos(ped.heading) * step;
      if (rng() < dt * 0.08) ped.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      if (Math.abs(ped.x) > 232 || Math.abs(ped.z) > 232) ped.heading += Math.PI;
    }
    ped.x = clamp(ped.x, -240, 240);
    ped.z = clamp(ped.z, -240, 260);
    ped.walkPhase += dt * (ped.flee > 0 ? 14 : 7);
    const swing = Math.sin(ped.walkPhase) * 0.5;
    const legL = ped.mesh.getObjectByName('legL');
    const legR = ped.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}
