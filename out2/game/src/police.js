// The Solmara PD: wanted stars, police cars that chase and ram, foot cops
// that chase and punch, and the busted / wasted respawns. The count of
// police cars scales with the stars; heat decays only while no cop can see
// the player, so hiding is a real tactic — and the Getaway mission is built
// on it. A busted player wakes at the police station minus 20% cash; a
// wasted one wakes at the hospital.
import { makeCar, updateDrive, carDistance } from './vehicles.js';
import { createPedMesh } from './pedestrians.js';
import { clamp, angleDelta } from './random.js';
import { nearestRoadPoint } from './world.js';

const SIGHT_RANGE = 60;

export function policeCarCount(stars) {
  return stars <= 0 ? 0 : Math.min(1 + stars, 6);
}

export function spawnPoliceCar(G, THREE) {
  const p = G.player;
  const spot = nearestRoadPoint(p.x + (Math.random() - 0.5) * 80, p.z + (Math.random() - 0.5) * 80);
  const car = makeCar(THREE, G.renderer.scene, spot.x, spot.z, Math.atan2(p.x - spot.x, p.z - spot.z), 0x1c2733, 'police');
  car.driver = 'police';
  car.parked = false;
  car.speed = 12;
  G.police.cars.push(car);
  G.cars.push(car);
  if (G.audio) G.audio.sirenBlip();
  return car;
}

export function spawnFootCop(G, THREE) {
  const p = G.player;
  const mesh = createPedMesh(THREE, 0x1c3a5d, 0x1c2733);
  const x = p.x + (Math.random() < 0.5 ? -1 : 1) * 14;
  const z = p.z + (Math.random() < 0.5 ? -1 : 1) * 14;
  mesh.position.set(x, 0, z);
  G.renderer.scene.add(mesh);
  const cop = { mesh, x, z, heading: 0, health: 100, alive: true, punchTimer: 0, speed: 5.2 };
  G.police.foot.push(cop);
  return cop;
}

function removePoliceCar(G, car) {
  G.renderer.scene.remove(car.mesh);
  G.police.cars = G.police.cars.filter((c) => c !== car);
  G.cars = G.cars.filter((c) => c !== car);
}

function removeFootCop(G, cop) {
  G.renderer.scene.remove(cop.mesh);
  G.police.foot = G.police.foot.filter((c) => c !== cop);
}

// Can any cop see the player? Distance only — the city blocks are low
// enough that a nearby cop counts as seeing you.
export function anyCopSees(G) {
  const p = G.player;
  for (const car of G.police.cars) if (carDistance(car, p) < SIGHT_RANGE) return true;
  for (const cop of G.police.foot) if (cop.alive && Math.hypot(cop.x - p.x, cop.z - p.z) < SIGHT_RANGE) return true;
  return false;
}

export function updatePolice(G, dt) {
  const p = G.player;
  const stars = G.wanted.stars;

  // Scale the fleet to the stars.
  const want = policeCarCount(stars);
  G.police.spawnTimer -= dt;
  if (G.police.cars.length < want && G.police.spawnTimer <= 0) {
    spawnPoliceCar(G, G.THREE);
    G.police.spawnTimer = 2.5;
  }
  if (G.police.cars.length > want) removePoliceCar(G, G.police.cars[G.police.cars.length - 1]);

  // Foot cops only matter on foot, and only while wanted.
  if (!p.inCar && stars > 0 && G.police.foot.filter((c) => c.alive).length < Math.min(stars, 3) && G.police.spawnTimer <= 0) {
    spawnFootCop(G, G.THREE);
    G.police.spawnTimer = 2.5;
  }
  if (stars === 0) {
    for (const cop of [...G.police.foot]) removeFootCop(G, cop);
  }

  const seen = anyCopSees(G);
  G.wanted.seen = seen;
  if (seen) {
    G.wanted.hiddenTime = 0;
    // Being seen keeps the heat up.
    G.wanted.heat = clamp(G.wanted.heat + dt * 1.5, 0, 100);
  } else {
    G.wanted.hiddenTime += dt;
    G.wanted.heat = Math.max(0, G.wanted.heat - 6 * dt);
    if (G.wanted.heat === 0) {
      G.wanted.stars = 0;
      if (G.mission.id === 3 && G.mission.active) G.mission.hiddenDone = true;
    }
  }
  if (G.audio) G.audio.setSiren(stars > 0, G.time);

  // Police cars chase and ram.
  for (const car of G.police.cars) {
    const desired = Math.atan2(p.x - car.x, p.z - car.z);
    const steer = clamp(angleDelta(car.heading, desired) * 1.6, -1, 1);
    const dist = carDistance(car, p);
    updateDrive(car, dist > 3 ? 1 : 0.4, steer, false, dt);
    // Ramming the player's car slows it and shakes the camera's subject.
    if (p.inCar && p.car && dist < 4.5) {
      p.car.speed *= (1 - dt * 0.5);
    }
    // A police car that flips far away or gets stuck respawns near the action.
    if (dist > 260) {
      const spot = nearestRoadPoint(p.x + 30, p.z + 30);
      car.x = spot.x; car.z = spot.z;
    }
  }

  // Foot cops chase on foot and punch when close.
  for (const cop of G.police.foot) {
    if (!cop.alive) continue;
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const dist = Math.hypot(dx, dz);
    cop.heading = Math.atan2(dx, dz);
    if (cop.punchTimer > 0) cop.punchTimer -= dt;
    if (p.inCar) {
      // Cops give up the foot chase once the player is driving away.
      if (dist > 90) removeFootCop(G, cop);
      continue;
    }
    if (dist > 1.7) {
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
    } else if (cop.punchTimer <= 0) {
      cop.punchTimer = 0.9;
      p.health -= 9;
      if (G.audio) G.audio.punch();
      if (G.hud) G.hud.toast('A cop is beating you down — run or fight back!');
      if (p.health <= 0) {
        p.health = 0;
        if (G.onBusted) G.onBusted();
      }
    }
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
  }

  // Busted in a car: boxed in by two or more police cars while barely moving.
  if (p.inCar && p.car && stars > 0) {
    let close = 0;
    for (const car of G.police.cars) if (carDistance(car, p.car) < 7) close += 1;
    if (close >= 2 && Math.abs(p.car.speed) < 1) {
      G.police.boxedTime = (G.police.boxedTime || 0) + dt;
      if (G.police.boxedTime > 3) {
        G.police.boxedTime = 0;
        if (G.onBusted) G.onBusted();
      }
    } else {
      G.police.boxedTime = 0;
    }
  }
}

export function respawn(G, kind) {
  const p = G.player;
  const lost = Math.floor(G.cash * (kind === 'busted' ? 0.2 : 0.1));
  G.cash -= lost;
  const station = kind === 'busted' ? G.city.landmarks.policeStation : G.city.landmarks.hospital;
  if (p.inCar && p.car) {
    p.car.driver = null;
    p.car.parked = true;
    p.inCar = false;
    p.car = null;
  }
  p.x = station.x + 8;
  p.z = station.z + 8;
  p.heading = 0;
  p.vx = 0; p.vz = 0;
  p.health = 100;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.wanted.hiddenTime = 0;
  for (const car of [...G.police.cars]) removePoliceCar(G, car);
  for (const cop of [...G.police.foot]) removeFootCop(G, cop);
  G.cameraOrbit.yaw = p.heading + Math.PI;
  return lost;
}
