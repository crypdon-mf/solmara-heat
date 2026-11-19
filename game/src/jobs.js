// The story: eight jobs from Mara Voss. Each job is a small state machine —
// stages, a 3D beacon marker, a timer, clear fail states, and a payout.
import * as THREE from 'three';
import { TUNE, JOBS } from './tuning.js';
import { createCar, damageCar } from './autos.js';
import { Rng } from './rng.js';

const P = TUNE.pitch;

export class Jobs {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.active = null;      // current mission state
    this.doneJobs = [];
    this.rng = new Rng(777);
    // beacon: tall light pillar + ground ring at the current objective
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc800, transparent: true, opacity: 0.35, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 40, 16, 1, true), mat);
    this.beacon.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 24), new THREE.MeshBasicMaterial({ color: 0xffc800, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    this.ring = ring; this.ring.visible = false;
    scene.add(this.beacon, this.ring);
  }

  get firstUndone() {
    for (let i = 0; i < JOBS.length; i++) if (!this.doneJobs.includes(JOBS[i].id)) return i;
    return JOBS.length;
  }
  get storyComplete() { return this.doneJobs.length >= JOBS.length; }

  start(index, ctx) {
    const job = JOBS[index];
    if (!job) return false;
    this.active = {
      index, job, stage: 0, timer: this._timeFor(job),
      target: null, tailT: 0, holdT: 0, checkpoints: [], cpIndex: 0,
      text: job.brief, extra: null,
    };
    const A = this.active;
    const pl = this.city.places;
    if (job.kind === 'goto') A.target = { ...pl.hotel, label: 'Hotel Solmara' };
    if (job.kind === 'steal') {
      // the red sportscar waits in the marina lot
      const car = createCar(this.scene, 'sport', pl.marinaLot.x, pl.marinaLot.z, 0, 0xd21f3c);
      car.ai = { parked: true, missionCar: true };
      ctx.allCars.push(car);
      A.extra = car;
      A.target = { ...pl.marinaLot, label: 'Marina lot — the red sportscar' };
    }
    if (job.kind === 'escape') {
      ctx.wanted.add(42, 'mission heat');
      A.target = null;
      A.text = 'Lose the cops — break line of sight until the stars clear.';
    }
    if (job.kind === 'checkpoints') this._makeCheckpoints(A, 4);
    if (job.kind === 'stealth') A.target = { ...pl.oldtownPickup, label: 'Old Town pickup' };
    if (job.kind === 'chase') {
      const car = createCar(this.scene, 'muscle', ctx.playerX + 24, ctx.playerZ + 10, 0, 0x1f1f24);
      car.ai = { target: true };
      car._wp = { x: ctx.playerX + 60, z: ctx.playerZ };
      ctx.allCars.push(car);
      A.extra = car;
      A.target = { car, label: 'The courier' };
    }
    if (job.kind === 'nightrun') {
      ctx.setHour?.(23.2);
      this._makeCheckpoints(A, 3);
      A.text = 'Midnight run — hit the drops, keep the heat under 3 stars.';
    }
    if (job.kind === 'heist') A.target = { ...pl.bank, label: 'Solmara Bank' };
    ctx.toast(`JOB: ${job.name} — ${job.brief}`);
    ctx.sfx.jingle(true);
    return true;
  }

  _timeFor(job) {
    return { goto: 150, steal: 240, escape: 200, checkpoints: 170, stealth: 210, chase: 160, nightrun: 200, heist: 300 }[job.kind] || 180;
  }
  _makeCheckpoints(A, n) {
    A.checkpoints = [];
    for (let i = 0; i < n; i++) {
      A.checkpoints.push({
        x: this.rng.int(-4, 4) * P + (this.rng.chance(0.5) ? 0 : 0),
        z: this.rng.int(-4, 4) * P,
        label: `Drop ${i + 1}/${n}`,
      });
    }
    A.cpIndex = 0;
    A.target = A.checkpoints[0];
  }

  update(dt, ctx) {
    const A = this.active;
    if (!A) { this.beacon.visible = false; this.ring.visible = false; return null; }
    A.timer -= dt;
    if (A.timer <= 0) return this._fail(A, ctx, 'Out of time.');
    const job = A.job;
    const px = ctx.playerX, pz = ctx.playerZ;
    const near = (t, r = 6) => t && Math.hypot(px - t.x, pz - t.z) < r;

    if (job.kind === 'goto') {
      if (near(A.target, 6)) return this._complete(A, ctx);
    }
    if (job.kind === 'steal') {
      if (A.stage === 0) {
        if (ctx.playerCar === A.extra) {
          A.stage = 1;
          A.target = { ...this.city.places.garage, label: "Mara's garage" };
          A.text = 'Got it. Now deliver it to Mara\'s garage.';
          ctx.toast("Mara: 'Nice. Bring it home.'");
        }
      } else if (near(A.target, 6)) return this._complete(A, ctx);
    }
    if (job.kind === 'escape') {
      if (ctx.wanted.stars === 0) return this._complete(A, ctx);
    }
    if (job.kind === 'checkpoints' || job.kind === 'nightrun') {
      if (near(A.target, 6)) {
        ctx.sfx.pickup();
        A.cpIndex++;
        if (A.cpIndex >= A.checkpoints.length) return this._complete(A, ctx);
        A.target = A.checkpoints[A.cpIndex];
      }
      if (job.kind === 'nightrun' && ctx.wanted.stars >= 3) return this._fail(A, ctx, 'Too hot — 3 stars at night. Mara pulls the job.');
    }
    if (job.kind === 'stealth') {
      if (ctx.wanted.stars >= 1) return this._fail(A, ctx, 'Spotted. The pickup is blown.');
      if (A.stage === 0 && near(A.target, 5)) {
        A.stage = 1;
        A.target = { ...this.city.places.garage, label: "Mara's garage" };
        A.text = 'Package in hand. Ghost it back to the garage — still unseen.';
        ctx.toast("Mara: 'Clean. Now vanish.'");
      } else if (A.stage === 1 && near(A.target, 6)) return this._complete(A, ctx);
    }
    if (job.kind === 'chase') {
      const tgt = A.extra;
      if (!tgt || tgt.wrecked || tgt.hp <= 30) {
        if (tgt && tgt.hp <= 30) return this._complete(A, ctx);
        return this._fail(A, ctx, 'The courier got away.');
      }
      // target flees along roads
      this._fleeDrive(tgt, px, pz, dt, ctx);
      const d = Math.hypot(tgt.x - px, tgt.z - pz);
      if (d < 13) {
        A.tailT += dt;
        if (A.tailT > 12) return this._complete(A, ctx);
      } else A.tailT = Math.max(0, A.tailT - dt * 0.5);
      if (d > 90) return this._fail(A, ctx, 'Lost the courier.');
    }
    if (job.kind === 'heist') {
      if (A.stage === 0 && near(A.target, 6)) {
        A.stage = 1; A.holdT = 0;
        A.text = 'Inside. Hold position — crack the vault (stay 4 seconds).';
      } else if (A.stage === 1) {
        if (near(A.target, 8)) {
          A.holdT += dt;
          if (A.holdT >= 4) {
            A.stage = 2;
            ctx.wanted.add(70, 'bank job');
            A.target = { ...this.city.places.boat, label: 'The boat at the pier' };
            A.text = 'Cash grabbed — 4 stars! Run to the boat at the pier!';
            ctx.toast("Mara: 'GO GO GO — the boat, now!'");
          }
        } else A.holdT = Math.max(0, A.holdT - dt);
      } else if (A.stage === 2 && near(A.target, 7)) return this._complete(A, ctx);
    }

    // beacon follows the current target
    const t = this._targetPos(A);
    if (t) {
      this.beacon.visible = true; this.ring.visible = true;
      this.beacon.position.set(t.x, 20, t.z);
      this.beacon.rotation.y += dt;
      this.ring.position.set(t.x, 0.15, t.z);
      const pulse = 1 + Math.sin(ctx.time * 4) * 0.15;
      this.ring.scale.set(pulse, pulse, 1);
    } else { this.beacon.visible = false; this.ring.visible = false; }
    return A;
  }

  _targetPos(A) {
    const t = A.target;
    if (!t) return null;
    if (t.car) return { x: t.car.x, z: t.car.z };
    if (t.x != null) return t;
    return null;
  }

  _fleeDrive(car, px, pz, dt, ctx) {
    // pick a waypoint away from the player, drive toward it on the grid
    const d = Math.hypot(car._wp.x - car.x, car._wp.z - car.z);
    if (d < 6) {
      const away = Math.atan2(car.x - px, car.z - pz);
      car._wp = {
        x: THREE.MathUtils.clamp(car.x + Math.sin(away) * 60, -150, 150),
        z: THREE.MathUtils.clamp(car.z + Math.cos(away) * 60, -150, 150),
      };
      car._wp.x = Math.round(car._wp.x / P) * P;
      car._wp.z = Math.round(car._wp.z / P) * P;
    }
    const desired = Math.atan2(car._wp.x - car.x, car._wp.z - car.z);
    let diff = ((desired - car.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    car.heading += THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);
    car.speed = THREE.MathUtils.damp(car.speed, 21, 1.2, dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // collide with the player's car: ram damage both ways
    if (ctx.playerCar) {
      const dd = Math.hypot(car.x - ctx.playerCar.x, car.z - ctx.playerCar.z);
      if (dd < car.radius + ctx.playerCar.radius - 0.3) {
        damageCar(car, 10 * dt * 10, ctx);
        damageCar(ctx.playerCar, 6 * dt * 10, ctx);
        ctx.playerCar.speed *= 0.96;
        ctx.particles.burst(car.x, 1, car.z, 6, 3, 2, 0.4, 1, 0.75, 0.25);
        if (Math.random() < dt * 3) ctx.sfx.crash(0.4);
      }
    }
  }

  objectiveText(ctx) {
    const A = this.active;
    if (!A) return null;
    const t = this._targetPos(A);
    const dist = t ? Math.round(Math.hypot(t.x - ctx.playerX, t.z - ctx.playerZ)) : null;
    let text = A.text;
    if (A.job.kind === 'escape') text = `Lose the cops — stars: ${ctx.wanted.stars}`;
    if (A.job.kind === 'chase') text = `Stay on the courier — tail ${Math.floor(A.tailT)}/12s (or ram him)`;
    if (A.job.kind === 'heist' && A.stage === 1) text = `Cracking the vault… ${Math.max(0, 4 - A.holdT).toFixed(1)}s`;
    return { name: A.job.name, text, dist, timer: Math.max(0, A.timer) };
  }

  _complete(A, ctx) {
    this.active = null;
    this.beacon.visible = false; this.ring.visible = false;
    if (!this.doneJobs.includes(A.job.id)) this.doneJobs.push(A.job.id);
    ctx.cash += A.job.pay;
    ctx.totalEarned += A.job.pay;
    ctx.sfx.jingle(true);
    ctx.toast(`JOB DONE: ${A.job.name} — +$${A.job.pay}`);
    ctx.onJobDone?.(A.job, this.storyComplete);
    return 'done';
  }
  _fail(A, ctx, why) {
    this.active = null;
    this.beacon.visible = false; this.ring.visible = false;
    ctx.sfx.jingle(false);
    ctx.toast(`JOB FAILED: ${why}`);
    ctx.onJobFailed?.(A.job, why);
    return 'failed';
  }
  cancel() {
    this.active = null;
    this.beacon.visible = false; this.ring.visible = false;
  }
}
