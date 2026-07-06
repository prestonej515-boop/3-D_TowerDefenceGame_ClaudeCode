import * as THREE from 'three';
import { ENEMIES } from '../config.js';
import { getModel } from '../systems/ModelLibrary.js';

const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();

// Kenney kit UFO per enemy type; tint multiplies the model's palette so
// reused bodies stay visually distinct. Scale is relative to the raw model.
const ENEMY_MODELS = {
  basic: { model: 'enemy-ufo-a', scale: 1.3 },
  armored: { model: 'enemy-ufo-c', scale: 1.6, tint: 0x5c6470 },
  swarm: { model: 'enemy-ufo-b', scale: 0.85, tint: 0xe8a33d },
  hidden: { model: 'enemy-ufo-d', scale: 1.2, tint: 0x8a7ff0 },
  mage: { model: 'enemy-ufo-d', scale: 1.9, tint: 0x9b59d0 },
  minion: { model: 'enemy-ufo-b', scale: 0.65, tint: 0xc9a2e8 },
  boss: { model: 'enemy-ufo-c', scale: 2.8, tint: 0x8c1f1f },
};

export class Enemy {
  // modifiers: per-map difficulty multipliers { hp, speed }
  // opts: { speedMult (endless scaling), at: { position, waypointIndex } (summons) }
  constructor(type, waypoints, hpMultiplier = 1, modifiers = { hp: 1, speed: 1 }, opts = {}) {
    this.type = type;
    const cfg = ENEMIES[type];
    this.cfg = cfg;

    this.maxHp = Math.round(cfg.hp * hpMultiplier * modifiers.hp);
    this.hp = this.maxHp;
    this.baseSpeed = cfg.speed * modifiers.speed * (opts.speedMult || 1);
    this.reward = cfg.reward;
    this.livesCost = cfg.livesCost;
    this.radius = cfg.size + 0.15; // projectile collision radius

    this.hidden = !!cfg.hidden; // untargetable unless a tower seesHidden
    this.enraged = false;
    // summon bookkeeping (EnemyManager performs the actual spawns)
    this.summonTimer = cfg.summons ? cfg.summons.interval : 0;

    this.waypoints = waypoints;
    this.waypointIndex = 0;
    this.distToNext = Infinity;
    // lateral offset so swarms don't stack into a single column
    this.lateralOffset = (Math.random() - 0.5) * 1.0;

    this.alive = true;
    this.reachedEnd = false;
    // active timed effects, e.g. { type: 'slow', speedMult: 0.4, remaining: 2.6 }
    this.statusEffects = [];
    this.hitFlash = 0;
    // death squash animation state (manager keeps the mesh briefly after death)
    this.deathAnim = 0;
    this.deathHandled = false;

    this._buildMesh();
    if (opts.at) {
      // summoned mid-path at the summoner's location
      this.waypointIndex = opts.at.waypointIndex;
      this.group.position.copy(opts.at.position);
      this.group.position.y = 0;
    } else {
      this.group.position.copy(this._offsetWaypoint(0));
    }
  }

  _buildMesh() {
    const { size } = this.cfg;
    this.group = new THREE.Group();

    const spec = ENEMY_MODELS[this.type] || ENEMY_MODELS.basic;
    this._baseScale = spec.scale;
    this.body = getModel(spec.model) || new THREE.Group();
    this.body.scale.setScalar(spec.scale);
    this.body.position.y = size + 0.25;
    this.group.add(this.body);

    // clone materials per instance so hit flash / slow tint / hidden shimmer
    // can't leak across enemies sharing the cached model
    this.materials = [];
    const tint = spec.tint ? new THREE.Color(spec.tint) : null;
    this.body.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.material = obj.material.clone();
      if (tint) obj.material.color.lerp(tint, 0.45);
      if (this.hidden) {
        obj.material.transparent = true;
        obj.material.opacity = 0.35;
      }
      this.materials.push({ mat: obj.material, baseColor: obj.material.color.clone() });
    });

    // HP bar (billboarded toward camera by update)
    this.hpBar = new THREE.Group();
    const barW = this.cfg.boss ? 1.8 : 1.0;
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(barW, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x30121a, depthTest: false })
    );
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(barW, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x58d858, depthTest: false })
    );
    this.hpFill.position.z = 0.001;
    this.hpBar.add(this.hpBarBg);
    this.hpBar.add(this.hpFill);
    this.hpBar.position.y = this.cfg.size * 2 + 0.8;
    this.hpBar.renderOrder = 999;
    this.group.add(this.hpBar);
    this.barW = barW;
  }

  _offsetWaypoint(index) {
    const wp = this.waypoints[index].clone();
    const next = this.waypoints[Math.min(index + 1, this.waypoints.length - 1)];
    const prev = this.waypoints[Math.max(index - 1, 0)];
    _dir.subVectors(next, prev).normalize();
    _perp.set(-_dir.z, 0, _dir.x);
    wp.addScaledVector(_perp, this.lateralOffset);
    return wp;
  }

  get position() {
    return this.group.position;
  }

  get speed() {
    let mult = 1;
    for (const fx of this.statusEffects) {
      if (fx.speedMult != null) mult = Math.min(mult, fx.speedMult);
    }
    if (this.enraged) mult *= this.cfg.enrage.speedMult;
    return this.baseSpeed * mult;
  }

  // Monotonic path-progress metric for 'first' targeting: waypoint index plus
  // closeness to the next waypoint.
  get progress() {
    return this.waypointIndex + 1 / (1 + this.distToNext);
  }

  update(dt, cameraQuaternion) {
    if (!this.alive) {
      // death squash: flatten & widen, then the manager removes us
      this.deathAnim += dt;
      const k = Math.min(this.deathAnim / 0.18, 1);
      const s = this._baseScale;
      this.body.scale.set(s * (1 + k * 0.6), Math.max(s * (1 - k), 0.02), s * (1 + k * 0.6));
      this.hpBar.visible = false;
      return;
    }

    if (this.statusEffects.length) {
      for (let i = this.statusEffects.length - 1; i >= 0; i--) {
        const fx = this.statusEffects[i];
        fx.remaining -= dt;
        if (fx.dps) this.takeDamage(fx.dps * dt);
        if (fx.remaining <= 0) this.statusEffects.splice(i, 1);
      }
      this._refreshTint();
    }

    if (this.waypointIndex < this.waypoints.length - 1) {
      const target = this._offsetWaypoint(this.waypointIndex + 1);
      _dir.subVectors(target, this.group.position);
      _dir.y = 0;
      const dist = _dir.length();
      this.distToNext = dist;
      const step = this.speed * dt;
      if (dist <= step) {
        this.group.position.copy(target);
        this.waypointIndex++;
        if (this.waypointIndex >= this.waypoints.length - 1) {
          this.reachedEnd = true;
        }
      } else {
        _dir.normalize();
        this.group.position.addScaledVector(_dir, step);
        this.group.rotation.y = Math.atan2(_dir.x, _dir.z);
      }
    } else {
      this.reachedEnd = true;
    }

    // hover bob for a bit of life (UFOs float)
    this.body.position.y = this.cfg.size + 0.25 + Math.sin(performance.now() * 0.008 + this.lateralOffset * 10) * 0.06;

    // hidden shimmer: opacity pulse marks "here but untargetable"
    if (this.hidden) {
      const opacity = 0.28 + 0.14 * (0.5 + 0.5 * Math.sin(performance.now() * 0.004 + this.lateralOffset * 6));
      for (const { mat } of this.materials) mat.opacity = opacity;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt * 6;
      const intensity = this.hitFlash > 0 ? this.hitFlash * 0.5 : 0;
      const hex = this.hitFlash > 0 ? 0xffffff : 0x000000;
      if (this.hitFlash <= 0) this.hitFlash = 0;
      for (const { mat } of this.materials) {
        mat.emissive.setHex(hex);
        mat.emissiveIntensity = intensity;
      }
    }

    this.hpBar.quaternion.copy(cameraQuaternion);
    const ratio = Math.max(this.hp / this.maxHp, 0);
    this.hpFill.scale.x = ratio;
    this.hpFill.position.x = -(1 - ratio) * this.barW * 0.5;
  }

  // returns actual damage dealt (for per-tower stat attribution)
  takeDamage(amount) {
    if (!this.alive) return 0;
    const dealt = Math.min(amount, this.hp);
    this.hp -= amount;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.alive = false;
    } else if (this.cfg.enrage && !this.enraged && this.hp / this.maxHp <= this.cfg.enrage.hpThreshold) {
      this.enraged = true;
      this._refreshTint();
    }
    return dealt;
  }

  // Adds or refreshes a named timed effect. `params` may set speedMult
  // (slows/stuns) and/or dps (burn/poison); same-type effects keep the
  // stronger speedMult and the longer remaining duration.
  applyEffect(type, params, duration) {
    const existing = this.statusEffects.find((e) => e.type === type);
    if (existing) {
      if (params.speedMult != null) existing.speedMult = Math.min(existing.speedMult ?? 1, params.speedMult);
      if (params.dps != null) existing.dps = params.dps;
      existing.remaining = Math.max(existing.remaining, duration);
    } else {
      this.statusEffects.push({ type, remaining: duration, ...params });
    }
    this._refreshTint();
  }

  applySlow(factor, duration) {
    this.applyEffect('slow', { speedMult: factor }, duration);
  }

  _refreshTint() {
    const slowed = this.statusEffects.some((fx) => fx.speedMult != null && fx.speedMult < 1);
    for (const { mat, baseColor } of this.materials) {
      if (slowed) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0x66ccff), 0.55);
      } else if (this.enraged) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0xff5020), 0.6);
      } else {
        mat.color.copy(baseColor);
      }
    }
  }

  dispose() {
    // model geometry is shared with the ModelLibrary cache — only dispose
    // per-instance resources (cloned materials + the HP bar)
    for (const { mat } of this.materials) mat.dispose();
    this.hpBarBg.geometry.dispose();
    this.hpBarBg.material.dispose();
    this.hpFill.geometry.dispose();
    this.hpFill.material.dispose();
  }
}
