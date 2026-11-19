// Solmara, the city: five districts, a road grid, buildings with real
// window textures that light up at night, street props, traffic lights,
// a beach and a pier. Exports colliders and named places for the jobs.
import * as THREE from 'three';
import { TUNE, DISTRICTS } from './tuning.js';
import { Rng } from './rng.js';

const P = TUNE.pitch;

function facadeTexture(rng, base, accent, litRatio) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading + grime near the bottom
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)'); grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  const lit = document.createElement('canvas'); lit.width = 128; lit.height = 256;
  const lg = lit.getContext('2d'); lg.fillStyle = '#000'; lg.fillRect(0, 0, 128, 256);
  const cols = 4, rows = 10;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const x = 10 + col * 30, y = 12 + r * 24;
    const litWin = rng.chance(litRatio);
    g.fillStyle = litWin ? '#ffd98a' : '#1d2733';
    g.fillRect(x, y, 20, 14);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, 20, 2);
    if (litWin) { lg.fillStyle = '#ffca66'; lg.fillRect(x, y, 20, 14); }
    if (rng.chance(0.08)) { // neon accent window
      g.fillStyle = accent; g.fillRect(x, y, 20, 14);
    }
  }
  // ground-floor shopfront
  g.fillStyle = '#20242c'; g.fillRect(6, 226, 116, 26);
  g.fillStyle = accent; g.fillRect(6, 224, 116, 3);
  const map = new THREE.CanvasTexture(c);
  const emissive = new THREE.CanvasTexture(lit);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

function roadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2c2f36'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 200; i++) g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  g.fillStyle = '#e8c33c'; g.fillRect(30, 0, 4, 256); // centre line
  g.fillStyle = '#dfe3e8'; g.fillRect(3, 0, 2, 256); g.fillRect(59, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function districtAt(x, z) {
  const bx = Math.round(x / P), bz = Math.round(z / P);
  if (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) return 'downtown';
  if (bz >= 3) return 'beach';
  if (bx <= -3) return 'industrial';
  if (bx >= 3 && bz <= 0) return 'marina';
  return 'oldtown';
}

export function buildCity(stage, seed) {
  const rng = new Rng(seed);
  const scene = stage.scene;
  const city = {
    colliders: [],        // {x0,z0,x1,z1}
    lights: [],           // traffic lights {pos, axis, state, timer, meshes}
    lamps: [],            // lamp bulb materials (glow at night)
    buildingMats: [],     // facade materials (emissive at night)
    neonMats: [],
    places: {},           // named job locations
    water: null,
    rng,
  };
  const B = TUNE.blocks;
  const half = B * P + 20;

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, half * 2 + 260),
    new THREE.MeshStandardMaterial({ color: 0x4d7a45, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  // --- beach sand + sea (south edge) ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, 46),
    new THREE.MeshStandardMaterial({ color: 0xe6d3a3, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, B * P + 34);
  sand.receiveShadow = true;
  scene.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 400, 320),
    new THREE.MeshStandardMaterial({ color: 0x1e6f8e, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, B * P + 34 + 23 + 160);
  scene.add(water);
  city.water = water;

  // --- roads ---
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  for (let k = -B; k <= B; k++) {
    const mk = (w, l, x, z, rot, rep) => {
      const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(1, rep);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
      m.position.set(x, 0.06, z); m.receiveShadow = true;
      scene.add(m);
    };
    mk(P * 0 + 8, half * 2, k * P, 0, 0, half / 8);            // north-south road
    mk(8, half * 2, 0, k * P, Math.PI / 2, half / 8);          // east-west road
  }
  // --- roads: crosswalks are painted into the road texture; no extra meshes ---

  // --- blocks: sidewalks + buildings, centred BETWEEN the roads ---
  // (blocks at half-grid positions so road centrelines stay open asphalt)
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 1 });
  for (let bx = -B - 1; bx <= B - 1; bx++) for (let bz = -B - 1; bz <= B - 1; bz++) {
    const cx = (bx + 0.5) * P, cz = (bz + 0.5) * P;
    const dist = DISTRICTS[districtAt(cx, cz)];
    // sidewalk slab
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(P - 8, 0.3, P - 8),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 1 }),
    );
    walk.position.set(cx, 0.15, cz); walk.receiveShadow = true;
    scene.add(walk);
    const n = dist === 'downtown' ? rng.int(1, 2) : rng.int(1, 3);
    for (let b = 0; b < n; b++) {
      const w = rng.float(9, 15), d = rng.float(9, 15);
      const h = rng.float(dist.minH, dist.maxH);
      const ox = n === 1 ? 0 : rng.float(-5, 5), oz = n === 1 ? 0 : rng.float(-5, 5);
      const x = cx + ox, z = cz + oz;
      const hex = '#' + dist.color.toString(16).padStart(6, '0');
      const accHex = '#' + dist.accent.toString(16).padStart(6, '0');
      const { map, emissive } = facadeTexture(rng, hex, accHex, 0.35);
      const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0 });
      city.buildingMats.push(mat);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        mat,
      );
      mesh.position.set(x, h / 2 + 0.3, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      // roof furniture — only on taller buildings, to keep draw calls down
      if (h > 16) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.2, d * 0.4), roofMat);
        roof.position.set(x, h + 0.9, z); roof.castShadow = true;
        scene.add(roof);
      }
      if (rng.chance(0.2)) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }));
        tank.position.set(x + w * 0.25, h + 1.6, z - d * 0.2); tank.castShadow = true;
        scene.add(tank);
      }
      if (rng.chance(0.35)) { // neon sign
        const neon = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 1.6, rng.float(4, 7)),
          new THREE.MeshStandardMaterial({ color: 0x111111, emissive: dist.accent, emissiveIntensity: 1.6 }),
        );
        neon.position.set(x + w / 2 + 0.3, h * 0.72, z);
        city.neonMats.push(neon.material);
        scene.add(neon);
      }
      city.colliders.push({ x0: x - w / 2 - 0.4, z0: z - d / 2 - 0.4, x1: x + w / 2 + 0.4, z1: z + d / 2 + 0.4 });
    }
    // corner palms on some blocks (beach + marina get more)
    if (rng.chance(dist === 'beach' || dist === 'marina' ? 0.7 : 0.3)) makePalm(scene, cx + (P / 2 - 7), cz + (P / 2 - 7), rng);
    if (rng.chance(0.22)) makePalm(scene, cx - (P / 2 - 7), cz - (P / 2 - 7), rng);
  }

  // --- street lamps along main roads ---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.5 });
  for (let k = -B; k <= B; k++) for (let j = -B; j <= B; j += 4) {
    const lamp = makeLamp(scene, poleMat, k * P + 5.5, j * P + 5.5);
    city.lamps.push(lamp);
  }

  // --- traffic lights at main intersections only ---
  for (let i = -B; i <= B; i += 4) for (let j = -B; j <= B; j += 4) {
    city.lights.push(makeTrafficLight(scene, i * P, j * P, rng));
  }

  // --- beach props: umbrellas + pier ---
  for (let i = 0; i < 9; i++) {
    const x = -150 + i * 36 + rng.float(-6, 6);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0xd8d2c0 }));
    pole.position.set(x, 1.3, B * P + 30); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 8), new THREE.MeshStandardMaterial({ color: rng.pick([0xe05a5a, 0x4a90d9, 0xf2b705, 0x7ac74f]) }));
    top.position.set(x, 2.9, B * P + 30); top.castShadow = true; scene.add(top);
  }
  // pier: wooden walkway out to sea at x = P (34)
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6b48, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 70), pierMat);
  pier.position.set(P, 0.8, B * P + 34 + 30); pier.castShadow = true;
  scene.add(pier);
  const boat = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 9), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
  boat.position.set(P, 0.6, B * P + 34 + 58); boat.castShadow = true;
  scene.add(boat);
  const boatTop = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x2b6cb0 }));
  boatTop.position.set(P, 1.9, B * P + 34 + 57); scene.add(boatTop);
  city.places.boat = { x: P, z: B * P + 34 + 52 };

  // --- named places (all on roads, reachable by car) ---
  city.places.hotel = { x: 0, z: -2 * P };          // downtown hotel
  city.places.marinaLot = { x: 4 * P, z: -P };      // marina car park
  city.places.garage = { x: -2 * P, z: P };         // Mara's garage (old town)
  city.places.bank = { x: -P, z: 0 };               // downtown bank
  city.places.gunshop = { x: 2 * P, z: 2 * P };
  city.places.policeStation = { x: -4 * P, z: -2 * P };
  city.places.hospital = { x: 3 * P, z: -3 * P };
  city.places.oldtownPickup = { x: -2 * P, z: -3 * P };
  city.places.spawn = { x: 0, z: 2 * P };

  // marker poles so places read in the world: hotel awning, garage sign, bank columns
  const awning = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0xd21f3c }));
  awning.position.set(0, 3.4, -2 * P - 6); scene.add(awning);
  const bankSign = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd24d, emissiveIntensity: 1.2 }));
  bankSign.position.set(-P, 9, -6); scene.add(bankSign);
  city.neonMats.push(bankSign.material);

  return city;
}

function makePalm(scene, x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.45, 6.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x8a6b48, roughness: 1 }),
  );
  trunk.position.y = 3.25; trunk.castShadow = true;
  g.add(trunk);
  // one spiky foliage crown instead of six separate fronds
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 1 }),
  );
  crown.position.y = 7.4; crown.castShadow = true;
  g.add(crown);
  g.position.set(x, 0, z);
  g.rotation.y = rng.float(0, Math.PI * 2);
  scene.add(g);
  return g;
}

function makeLamp(scene, poleMat, x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat);
  pole.position.y = 3.5; pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), poleMat);
  arm.position.set(-1, 6.9, 0); g.add(arm);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffdf80, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), bulbMat);
  bulb.position.set(-2, 6.8, 0); g.add(bulb);
  g.position.set(x, 0, z);
  scene.add(g);
  return bulbMat;
}

function makeTrafficLight(scene, x, z, rng) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.4, 6), poleMat);
  pole.position.y = 3.2; pole.castShadow = true;
  g.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), poleMat);
  head.position.set(0, 6.2, 0); g.add(head);
  const mkLamp = (color, y) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0.15 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), m);
    s.position.set(0, y, 0.5); g.add(s);
    return m;
  };
  const red = mkLamp(0xff2a2a, 7.0), amber = mkLamp(0xffb020, 6.2), green = mkLamp(0x2aff66, 5.4);
  g.position.set(x + 5.6, 0, z + 5.6);
  scene.add(g);
  return { x: x + 5.6, z: z + 5.6, nodeX: x, nodeZ: z, state: rng.pick(['ns', 'ew']), timer: rng.float(2, 8), red, amber, green };
}

export function updateTrafficLights(city, dt) {
  for (const L of city.lights) {
    L.timer -= dt;
    if (L.timer <= 0) {
      L.state = L.state === 'ns' ? 'ew' : 'ns';
      L.timer = L.state === 'ns' ? 9 : 9;
    }
    const ns = L.state === 'ns';
    L.green.emissiveIntensity = ns ? 2.2 : 0.12;
    L.red.emissiveIntensity = ns ? 0.12 : 2.2;
    L.amber.emissiveIntensity = 0.12;
  }
}

// True when a car at (x,z) travelling along `axis` may pass node (nx,nz).
export function lightAllows(city, axis, nx, nz) {
  for (const L of city.lights) {
    if (Math.abs(L.nodeX - nx) < 1 && Math.abs(L.nodeZ - nz) < 1) {
      if (axis === 'x') return L.state === 'ew';
      return L.state === 'ns';
    }
  }
  return true; // no light at this intersection: go
}

// Night glow: lamps + windows light up, neon pops.
export function setNightGlow(city, night) {
  const k = night ? 1 : 0;
  for (const m of city.lamps) m.emissiveIntensity = k * 2.4;
  for (const m of city.buildingMats) {
    if (m.emissiveMap) m.emissiveIntensity = k * 0.85;
  }
  for (const m of city.neonMats) m.emissiveIntensity = 1.2 + k * 1.4;
}

// Circle vs building AABB — returns push-out vector or null.
export function collideBuildings(city, x, z, r) {
  for (const c of city.colliders) {
    const nx = Math.max(c.x0, Math.min(x, c.x1));
    const nz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      return { px: (dx / d) * (r - d), pz: (dz / d) * (r - d), nx: dx / d, nz: dz / d };
    }
  }
  return null;
}

export function clampToCity(x, z) {
  const lim = TUNE.blocks * TUNE.pitch + 30;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}
