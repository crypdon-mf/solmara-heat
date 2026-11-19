// traffic.js — AI traffic for Solmara Heat.
// Cars cruise the road grid lane-by-lane, slow for the car ahead, and
// stop at red lights. Lights run on a global cycle with the phase
// alternating by intersection parity, so cross traffic gets a green
// while you wait. Traffic never leaves the roads.

import { TUNE, RIDES } from './tune.js';
import { makeRng, pick, spread } from './seed.js';
import { makeCar } from './rides.js';

const LIGHT_PERIOD = 14; // seconds for a full red/green cycle

export function makeTraffic(city, seed) {
  const rng = makeRng(seed + 101);
  const lines = city.roadLines;
  const cars = [];
  const usedSpecs = RIDES.filter((r) => r.id !== 'cop');

  function randomRoadSpot() {
    const vertical = rng() < 0.5;
    const line = pick(rng, lines);
    const along = spread(rng, -4 * city.pitch, 4 * city.pitch);
    const lane = (rng() < 0.5 ? -1 : 1) * 3;
    return vertical
      ? { x: line + lane, z: along, heading: lane > 0 ? 0 : Math.PI }
      : { x: along, z: line + lane, heading: lane > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  for (let i = 0; i < TUNE.trafficCount; i++) {
    const spot = randomRoadSpot();
    const car = makeCar(pick(rng, usedSpecs), spot.x, spot.z, spot.heading);
    car.cruise = spread(rng, 0.7, 1.05); // some drivers are slower
    car.nextTurnAt = spread(rng, 4, 14);
    city.group.add(car.mesh);
    cars.push(car);
  }

  // Traffic-light state at an intersection, from the global clock.
  // Parity flips the phase so the crossing road gets the opposite light.
  function lightIsGreen(nx, nz, clock) {
    const phase = Math.floor(clock / (LIGHT_PERIOD / 2)) % 2;
    const parity = ((nx + nz) / city.pitch) % 2 === 0 ? 0 : 1;
    return phase === parity;
  }

  function carAhead(car) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let nearest = Infinity;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < nearest && side < 3.2) nearest = along;
    }
    return nearest;
  }

  return {
    cars,
    lightIsGreen,

    update(dt, clock, colliders, playerCar) {
      for (const car of cars) {
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        // Nearest intersection ahead.
        let stopAt = Infinity;
        for (const line of lines) {
          const d = car.heading % Math.PI === 0
            ? (line - car.z) * fz
            : (line - car.x) * fx;
          if (d > 2 && d < stopAt) {
            const cross = car.heading % Math.PI === 0 ? car.x : car.z;
            const idx = Math.round(cross / city.pitch);
            const onLine = Math.abs(cross - idx * city.pitch) < 14;
            if (onLine) {
              const nx = car.heading % Math.PI === 0 ? Math.round(car.x / city.pitch) : Math.round(line / city.pitch);
              const nz = car.heading % Math.PI === 0 ? Math.round(line / city.pitch) : Math.round(car.z / city.pitch);
              if (!lightIsGreen(nx, nz, clock)) stopAt = d;
            }
          }
        }
        const ahead = Math.min(carAhead(car), playerCar ? (() => {
          const dx = playerCar.x - car.x, dz = playerCar.z - car.z;
          const along = dx * fx + dz * fz;
          const side = Math.abs(dx * fz - dz * fx);
          return (along > 0 && side < 3.4) ? along : Infinity;
        })() : Infinity);

        const gap = Math.min(stopAt, ahead);
        const want = gap < 9 ? 0 : TUNE.trafficSpeed * car.cruise;
        const input = {
          up: car.speed < want,
          down: car.speed > want + 0.5,
          left: false, right: false, brake: gap < 5,
        };
        // Random turn at an intersection, after a cooldown.
        car.nextTurnAt -= dt;
        const nearCross = Math.abs(car.x / city.pitch - Math.round(car.x / city.pitch)) < 0.08
          || Math.abs(car.z / city.pitch - Math.round(car.z / city.pitch)) < 0.08;
        if (car.nextTurnAt <= 0 && nearCross) {
          car.nextTurnAt = spread(rng, 8, 20);
          const turn = pick(rng, [-Math.PI / 2, Math.PI / 2]);
          car.heading += turn;
          // Snap onto the new road centreline so turns stay on asphalt.
          if (Math.abs(Math.sin(car.heading)) < 0.1) {
            car.x = Math.round(car.x / city.pitch) * city.pitch + (car.heading === 0 ? 3 : -3);
          } else {
            car.z = Math.round(car.z / city.pitch) * city.pitch + (car.heading === Math.PI / 2 ? 3 : -3);
          }
        }
        car.drive(input, dt, colliders, cars, null);
      }
    },

    // A car close enough to carjack: driver flees, the car is yours.
    nearestStealable(x, z, maxD = 4.5) {
      let best = null, bd = maxD;
      for (const car of cars) {
        const d = Math.hypot(car.x - x, car.z - z);
        if (d < bd) { bd = d; best = car; }
      }
      return best;
    },
    remove(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      city.group.remove(car.mesh);
    },
    respawn(car) {
      const spot = randomRoadSpot();
      car.x = spot.x; car.z = spot.z; car.heading = spot.heading;
      car.vx = 0; car.vz = 0; car.speed = 0;
      car.mesh.position.set(spot.x, 0, spot.z);
      car.mesh.rotation.y = spot.heading;
    },
  };
}
