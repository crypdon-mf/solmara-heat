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
    // Title screen over the city at golden hour: Jax on foot by the
    // Marina, Downtown towers behind him.
    world.screen = 'title';
    world.hour = 17.4;
    player.reset(-170, 20, Math.PI * 0.7);
    stage.setCamYaw(2.4);
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
    // Three-star chase at dusk: interceptor on Jax's tail, sirens lit.
    world.hour = 19.1;
    const car = world.parked.find((c) => c.spec.id === 'muscle')
      || world.parked[0];
    car.x = 0; car.z = 0; car.heading = Math.PI / 2;
    car.speed = 16; car.vx = 16; car.vz = 0;
    car.mesh.position.set(0, 0, 0);
    world.playerCar = car;
    player.group.visible = false;
    cops.setStars(3);
    // Pull two cruisers in close behind for the frame.
    const c1 = cops.cruisers[0], c2 = cops.cruisers[1];
    if (c1) { c1.x = -14; c1.z = -6; c1.heading = Math.PI / 2; c1.mesh.position.set(-14, 0, -6); }
    if (c2) { c2.x = -10; c2.z = 10; c2.heading = Math.PI / 2; c2.mesh.position.set(-10, 0, 10); }
    stage.setCamYaw(Math.PI / 2 + Math.PI);
  } else if (shot === 'mission') {
    // The Big One: Jax on foot outside the bank, beacon over the door.
    world.hour = 16.0;
    player.reset(38, 60, Math.PI);
    player.group.visible = true;
    world.playerCar = null;
    contracts.start(world, 'bigone');
    stage.setCamYaw(2.6);
  }

  // The app's frame loop counts rendered frames in shot mode and raises
  // the flag; this helper just records which scene we staged.
  window.__shotName = shot;
}
