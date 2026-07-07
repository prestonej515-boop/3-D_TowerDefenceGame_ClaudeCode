import * as THREE from 'three';
import { ENEMIES } from '../config.js';
import { getModel } from '../systems/ModelLibrary.js';
import { createChickenInstance, createRoastedChicken } from '../systems/ChickenModel.js';

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
  // chicken: skinned GLB via ChickenModel (model/scale/tint are the fallback
  // UFO used if the chicken hasn't finished loading)
  boss: { chicken: true, animation: 'walk01', chickenScale: 5.0, model: 'enemy-ufo-c', scale: 2.8, tint: 0x8c1f1f },
  chick: { chicken: true, animation: 'run01', chickenScale: 1.6, model: 'enemy-ufo-b', scale: 0.6, tint: 0xffd94d },
  bossDunes: { model: 'enemy-ufo-c', scale: 2.6, tint: 0xd08a3d },
  colossusHalf: { model: 'enemy-ufo-c', scale: 1.8, tint: 0xc47a35 },
  bossGlacier: { model: 'enemy-ufo-d', scale: 2.6, tint: 0x7fd4e8 },
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
    this.shielded = false; // shieldedBySummons bosses (managed by EnemyManager)
    this.activeMinions = []; // enemies this one summoned (for the shield link)
    // summon bookkeeping (EnemyManager performs the actual spawns);
    // summons.initial lets a boss open with an early first summon
    this.summonTimer = cfg.summons ? (cfg.summons.initial ?? cfg.summons.interval) : 0;

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
    this.mixer = null;
    let usingChicken = false;

    if (spec.chicken) {
      const instance = createChickenInstance();
      if (instance) {
        usingChicken = true;
        this._baseScale = 1;
        // body pivot sits at torso height (projectiles aim at the body
        // origin); the scaled model hangs below so its feet touch the path
        this.body = new THREE.Group();
        instance.model.scale.setScalar(spec.chickenScale);
        instance.model.position.y = -size;
        this.body.add(instance.model);
        this.body.position.y = size + 0.25;
        this.group.add(this.body);

        const clip = THREE.AnimationClip.findByName(instance.clips, spec.animation) || instance.clips[0];
        if (clip) {
          this.mixer = new THREE.AnimationMixer(instance.model);
          const action = this.mixer.clipAction(clip);
          action.time = Math.random() * clip.duration; // desync the flock
          action.play();
        }

        // boss death cinematic needs these: swap the walk clip for a panicked
        // flap, then replace the bird with the roast prop
        if (this.cfg.boss) {
          this.isChickenBoss = true;
          this._chickenModel = instance.model;
          this._chickenClips = instance.clips;
          this._chickenScale = spec.chickenScale;
        }
      }
    }

    if (!usingChicken) {
      this._baseScale = spec.scale;
      this.body = getModel(spec.model) || new THREE.Group();
      this.body.scale.setScalar(spec.scale);
      this.body.position.y = size + 0.25;
      this.group.add(this.body);
    }

    // clone materials per instance so hit flash / slow tint / hidden shimmer
    // can't leak across enemies sharing the cached model
    this.materials = [];
    const tint = !usingChicken && spec.tint ? new THREE.Color(spec.tint) : null;
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
      this.deathAnim += dt;
      this.hpBar.visible = false;
      if (this.isChickenBoss && this._updateBossDeath(dt)) return;
      // death squash: flatten & widen, then the manager removes us
      const k = Math.min(this.deathAnim / 0.18, 1);
      const s = this._baseScale;
      this.body.scale.set(s * (1 + k * 0.6), Math.max(s * (1 - k), 0.02), s * (1 + k * 0.6));
      return;
    }

    if (this.statusEffects.length) {
      for (let i = this.statusEffects.length - 1; i >= 0; i--) {
        const fx = this.statusEffects[i];
        fx.remaining -= dt;
        if (fx.dps) this.takeDamage(fx.dps * dt, true);
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

    if (this.mixer) {
      // chicken walk/run cycle; tracks slows/enrage via effective speed
      this.mixer.update(dt * (this.baseSpeed > 0 ? this.speed / this.baseSpeed : 1));
    } else {
      // hover bob for a bit of life (UFOs float)
      this.body.position.y = this.cfg.size + 0.25 + Math.sin(performance.now() * 0.008 + this.lateralOffset * 10) * 0.06;
    }

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

  // returns actual damage dealt (for per-tower stat attribution).
  // quiet: skip the white hit flash (per-frame DoT ticks would strobe it)
  takeDamage(amount, quiet = false) {
    if (!this.alive) return 0;
    // shielded summoners shrug off 90% of damage while their escort lives
    if (this.shielded) amount *= 0.1;
    const dealt = Math.min(amount, this.hp);
    this.hp -= amount;
    if (!quiet) this.hitFlash = 1;
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
      if (params.dps != null) existing.dps = Math.max(existing.dps ?? 0, params.dps);
      existing.remaining = Math.max(existing.remaining, duration);
    } else {
      this.statusEffects.push({ type, remaining: duration, ...params });
    }
    this._refreshTint();
  }

  applySlow(factor, duration) {
    this.applyEffect('slow', { speedMult: factor }, duration);
  }

  applyBurn(dps, duration) {
    this.applyEffect('burn', { dps }, duration);
  }

  // called by EnemyManager as its summoned escort lives/dies
  setShielded(on) {
    if (this.shielded === on) return;
    this.shielded = on;
    if (this.hpFill) this.hpFill.material.color.setHex(on ? 0x4ecbd4 : 0x58d858);
    this._refreshTint();
  }

  _refreshTint() {
    const slowed = this.statusEffects.some((fx) => fx.speedMult != null && fx.speedMult < 1);
    const burning = this.statusEffects.some((fx) => fx.dps != null && fx.dps > 0);
    for (const { mat, baseColor } of this.materials) {
      if (this.shielded) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0x9fe8ff), 0.65);
      } else if (slowed) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0x66ccff), 0.55);
      } else if (burning) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0xff7a1a), 0.55);
      } else if (this.enraged) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0xff5020), 0.6);
      } else {
        mat.color.copy(baseColor);
      }
    }
  }

  // Boss death cinematic: panic-flap launch into the air, land as the roasted
  // chicken prop (the brood erupts from it via the manager's delayed spawn),
  // then flatten away at the end of the linger. Returns false to fall back to
  // the generic squash (roast prop unavailable).
  _updateBossDeath(dt) {
    const t = this.deathAnim;
    const baseY = this.cfg.size + 0.25;
    const LAUNCH = 1.0; // keep in sync with cfg.spawnOnDeath.delay — chicks erupt on landing
    const linger = this.cfg.deathLinger || 2.2;

    if (t < LAUNCH) {
      if (!this._deathFlap) {
        this._deathFlap = true;
        if (this.mixer) {
          this.mixer.stopAllAction();
          const clip =
            THREE.AnimationClip.findByName(this._chickenClips, 'flap') ||
            THREE.AnimationClip.findByName(this._chickenClips, 'chicken_scared01');
          if (clip) this.mixer.clipAction(clip).play();
        }
      }
      if (this.mixer) this.mixer.update(dt * 2.2); // frantic flapping
      const u = t / LAUNCH;
      this.body.position.y = baseY + 10 * u * (1 - u); // ballistic arc, peaks at 2.5
      this.body.rotation.y += dt * 9; // death spiral
      return true;
    }

    if (!this._roast) {
      const roast = createRoastedChicken();
      if (!roast) {
        this.isChickenBoss = false; // fall back to the generic squash
        return false;
      }
      if (this.mixer) this.mixer.stopAllAction();
      this._chickenModel.visible = false;
      this.body.position.y = baseY;
      this.body.rotation.y = 0;
      roast.scale.multiplyScalar(this._chickenScale);
      roast.position.y = -this.cfg.size; // sit on the path like the live model
      // clone materials per instance so dispose() cleans them with the rest
      roast.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.material = obj.material.clone();
        this.materials.push({ mat: obj.material, baseColor: obj.material.color.clone() });
      });
      this.body.add(roast);
      this._roast = roast;
      this._roastBaseScale = roast.scale.clone();
    }

    // landing squash-bounce, then flatten away over the final stretch
    const sinceLand = t - LAUNCH;
    const bounce = sinceLand < 0.2 ? 1 + 0.35 * (1 - sinceLand / 0.2) : 1;
    const flatten = Math.max(0, (t - (linger - 0.35)) / 0.35);
    this._roast.scale.set(
      this._roastBaseScale.x * bounce * (1 + flatten * 0.6),
      Math.max((this._roastBaseScale.y * (1 - flatten)) / bounce, 0.0005),
      this._roastBaseScale.z * bounce * (1 + flatten * 0.6)
    );
    return true;
  }

  dispose() {
    // model geometry is shared with the ModelLibrary cache — only dispose
    // per-instance resources (cloned materials + the HP bar)
    if (this.mixer) this.mixer.stopAllAction();
    for (const { mat } of this.materials) mat.dispose();
    this.hpBarBg.geometry.dispose();
    this.hpBarBg.material.dispose();
    this.hpFill.geometry.dispose();
    this.hpFill.material.dispose();
  }
}
