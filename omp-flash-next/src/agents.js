// Moving agents: cars (instanced), boats with wakes, planes on SFO approach.
import * as THREE from 'three';
import * as G from './geo.js';

// ---------------- shared canvas textures ----------------
export function makePuffTexture(soft = 0.4) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(soft, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ---------------- cars ----------------
const CAR_COLORS = [0xdddddd, 0x333333, 0x9aa0a6, 0xc0392b, 0x2e4a7a, 0xe8e4d8, 0x555a5e, 0xbfae8e];

export class Cars {
  constructor(scene, city, count = 900) {
    // pick road segments weighted by length
    const roads = city.roads.filter((r) => Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) > 250);
    const ya = [], yb = [];
    for (const r of roads) { ya.push(city.groundY(...r.a)); yb.push(city.groundY(...r.b)); }
    const totalLen = roads.reduce((s, r) => s + Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), 0);

    this.items = [];
    for (let i = 0; i < count; i++) {
      let pick = Math.random() * totalLen, ri = 0, acc = 0;
      for (; ri < roads.length; ri++) {
        acc += Math.hypot(roads[ri].b[0] - roads[ri].a[0], roads[ri].b[1] - roads[ri].a[1]);
        if (acc >= pick) break;
      }
      const r = roads[Math.min(ri, roads.length - 1)];
      this.items.push({
        road: r,
        ya: ya[Math.min(ri, roads.length - 1)], yb: yb[Math.min(ri, roads.length - 1)],
        t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1,
        speed: (9 + Math.random() * 8), // m/s
      });
    }

    const geo = new THREE.BoxGeometry(7, 5, 16); // diorama-scale so traffic reads from orbit
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
    this.mesh.frustumCulled = false; // instances span the whole bay; geometry sphere is a single box
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) { col.set(CAR_COLORS[i % CAR_COLORS.length]); this.mesh.setColorAt(i, col); }
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }

  update(dt) {
    const d = this.dummy;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      const [ax, az] = c.road.a, [bx, bz] = c.road.b;
      const len = Math.hypot(bx - ax, bz - az);
      c.t += (c.dir * c.speed * dt) / len;
      if (c.t > 1 || c.t < 0) { c.dir *= -1; c.t = THREE.MathUtils.clamp(c.t, 0, 1); }
      // lane offset perpendicular to travel
      const dx = (bx - ax) * c.dir, dz = (bz - az) * c.dir;
      const L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * 4.5, nz = (dx / L) * 4.5;
      const x = ax + (bx - ax) * c.t + nx, z = az + (bz - az) * c.t + nz;
      d.position.set(x, c.ya + (c.yb - c.ya) * c.t + 2.8, z);
      d.rotation.set(0, Math.atan2(-dz, dx) + Math.PI / 2, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- boats ----------------
export class Boats {
  constructor(scene, count = 26) {
    this.scene = scene;
    // waypoint pool: random water points in the bay + ocean near gate
    this.waypoints = [];
    let guard = 0;
    while (this.waypoints.length < 40 && guard++ < 4000) {
      const x = (Math.random() - 0.5) * 26000, z = (Math.random() - 0.5) * 22000;
      if (!G.isWater(x, z)) continue;
      const dCity = Math.hypot(x, z);
      if (dCity < 1800 && x > -1500) continue; // don't hug shoreline buildings
      this.waypoints.push([x, z]);
    }
    // named spots: Ferry Building waterfront, Oakland pier, Alameda
    const [fx, fz] = G.ll(37.794, -122.386); this.waypoints.push([fx, fz]);
    const [ox, oz] = G.ll(37.797, -122.256); this.waypoints.push([ox, oz]);
    const [ax, az] = G.ll(37.780, -122.290); this.waypoints.push([ax, az]);

    const puff = makePuffTexture(0.15);
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
    const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x39485a });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xb03a2e });
    this.boats = [];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const big = Math.random() < 0.3;
      const s = big ? 1.8 : 1;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(6 * s, 3 * s, 22 * s), Math.random() < 0.5 ? hullMat : Math.random() < 0.7 ? hullMat2 : redMat);
      g.add(hull);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(4.5 * s, 3.5 * s, 9 * s), hullMat);
      cab.position.y = 3.2 * s;
      g.add(cab);
      if (big) {
        const cab2 = new THREE.Mesh(new THREE.BoxGeometry(3.6 * s, 3 * s, 5 * s), hullMat);
        cab2.position.set(0, 6 * s, -1 * s);
        g.add(cab2);
      }
      // wake: additive quad trailing behind
      const wake = new THREE.Mesh(
        new THREE.PlaneGeometry(9 * s, 90 * s).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: puff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      wake.position.set(0, 0.4, 55 * s);
      g.add(wake);
      scene.add(g);

      const w0 = this.waypoints[(Math.random() * this.waypoints.length) | 0];
      let w1 = w0;
      while (w1 === w0) w1 = this.waypoints[(Math.random() * this.waypoints.length) | 0];
      this.boats.push({ g, a: w0, b: w1, t: Math.random(), speed: 5 + Math.random() * 6, s });
    }
  }

  update(dt) {
    for (const b of this.boats) {
      const [ax, az] = b.a, [bx, bz] = b.b;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      b.t += (b.speed * dt) / len;
      if (b.t >= 1) {
        b.a = b.b;
        let w = b.a;
        while (w === b.a) w = this.waypoints[(Math.random() * this.waypoints.length) | 0];
        b.b = w; b.t = 0;
      }
      const x = ax + (bx - ax) * b.t, z = az + (bz - az) * b.t;
      b.g.position.set(x, 1.5, z);
      b.g.rotation.y = Math.atan2(-(bz - az), bx - ax) - Math.PI / 2;
      b.g.rotation.z = Math.sin(performance.now() * 0.001 + x) * 0.03;
    }
  }
}

// ---------------- planes ----------------
function makePlaneMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f0 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x2e4a7a });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 38, 8).rotateX(Math.PI / 2), bodyMat);
  g.add(fus);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 7), trimMat);
  wing.position.set(0, -0.5, 2);
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 4), trimMat);
  tail.position.set(0, 0, -16);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 7, 6), trimMat);
  fin.position.set(0, 3.5, -16);
  g.add(fin);
  // engines
  for (const sx of [-9, 9]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 6).rotateX(Math.PI / 2), trimMat);
    eng.position.set(sx, -1.8, 3);
    g.add(eng);
  }
  return g;
}

export class Planes {
  constructor(scene) {
    this.scene = scene;
    // approach line: extended runway centerline (RUNWAYS[0]) toward the ocean/north
    const [ax, az] = G.ll(...G.RUNWAYS[0].slice(0, 2));
    const [bx, bz] = G.ll(...G.RUNWAYS[0].slice(2));
    this.rwA = [ax, az]; this.rwB = [bx, bz];
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    this.dirv = [dx / L, dz / L];
    this.approachLen = 14000;
    // holding pattern center over the ocean NW of the gate
    this.hold = G.ll(37.86, -122.62);

    this.planes = [];
    for (let i = 0; i < 7; i++) {
      const m = makePlaneMesh();
      scene.add(m);
      const p = { m, state: 'arrive', t: Math.random() * 1.4 };
      this._reset(p, true);
      this.planes.push(p);
    }
  }

  _pointOnApproach(t) {
    // t in [0,1]: 0 = far threshold start, 1 = touchdown at rwA end extended... runway A->B direction
    const [dxv, dzv] = this.dirv;
    const startX = this.rwA[0] - dxv * this.approachLen, startZ = this.rwA[1] - dzv * this.approachLen;
    return [startX + (this.rwA[0] - startX) * t, startZ + (this.rwA[1] - startZ) * t];
  }

  _reset(p, initial = false) {
    const roll = Math.random();
    if (roll < 0.6) { p.state = 'arrive'; p.t = initial ? Math.random() : 0; p.altMax = 1400 + Math.random() * 500; }
    else if (roll < 0.85) { p.state = 'hold'; p.t = Math.random(); p.holdR = 900 + Math.random() * 500; p.holdAlt = 1600 + Math.random() * 800; }
    else { p.state = 'depart'; p.t = initial ? Math.random() : 0; }
    p.speedJitter = 0.9 + Math.random() * 0.35;
  }

  update(dt) {
    for (const p of this.planes) {
      const m = p.m;
      if (p.state === 'arrive') {
        p.t += dt / (26 * p.speedJitter);
        const t = Math.min(p.t, 1);
        const [x, z] = this._pointOnApproach(t);
        m.position.set(x, Math.max(2, p.altMax * (1 - t * t)) , z);
        const [dxv, dzv] = this.dirv;
        m.rotation.set(0, Math.atan2(-dzv, dxv) + Math.PI / 2, 0);
        m.rotation.x = 0.14; // slight nose-down
        if (p.t >= 1) { p.state = 'roll'; p.rt = 0; }
      } else if (p.state === 'roll') {
        p.rt += dt / 9;
        const [ax, az] = this.rwA, [bx, bz] = this.rwB;
        const t = Math.min(p.rt, 1);
        m.position.set(ax + (bx - ax) * t, 2.5, az + (bz - az) * t);
        const dxv = bx - ax, dzv = bz - az;
        m.rotation.set(0, Math.atan2(-dzv, dxv) + Math.PI / 2, 0);
        if (p.rt >= 1) this._reset(p);
      } else if (p.state === 'hold') {
        p.t += dt / 55;
        const r = p.holdR;
        m.position.set(this.hold[0] + Math.cos(p.t * Math.PI * 2) * r, p.holdAlt, this.hold[1] + Math.sin(p.t * Math.PI * 2) * r);
        m.rotation.set(0, -p.t * Math.PI * 2 + Math.PI / 2, 0.35);
      } else if (p.state === 'depart') {
        p.t += dt / (16 * p.speedJitter);
        const t = Math.min(p.t, 1);
        const [ax, az] = this.rwA, [bx, bz] = this.rwB;
        // take off from B toward A extended past the runway to the SE inland? fly back over bay: reverse dir
        const dxv = ax - bx, dzv = az - bz;
        const L = Math.hypot(dxv, dzv);
        const ex = bx + (dxv / L) * this.approachLen * 0.8, ez = bz + (dzv / L) * this.approachLen * 0.8;
        // path: runway B->A then climb out beyond A in same direction
        if (t < 0.35) {
          const k = t / 0.35;
          m.position.set(bx + dxv * k, 2.5, bz + dzv * k);
        } else {
          const k = (t - 0.35) / 0.65;
          const px = ax + (dxv / L) * this.approachLen * 0.8 * k, pz = az + (dzv / L) * this.approachLen * 0.8 * k;
          m.position.set(px, 2.5 + k * 1200, pz);
        }
        m.rotation.set(0, Math.atan2(-dzv, dxv) + Math.PI / 2, 0);
        m.rotation.x = -0.18;
        if (p.t >= 1) this._reset(p);
      }
    }
  }
}
