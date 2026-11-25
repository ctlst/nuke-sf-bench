// city.js — land/water planes, instanced buildings, landmarks, bridges, trees.
import * as THREE from 'three';
import {
  WORLD, mulberry32, makeMapTexture, pointInPoly, inPark, districtAt, SF, DISTRICTS,
  EASTBAY_DISTRICTS, EASTBAY, PARKS, MARIN, SOUTHLAND, ANGEL
} from './map.js';

export const GROUND_Y = 1.2;

// ---------------------------------------------------------------- main city
export function buildCity(scene) {
  const city = new THREE.Group();
  scene.add(city);
  const rnd = mulberry32(1337);

  // ---- ground (procedural SF map texture) ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: makeMapTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  ground.name = 'ground';
  city.add(ground);

  // ---- animated bay water, alpha-masked to the actual coastline ----
  const wtex = makeWaterTexture();
  wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping;
  wtex.repeat.set(3.4, 3.4);                        // tile across the detail square
  const alphaMap = makeWaterAlpha();
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x0b4166, map: wtex, alphaMap, transparent: true, opacity: .92,
    shininess: 32, specular: 0x4d90b8, depthWrite: false
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = GROUND_Y + .18;
  city.add(water);

  // ---- open ocean beyond the map (static-ish base layer) ----
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshPhongMaterial({ color: 0x14598a, shininess: 60, specular: 0x7fb8d8 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = GROUND_Y - .15;
  city.add(ocean);

  // ---- instanced buildings ----
  const B = [];                                   // {x,z,w,d,h,color,kind}
  const tryPlace = (cx, cz, r, dens, hmax, kind) => {
    for (let i = 0; i < 1700 && B.length < 4600; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (!pointInPoly(x, z, SF) && !pointInPoly(x, z, EASTBAY)) continue;
      if (inPark(x, z)) continue;
      const d = districtAt(x, z);
      const densHere = d ? d.dens : .5, hmaxHere = d ? d.hmax : 3;
      if (rnd() > densHere) continue;
      const tall = Math.pow(rnd(), 2.4);           // most buildings short
      const h = 1.9 + tall * hmaxHere * (0.7 + rnd() * .8);
      const w = Math.min(1.6 + rnd() * 2.2, 1.4 + h * .3);
      const dep = Math.min(1.6 + rnd() * 2.2, 1.4 + h * .3);
      // keep off Market St corridor a bit (visual breathing room)
      B.push({ x, z, w, d: dep, h, kind });
    }
  };
  for (const d of DISTRICTS) tryPlace(d.x, d.z, d.r, d.dens, d.hmax, d.kind);
  for (const d of EASTBAY_DISTRICTS) tryPlace(d.x, d.z, d.r, d.dens, d.hmax, 'eastbay');

  const GLASS = [0xaebfd0, 0x8fa7bd, 0xc5d3de, 0x7e93a8, 0x9fb6c4, 0xb7c9d6];
  const HOME  = [0xc9b28f, 0xbfa07c, 0xd3b591, 0xa9856b, 0xc49a78, 0xd8c8a8, 0xc99e88, 0xb88f6f];
  const colorFor = (kind) => {
    if (kind === 'downtown' || kind === 'nobhill') return GLASS[(rnd()*GLASS.length)|0];
    if (kind === 'soma') return rnd() < .5 ? GLASS[(rnd()*GLASS.length)|0] : HOME[(rnd()*HOME.length)|0];
    if (kind === 'eastbay') return rnd() < .4 ? GLASS[(rnd()*GLASS.length)|0] : HOME[(rnd()*HOME.length)|0];
    return HOME[(rnd()*HOME.length)|0];
  };

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, .5, 0);                       // base at origin
  const bmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(boxGeo, bmat, B.length);
  inst.castShadow = inst.receiveShadow = true;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const P = new THREE.Vector3(), SV = new THREE.Vector3(), COL = new THREE.Color();

  // per-instance destruction state lives parallel to B
  const bState = B.map(() => ({ alive: true, fallT: -1, delay: 0, tilt: (rnd()-.5)*.9 }));

  const writeMatrix = (i) => {
    const b = B[i], s = bState[i];
    let sy = 1, rz = 0;
    if (s.fallT >= 0) {
      const p = Math.min(1, s.fallT / .5);
      const e = 1 - Math.pow(1 - p, 2.6);           // ease-in collapse
      sy = 1 - e * .94; rz = s.tilt * e;
    }
    E.set(0, 0, rz); Q.setFromEuler(E);
    P.set(b.x, GROUND_Y, b.z); SV.set(b.w, b.h * sy, b.d);
    M.compose(P, Q, SV); inst.setMatrixAt(i, M);
  };
  B.forEach((b, i) => {
    writeMatrix(i);
    inst.setColorAt(i, COL.setHex(colorFor(b.kind)));
  });
  inst.instanceMatrix.needsUpdate = true;
  city.add(inst);

  // ---- landmarks (individually destructible) ----
  const landmarks = [];
  const landmark = (mesh, killable = true) => {
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    city.add(mesh);
    if (killable) landmarks.push({ obj: mesh, baseY: mesh.position.y, fallT: -1, delay: 0, tilt: (rnd()-.5)*.7 });
    return mesh;
  };
  const glass = new THREE.MeshPhongMaterial({ color: 0xcfe0ea, shininess: 60, specular: 0x88aabb });
  const cream = new THREE.MeshLambertMaterial({ color: 0xe8e2d4 });

  { // Salesforce Tower
    const g = new THREE.Group(); g.position.set(37, GROUND_Y, -39);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 9, 6.4), glass); b1.position.y = 4.5;
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 20, 4.8), glass); b2.position.y = 9 + 10;
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5, 3.6), cream); b3.position.y = 29 + 2.5;
    g.add(b1, b2, b3); landmark(g);
  }
  { // Transamerica Pyramid (group pivot at ground so collapse sinks to street)
    const g = new THREE.Group(); g.position.set(31, GROUND_Y, -32);
    const p = new THREE.Mesh(new THREE.ConeGeometry(3.4, 26, 4), cream);
    p.position.y = 13; p.rotation.y = Math.PI / 4; g.add(p); landmark(g);
  }
  { // Millennium + Embarcadero cluster
    const mk=(x,z,w,h,d,c)=>{
      const g=new THREE.Group(); g.position.set(x,GROUND_Y,z);
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:c}));
      m.position.y=h/2; g.add(m); landmark(g);
    };;
    mk(39,-24, 3.2,15,3.2, 0xb7c9d6); mk(41,-31, 3,12,3, 0x9fb6c4);
    mk(41,-18, 2.6,10,2.6, 0xc5d3de); mk(-2,-42, 3,9,3, 0xaebfd0);   // Mark Hopkins-ish
  }
  { // Coit Tower
    const g = new THREE.Group(); g.position.set(21, GROUND_Y, -46);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 3, 10), cream); base.position.y = 1.5;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.75, .95, 8, 10), cream); shaft.position.y = 3 + 4;
    g.add(base, shaft); landmark(g);
  }
  { // Ferry Building
    const g = new THREE.Group(); g.position.set(34, GROUND_Y, -41); g.rotation.y = -.5;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(11, 4, 4), new THREE.MeshLambertMaterial({ color: 0xd8c9a8 }));
    hall.position.y = 2;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 11, 2.6), new THREE.MeshLambertMaterial({ color: 0xd8c9a8 }));
    tower.position.set(0, 5.5, 0);
    g.add(hall, tower); landmark(g);
  }

  // ---- bridges ----
  city.add(makeBridge([-49,-57],[-41,-93], { deckY: 6.5, towers:[.06,.94], sag: 7.5, w: 3.2, hTower: 24 }));   // Golden Gate
  city.add(makeBridge([44,-13],[118,-8],  { deckY: 4.5, towers:[.5],      sag: 5,   w: 2.6, hTower: 15 }));    // Bay Bridge

  // ---- Alcatraz ----
  {
    const g = new THREE.Group(); g.position.set(14, GROUND_Y + .1, -76);
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 1.6, 12),
      new THREE.MeshLambertMaterial({ color: 0xa89e82 })); rock.position.y = .5;
    const cell = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.2), cream); cell.position.y = 2;
    const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(.3,.35,2.4,8), cream); lighthouse.position.set(1.4,2.4,0);
    g.add(rock, cell, lighthouse);
    g.traverse(o=>{ if(o.isMesh){o.castShadow=true;} });
    city.add(g);
  }

  // ---- trees (parks + greenbelts) ----
  {
    const spots = [];
    for (const p of PARKS) {
      if (p.water) continue;
      const n = p.type === 'rect' ? 130 : 90;
      for (let i=0;i<n;i++){
        let x,z;
        if (p.type==='rect'){ x=p.x0+rnd()*(p.x1-p.x0); z=p.z0+rnd()*(p.z1-p.z0); }
        else { const a=rnd()*7, r=Math.sqrt(rnd())*p.r*.9; x=p.x+Math.cos(a)*r; z=p.z+Math.sin(a)*r; }
        spots.push([x,z]);
      }
    }
    for (let i=0;i<160;i++){ // Marina Green + Great Highway strip
      const x=-72-rnd()*30, z=-48+rnd()*5; if(pointInPoly(x,z,SF)) spots.push([x,z]);
    }
    const tgeo = new THREE.SphereGeometry(1, 6, 5);
    const tmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const trees = new THREE.InstancedMesh(tgeo, tmat, spots.length);
    trees.castShadow = true;
    const C2 = new THREE.Color();
    spots.forEach(([x,z],i)=>{
      const s = .9 + rnd()*1.3;
      P.set(x, GROUND_Y + s*.8, z); SV.set(s, s*1.15, s); Q.identity();
      M.compose(P,Q,SV); trees.setMatrixAt(i,M);
      C2.setHSL(.27+rnd()*.05, .38+rnd()*.18, .30+rnd()*.14);
      trees.setColorAt(i,C2);
    });
    trees.instanceMatrix.needsUpdate = true;
    city.add(trees);
  }

  // ------------------------------------------------ destruction API
  const stats = { leveled: 0 };
  function applyDamage(gx, gz, R) {
    let hit = 0;
    for (let i=0;i<B.length;i++) {
      const s = bState[i]; if (!s.alive) continue;
      const b = B[i], dx=b.x-gx, dz=b.z-gz, d=Math.sqrt(dx*dx+dz*dz);
      if (d < R && Math.random() < 1.15 - d/R*.65) {
        s.fallT = 0; s.delay = (d/R)*.7 + Math.random()*.18; hit++; stats.leveled++;
      }
    }
    for (const L of landmarks) {
      if (L.fallT >= 0 || !L.obj.visible) continue;
      const dx=L.obj.position.x-gx, dz=L.obj.position.z-gz;
      if (Math.sqrt(dx*dx+dz*dz) < R*.92) { L.fallT = 0; L.delay = Math.random()*.3; stats.leveled++; hit++; }
    }
    return hit;
  }

  function update(dt) {
    wtex.offset.x += dt*.012; wtex.offset.y += dt*.006;   // drifting water
    let dirty = false;
    for (let i=0;i<B.length;i++) {
      const s = bState[i];
      if (s.fallT >= 0 && s.alive) {
        if (s.delay > 0) s.delay -= dt;
        else { s.fallT += dt; dirty = true; writeMatrix(i);
               if (s.fallT > .55) s.alive = false; }
      }
    }
    if (dirty) inst.instanceMatrix.needsUpdate = true;
    for (const L of landmarks) {
      if (L.fallT >= 0 && L.obj.visible) {
        if (L.delay > 0) { L.delay -= dt; continue; }
        L.fallT += dt;
        const p = Math.min(1, L.fallT/.6), e = 1-Math.pow(1-p,2.4);
        L.obj.scale.y = 1 - e*.93;
        L.obj.rotation.z = L.tilt*e;
        if (p >= 1) L.obj.visible = false;
      }
    }
  }

  return { group: city, applyDamage, update, stats };
}

// ---------------------------------------------------------------- bridge maker
function makeBridge(from, to, o) {
  const g = new THREE.Group();
  const [x0,z0] = from, [x1,z1] = to;
  const dx=x1-x0, dz=z1-z0, len=Math.hypot(dx,dz), ang=Math.atan2(dz,dx);
  const orange = new THREE.MeshLambertMaterial({ color: 0xd65b2a });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, .7, o.w), orange);
  deck.position.y = o.deckY; g.add(deck);
  // road stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(len, .12, .28),
    new THREE.MeshBasicMaterial({ color: 0xf5e9c8 }));
  stripe.position.y = o.deckY + .42; g.add(stripe);

  const tops = [];
  for (const t of o.towers) {
    const px = -len/2 + len*t;
    for (const side of [-1,1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.5, o.hTower, 1.4), orange);
      pylon.position.set(px, o.deckY + o.hTower/2 - .6, side*(o.w/2+.2));
      g.add(pylon);
    }
    const strut = new THREE.Mesh(new THREE.BoxGeometry(1.6,.8,o.w+1.4), orange);
    strut.position.set(px, o.deckY + o.hTower - 2.2, 0); g.add(strut);
    tops.push({ t, x: px });
  }
  // main cables: sag between consecutive towers, back-stays to deck ends
  const cableMat = orange;
  const addCable = (ax, ay, bx, by, sag) => {
    for (const side of [-1,1]) {
      const pts = [];
      for (let i=0;i<=14;i++){
        const u=i/14, x=ax+(bx-ax)*u;
        const y=ay+(by-ay)*u - Math.sin(u*Math.PI)*sag;
        pts.push(new THREE.Vector3(x, y, side*(o.w/2+.2)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, .16, 5), cableMat);
      g.add(tube);
    }
  };
  if (tops.length >= 2) {
    addCable(-len/2, o.deckY+o.hTower*.92, tops[0].x, o.deckY+o.hTower, 1.2);
    for (let i=0;i<tops.length-1;i++)
      addCable(tops[i].x, o.deckY+o.hTower, tops[i+1].x, o.deckY+o.hTower, o.sag);
    addCable(tops[tops.length-1].x, o.deckY+o.hTower, len/2, o.deckY+o.hTower*.92, 1.2);
  } else if (tops.length === 1) {
    addCable(-len/2, o.deckY+.5, tops[0].x, o.deckY+o.hTower, .4);
    addCable(tops[0].x, o.deckY+o.hTower, len/2, o.deckY+.5, .4);
  }
  // suspenders
  const susp = new THREE.MeshBasicMaterial({ color: 0xc85f31 });
  for (let i=1;i<26;i++){
    const u=i/26, x=-len/2+len*u;
    let y=o.deckY+o.hTower;
    // rough sag profile across full span between outer towers
    const tA=tops[0]?.t ?? .5, tB=tops[tops.length-1]?.t ?? .5;
    if (u>tA && u<tB){ const v=(u-tA)/(tB-tA); y = o.deckY+o.hTower - Math.sin(v*Math.PI)*o.sag; }
    else continue;
    for (const side of [-1,1]) {
      const s=new THREE.Mesh(new THREE.BoxGeometry(.08, y-o.deckY-.35, .08), susp);
      s.position.set(x,(y+o.deckY)/2,side*(o.w/2+.2)); g.add(s);
    }
  }
  g.traverse(o2=>{ if(o2.isMesh){o2.castShadow=true;} });
  g.position.set((x0+x1)/2, 0, (z0+z1)/2);
  g.rotation.y = -ang;                        // +x axis of group along from→to
  return g;
}

// ---------------------------------------------------------------- water alpha (land = transparent)
function makeWaterAlpha() {
  const PX = 1024;
  const c = document.createElement('canvas'); c.width = c.height = PX;
  const g = c.getContext('2d');
  const X = x => (x + WORLD / 2) / WORLD * PX, Z = z => (z + WORLD / 2) / WORLD * PX;
  g.fillStyle = '#fff'; g.fillRect(0, 0, PX, PX);          // water: opaque
  g.fillStyle = '#000';                                     // land: cut out
  for (const p of [SF, MARIN, EASTBAY, SOUTHLAND, ANGEL]) {
    g.beginPath();
    p.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)));
    g.closePath(); g.fill();
  }
  // lakes are water after all
  g.fillStyle = '#fff';
  for (const p of PARKS) if (p.water) { g.beginPath(); g.arc(X(p.x), Z(p.z), p.r * PX / WORLD, 0, 7); g.fill(); }
  // soft coastline feather
  g.filter = 'blur(3px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ---------------------------------------------------------------- water texture
function makeWaterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0e547f'; g.fillRect(0,0,256,256);
  const rnd = mulberry32(42);
  for (let i=0;i<900;i++){
    g.fillStyle = `rgba(${180+rnd()*60|0},${220+rnd()*30|0},255,${.04+rnd()*.07})`;
    const w = 6+rnd()*26;
    g.fillRect(rnd()*256, rnd()*256, w, 1.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
