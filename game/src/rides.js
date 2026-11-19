// rides.js — car models and arcade driving physics for Solmara Heat.
// Every car keeps a real velocity vector: the forward part follows the
// heading, the sideways part is scrubbed off by grip — drop the grip
// with the handbrake and the car drifts. Collisions are circle-vs-AABB
// against buildings and circle-vs-circle against other cars.

import * as THREE from 'three';
import { TUNE, RIDES } from './tune.js';
import { resolveCircleAABB } from './city.js';

const WHEEL_R = 0.36;

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function wheel(x, z) {
  const w = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 10),
    new THREE.MeshLambertMaterial({ color: 0x141414 })
  );
  w.rotation.z = Math.PI / 2;
  w.position.set(x, WHEEL_R, z);
  w.castShadow = true;
  return w;
}

// Builds the visible mesh for a ride spec. `police` swaps in the
// black-and-white livery, light bar and push bar.
export function buildRideMesh(spec, police = false) {
  const g = new THREE.Group();
  const paint = police ? 0x101418 : spec.color;
  const accent = police ? 0xf2f2f2 : spec.color;

  if (spec.body === 'van') {
    g.add(box(2.0, 1.5, 4.6, paint, 0, 1.05, 0));
    g.add(box(1.8, 0.5, 1.0, 0x9fb4c4, 0, 1.35, 1.4)); // windshield
  } else if (spec.body === 'pickup') {
    g.add(box(2.0, 0.85, 4.6, paint, 0, 0.75, 0));
    g.add(box(1.9, 0.8, 1.7, paint, 0, 1.35, 1.1)); // cab
    g.add(box(1.8, 0.5, 0.9, 0x9fb4c4, 0, 1.35, 0.35));
    g.add(box(1.9, 0.25, 1.9, 0x3a3a3a, 0, 1.05, -1.2)); // bed
  } else if (spec.body === 'muscle') {
    g.add(box(2.05, 0.8, 4.7, paint, 0, 0.7, 0));
    g.add(box(1.7, 0.62, 2.0, accent, 0, 1.3, 0.3)); // cabin
    g.add(box(1.9, 0.22, 1.2, 0x222222, 0, 1.12, 1.5)); // hood scoop
    g.add(box(1.8, 0.5, 0.5, 0x9fb4c4, 0, 1.3, 1.25));
  } else if (spec.body === 'hatch') {
    g.add(box(1.85, 0.8, 3.4, paint, 0, 0.7, 0));
    g.add(box(1.65, 0.65, 1.9, accent, 0, 1.3, -0.2));
    g.add(box(1.6, 0.45, 0.5, 0x9fb4c4, 0, 1.3, 0.85));
  } else {
    // sedan / sport: long low body, glass cabin, spoiler on the sport.
    g.add(box(1.95, 0.72, 4.5, paint, 0, 0.66, 0));
    g.add(box(1.7, 0.6, 2.2, 0x1c2733, 0, 1.25, -0.2)); // glasshouse
    g.add(box(1.72, 0.06, 2.0, accent, 0, 1.56, -0.2)); // roof
    if (spec.body === 'sport') {
      g.add(box(1.8, 0.08, 0.35, 0x141414, 0, 1.05, -2.2)); // spoiler
      g.add(box(0.1, 0.3, 0.1, 0x141414, -0.7, 0.9, -2.2));
      g.add(box(0.1, 0.3, 0.1, 0x141414, 0.7, 0.9, -2.2));
    }
  }

  // Headlights (warm) and taillights (red) — emissive so they read at night.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const sx of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
    h.position.set(sx, 0.72, 2.26);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), tailMat);
    t.position.set(sx, 0.72, -2.26);
    g.add(t);
  }
  // Headlight beams: two translucent cones, visible at night.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const sx of [-0.62, 0.62]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.85, 9, 8, 1, true), beamMat);
    beam.rotation.x = -Math.PI / 2 - 0.12;
    beam.position.set(sx, 0.6, 6.4);
    beam.name = 'beam';
    beam.visible = false;
    g.add(beam);
  }

  if (police) {
    // White doors, light bar, push bar.
    g.add(box(1.96, 0.5, 1.6, 0xf2f2f2, 0, 0.72, 0.2));
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    barR.position.set(-0.4, 1.66, -0.2);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    barB.position.set(0.4, 1.66, -0.2);
    g.add(barR, barB);
    barR.name = 'sirenR'; barB.name = 'sirenB';
    g.add(box(1.9, 0.5, 0.18, 0x333333, 0, 0.6, 2.3)); // push bar
  }

  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    g.add(wheel(wx, wz));
  }
  return g;
}

export function rideSpec(id) {
  return RIDES.find((r) => r.id === id) || RIDES[2];
}

// One drivable (or AI-driven) car. Position lives in plain numbers so
// the physics never allocates; the mesh is synced after each update.
export function makeCar(spec, x, z, heading, police = false) {
  const mesh = buildRideMesh(spec, police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  const car = {
    spec, mesh, police,
    x, z, heading,
    vx: 0, vz: 0,          // velocity vector (m/s)
    speed: 0,              // signed forward speed (m/s)
    steer: 0,
    condition: 100,        // 100 = showroom, 0 = smoking wreck
    smoking: false,
    radius: 2.1,
    sirenPhase: Math.random() * 10,

    forwardSpeed() { return this.speed; },
    kmh() { return Math.abs(this.speed) * 3.6; },

    // input: {up, down, left, right, brake} booleans; dt seconds.
    // onHit(strength) is called for solid impacts.
    drive(input, dt, colliders, others, onHit) {
      const top = (this.spec.topKmh / 3.6);
      const fwdX = Math.sin(this.heading), fwdZ = Math.cos(this.heading);
      // Recompute signed speed from the velocity vector.
      this.speed = this.vx * fwdX + this.vz * fwdZ;

      // --- throttle / brake ---
      let throttle = 0;
      if (input.up) throttle = 1;
      else if (input.down) throttle = this.speed > 0.6 ? -1.6 : -0.7; // brake, then reverse
      const accel = throttle * this.spec.accel;
      this.speed += accel * dt;
      // Drag + rolling resistance.
      this.speed -= this.speed * 0.35 * dt;
      this.speed -= Math.sign(this.speed) * 1.2 * dt;
      if (Math.abs(this.speed) < 0.05 && !input.up && !input.down) this.speed = 0;
      const maxRev = -11;
      this.speed = Math.max(maxRev, Math.min(top, this.speed));

      // --- steering (less bite at speed, none at standstill) ---
      const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      const bite = TUNE.steerMax * (1 - Math.min(Math.abs(this.speed) * TUNE.steerSpeedFalloff * 10, 0.72));
      this.steer += (steerTarget * bite - this.steer) * Math.min(1, dt * 9);
      const turnRate = this.steer * (this.speed / 6.5) * (this.speed >= 0 ? 1 : -1);
      this.heading += turnRate * dt * 1.35;

      // --- velocity vector: forward follows the heading, sideways is
      // scrubbed by grip (handbrake drops grip -> drift) ---
      const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
      const fwd = this.vx * nfx + this.vz * nfz;
      let latX = this.vx - fwd * nfx, latZ = this.vz - fwd * nfz;
      const grip = input.brake ? TUNE.handbrakeGrip * 6 : this.spec.grip * 8.5;
      const keep = Math.exp(-grip * dt);
      latX *= keep; latZ *= keep;
      // Blend the forward speed back onto the new heading.
      this.vx = this.speed * nfx + latX;
      this.vz = this.speed * nfz + latZ;

      this.x += this.vx * dt;
      this.z += this.vz * dt;

      // --- buildings & lamps ---
      for (const box of colliders) {
        const push = resolveCircleAABB(this.x, this.z, this.radius, box);
        if (!push) continue;
        this.x += push.x; this.z += push.z;
        const impact = Math.abs(this.speed);
        if (impact > 4) {
          this.speed *= TUNE.crashSpeedLoss;
          this.vx *= TUNE.crashSpeedLoss;
          this.vz *= TUNE.crashSpeedLoss;
          this.condition = Math.max(0, this.condition - TUNE.damagePerHit * (impact / 12));
          onHit?.(impact);
        } else {
          this.speed *= 0.5; this.vx *= 0.5; this.vz *= 0.5;
        }
      }

      // --- other cars: soft circle push ---
      for (const other of others) {
        if (other === this) continue;
        const dx = this.x - other.x, dz = this.z - other.z;
        const d = Math.hypot(dx, dz);
        const min = this.radius + other.radius - 0.4;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / d;
        this.x += dx * push * 0.5;
        this.z += dz * push * 0.5;
        const rel = Math.abs(this.speed - other.speed);
        if (rel > 5) {
          this.condition = Math.max(0, this.condition - 3);
          onHit?.(rel);
        }
        this.vx *= 0.92; this.vz *= 0.92;
      }

      this.smoking = this.condition < 35;
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
      // Body roll: lean into the steering a touch.
      this.mesh.rotation.z = -this.steer * 0.06 * Math.min(1, Math.abs(this.speed) / 10);
    },
  };
  return car;
}
