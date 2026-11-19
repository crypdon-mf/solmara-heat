// app.js — boot and game loop for Solmara Heat.
// Owns the screen state machine (title / playing / paused / busted /
// wasted / story), the enter/exit car flow, combat resolution, pickups
// and the save timer. Everything else lives in its own module.

import * as THREE from 'three';
import { TUNE, RIDES } from './tune.js';
import { makeRng, pick, spread } from './seed.js';
import { buildCity } from './city.js';
import { makeStage } from './scene.js';
import { makeCar, rideSpec } from './rides.js';
import { makeTraffic } from './traffic.js';
import { makeWalkers } from './walkers.js';
import { makeAvatar } from './avatar.js';
import { makeCops } from './cops.js';
import { makeContracts } from './contracts.js';
import { makeControls } from './controls.js';
import { makeSound } from './sound.js';
import { makeDisplay } from './display.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot } from './frames.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);

const container = document.getElementById('game');
const city = buildCity(SEED);
const stage = makeStage(container, city);
const controls = makeControls(stage.renderer.domElement);
const sound = makeSound();
const display = makeDisplay(controls);
const traffic = makeTraffic(city, SEED);
const walkers = makeWalkers(city, SEED);
const player = makeAvatar(city);
const cops = makeCops(city, SEED);
const contracts = makeContracts(city, SEED);

// --- world state (single object the HUD, missions and police read) ---
const world = {
  cash: 0, done: [], bestStars: 0, playtime: 0, muted: false,
  player, playerCar: null, parked: [],
  cops, city, traffic, walkers, sound, contracts,
  copsUnseen: 0,
  hour: TUNE.startHour,
  screen: 'title',
  paused: false,
  setHour(h) { world.hour = h; },
  onJobDone: null,
  onJobFailed: null,
  onStoryComplete: null,
};

const saved = loadSave();
if (saved) {
  world.cash = saved.cash;
  world.done = saved.done;
  world.bestStars = saved.bestStars;
  world.playtime = saved.playtime;
  world.muted = saved.muted;
  sound.setMuted(saved.muted);
  display.setMuted(saved.muted);
}
contracts.done = world.done;

// --- parked cars around the city (stealable) ---
function spawnParked() {
  const rng = makeRng(SEED + 505);
  const spots = [];
  for (const line of city.roadLines) {
    for (let d = -160; d <= 160; d += 40) {
      spots.push({ x: line + 5.6, z: d, heading: 0 });
      spots.push({ x: d, z: line + 5.6, heading: Math.PI / 2 });
    }
  }
  const chosen = [];
  const shuffledSpots = spots.slice().sort(() => rng() - 0.5);
  const specs = RIDES.filter((r) => r.id !== 'cop');
  for (let i = 0; i < 12 && i < shuffledSpots.length; i++) {
    const s = shuffledSpots[i];
    const car = makeCar(specs[i % specs.length], s.x, s.z, s.heading);
    city.group.add(car.mesh);
    world.parked.push(car);
    chosen.push(car);
  }
  // The taxi for First Fare waits at the Marina rank.
  const taxi = makeCar(rideSpec('taxi'), -168, 14, 0);
  city.group.add(taxi.mesh);
  world.parked.push(taxi);
  return chosen;
}
spawnParked();

// --- ammo pickups at the gun shop + two street stashes ---
const pickups = [];
function spawnPickups() {
  const spots = [[-46, -46], [92, 92], [-138, 138]];
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x37b24d })
    );
    m.position.set(x, 0.8, z);
    city.group.add(m);
    pickups.push({ mesh: m, x, z, taken: false, respawn: 0 });
  }
}
spawnPickups();

// --- screens ---
function toTitle() {
  world.screen = 'title';
  world.playerCar = null;
  player.reset(-170, 20, Math.PI / 2);
  player.group.visible = true;
  cops.clear();
  display.setTitle(loadSave());
  display.showOnly('title');
  stage.setCamYaw(Math.PI * 0.75);
}
function startGame(fresh) {
  if (fresh) {
    world.cash = 0; world.done = []; contracts.done = [];
    world.bestStars = 0; world.playtime = 0;
    clearSave();
  }
  world.screen = 'playing';
  player.reset(-170, 20, Math.PI / 2);
  player.group.visible = true;
  cops.clear();
  display.showOnly(null);
  display.banner(fresh ? 'Welcome to Solmara, Jax. Mara has work — open the job list.' : 'Back on the streets, Jax.');
  sound.unlock();
}

display.onNew(() => startGame(true));
display.onContinue(() => startGame(false));
display.onResume(() => { world.paused = false; world.screen = 'playing'; display.showOnly(null); });
display.onQuitToTitle(() => { world.paused = false; toTitle(); });
display.onRetry(() => startGame(false));
display.onPlayAgain(() => startGame(true));
display.onJobClick((id) => {
  if (world.screen !== 'playing') startGame(false);
  display.showOnly(null);
  if (contracts.start(world, id)) {
    display.banner(`Job started: ${contracts.JOBS.find((j) => j.id === id).name}`);
  } else {
    display.banner('That job is already done or running.');
  }
});
display.onJobsBack(() => {
  if (world.screen === 'playing') { world.paused = false; display.showOnly(null); }
  else toTitle();
});
display.onShowJobs(() => {
  display.renderJobs(contracts.JOBS, world.done);
  display.showOnly('jobs');
});
world.onJobDone = (job) => {
  display.banner(`${job.name} complete — $${job.payout} in your pocket`, 4200);
  if (contracts.storyDone) {
    world.screen = 'story';
    display.setStoryStats(world.cash, world.playtime, world.bestStars);
    display.showOnly('story');
  }
};
world.onJobFailed = (job, msg) => display.banner(msg || `${job.name} failed`, 4200);
world.onStoryComplete = () => {
  world.screen = 'story';
  display.setStoryStats(world.cash, world.playtime, world.bestStars);
  display.showOnly('story');
};

// --- enter / exit car ---
function nearestCar(x, z, maxD = 4.2) {
  let best = null, bd = maxD;
  for (const car of [...world.parked, ...traffic.cars]) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function enterCar(car, stolen) {
  world.playerCar = car;
  player.group.visible = false;
  stage.setCamYaw(car.heading + Math.PI);
  if (stolen) {
    cops.addCrime('carjack');
    display.banner('Carjacked! The PD saw that.', 2600);
  }
  sound.engine(0, false);
}
function exitCar() {
  const car = world.playerCar;
  if (!car) return;
  world.playerCar = null;
  player.x = car.x - Math.sin(car.heading) * 3.2;
  player.z = car.z - Math.cos(car.heading) * 3.2;
  player.heading = car.heading;
  player.group.visible = true;
  player.group.position.set(player.x, 0, player.z);
}

// --- combat resolution ---
function punchTarget() {
  if (!player.tryPunch()) return;
  sound.punch();
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  // Pedestrian in front?
  const ped = walkers.nearest(player.x + fx * 1.4, player.z + fz * 1.4, 2.2);
  if (ped) {
    walkers.scare(player.x, player.z, 30);
    cops.addCrime('punch');
    display.banner('You hit a pedestrian. Someone called the cops.', 2200);
    return;
  }
  const officer = cops.officers.find((o) => Math.hypot(o.x - player.x, o.z - player.z) < 2.4);
  if (officer) {
    cops.addCrime('punch');
    display.banner('You punched a cop. Bad idea, Jax.', 2200);
  }
}
function shootTarget() {
  const res = player.tryShoot();
  if (res === 'empty') {
    if (player.ammo === 0) display.banner('Out of ammo — find a green stash or reload (R).', 2200);
    return;
  }
  sound.shot();
  walkers.scare(player.x, player.z, 34);
  cops.addCrime('shoot');
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  // Hit test: nearest person within a forward cone, 40 m.
  let best = null, bd = 40;
  const consider = (x, z, kind, ref) => {
    const dx = x - player.x, dz = z - player.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < bd && side < 1.6) { bd = along; best = { kind, ref }; }
  };
  for (const p of walkers.people) consider(p.x, p.z, 'ped', p);
  for (const o of cops.officers) consider(o.x, o.z, 'cop', o);
  if (best) {
    stage.puff(best.ref.x, 1.4, best.ref.z, 0xc22424, 8, 2.5);
    if (best.kind === 'ped') {
      cops.addCrime('kill');
      // The pedestrian drops and flees far away (despawn by teleport).
      best.ref.x = 9999; best.ref.z = 9999;
      best.ref.group.position.set(9999, 0, 9999);
    } else {
      cops.addCrime('kill');
      city.group.remove(best.ref.mesh);
      cops.officers.splice(cops.officers.indexOf(best.ref), 1);
    }
  }
}

// --- busted / wasted ---
function busted() {
  const loss = Math.floor(world.cash * TUNE.bustedCashLoss);
  world.cash -= loss;
  cops.clear();
  exitCar();
  player.reset(0, 0, 0); // police station, Downtown
  player.health = TUNE.maxHealth;
  world.screen = 'busted';
  display.showOnly('busted');
  document.getElementById('busted-text').textContent = `The PD caught you. They took $${loss} and dropped you at the station.`;
  sound.fail();
}
function wasted() {
  cops.clear();
  exitCar();
  player.reset(-46, -46, 0); // hospital, Old Town edge
  player.health = TUNE.maxHealth;
  world.screen = 'wasted';
  display.showOnly('wasted');
  document.getElementById('wasted-text').textContent = 'You woke up in St. Mara Hospital. The bill is already paid — somehow.';
  sound.fail();
}

// --- main loop ---
let last = performance.now();
let saveClock = 0;
let smokeClock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const input = controls.snap();
  const clock = now / 1000;

  // Global keys, whatever the screen.
  if (input.just.has('mute')) {
    world.muted = !world.muted;
    sound.setMuted(world.muted);
    display.setMuted(world.muted);
  }
  if (input.just.has('jobs') && (world.screen === 'playing' || world.screen === 'title')) {
    if (world.screen === 'playing') world.paused = true;
    display.renderJobs(contracts.JOBS, world.done);
    display.showOnly('jobs');
  }
  if (input.just.has('pause') && world.screen === 'playing') {
    world.paused = true;
    world.screen = 'paused';
    display.showOnly('pause');
  } else if (input.just.has('pause') && world.screen === 'paused') {
    world.paused = false;
    world.screen = 'playing';
    display.showOnly(null);
  }

  // The world keeps turning behind the title screen.
  world.hour = (world.hour + dt / TUNE.dayLength * 24) % 24;
  const { night } = stage.updateSky(world.hour, clock);
  stage.followSun(world.playerCar || player);

  if (world.screen === 'playing' && !world.paused) {
    world.playtime += dt;
    // --- driving or on foot ---
    if (world.playerCar) {
      const car = world.playerCar;
      car.drive(input, dt, city.colliders, [...traffic.cars, ...world.parked, ...cops.cruisers],
        (impact) => {
          sound.crash(impact > 12);
          stage.puff(car.x, 1, car.z, 0x999999, 8, 3);
          walkers.scare(car.x, car.z, 22);
          if (car.condition <= 0) {
            display.banner('The car is wrecked — get out and find another.', 3000);
            exitCar();
          }
        });
      sound.engine(Math.min(1, Math.abs(car.speed) / (car.spec.topKmh / 3.6)), false);
      if (input.just.has('enter')) exitCar();
      if (input.just.has('brake') && Math.abs(car.speed) > 8) {
        stage.puff(car.x, 0.3, car.z, 0x555555, 3, 1.5);
      }
    } else {
      player.update(input, dt, stage.camYaw, city.colliders, (what) => {
        if (what === 'jump') sound.jump();
      });
      sound.engine(0, true);
      if (input.just.has('enter')) {
        const car = nearestCar(player.x, player.z);
        if (car) {
          const stolen = traffic.cars.includes(car);
          if (stolen) {
            traffic.remove(car);
            world.parked.push(car);
          }
          enterCar(car, stolen);
        }
      }
      if (input.just.has('punch')) punchTarget();
      if (input.fire && !input.just.has('enter')) shootTarget();
      if (input.just.has('reload') && player.tryReload()) sound.reload();
      // Ammo pickups.
      for (const pk of pickups) {
        if (pk.taken) {
          pk.respawn -= dt;
          if (pk.respawn <= 0) { pk.taken = false; pk.mesh.visible = true; }
          continue;
        }
        pk.mesh.rotation.y += dt * 1.5;
        pk.mesh.position.y = 0.8 + Math.sin(clock * 2) * 0.15;
        if (Math.hypot(player.x - pk.x, player.z - pk.z) < 2) {
          pk.taken = true; pk.mesh.visible = false; pk.respawn = 45;
          player.reserve += 24;
          sound.chime();
          display.banner('Ammo stash: +24 rounds', 2000);
        }
      }
    }

    // --- traffic, pedestrians, police, jobs ---
    traffic.update(dt, clock, city.colliders, world.playerCar);
    walkers.update(dt);
    const copInfo = cops.update(dt, player, world.playerCar, city.colliders, {
      onRam: (cruiser) => {
        sound.crash(true);
        stage.puff(cruiser.x, 1, cruiser.z, 0x999999, 6, 2.5);
        if (world.playerCar) {
          world.playerCar.speed *= 0.55;
          world.playerCar.vx *= 0.55;
          world.playerCar.vz *= 0.55;
        }
      },
      onOfficerPunch: (dmg) => {
        player.health -= dmg;
        sound.punch();
        if (player.health <= 0) busted();
      },
      onStarDrop: (s) => display.banner(s === 0 ? 'You lost them. Heat is off.' : `Heat dropping — ${s} star${s === 1 ? '' : 's'} left`, 2200),
    });
    world.copsUnseen = copInfo.unseenFor;
    if (cops.stars > world.bestStars) world.bestStars = cops.stars;
    contracts.update(dt, world);
    sound.siren(cops.stars > 0);

    // Headlight beams at night.
    const beams = night;
    for (const car of [...world.parked, ...traffic.cars, ...cops.cruisers, ...(world.playerCar ? [world.playerCar] : [])]) {
      for (const child of car.mesh.children) {
        if (child.name === 'beam') child.visible = beams;
      }
    }
    // Smoke from wrecked cars.
    smokeClock -= dt;
    if (smokeClock <= 0) {
      smokeClock = 0.25;
      for (const car of [...world.parked, ...traffic.cars]) {
        if (car.smoking) stage.puff(car.x, 1.2, car.z, 0x333333, 2, 1);
      }
    }

    // --- busted: boxed in while wanted ---
    if (cops.stars > 0 && world.playerCar) {
      const boxed = cops.cruisers.some((c) => Math.hypot(c.x - world.playerCar.x, c.z - world.playerCar.z) < 4.5)
        && Math.abs(world.playerCar.speed) < 1.5;
      if (boxed) busted();
    }
    if (player.health <= 0 && world.screen === 'playing') wasted();

    // --- HUD ---
    display.update({
      cash: world.cash, health: player.health, stars: cops.stars,
      speedKmh: world.playerCar ? world.playerCar.kmh() : 0,
      inCar: !!world.playerCar,
      objective: contracts.active ? contracts.objective : '',
      timer: contracts.timer || 0,
      ammo: player.ammo, reserve: player.reserve, reloading: player.reloading > 0,
      minimap: {
        city, cops,
        marker: contracts.active ? contracts.markerPos : null,
        playerX: world.playerCar ? world.playerCar.x : player.x,
        playerZ: world.playerCar ? world.playerCar.z : player.z,
        playerHeading: world.playerCar ? world.playerCar.heading : player.heading,
      },
    });

    // --- autosave every 15 s ---
    saveClock += dt;
    if (saveClock > 15) {
      saveClock = 0;
      writeSave(world);
    }
  } else if (world.screen === 'title') {
    // Slow cinematic orbit over Downtown behind the title.
    stage.setCamYaw(stage.camYaw + dt * 0.05);
    traffic.update(dt, clock, city.colliders, null);
    walkers.update(dt);
  }

  // Camera follows the player (or the car) unless the title orbit rules.
  const focus = world.screen === 'title'
    ? { x: 0, z: 0, y: 0 }
    : (world.playerCar || player);
  stage.updateCamera(dt, focus, input, city.colliders);
  stage.updateParticles(dt);
  stage.render();
  // In shot mode the capture script waits on this flag.
  if (SHOT) {
    window.__shotFrames = (window.__shotFrames || 0) + 1;
    if (window.__shotFrames >= 2) window.__shotReady = true;
  }
}

// Shot staging (headless screenshots) runs before the first frame.
if (SHOT) stageShot(world, stage, { shot: SHOT, seed: SEED, display, contracts, cops, player, traffic });

toTitle();
window.addEventListener('resize', () => stage.resize());
window.__solmara = { world, stage, player, cops, contracts, traffic, city };
requestAnimationFrame(frame);
