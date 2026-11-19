// SOLMARA HEAT v2 — boot + game loop. Builds the world, runs the fixed
// frame loop, drives the third-person camera, and owns the screens.
import * as THREE from 'three';
import { TUNE } from './tuning.js';
import { Rng } from './rng.js';
import { Input, buildTouchControls } from './keys.js';
import { Sfx } from './sfx.js';
import { Stage } from './stage.js';
import { buildCity, updateTrafficLights, setNightGlow, districtAt, collideBuildings } from './metropolis.js';
import { createCar, drivePlayer, damageCar, setHeadlights, syncCarMesh } from './autos.js';
import { initStreetLife, stepTraffic, stepPeds } from './streetlife.js';
import { createHero, stepHero, hurtHero } from './hero.js';
import { Wanted } from './heat.js';
import { Jobs } from './jobs.js';
import { Interface } from './interface.js';
import { loadSave, writeSave, clearSave } from './preserve.js';
import { applyShot } from './captures.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const shot = params.get('shot');
const rng = new Rng(seed);

// ---------- shared state (the ctx every system reads) ----------
const S = {
  time: 0, hour: TUNE.startHour, cash: TUNE.startCash, totalEarned: 0,
  playSeconds: 0, bestStars: 0, doneJobs: [],
  playerX: 0, playerZ: 0, playerCar: null,
  camYaw: 0, orbitOffset: 0, camPos: { x: 0, y: 8, z: -12 }, aimDir: { x: 0, y: 0, z: 1 },
  alarm: 0, threatX: 0, threatZ: 0, muted: false,
  city: null, life: null, cars: [], allCars: [],
  particles: null, sfx: null, wanted: null, jobs: null, hero: null,
};
S.addHeat = (n, why) => S.wanted.add(n, why);
S.toast = (m) => ui.toast(m);
S.hurtHero = (amount, cause) => hurtHero(S.hero, amount, S, cause);
S.damageCarExternal = (car, dmg) => damageCar(car, dmg, S);
S.setHour = (h) => { S.hour = h; };
S.onEnterCar = () => {};
S.onExitCar = () => {};
S.onCrash = (impact) => { if (impact > 16) S.addHeat(3, 'reckless crash'); };
S.onWasted = (cause) => wasted(cause);
S.onBusted = () => busted();
S.onJobDone = (job, complete) => {
  if (complete) storyComplete();
};
S.onJobFailed = () => {};

// ---------- world ----------
const canvas = document.getElementById('game');
const stage = new Stage(canvas);
window.__stage = stage; // debug probe: renderer.info
S.particles = stage.particles;
const city = buildCity(stage, seed);
S.city = city;
const life = initStreetLife(stage.scene, city, seed);
S.life = life;
const allCars = [...life.traffic, ...life.parked];
S.cars = allCars; S.allCars = allCars;
const hero = createHero(stage.scene);
S.hero = hero;
const wanted = new Wanted(stage.scene, city, allCars);
S.wanted = wanted;
const jobs = new Jobs(stage.scene, city);
S.jobs = jobs;
const ui = new Interface();
const sfx = new Sfx();
S.sfx = sfx;
const input = new Input();
input.attach(canvas);
buildTouchControls(input);

// spawn: hero on foot at the spawn point, a taxi waiting nearby
const spawn = city.places.spawn;
hero.x = spawn.x; hero.z = spawn.z; hero.heading = 0;
const starterTaxi = createCar(stage.scene, 'taxi', spawn.x + 6, spawn.z + 2, 0);
starterTaxi.ai = { parked: true };
allCars.push(starterTaxi);

// ---------- screens / modes ----------
let mode = 'title'; // title | play | pause | end
let endKind = '';
let saveTimer = 0;
let nightOn = false;
const camSmooth = new THREE.Vector3(0, 8, -14);

function showHud(on) { document.getElementById('hud').classList.toggle('hidden', !on); }
function startGame(fromSave) {
  if (fromSave) {
    const sv = loadSave();
    if (sv) {
      S.cash = sv.cash; jobs.doneJobs = [...sv.done]; S.bestStars = sv.bestStars;
      S.playSeconds = sv.playSeconds; S.totalEarned = sv.totalEarned;
      wanted.bestStars = sv.bestStars;
    }
  } else {
    clearSave();
    S.cash = TUNE.startCash; jobs.doneJobs = []; S.bestStars = 0;
    S.playSeconds = 0; S.totalEarned = 0;
  }
  ui.show(null); showHud(true);
  mode = 'play';
  sfx.ensure();
  ui.toast(fromSave ? 'Welcome back to Solmara, Jax.' : 'Mara: "First job is on the board — press Q."');
}
function toTitle() {
  mode = 'title';
  ui.setTitleStats(loadSave());
  ui.show('title'); showHud(false);
  jobs.cancel();
}
function busted() {
  jobs.cancel();
  const fine = Math.round(S.cash * TUNE.bustedFine);
  S.cash -= fine;
  respawnAt(city.places.policeStation, 'BUSTED', `The cops dragged you in. Fine: $${fine}. Mara is not impressed.`);
}
function wasted(cause) {
  jobs.cancel();
  const bill = Math.round(S.cash * 0.1);
  S.cash -= bill;
  respawnAt(city.places.hospital, 'WASTED', `You woke up in Solmara General (${cause}). Hospital bill: $${bill}.`);
}
function respawnAt(place, title, body) {
  if (hero.car) { hero.car.isPlayer = false; hero.car = null; S.playerCar = null; }
  hero.x = place.x; hero.z = place.z; hero.y = 0; hero.vy = 0;
  hero.health = hero.maxHealth; hero.mag = TUNE.magSize;
  wanted.clear();
  mode = 'end'; endKind = 'respawn';
  ui.setEnd(title, body, 'BACK ON THE STREETS');
  showHud(false);
  persist();
}
function storyComplete() {
  mode = 'end'; endKind = 'story';
  ui.setEnd('STORY COMPLETE', `Every job done. Jax Marlowe is Solmara's best wheelman — $${S.totalEarned.toLocaleString()} earned, best wanted ${S.bestStars}★. Free roam continues whenever you like.`, 'KEEP DRIVING');
  showHud(false);
  persist();
}
function persist() {
  writeSave({ cash: S.cash, doneJobs: jobs.doneJobs, bestStars: Math.max(S.bestStars, wanted.bestStars), playSeconds: S.playSeconds, totalEarned: S.totalEarned });
}

document.getElementById('newbtn').addEventListener('click', () => startGame(false));
document.getElementById('continuebtn').addEventListener('click', () => startGame(true));
document.getElementById('resumebtn').addEventListener('click', () => { ui.show(null); mode = 'play'; });
document.getElementById('jobsbtn').addEventListener('click', () => openJobs());
document.getElementById('quitbtn').addEventListener('click', () => toTitle());
document.getElementById('jobsclose').addEventListener('click', () => { ui.show('pause'); });
document.getElementById('endbutton').addEventListener('click', () => {
  ui.show(null); showHud(true);
  mode = 'play';
  if (endKind === 'story') toTitle();
});
document.getElementById('mute').addEventListener('click', () => { sfx.ensure(); S.muted = sfx.toggleMute(); });
addEventListener('pointerdown', () => sfx.ensure(), { once: true });
addEventListener('keydown', () => sfx.ensure(), { once: true });

function openJobs() {
  ui.buildJobsList(jobs, (i) => {
    ui.show(null); mode = 'play';
    jobs.start(i, S);
  });
  ui.show('jobsmenu');
  mode = 'pause';
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const car = hero.car;
  const tx = car ? car.x : hero.x;
  const tz = car ? car.z : hero.z;
  let yaw;
  if (car) {
    S.orbitOffset = THREE.MathUtils.damp(S.orbitOffset, 0, 0.7, dt);
    yaw = car.heading + Math.PI + S.orbitOffset;
  } else yaw = S.camYaw;
  const dist = car ? TUNE.camDist + Math.min(4, Math.abs(car.speed) * 0.08) : 9;
  const height = car ? TUNE.camHeight : 4.4;
  // camera sits behind the facing direction
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const look = new THREE.Vector3(tx - fx * 3, car ? 1.6 : 1.7, tz - fz * 3);
  const want = new THREE.Vector3(tx + fx * dist, height, tz + fz * dist);
  // keep the camera out of buildings: pull it in toward the target and up
  for (let i = 0; i < 3; i++) {
    if (!collideBuildings(city, want.x, want.z, 2)) break;
    want.lerp(look, 0.45);
    want.y += 3.5;
  }
  want.y = Math.max(want.y, 2.2);
  camSmooth.lerp(want, 1 - Math.exp(-7 * dt));
  stage.camera.position.copy(camSmooth);
  camTarget.copy(look);
  stage.camera.lookAt(camTarget);
  // aim data for the pistol (from the camera through the crosshair)
  S.camPos = { x: camSmooth.x, y: camSmooth.y, z: camSmooth.z };
  const d = new THREE.Vector3().subVectors(camTarget, camSmooth).normalize();
  S.aimDir = { x: d.x, y: d.y, z: d.z };
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let frameNo = 0;
let shotWarmup = -1;
let shotReady = false;
window.__dbg = { get warmup() { return shotWarmup; }, get frameNo() { return frameNo; }, get mode() { return mode; }, get input() { return input; } };

if (shot) {
  const W = { hero, jobs, wanted, city, life, stage, scene: stage.scene, allCars, camYaw: S.camYaw, mode: 'title', ctx: S, input };
  shotWarmup = applyShot(shot, W);
  S.camYaw = W.camYaw;
  mode = W.mode;
  if (mode === 'play') { ui.show(null); showHud(true); }
  else { ui.show('title'); showHud(false); }
  // staged shots never need the save prompt
  document.getElementById('title').style.background = 'linear-gradient(180deg, rgba(8,12,20,.45), rgba(8,12,20,.25))';
} else {
  ui.setTitleStats(loadSave());
}

function frame() {
  requestAnimationFrame(frame);
  input.beginFrame();
  const _ft0 = performance.now();
  const dt = Math.min(0.05, clock.getDelta());
  // mouse orbit
  if (input.frameMouseDX !== 0) {
    if (hero.car) S.orbitOffset -= input.frameMouseDX * 0.0032;
    else S.camYaw -= input.frameMouseDX * 0.0035;
  }

  if (mode === 'play') {
    S.time += dt; S.playSeconds += dt;
    S.hour += dt * 24 / TUNE.dayLengthSec;
    stage.setTime(S.hour);
    city.water.position.y = -0.4 + Math.sin(S.time * 0.6) * 0.12;
    const isNight = stage.isNight;
    if (isNight !== nightOn) { nightOn = isNight; setNightGlow(city, isNight); }
    updateTrafficLights(city, dt);
    S.alarm = Math.max(0, S.alarm - dt);

    // hero + driving
    S.playerX = hero.car ? hero.car.x : hero.x;
    S.playerZ = hero.car ? hero.car.z : hero.z;
    stepHero(hero, input, dt, S);
    S.playerCar = hero.car;
    S.playerX = hero.car ? hero.car.x : hero.x;
    S.playerZ = hero.car ? hero.car.z : hero.z;
    if (hero.car) {
      drivePlayer(hero.car, input, dt, S);
      setHeadlights(hero.car, nightOn);
    }
    // world life
    stepTraffic(life, city, dt, {
      playerCar: hero.car, sfx,
    });
    stepPeds(life, dt, {
      playerX: S.playerX, playerZ: S.playerZ,
      threatX: S.threatX, threatZ: S.threatZ, alarm: S.alarm,
      playerCarSpeed: hero.car ? Math.abs(hero.car.speed) : 0,
      city, sfx,
    });
    wanted.update(dt, S);
    S.bestStars = Math.max(S.bestStars, wanted.bestStars);
    jobs.update(dt, S);

    // engine sound follows speed
    const sn = hero.car ? Math.min(1, Math.abs(hero.car.speed) / hero.car.spec.top) : 0;
    sfx.setEngine(sn, !!hero.car);

    // keys
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) { ui.show('pause'); mode = 'pause'; }
    if (input.wasPressed('KeyQ')) openJobs();
    if (input.wasPressed('KeyM')) S.muted = sfx.toggleMute();

    // autosave
    saveTimer += dt;
    if (saveTimer > 12) { saveTimer = 0; persist(); }

    // HUD
    const obj = jobs.objectiveText(S);
    ui.update({
      cash: S.cash, health: hero.health, stars: wanted.stars,
      speed: hero.car ? hero.car.speed : 0, mag: hero.mag, reserve: hero.reserve,
      hour: S.hour, isNight, playerX: S.playerX, playerZ: S.playerZ,
      heading: hero.car ? hero.car.heading : hero.heading,
      objective: obj, inCar: !!hero.car, carHp: hero.car ? hero.car.hp : 0,
      muted: S.muted, traffic: life.traffic, police: wanted.units,
      missionTarget: obj && jobs.active ? jobs._targetPos(jobs.active) : null,
    });
  } else if (mode === 'title' || mode === 'end') {
    // living backdrop: traffic + peds keep moving, camera drifts over the city
    S.time += dt;
    S.hour += dt * 24 / TUNE.dayLengthSec;
    stage.setTime(S.hour);
    updateTrafficLights(city, dt);
    stepTraffic(life, city, dt, { playerCar: null, sfx });
    stepPeds(life, dt, { playerX: 9999, playerZ: 9999, threatX: 9999, threatZ: 9999, alarm: 0, playerCarSpeed: 0, city, sfx });
    const a = S.time * 0.05;
    const cx = Math.cos(a) * 90, cz = Math.sin(a) * 90;
    camSmooth.lerp(new THREE.Vector3(cx, 55, cz), 1 - Math.exp(-2 * dt));
    stage.camera.position.copy(camSmooth);
    stage.camera.lookAt(0, 6, 40);
    sfx.setEngine(0, false);
  }
  // pause: frozen frame, still rendered

  stage.particles.update(dt);
  if (mode === 'play') updateCamera(dt);
  stage.followShadow(S.playerX, S.playerZ);
  // shadows refresh every 5th frame — the city is mostly static
  frameNo++;
  if (frameNo % 5 === 0) stage.renderer.shadowMap.needsUpdate = true;
  const _ft1 = performance.now();
  stage.render();
  const _ft2 = performance.now();
  (window.__dbg.times = window.__dbg.times || []).push(Math.round(_ft2 - _ft1));
  if (window.__dbg.times.length > 40) window.__dbg.times.shift();
  window.__dbg.updateMs = window.__dbg.updateMs == null ? _ft1 - _ft0 : window.__dbg.updateMs * 0.9 + (_ft1 - _ft0) * 0.1;
  window.__dbg.renderMs = window.__dbg.renderMs == null ? _ft2 - _ft1 : window.__dbg.renderMs * 0.9 + (_ft2 - _ft1) * 0.1;

  if (shotWarmup > 0) {
    shotWarmup--;
    if (shotWarmup === 0 && !shotReady) {
      shotReady = true;
      window.__shotReady = true;
    }
  }
}
frame();
