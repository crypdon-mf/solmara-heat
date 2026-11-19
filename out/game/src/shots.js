// Staged screenshot scenes behind ?shot=start|drive|chase|mission&seed=7.
// Each one drives the real game forward from a fresh state for a fixed
// number of steps, so the frame is what real play looks like and the same
// seed always gives the same frame. The caller paints a few frames and then
// sets window.__shotReady.
import { CAR_TUNING } from './config.js';
import { makeCar } from './vehicles.js';
import { spawnPoliceCar } from './police.js';

export function stageShot(name, G, THREE) {
  const scene = name || 'start';
  if (scene === 'start') {
    // Title backdrop: camera high over the centre, player on foot in the plaza.
    G.player.x = 0;
    G.player.z = 8;
    G.player.heading = Math.PI * 0.75;
    G.player.mesh.position.set(0, 0, 8);
    G.player.mesh.rotation.y = G.player.heading;
    G.cameraOrbit.yaw = G.player.heading + Math.PI + 0.6;
    return { screen: 'title' };
  }
  if (scene === 'drive') {
    // In the starter car, mid-drive down a main road with traffic around.
    const car = G.cars[G.cars.length - 1];
    G.player.inCar = true;
    G.player.car = car;
    car.driver = 'player';
    car.parked = false;
    car.x = 0; car.z = -120; car.heading = Math.PI; car.speed = 18;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    G.player.mesh.visible = false;
    G.player.x = car.x; G.player.z = car.z; G.player.heading = car.heading;
    G.cameraOrbit.yaw = null;
    return { screen: 'play' };
  }
  if (scene === 'chase') {
    // Two-star chase: player speeding, police cars closing in behind.
    const car = G.cars[G.cars.length - 1];
    G.player.inCar = true;
    G.player.car = car;
    car.driver = 'player';
    car.parked = false;
    car.x = 52; car.z = -60; car.heading = Math.PI; car.speed = 24;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    G.player.mesh.visible = false;
    G.player.x = car.x; G.player.z = car.z; G.player.heading = car.heading;
    G.wanted.heat = 35;
    G.wanted.stars = 2;
    // Two police cars right behind, lights on, so the chase reads at a glance.
    for (let i = 0; i < 2; i += 1) {
      const cop = spawnPoliceCar(G, THREE);
      cop.x = 52 + (i === 0 ? -4 : 4);
      cop.z = -60 + 14 + i * 7;
      cop.heading = Math.PI;
      cop.speed = 20;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }
    G.cameraOrbit.yaw = null;
    return { screen: 'play' };
  }
  // mission: on foot south-east of the marina, looking north-west at it —
  // the gold beacon and the red sportscar in the lot are both in frame.
  G.player.x = -156;
  G.player.z = 230;
  G.player.heading = -2.27;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  G.player.mesh.rotation.y = G.player.heading;
  G.player.mesh.visible = true;
  G.cameraOrbit.yaw = G.player.heading + Math.PI;
  G.mission.active = true;
  G.mission.def = { id: 2, name: 'Hot Wheels', reward: 400, time: 240 };
  G.mission.objective = 'Steal the red sportscar at the marina';
  G.mission.timeLeft = 187;
  G.mission.marker = { x: -182, z: 208 };
  if (G.beacon) {
    G.beacon.position.set(-182, 7, 208);
    G.beacon.visible = true;
    G.markerMesh.position.set(-182, 0.15, 208);
    G.markerMesh.visible = true;
  }
  // The prize itself: the red sportscar parked in the marina lot.
  const prize = makeCar(THREE, G.renderer.scene, -164, 208, Math.PI / 2, 0xd8433c, 'sport');
  prize.parked = true;
  G.cars.push(prize);
  return { screen: 'play' };
}
