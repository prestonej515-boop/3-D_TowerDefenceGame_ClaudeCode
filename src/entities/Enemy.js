import * as THREE from 'three';
import { ENEMIES } from '../config.js';

const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();

export class Enemy {
  // modifiers: per-map difficulty multipliers { hp, speed }
  constructor(type, waypoints, hpMultiplier = 1, modifiers = { hp: 1, speed: 1 }) {
    this.type = type;
    const cfg = ENEMIES[type];
    this.cfg = cfg;

    this.maxHp = Math.round(cfg.hp * hpMultiplier * modifiers.hp);
    this.hp = this.maxHp;
    this.baseSpeed = cfg.speed * modifiers.speed;
    this.reward = cfg.reward;
    this.livesCost = cfg.livesCost;
    this.radius = cfg.size + 0.15; // projectile collision radius

    this.waypoints = waypoints;
    this.waypointIndex = 0;
    this.distToNext = Infinity;
    // lateral offset so swarms don't stack into a single column
    this.lateralOffset = (Math.random() - 0.5) * 1.0;

    this.alive = true;
    this.reachedEnd = false;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.hitFlash = 0;
    // death squash animation state (manager keeps the mesh briefly after death)
    this.deathAnim = 0;
    this.deathHandled = false;

    this._buildMesh();
    this.group.position.copy(this._offsetWaypoint(0));
  }

  _buildMesh() {
    const { color, size } = this.cfg;
    this.group = new THREE.Group();

    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    this.baseColor = new THREE.Color(color);

    let bodyGeo;
    if (this.type === 'armored') {
      bodyGeo = new THREE.BoxGeometry(size * 1.6, size * 1.6, size * 1.9);
    } else if (this.type === 'swarm') {
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
    }

    // HP bar (billboarded toward camera by update)
    this.hpBar = new THREE.Group();
    const barW = 1.0;
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
    return this.baseSpeed * this.slowFactor;
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

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowFactor = 1;
        this._refreshTint();
      }
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
    }
    return dealt;
  }

  applySlow(factor, duration) {
    this.slowFactor = Math.min(this.slowFactor, factor); // strongest slow wins
    this.slowTimer = Math.max(this.slowTimer, duration);
    this._refreshTint();
  }

  _refreshTint() {
    if (this.slowFactor < 1) {
      this.material.color.copy(this.baseColor).lerp(new THREE.Color(0x66ccff), 0.55);
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
