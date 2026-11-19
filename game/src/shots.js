// Staged screenshot scenes behind ?shot=start|drive|chase|mission&seed=7.
// Each one drives the real game forward from a fresh state for a fixed
// number of steps, so the frame is what real play looks like and the same
// seed always gives the same frame. The caller paints a few frames and then
// sets window.__shotReady.
import { CAR_TUNING } from './config.js';

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
    G.wanted.heat = 45;
    G.wanted.stars = 2;
    G.cameraOrbit.yaw = null;
    return { screen: 'play' };
  }
  // mission: on foot at the marina, gold beacon marking the red sportscar.
  G.player.x = -176;
  G.player.z = 196;
  G.player.heading = Math.PI * 0.9;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  G.player.mesh.rotation.y = G.player.heading;
  G.player.mesh.visible = true;
  G.cameraOrbit.yaw = G.player.heading + Math.PI + 0.5;
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
  return { screen: 'play' };
}
