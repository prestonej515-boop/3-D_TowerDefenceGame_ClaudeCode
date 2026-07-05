import * as THREE from 'three';
import { EFFECTS } from '../config.js';

// Lightweight juice: enemy death particle bursts and camera shake.
// Shake is applied as a temporary offset before render and removed after,
// so it never fights with OrbitControls.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = []; // { mesh, velocity, life, maxLife }
    this.shakeTime = 0;
    this._shakeOffset = new THREE.Vector3();
    this._particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  }

  deathBurst(position, colorHex) {
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true });
    for (let i = 0; i < EFFECTS.deathParticleCount; i++) {
      const mesh = new THREE.Mesh(this._particleGeo, mat.clone());
      mesh.position.copy(position);
      mesh.position.y += 0.6;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 6
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: EFFECTS.deathParticleLife, maxLife: EFFECTS.deathParticleLife });
    }
    mat.dispose();
  }

  impactPuff(position, colorHex, radius = 0.5) {
    // smaller burst for splash impacts
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this._particleGeo, mat.clone());
      mesh.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * radius * 8,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * radius * 8
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.35, maxLife: 0.35 });
    }
    mat.dispose();
  }

  shake() {
    this.shakeTime = EFFECTS.shakeDuration;
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= 12 * dt; // gravity
      p.mesh.position.addScaledVector(p.velocity, dt);
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(t);
      p.mesh.material.opacity = t;
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.z += dt * 6;
    }
    if (this.shakeTime > 0) this.shakeTime -= dt;
  }

  applyShake(camera) {
    if (this.shakeTime <= 0) return;
    const k = (this.shakeTime / EFFECTS.shakeDuration) * EFFECTS.shakeMagnitude;
    this._shakeOffset.set(
      (Math.random() - 0.5) * k,
      (Math.random() - 0.5) * k,
      (Math.random() - 0.5) * k
    );
    camera.position.add(this._shakeOffset);
  }

  removeShake(camera) {
    if (this._shakeOffset.lengthSq() === 0) return;
    camera.position.sub(this._shakeOffset);
    this._shakeOffset.set(0, 0, 0);
  }
}
