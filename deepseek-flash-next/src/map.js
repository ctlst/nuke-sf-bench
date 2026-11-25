// map.js — stylized San Francisco geography + procedural map texture.
import * as THREE from 'three';

export const WORLD = 512;          // world spans [-256, 256] in x and z
const S = WORLD / 512;             // px scale factor used below is 8 px/unit @4096

// ---------- seeded rng ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- landmasses (x, z) — north is -z ----------
export const SF = [
  [-97,-40],[-90,-51],[-72,-55],[-55,-56],[-40,-54],[-20,-55],[2,-53],
  [16,-49],[28,-45],[36,-40],[40,-30],[42,-14],[46,2],[50,16],[46,34],
  [40,56],[-60,56],[-96,50],[-104,26],[-104,0],[-101,-20]
];
export const MARIN = [
  [-30,-110],[-55,-98],[-75,-94],[-95,-96],[-120,-92],[-160,-95],[-205,-90],
  [-256,-93],[-256,-256],[-30,-256]
];
export const EASTBAY = [
  [118,-170],[112,-140],[116,-110],[124,-80],[130,-50],[126,-20],[132,10],
  [140,50],[150,90],[162,140],[172,200],[176,256],[256,256],[256,-170]
];
export const SOUTHLAND = [   // Daly City / SFO peninsula south of the city
  [-256,58],[-104,58],[-30,58],[-8,72],[2,100],[-10,140],[-40,175],
  [-90,215],[-160,250],[-256,256]
];
export const ANGEL = circle(70,-142,20);           // Angel Island

// ---------- parks / no-build zones ----------
export const PARKS = [
  { type:'rect', x0:-104, z0:4, x1:-42, z1:15, name:'ggbp' },   // Golden Gate Park
  { type:'rect', x0:-42,  z0:7, x1:-30, z1:12, name:'panhandle' },
  { type:'circle', x:-62, z:-46, r:15, name:'presidio' },
  { type:'circle', x:-24, z:10,  r:15, name:'twinpeaks' },
  { type:'circle', x:-88, z:38,  r:9,  name:'lakemerced', water:true }
];

// ---------- development districts (density + max height) ----------
export const DISTRICTS = [
  { x: 34, z:-36, r:20, hmax:13, dens:.95, kind:'downtown' },
  { x:  8, z:-38, r:13, hmax: 8, dens:.85, kind:'nobhill'  },
  { x: 20, z:-45, r:10, hmax: 6, dens:.9,  kind:'northbeach'},
  { x: 28, z:-12, r:18, hmax: 7, dens:.75, kind:'soma'     },
  { x: 10, z:-24, r: 9, hmax: 7, dens:.9,  kind:'tenderloin'},
  { x:  0, z:-26, r:10, hmax: 6, dens:.85, kind:'polk'     },
  { x:-36, z:-36, r:13, hmax: 5.5,dens:.8, kind:'pac Heights'},
  { x:-52, z:-44, r:12, hmax: 4, dens:.7,  kind:'marina'   },
  { x:-78, z:-16, r:19, hmax: 3.2,dens:.8, kind:'richmond' },
  { x:-64, z: 26, r:21, hmax: 3.2,dens:.8, kind:'sunset'   },
  { x: -4, z:  6, r:15, hmax: 4.5,dens:.85,kind:'mission'  },
  { x:-28, z: -8, r:10, hmax: 4, dens:.8,  kind:'haight'   },
  { x: -6, z: 28, r:13, hmax: 4, dens:.75, kind:'bernal'   },
  { x:-30, z: 44, r:19, hmax: 3.6,dens:.75,kind:'ingleside'},
  { x:  8, z: 38, r:14, hmax: 3.6,dens:.7, kind:'excelsior'},
  { x: 34, z: 26, r:14, hmax: 4, dens:.7,  kind:'bayview'  },
  { x: 30, z:  2, r:10, hmax: 4.5,dens:.7, kind:'potrero'  }
];

// Oakland / Berkeley strip across the bay
export const EASTBAY_DISTRICTS = [
  { x:136, z:-14, r:16, hmax:6, dens:.5 },
  { x:140, z: 30, r:14, hmax:4, dens:.4 },
  { x:128, z:-90, r:14, hmax:4.5,dens:.4 },
  { x:126, z: 95, r:16, hmax:3.5,dens:.35 }
];

// ---------- geometry helpers ----------
export function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x,z],i)=> i ? ctx.lineTo(x,z) : ctx.moveTo(x,z));
  ctx.closePath();
}
function circle(x,z,r){ const p=[]; for(let i=0;i<26;i++){const a=i/26*Math.PI*2;p.push([x+Math.cos(a)*r,z+Math.sin(a)*r*(.78)]);} return p; }

export function pointInPoly(x, z, pts) {
  let c = false;
  for (let i = 0, j = pts.length-1; i < pts.length; j = i++) {
    const xi=pts[i][0], zi=pts[i][1], xj=pts[j][0], zj=pts[j][1];
    if (((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi)) c = !c;
  }
  return c;
}

export function inPark(x, z) {
  for (const p of PARKS) {
    if (p.type==='rect' && x>p.x0 && x<p.x1 && z>p.z0 && z<p.z1) return true;
    if (p.type==='circle' && ((x-p.x)**2+(z-p.z)**2) < p.r*p.r) return true;
  }
  return false;
}

export function isLand(x, z) {
  return pointInPoly(x,z,SF) || pointInPoly(x,z,MARIN) || pointInPoly(x,z,EASTBAY)
      || pointInPoly(x,z,SOUTHLAND) || pointInPoly(x,z,ANGEL);
}

// ground height (gentle stylized hills) — used to seat buildings & decals
export function groundAt(x, z) {
  if (!isLand(x,z)) return 0;
  let h = 1.2;                                       // base land slab top
  const bump=(bx,bz,s,a)=> h += a*Math.exp(-(((x-bx)**2+(z-bz)**2)/(2*s*s)));
  bump(-24,8, 14, 5.5);   // Twin Peaks
  bump(20,-46, 7, 3.2);   // Telegraph Hill
  bump(-40,-44,12, 2.2);  // Russian/Presidio heights
  bump(-62,-46,16, 1.6);  // Presidio
  if (pointInPoly(x,z,MARIN)) h += 3 + 5*Math.exp(-(((x+120)**2+(z+140)**2)/9000));
  return h;
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) if ((x-d.x)**2+(z-d.z)**2 < d.r*d.r) return d;
  return null;
}

// =====================================================================
//  Canvas map texture — coastlines, shallow water, street grid, parks
// =====================================================================
export function makeMapTexture() {
  const PX = 4096, pxu = PX / WORLD;                 // px per world unit
  const c = document.createElement('canvas'); c.width = c.height = PX;
  const g = c.getContext('2d');
  const X = x => (x + WORLD/2) * pxu, Z = z => (z + WORLD/2) * pxu;

  // --- deep ocean ---
  const grad = g.createLinearGradient(0, 0, PX, PX);
  grad.addColorStop(0, '#0a3f66'); grad.addColorStop(.5, '#0e4f7c'); grad.addColorStop(1, '#093a5e');
  g.fillStyle = grad; g.fillRect(0, 0, PX, PX);
  const rnd = mulberry32(7);
  g.fillStyle = 'rgba(255,255,255,.03)';
  for (let i=0;i<2600;i++){ g.beginPath(); g.arc(rnd()*PX, rnd()*PX, rnd()*14+3, 0, 7); g.fill(); }

  const landPolys = [SF, MARIN, EASTBAY, SOUTHLAND, ANGEL];

  // --- shallow-water halo ---
  g.save();
  g.shadowColor = 'rgba(140,210,238,.9)'; g.shadowBlur = 16 * pxu / 8;
  g.fillStyle = '#2c7fae';
  for (const p of landPolys){ polyPath(g, p.map(([x,z])=>[X(x),Z(z)])); g.fill(); }
  g.restore();

  // --- land base ---
  const drawLand = () => {
    for (const p of landPolys){ polyPath(g, p.map(([x,z])=>[X(x),Z(z)])); g.fill(); }
  };
  g.fillStyle = '#cfc097';
  drawLand();

  // district tint patches (grungy urban wash), clipped to the city
  g.save();
  polyPath(g, SF.map(([x,z])=>[X(x),Z(z)])); g.clip();
  for (const d of DISTRICTS) {
    const rg = g.createRadialGradient(X(d.x),Z(d.z),0, X(d.x),Z(d.z), d.r*pxu);
    rg.addColorStop(0,'rgba(138,130,116,.62)'); rg.addColorStop(1,'rgba(138,130,116,0)');
    g.fillStyle = rg;
    g.fillRect(X(d.x-d.r), Z(d.z-d.r), d.r*2*pxu, d.r*2*pxu);
  }
  g.restore();

  // green washes over parks & hills
  const greens = [[-24,10,22],[-62,-46,22]];   // Twin Peaks + Presidio only
  for (const [bx,bz,r] of greens) {
    const rg = g.createRadialGradient(X(bx),Z(bz),0,X(bx),Z(bz),r*pxu);
    rg.addColorStop(0,'rgba(106,148,80,.6)'); rg.addColorStop(1,'rgba(106,148,80,0)');
    g.fillStyle = rg; g.fillRect(X(bx-r),Z(bz-r),r*2*pxu,r*2*pxu);
  }

  // --- street grids (clipped to land) ---
  const grid = (cx, cz, angDeg, step, x0,x1,z0,z1) => {
    // NOTE: inside the rotated context, coordinates are LOCAL px (v*pxu), not X()/Z()
    g.save(); g.translate(X(cx), Z(cz)); g.rotate(angDeg*Math.PI/180);
    for (let v=Math.ceil(x0/step)*step; v<=x1; v+=step){
      const major = Math.abs(v % (step*5)) < .01;
      g.strokeStyle = major ? 'rgba(250,246,230,.97)' : 'rgba(244,238,220,.78)';
      g.lineWidth = (major?4.2:2.0)*pxu/8;
      g.beginPath(); g.moveTo(v*pxu, z0*pxu); g.lineTo(v*pxu, z1*pxu); g.stroke();
      g.beginPath(); g.moveTo(z0*pxu, v*pxu); g.lineTo(z1*pxu, v*pxu); g.stroke();
    }
    g.restore();
  };
  g.save(); polyPath(g, SF.map(([x,z])=>[X(x),Z(z)])); g.clip();
  grid(-25, 0, 29, 3.2, -160, 100, -120, 140);
  // Market Street diagonal: Ferry Building → Twin Peaks
  g.strokeStyle='rgba(242,236,218,.95)'; g.lineWidth=6*pxu/8;
  g.beginPath(); g.moveTo(X(36),Z(-40)); g.lineTo(X(-22),Z(8)); g.stroke();
  // Embarcadero waterfront road
  g.lineWidth=4*pxu/8; g.beginPath();
  const embarc=[[-97,-42],[-55,-52],[2,-51],[36,-39],[40,-28],[43,-6],[48,16],[44,36]];
  embarc.forEach(([x,z],i)=> i?g.lineTo(X(x),Z(z)):g.moveTo(X(x),Z(z))); g.stroke();
  g.restore();

  g.save(); polyPath(g, EASTBAY.map(([x,z])=>[X(x),Z(z)])); g.clip();
  grid(150, -20, 16, 3.4, -80, 120, -190, 220);
  g.restore();

  g.save(); polyPath(g, SOUTHLAND.map(([x,z])=>[X(x),Z(z)])); g.clip();
  grid(-60, 120, 24, 3.8, -140, 90, -80, 150);
  // SFO runways
  g.save(); g.translate(X(-52), Z(96)); g.rotate(-.52);
  g.fillStyle='#8f969a';
  g.fillRect(-70*pxu/8,-4.4*pxu/8,140*pxu/8,8.8*pxu/8);
  g.rotate(1.05);
  g.fillRect(-62*pxu/8,-4.4*pxu/8,124*pxu/8,8.8*pxu/8);
  g.restore();
  g.strokeStyle='rgba(255,255,255,.85)'; g.lineWidth=1.6*pxu/8;
  g.save(); g.translate(X(-52),Z(96)); g.rotate(-.52);
  for(const s of [-1,1]){ g.beginPath(); g.moveTo(-64*pxu/8, s*2.2*pxu/8); g.lineTo(64*pxu/8, s*2.2*pxu/8); g.stroke(); }
  g.restore();
  g.restore();

  // --- parks on top of grid ---
  for (const p of PARKS) {
    if (p.water) { g.fillStyle = '#3f8fb5'; g.beginPath(); g.arc(X(p.x),Z(p.z),p.r*pxu,0,7); g.fill(); continue; }
    g.fillStyle = p.name==='ggbp'||p.name==='panhandle' ? '#74a857' : '#7fb364';
    if (p.type==='rect'){ g.fillRect(X(p.x0),Z(p.z0),(p.x1-p.x0)*pxu,(p.z1-p.z0)*pxu); }
    else { g.beginPath(); g.arc(X(p.x),Z(p.z),p.r*pxu,0,7); g.fill(); }
    // trees speckle
    g.fillStyle='rgba(62,105,54,.8)';
    const rr = mulberry32(p.x*97+p.z*31+5);
    const n = p.type==='rect' ? 220 : 120;
    for(let i=0;i<n;i++){
      let tx,tz;
      if(p.type==='rect'){ tx=p.x0+rr()*(p.x1-p.x0); tz=p.z0+rr()*(p.z1-p.z0);}
      else { const a=rr()*7, r=Math.sqrt(rr())*p.r*.92; tx=p.x+Math.cos(a)*r; tz=p.z+Math.sin(a)*r; }
      g.beginPath(); g.arc(X(tx),Z(tz),(1.1+rr()*1.3)*pxu/8,0,7); g.fill();
    }
  }

  // piers along the Embarcadero (drawn as land)
  g.fillStyle = '#bfb495';
  const pierZ=[-46,-41,-36,-31,-26,-20,-14,-7,0];
  for (let i=0;i<pierZ.length;i++){
    const z=pierZ[i], len=(i===0||i===1)?26:14, w=(i===1||i===5)?4.6:2.6;
    g.fillRect(X(40), Z(z-w/2), len*pxu, w*pxu);
  }

  // coastline outlines
  g.strokeStyle='rgba(70,80,70,.5)'; g.lineWidth=1.8*pxu/8;
  for (const p of landPolys){ polyPath(g, p.map(([x,z])=>[X(x),Z(z)])); g.stroke(); }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
