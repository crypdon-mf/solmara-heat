// Jax Marlowe on foot: WASD movement relative to the camera, sprint, jump,
// punching, and pistol combat with a crosshair ray. Also entering and
// leaving cars — parked ones are free, traffic ones are a carjacking.
import * as THREE from 'three';
import { TUNE } from './tuning.js';
import { collideBuildings, clampToCity } from './metropolis.js';
import { knockPed } from './streetlife.js';

export function createHero(scene) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 1 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3a55, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.38), jacket);
  torso.position.y = 1.2; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.9; head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  cap.position.y = 2.08;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.24), jeans);
  legL.position.set(-0.17, 0.4, 0);
  const legR = legL.clone(); legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), jacket);
  armL.position.set(-0.44, 1.25, 0);
  const armR = armL.clone(); armR.position.x = 0.44;
  // pistol in the right hand, visible when aiming
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.4 }));
  gun.position.set(0.44, 0.95, 0.25);
  gun.visible = false;
  g.add(torso, head, cap, legL, legR, armL, armR, gun);
  scene.add(g);
  return {
    mesh: g, legL, legR, armL, armR, gun,
    x: 0, z: 0, y: 0, vy: 0, heading: 0,
    health: 100, maxHealth: 100,
    car: null,           // current vehicle or null
    mag: TUNE.magSize, reserve: 48,
    reloading: 0, reloadT: 0,
    punchT: 0, fireT: 0, walkPhase: 0,
    lastHurt: -99, aiming: false,
    speed2d: 0,
  };
}

export function stepHero(hero, input, dt, ctx) {
  const t = ctx.time;
  hero.punchT = Math.max(0, hero.punchT - dt);
  hero.fireT = Math.max(0, hero.fireT - dt);
  if (hero.reloading > 0) {
    hero.reloadT -= dt;
    if (hero.reloadT <= 0) {
      const need = TUNE.magSize - hero.mag;
      const take = Math.min(need, hero.reserve);
      hero.mag += take; hero.reserve -= take;
      hero.reloading = 0;
    }
  }
  // slow health regen out of combat
  if (t - hero.lastHurt > 8 && hero.health < hero.maxHealth) hero.health = Math.min(hero.maxHealth, hero.health + 2.5 * dt);

  // --- enter / exit car ---
  if (input.wasPressed('KeyE') || input.touch.action) {
    if (hero.car) exitCar(hero, ctx);
    else tryEnterCar(hero, ctx);
    input.touch.action = false;
  }

  if (hero.car) {
    // riding: hide the on-foot mesh, follow the car
    hero.mesh.visible = false;
    hero.x = hero.car.x; hero.z = hero.car.z;
    return;
  }
  hero.mesh.visible = true;

  // --- on-foot movement, camera-relative ---
  const { fwd, steer } = input.axis();
  const yaw = ctx.camYaw;
  const mx = Math.sin(yaw) * fwd + Math.cos(yaw) * steer;
  const mz = Math.cos(yaw) * fwd - Math.sin(yaw) * steer;
  const moving = Math.hypot(mx, mz) > 0.1;
  const speed = input.sprint ? TUNE.sprintSpeed : TUNE.walkSpeed;
  if (moving) {
    const len = Math.hypot(mx, mz);
    hero.x += (mx / len) * speed * dt;
    hero.z += (mz / len) * speed * dt;
    const targetHeading = Math.atan2(mx, mz);
    hero.heading = dampAngle(hero.heading, targetHeading, 12, dt);
    hero.walkPhase += dt * speed * 1.6;
    hero.speed2d = speed;
  } else hero.speed2d = 0;

  // jump
  if (input.wasPressed('Space') && hero.y <= 0.01) {
    hero.vy = TUNE.jumpSpeed;
    ctx.sfx.blip(220, 0.08, 'sine', 0.05);
  }
  hero.vy -= TUNE.gravity * dt;
  hero.y += hero.vy * dt;
  if (hero.y < 0) { hero.y = 0; hero.vy = 0; }

  // buildings + city edge
  const hit = collideBuildings(ctx.city, hero.x, hero.z, 0.55);
  if (hit) { hero.x += hit.px; hero.z += hit.pz; }
  const cl = clampToCity(hero.x, hero.z);
  hero.x = cl.x; hero.z = cl.z;

  // walk into traffic? cars push the hero (and hurt at speed)
  for (const car of ctx.cars) {
    const dx = hero.x - car.x, dz = hero.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < car.radius && d > 0.01) {
      const push = (car.radius - d);
      hero.x += (dx / d) * push; hero.z += (dz / d) * push;
      const cs = Math.abs(car.speed || 0);
      if (cs > 5) hurtHero(hero, cs * 1.2, ctx, 'hit by a car');
    }
  }

  // --- punch ---
  if ((input.wasPressed('KeyF') || input.touch.punch) && hero.punchT <= 0) {
    input.touch.punch = false;
    hero.punchT = TUNE.punchCooldown;
    ctx.sfx.punch();
    hero.armR.rotation.x = -1.4;
    setTimeout(() => { hero.armR.rotation.x = 0; }, 180);
    let hitSomething = false;
    for (const ped of ctx.life.peds) {
      const dx = ped.x - hero.x, dz = ped.z - hero.z;
      const d = Math.hypot(dx, dz);
      if (d < TUNE.punchRange && ped.downT <= 0) {
        if (knockPed(ped)) {
          hitSomething = true;
          ctx.addHeat(10, 'assault');
          ctx.particles.burst(ped.x, 1.4, ped.z, 6, 2.5, 1.5, 0.4, 1, 0.9, 0.4);
        }
      }
    }
    if (!hitSomething) ctx.particles.burst(hero.x + Math.sin(hero.heading), 1.2, hero.z + Math.cos(hero.heading), 3, 1, 1, 0.25, 0.8, 0.8, 0.8);
  }

  // --- pistol ---
  hero.aiming = input.mouseDown || input.touch.shoot;
  if (hero.aiming && hero.fireT <= 0 && hero.reloading <= 0) {
    if (hero.mag > 0) {
      hero.fireT = TUNE.fireCooldown;
      hero.mag -= 1;
      firePistol(hero, ctx);
    } else {
      hero.fireT = 0.3;
      ctx.sfx.blip(180, 0.06, 'square', 0.06); // dry click
      if (hero.reserve > 0) startReload(hero);
    }
  }
  if (input.wasPressed('KeyR')) startReload(hero);
  if (input.touch.shoot) input.touch.shoot = false;

  // --- ammo pickup at the gun shop ---
  const gs = ctx.city.places.gunshop;
  if (Math.hypot(hero.x - gs.x, hero.z - gs.z) < 4 && hero.reserve < TUNE.reserveMax) {
    hero.reserve = Math.min(TUNE.reserveMax, hero.reserve + 24);
    ctx.sfx.pickup();
    ctx.toast('Ammo restocked at the gun shop (+24)');
    // push the hero away a touch so it does not retrigger every frame
    hero.x += 3; hero.z += 3;
  }

  // animate
  const swing = moving ? Math.sin(hero.walkPhase) * 0.7 : 0;
  hero.legL.rotation.x = swing;
  hero.legR.rotation.x = -swing;
  hero.armL.rotation.x = -swing * 0.7;
  if (hero.aiming) { hero.armR.rotation.x = -1.2; hero.gun.visible = true; }
  else if (hero.punchT <= 0) { hero.armR.rotation.x = swing * 0.7; hero.gun.visible = false; }
  hero.mesh.position.set(hero.x, hero.y, hero.z);
  hero.mesh.rotation.y = hero.heading;
}

function startReload(hero) {
  if (hero.reloading > 0 || hero.mag >= TUNE.magSize || hero.reserve <= 0) return;
  hero.reloading = 1; hero.reloadT = TUNE.reloadSec;
}

function firePistol(hero, ctx) {
  ctx.sfx.gunshot();
  ctx.alarm = 2.5; // peds hear it
  ctx.addHeat(3, 'gunfire');
  // muzzle flash
  const mx = hero.x + Math.sin(hero.heading) * 0.6, mz = hero.z + Math.cos(hero.heading) * 0.6;
  ctx.particles.burst(mx, 1.35, mz, 5, 2, 2, 0.18, 1, 0.8, 0.3);
  // aim ray: camera forward
  const dir = ctx.aimDir;
  const origin = { x: ctx.camPos.x, y: ctx.camPos.y, z: ctx.camPos.z };
  let best = null, bestD = TUNE.gunRange;
  const consider = (x, y, z, target) => {
    const dx = x - origin.x, dy = y - origin.y, dz = z - origin.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > bestD || d < 0.5) return;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    if (dot > 0.996) { best = target; bestD = d; }
  };
  for (const ped of ctx.life.peds) if (ped.downT <= 0) consider(ped.x, 1.2, ped.z, { type: 'ped', ped });
  for (const car of ctx.cars) {
    if (car.isPlayer) continue;
    consider(car.x, 1.0, car.z, { type: 'car', car });
  }
  if (best) {
    const hx = origin.x + dir.x * bestD, hy = origin.y + dir.y * bestD, hz = origin.z + dir.z * bestD;
    ctx.particles.burst(hx, hy, hz, 8, 2.5, 2, 0.4, 1, 0.6, 0.2);
    if (best.type === 'ped') {
      if (knockPed(best.ped)) ctx.addHeat(14, 'shooting');
    } else {
      ctx.damageCarExternal?.(best.car, TUNE.gunDamage);
      ctx.addHeat(8, 'shooting at a car');
    }
  } else {
    // tracer dust where the shot lands (ground / wall)
    const ex = origin.x + dir.x * 40, ez = origin.z + dir.z * 40;
    ctx.particles.burst(ex, 0.4, ez, 4, 1.5, 1, 0.35, 0.7, 0.7, 0.7);
  }
}

function tryEnterCar(hero, ctx) {
  let best = null, bestD = 4.2;
  for (const car of ctx.cars) {
    if (car.isPlayer) continue;
    const d = Math.hypot(car.x - hero.x, car.z - hero.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) { ctx.toast('No car close enough'); return; }
  const wasParked = best.ai?.parked;
  hero.car = best;
  best.isPlayer = true;
  if (!wasParked) {
    // carjacking: the driver bails and runs
    ctx.addHeat(14, 'carjacking');
    ctx.toast('Carjacked! The driver ran — the cops noticed.');
    const ped = ctx.life.peds[0];
    if (ped) { ped.x = best.x + 2; ped.z = best.z + 2; ped.state = 'flee'; }
  } else {
    ctx.addHeat(5, 'stolen car');
    ctx.toast(`Took the ${best.spec.name}.`);
  }
  if (best.ai) best.ai.parked = false;
  ctx.sfx.blip(440, 0.08, 'sine', 0.08);
  ctx.onEnterCar?.(best);
}

function exitCar(hero, ctx) {
  const car = hero.car;
  car.isPlayer = false;
  hero.car = null;
  const side = 2.6;
  hero.x = car.x + Math.cos(car.heading) * side;
  hero.z = car.z - Math.sin(car.heading) * side;
  hero.y = 0; hero.vy = 0;
  hero.heading = car.heading;
  ctx.onExitCar?.(car);
}

export function hurtHero(hero, amount, ctx, cause) {
  if (ctx.time - hero.lastHurt < 0.4) return;
  hero.health -= amount;
  hero.lastHurt = ctx.time;
  ctx.sfx.blip(110, 0.2, 'sawtooth', 0.14);
  ctx.particles.burst(hero.x, 1.4, hero.z, 6, 2, 2, 0.4, 0.9, 0.1, 0.1);
  if (hero.health <= 0) {
    hero.health = 0;
    ctx.onWasted?.(cause || 'beaten down');
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}
