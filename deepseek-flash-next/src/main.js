// main.js — scene, isometric camera, targeting, HUD wiring, render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildCity, GROUND_Y } from './city.js';
import { buildCars, buildBoats, buildPlanes, buildClouds } from './entities.js';
import { NukeSystem, BoomAudio } from './nukes.js';

// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd4e4ec, 950, 2800);

// ---------------------------------------------------------------- sky dome
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x6db8e8) }, bot: { value: new THREE.Color(0xeaf4f8) } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top,bot;
      void main(){ float h = clamp(vP.y/900., 0., 1.); gl_FragColor = vec4(mix(bot,top,pow(h,.62)),1.); }`
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat));
}

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xbfd9ea, 0x8a7f6a, .42);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4bc, .88);
sun.position.set(-320, 420, -170);           // low golden-hour sun from the ocean
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -300; sun.shadow.camera.right = 300;
sun.shadow.camera.top = 300; sun.shadow.camera.bottom = -300;
sun.shadow.camera.near = 100; sun.shadow.camera.far = 1400;
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 1.2;
scene.add(sun);

// ---------------------------------------------------------------- camera (isometric-ish)
const FRUSTUM = 320;
let aspect = innerWidth / innerHeight;
const camera = new THREE.OrthographicCamera(-FRUSTUM * aspect / 2, FRUSTUM * aspect / 2, FRUSTUM / 2, -FRUSTUM / 2, 1, 4000);
camera.position.set(360, 330, 360);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-10, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.maxPolarAngle = 1.34;
controls.minZoom = .55; controls.maxZoom = 9;
controls.zoomSpeed = .9;

// ---------------------------------------------------------------- world
const city = buildCity(scene);
const cars = buildCars(scene, 260);
const boats = buildBoats(scene, 12);
const planes = buildPlanes(scene);
const clouds = buildClouds(scene);
const audio = new BoomAudio();

// ---------------------------------------------------------------- nukes
const TOASTS = ['BOOM', 'GONE IN 60 SECONDS', 'TOTALLY FINE', 'REDEVELOPMENT!',
  'SPECK IN THE PAN', 'FEDERAL HOLIDAY', 'BYE BAY AREA', 'HUGE WIN FOR SF',
  'URBAN RENEWAL MAXIMALIST', '127 FEET? NO. HUGE.'];
let toastI = 0;

const nukes = new NukeSystem(scene, { city, cars, boats, audio });

// ---------------------------------------------------------------- targeting reticle
const reticle = new THREE.Group();
{
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3b21, transparent: true, opacity: .95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.965, 1, 64), ringMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff3b21, transparent: true, opacity: .07, depthWrite: false }));
  const cross = new THREE.Mesh(new THREE.RingGeometry(.02, .16, 4), ringMat.clone());
  reticle.add(ring, disc, cross);
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  scene.add(reticle);
}

// ---------------------------------------------------------------- HUD state
let armed = false;
let yieldR = 90;
const $ = id => document.getElementById(id);
const nNukes = $('nNukes'), nBldgs = $('nBldgs'), nRadius = $('nRadius');
const toastEl = $('toast'), flashEl = $('flash');

function setArmed(v) {
  armed = v;
  const b = $('nukeBtn');
  b.textContent = armed ? '☠ PICK A TARGET…' : '☢ ARM NUKE';
  b.classList.toggle('armed', armed);
  renderer.domElement.style.cursor = armed ? 'crosshair' : 'grab';
  if (!v) reticle.visible = false;
  nRadius.textContent = v ? `⌀ ${(yieldR / 5).toFixed(0)} km` : '—';
}

document.querySelectorAll('.yield').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.yield').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  yieldR = +btn.dataset.r;
  if (armed) nRadius.textContent = `⌀ ${(yieldR / 5).toFixed(0)} km`;
}));
$('nukeBtn').addEventListener('click', () => { audio.resume(); setArmed(!armed); });
$('muteBtn').addEventListener('click', () => {
  audio.muted = !audio.muted;
  $('muteBtn').textContent = audio.muted ? '🔇 sound off' : '🔊 sound on';
});
addEventListener('keydown', e => {
  if (e.key === 'n' || e.key === 'N') setArmed(!armed);
  if (e.key === 'Escape') setArmed(false);
});

// intro
$('intro').addEventListener('click', () => {
  $('intro').classList.add('hidden');
  audio.resume();
}, { once: true });

// ---------------------------------------------------------------- click-to-nuke
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
const ndc = new THREE.Vector2();
let downAt = null;

function pick(ev) {
  ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
}

renderer.domElement.addEventListener('pointerdown', ev => { downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointermove', ev => {
  if (!armed) return;
  const p = pick(ev);
  if (p) { reticle.visible = true; reticle.position.set(p.x, GROUND_Y + .25, p.z); }
});
renderer.domElement.addEventListener('pointerup', ev => {
  if (!armed || !downAt) return;
  const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
  const quick = performance.now() - downAt.t < 500;
  downAt = null;
  if (moved > 7 || !quick) return;         // that was an orbit drag
  const p = pick(ev);
  if (!p) return;
  const n = nukes.fire(p.x, p.z, yieldR);
  nNukes.textContent = n;
  toastEl.textContent = TOASTS[(toastI++) % TOASTS.length];
  toastEl.style.opacity = 1;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.style.opacity = 0, 1700);
});

// flash hook: nukes module sets shakeAmp; we mirror a DOM flash from it
let flashV = 0;
const _origFire = nukes.fire.bind(nukes);
nukes.fire = (x, z, r) => {                 // wrap to know power at drop time
  setTimeout(() => { flashV = Math.max(flashV, .45 + r / 240); }, 1380);
  return _origFire(x, z, r);
};

window.__game = { camera, controls, scene, nukes, city };

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(.05, clock.getDelta());
  const t = clock.elapsedTime;

  controls.update();
  city.update(dt);
  cars.update(dt);
  boats.update(dt, t);
  planes.update(dt);
  clouds.update(dt, t);
  nukes.update(dt, t);

  if (reticle.visible) {
    const s = yieldR * (1 + Math.sin(t * 5) * .016);
    reticle.scale.setScalar(s);
  }

  // camera shake (applied after controls recompute position)
  if (nukes.shakeAmp > .25) {
    const a = nukes.shakeAmp;
    camera.position.x += (Math.random() - .5) * a;
    camera.position.y += (Math.random() - .5) * a;
    camera.position.z += (Math.random() - .5) * a;
  }

  // white flash decay
  if (flashV > .001) { flashV *= Math.exp(-dt * 3.4); flashEl.style.opacity = flashV.toFixed(3); }
  else if (flashEl.style.opacity !== '0') flashEl.style.opacity = '0';

  nBldgs.textContent = city.stats.leveled;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

addEventListener('resize', () => {
  aspect = innerWidth / innerHeight;
  camera.left = -FRUSTUM * aspect / 2; camera.right = FRUSTUM * aspect / 2;
  camera.top = FRUSTUM / 2; camera.bottom = -FRUSTUM / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
