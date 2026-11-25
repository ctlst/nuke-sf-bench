// City generation: terrain, coastline sand, parks, roads, bridges, airport,
// and instanced buildings with per-instance destruction.
import * as THREE from 'three';
import * as G from './geo.js';
// all land sits LB meters above the water plane so flat ground never z-fights with it
const LB = 8;
export class City {
  constructor(scene) {
    this.scene = scene;
    this.roads = [];          // [{a:[x,z], b:[x,z]}] for cars
    this.buildings = [];      // {x,z,w,d,h,kind}
    this.destroyedMask = null; // Uint8Array over building instances per kind
    this._buildTerrain();
    this._buildParks();
    this._buildAirport();
    this._buildBridges();
    this._generateCity();
  }

  // ---------------- terrain ----------------
  _terrainMesh() {
    const size = 52000, seg = 400;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x6f9d5c);
    const cDry = new THREE.Color(0x8a9157);
    const cUrban = new THREE.Color(0x9a9a94);
    const tmp = new THREE.Color();
    const cWater = new THREE.Color(0x2a6f97);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const water = G.isWater(x, z);
      const h = G.terrainH(x, z) * 2.2;
      pos.setY(i, water ? -6 : LB + Math.max(0, h));
      if (water) { tmp.copy(cWater); }
      else {
        const d = Math.hypot(x, z);
        const urban = THREE.MathUtils.smoothstep(1 - d / 11000, 0, 1);
        tmp.copy(cGrass).lerp(cUrban, Math.min(0.85, urban * 0.9));
        tmp.lerp(cDry, THREE.MathUtils.clamp(h / 90, 0, 1) * 0.6);
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  _buildTerrain() {
    this._terrainMesh();
    // sand/urban fringe ring along coastline (visual water-land blend)
    const pts = [];
    const step = 90;
    for (const poly of G.LAND) {
      for (let i = 0; i < poly.length; i++) {
        const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.round(len / step));
        for (let s = 0; s < n; s++) {
          const t = s / n;
          pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
        }
      }
    }
    // keep only points adjacent to water on one side and land on the other
    const ringGeo = new THREE.BufferGeometry();
    const verts = [];
    for (const [x, z] of pts) {
      if (!G.isWater(x, z)) continue;
      // sample inward: find land nearby -> place sand quad at water edge
      let gx = 0, gz = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (!G.isWater(x + Math.cos(ang) * 160, z + Math.sin(ang) * 160)) { gx += Math.cos(ang); gz += Math.sin(ang); }
      }
      const L = Math.hypot(gx, gz);
      if (L === 0) continue;
      gx /= L; gz /= L;
      const y = 3;
      // sand apron straddling the shoreline: visible on the water side, tucked under the land lip
      const px = x - gx * 50, pz = z - gz * 50;
      const nx2 = -gz, nz2 = gx;
      const w = 90;
      verts.push(px + nx2 * w, y, pz + nz2 * w, px - nx2 * w, y, pz - nz2 * w, px + gx * 180, y, pz + gz * 180);
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    const sand = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xcfc39a, side: THREE.DoubleSide }));
    this.scene.add(sand);
  }

  // ---------------- parks / airport / bridges ----------------
  _buildParks() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5d8f4c });
    for (const r of G.PARKS) {
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set((r.x0 + r.x1) / 2, G.terrainH((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) * 2.2 + LB + 1.5, (r.z0 + r.z1) / 2);
      this.scene.add(m);
    }
    // Presidio green
    const shape = new THREE.Shape();
    G.PRESIDIO.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const pg = new THREE.ShapeGeometry(shape);
    pg.rotateX(Math.PI / 2);
    const pm = new THREE.Mesh(pg, mat);
    pm.position.y = LB + 3;
    this.scene.add(pm);
    // dolores park
    const [dx, dz] = G.ll(37.7596, -122.4269);
    const dg = new THREE.PlaneGeometry(560, 360); dg.rotateX(-Math.PI / 2);
    const dm = new THREE.Mesh(dg, mat);
    dm.position.set(dx, G.terrainH(dx, dz) * 2.2 + LB + 1.5, dz);
    this.scene.add(dm);
  }

  _buildAirport() {
    const A = G.AIRPORT;
    const w = A.x1 - A.x0, d = A.z1 - A.z0;
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x6b6f73 })
    );
    apron.position.set(A.cx, G.terrainH(A.cx, A.cz) * 2.2 + LB + 1, A.cz);
    this.scene.add(apron);
    // runways as thin light strips
    const rwMat = new THREE.MeshBasicMaterial({ color: 0x3c4045 });
    for (const [la1, lo1, la2, lo2] of G.RUNWAYS) {
      const [ax, az] = G.ll(la1, lo1), [bx, bz] = G.ll(la2, lo2);
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      const rw = new THREE.Mesh(new THREE.PlaneGeometry(len, 46).rotateX(-Math.PI / 2), rwMat);
      rw.position.set((ax + bx) / 2, apron.position.y + 0.8, (az + bz) / 2);
      rw.rotation.y = -ang;
      this.scene.add(rw);
    }
    // terminal blobs
    const tMat = new THREE.MeshLambertMaterial({ color: 0xb9bcc0 });
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(260, 26, 110), tMat);
      t.position.set(A.x0 + w * (0.28 + i * 0.15), apron.position.y + 14, A.z0 + d * 0.32);
      this.scene.add(t);
    }
  }

  _bridge(a, b, y0 = null) {
    const [ax, az] = a, [bx, bz] = b;
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const g = new THREE.Group();
    const deckMat = new THREE.MeshLambertMaterial({ color: 0xb8b3a6 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 5, 26), deckMat);
    deck.position.set((ax + bx) / 2, 16, (az + bz) / 2);
    deck.rotation.y = -ang;
    g.add(deck);
    // towers
    const towMat = new THREE.MeshLambertMaterial({ color: 0xc9463c });
    for (const t of [0.28, 0.72]) {
      const tx = ax + (bx - ax) * t, tz = az + (bz - az) * t;
      const tow = new THREE.Mesh(new THREE.BoxGeometry(14, 90, 14), towMat);
      tow.position.set(tx, 45, tz);
      g.add(tow);
    }
    // piers
    for (let s = 0.08; s < 1; s += 0.12) {
      const px = ax + (bx - ax) * s, pz = az + (bz - az) * s;
      const p = new THREE.Mesh(new THREE.BoxGeometry(8, 20, 8), deckMat);
      p.position.set(px, 6, pz);
      g.add(p);
    }
    this.scene.add(g);
  }

  _buildBridges() {
    const GG = G.GOLDEN_GATE;
    this._bridge(GG.a, GG.b);
    const BB = G.BAY_BRIDGE;
    this._bridge(BB.a, BB.m);
    this._bridge(BB.m, BB.b);
  }

  // ---------------- city blocks ----------------
  _generateCity() {
    const roadSegs = [];
    const byKind = { tower: [], flat: [], box: [] };

    for (const d of G.DISTRICTS) {
      const [cx, cz] = d.cx;
      const cos = Math.cos(d.rot), sin = Math.sin(d.rot);
      const half = d.size / 2;
      const sp = d.spacing;
      const n = Math.floor(half / sp);

      // road lines along local U and V, clipped to land
      for (let i = -n; i <= n; i++) {
        roadSegs.push(...this._clipLine(
          cx + cos * (-half) - sin * i * sp, cz + sin * (-half) + cos * i * sp,
          cx + cos * half - sin * i * sp, cz + sin * half + cos * i * sp, 140));
        roadSegs.push(...this._clipLine(
          cx + cos * i * sp - sin * (-half), cz + sin * i * sp + cos * (-half),
          cx + cos * i * sp + sin * half, cz + sin * i * sp + cos * half, 140));
      }

      // buildings in block cells
      for (let iu = -n; iu < n; iu++) {
        for (let iv = -n; iv < n; iv++) {
          const lu = (iu + 0.5) * sp, lv = (iv + 0.5) * sp;
          const bx = cx + cos * lu - sin * lv;
          const bz = cz + sin * lu + cos * lv;
          if (G.isWater(bx, bz) || G.isPark(bx, bz)) continue;
          if (Math.random() > d.prob) continue;
          // keep off Market Street corridor
          if (distToSeg(bx, bz, G.MARKET.a[0], G.MARKET.a[1], G.MARKET.b[0], G.MARKET.b[1]) < 60) continue;
          let h = d.h(bx, bz);
          h *= 0.75 + Math.random() * 0.85;
          if (h < 6) h = 6;
          const w = sp * (0.42 + Math.random() * 0.16);
          const dep = sp * (0.42 + Math.random() * 0.16);
          byKind[d.kind].push({ x: bx, z: bz, w, d: dep, h, rot: d.rot });
        }
      }
    }

    // Market Street itself as a road
    roadSegs.push({ a: G.MARKET.a, b: G.MARKET.b });

    this.roads = dedupeRoads(roadSegs);
    this._buildRoadMesh(this.roads);
    this._buildBuildings(byKind);
  }

  _clipLine(x0, z0, x1, z1, step) {
    // walk the line; emit maximal land runs
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.ceil(len / step));
    const out = [];
    let runStart = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const land = !G.isWater(x, z);
      if (land && runStart === null) runStart = t;
      if ((!land || i === n) && runStart !== null) {
        const tEnd = land ? t : (i - 1) / n;
        if (tEnd - runStart > 0.08) {
          out.push({
            a: [x0 + (x1 - x0) * runStart, z0 + (z1 - z0) * runStart],
            b: [x0 + (x1 - x0) * tEnd, z0 + (z1 - z0) * tEnd],
          });
        }
        runStart = null;
      }
    }
    return out;
  }

  _buildRoadMesh(roads) {
    // one merged geometry of thin quads slightly above terrain
    const verts = [];
    const cols = new THREE.Color(0x53565c);
    for (const r of roads) {
      const [ax, az] = r.a, [bx, bz] = r.b;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const nx = ((bz - az) / len) * 9, nz = -((bx - ax) / len) * 9;
      const ya = G.terrainH(ax, az) * 2.2 + LB + 1.2, yb = G.terrainH(bx, bz) * 2.2 + LB + 1.2;
      verts.push(
        ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz,
        bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx - nx, yb, bz - nz
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cols }));
    this.scene.add(m);
  }

  _buildBuildings(byKind) {
    this.buildGroups = {};
    const specs = {
      tower: { geo: () => new THREE.BoxGeometry(1, 1, 1), mat: () => new THREE.MeshLambertMaterial({ color: 0xffffff }) },
      flat: { geo: () => new THREE.BoxGeometry(1, 1, 1), mat: () => new THREE.MeshLambertMaterial({ color: 0xffffff }) },
      box: { geo: () => new THREE.BoxGeometry(1, 1, 1), mat: () => new THREE.MeshLambertMaterial({ color: 0xffffff }) },
    };
    const palette = [0xd8d2c4, 0xc9c2b2, 0xb5ae9e, 0xa8a294, 0xe0dac9, 0x9aa4ad, 0x8d97a1, 0xc2b6a0, 0xb0a58f];
    const towerPal = [0xbfd0da, 0xa7bcc9, 0xd5dee3, 0x93a8b5, 0xcfd6d9, 0x8fa3b0];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (const kind of Object.keys(specs)) {
      const list = byKind[kind];
      if (!list.length) continue;
      const geo = specs[kind].geo();
      const mesh = new THREE.InstancedMesh(geo, specs[kind].mat(), list.length);
      mesh.frustumCulled = false; // instances span the whole bay
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const base = this.groundY(b.x, b.z);
        b.y = base;
        dummy.position.set(b.x, base + b.h / 2, b.z);
        dummy.rotation.set(0, -b.rot, 0);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.set(kind === 'tower' ? towerPal[i % towerPal.length] : palette[(i * 7) % palette.length]);
        // slight per-building tint variation
        color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
        mesh.setColorAt(i, color);
        b.idx = i;
        b.kind = kind;
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this.buildGroups[kind] = { mesh, list };
      this.buildings.push(...list.map((b) => Object.assign(b, { _mesh: mesh })));
    }
    // quick lookup grid for nuke radius queries
    this.spatial = new Map();
    const CELL = 800;
    for (const b of this.buildings) {
      const k = `${Math.floor(b.x / CELL)},${Math.floor(b.z / CELL)}`;
      if (!this.spatial.has(k)) this.spatial.set(k, []);
      this.spatial.get(k).push(b);
    }
    this.CELL = CELL;
  }

  // flatten buildings within radius -> rubble. returns destroyed buildings
  destroy(x, z, r, prob = 1) {
    const out = [];
    const dummy = new THREE.Object3D();
    const cmin = new THREE.Color(0x1c1a18), cmax = new THREE.Color(0x4a423b);
    const col = new THREE.Color();
    const i0 = Math.floor((x - r) / this.CELL), i1 = Math.floor((x + r) / this.CELL);
    const j0 = Math.floor((z - r) / this.CELL), j1 = Math.floor((z + r) / this.CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cell = this.spatial.get(`${i},${j}`);
        if (!cell) continue;
        for (const b of cell) {
          const d = Math.hypot(b.x - x, b.z - z);
          if (d > r || b.dead || Math.random() > prob) continue;
          b.dead = true;
          const shrink = 0.06 + 0.25 * Math.random();
          b.rubbleH = Math.max(3, b.h * shrink * 0.25);
          dummy.position.set(b.x, b.y + b.rubbleH / 2, b.z);
          dummy.rotation.set((Math.random() - 0.5) * 0.12, -b.rot + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.12);
          dummy.scale.set(b.w * (0.9 + Math.random() * 0.15), b.rubbleH, b.d * (0.9 + Math.random() * 0.15));
          dummy.updateMatrix();
          b._mesh.setMatrixAt(b.idx, dummy.matrix);
          col.copy(cmin).lerp(cmax, Math.random());
          b._mesh.setColorAt(b.idx, col);
          out.push(b);
        }
      }
    }
    for (const g of Object.values(this.buildGroups)) {
      g.mesh.instanceMatrix.needsUpdate = true;
      if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
    }
    return out;
  }

  // survivors within radius (for partial ring destruction)
  near(x, z, r) {
    const out = [];
    const i0 = Math.floor((x - r) / this.CELL), i1 = Math.floor((x + r) / this.CELL);
    const j0 = Math.floor((z - r) / this.CELL), j1 = Math.floor((z + r) / this.CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const cell = this.spatial.get(`${i},${j}`);
      if (!cell) continue;
      for (const b of cell) if (!b.dead && Math.hypot(b.x - x, b.z - z) <= r) out.push(b);
    }
    return out;
  }

  groundY(x, z) {
    return G.isWater(x, z) ? 0 : LB + G.terrainH(x, z) * 2.2;
  }
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function dedupeRoads(segs) {
  // merge collinear adjacent runs sharing near-identical endpoints
  const seen = new Set();
  const out = [];
  for (const s of segs) {
    const k = `${Math.round(s.a[0] / 5)},${Math.round(s.a[1] / 5)}|${Math.round(s.b[0] / 5)},${Math.round(s.b[1] / 5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
