// Cars: distinct low-poly models per kind, and the arcade driving model —
// acceleration, speed-sensitive steering, handbrake drift, crash damage.
import * as THREE from 'three';
import { TUNE } from './tuning.js';
import { collideBuildings, clampToCity } from './metropolis.js';

const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);

export function buildCarMesh(kind, colorOverride) {
  const spec = TUNE.cars[kind];
  const color = colorOverride ?? spec.color;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.25, metalness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.2, metalness: 0.9 });

  const dims = {
    sport: [2.0, 0.62, 4.4], sedan: [1.9, 0.72, 4.3], taxi: [1.9, 0.72, 4.3],
    van: [2.1, 1.15, 4.8], truck: [2.2, 1.3, 5.6], muscle: [2.0, 0.78, 4.5],
    police: [1.95, 0.72, 4.4], coupe: [1.9, 0.66, 4.2],
  }[kind] || [1.9, 0.72, 4.3];
  const [w, h, len] = dims;

  // body: lower slab + shaped nose/tail
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), paint);
  body.position.y = 0.62; body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.55, 0.7), paint);
  nose.position.set(0, 0.5, len / 2 - 0.1); nose.castShadow = true;
  g.add(nose);
  // cabin / cargo
  if (kind === 'van' || kind === 'truck') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, kind === 'truck' ? 1.5 : 0.9, len * 0.55), kind === 'truck' ? new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.6 }) : dark);
    box.position.set(0, 1.15, -len * 0.16); box.castShadow = true;
    g.add(box);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.62, len * 0.46), dark);
    cabin.position.set(0, 1.18, -len * 0.06); cabin.castShadow = true;
    g.add(cabin);
  }
  // wheels (tyre only — hub is painted by the tyre shading)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9 });
  const wheels = [];
  const wx = w / 2 - 0.08, wz = len / 2 - 0.85;
  for (const [sx, sz] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const wg = new THREE.Group();
    const tyre = new THREE.Mesh(WHEEL_GEO, wheelMat);
    tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
    wg.add(tyre);
    wg.position.set(sx, 0.36, sz);
    g.add(wg);
    wheels.push(wg);
  }
  // headlights + taillights
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xffedb0, emissiveIntensity: 0.25 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xff2020, emissiveIntensity: 0.4 });
  for (const sx of [-w * 0.32, w * 0.32]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    hl.position.set(sx, 0.66, len / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.66, -len / 2 - 0.02); g.add(tl);
  }
  // kind extras
  if (kind === 'sport') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.08, 0.5), dark);
    wing.position.set(0, 1.12, -len / 2 + 0.25); g.add(wing);
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.9), dark);
    scoop.position.set(0, 1.02, len * 0.12); g.add(scoop);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc800, emissiveIntensity: 1.4 }));
    sign.position.set(0, 1.62, 0); g.add(sign);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.2, len * 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    stripe.position.set(0, 0.62, 0); g.add(stripe);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.56, 0); g.add(bar);
    const rMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 });
    const bMat = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2a5cff, emissiveIntensity: 2 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), rMat);
    r.position.set(-0.28, 1.66, 0); g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), bMat);
    b.position.set(0.28, 1.66, 0); g.add(b);
    g.userData.lightBar = { r: rMat, b: bMat };
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 1.6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    door.position.set(w / 2 + 0.01, 0.66, 0); g.add(door);
    const door2 = door.clone(); door2.position.x = -w / 2 - 0.01; g.add(door2);
  }
  if (kind === 'muscle') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 1.1), dark);
    scoop.position.set(0, 1.06, len * 0.14); g.add(scoop);
  }
  // headlight beams (only switched on at night, by the caller)
  const beamL = new THREE.SpotLight(0xffe9a8, 0, 26, 0.5, 0.5, 1.2);
  const beamR = new THREE.SpotLight(0xffe9a8, 0, 26, 0.5, 0.5, 1.2);
  beamL.position.set(-w * 0.32, 0.7, len / 2);
  beamR.position.set(w * 0.32, 0.7, len / 2);
  const tgtL = new THREE.Object3D(); tgtL.position.set(-w * 0.5, 0, len * 3);
  const tgtR = new THREE.Object3D(); tgtR.position.set(w * 0.5, 0, len * 3);
  g.add(beamL, beamR, tgtL, tgtR);
  beamL.target = tgtL; beamR.target = tgtR;
  g.userData.beams = [beamL, beamR];
  g.userData.headMat = headMat;
  g.userData.wheels = wheels;
  g.userData.len = len; g.userData.w = w;
  return g;
}

export function createCar(scene, kind, x, z, heading = 0, colorOverride) {
  const spec = TUNE.cars[kind];
  const mesh = buildCarMesh(kind, colorOverride);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    kind, spec, mesh,
    x, z, heading,
    speed: 0, slip: 0, steerVis: 0,
    hp: spec.hp, maxHp: spec.hp,
    wrecked: false, isPlayer: false, ai: null,
    radius: 1.9,
    smokeTimer: 0,
  };
}

export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * 0.5;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin * 0.016;
  // front wheels steer visually
  car.mesh.userData.wheels[0].rotation.y = car.steerVis * 0.4;
  car.mesh.userData.wheels[1].rotation.y = car.steerVis * 0.4;
}

export function setHeadlights(car, on) {
  for (const b of car.mesh.userData.beams) b.intensity = on ? 60 : 0;
  car.mesh.userData.headMat.emissiveIntensity = on ? 2.4 : 0.25;
}

// Player driving step. ctx: { city, cars, particles, sfx, onCrash, dt }
export function drivePlayer(car, input, dt, ctx) {
  const spec = car.spec;
  const { fwd, steer } = input.axis();
  const speedNorm = Math.min(1, Math.abs(car.speed) / spec.top);
  const handbrake = input.handbrake;

  if (car.wrecked) {
    car.speed = THREE.MathUtils.damp(car.speed, 0, 4, dt);
  } else if (fwd > 0) {
    car.speed += spec.accel * dt * (1 - speedNorm * 0.55);
  } else if (fwd < 0) {
    if (car.speed > 0.5) car.speed -= spec.brake * dt;          // brake
    else car.speed -= spec.accel * 0.55 * dt;                    // reverse
  } else {
    car.speed = THREE.MathUtils.damp(car.speed, 0, 1.2, dt);    // coast
  }
  if (handbrake) {
    car.speed = THREE.MathUtils.damp(car.speed, 0, 2.2, dt);
    car.slip += steer * 6 * dt;
  }
  car.speed = THREE.MathUtils.clamp(car.speed, -spec.top * 0.45, spec.top);

  // Speed-sensitive steering: sharp at low speed, calm at top speed.
  const maxSteer = spec.steer * (1 - speedNorm * 0.55);
  const targetSteer = steer * maxSteer;
  car.steerVis = THREE.MathUtils.damp(car.steerVis, targetSteer, 8, dt);
  const grip = handbrake ? TUNE.driftGrip : spec.grip;
  const turn = car.steerVis * THREE.MathUtils.clamp(car.speed / 7, -1, 1) * (handbrake ? 1.5 : 1);
  car.heading += turn * dt * (grip / 5);

  // Drift slip: lateral velocity that bleeds off with grip.
  car.slip = THREE.MathUtils.damp(car.slip, 0, grip, dt);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const sx = Math.cos(car.heading), sz = -Math.sin(car.heading);
  const nx = car.x + (fx * car.speed + sx * car.slip) * dt;
  const nz = car.z + (fz * car.speed + sz * car.slip) * dt;
  car.x = nx; car.z = nz;

  // Dust + tyre smoke while drifting or speeding off-road.
  if (Math.abs(car.slip) > 2.5 || (handbrake && Math.abs(car.speed) > 6)) {
    ctx.particles.burst(car.x - fx * 1.4, 0.4, car.z - fz * 1.4, 2, 1.5, 1.2, 0.5, 0.75, 0.72, 0.66);
  }

  // Building collision.
  const hit = collideBuildings(ctx.city, car.x, car.z, car.radius);
  if (hit) {
    car.x += hit.px; car.z += hit.pz;
    const impact = Math.abs(car.speed);
    if (impact > 4) {
      const dmg = Math.max(2, (impact - 4) * 1.6);
      damageCar(car, dmg, ctx);
      car.speed *= -0.25;
      car.slip *= 0.4;
      ctx.particles.burst(car.x, 1, car.z, 14, 6, 3, 0.6, 1, 0.75, 0.2);
      ctx.sfx.crash(Math.min(1, impact / 24));
      ctx.onCrash?.(impact);
    } else {
      car.speed *= 0.6;
    }
  }
  const cl = clampToCity(car.x, car.z);
  if (cl.x !== car.x || cl.z !== car.z) { car.x = cl.x; car.z = cl.z; car.speed *= 0.5; }

  // Car-car bumps.
  for (const other of ctx.cars) {
    if (other === car || other.wrecked) continue;
    const dx = car.x - other.x, dz = car.z - other.z;
    const d = Math.hypot(dx, dz), min = car.radius + other.radius - 0.4;
    if (d < min && d > 0.001) {
      const push = (min - d) / 2;
      const ux = dx / d, uz = dz / d;
      car.x += ux * push; car.z += uz * push;
      other.x -= ux * push; other.z -= uz * push;
      const rel = Math.abs(car.speed - (other.speed || 0));
      if (rel > 6) {
        damageCar(car, rel * 0.5, ctx);
        if (other.hp != null) damageCar(other, rel * 0.5, ctx);
        ctx.sfx.crash(Math.min(1, rel / 24));
        ctx.particles.burst((car.x + other.x) / 2, 1, (car.z + other.z) / 2, 10, 5, 2.5, 0.5, 1, 0.8, 0.25);
        ctx.onCrash?.(rel);
      }
      car.speed *= 0.82;
    }
  }

  // Smoke when hurt.
  if (car.hp < TUNE.carSmokeHp) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.09;
      ctx.particles.spawn(car.x, 1.4, car.z, (Math.random() - 0.5), 2.2, (Math.random() - 0.5), 0.9, 0.25, 0.25, 0.25);
    }
  }
  syncCarMesh(car);
}

export function damageCar(car, amount, ctx) {
  if (car.hp <= 0) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    car.speed = 0;
    ctx?.particles?.burst(car.x, 1.2, car.z, 26, 5, 4, 1.1, 0.3, 0.3, 0.3);
    ctx?.sfx?.crash(1);
  }
}
