import * as THREE from 'three';
import { EFFECTS } from '../config.js';
import { createSoftCircleTexture, createTextTexture } from '../scene/textures.js';

// Combat juice: death bursts, splash puffs, projectile trails, muzzle
// flashes, floating damage/gold numbers, and camera shake. Shake is applied
// as a temporary offset before render and removed after, so it never fights
// with OrbitControls.
export class Effects {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.particles = []; // { mesh, velocity, life, maxLife, spin }
    this.sprites = []; // trails/flashes: { sprite, life, maxLife, growth }
    this.texts = []; // floating numbers: { sprite, life, maxLife, rise }
    this.shakeTime = 0;
    this._shakeOffset = new THREE.Vector3();
    this._particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this._softTex = createSoftCircleTexture();
    this._textTexCache = new Map(); // "text|color" -> texture
  }

  // ---- particle bursts -------------------------------------------------------

  deathBurst(position, colorHex) {
    for (let i = 0; i < EFFECTS.deathParticleCount; i++) {
      const mesh = new THREE.Mesh(
        this._particleGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true })
      );
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
  }

  impactPuff(position, colorHex, radius = 0.5) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        this._particleGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true })
      );
      mesh.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * radius * 8,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * radius * 8
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.35, maxLife: 0.35 });
    }
    // expanding shockwave glow
    this._spawnGlow(position, colorHex, 1.2, 0.3, 6);
  }

  // ---- glow sprites (trails, flashes) -----------------------------------------

  _spawnGlow(position, colorHex, scale, life, growth = 0) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._softTex,
        color: colorHex,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      })
    );
    sprite.position.copy(position);
    sprite.scale.setScalar(scale);
    this.scene.add(sprite);
    this.sprites.push({ sprite, life, maxLife: life, growth });
  }

  trailPuff(position, colorHex) {
    this._spawnGlow(position, colorHex, 0.4, 0.25, -0.8);
  }

  muzzleFlash(position, colorHex) {
    this._spawnGlow(position, colorHex, 0.7, 0.09, 4);
  }

  // ---- floating text ------------------------------------------------------------

  _textTexture(text, color) {
    const key = `${text}|${color}`;
    let tex = this._textTexCache.get(key);
    if (!tex) {
      tex = createTextTexture(text, color);
      this._textTexCache.set(key, tex);
      // keep the cache bounded — damage values are heavily repeated anyway
      if (this._textTexCache.size > 200) {
        const first = this._textTexCache.keys().next().value;
        this._textTexCache.get(first).dispose();
        this._textTexCache.delete(first);
      }
    }
    return tex;
  }

  floatingText(position, text, color, scale = 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._textTexture(text, color),
        transparent: true,
        depthWrite: false,
        depthTest: false,
      })
    );
    sprite.renderOrder = 998;
    sprite.position.copy(position);
    sprite.position.y += 1.4;
    sprite.position.x += (Math.random() - 0.5) * 0.5;
    sprite.scale.setScalar(1.1 * scale);
    this.scene.add(sprite);
    this.texts.push({ sprite, life: 0.75, maxLife: 0.75, rise: 1.6 });
  }

  damageNumber(position, amount) {
    this.floatingText(position, `${Math.round(amount)}`, '#ffd45e', 0.85);
  }

  goldPopup(position, amount) {
    this.floatingText(position, `+${amount}`, '#ffe98a', 1.1);
  }

  // ---- camera shake ---------------------------------------------------------------

  shake() {
    if (this.settings && !this.settings.get('screenShake')) return;
    this.shakeTime = EFFECTS.shakeDuration;
  }

  // ---- per-frame update -------------------------------------------------------------

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
      p.velocity.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(t);
      p.mesh.material.opacity = t;
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.z += dt * 6;
    }

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.sprite);
        s.sprite.material.dispose();
        this.sprites.splice(i, 1);
        continue;
      }
      const t = s.life / s.maxLife;
      s.sprite.material.opacity = t * 0.8;
      if (s.growth) s.sprite.scale.addScalar(s.growth * dt);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose(); // texture stays cached for reuse
        this.texts.splice(i, 1);
        continue;
      }
      const t = f.life / f.maxLife;
      f.sprite.position.y += f.rise * dt;
      f.sprite.material.opacity = t < 0.5 ? t * 2 : 1;
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

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    for (const s of this.sprites) {
      this.scene.remove(s.sprite);
      s.sprite.material.dispose();
    }
    for (const f of this.texts) {
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
    }
    this.particles.length = 0;
    this.sprites.length = 0;
    this.texts.length = 0;
  }
}
