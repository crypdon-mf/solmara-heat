// Cars: low-poly meshes built from boxes, plus the arcade driving model.
// A car has a position, a heading, a speed and a steer angle; the update
// accelerates, brakes, drags and steers it, then the caller resolves building
// and car-car collisions. The same mesh builder serves the player's cars,
// parked cars, traffic and police — only the colour and the light bar differ.
import { CAR_TUNING } from './config.js';
import { clamp } from './random.js';

export const CAR_COLORS = [0xd8433c, 0x3c6fd8, 0xe8c93c, 0x3cd87a, 0xe8e8e8, 0x222831, 0xd87a3c, 0x9e4fd8, 0x4fd8d2];

export function createCarMesh(THREE, color, kind) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2128 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc9dd });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2);
  car.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 2.0), paint);
  roof.position.set(0, 1.42, -0.2);
  car.add(roof);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(wx, 0.36, wz);
    car.add(wheel);
  }
  // Headlights and tail lights so cars read at dusk and in the minimap's dark.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    head.position.set(sx, 0.55, 2.21);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    tail.position.set(sx, 0.55, -2.21);
    car.add(tail);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.55, -0.2);
    bar.name = 'lightbar';
    car.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.62, 1.55, -0.2);
    bar2.name = 'lightbar2';
    car.add(bar2);
  }
  // A soft dark disc under the car: the fake blob shadow (no shadow maps).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 2.1, 1);
  shadow.position.y = 0.02;
  car.add(shadow);
  return car;
}

export function makeCar(THREE, scene, x, z, heading, color, kind) {
  const mesh = createCarMesh(THREE, color, kind || 'sedan');
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, kind: kind || 'sedan', color,
    x, z, heading, speed: 0, steer: 0,
    driver: null,      // 'player' | 'traffic' | 'police' | null (parked)
    parked: kind !== 'police',
    health: 100,
    stuck: 0,
  };
}

// Arcade driving: throttle accelerates, S brakes then reverses, steering bites
// harder the slower the car goes, drag bleeds speed, Space is the handbrake.
export function updateDrive(car, throttle, steerInput, handbrake, dt) {
  const t = CAR_TUNING;
  const targetSteer = steerInput * 0.55;
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
  if (throttle > 0) car.speed += t.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= t.brake * dt;
    else car.speed -= t.reverseAccel * dt;
  }
  car.speed -= car.speed * t.drag * dt;
  if (handbrake) {
    car.speed -= car.speed * t.handbrakeDrag * dt;
    car.steer *= 1.15;
  }
  car.speed = clamp(car.speed, -t.maxReverse, t.maxSpeed);
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  const turn = car.steer * t.steerRate * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.heading += turn * dt * t.steerGrip;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Wheels lean the body a touch into corners and under braking.
  car.mesh.rotation.z = -car.steer * clamp(Math.abs(car.speed) / 30, 0, 1) * 0.05;
}

export function carDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Push two overlapping cars apart and trade a little speed between them.
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const min = CAR_TUNING.radius * 2;
  if (dist >= min || dist < 0.001) return false;
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const nz = dz / dist;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
  const swap = a.speed * 0.3;
  a.speed = b.speed * 0.3 + swap * 0.3;
  b.speed = swap * 0.3;
  a.mesh.position.set(a.x, 0, a.z);
  b.mesh.position.set(b.x, 0, b.z);
  return true;
}
