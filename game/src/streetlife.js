// Street life: AI traffic that follows lanes, stops at red lights and queues
// behind each other; pedestrians who stroll the sidewalks, cross at corners,
// and run from gunshots, crashes and speeding cars.
import * as THREE from 'three';
import { TUNE } from './tuning.js';
import { Rng } from './rng.js';
import { createCar, syncCarMesh } from './autos.js';
import { lightAllows, collideBuildings } from './metropolis.js';

const P = TUNE.pitch;
const B = TUNE.blocks;
const KINDS = ['sedan', 'coupe', 'van', 'sedan', 'muscle', 'taxi', 'coupe', 'sedan'];

export function initStreetLife(scene, city, seed) {
  const rng = new Rng(seed + 101);
  const life = { traffic: [], peds: [], parked: [], rng };

  // --- traffic ---
  for (let i = 0; i < TUNE.trafficCount; i++) {
    const kind = rng.pick(KINDS);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const road = rng.int(-B, B) * P;
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.float(-B * P, B * P);
    const x = axis === 'x' ? along : road + lane(axis, dir);
    const z = axis === 'x' ? road + lane(axis, dir) : along;
    const car = createCar(scene, kind, x, z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
    car.speed = rng.float(...TUNE.trafficSpeed);
    car.ai = { axis, dir, road, cruise: car.speed, stopped: false, honkT: 0 };
    life.traffic.push(car);
  }

  // --- parked cars (enterable) along road edges ---
  const parkedKinds = ['sedan', 'coupe', 'muscle', 'taxi', 'van', 'sport'];
  for (let i = 0; i < 12; i++) {
    const kind = parkedKinds[i % parkedKinds.length];
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const road = rng.int(-B, B) * P;
    const along = rng.int(-B, B) * P + rng.float(-8, 8);
    const x = axis === 'x' ? along : road + (rng.chance(0.5) ? 5.6 : -5.6);
    const z = axis === 'x' ? road + (rng.chance(0.5) ? 5.6 : -5.6) : along;
    const heading = axis === 'x' ? Math.PI / 2 : 0;
    const car = createCar(scene, kind, x, z, heading);
    car.ai = { parked: true };
    life.parked.push(car);
  }

  // --- pedestrians ---
  const shirtCols = [0xe05a5a, 0x4a90d9, 0x7ac74f, 0xf2b705, 0x9b59b6, 0xe07b39, 0xeeeeee, 0x2a9d8f];
  for (let i = 0; i < TUNE.pedCount; i++) {
    const ped = makePed(scene, rng, shirtCols);
    ped.x = (rng.int(-B - 1, B - 1) + 0.5) * P + rng.float(-8, 8);
    ped.z = (rng.int(-B - 1, B - 1) + 0.5) * P + rng.float(-8, 8);
    pickWalkTarget(ped, rng);
    life.peds.push(ped);
  }
  return life;
}

function lane(axis, dir) { return axis === 'x' ? dir * 2.1 : -dir * 2.1; }

function makePed(scene, rng, cols) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: rng.pick(cols), roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: rng.pick([0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0]), roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), shirt);
  torso.position.y = 1.15; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.82; head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a2d33 }));
  legL.position.set(-0.16, 0.38, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  g.add(torso, head, legL, legR);
  scene.add(g);
  return {
    mesh: g, legL, legR,
    x: 0, z: 0, heading: 0, speed: 0,
    tx: 0, tz: 0, state: 'walk', stateT: 0,
    downT: 0, walkPhase: Math.random() * 6,
  };
}

function pickWalkTarget(ped, rng) {
  // Next corner of a nearby block — peds walk the sidewalks, block to block.
  const bx = Math.floor(ped.x / P), bz = Math.floor(ped.z / P);
  const nbx = THREE.MathUtils.clamp(bx + rng.int(-1, 1), -B - 1, B - 1);
  const nbz = THREE.MathUtils.clamp(bz + rng.int(-1, 1), -B - 1, B - 1);
  ped.tx = (nbx + 0.5) * P + rng.float(-8, 8);
  ped.tz = (nbz + 0.5) * P + rng.float(-8, 8);
}

export function stepTraffic(life, city, dt, ctx) {
  for (const car of life.traffic) {
    const ai = car.ai;
    if (ai.parked) continue;
    // car ahead on same road/lane?
    let blocked = false;
    for (const other of life.traffic) {
      if (other === car || other.ai.axis !== ai.axis || other.ai.road !== ai.road || other.ai.dir !== ai.dir) continue;
      const along = ai.axis === 'x' ? other.x - car.x : other.z - car.z;
      if (along * ai.dir > 0 && along * ai.dir < 7) { blocked = true; break; }
    }
    // player car ahead on the same road?
    const pc = ctx.playerCar;
    if (pc) {
      const along = ai.axis === 'x' ? pc.x - car.x : pc.z - car.z;
      const side = ai.axis === 'x' ? Math.abs(pc.z - car.z) : Math.abs(pc.x - car.x);
      if (along * ai.dir > 0 && along * ai.dir < 7 && side < 3) blocked = true;
      // yield: never ram the player's car — stop if it is close in any direction
      if (Math.hypot(pc.x - car.x, pc.z - car.z) < 8) blocked = true;
    }
    // red light ahead?
    const nodeCoord = ai.axis === 'x' ? car.x : car.z;
    const node = Math.round(nodeCoord / P) * P;
    const distNode = (node - nodeCoord) * ai.dir;
    if (distNode > 0 && distNode < 10 && !lightAllows(city, ai.axis, ai.axis === 'x' ? node : car.x, ai.axis === 'x' ? car.z : node)) {
      // only stop if this is a lit intersection and we are near the stop line
      const cross = ai.axis === 'x' ? Math.round(car.z / P) : Math.round(car.x / P);
      if (Math.abs((ai.axis === 'x' ? car.z : car.x) - cross * P) < 3 && distNode < 9) blocked = true;
    }
    const target = blocked ? 0 : ai.cruise;
    car.speed = THREE.MathUtils.damp(car.speed, target, blocked ? 6 : 1.5, dt);
    if (car.speed < 0.2 && blocked && Math.random() < dt * 0.1) ctx.sfx?.horn?.();

    // advance along the road
    if (ai.axis === 'x') car.x += ai.dir * car.speed * dt;
    else car.z += ai.dir * car.speed * dt;
    car.heading = ai.axis === 'x' ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ai.dir > 0 ? 0 : Math.PI);

    // at an intersection: maybe turn
    const coord = ai.axis === 'x' ? car.x : car.z;
    const nearest = Math.round(coord / P) * P;
    if (Math.abs(coord - nearest) < car.speed * dt + 0.6 && car.speed > 1 && Math.abs(coord - nearest) < 2.5) {
      if (life.rng.chance(0.22)) {
        // turn onto the crossing road
        const newAxis = ai.axis === 'x' ? 'z' : 'x';
        const newDir = life.rng.chance(0.5) ? 1 : -1;
        const crossRoad = nearest;
        ai.axis = newAxis; ai.dir = newDir; ai.road = crossRoad;
        if (newAxis === 'x') { car.z = crossRoad + lane(newAxis, newDir); car.x = nearest; }
        else { car.x = crossRoad + lane(newAxis, newDir); car.z = nearest; }
      }
    }
    // wrap around the city edge
    const lim = B * P + 10;
    if (car.x > lim) car.x = -lim; if (car.x < -lim) car.x = lim;
    if (car.z > lim) car.z = -lim; if (car.z < -lim) car.z = lim;
    syncCarMesh(car);
  }
}

export function stepPeds(life, dt, ctx) {
  const px = ctx.playerX, pz = ctx.playerZ;
  const threatX = ctx.threatX ?? px, threatZ = ctx.threatZ ?? pz;
  for (const ped of life.peds) {
    if (ped.downT > 0) {
      ped.downT -= dt;
      ped.mesh.rotation.x = ped.downT > 0 ? -Math.PI / 2 : 0;
      ped.mesh.position.set(ped.x, ped.downT > 0 ? 0.4 : 0, ped.z);
      continue;
    }
    ped.mesh.rotation.x = 0;
    // flee if the player is speeding at them, or a gunshot rang out
    const dThreat = Math.hypot(ped.x - threatX, ped.z - threatZ);
    const dPlayer = Math.hypot(ped.x - px, ped.z - pz);
    if (ctx.alarm > 0 && dThreat < 26) ped.state = 'flee';
    else if (ctx.playerCarSpeed > 8 && dPlayer < 6) ped.state = 'flee';
    else if (ped.state === 'flee' && dThreat > 30) { ped.state = 'walk'; pickWalkTarget(ped, life.rng); }

    if (ped.state === 'flee') {
      const away = Math.atan2(ped.x - threatX, ped.z - threatZ);
      ped.heading = away;
      ped.speed = 6.5;
      ped.x += Math.sin(away) * ped.speed * dt;
      ped.z += Math.cos(away) * ped.speed * dt;
      // stay inside the city, steer back along sidewalks
      const lim = B * P + 14;
      ped.x = THREE.MathUtils.clamp(ped.x, -lim, lim);
      ped.z = THREE.MathUtils.clamp(ped.z, -lim, lim);
    } else {
      const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) { pickWalkTarget(ped, life.rng); ped.speed = 0; }
      else {
        ped.heading = Math.atan2(dx, dz);
        ped.speed = 1.6;
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
      }
      // keep peds out of building footprints
      const hit = collideBuildings(ctx.city, ped.x, ped.z, 0.6);
      if (hit) { ped.x += hit.px; ped.z += hit.pz; pickWalkTarget(ped, life.rng); }
    }
    ped.walkPhase += dt * ped.speed * 2.2;
    ped.legL.rotation.x = Math.sin(ped.walkPhase) * 0.6 * Math.min(1, ped.speed / 2);
    ped.legR.rotation.x = -Math.sin(ped.walkPhase) * 0.6 * Math.min(1, ped.speed / 2);
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

// Knock a pedestrian down (punch / car hit). Returns true if it was a fresh hit.
export function knockPed(ped) {
  if (ped.downT > 0) return false;
  ped.downT = 3.5;
  ped.state = 'walk';
  return true;
}
