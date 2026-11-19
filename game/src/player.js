// Jax Marlowe on foot: walking, sprinting, jumping, punching, shooting, and
// getting in and out of cars. Heat is added here too — every crime the
// player commits on foot (a punch, a gunshot, a carjacking in front of a
// cop) flows through addHeat, which is the one place stars are raised.
import { PLAYER_TUNING, CAR_TUNING, WANTED } from './config.js';
import { clamp } from './random.js';
import { resolveColliders, insideCity } from './world.js';
import { scarePeds } from './pedestrians.js';

export function addHeat(G, amount, why) {
  const w = G.wanted;
  w.heat = clamp(w.heat + amount, 0, 100);
  const stars = w.heat <= 0 ? 0 : Math.min(WANTED.maxStars, 1 + Math.floor(w.heat / 20));
  if (stars > w.stars) {
    w.stars = stars;
    if (stars > G.save.bestStars) G.save.bestStars = stars;
    if (G.hud) G.hud.toast(`Wanted level ${stars}★ — ${why}`);
  }
}

export function buildPlayerMesh(THREE) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x27364a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a67a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), jacket);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.75;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
  hair.position.y = 1.98;
  group.add(hair);
  for (const sx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.3), jeans);
    leg.position.set(sx, 0.3, 0);
    leg.name = sx < 0 ? 'legL' : 'legR';
    group.add(leg);
  }
  for (const sx of [-0.45, 0.45]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), jacket);
    arm.position.set(sx, 1.05, 0);
    arm.name = sx < 0 ? 'armL' : 'armR';
    group.add(arm);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}

export function stepOnFoot(G, input, dt) {
  const p = G.player;
  const drag = input.takeDrag();
  if (G.cameraOrbit.yaw === null) G.cameraOrbit.yaw = p.heading + Math.PI;
  G.cameraOrbit.yaw -= drag.x * 0.005;
  G.cameraOrbit.pitch = clamp(G.cameraOrbit.pitch + drag.y * 0.003, -0.5, 0.9);
  const camYaw = G.cameraOrbit.yaw;
  const fwdX = -Math.sin(camYaw);
  const fwdZ = -Math.cos(camYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;
  const mx = fwdX * input.throttle() + rightX * input.steer();
  const mz = fwdZ * input.throttle() + rightZ * input.steer();
  const len = Math.hypot(mx, mz);
  const speed = input.held.sprint ? PLAYER_TUNING.sprintSpeed : PLAYER_TUNING.walkSpeed;
  if (len > 0.01) {
    p.vx += (mx / len) * speed * PLAYER_TUNING.accel * dt * 0.12;
    p.vz += (mz / len) * speed * PLAYER_TUNING.accel * dt * 0.12;
    p.heading = Math.atan2(mx, mz);
  }
  const damp = Math.exp(-PLAYER_TUNING.friction * dt * 0.18);
  p.vx *= damp;
  p.vz *= damp;
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > speed) { p.vx *= speed / sp; p.vz *= speed / sp; }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  if (!insideCity(p.x, p.z)) {
    p.x = clamp(p.x, -244, 244);
    p.z = clamp(p.z, -244, 262);
  }
  resolveColliders(p, PLAYER_TUNING.radius, G.city.colliders);
  if (input.held.handbrake && p.onGround) { p.vy = PLAYER_TUNING.jumpSpeed; p.onGround = false; }
  p.vy -= PLAYER_TUNING.gravity * dt;
  const y = (p.mesh.position.y || 0) + p.vy * dt;
  if (y <= 0) { p.mesh.position.y = 0; p.vy = 0; p.onGround = true; }
  else p.mesh.position.y = y;
  p.mesh.position.set(p.x, p.mesh.position.y, p.z);
  p.mesh.rotation.y = p.heading;
  const swing = Math.sin(G.time * 11) * clamp(sp / PLAYER_TUNING.walkSpeed, 0, 1) * 0.55;
  const legL = p.mesh.getObjectByName('legL');
  const legR = p.mesh.getObjectByName('legR');
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (drag.clicked) shootPistol(G);
  // Punch swing: arms pump while the punch timer runs.
  if (p.punchTimer > 0) {
    const armR = p.mesh.getObjectByName('armR');
    if (armR) armR.rotation.x = -1.4 * (p.punchTimer / 0.35);
  }
}

export function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.driver === 'police') continue;
    const d = Math.hypot(car.x - G.player.x, car.z - G.player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  const wasTraffic = car.driver === 'traffic';
  p.inCar = true;
  p.car = car;
  car.driver = 'player';
  car.parked = false;
  p.mesh.visible = false;
  G.cameraOrbit.yaw = null;
  if (wasTraffic) {
    addHeat(G, 15, 'carjacking');
    if (G.hud) G.hud.toast('You jacked the ride — the driver ran for it!');
    if (G.audio) G.audio.sirenBlip();
  } else if (G.hud) {
    G.hud.toast('You got in the car.');
  }
  if (G.audio) G.audio.unlock();
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.parked = true;
  p.x = car.x + Math.cos(car.heading) * 2.4;
  p.z = car.z - Math.sin(car.heading) * 2.4;
  p.heading = car.heading;
  p.vx = 0; p.vz = 0;
  p.inCar = false;
  p.car = null;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  G.cameraOrbit.yaw = p.heading + Math.PI;
}

// A shot travels along the player's facing; the nearest person within a
// narrow cone of it goes down. Everyone nearby runs.
export function shootPistol(G) {
  const p = G.player;
  if (p.shootCooldown > 0 || p.ammo <= 0) {
    if (p.ammo <= 0 && G.hud) G.hud.toast('Out of ammo — find the gun shop (south)');
    return;
  }
  p.shootCooldown = 0.28;
  p.ammo -= 1;
  if (G.audio) G.audio.shot();
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  let hit = null;
  let hitD = 32;
  const victims = [];
  for (const ped of G.peds) if (ped.alive) victims.push(ped);
  for (const cop of G.police.foot) if (cop.alive) victims.push(cop);
  for (const v of victims) {
    const dx = v.x - p.x;
    const dz = v.z - p.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < hitD && side < 1.6) { hit = v; hitD = along; }
  }
  if (hit) {
    hit.alive = false;
    hit.mesh.rotation.x = -Math.PI / 2;
    hit.mesh.position.y = 0.4;
    addHeat(G, 18, 'shooting');
    if (G.hud) G.hud.toast('You hit someone. The city saw it.');
  } else {
    addHeat(G, 6, 'gunshot');
  }
  // Flash the tracer from the muzzle to the hit point (or 30 m out).
  if (G.tracer) {
    const endX = hit ? hit.x : p.x + fx * 30;
    const endZ = hit ? hit.z : p.z + fz * 30;
    const pos = G.tracer.geometry.attributes.position;
    pos.setXYZ(0, p.x, 1.4, p.z);
    pos.setXYZ(1, endX, hit ? 1.2 : 1.4, endZ);
    pos.needsUpdate = true;
    G.tracer.visible = true;
    G.tracerTimer = 0.09;
  }
  scarePeds(G.peds, p.x, p.z, 26);
}

export function punch(G) {
  const p = G.player;
  if (p.punchTimer > 0 || p.inCar) return;
  p.punchTimer = 0.35;
  if (G.audio) G.audio.punch();
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const dx = ped.x - p.x;
    const dz = ped.z - p.z;
    if (dx * fx + dz * fz > 0 && Math.hypot(dx, dz) < 2.4) {
      ped.alive = false;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.4;
      addHeat(G, 10, 'assault');
      scarePeds(G.peds, p.x, p.z, 20);
      if (G.hud) G.hud.toast('You knocked someone flat.');
      return;
    }
  }
  for (const cop of G.police.foot) {
    if (!cop.alive) continue;
    const dx = cop.x - p.x;
    const dz = cop.z - p.z;
    if (dx * fx + dz * fz > 0 && Math.hypot(dx, dz) < 2.4) {
      cop.health -= 34;
      addHeat(G, 12, 'assaulting an officer');
      if (cop.health <= 0) {
        cop.alive = false;
        cop.mesh.rotation.x = -Math.PI / 2;
        cop.mesh.position.y = 0.4;
      }
      return;
    }
  }
}
