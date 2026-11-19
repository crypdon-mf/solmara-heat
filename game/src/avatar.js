// avatar.js — Jax Marlowe on foot: movement, camera-relative steering,
// jumping, punching and the pistol. The avatar is a low-poly figure with
// a jacket, jeans and a walk cycle; the camera orbit lives in scene.js
// and feeds `camYaw` in each frame.

import * as THREE from 'three';
import { TUNE } from './tune.js';
import { resolveCircleAABB } from './city.js';

function buildAvatarMesh() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const jacket = mat(0x8a2f2f);   // Jax's red-brown jacket
  const jeans = mat(0x2c3e50);
  const skin = mat(0xe0ac69);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.32), jacket);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1a1a1a));
  cap.position.y = 1.78;
  g.add(cap);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), jeans);
  legL.position.set(-0.16, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legL, legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.18), jacket);
  armL.position.set(-0.4, 1.18, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armL, armR);

  // Pistol in the right hand, visible when drawn.
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), mat(0x111111));
  barrel.position.set(0, 0, 0.14);
  gun.add(barrel);
  gun.position.set(0.4, 0.95, 0.2);
  gun.visible = false;
  g.add(gun);

  return { group: g, legL, legR, armL, armR, gun };
}

export function makeAvatar(city) {
  const parts = buildAvatarMesh();
  city.group.add(parts.group);
  const a = {
    ...parts,
    x: -182, z: 16,          // Marina spawn, on the road by the taxi rank
    heading: Math.PI / 2,
    y: 0, vy: 0,
    health: TUNE.maxHealth,
    ammo: TUNE.magSize,
    reserve: 36,
    reloading: 0,
    shootTimer: 0,
    punchTimer: 0,
    punchAnim: 0,
    gunDrawn: false,
    walkPhase: 0,
    radius: 0.7,

    reset(x, z, heading) {
      this.x = x; this.z = z; this.heading = heading;
      this.y = 0; this.vy = 0;
      this.health = TUNE.maxHealth;
      this.ammo = TUNE.magSize;
      this.reloading = 0;
    },

    update(input, dt, camYaw, colliders, onStep) {
      // Movement is relative to the camera: W walks away from the lens.
      let mx = 0, mz = 0;
      if (input.up) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
      if (input.down) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
      if (input.left) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
      if (input.right) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
      const len = Math.hypot(mx, mz);
      const sprinting = input.sprint && len > 0;
      const speed = sprinting ? TUNE.sprintSpeed : TUNE.walkSpeed;
      if (len > 0) {
        mx /= len; mz /= len;
        this.heading = Math.atan2(mx, mz);
        this.x += mx * speed * dt;
        this.z += mz * speed * dt;
        this.walkPhase += dt * speed * 1.9;
        onStep?.(sprinting);
      }
      // Jump + gravity.
      if (input.just.has('brake') && this.y <= 0.01) {
        this.vy = TUNE.jumpSpeed;
        onStep?.('jump');
      }
      this.vy -= TUNE.gravity * dt;
      this.y += this.vy * dt;
      if (this.y < 0) { this.y = 0; this.vy = 0; }
      // Buildings block the player.
      for (const box of colliders) {
        const push = resolveCircleAABB(this.x, this.z, this.radius, box);
        if (push) { this.x += push.x; this.z += push.z; }
      }
      this.x = Math.max(-245, Math.min(205, this.x));
      this.z = Math.max(-205, Math.min(205, this.z));

      // Timers.
      if (this.punchTimer > 0) this.punchTimer -= dt;
      if (this.shootTimer > 0) this.shootTimer -= dt;
      if (this.punchAnim > 0) this.punchAnim -= dt;
      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0 && this.reserve > 0) {
          const take = Math.min(TUNE.magSize, this.reserve);
          this.reserve -= take;
          this.ammo = take;
        }
      }
      // Walk-cycle + punch pose.
      const swing = len > 0 ? Math.sin(this.walkPhase) * 0.6 : 0;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.7;
      if (this.punchAnim > 0) {
        this.armR.rotation.x = -1.9; // arm extended
      } else if (this.gunDrawn) {
        this.armR.rotation.x = -1.35; // aiming
      } else {
        this.armR.rotation.x = swing * 0.7;
      }
      this.gun.visible = this.gunDrawn;
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.y = this.heading;
    },

    tryPunch() {
      if (this.punchTimer > 0) return false;
      this.punchTimer = TUNE.punchCooldown;
      this.punchAnim = 0.28;
      return true;
    },

    tryShoot() {
      if (this.reloading > 0 || this.ammo <= 0 || this.shootTimer > 0) return 'empty';
      this.shootTimer = 0.22;
      this.ammo -= 1;
      this.gunDrawn = true;
      return 'fired';
    },

    tryReload() {
      if (this.reloading > 0 || this.ammo === TUNE.magSize || this.reserve <= 0) return false;
      this.reloading = TUNE.reloadTime;
      return true;
    },
  };
  return a;
}
