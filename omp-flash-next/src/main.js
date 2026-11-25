// NUKE SF — isometric miniature San Francisco, three.js.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import * as G from './geo.js';
import { City } from './city.js';
import { Cars, Boats, Planes } from './agents.js';
import { Clouds, makeWater } from './env.js';
import { NukeControl } from './nuke.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8dded);
scene.fog = new THREE.Fog(0xc8dded, 24000, 56000);

// isometric-ish orthographic camera
let frustum = 6800;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -30000, 90000);
camera.zoom = 1;
camera.position.set(15000, 17000, 15000);
const TARGET = new THREE.Vector3(0, 0, -1200);
camera.lookAt(TARGET);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minZoom = 0.35;
controls.maxZoom = 14;
controls.maxPolarAngle = Math.PI * 0.47;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.left = -frustum * (w / h);
  camera.right = frustum * (w / h);
  camera.top = frustum;
  camera.bottom = -frustum;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// lights: warm sun + sky bounce, no shadows (stylized flat look)
scene.add(new THREE.HemisphereLight(0xd6ebf7, 0x5d7a4f, 1.05));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.9);
sun.position.set(-9000, 13000, -7000);
scene.add(sun);

// world
const city = new City(scene);
const water = makeWater(scene);
const cars = new Cars(scene, city, 900);
const boats = new Boats(scene, 26);
const planes = new Planes(scene);
const clouds = new Clouds(scene, 48);
const nukeCtl = new NukeControl(scene, city);

// ---------------- HUD wiring ----------------
const hudCount = document.getElementById('nukeCount');
const btnNuke = document.getElementById('nukeToggle');
const btnBig = document.getElementById('bigBtn');
const vig = document.getElementById('vig');
let nukeMode = false;

window.onNukeDropped = (n) => { hudCount.textContent = String(n).padStart(2, '0'); };

function setNukeMode(on) {
  nukeMode = on;
  controls.enableRotate = !on;
  document.body.classList.toggle('nuke', on);
  btnNuke.classList.toggle('active', on);
  vig.style.opacity = on ? 1 : 0;
}
btnNuke.addEventListener('click', () => setNukeMode(!nukeMode));
addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') setNukeMode(!nukeMode);
});
btnBig.addEventListener('click', () => {
  const [x, z] = G.ll(37.7945, -122.4000); // Financial District, obviously
  nukeCtl.drop(x, z);
});

// click-to-nuke raycast (suppress drags)
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downX = 0, downY = 0;
canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  if (!nukeMode) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([city.terrain, water.mesh], false);
  if (hits.length) nukeCtl.drop(hits[0].point.x, hits[0].point.z);
});

// ---------------- loop ----------------
const clock = new THREE.Clock();
const jitter = new THREE.Vector3();

resize();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  cars.update(dt);
  boats.update(dt);
  planes.update(dt);
  clouds.update(dt);
  water.mat.uniforms.uTime.value = t;
  nukeCtl.update(dt);

  // camera shake: remove last frame's jitter before controls, add fresh after
  camera.position.sub(jitter);
  controls.update();
  if (nukeCtl.shake > 0) {
    jitter.set(
      (Math.random() - 0.5) * nukeCtl.shake,
      (Math.random() - 0.5) * nukeCtl.shake,
      (Math.random() - 0.5) * nukeCtl.shake
    );
  } else jitter.set(0, 0, 0);
  camera.position.add(jitter);

  renderer.render(scene, camera);
});
