// Staged screenshot scenes for shots.json: ?shot=start|drive|chase|mission.
// Each one arranges the live game into a readable moment, then the boot loop
// warms it up for a few frames and raises window.__shotReady.
import { createCar } from './autos.js';

export function applyShot(shot, W) {
  const { hero, jobs, wanted, city, life, stage } = W;
  const pl = city.places;
  if (shot === 'start') {
    // title vista: hero standing on the beach road at dusk, city behind
    stage.setTime(17.4);
    hero.x = 0; hero.z = 150; hero.y = 0; hero.heading = Math.PI;
    W.camYaw = Math.PI;
    W.mode = 'title';
    return 15;
  }
  if (shot === 'drive') {
    stage.setTime(10.5);
    const car = createCar(W.scene, 'sport', 0, 2 * 34, 0, 0xd21f3c);
    car.ai = { parked: false };
    W.allCars.push(car);
    hero.car = car; car.isPlayer = true; car.speed = 22;
    hero.x = car.x; hero.z = car.z;
    W.mode = 'play';
    return 15;
  }
  if (shot === 'chase') {
    stage.setTime(18.6); // dusk chase, headlights on
    const car = createCar(W.scene, 'muscle', -34, 0, Math.PI / 2, 0x1f1f24);
    car.ai = { parked: false };
    W.allCars.push(car);
    hero.car = car; car.isPlayer = true; car.speed = 24;
    hero.x = car.x; hero.z = car.z;
    wanted.add(65, 'staged chase');
    W.mode = 'play';
    return 45; // let police spawn and close in
  }
  if (shot === 'mission') {
    stage.setTime(12.0);
    hero.x = pl.bank.x + 8; hero.z = pl.bank.z + 10; hero.heading = Math.PI;
    hero.mag = 12; hero.reserve = 48;
    jobs.start(7, W.ctx); // The Big One: beacon on the bank
    W.mode = 'play';
    return 15;
  }
  return 0;
}
