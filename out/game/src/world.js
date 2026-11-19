// The city of Solmara, built once from a seed: a 9-road grid, low-poly
// buildings with canvas-painted windows, palm trees, street lamps, a beach
// and a water plane to the south. Everything the physics needs is returned
// as data — building colliders, road centre lines, parked-car spots and the
// landmark positions the missions drive to.
import { WORLD } from './config.js';
import { pick, range } from './random.js';

const BUILDING_COLORS = [0xd8c9a8, 0xc9b8a3, 0xa8b8c9, 0xd8a8a0, 0xb8c9a8, 0xe0d8c8, 0x9fb8c9, 0xc9a8c9];
const ROOF_COLORS = [0x8a6f4d, 0x5d6b7a, 0x7a5d5d, 0x4d6b5d];

function windowTexture(rng) {
  // Unused helper kept for reference: facades are painted by makeFacadeTexture.
  return null;
}

// Build a canvas texture through three's own loader-free path.
function makeFacadeTexture(THREE, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      ctx.fillStyle = rng() < 0.45 ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(8 + col * 24, 10 + row * 25, 16, 15);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function roadLines() {
  const lines = [];
  const half = ((WORLD.roadCount - 1) / 2) * WORLD.roadSpacing;
  for (let i = 0; i < WORLD.roadCount; i += 1) lines.push(-half + i * WORLD.roadSpacing);
  return lines;
}

export function nearestRoadPoint(x, z) {
  const lines = roadLines();
  let bestX = lines[0];
  let bestZ = lines[0];
  for (const v of lines) {
    if (Math.abs(v - x) < Math.abs(bestX - x)) bestX = v;
    if (Math.abs(v - z) < Math.abs(bestZ - z)) bestZ = v;
  }
  // Snap to whichever road axis is closer.
  if (Math.abs(bestX - x) < Math.abs(bestZ - z)) return { x: bestX, z };
  return { x, z: bestZ };
}

export function buildCity(THREE, rng) {
  const group = new THREE.Group();
  const colliders = [];
  const lines = roadLines();
  const half = WORLD.cityHalf;
  const waterMeshes = [];

  // Ground: pale sidewalk base, roads laid on top as dark strips.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 90, half * 2 + 90),
    new THREE.MeshLambertMaterial({ color: 0xb8a98c }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (const v of lines) {
    for (const [w, l, x, z] of [
      [WORLD.roadWidth, half * 2, v, 0],
      [half * 2, WORLD.roadWidth, 0, v],
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, z);
      group.add(road);
    }
    // Dashed centre lines along each road.
    for (let d = -half; d < half; d += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(v, 0.04, d);
      group.add(dash);
      const dash2 = dash.clone();
      dash2.position.set(d, 0.04, v);
      dash2.rotation.z = Math.PI / 2;
      group.add(dash2);
    }
  }

  // Beach sand and sea to the south (+z).
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 90, 30),
    new THREE.MeshLambertMaterial({ color: 0xe8d8a0 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, WORLD.beachStart + 12);
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 200, 160),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, WORLD.waterStart + 80);
  group.add(water);
  waterMeshes.push(water);

  // Buildings: one or two per block, skipped for a few plaza blocks.
  const blockCentres = [];
  for (let i = 0; i < WORLD.roadCount - 1; i += 1) {
    for (let j = 0; j < WORLD.roadCount - 1; j += 1) {
      blockCentres.push({ x: (lines[i] + lines[i + 1]) / 2, z: (lines[j] + lines[j + 1]) / 2 });
    }
  }
  const facadeTex = makeFacadeTexture(THREE, rng);
  for (const centre of blockCentres) {
    if (rng() < 0.14) {
      // Plaza: palms and a bench instead of a building.
      for (let k = 0; k < 3; k += 1) addPalm(THREE, group, centre.x + range(rng, -14, 14), centre.z + range(rng, -14, 14), rng);
      continue;
    }
    const w = range(rng, 16, 30);
    const d = range(rng, 16, 30);
    const h = range(rng, 8, 30) * (rng() < 0.12 ? 1.8 : 1);
    const color = pick(rng, BUILDING_COLORS);
    const mat = new THREE.MeshLambertMaterial({ color, map: facadeTex });
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    building.position.set(centre.x, h / 2, centre.z);
    group.add(building);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
      new THREE.MeshLambertMaterial({ color: pick(rng, ROOF_COLORS) }),
    );
    roof.position.set(centre.x, h + 0.4, centre.z);
    group.add(roof);
    colliders.push({ minX: centre.x - w / 2, maxX: centre.x + w / 2, minZ: centre.z - d / 2, maxZ: centre.z + d / 2 });
    if (rng() < 0.5) addPalm(THREE, group, centre.x + w / 2 + 4, centre.z + range(rng, -10, 10), rng);
  }

  // Landmark buildings, given their own colours so missions can point at them.
  const landmarks = {};
  function landmark(name, x, z, w, d, h, color) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, map: facadeTex }),
    );
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), new THREE.MeshLambertMaterial({ color: 0x27364a }));
    roof.position.set(x, h + 0.6, z);
    group.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    landmarks[name] = { x, z };
    return mesh;
  }
  landmark('hotel', 182, -182, 26, 26, 46, 0xe8c96a);      // Solmara Grand, north-east
  landmark('bank', 26, -26, 24, 20, 22, 0x9fb8c9);         // Meridian Bank, centre
  landmark('garage', -182, 26, 26, 18, 12, 0xc96a6a);      // Mara's garage, west
  landmark('gunShop', -26, 182, 18, 16, 10, 0x8a8a8a);     // gun shop, south
  landmark('hospital', 130, 130, 24, 20, 18, 0xf0f0f0);    // hospital, south-east
  landmark('policeStation', -130, -130, 24, 20, 16, 0x5d7a9e); // police station, north-west
  landmark('marina', -182, 208, 20, 16, 10, 0x6ac9c9);     // marina lot, south-west
  landmarks.pier = { x: 104, z: 252 };                     // boat at the pier, on the beach

  // Pier decking out over the sand.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.6, 26),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d }),
  );
  pier.position.set(104, 0.4, 252);
  group.add(pier);

  // Street lamps at intersections.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333a42 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of lines) {
    for (const z of lines) {
      if (rng() < 0.55) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), lampMat);
      pole.position.set(x + 7, 3.5, z + 7);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      bulb.position.set(x + 7, 7.1, z + 7);
      group.add(bulb);
    }
  }

  // Palms along the beach.
  for (let x = -220; x <= 220; x += 28) {
    if (rng() < 0.3) continue;
    addPalm(THREE, group, x + range(rng, -6, 6), WORLD.beachStart + 4, rng);
  }

  // Parked-car spots along road edges.
  const parkedSpots = [];
  for (let i = 0; i < 26; i += 1) {
    const line = pick(rng, lines);
    const along = range(rng, -200, 200);
    const vertical = rng() < 0.5;
    parkedSpots.push({
      x: vertical ? line + 4.6 : along,
      z: vertical ? along : line + 4.6,
      heading: vertical ? 0 : Math.PI / 2,
    });
  }

  return { group, colliders, lines, landmarks, parkedSpots, waterMeshes };
}

function addPalm(THREE, group, x, z, rng) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.35, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d }),
  );
  trunk.position.set(x, 3, z);
  trunk.rotation.z = range(rng, -0.08, 0.08);
  group.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x3d9e4d }),
  );
  leaves.scale.y = 0.45;
  leaves.position.set(x, 6.4, z);
  group.add(leaves);
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
// Returns true when a push happened; mutates pos in place.
export function resolveColliders(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      pos.x = cx + (dx / dist) * radius;
      pos.z = cz + (dz / dist) * radius;
    } else {
      // Centre inside the box: shove out along the smallest penetration axis.
      const pushL = pos.x - c.minX + radius;
      const pushR = c.maxX - pos.x + radius;
      const pushT = pos.z - c.minZ + radius;
      const pushB = c.maxZ - pos.z + radius;
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) pos.x = c.minX - radius;
      else if (m === pushR) pos.x = c.maxX + radius;
      else if (m === pushT) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return hit;
}

export function insideCity(x, z) {
  const m = WORLD.cityHalf + 12;
  return Math.abs(x) < m && z > -m - 12 && z < WORLD.beachStart + 22;
}
