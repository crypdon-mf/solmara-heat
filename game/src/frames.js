// frames.js — staged scenes for the four screenshots.
// ?shot=start|drive|chase|mission&seed=7 arranges the world, then the
// app flags window.__shotReady after a couple of rendered frames so a
// headless capture script knows the scene is settled. No gameplay logic
// lives here — only placement for the camera.

export function stageShot(world, stage, ctx) {
  const { shot } = ctx;
  const { player, cops, contracts } = world;
  window.__shotReady = false;
  window.__shotFrames = 0;

  world.screen = 'playing';
  world.paused = false;

  if (shot === 'start') {
    // Title screen over the city at golden hour: camera over the beach
    // looking east at the Marina skyline, Jax in the foreground.
    world.screen = 'title';
    world.hour = 16.5;
    player.reset(-170, 20, Math.PI * 0.7);
    stage.setCamYaw(-Math.PI / 2);
    stage.setCamDist(45);
    stage.setCamPitch(0.5);
  } else if (shot === 'drive') {
    // Downtown drive: Jax in the red Vela GT, mid-traffic, afternoon sun.
    world.hour = 15.2;
    const car = world.parked.find((c) => c.spec.id === 'coupe')
      || world.parked[0];
    car.x = 0; car.z = 40; car.heading = 0;
    car.speed = 14; car.vx = 0; car.vz = 14;
    car.mesh.position.set(0, 0, 40);
    world.playerCar = car;
    player.group.visible = false;
    stage.setCamYaw(Math.PI);
  } else if (shot === 'chase') {
    // Three-star chase at dusk: Jax in the blue sedan, two interceptors
    // closing in ahead of him, sirens flashing, windows lit.
    world.hour = 19.1;
    const car = world.parked.find((c) => c.spec.id === 'sedan')
      || world.parked[0];
    car.x = 0; car.z = 0; car.heading = Math.PI / 2;
    car.speed = 16; car.vx = 16; car.vz = 0;
    car.mesh.position.set(0, 0, 0);
    world.playerCar = car;
    player.group.visible = false;
    cops.setStars(3);
    cops.placeCruisers([[16, -8, Math.PI / 2], [22, 9, Math.PI / 2]]);
    stage.setCamYaw(Math.PI / 2 + Math.PI);
  } else if (shot === 'mission') {
    // The Big One: Jax on foot south of the bank, facing the beacon
    // over the door, camera behind him looking north up the street.
    world.hour = 16.0;
    player.reset(46, 58, Math.PI);
    player.group.visible = true;
    world.playerCar = null;
    contracts.start(world, 'bigone');
    stage.setCamYaw(0);
  }

  // The app's frame loop counts rendered frames in shot mode and raises
  // the flag; this helper just records which scene we staged.
  window.__shotName = shot;
}
