// The fun part: bombs, explosions, mushroom clouds, craters, fires, shake, sound.
import * as THREE from 'three';
import * as G from './geo.js';
import { makePuffTexture } from './agents.js';

const WIND = new THREE.Vector2(9, 2.5);

export class NukeControl {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.bombs = [];
    this.fx = [];        // timed explosion effects
    this.puffs = [];     // smoke/fire particles
    this.shake = 0;
    this.count = 0;

    this.texPuff = makePuffTexture(0.3);
    this.texFire = makePuffTexture(0.15);
    this.sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    this.ac = null;
    this.masterGain = null;
  }

  _ensureAudio() {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ac.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ac.destination);
    } catch { /* audio unavailable */ }
  }

  _whistle() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 1.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
    o.connect(g).connect(this.masterGain);
    o.start(t); o.stop(t + 1.4);
  }

  _boom(dist) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const vol = THREE.MathUtils.clamp(9000 / (dist + 2500), 0.08, 1);
    // noise blast through falling lowpass
    const dur = 4.5;
    const buf = this.ac.createBuffer(1, this.ac.sampleRate * dur, this.ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 1.6);
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(45, t + 3.2);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.masterGain);
    src.start(t);
    // sub thump
    const o = this.ac.createOscillator();
    const og = this.ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 1.6);
    og.gain.setValueAtTime(vol * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(og).connect(this.masterGain);
    o.start(t); o.stop(t + 2.5);
  }

  // ---------------- particles ----------------
  _puff({ x, y, z, vx = 0, vy = 0, vz = 0, s0, s1, life, c0 = '#c9c4bd', c1 = '#8f8a84', op = 0.75, add = false, flicker = false, tex }) {
    const mat = new THREE.SpriteMaterial({
      map: tex || this.texPuff, transparent: true, opacity: 0, depthWrite: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, color: new THREE.Color(c0), fog: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(s0, s0, 1);
    sp.position.set(x, y, z);
    this.scene.add(sp);
    this.puffs.push({ sp, age: 0, life, vx, vy, vz, s0, s1, c0: new THREE.Color(c0), c1: new THREE.Color(c1), op, flicker, seed: Math.random() * 10 });
  }

  _updatePuffs(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.sp);
        p.sp.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      p.sp.position.x += (p.vx + WIND.x * 2.5) * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += (p.vz + WIND.y * 2.5) * dt;
      if (p.vy > 0 && p.age > p.life * 0.35) p.vy *= Math.pow(0.4, dt); // rise slows then stalls
      const s = THREE.MathUtils.lerp(p.s0, p.s1, Math.sqrt(t));
      let op = p.op * (t < 0.06 ? t / 0.06 : 1 - Math.pow((t - 0.06) / 0.94, 2));
      if (p.flicker) op *= 0.7 + 0.3 * Math.sin(p.age * 26 + p.seed) * Math.sin(p.age * 9 + p.seed * 3);
      p.sp.scale.set(s, s, 1);
      p.sp.material.opacity = Math.max(0, op);
      p.sp.material.color.copy(p.c0).lerp(p.c1, Math.min(1, t * 1.6));
    }
  }

  // ---------------- bombs ----------------
  drop(x, z) {
    this._ensureAudio();
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    const gy = this.city.groundY(x, z);
    const p0 = new THREE.Vector3(x + 2600, gy + 5200, z - 1800);
    const p1 = new THREE.Vector3(x, gy, z);
    const ctrl = new THREE.Vector3().lerpVectors(p0, p1, 0.42).setY(gy + 4600);

    const bomb = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3b4046 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(14, 12, 90, 10), bodyMat);
    bomb.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(14, 34, 10), new THREE.MeshLambertMaterial({ color: 0xc9463c }));
    nose.position.y = -62;
    bomb.add(nose);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 22, 14), bodyMat);
      fin.position.y = 50;
      fin.rotation.y = (k * Math.PI) / 2;
      fin.position.x = Math.cos((k * Math.PI) / 2) * 10;
      fin.position.z = Math.sin((k * Math.PI) / 2) * 10;
      bomb.add(fin);
    }
    this.scene.add(bomb);
    this._whistle();
    this.bombs.push({ bomb, p0, ctrl, p1, t: 0, dur: 1.5, trailT: 0 });
    this.count++;
    if (typeof window.onNukeDropped === 'function') window.onNukeDropped(this.count);
  }

  _updateBombs(dt) {
    const v = new THREE.Vector3();
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt / b.dur;
      const t = Math.min(b.t, 1);
      // quadratic bezier fall
      const a = new THREE.Vector3().lerpVectors(b.p0, b.ctrl, t);
      const c = new THREE.Vector3().lerpVectors(b.ctrl, b.p1, t);
      v.lerpVectors(a, c, t);
      b.bomb.position.copy(v);
      // orient along velocity
      const d = new THREE.Vector3().lerpVectors(a, c, Math.min(1, t + 0.05)).sub(v).normalize();
      if (d.lengthSq() > 0) b.bomb.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
      // smoke trail
      b.trailT += dt;
      if (b.trailT > 0.05) {
        b.trailT = 0;
        this._puff({ x: v.x, y: v.y + 40, z: v.z, s0: 22, s1: 190, life: 1.3, c0: '#cfd3d6', c1: '#9aa0a6', op: 0.38 });
      }
      if (t >= 1) {
        this.scene.remove(b.bomb);
        this.bombs.splice(i, 1);
        this._explode(b.p1);
      }
    }
  }

  // ---------------- explosion ----------------
  _explode(p) {
    const R = 1700;
    const onWater = G.isWater(p.x, p.z);
    const distCam = Math.hypot(p.x, p.z); // rough for audio scaling
    this._boom(distCam);

    // destruction rings (jagged edge via probability falloff)
    if (!onWater) {
      this.city.destroy(p.x, p.z, R * 0.75, 1);
      this.city.destroy(p.x, p.z, R, 0.85);
      this.city.destroy(p.x, p.z, R * 1.3, 0.4);
    }

    // flash light
    const light = new THREE.PointLight(0xffe6b8, 0, 0, 1);
    light.position.set(p.x, p.y + 200, p.z);
    this.scene.add(light);

    // fireball
    const fbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, fog: false });
    const fb = new THREE.Mesh(this.sphereGeo, fbMat);
    fb.position.set(p.x, p.y + 90, p.z);
    this.scene.add(fb);

    // shockwave ring
    const ringGeo = new THREE.RingGeometry(0.94, 1, 72).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(p.x, p.y + 14, p.z);
    this.scene.add(ring);

    // scorch + crater decals (land only)
    if (!onWater) {
      const decalY = p.y;
      const crater = new THREE.Mesh(
        jitterCircle(R * 0.32),
        new THREE.MeshBasicMaterial({ color: 0x171310, transparent: true, opacity: 0.9, fog: false })
      );
      crater.rotation.x = -Math.PI / 2;
      crater.position.set(p.x, decalY + 1.4, p.z);
      this.scene.add(crater);
      const scorch = new THREE.Mesh(
        jitterCircle(R * 1.15),
        new THREE.MeshBasicMaterial({ color: 0x39312a, transparent: true, opacity: 0.5 })
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(p.x, decalY + 0.8, p.z);
      this.scene.add(scorch);
    }

    // base surge dust
    const nSurge = onWater ? 14 : 22;
    for (let k = 0; k < nSurge; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = R * (0.6 + Math.random() * 0.8) / 3;
      this._puff({
        x: p.x, y: p.y + 40 + Math.random() * 120, z: p.z,
        vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, vy: 30 + Math.random() * 60,
        s0: 200, s1: 1500 + Math.random() * 900, life: 7 + Math.random() * 4,
        c0: onWater ? '#e8f2f6' : '#b9a98f', c1: onWater ? '#cfd8dc' : '#8d8377', op: 0.65,
      });
    }

    const fx = { t: 0, light, fb, ring, stemT: 0, capDone: false, life: onWater ? 26 : 40 };
    this.fx.push(fx);
    this.shake = Math.max(this.shake, THREE.MathUtils.clamp(3800 / (distCam + 1200), 0.12, 1) * 120);

    // fires on destroyed buildings near GP
    if (!onWater) {
      const dead = this.city.buildings.filter((b) => b.dead && !b.burning && Math.hypot(b.x - p.x, b.z - p.z) < R * 1.25);
      const nFire = Math.min(dead.length, 70);
      for (let k = 0; k < nFire; k++) {
        if (Math.random() > 0.45 && k > nFire * 0.5) continue;
        dead[k].burning = true;
        this._puff({
          x: dead[k].x + (Math.random() - 0.5) * 60, y: p.y + 30, z: dead[k].z + (Math.random() - 0.5) * 60,
          vy: 60 + Math.random() * 80, s0: 90, s1: 420, life: 14 + Math.random() * 22,
          c0: '#ffb347', c1: '#5c5751', op: 0.85, add: true, flicker: true, tex: this.texFire,
        });
      }
    } else {
      // steam burst on water hit
      for (let k = 0; k < 10; k++) {
        this._puff({ x: p.x + (Math.random() - 0.5) * 400, y: p.y + 60, z: p.z + (Math.random() - 0.5) * 400, vy: 200, s0: 150, s1: 900, life: 3.5, c0: '#ffffff', c1: '#dfe8ec', op: 0.8 });
      }
    }
  }

  _updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const t = f.t;

      // flash envelope
      f.light.intensity = Math.exp(-t * 5) * 26000;
      if (t > 3 && f.light.parent) { this.scene.remove(f.light); }

      // fireball
      if (f.fb.visible) {
        const grow = THREE.MathUtils.smoothstep(t, 0, 0.55);
        const s = R_FB * (0.3 + 0.85 * grow);
        f.fb.scale.setScalar(s);
        f.fb.material.color.setHSL(THREE.MathUtils.lerp(0.13, 0.02, Math.min(1, t / 2)), 1, THREE.MathUtils.lerp(0.98, 0.45, Math.min(1, t / 1.6)));
        f.fb.material.opacity = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 1.1);
        if (t > 1.6) f.fb.visible = false;
      }

      // shockwave ring
      if (f.ring.visible) {
        const r = R_RING * 5 * (1 - Math.exp(-t * 3));
        f.ring.scale.setScalar(Math.max(0.001, r));
        f.ring.material.opacity = 0.55 * Math.max(0, 1 - t / 1.6);
        if (t > 1.7) f.ring.visible = false;
      }

      // mushroom stem: column of rising puffs
      if (f.stemT !== null && t < 2.0) {
        f.stemT += dt;
        while (f.stemT > 0.045) {
          f.stemT -= 0.045;
          const k = t / 2.0;
          this._puff({
            x: f.fb.position.x + (Math.random() - 0.5) * 360, y: f.fb.position.y + 150 + k * 2800 * Math.random(), z: f.fb.position.z + (Math.random() - 0.5) * 360,
            vy: 1200 + Math.random() * 900, s0: 700, s1: 2200, life: 18 + Math.random() * 8,
            c0: '#ffd9a0', c1: '#b0a79d', op: 0.9,
          });
        }
      }
      // cap formation
      if (!f.capDone && t > 1.35) {
        f.capDone = true;
        for (let k = 0; k < 40; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rr = 150 + Math.random() * 650;
          this._puff({
            x: f.fb.position.x + Math.cos(ang) * rr, y: 3400 + (Math.random() - 0.5) * 800, z: f.fb.position.z + Math.sin(ang) * rr,
            vx: Math.cos(ang) * 340, vz: Math.sin(ang) * 340, vy: 260,
            s0: 1100, s1: 3400 + Math.random() * 1800, life: 26 + Math.random() * 14,
            c0: '#f2ece2', c1: '#a49c93', op: 0.85,
          });
        }
      }

      if (t > f.life) {
        this.scene.remove(f.fb);
        this.scene.remove(f.ring);
        this.fx.splice(i, 1);
      }
    }
  }

  update(dt) {
    this._updateBombs(dt);
    this._updateFx(dt);
    this._updatePuffs(dt);
    this.shake *= Math.exp(-dt * 2.2);
    if (this.shake < 0.05) this.shake = 0;
  }
}

const R_FB = 1700 * 0.62;   // fireball max radius scale
const R_RING = 1700;

function jitterCircle(r) {
  const pts = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + Math.random() * 0.4);
    pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
}
