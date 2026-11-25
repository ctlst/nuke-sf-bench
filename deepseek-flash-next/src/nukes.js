// nukes.js — bomb drop, mushroom clouds, shockwaves, scorch marks, boom.
import * as THREE from 'three';
import { GROUND_Y } from './city.js';

const WATER_Y = 0.55;

// soft blob sprite texture
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(.55, 'rgba(255,255,255,.72)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// scorch decal texture
function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  rg.addColorStop(0, 'rgba(22,15,10,.95)');
  rg.addColorStop(.45, 'rgba(46,34,24,.75)');
  rg.addColorStop(.75, 'rgba(70,54,38,.35)');
  rg.addColorStop(1, 'rgba(70,54,38,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const rr = () => Math.random();
  for (let i = 0; i < 90; i++) {   // char speckles
    const a = rr() * 7, r = 30 + rr() * 95;
    g.fillStyle = `rgba(18,12,8,${.12 + rr() * .3})`;
    g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + rr() * 9, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

const C_HOT = new THREE.Color(0xffb45e), C_FIRE = new THREE.Color(0xe86a28),
      C_SMK1 = new THREE.Color(0x5f5952), C_SMK2 = new THREE.Color(0x38342f);

export class NukeSystem {
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps;                 // { city, cars, boats, audio }
    this.shakeAmp = 0;
    this.bombs = [];
    this.detonated = 0;

    const blob = blobTexture();
    // ---- particle pool (normal-blend smoke + additive fire) ----
    this.pool = [];
    for (let i = 0; i < 320; i++) {
      const m = new THREE.SpriteMaterial({ map: blob, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
      this.pool.push({ s, active: false });
    }
    this.pIdx = 0;

    // ---- shockwave rings pool ----
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(.955, 1, 90);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffc37a, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.rings.push({ m, active: false });
    }

    // ---- scorch decals ----
    this.scorchTex = scorchTexture();
    this.decals = [];
    const decGeo = new THREE.CircleGeometry(1, 40);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(decGeo, new THREE.MeshBasicMaterial({
        map: this.scorchTex, transparent: true, depthWrite: false, opacity: .92
      }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.decals.push({ m, used: false });
    }
    this.dIdx = 0;

    // ---- bombs ----
    this.bombGeo = (() => {
      const g = new THREE.CapsuleGeometry(.9, 2.6, 4, 8);
      return g;
    })();
    this.bombMat = new THREE.MeshPhongMaterial({ color: 0x30353a, shininess: 70 });
    this.finMat = new THREE.MeshLambertMaterial({ color: 0xd94f3d });
  }

  // ------------------------------------------------------------ public
  fire(x, z, radius) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.bombGeo, this.bombMat); body.castShadow = true;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.6, .14, .5), this.finMat); fin.position.y = 2.2;
    const fin2 = fin.clone(); fin2.rotation.y = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.9, 1.4, 8), this.finMat);
    nose.position.y = -2.6; nose.rotation.x = Math.PI;
    g.add(body, fin, fin2, nose);
    g.position.set(x, 250, z);
    g.rotation.set(Math.PI, 0, 0);              // point down
    this.scene.add(g);
    this.deps.audio.whistle();
    this.bombs.push({ g, x, z, vy: -70, radius, t: 0 });
    this.detonated++;
    return this.detonated;
  }

  update(dt, t) {
    // falling bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy -= 240 * dt; b.t += dt;
      b.g.position.y += b.vy * dt;
      b.g.rotation.z = Math.sin(b.t * 30) * .05;
      if (b.g.position.y <= GROUND_Y + 1) {
        this.scene.remove(b.g);
        this._detonate(b.x, b.z, b.radius);
        this.deps.audio.impact(Math.min(1, b.radius / 170));
        this.bombs.splice(i, 1);
      }
    }
    // particles
    for (const p of this.pool) {
      if (!p.active) continue;
      const a = p;
      a.age += dt;
      const u = a.age / a.life;
      if (u >= 1) { a.s.visible = false; a.active = false; continue; }
      // rise toward anchor, then buoyant drift
      const k = Math.min(1, a.age / a.riseT);
      const ease = 1 - Math.pow(1 - k, 3);
      a.s.position.x = a.x0 + (a.ax - a.x0) * ease + Math.sin(a.seed + a.age * .7) * a.wob * u;
      a.s.position.z = a.z0 + (a.az - a.z0) * ease + Math.cos(a.seed * 1.3 + a.age * .6) * a.wob * u;
      a.s.position.y = a.y0 + (a.ay - a.y0) * ease + u * u * a.buoy;
      const sc = a.sc0 + (a.sc1 - a.sc0) * Math.min(1, u * 2.2);
      a.s.scale.setScalar(sc);
      // color hot → smoke ; alpha in/out
      if (!a.fire) {
        a.s.material.color.copy(C_FIRE).lerp(C_SMK1, Math.min(1, u * 3.6)).lerp(C_SMK2, Math.max(0, (u - .35) * 1.9));
        a.s.material.opacity = Math.min(1, u * 5) * (1 - Math.pow(u, 3.2));
      } else {
        a.s.material.color.copy(C_HOT).lerp(C_FIRE, u * 1.4);
        a.s.material.opacity = Math.max(0, 1 - u * 1.6) * .95;
      }
    }
    // shockwaves
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const u = r.age / r.dur;
      if (u >= 1) { r.m.visible = false; r.active = false; continue; }
      const rad = r.maxR * (1 - Math.pow(1 - u, 2.4));
      r.m.scale.setScalar(Math.max(.01, rad));
      r.m.material.opacity = .85 * (1 - u) * (1 - u);
    }
    this.shakeAmp *= Math.exp(-dt * 3.2);
  }

  // ------------------------------------------------------------ detonate
  _detonate(x, z, R) {
    const gy = GROUND_Y;
    // --- fireball + stem + cap particles ---
    const emit = (n, fn) => {
      for (let i = 0; i < n; i++) {
        let p; let guard = 0;
        do { this.pIdx = (this.pIdx + 1) % this.pool.length; p = this.pool[this.pIdx]; guard++; }
        while (p.active && guard < 40);
        if (p.active) continue;
        p.active = true; p.age = 0;
        const a = fn(i, n);
        Object.assign(p, a);
        p.s.visible = true;
        p.s.material.blending = a.fire ? THREE.AdditiveBlending : THREE.NormalBlending;
        p.s.material.depthWrite = false;
        p.s.position.set(a.x0, a.y0, a.z0);
        p.s.scale.setScalar(a.sc0);
      }
    };
    const jitter = (r) => (Math.random() - .5) * 2 * r;

    // fireball at ground zero
    emit(10, () => ({
      x0: x + jitter(R * .1), y0: gy + Math.random() * 4, z0: z + jitter(R * .1),
      ax: x + jitter(R * .4), ay: gy + R * (.18 + Math.random() * .3), az: z + jitter(R * .4),
      buoy: R * .25, riseT: .7, wob: 0, seed: Math.random() * 9,
      sc0: R * .12, sc1: R * (.34 + Math.random() * .22), life: .55 + Math.random() * .5, fire: true
    }));
    // stem
    emit(42, (i, n) => {
      const h = (i / n) * .95 + Math.random() * .08;
      return {
        x0: x + jitter(R * .12), y0: gy + 2, z0: z + jitter(R * .12),
        ax: x + jitter(R * (.05 + h * .08)), ay: gy + R * (1.45 * h) + jitter(R * .06), az: z + jitter(R * (.05 + h * .08)),
        buoy: R * .42, riseT: .7 + h * .6, wob: R * .04, seed: Math.random() * 9,
        sc0: R * .11, sc1: R * (.24 + h * .34), life: 8 + Math.random() * 4, fire: false
      };
    });
    // cap — classic torus-ish cloud
    emit(84, (i, n) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * .5;
      const rr = R * (.30 + Math.sqrt(Math.random()) * .72);
      return {
        x0: x + jitter(R * .1), y0: gy + 4, z0: z + jitter(R * .1),
        ax: x + Math.cos(a) * rr * 1.25, ay: gy + R * (1.62 + Math.random() * .3) - rr * .42, az: z + Math.sin(a) * rr * 1.05,
        buoy: R * .48, riseT: 1.05 + Math.random() * .75, wob: R * .1, seed: Math.random() * 9,
        sc0: R * .16, sc1: R * (.5 + Math.random() * .42), life: 9 + Math.random() * 5, fire: false
      };
    });

    // base surge — ground-hugging dust racing outward
    emit(10, (i, n) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * .4;
      const rr = R * (.55 + Math.random() * .4);
      return {
        x0: x, y0: gy + 6, z0: z,
        ax: x + Math.cos(a) * rr, ay: gy + 12 + Math.random() * 16, az: z + Math.sin(a) * rr,
        buoy: R * .95, riseT: 1.1 + Math.random() * .6, wob: R * .07, seed: Math.random() * 9,
        sc0: R * .12, sc1: R * (.3 + Math.random() * .18), life: 3 + Math.random() * 1.6, fire: false
      };
    });

    // --- shockwaves ---
    for (const cfg of [{ m: 2.3, d: 1.4 }, { m: 1.5, d: .85 }]) {
      const r = this.rings.find(r => !r.active) || this.rings[0];
      r.active = true; r.age = 0; r.dur = cfg.d; r.maxR = R * cfg.m;
      r.m.visible = true; r.m.position.set(x, gy + .6, z); r.m.material.opacity = .85;
    }

    // --- scorch decal ---
    const d = this.decals[this.dIdx];
    this.dIdx = (this.dIdx + 1) % this.decals.length;
    d.m.visible = true; d.m.position.set(x, gy + .08, z);
    d.m.scale.setScalar(R * 1.15);
    d.m.rotation.z = Math.random() * 7;
    if (!d.used) { d.used = true; }

    // --- the wrecking part ---
    this.deps.city.applyDamage(x, z, R);
    this.deps.cars.killNear(x, z, R * .95);
    this.deps.boats.killNear(x, z, R * 1.05);

    this.shakeAmp = Math.max(this.shakeAmp, R * .085);
  }
}

// ================================================================ audio (synth)
export class BoomAudio {
  constructor() { this.ctx = null; this.muted = false; }
  _ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); return this.ctx; }
  resume() { const c = this._ensure(); if (c.state === 'suspended') c.resume(); }

  whistle() {
    if (this.muted) return;
    const c = this._ensure(), t0 = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2100, t0);
    o.frequency.exponentialRampToValueAtTime(160, t0 + 1.35);
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(.12, t0 + .1);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + 1.45);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + 1.5);
  }

  impact(power) {   // power 0..1
    if (this.muted) return;
    const c = this._ensure(), t0 = c.currentTime;
    // sub-bass thump
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(18, t0 + 1.6);
    g.gain.setValueAtTime(.9 * (.5 + power * .5), t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + 2.4);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + 2.5);
    // fireball noise through lowpass sweeping down
    const dur = 2.6 + power * 2.4;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const u = i / ch.length;
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - u, 2.2 + power);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t0);
    f.frequency.exponentialRampToValueAtTime(90, t0 + dur);
    const gn = c.createGain(); gn.gain.value = .55 * (.4 + power * .6);
    src.connect(f).connect(gn).connect(c.destination); src.start(t0);
  }
}
