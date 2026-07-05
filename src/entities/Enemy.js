import * as THREE from 'three';
import { ENEMIES } from '../config.js';

const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();

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
    const { color, size } = this.cfg;
    this.group = new THREE.Group();

    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    this.baseColor = new THREE.Color(color);
    if (this.hidden) {
      // ghostly: transparent with a shimmer pulse (see update) so the player
      // reads "present but untargetable" rather than a rendering bug
      this.material.transparent = true;
      this.material.opacity = 0.35;
      this.material.emissive.setHex(color);
      this.material.emissiveIntensity = 0.25;
    }

    let bodyGeo;
    if (this.type === 'armored' || this.type === 'boss') {
      bodyGeo = new THREE.BoxGeometry(size * 1.6, size * 1.6, size * 1.9);
    } else if (this.type === 'swarm' || this.type === 'minion') {
      bodyGeo = new THREE.SphereGeometry(size, 10, 8);
    } else {
      bodyGeo = new THREE.CapsuleGeometry(size * 0.7, size, 4, 8);
    }
    this.body = new THREE.Mesh(bodyGeo, this.material);
    this.body.position.y = size + 0.25;
    this.body.castShadow = true;
    this.group.add(this.body);

    // simple toony face: two dark eyes on the leading side (+z = travel dir)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4 });
    const eyeGeo = new THREE.SphereGeometry(size * 0.14, 6, 5);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * size * 0.32, size * 0.25, size * (this.type === 'armored' ? 0.96 : 0.75));
      this.body.add(eye);
    }

    if (this.type === 'armored') {
      // helmet ridge + armor plate
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.8, size * 0.4, size * 2.0),
        new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.5 })
      );
      plate.position.y = size * 0.9;
      this.body.add(plate);
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.3, size * 0.5, size * 1.6),
        new THREE.MeshStandardMaterial({ color: 0xb8452f, roughness: 0.6 })
      );
      ridge.position.y = size * 1.15;
      this.body.add(ridge);
    } else if (this.type === 'mage') {
      // wizard hat + staff so the summoner reads as a caster
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.55, size * 1.1, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a1f7a, roughness: 0.6 })
      );
      hat.position.y = size * 1.15;
      hat.castShadow = true;
      this.body.add(hat);
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, size * 2.0),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 })
      );
      staff.position.set(size * 0.75, 0, size * 0.2);
      this.body.add(staff);
      this.staffOrb = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.2, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xc9a2e8, emissive: 0xb060e8, emissiveIntensity: 1.5 })
      );
      this.staffOrb.position.set(size * 0.75, size * 1.05, size * 0.2);
      this.body.add(this.staffOrb);
    } else if (this.type === 'boss') {
      // heavy armor plate, horns, and a crown ridge — the wave anchor
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.85, size * 0.45, size * 2.05),
        new THREE.MeshStandardMaterial({ color: 0x2a2228, roughness: 0.4, metalness: 0.6 })
      );
      plate.position.y = size * 0.9;
      this.body.add(plate);
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.5 });
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(size * 0.18, size * 0.7, 6), hornMat);
        horn.position.set(side * size * 0.6, size * 1.25, size * 0.3);
        horn.rotation.z = -side * 0.5;
        horn.castShadow = true;
        this.body.add(horn);
      }
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.35, size * 0.6, size * 1.7),
        new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.45, metalness: 0.5 })
      );
      ridge.position.y = size * 1.2;
      this.body.add(ridge);
    }

    // HP bar (billboarded toward camera by update)
    this.hpBar = new THREE.Group();
    const barW = this.cfg.boss ? 1.8 : 1.0;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(barW, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x30121a, depthTest: false })
    );
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(barW, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x58d858, depthTest: false })
    );
    this.hpFill.position.z = 0.001;
    this.hpBar.add(bg);
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
      this.body.scale.set(1 + k * 0.6, Math.max(1 - k, 0.05), 1 + k * 0.6);
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

    // bob for a bit of life
    this.body.position.y = this.cfg.size + 0.25 + Math.sin(performance.now() * 0.008 + this.lateralOffset * 10) * 0.06;

    // hidden shimmer: opacity pulse marks "here but untargetable"
    if (this.hidden) {
      this.material.opacity = 0.28 + 0.14 * (0.5 + 0.5 * Math.sin(performance.now() * 0.004 + this.lateralOffset * 6));
    }

    if (this.staffOrb) {
      this.staffOrb.material.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.006) * 0.5;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt * 6;
      if (this.hitFlash <= 0) {
        this.hitFlash = 0;
        this.material.emissive.setHex(0x000000);
      } else {
        this.material.emissive.setHex(0xffffff);
        this.material.emissiveIntensity = this.hitFlash * 0.5;
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
    if (slowed) {
      this.material.color.copy(this.baseColor).lerp(new THREE.Color(0x66ccff), 0.55);
    } else if (this.enraged) {
      this.material.color.copy(this.baseColor).lerp(new THREE.Color(0xff5020), 0.6);
    } else {
      this.material.color.copy(this.baseColor);
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
