// scene.js — the three.js stage for Solmara Heat: renderer, sun with
// shadows, day/night sky, fog, the orbit camera with collision pull-in,
// and a small particle pool for crashes and smoke.

import * as THREE from 'three';
import { SKY_KEYS } from './tune.js';

function skyAt(hour) {
  // Find the two keys around `hour` and lerp every channel.
  const keys = SKY_KEYS;
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (hour >= keys[i].hour && hour <= keys[i + 1].hour) { a = keys[i]; b = keys[i + 1]; break; }
  }
  const span = Math.max(0.001, b.hour - a.hour);
  const t = Math.min(1, Math.max(0, (hour - a.hour) / span));
  const mix = (ca, cb) => {
    const A = new THREE.Color(ca), B = new THREE.Color(cb);
    return A.lerp(B, t);
  };
  return {
    top: mix(a.top, b.top),
    low: mix(a.low, b.low),
    sun: mix(a.sun, b.sun),
    fog: mix(a.fog, b.fog),
    t,
  };
}

export function makeStage(container, city) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3f8fd2);
  scene.fog = new THREE.Fog(0xcfe4ee, 120, 420);
  scene.add(city.group);

  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 900);

  // --- lights ---
  const sun = new THREE.DirectionalLight(0xfff2c8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.9);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(amb);

  // --- particles: one shared pool, reused for smoke, dust and sparks ---
  const P_MAX = 90;
  const pGeo = new THREE.PlaneGeometry(0.7, 0.7);
  const pMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.7, depthWrite: false });
  const particles = [];
  for (let i = 0; i < P_MAX; i++) {
    const m = new THREE.Mesh(pGeo, pMat.clone());
    m.visible = false;
    scene.add(m);
    particles.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let pCursor = 0;
  function puff(x, y, z, color, n = 6, speed = 2) {
    for (let k = 0; k < n; k++) {
      const p = particles[pCursor];
      pCursor = (pCursor + 1) % P_MAX;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.material.color.set(color);
      p.mesh.material.opacity = 0.75;
      p.life = 0.7 + Math.random() * 0.5;
      const a = Math.random() * Math.PI * 2;
      p.vx = Math.cos(a) * speed * Math.random();
      p.vy = 1 + Math.random() * 2;
      p.vz = Math.sin(a) * speed * Math.random();
    }
  }

  let camYaw = 0, camPitch = 0.32, camDist = 9.5;

  function updateCamera(dt, target, input, colliders) {
    // Mouse orbit (pointer locked) or slow auto-follow behind the car.
    if (input.lookDX) camYaw -= input.lookDX * 0.0032;
    if (input.lookDY) camPitch = Math.min(1.1, Math.max(0.08, camPitch + input.lookDY * 0.0022));
    const tx = target.x, tz = target.z, ty = (target.y || 0) + 1.7;
    const cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    const cy = ty + Math.sin(camPitch) * camDist;
    // Pull the camera in when a building stands between it and the target.
    let dist = camDist;
    for (const b of colliders) {
      const inside = cx > b.minX - 1 && cx < b.maxX + 1 && cz > b.minZ - 1 && cz < b.maxZ + 1 && cy < 70;
      if (inside) { dist = Math.max(3.5, dist * 0.55); }
    }
    const fx = tx + Math.sin(camYaw) * Math.cos(camPitch) * dist;
    const fz = tz + Math.cos(camYaw) * Math.cos(camPitch) * dist;
    const fy = ty + Math.sin(camPitch) * dist;
    camera.position.set(fx, fy, fz);
    camera.lookAt(tx, ty, tz);
  }

  function updateSky(hour, clock) {
    const sky = skyAt(hour);
    scene.background.copy(sky.top);
    scene.fog.color.copy(sky.fog);
    // Sun angle: noon overhead, midnight below the horizon.
    const ang = ((hour - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    sun.position.set(Math.cos(ang) * 160, Math.max(8, elev * 180), 90);
    const night = Math.max(0, Math.min(1, (0.12 - elev) * 4));
    const dusk = Math.max(0, 1 - Math.abs(elev) * 3);
    sun.intensity = 2.4 * (1 - night) + 0.25;
    sun.color.copy(sky.sun);
    hemi.intensity = 0.9 * (1 - night * 0.7);
    amb.intensity = 0.18 + night * 0.12;
    // Windows and lamps glow after dark; headlight beams switch on.
    for (const m of city.windows) m.emissiveIntensity = night * 0.9 + dusk * 0.25;
    for (const l of city.lamps) {
      l.bulb.material.color.set(night > 0.4 ? 0xffe9a8 : 0x8a8a7a);
      l.bulb.scale.setScalar(night > 0.4 ? 1.5 : 1);
    }
    city.water.material.opacity = 0.85 + Math.sin(clock * 0.5) * 0.05;
    return { night, dusk };
  }

  function followSun(target) {
    sun.position.x += target.x;
    sun.position.z += target.z;
    sun.target.position.set(target.x, 0, target.z);
    sun.target.updateMatrixWorld();
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.material.opacity = Math.min(0.75, p.life);
      p.mesh.lookAt(camera.position);
    }
  }

  return {
    renderer, scene, camera, sun,
    get camYaw() { return camYaw; },
    setCamYaw(y) { camYaw = y; },
    setCamDist(d) { camDist = d; },
    setCamPitch(p) { camPitch = p; },
    puff, updateCamera, updateSky, followSun, updateParticles,
    resize() {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    render() { renderer.render(scene, camera); },
    isNight(hour) {
      const ang = ((hour - 6) / 12) * Math.PI;
      return Math.sin(ang) < 0.12;
    },
  };
}
