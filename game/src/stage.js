// The three.js stage: renderer, sun + shadows, sky, fog, day/night cycle,
// and a pooled particle system (dust, sparks, smoke, muzzle flash).
import * as THREE from 'three';
import { TUNE } from './tuning.js';

export class Stage {
  constructor(canvas) {
    // Staged screenshots render in software GL — antialiasing there costs
    // seconds per frame, so shot mode renders without MSAA; real browsers
    // (the game as shipped) keep it.
    const shotMode = new URLSearchParams(location.search).has('shot');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !shotMode });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    // Shot mode renders in software GL: small shadow map + single-tap
    // shadows keep it tractable; real browsers get the full PCF map.
    this.renderer.shadowMap.type = shotMode ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // refreshed every few frames by boot
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5e0);
    this.scene.fog = new THREE.Fog(0x9db8d6, 120, 380);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

    // Sun with a shadow camera that follows the player.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shotMode ? 512 : 1024, shotMode ? 512 : 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 10; sc.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x3a3f2e, 0.9);
    this.scene.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.0);
    this.scene.add(this.moon);

    // Sky dome: big gradient sphere, recoloured by time of day.
    const skyGeo = new THREE.SphereGeometry(700, 24, 12);
    this.skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(this.sky);

    // Sun disc + moon disc sprites riding the dome.
    this.sunDisc = this._disc(0xffdf80, 26);
    this.moonDisc = this._disc(0xe8ecf5, 15);
    this.scene.add(this.sunDisc, this.moonDisc);

    // Stars: points that fade in at night.
    const starGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(600 * 3);
    const rng = () => Math.random() * 2 - 1;
    for (let i = 0; i < 600; i++) {
      const v = new THREE.Vector3(rng(), Math.abs(rng()) * 0.9 + 0.08, rng()).normalize().multiplyScalar(650);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    this.scene.add(this.stars);

    this.particles = new ParticlePool(this.scene, 900);
    this.hour = TUNE.startHour;
    this.nightFactor = 0;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _disc(color, size) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(size, 24),
      new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.95 }),
    );
    return m;
  }

  // Advance the clock and relight the world. hour is 0..24.
  setTime(hour) {
    this.hour = hour % 24;
    const t = this.hour / 24;
    // Sun elevation: peaks at noon, below horizon at night.
    const ang = (t - 0.25) * Math.PI * 2; // 0 at 06:00, PI at 18:00
    const elev = Math.sin(ang);
    const azim = Math.cos(ang);
    const sunPos = new THREE.Vector3(azim * 180, elev * 180, 60);
    this.sun.position.copy(sunPos);
    this.moon.position.copy(sunPos.clone().multiplyScalar(-1));
    this.sunDisc.position.copy(sunPos.clone().normalize().multiplyScalar(660));
    this.sunDisc.lookAt(0, 0, 0);
    this.moonDisc.position.copy(sunPos.clone().multiplyScalar(-1).normalize().multiplyScalar(660));
    this.moonDisc.lookAt(0, 0, 0);

    const day = THREE.MathUtils.clamp(elev * 2.2 + 0.25, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 4, 0, 1) * (elev > -0.15 ? 1 : 0);
    this.nightFactor = 1 - day;
    // Sky colour: noon blue -> dusk orange -> night navy.
    const noon = new THREE.Color(0x7fb4e8), duskC = new THREE.Color(0xe8863c), night = new THREE.Color(0x0d1526);
    const sky = noon.clone().lerp(duskC, dusk * 0.8).lerp(night, this.nightFactor);
    this.scene.background.copy(sky);
    this.skyMat.color.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.12 * day);
    this.sun.intensity = 2.6 * day + 0.05;
    this.sun.color.setHex(dusk > 0.4 ? 0xff9a4d : 0xfff2d8);
    this.hemi.intensity = 0.25 + 0.75 * day;
    this.moon.intensity = 0.5 * this.nightFactor;
    this.stars.material.opacity = this.nightFactor * 0.9;
    this.renderer.toneMappingExposure = 1.05 - this.nightFactor * 0.25;
  }

  // Keep the shadow camera centred on the action.
  followShadow(x, z) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + 120, this.sun.position.y, z + 60);
    this.sun.target.updateMatrixWorld();
  }

  get isNight() { return this.nightFactor > 0.55; }
  render() { this.renderer.render(this.scene, this.camera); }
}

// Pooled point particles — one draw call for all dust/sparks/smoke.
class ParticlePool {
  constructor(scene, max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
  }
  spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
  }
  burst(x, y, z, n, spread, up, life, r, g, b) {
    for (let k = 0; k < n; k++) {
      this.spawn(x, y, z,
        (Math.random() - 0.5) * spread, Math.random() * up,
        (Math.random() - 0.5) * spread, life * (0.6 + Math.random() * 0.7), r, g, b);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 1.5 * dt; // settle
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
