// The story: five jobs from fixer Mara Voss, each with a marker, a timer
// and a fail state. Completing a job pays cash and unlocks the next; failing
// one just costs the attempt — Mara always lets you try again. The Big One
// ends the story. Mission state lives on G.mission so the HUD, the minimap
// and the screenshots all read the same truth.
import { MISSIONS } from './config.js';
import { makeCar } from './vehicles.js';
import { addHeat } from './player.js';

function setMarkerOn(G, x, z) {
  G.mission.marker = { x, z };
  if (G.beacon) {
    G.beacon.position.set(x, 7, z);
    G.beacon.visible = true;
    G.markerMesh.position.set(x, 0.15, z);
    G.markerMesh.visible = true;
  }
}

function clearMarkerOn(G) {
  G.mission.marker = null;
  if (G.beacon) {
    G.beacon.visible = false;
    G.markerMesh.visible = false;
  }
}

function distTo(G, x, z) {
  return Math.hypot(G.player.x - x, G.player.z - z);
}

// Landmark buildings are big: the player reaches their edge, not their
// centre, so a building marker counts as reached from 18 m out.
const LANDMARK_RADIUS = 20;

function finish(G, ok) {
  const m = G.mission;
  const def = m.def;
  clearMarkerOn(G);
  m.active = false;
  m.marker = null;
  m.objective = '';
  m.timeLeft = 0;
  if (ok) {
    G.cash += def.reward;
    if (!m.doneIds.includes(def.id)) {
      m.doneIds.push(def.id);
      m.doneCount = m.doneIds.length;
    }
    if (G.audio) G.audio.jingle();
    if (G.hud) G.hud.toast(`${def.name} complete — Mara paid $${def.reward}`);
    if (def.id === 5 && G.onStoryComplete) G.onStoryComplete();
    else if (G.onMissionEnd) G.onMissionEnd(true, def);
  } else {
    if (G.audio) G.audio.fail();
    if (G.onMissionEnd) G.onMissionEnd(false, def);
  }
}

export function startMission(G, id) {
  const def = MISSIONS.find((m) => m.id === id);
  if (!def) return false;
  if (G.mission.doneIds.includes(id)) return false;
  if (G.mission.active) return false;
  const m = G.mission;
  m.active = true;
  m.def = def;
  m.id = id;
  m.stage = 0;
  m.timeLeft = def.time;
  m.hiddenDone = false;
  const L = G.city.landmarks;
  if (id === 1) {
    m.objective = 'Drive to the Solmara Grand hotel';
    setMarkerOn(G, L.hotel.x, L.hotel.z);
  } else if (id === 2) {
    m.objective = 'Steal the red sportscar at the marina';
    setMarkerOn(G, L.marina.x, L.marina.z);
    // The prize: a red sportscar parked in the marina lot, clear of the
    // marina building itself so the player can actually reach its door.
    const car = makeCar(G.THREE, G.renderer.scene, L.marina.x + 18, L.marina.z, Math.PI / 2, 0xd8433c, 'sport');
    car.parked = true;
    car.missionCar = true;
    G.cars.push(car);
    m.targetCar = car;
  } else if (id === 3) {
    m.objective = 'Lose the cops — stay out of sight for 10 seconds';
    addHeat(G, 35, 'the job went loud');
    if (G.hud) G.hud.toast('Mara: the cops are on you. Break line of sight and hide!');
  } else if (id === 4) {
    m.objective = 'Checkpoint 1 of 3 — the north plaza';
    m.checkpoints = [
      { x: -182, z: -182, label: 'the north plaza' },
      { x: 182, z: 26, label: 'the east docks road' },
      { x: -26, z: 182, label: 'the gun shop corner' },
    ];
    m.checkpointIndex = 0;
    setMarkerOn(G, m.checkpoints[0].x, m.checkpoints[0].z);
  } else if (id === 5) {
    m.objective = 'Get to Meridian Bank and grab the cash';
    setMarkerOn(G, L.bank.x, L.bank.z);
  }
  if (G.hud) G.hud.toast(`New job from Mara: ${def.name}`);
  return true;
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m.active || !m.def) return;
  m.timeLeft -= dt;
  if (m.timeLeft <= 0) {
    finish(G, false);
    return;
  }
  const L = G.city.landmarks;
  if (m.def.id === 1) {
    if (G.player.inCar && distTo(G, L.hotel.x, L.hotel.z) < LANDMARK_RADIUS) finish(G, true);
  } else if (m.def.id === 2) {
    if (m.stage === 0) {
      if (G.player.inCar && G.player.car === m.targetCar) {
        m.stage = 1;
        m.objective = 'Deliver the sportscar to Mara\'s garage';
        setMarkerOn(G, L.garage.x, L.garage.z);
        if (G.hud) G.hud.toast('Got it. Now get it to Mara\'s garage — fast, before the heat finds you.');
      }
    } else if (distTo(G, L.garage.x, L.garage.z) < LANDMARK_RADIUS) {
      finish(G, true);
    }
  } else if (m.def.id === 3) {
    if (G.wanted.stars === 0 && G.wanted.hiddenTime >= 10) finish(G, true);
  } else if (m.def.id === 4) {
    const cp = m.checkpoints[m.checkpointIndex];
    if (cp && distTo(G, cp.x, cp.z) < 8) {
      m.checkpointIndex += 1;
      if (G.audio) G.audio.pickup();
      if (m.checkpointIndex >= m.checkpoints.length) {
        finish(G, true);
      } else {
        const next = m.checkpoints[m.checkpointIndex];
        m.objective = `Checkpoint ${m.checkpointIndex + 1} of 3 — ${next.label}`;
        setMarkerOn(G, next.x, next.z);
      }
    }
  } else if (m.def.id === 5) {
    if (m.stage === 0) {
      if (distTo(G, L.bank.x, L.bank.z) < LANDMARK_RADIUS) {
        m.stage = 1;
        m.objective = 'Cash grabbed! Escape the 4-star chase — reach the boat at the pier';
        setMarkerOn(G, L.pier.x, L.pier.z);
        addHeat(G, 75, 'the bank alarm');
        if (G.hud) G.hud.toast('You grabbed the cash. Four stars — run for the pier!');
      }
    } else if (distTo(G, L.pier.x, L.pier.z) < 9) {
      finish(G, true);
    }
  }
}

export function missionListState(G) {
  return MISSIONS.map((def) => ({
    ...def,
    done: G.mission.doneIds.includes(def.id),
    active: G.mission.active && G.mission.def && G.mission.def.id === def.id,
  }));
}
