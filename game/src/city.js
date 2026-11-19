// city.js — builds Solmara: a 9x9 road grid, five districts, a beach
// and a bay to the west. Everything is placed from a seeded rng so the
// city is identical on every load. Exports the colliders the driving and
// on-foot code need, plus the road network the traffic follows.

import * as THREE from 'three';
import { TUNE, DISTRICTS } from './tune.js';
import { makeRng, pick, spread, whole, chance } from './seed.js';

const PITCH = TUNE.block + TUNE.road; // 46 m between road centrelines

function facadeTexture(rng, base, lit) {
  // Canvas texture: a wall of windows. `lit` paints warm lit windows for
  // the emissive map so the towers glow after dark.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 8 + col * 20, y = 10 + r * 20;
      if (lit) {
        g.fillStyle = chance(rng, 0.55) ? '#ffd88a' : '#20242e';
      } else {
        g.fillStyle = chance(rng, 0.5) ? '#2b3547' : '#1a2230';
      }
      g.fillRect(x, y, 13, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function districtAt(bx, bz) {
  // bx, bz are block indices -4..3. Downtown is the middle, the marina
  // hugs the west edge, old town sits north, market east, docks south.
  if (bx <= -3) return DISTRICTS[0];
  if (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) return DISTRICTS[1];
  if (bz <= -2) return DISTRICTS[2];
  if (bx >= 2) return DISTRICTS[3];
  if (bz >= 2) return DISTRICTS[4];
  return DISTRICTS[1];
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  const colliders = [];
  const lamps = [];   // {x, z, bulb} — bulbs glow at night
  const windows = []; // building materials whose emissive we drive at night
  const roadLines = []; // x (or z) positions of road centrelines

  // ---- ground: asphalt base, then sidewalks and the beach ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x33363c })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Sand strip + bay to the west.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 560),
    new THREE.MeshLambertMaterial({ color: 0xd9c08a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(TUNE.beachX - 15, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 560),
    new THREE.MeshLambertMaterial({ color: 0x1d6f8f, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(TUNE.waterX - 45, 0.05, 0);
  group.add(water);

  // ---- roads: lighter asphalt strips with centre dashes ----
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c84a });
  for (let n = -4; n <= 4; n++) {
    const line = n * PITCH;
    roadLines.push(line);
    for (const vertical of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(9 * PITCH + TUNE.road, TUNE.road), roadMat);
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = vertical ? Math.PI / 2 : 0;
      strip.position.set(vertical ? line : 0, 0.03, vertical ? 0 : line);
      strip.receiveShadow = true;
      group.add(strip);
      // centre dashes
      for (let d = -4 * PITCH; d <= 4 * PITCH; d += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.35), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = vertical ? Math.PI / 2 : 0;
        dash.position.set(vertical ? line : d, 0.04, vertical ? d : line);
        group.add(dash);
      }
    }
  }

  // ---- blocks: buildings, plazas, a park ----
  const wallBases = ['#8a7f74', '#7d8a99', '#a08a6a', '#6a7a6a', '#9a8a7a', '#5f6b7d'];
  const dayTex = wallBases.map((b) => facadeTexture(rng, b, false));
  const litTex = wallBases.map((b) => facadeTexture(rng, b, true));

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = -4; bx <= 3; bx++) {
    for (let bz = -4; bz <= 3; bz++) {
      const cx = (bx + 0.5) * PITCH;
      const cz = (bz + 0.5) * PITCH;
      const district = districtAt(bx, bz);
      const isPark = bx === -2 && bz === 2;
      if (isPark) {
        // Central park: grass, paths, a few palms.
        const grass = new THREE.Mesh(
          new THREE.PlaneGeometry(TUNE.block, TUNE.block),
          new THREE.MeshLambertMaterial({ color: 0x4a7a3d })
        );
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(cx, 0.035, cz);
        grass.receiveShadow = true;
        group.add(grass);
        continue;
      }
      // 1–3 towers per block, heights by district.
      const count = district.name === 'Downtown' ? whole(rng, 2, 3) : whole(rng, 1, 2);
      const spots = [];
      for (let i = 0; i < count; i++) {
        spots.push({
          x: cx + spread(rng, -9, 9),
          z: cz + spread(rng, -9, 9),
          w: spread(rng, 10, 16),
          d: spread(rng, 10, 16),
          h: district.name === 'Downtown' ? spread(rng, 26, 68)
            : district.name === 'Old Town' ? spread(rng, 8, 16)
            : spread(rng, 12, 30),
        });
      }
      for (const s of spots) {
        const ti = whole(rng, 0, wallBases.length - 1);
        const mat = new THREE.MeshLambertMaterial({
          map: dayTex[ti],
          emissiveMap: litTex[ti],
          emissive: new THREE.Color(0xffc978),
          emissiveIntensity: 0,
        });
        windows.push(mat);
        const tower = new THREE.Mesh(boxGeo, mat);
        tower.scale.set(s.w, s.h, s.d);
        tower.position.set(s.x, s.h / 2, s.z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        // Flat roof cap, slightly wider, in the district tint.
        const cap = new THREE.Mesh(
          boxGeo,
          new THREE.MeshLambertMaterial({ color: district.tint })
        );
        cap.scale.set(s.w + 0.6, 0.5, s.d + 0.6);
        cap.position.set(s.x, s.h + 0.25, s.z);
        group.add(cap);
        colliders.push({
          minX: s.x - s.w / 2, maxX: s.x + s.w / 2,
          minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2,
        });
      }
    }
  }

  // ---- palms along the beach front and the park ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  function palm(x, z) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 6), trunkMat);
    trunk.position.y = 3;
    trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 6.2, Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      leaf.castShadow = true;
      p.add(leaf);
    }
    p.position.set(x, 0, z);
    group.add(p);
  }
  for (let z = -200; z <= 200; z += 16) {
    palm(TUNE.beachX + 2, z + spread(rng, -3, 3));
    if (chance(rng, 0.5)) palm(TUNE.beachX + 8, z + 8);
  }
  for (let i = 0; i < 8; i++) palm(-2 * PITCH + spread(rng, -12, 12), 2 * PITCH + spread(rng, -12, 12));

  // ---- street lamps at every other intersection ----
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let n = -4; n <= 4; n += 2) {
    for (let m = -4; m <= 4; m += 2) {
      const x = n * PITCH + 7, z = m * PITCH + 7;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6), poleMat);
      pole.position.set(x, 3.25, z);
      pole.castShadow = true;
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bulbMat.clone());
      bulb.material.color.set(0xffe9a8);
      bulb.position.set(x, 6.6, z);
      group.add(bulb);
      lamps.push({ x, z, bulb });
      colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    }
  }

  // ---- pier jutting into the bay (The Big One ends here) ----
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(60, 1, 8),
    new THREE.MeshLambertMaterial({ color: 0x6a5138 })
  );
  pier.position.set(TUNE.beachX - 30, 0.6, 120);
  pier.castShadow = true;
  group.add(pier);
  colliders.push({ minX: TUNE.beachX - 60, maxX: TUNE.beachX, minZ: 116, maxZ: 124 });

  return {
    group, colliders, lamps, windows, roadLines, water,
    pitch: PITCH,
    // Road centreline nearest to a point, for spawning and AI.
    nearestRoad(x, z) {
      let best = roadLines[0], bd = Infinity;
      for (const l of roadLines) {
        const d = Math.min(Math.abs(x - l), Math.abs(z - l));
        if (d < bd) { bd = d; best = l; }
      }
      return best;
    },
  };
}

// Circle-vs-AABB test used by cars, the player and the police.
// Returns the push-out vector, or null when there is no overlap.
export function resolveCircleAABB(x, z, r, box) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 < 1e-8) return { x: 0, z: -r }; // centre inside the box: shove north
  const d = Math.sqrt(d2);
  const push = (r - d) / d;
  return { x: dx * push, z: dz * push };
}
