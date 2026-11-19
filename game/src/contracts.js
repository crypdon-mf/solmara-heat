// contracts.js — the eight story jobs Mara Voss phones in.
// Each job is a small state machine: start() sets the scene, update()
// watches the objective, and finish()/fail() settle the payout.
// The 3D beacon (a glowing column + a pulsing ground ring) marks the
// current objective; the HUD reads job.objective and job.distance.

import * as THREE from 'three';
import { TUNE, RIDES } from './tune.js';
import { makeRng, spread } from './seed.js';
import { makeCar, rideSpec } from './rides.js';

function beaconMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

export function makeContracts(city, seed) {
  const rng = makeRng(seed + 404);
  const group = new THREE.Group();
  city.group.add(group);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    beaconMaterial(0xffd23f)
  );
  column.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.6, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(column, ring);
  group.visible = false;

  const JOBS = [
    { id: 'fare',     name: 'First Fare',     payout: 150,  brief: 'A fare is waiting at the Marina taxi rank. Drive them to the Grand Solmara hotel — smooth and quick.' },
    { id: 'wheels',   name: 'Hot Wheels',     payout: 400,  brief: 'A red Vela GT is parked at the marina lot. Take it — quietly — and bring it to Mara\u2019s garage in the Market.' },
    { id: 'getaway',  name: 'Getaway',        payout: 300,  brief: 'The PD is on you. Two stars. Break line of sight and stay hidden until the heat drops.' },
    { id: 'courier',  name: 'Courier Run',    payout: 350,  brief: 'Three drops across the city, one clock. Hit every checkpoint before the timer runs out.' },
    { id: 'silent',   name: 'Silent Pickup',  payout: 450,  brief: 'A package waits in Old Town. Pick it up and deliver it without earning a single star. No noise, no witnesses.' },
    { id: 'tail',     name: 'Tail Chase',     payout: 500,  brief: 'A courier is leaving the Docks. Follow him for 20 seconds — close enough to watch, far enough that he never notices.' },
    { id: 'night',    name: 'Night Delivery', payout: 550,  brief: 'A delivery after dark, across town, on a tight clock. Mara pays double for the night shift.' },
    { id: 'bigone',   name: 'The Big One',    payout: 1500, brief: 'The bank job. Grab the cash, then lose a four-star chase and reach the boat at the pier. This is the one, Jax.' },
  ];

  const state = {
    jobs: JOBS,
    active: null,      // active job object
    done: [],          // finished job ids
    markerPos: null,   // {x, z} of the beacon, or null
    objective: '',
    distance: 0,
    timer: 0,
    phase: 'idle',     // idle | active | done | failed
    tailCar: null,
    tailTime: 0,
    checkpoints: [],
    checkpointIndex: 0,
    cashSpawned: false,
  };

  // Fixed story places (metres).
  const PLACES = {
    taxiRank: { x: -168, z: 8 },
    hotel: { x: 23, z: -23 },
    marinaLot: { x: -176, z: 46 },
    garage: { x: 138, z: 23 },
    oldTownPickup: { x: -23, z: -138 },
    oldTownDrop: { x: 92, z: -92 },
    docks: { x: 23, z: 138 },
    bank: { x: 46, z: 46 },
    pier: { x: -222, z: 120 },
    nightDrop: { x: 184, z: -138 },
  };

  function setMarker(x, z, color = 0xffd23f) {
    group.visible = true;
    group.position.set(x, 0, z);
    state.markerPos = { x, z };
    column.material.color.set(color);
    ring.material.color.set(color);
  }
  function hideMarker() { group.visible = false; state.markerPos = null; }

  function posOf(w) {
    return w.playerCar ? { x: w.playerCar.x, z: w.playerCar.z } : { x: w.player.x, z: w.player.z };
  }
  function distTo(w, p) {
    const q = posOf(w);
    return Math.hypot(q.x - p.x, q.z - p.z);
  }

  function finish(w, msg) {
    const job = state.active;
    state.done.push(job.id);
    state.phase = 'done';
    hideMarker();
    w.cash += job.payout;
    w.sound.jingle();
    state.objective = msg || `${job.name} complete — $${job.payout}`;
    state.active = null;
    state.tailCar = null;
    w.onJobDone?.(job);
  }

  function fail(w, msg) {
    const job = state.active;
    state.phase = 'failed';
    hideMarker();
    w.sound.fail();
    state.objective = msg || `${job.name} failed`;
    state.active = null;
    if (state.tailCar) { w.city.group.remove(state.tailCar.mesh); state.tailCar = null; }
    w.onJobFailed?.(job, msg);
  }

  function start(w, jobId) {
    const job = JOBS.find((j) => j.id === jobId);
    if (!job || state.done.includes(jobId) || state.active) return false;
    state.active = job;
    state.phase = 'active';
    state.timer = 0;
    state.checkpointIndex = 0;
    state.cashSpawned = false;
    const p = w.player;
    switch (jobId) {
      case 'fare':
        state.objective = 'Get in the taxi at the Marina rank';
        setMarker(PLACES.taxiRank.x, PLACES.taxiRank.z);
        state.stage = 'toTaxi';
        break;
      case 'wheels':
        state.objective = 'Steal the red Vela GT at the marina lot';
        setMarker(PLACES.marinaLot.x, PLACES.marinaLot.z, 0xff4444);
        state.stage = 'steal';
        // Park the target sportscar at the lot.
        state.targetCar = makeCar(rideSpec('coupe'), PLACES.marinaLot.x, PLACES.marinaLot.z, Math.PI / 2);
        w.city.group.add(state.targetCar.mesh);
        w.parked.push(state.targetCar);
        break;
      case 'getaway':
        w.cops.setStars(2);
        state.objective = 'Lose the cops — break line of sight and hide';
        state.stage = 'hide';
        break;
      case 'courier':
        state.checkpoints = [
          { x: -92, z: -92 }, { x: 138, z: -46 }, { x: 92, z: 138 },
        ];
        state.timer = 150;
        state.objective = 'Checkpoint 1 of 3';
        setMarker(state.checkpoints[0].x, state.checkpoints[0].z);
        state.stage = 'run';
        break;
      case 'silent':
        state.objective = 'Pick up the package in Old Town — no stars';
        setMarker(PLACES.oldTownPickup.x, PLACES.oldTownPickup.z, 0x7dff8a);
        state.stage = 'pickup';
        break;
      case 'tail':
        state.tailCar = makeCar(rideSpec('sedan'), PLACES.docks.x, PLACES.docks.z, 0);
        state.tailCar.cruise = 0.9;
        w.city.group.add(state.tailCar.mesh);
        w.traffic.cars.push(state.tailCar);
        state.tailTime = 0;
        state.objective = 'Follow the courier — stay 12–30 m back';
        setMarker(PLACES.docks.x, PLACES.docks.z, 0x7db8ff);
        state.stage = 'follow';
        break;
      case 'night':
        w.setHour?.(21.5);
        state.timer = 120;
        state.objective = 'Deliver across town before the clock runs out';
        setMarker(PLACES.nightDrop.x, PLACES.nightDrop.z);
        state.stage = 'run';
        break;
      case 'bigone':
        state.objective = 'Get to the bank and grab the cash';
        setMarker(PLACES.bank.x, PLACES.bank.z, 0xff4444);
        state.stage = 'toBank';
        break;
    }
    w.sound.chime();
    return true;
  }

  function update(dt, w) {
    // Beacon pulse.
    if (group.visible) {
      const t = performance.now() / 1000;
      column.material.opacity = 0.32 + Math.sin(t * 3) * 0.12;
      const s = 1 + Math.sin(t * 3) * 0.08;
      ring.scale.set(s, s, 1);
    }
    if (!state.active) return;
    const job = state.active;
    const p = posOf(w);
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) { fail(w, `${job.name} failed — time ran out`); return; }
    }
    switch (job.id) {
      case 'fare': {
        if (state.stage === 'toTaxi') {
          state.distance = distTo(w, PLACES.taxiRank);
          const taxi = w.parked.find((c) => c.spec.id === 'taxi');
          if (w.playerCar && w.playerCar.spec.id === 'taxi') {
            state.stage = 'toHotel';
            state.objective = 'Drive the fare to the Grand Solmara hotel';
            setMarker(PLACES.hotel.x, PLACES.hotel.z);
          } else if (!taxi) {
            // Taxi was taken by someone else / gone: fail softly.
            fail(w, 'The taxi is gone — the fare walked away');
          }
        } else {
          state.distance = distTo(w, PLACES.hotel);
          if (state.distance < TUNE.checkpointRadius) finish(w, 'First Fare complete — the fare tipped well');
        }
        break;
      }
      case 'wheels': {
        if (state.stage === 'steal') {
          state.distance = distTo(w, PLACES.marinaLot);
          if (w.playerCar && w.playerCar.spec.id === 'coupe') {
            state.stage = 'deliver';
            state.objective = 'Deliver the Vela GT to Mara\u2019s garage';
            setMarker(PLACES.garage.x, PLACES.garage.z);
          }
        } else {
          state.distance = distTo(w, PLACES.garage);
          if (state.distance < TUNE.checkpointRadius) finish(w, 'Hot Wheels complete — Mara loves the GT');
        }
        break;
      }
      case 'getaway': {
        state.distance = 0;
        state.objective = `Stay hidden — ${Math.max(0, Math.ceil(TUNE.hideTime - w.copsUnseen))}s`;
        if (w.cops.stars === 0) finish(w, 'Getaway complete — clean');
        break;
      }
      case 'courier': {
        const cp = state.checkpoints[state.checkpointIndex];
        state.distance = distTo(w, cp);
        state.objective = `Checkpoint ${state.checkpointIndex + 1} of 3 — ${Math.ceil(state.timer)}s`;
        if (state.distance < TUNE.checkpointRadius) {
          state.checkpointIndex += 1;
          w.sound.chime();
          if (state.checkpointIndex >= state.checkpoints.length) {
            finish(w, 'Courier Run complete — every drop on time');
          } else {
            const next = state.checkpoints[state.checkpointIndex];
            setMarker(next.x, next.z);
          }
        }
        break;
      }
      case 'silent': {
        if (w.cops.stars > 0) { fail(w, 'Silent Pickup failed — the PD saw you'); return; }
        if (state.stage === 'pickup') {
          state.distance = distTo(w, PLACES.oldTownPickup);
          if (state.distance < 4) {
            state.stage = 'deliver';
            state.objective = 'Deliver the package — still no stars';
            setMarker(PLACES.oldTownDrop.x, PLACES.oldTownDrop.z, 0x7dff8a);
          }
        } else {
          state.distance = distTo(w, PLACES.oldTownDrop);
          if (state.distance < TUNE.checkpointRadius) finish(w, 'Silent Pickup complete — nobody saw a thing');
        }
        break;
      }
      case 'tail': {
        const t = state.tailCar;
        if (!t) { fail(w, 'Tail Chase failed — the courier is gone'); return; }
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        state.distance = d;
        setMarker(t.x, t.z, 0x7db8ff);
        if (d > 55) { fail(w, 'Tail Chase failed — you lost him'); return; }
        if (d < 12) { fail(w, 'Tail Chase failed — he spotted you'); return; }
        state.tailTime += dt;
        state.objective = `Stay in the band — ${Math.ceil(20 - state.tailTime)}s`;
        if (state.tailTime >= 20) {
          w.traffic.remove(t);
          state.tailCar = null;
          finish(w, 'Tail Chase complete — you know his route now');
        }
        break;
      }
      case 'night': {
        state.distance = distTo(w, PLACES.nightDrop);
        state.objective = `Night Delivery — ${Math.ceil(state.timer)}s left`;
        if (state.distance < TUNE.checkpointRadius) finish(w, 'Night Delivery complete — Mara pays double');
        break;
      }
      case 'bigone': {
        if (state.stage === 'toBank') {
          state.distance = distTo(w, PLACES.bank);
          if (state.distance < 8) {
            state.stage = 'escape';
            w.cops.setStars(4);
            state.objective = 'Cash grabbed! Lose the 4-star chase — reach the pier boat';
            setMarker(PLACES.pier.x, PLACES.pier.z, 0xff4444);
            w.sound.jingle();
          }
        } else {
          state.distance = distTo(w, PLACES.pier);
          if (w.cops.stars === 0 && state.distance < 10) {
            finish(w, 'THE BIG ONE complete — Solmara is yours, Jax');
            w.onStoryComplete?.();
          } else if (w.cops.stars === 0) {
            state.objective = 'Heat is off — get to the pier boat';
          }
        }
        break;
      }
    }
  }

  return {
    ...state,
    JOBS,
    PLACES,
    start, update,
    get storyDone() { return state.done.length >= JOBS.length; },
  };
}
