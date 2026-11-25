// Stylized bay water + drifting clouds.
import * as THREE from 'three';
import { makePuffTexture } from './agents.js';

export function makeWater(scene) {
  const geo = new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x2a6f97) },
      uShallow: { value: new THREE.Color(0x53b1d4) },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec2 vXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vXZ = wp.xz;
        // gentle swell displacement
        float w = sin(wp.x * 0.0021 + uTime * 0.9) * cos(wp.z * 0.0017 - uTime * 0.7) * 2.2;
        wp.y += w;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec2 vXZ;
      void main() {
        // moving ripple bands + fine sparkle
        float b1 = sin(vXZ.x * 0.006 + uTime * 1.1 + sin(vXZ.y * 0.004 + uTime * 0.5) * 2.0);
        float b2 = sin(vXZ.y * 0.005 - uTime * 0.9 + sin(vXZ.x * 0.0035 - uTime * 0.4) * 2.0);
        float band = (b1 + b2) * 0.25;
        float sp = pow(max(0.0, sin(vXZ.x * 0.035 + uTime * 2.2) * sin(vXZ.y * 0.03 - uTime * 1.7)), 14.0);
        vec3 col = mix(uDeep, uShallow, 0.42 + band * 0.22);
        col += sp * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  mat.fog = false; // custom shader has no fog chunks; three would write fog uniforms that don't exist
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.renderOrder = -1;
  scene.add(mesh);
  return { mesh, mat };
}

export class Clouds {
  constructor(scene, count = 48) {
    this.wind = new THREE.Vector2(9, 2.5); // m/s
    const tex = makePuffTexture(0.3);
    this.clouds = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let i = 0; i < count; i++) {
      const cluster = [];
      const cx = (Math.random() - 0.5) * 60000, cz = (Math.random() - 0.5) * 60000;
        const y = 700 + Math.random() * 700;
      const n = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, opacity: 0.16 + Math.random() * 0.2,
          depthWrite: false, color: 0xffffff,
        }));
        const sc = 2500 + Math.random() * 3500;
        s.scale.set(sc, sc * 0.45, 1);
        s.position.set(cx + (Math.random() - 0.5) * 900, y + (Math.random() - 0.5) * 120, cz + (Math.random() - 0.5) * 700);
        this.group.add(s);
        cluster.push(s);
      }
      this.clouds.push(cluster);
    }
  }

  update(dt) {
    for (const cluster of this.clouds) {
      for (const s of cluster) {
        s.position.x += this.wind.x * dt;
        s.position.z += this.wind.y * dt;
        if (s.position.x > 32000) s.position.x = -32000;
        if (s.position.z > 32000) s.position.z = -32000;
        else if (s.position.z < -32000) s.position.z = 32000;
      }
    }
  }
}
