// Solmara Heat — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, over, mission-result, story and
// jobs screens. ?seed=N fixes the city; ?shot=start|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CAR_TUNING, PLAYER_TUNING, SAVE_KEY, START_CASH, WANTED } from './config.js';
import { createRandom, clamp, angleDelta } from './random.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_MUTE, ACTION_MISSIONS } from './input.js';
import { createAudio } from './audio.js';
import { buildCity, resolveColliders, insideCity } from './world.js';
import { makeCar, updateDrive, separateCars, CAR_COLORS } from './vehicles.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY } from './render.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();
const renderer = createRenderer(canvas);
const city = buildCity(THREE, rng);
renderer.scene.add(city.group);

// ---- save ---------------------------------------------------------------
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      missionsDone: G.mission.doneIds.length,
      bestStars: G.save.bestStars,
      playtime: G.save.playtime,
    }));
  } catch { /* storage off: progress lasts this visit only */ }
}

// ---- state --------------------------------------------------------------
const G = {
  seed, rng, time: 0,
  cash: START_CASH,
  screen: 'title',
  player: {
    x: 0, z: 8, heading: Math.PI, vx: 0, vz: 0, vy: 0, onGround: true,
    health: 100, ammo: 12, reserveAmmo: 48, inCar: false, car: null,
    mesh: null, punchTimer: 0, shootCooldown: 0,
  },
  wanted: { heat: 0, stars: 0, hiddenTime: 0, seen: false },
  mission: { active: false, def: null, objective: '', timeLeft: 0, marker: null, stage: 0, doneIds: [], doneCount: 0, checkpoints: [] },
  police: { cars: [], foot: [], spawnTimer: 0 },
  traffic: [], peds: [],
  cameraOrbit: { yaw: null, pitch: 0 },
  save: { bestStars: 0, playtime: 0 },
  cars: [],
  markerMesh: null,
  beacon: null,
};

const saved = readSave();
if (saved) {
  G.cash = saved.cash ?? START_CASH;
  G.save.bestStars = saved.bestStars ?? 0;
  G.save.playtime = saved.playtime ?? 0;
  if (Array.isArray(saved.missionsDone)) G.mission.doneIds = saved.missionsDone;
  else if (typeof saved.missionsDone === 'number') G.mission.doneCount = saved.missionsDone;
}
hud.setTitleStats(saved);

// ---- player mesh (on foot) ----------------------------------------------
function buildPlayerMesh() {
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
G.player.mesh = buildPlayerMesh();
G.player.mesh.position.set(G.player.x, 0, G.player.z);
renderer.scene.add(G.player.mesh);

// ---- cars ---------------------------------------------------------------
function spawnParkedCars() {
  const used = new Set();
  for (const spot of city.parkedSpots) {
    const key = `${Math.round(spot.x / 10)}:${Math.round(spot.z / 10)}`;
    if (used.has(key)) continue;
    used.add(key);
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const car = makeCar(THREE, renderer.scene, spot.x, spot.z, spot.heading, color, 'sedan');
    car.parked = true;
    G.cars.push(car);
  }
  // The player's starter car: a teal sedan parked by the plaza at the centre.
  const starter = makeCar(THREE, renderer.scene, 4.6, 26, Math.PI / 2, 0x2a9d8f, 'sedan');
  starter.parked = true;
  G.cars.push(starter);
}
spawnParkedCars();

// Mission marker beacon (a gold cylinder + ring) reused by every mission.
{
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.visible = false;
  renderer.scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.18, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23c }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  renderer.scene.add(ring);
  G.beacon = beacon;
  G.markerMesh = ring;
}
export function setMarker(x, z) {
  G.mission.marker = { x, z };
  G.beacon.position.set(x, 7, z);
  G.beacon.visible = true;
  G.markerMesh.position.set(x, 0.15, z);
  G.markerMesh.visible = true;
}
export function clearMarker() {
  G.mission.marker = null;
  G.beacon.visible = false;
  G.markerMesh.visible = false;
}
export { G };

// ---- on-foot movement ----------------------------------------------------
function stepOnFoot(dt) {
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
  resolveColliders(p, PLAYER_TUNING.radius, city.colliders);
  // Jump / gravity.
  if (input.held.handbrake && p.onGround) { p.vy = PLAYER_TUNING.jumpSpeed; p.onGround = false; }
  p.vy -= PLAYER_TUNING.gravity * dt;
  const y = (p.mesh.position.y || 0) + p.vy * dt;
  if (y <= 0) { p.mesh.position.y = 0; p.vy = 0; p.onGround = true; }
  else p.mesh.position.y = y;
  p.mesh.position.set(p.x, p.mesh.position.y, p.z);
  p.mesh.rotation.y = p.heading;
  // Walk-cycle leg swing.
  const swing = Math.sin(G.time * 11) * clamp(sp / PLAYER_TUNING.walkSpeed, 0, 1) * 0.55;
  const legL = p.mesh.getObjectByName('legL');
  const legR = p.mesh.getObjectByName('legR');
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (drag.clicked) shootPistol();
}

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.driver === 'traffic' || car.driver === 'police') continue;
    const d = Math.hypot(car.x - G.player.x, car.z - G.player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const p = G.player;
  p.inCar = true;
  p.car = car;
  car.driver = 'player';
  car.parked = false;
  p.mesh.visible = false;
  G.cameraOrbit.yaw = null;
  hud.toast(car.parked === false && car.stolen ? 'You jacked the ride.' : 'You got in the car.');
  audio.unlock();
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.parked = true;
  const sideX = car.x + Math.cos(car.heading) * 2.4;
  const sideZ = car.z - Math.sin(car.heading) * 2.4;
  p.x = sideX; p.z = sideZ;
  p.heading = car.heading;
  p.vx = 0; p.vz = 0;
  p.inCar = false;
  p.car = null;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  G.cameraOrbit.yaw = p.heading + Math.PI;
}

function shootPistol() {
  const p = G.player;
  if (p.shootCooldown > 0 || p.ammo <= 0) return;
  p.shootCooldown = 0.28;
  p.ammo -= 1;
  audio.shot();
  // Muzzle flash: a brief gold point light-free sprite is overkill; the shot
  // sound plus a tracer line the police module reads is enough here.
  addHeat(6, 'gunshot');
}

// ---- wanted --------------------------------------------------------------
export function addHeat(amount, why) {
  const w = G.wanted;
  w.heat = clamp(w.heat + amount, 0, 100);
  const stars = Math.min(WANTED.maxStars, Math.floor(w.heat / 20) + (w.heat > 0 ? 1 : 0));
  if (stars > w.stars && stars > G.save.bestStars) G.save.bestStars = stars;
  if (stars !== w.stars) {
    w.stars = stars;
    if (stars > 0) hud.toast(`Wanted level ${stars}★ — ${why}`);
  }
}

// ---- fixed step ----------------------------------------------------------
function step(dt) {
  G.time += dt;
  G.save.playtime += dt;
  const p = G.player;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.punchTimer > 0) p.punchTimer -= dt;

  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on');
  }
  if (actions & ACTION_ENTER) {
    if (p.inCar) exitCar();
    else {
      const car = nearestCar(4);
      if (car) enterCar(car);
    }
  }

  if (p.inCar && p.car) {
    updateDrive(p.car, input.throttle(), input.steer(), input.held.handbrake, dt);
    const car = p.car;
    if (resolveColliders(car, CAR_TUNING.radius, city.colliders)) {
      if (Math.abs(car.speed) > 6) { audio.crash(Math.abs(car.speed) / 30); addHeat(2, 'crash'); }
      car.speed *= 0.4;
    }
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    // Car-car bumps.
    for (const other of G.cars) {
      if (other === car) continue;
      if (separateCars(car, other)) audio.crash(0.3);
    }
    if (!insideCity(car.x, car.z)) { car.x = clamp(car.x, -244, 244); car.z = clamp(car.z, -244, 262); }
    audio.setEngine(Math.abs(car.speed) / CAR_TUNING.maxSpeed, true);
  } else {
    stepOnFoot(dt);
    audio.setEngine(0, false);
  }

  // Heat decays when the player is out of sight (police module refines this).
  if (G.wanted.heat > 0 && G.police.cars.length === 0) {
    G.wanted.heat = Math.max(0, G.wanted.heat - WANTED.decayPerSecond * dt);
    if (G.wanted.heat === 0) G.wanted.stars = 0;
  }
  if (G.beacon.visible) {
    G.beacon.rotation.y += dt;
    G.markerMesh.scale.setScalar(1 + Math.sin(G.time * 4) * 0.12);
  }
  // Water shimmer.
  for (const water of city.waterMeshes) water.position.y = 0.05 + Math.sin(G.time * 0.8) * 0.06;
}

// ---- screens / loop ------------------------------------------------------
const hudEl = document.getElementById('hud');
function setScreen(name) {
  G.screen = name;
  if (name === 'play') {
    hud.hideScreens();
    hudEl.classList.remove('hidden');
  } else if (name === 'title') {
    hud.showScreen('title');
    hudEl.classList.add('hidden');
    hud.setTitleStats(readSave());
  } else {
    hud.showScreen(name);
  }
}

function startGame(fresh) {
  if (fresh) {
    G.cash = START_CASH;
    G.mission.doneIds = [];
    G.mission.doneCount = 0;
    G.player.health = 100;
    G.player.x = 0; G.player.z = 8;
    G.wanted.heat = 0; G.wanted.stars = 0;
  }
  audio.unlock();
  setScreen('play');
  status.textContent = 'Playing Solmara Heat. Press Q for jobs.';
}

function bindButtons() {
  document.getElementById('btn-new').addEventListener('click', () => startGame(true));
  document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
  document.getElementById('btn-jobs').addEventListener('click', () => { audio.unlock(); openJobs(); });
  document.getElementById('btn-resume').addEventListener('click', () => setScreen('play'));
  document.getElementById('btn-quit').addEventListener('click', () => setScreen('title'));
  document.getElementById('btn-respawn').addEventListener('click', () => setScreen('play'));
  document.getElementById('btn-mission-ok').addEventListener('click', () => setScreen('play'));
  document.getElementById('btn-story-ok').addEventListener('click', () => setScreen('play'));
  document.getElementById('btn-missions-close').addEventListener('click', () => setScreen(G.screen === 'missions' ? 'play' : 'title'));
}
bindButtons();

function openJobs() {
  // Slice 4 fills this with the real mission list; for now it just opens the panel.
  const list = document.getElementById('mission-list');
  list.innerHTML = '<p style="color:#9aa7b8">Jobs unlock as the story is built — Slice 4. For now, drive Solmara and learn the streets.</p>';
  setScreen('missions');
}

function runShot(name) {
  const staged = stageShot(name, G, THREE);
  if (staged.screen === 'title') {
    hud.showScreen('title');
    hudEl.classList.add('hidden');
  } else {
    setScreen('play');
  }
  let painted = 0;
  function paint() {
    renderer.updateCamera(G.player.inCar ? G.player.car : G.player, G.cameraOrbit.yaw, G.cameraOrbit.pitch, G.player.inCar, 0.016, G.time);
    renderer.render();
    hud.update(G);
    hud.drawMinimap(G, city);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  setScreen('title');
  status.textContent = 'Solmara Heat. Press Enter or click New Game to start.';

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (G.screen === 'title' && (actions & ACTION_CONFIRM)) startGame(false);
    else if (G.screen === 'play' && (actions & ACTION_PAUSE)) setScreen('pause');
    else if (G.screen === 'pause' && (actions & ACTION_PAUSE)) setScreen('play');
    else if (G.screen === 'missions' && (actions & ACTION_MISSIONS)) setScreen('play');
    else if (G.screen === 'play' && (actions & ACTION_MISSIONS)) openJobs();

    if (G.screen === 'play') {
      while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
    } else {
      accumulator = 0;
      // Title backdrop: slow orbit around the city centre.
      if (G.screen === 'title') {
        G.time += 0.016;
        const focus = { x: Math.sin(G.time * 0.05) * 60, z: Math.cos(G.time * 0.05) * 60 - 40, heading: 0 };
        renderer.updateCamera(focus, G.time * 0.05 + Math.PI, 0.35, false, 0.016, G.time);
      }
    }
    if (G.screen === 'play' || G.screen === 'pause' || G.screen === 'missions') {
      const focus = G.player.inCar ? G.player.car : G.player;
      renderer.updateCamera(focus, G.player.inCar ? null : G.cameraOrbit.yaw, G.cameraOrbit.pitch, G.player.inCar, 0.016, G.time);
      hud.update(G);
      hud.drawMinimap(G, city);
    }
    renderer.render();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') setScreen('pause');
  });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
