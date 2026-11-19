// Wanted 0–5 stars: crimes add heat, heat decays when the cops lose you,
// and police interceptors spawn, chase, ram and escalate with the stars.
import * as THREE from 'three';
import { TUNE } from './tuning.js';
import { createCar, syncCarMesh, damageCar } from './autos.js';
import { collideBuildings, clampToCity } from './metropolis.js';

const P = TUNE.pitch;

export class Wanted {
  constructor(scene, city, allCars) {
    this.scene = scene; this.city = city; this.allCars = allCars;
    this.heat = 0;
    this.stars = 0;
    this.units = [];       // active police cars
    this.bustedT = 0;
    this.bestStars = 0;
    this.flashT = 0;
    this.spawnT = 0;
  }

  add(amount, reason) {
    this.heat = Math.min(120, this.heat + amount);
    this._restar();
  }
  _restar() {
    let s = 0;
    for (let i = 5; i >= 1; i--) if (this.heat >= TUNE.starThresholds[i]) { s = i; break; }
    if (s !== this.stars) {
      this.stars = s;
      this.bestStars = Math.max(this.bestStars, s);
    }
  }
  clear() { this.heat = 0; this.stars = 0; this.bustedT = 0; this._despawnAll(); }
  _despawnAll() {
    for (const u of this.units) {
      this.scene.remove(u.mesh);
      const i = this.allCars.indexOf(u); if (i >= 0) this.allCars.splice(i, 1);
    }
    this.units = [];
  }

  update(dt, ctx) {
    const px = ctx.playerX, pz = ctx.playerZ;
    // --- heat decay: slow while a cop can see you, fast while hidden ---
    let seen = false;
    for (const u of this.units) {
      if (Math.hypot(u.x - px, u.z - pz) < TUNE.policeSight) { seen = true; break; }
    }
    if (this.stars > 0) {
      this.heat = Math.max(0, this.heat - (seen ? TUNE.heatDecaySeen : TUNE.heatDecay) * dt);
      this._restar();
    }
    // --- spawn / despawn to match the stars ---
    const want = TUNE.maxPolice[this.stars];
    this.spawnT -= dt;
    if (this.units.length < want && this.spawnT <= 0) {
      this.spawnT = 1.2;
      this._spawnUnit(px, pz);
    }
    while (this.units.length > want) {
      const u = this.units.pop();
      this.scene.remove(u.mesh);
      const i = this.allCars.indexOf(u); if (i >= 0) this.allCars.splice(i, 1);
    }
    // --- light-bar flash + siren ---
    this.flashT += dt;
    const phase = Math.sin(this.flashT * 9) > 0;
    for (const u of this.units) {
      const bar = u.mesh.userData.lightBar;
      if (bar) {
        bar.r.emissiveIntensity = phase ? 3 : 0.2;
        bar.b.emissiveIntensity = phase ? 0.2 : 3;
      }
    }
    ctx.sfx.setSiren(this.units.length > 0, dt);

    // --- chase AI ---
    let closest = 1e9;
    for (const u of this.units) {
      const dx = px - u.x, dz = pz - u.z;
      const dist = Math.hypot(dx, dz);
      closest = Math.min(closest, dist);
      const desired = Math.atan2(dx, dz);
      let diff = ((desired - u.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const maxTurn = 2.6 * dt;
      u.heading += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
      // ram speed: faster with more stars, slower when turning hard
      const aggression = 0.82 + this.stars * 0.06;
      const target = u.spec.top * aggression * (Math.abs(diff) > 1.2 ? 0.45 : 1);
      // stuck? back up and re-aim
      u._stuckT = (Math.abs(u.speed) < 1.5 && dist > 8) ? (u._stuckT || 0) + dt : 0;
      if (u._stuckT > 1.6) { u.speed = -8; u._stuckT = -1.2; }
      else u.speed = THREE.MathUtils.damp(u.speed, target, 1.6, dt);
      u.x += Math.sin(u.heading) * u.speed * dt;
      u.z += Math.cos(u.heading) * u.speed * dt;
      const hit = collideBuildings(this.city, u.x, u.z, u.radius);
      if (hit) { u.x += hit.px; u.z += hit.pz; u.speed *= 0.5; }
      const cl = clampToCity(u.x, u.z); u.x = cl.x; u.z = cl.z;
      // ram the player's car / body
      if (dist < u.radius + (ctx.playerCar ? ctx.playerCar.radius : 0.8)) {
        if (ctx.playerCar) {
          damageCar(ctx.playerCar, 6 * dt * 10, ctx);
          ctx.playerCar.speed *= 0.94;
          if (Math.random() < dt * 2) {
            ctx.sfx.crash(0.5);
            ctx.particles.burst(px, 1, pz, 8, 4, 2, 0.5, 1, 0.8, 0.3);
          }
        } else {
          ctx.hurtHero?.(8, 'rammed by a police car');
        }
      }
      syncCarMesh(u);
    }

    // --- busted: cops close in on foot, or box the car in ---
    if (this.stars > 0 && closest < TUNE.bustedRange) {
      if (!ctx.playerCar) this.bustedT += dt;
      else if (Math.abs(ctx.playerCar.speed) < 1.5) this.bustedT += dt * 0.8;
      if (this.bustedT > TUNE.bustedTime) {
        this.bustedT = 0;
        ctx.onBusted?.();
      }
    } else this.bustedT = Math.max(0, this.bustedT - dt * 2);
  }

  _spawnUnit(px, pz) {
    // spawn on a road 45–70 units away, preferably ahead of the player
    const ang = Math.random() * Math.PI * 2;
    let x = px + Math.cos(ang) * 55, z = pz + Math.sin(ang) * 55;
    x = Math.round(x / P) * P; z = Math.round(z / P) * P;
    const lim = TUNE.blocks * P + 10;
    x = THREE.MathUtils.clamp(x, -lim, lim); z = THREE.MathUtils.clamp(z, -lim, lim);
    const u = createCar(this.scene, 'police', x, z, Math.atan2(px - x, pz - z));
    u.ai = { police: true };
    this.units.push(u);
    this.allCars.push(u);
  }
}
