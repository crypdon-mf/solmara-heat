// AI traffic: cars that loop the road grid, turn at intersections, and brake
// for the car ahead of them. Each one follows a road centre line, picks a
// new direction at every intersection, and keeps a sensible speed so the
// streets feel alive without ever blocking the player on purpose.
import { makeCar, updateDrive, CAR_COLORS } from './vehicles.js';
import { roadLines } from './world.js';
import { pick, range } from './random.js';

export function spawnTraffic(THREE, scene, rng, count) {
  const cars = [];
  const lines = roadLines();
  for (let i = 0; i < count; i += 1) {
    const vertical = rng() < 0.5;
    const line = pick(rng, lines);
    const along = range(rng, -200, 200);
    const dir = rng() < 0.5 ? 1 : -1;
    const color = pick(rng, CAR_COLORS);
    const heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(THREE, scene, vertical ? line : along, vertical ? along : line, heading, color, 'sedan');
    car.driver = 'traffic';
    car.parked = false;
    car.speed = range(rng, 7, 11);
    car.traffic = { vertical, line, dir, targetSpeed: car.speed, wait: 0 };
    cars.push(car);
  }
  return cars;
}

function carAhead(car, others, playerCar) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let nearest = 26;
  const all = playerCar ? others.concat([playerCar]) : others;
  for (const other of all) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < nearest && side < 3) nearest = along;
  }
  return nearest;
}

export function updateTraffic(cars, rng, dt, playerCar) {
  const lines = roadLines();
  for (const car of cars) {
    if (car.driver === 'player') continue; // jacked: the player drives now
    const t = car.traffic;
    // At an intersection, sometimes turn onto the cross road.
    const onLine = Math.abs((t.vertical ? car.z : car.x) % 52) < 1.5 || true;
    const nearestLine = lines.reduce((a, b) => (Math.abs(b - (t.vertical ? car.z : car.x)) < Math.abs(a - (t.vertical ? car.z : car.x)) ? b : a));
    const distToLine = Math.abs((t.vertical ? car.z : car.x) - nearestLine);
    if (distToLine < 1.2 && rng() < 0.3) {
      // Turn: switch axis, keep going in a random direction on the new road.
      const cross = nearestLine;
      if (t.vertical) {
        car.x = cross;
        t.vertical = false;
        t.line = cross;
        t.dir = rng() < 0.5 ? 1 : -1;
        car.heading = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.z = cross;
        t.vertical = true;
        t.line = cross;
        t.dir = rng() < 0.5 ? 1 : -1;
        car.heading = t.dir > 0 ? 0 : Math.PI;
      }
    }
    // Stay on the road line and brake for traffic ahead.
    const gap = carAhead(car, cars, playerCar);
    const want = gap < 10 ? 0 : t.targetSpeed;
    car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
    if (t.vertical) {
      car.z += Math.sin(car.heading) * car.speed * dt * 0 + Math.cos(car.heading) * car.speed * dt;
      car.x += (t.line + (t.dir > 0 ? 2.2 : -2.2) - car.x) * Math.min(1, dt * 3);
    } else {
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += (t.line + (t.dir > 0 ? 2.2 : -2.2) - car.z) * Math.min(1, dt * 3);
    }
    // Wrap around the city edge so traffic never runs out.
    if (car.x > 240) car.x = -240;
    if (car.x < -240) car.x = 240;
    if (car.z > 260) car.z = -240;
    if (car.z < -240) car.z = 260;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}
