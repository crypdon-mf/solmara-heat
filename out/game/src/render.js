// The three.js renderer and the third-person camera. The camera chases the
// player (or the car they are driving) from behind and above, smoothed so it
// never snaps, and the mouse drag orbits it around the player on foot. Sky
// is a big gradient dome, fog softens the far blocks, and the sun is a warm
// directional light — no shadow maps, the cars and people carry blob shadows.
import * as THREE from 'three';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_STORY = 'story';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 180, 520);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd8ee, 0.9));
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5d, 0.5);
  scene.add(hemi);

  // Sky dome: a big sphere painted with a vertical gradient, backside only.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const sctx = skyCanvas.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f6fb8');
  grad.addColorStop(0.55, '#87bfe8');
  grad.addColorStop(0.8, '#f5d9a0');
  grad.addColorStop(1, '#f5c98a');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // A few flat white clouds drifting slowly overhead.
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(14 + (i % 4) * 5, 8, 6), cloudMat);
    cloud.scale.y = 0.35;
    cloud.position.set(-300 + i * 65, 120 + (i % 3) * 18, -260 + ((i * 97) % 480));
    scene.add(cloud);
    clouds.push(cloud);
  }

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(0, 14, 24);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const camPos = new THREE.Vector3(0, 14, 24);
  const camTarget = new THREE.Vector3(0, 1, 0);

  // Follow `focus` (a {x,z,heading}) from behind; `orbitYaw`/`orbitPitch`
  // let the mouse swing the camera around an on-foot player.
  function updateCamera(focus, orbitYaw, orbitPitch, driving, dt, time) {
    const dist = driving ? 13.5 : 10.5;
    const height = driving ? 5.2 : 4.2;
    const yaw = orbitYaw !== null && orbitYaw !== undefined ? orbitYaw : focus.heading + Math.PI;
    const px = focus.x + Math.sin(yaw) * dist;
    const pz = focus.z + Math.cos(yaw) * dist;
    const py = height + (orbitPitch || 0) * 4;
    const smooth = 1 - Math.exp(-dt * (driving ? 5 : 8));
    camPos.x += (px - camPos.x) * smooth;
    camPos.y += (py - camPos.y) * smooth;
    camPos.z += (pz - camPos.z) * smooth;
    camTarget.x += (focus.x - camTarget.x) * smooth;
    camTarget.y += (1.6 - camTarget.y) * smooth;
    camTarget.z += (focus.z - camTarget.z) * smooth;
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 340) cloud.position.x = -340;
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, updateCamera, render };
}
