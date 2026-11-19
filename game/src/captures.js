// Staged screenshot scenes for shots.json: ?shot=start|drive|chase|mission.
// Each one arranges the live game into a readable moment, then the boot loop
// warms it up for a few frames and raises window.__shotReady.
import { createCar } from './autos.js';

export function applyShot(shot, W) {
  const { hero, jobs, wanted, city, life, stage } = W;
  const pl = city.places;
  if (shot === 'start') {
    // title vista: hero standing on the beach road at dusk, city behind
    W.ctx.hour = 17.4;
    stage.setTime(17.4);
    hero.x = 0; hero.z = 150; hero.y = 0; hero.heading = Math.PI;
    W.camYaw = Math.PI;
    W.mode = 'title';
    return 15;
  }
  if (shot === 'drive') {
    W.ctx.hour = 10.5;
    stage.setTime(10.5);
    // mid-block on the z=0 road, cruising east through downtown
    const car = createCar(W.scene, 'sport', -119, 0, Math.PI / 2, 0xd21f3c);
    car.ai = { parked: false };
    W.allCars.push(car);
    hero.car = car; car.isPlayer = true; car.speed = 22;
    hero.x = car.x; hero.z = car.z;
    W.input.autoFwd = true; // keep cruising through the screenshot
    W.mode = 'play';
    return 15;
  }
  if (shot === 'chase') {
    W.ctx.hour = 17.9; // sunset: orange sky, headlights + lamps on
    stage.setTime(17.9);
    // mid-block on the x=-34 road, cruising south, cops behind
    const car = createCar(W.scene, 'muscle', -34, 17, 0, 0x1f1f24);
    car.ai = { parked: false };
    W.allCars.push(car);
    hero.car = car; car.isPlayer = true; car.speed = 24;
    hero.x = car.x; hero.z = car.z;
    wanted.add(65, 'staged chase');
    W.input.autoFwd = true;
    W.mode = 'play';
    return 45; // let police spawn and close in
  }
  if (shot === 'mission') {
    W.ctx.hour = 12.0;
    stage.setTime(12.0);
    // on the open road just south of the bank intersection, beacon dead ahead
    hero.x = pl.bank.x; hero.z = pl.bank.z + 8; hero.heading = Math.PI;
    hero.mag = 12; hero.reserve = 48;
    W.camYaw = 0; // camera behind Jax, looking north at the bank + beacon
    jobs.start(7, W.ctx); // The Big One: beacon on the bank
    W.mode = 'play';
    return 15;
  }
  return 0;
}
