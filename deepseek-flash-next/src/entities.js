// entities.js — traffic, bay ferries, jets over the Gate, drifting clouds & fog.
import * as THREE from 'three';
import { mulberry32, pointInPoly, SF, EASTBAY } from './map.js';
const onStreets = (x, z) => pointInPoly(x, z, SF) || pointInPoly(x, z, EASTBAY);
import { GROUND_Y } from './city.js';

const WATER_Y = 1.48;   // top of animated bay water
const rnd = mulberry32(20260);

// SF street grid orientation (matches the map texture)
const TH = 29 * Math.PI / 180;
const AX = { x: Math.cos(TH), z: Math.sin(TH) };   // along avenues
const PR = { x: -Math.sin(TH), z: Math.cos(TH) };  // across (lane offset)

// ================================================================ cars
export function buildCars(scene, count = 240) {
  const geo = new THREE.BoxGeometry(1.15, .85, 2.3);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const CAR_COLORS = [0xf7d54a, 0xf7d54a, 0xf1f1ee, 0xe8e8e8, 0x2c3e50, 0xb03a2e, 0x2e6da4, 0x9b9b9b, 0xffffff, 0x1e1e1e];

  function pickRoute() {
    for (let tries = 0; tries < 60; tries++) {
      const line = (Math.floor(rnd() * 70) - 35) * 3.2;            // lane offset along PR
      const s0 = rnd() * 240 - 120;                                 // start along AX
      const bx = line * PR.x + AX.x * s0, bz = line * PR.z + AX.z * s0;
      const dir = rnd() < .5 ? 1 : -1;
      const lane = (dir > 0 ? .75 : -.75);
      const px = bx + PR.x * lane, pz = bz + PR.z * lane;
      if (!onStreets(px, pz)) continue;
      // walk forward until we leave land (max 60u)
      let L = 0;
      for (let t = 2; t <= 70; t += 2.3) {
        const qx = px + AX.x * dir * t, qz = pz + AX.z * dir * t;
        if (!onStreets(qx, qz)) break;
        L = t;
      }
      if (L > 8) return { px, pz, dir, L, t: rnd() * L };
    }
    return null;
  }

  const cars = [];
  for (let i = 0; i < count; i++) {
    let r = pickRoute();
    while (!r) r = pickRoute();
    cars.push({ ...r, speed: .9 + rnd() * 1.4, dead: false, popT: 0, upY: 0, spin: 0 });
    mesh.setColorAt(i, col.setHex(CAR_COLORS[(rnd() * CAR_COLORS.length) | 0]));
  }
  mesh.instanceColor.needsUpdate = true;

  function write(i, c) {
    const yaw = Math.atan2(AX.z * c.dir, AX.x * c.dir);
    dummy.position.set(c.px + AX.x * c.dir * c.t, GROUND_Y + .45 + (c.upY || 0), c.pz + AX.z * c.dir * c.t);
    dummy.rotation.set(c.spin * .7, -yaw, c.dead ? c.spin : 0);
    dummy.scale.setScalar(c.dead ? Math.max(0.01, 1 - c.popT * 1.6) : 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  cars.forEach(write);
  mesh.instanceMatrix.needsUpdate = true;

  function update(dt) {
    let dirty = false;
    for (let i = 0; i < count; i++) {
      const c = cars[i];
      if (c.dead) {
        if (c.popT < 1) { c.popT += dt * 1.4; c.upY += dt * 9 * (1 - c.popT); c.spin += dt * 9; dirty = true; write(i, c); }
        continue;
      }
      c.t += c.speed * dt;
      if (c.t > c.L) { const r = pickRoute(); if (r) Object.assign(c, r); else c.t = 0; }
      write(i, c); dirty = true;
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }

  function killNear(x, z, R) {
    for (let i = 0; i < count; i++) {
      const c = cars[i]; if (c.dead) continue;
      const cx = c.px + AX.x * c.dir * c.t, cz = c.pz + AX.z * c.dir * c.t;
      if ((cx - x) ** 2 + (cz - z) ** 2 < R * R) { c.dead = true; c.popT = 0; }
    }
  }
  return { update, killNear };
}

// ================================================================ boats
const BOAT_HULLS = [0xf4f1e8, 0xf4f1e8, 0xd9563f, 0x2c6e9e, 0xe8e4d8, 0x3f8f5f];
export function buildBoats(scene, count = 12) {
  const group = new THREE.Group(); scene.add(group);

  // waypoint hubs around the bay
  const HUBS = [
    [56,-44],[58,-30],[56,-14],[60,2],      // Embarcadero piers
    [92,-24],[108,-12],[118,-6],            // toward Bay Bridge / Oakland
    [14,-70],[-14,-84],[-40,-78],           // north through the Gate
    [-70,-60],[-88,-52],                    // off Cliff House (ocean)
    [30,26],[60,40]                         // south bay
  ];
  const wakeGeo = new THREE.PlaneGeometry(1, 1);
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xdff2fb, transparent: true, opacity: .38, depthWrite: false });

  const boats = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const hullC = BOAT_HULLS[(rnd() * BOAT_HULLS.length) | 0];
    const scale = .7 + rnd() * .9;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, .85, 1.5), new THREE.MeshLambertMaterial({ color: hullC }));
    hull.position.y = .45; hull.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, .9, 1.1), new THREE.MeshLambertMaterial({ color: 0xf7f5ee }));
    cab.position.set(-.2, 1.3, 0); cab.castShadow = true;
    const wake = new THREE.Mesh(wakeGeo, wakeMat);
    wake.rotation.x = -Math.PI / 2; wake.scale.set(9 * scale, 1.6 * scale, 1);
    wake.position.set(-5.4 * scale, .06, 0);
    g.add(hull, cab, wake);
    g.scale.setScalar(scale);

    let hA = (rnd() * HUBS.length) | 0, hB = (hA + 1 + ((rnd() * (HUBS.length - 1)) | 0)) % HUBS.length;
    const start = HUBS[hA];
    g.position.set(start[0] + rnd() * 8 - 4, WATER_Y, start[1] + rnd() * 8 - 4);
    group.add(g);
    boats.push({ g, hA, hB, speed: 3.4 + rnd() * 3.2, phase: rnd() * 7, dead: false, sinkT: 0 });
  }

  function update(dt, t) {
    for (const b of boats) {
      if (b.dead) {
        if (b.sinkT < 1) { b.sinkT += dt * .5; b.g.position.y = WATER_Y - b.sinkT * 1.4; b.g.rotation.z = b.sinkT * 2.6; }
        continue;
      }
      const tgt = HUBS[b.hB];
      const dx = tgt[0] - b.g.position.x, dz = tgt[1] - b.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) { b.hA = b.hB; let n; do { n = (rnd() * HUBS.length) | 0; } while (n === b.hB); b.hB = n; }
      else {
        const vx = dx / d, vz = dz / d;
        b.g.position.x += vx * b.speed * dt;
        b.g.position.z += vz * b.speed * dt;
        const want = -Math.atan2(vz, vx);
        let df = want - b.g.rotation.y;
        while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
        b.g.rotation.y += df * Math.min(1, dt * 2.2);
      }
      b.g.position.y = WATER_Y + Math.sin(t * 2 + b.phase) * .09;
      b.g.rotation.x = Math.sin(t * 1.6 + b.phase) * .035;
    }
  }

  function killNear(x, z, R) {
    for (const b of boats) {
      if (!b.dead && (b.g.position.x - x) ** 2 + (b.g.position.z - z) ** 2 < R * R) b.dead = true;
    }
  }
  return { update, killNear };
}

// ================================================================ planes
export function buildPlanes(scene) {
  const group = new THREE.Group(); scene.add(group);
  const white = new THREE.MeshLambertMaterial({ color: 0xf5f6f8 });
  const red = new THREE.MeshLambertMaterial({ color: 0xd94f3d });

  function mkPlane() {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(.55, .42, 7.5, 8), white);
    fus.rotation.z = Math.PI / 2; fus.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.55, 1.6, 8), red);
    nose.rotation.z = -Math.PI / 2; nose.position.x = 4.3;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, .18, 10.5), white); wing.castShadow = true;
    const tailV = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2, .16), red); tailV.position.set(-3.4, 1, 0);
    const tailH = new THREE.Mesh(new THREE.BoxGeometry(1.5, .14, 3.4), white); tailH.position.set(-3.4, .2, 0);
    g.add(fus, nose, wing, tailV, tailH);
    return g;
  }

  const jets = [];
  const orbits = [
    { cx: 10, cz: -60, r: 130, y: 78, s: 15, a: rnd() * 7 },
    { cx: 40, cz: -20, r: 165, y: 96, s: -12, a: rnd() * 7 },
    { cx: -30, cz: -110, r: 95, y: 64, s: 18, a: rnd() * 7 }
  ];
  for (const o of orbits) { const p = mkPlane(); group.add(p); jets.push({ p, o }); }

  function update(dt) {
    for (const j of jets) {
      j.o.a += (j.o.s / j.o.r) * dt;
      const x = j.o.cx + Math.cos(j.o.a) * j.o.r, z = j.o.cz + Math.sin(j.o.a) * j.o.r;
      const nx = -Math.sin(j.o.a) * Math.sign(j.o.s), nz = Math.cos(j.o.a) * Math.sign(j.o.s);
      j.p.position.set(x, j.o.y, z);
      j.p.rotation.y = -Math.atan2(nz, nx);
      j.p.rotation.z = .28 * Math.sign(j.o.s);   // bank into the turn
    }
  }
  return { update };
}

// ================================================================ clouds + fog
export function buildClouds(scene) {
  const group = new THREE.Group(); scene.add(group);
  const mat = new THREE.MeshLambertMaterial({ color: 0xf6fafc, transparent: true, opacity: .92, depthWrite: false });
  const clouds = [];
  for (let i = 0; i < 15; i++) {
    const g = new THREE.Group();
    const puffs = 4 + ((rnd() * 5) | 0);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 6), mat);
      m.position.set((rnd() - .5) * 26, (rnd() - .5) * 4, (rnd() - .5) * 14);
      m.scale.set(7 + rnd() * 9, 3.4 + rnd() * 2.6, 5 + rnd() * 5);
      g.add(m);
    }
    g.traverse(o => { o.castShadow = false; });
    g.position.set(rnd() * 640 - 320, 85 + rnd() * 55, rnd() * 560 - 280);
    group.add(g);
    clouds.push({ g, speed: .9 + rnd() * 1.3 });
  }

  // Karl-the-Fog banks creeping through the Golden Gate (soft radial puffs)
  const fogTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,255,255,.9)');
    rg.addColorStop(.6, 'rgba(255,255,255,.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const fogMat = new THREE.MeshBasicMaterial({ map: fogTex, color: 0xf3f8fa, transparent: true, opacity: .34, depthWrite: false });
  const fogs = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(95, 70), fogMat.clone());
    f.rotation.x = -Math.PI / 2;
    f.position.set(-58 + rnd() * 30, 6 + rnd() * 5, -68 + i * 16);
    group.add(f); fogs.push({ f, ph: rnd() * 7 });
  }

  function update(dt, t) {
    for (const c of clouds) {
      c.g.position.x += c.speed * dt;
      if (c.g.position.x > 360) { c.g.position.x = -360; c.g.position.z = rnd() * 560 - 280; }
    }
    for (const fg of fogs) {
      const s = Math.sin(t * .12 + fg.ph);
      fg.f.position.x = -40 + s * 34;             // in and out of the Gate
      fg.f.material.opacity = .18 + Math.max(0, s) * .2;
    }
  }
  return { update };
}
