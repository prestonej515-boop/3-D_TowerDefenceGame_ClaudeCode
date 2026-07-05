import * as THREE from 'three';
import { TOWERS } from '../config.js';

const _targetPos = new THREE.Vector3();

export class Tower {
  constructor(type, position, cell) {
    this.type = type;
    this.cfg = TOWERS[type];
    this.cell = cell; // { col, row }
    this.level = 0; // index into cfg.levels
    this.invested = this.cfg.cost;
    this.cooldown = 0;
    this.recoil = 0;
    this.target = null;

    this._buildMesh(position);
  }

  get stats() {
    return this.cfg.levels[this.level];
  }

  get maxLevel() {
    return this.level >= this.cfg.levels.length - 1;
  }

  get upgradeCost() {
    return this.maxLevel ? null : this.cfg.levels[this.level + 1].upgradeCost;
  }

  _buildMesh(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    const accent = new THREE.MeshStandardMaterial({ color: this.cfg.color, roughness: 0.5 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.9 });

    // base pedestal
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.7, 12), stone);
    pedestal.position.y = 0.35;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.group.add(pedestal);

    // rotating head
    this.head = new THREE.Group();
    this.head.position.y = 0.9;
    this.group.add(this.head);

    if (this.type === 'single') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.7), accent);
      body.position.y = 0.25;
      body.castShadow = true;
      this.head.add(body);
      this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), stone);
      this.barrel.rotation.x = Math.PI / 2;
      this.barrel.position.set(0, 0.3, 0.5);
      this.barrel.castShadow = true;
      this.head.add(this.barrel);
    } else if (this.type === 'splash') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), accent);
      body.position.y = 0.25;
      body.castShadow = true;
      this.head.add(body);
      this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 10), stone);
      this.barrel.rotation.x = Math.PI / 2 - 0.35; // slight upward tilt
      this.barrel.position.set(0, 0.45, 0.45);
      this.barrel.castShadow = true;
      this.head.add(this.barrel);
    } else {
      // slow tower: floating crystal
      this.barrel = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4),
        new THREE.MeshStandardMaterial({
          color: this.cfg.color,
          emissive: this.cfg.color,
          emissiveIntensity: 0.5,
          roughness: 0.3,
        })
      );
      this.barrel.position.y = 0.55;
      this.barrel.castShadow = true;
      this.head.add(this.barrel);
    }

    // muzzle world-space origin for projectiles
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.35, this.type === 'slow' ? 0 : 0.8);
    if (this.type === 'slow') this.muzzle.position.y = 0.55;
    this.head.add(this.muzzle);

    // range ring (shown when selected)
    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(this.stats.range - 0.06, this.stats.range, 48),
      new THREE.MeshBasicMaterial({
        color: this.cfg.color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.06;
    this.rangeRing.visible = false;
    this.group.add(this.rangeRing);

    // hit target for click-selection raycasts
    this.group.traverse((obj) => {
      obj.userData.tower = this;
    });
  }

  setSelected(selected) {
    this.rangeRing.visible = selected;
  }

  upgrade() {
    if (this.maxLevel) return false;
    this.invested += this.upgradeCost;
    this.level++;
    // refresh range ring & beef up the head a bit
    this.rangeRing.geometry.dispose();
    this.rangeRing.geometry = new THREE.RingGeometry(this.stats.range - 0.06, this.stats.range, 48);
    this.head.scale.setScalar(1.18);
    return true;
  }

  get sellValue() {
    return Math.floor(this.invested * 0.7);
  }

  // Targeting rule: nearest enemy to the tower, among those in range.
  acquireTarget(enemies) {
    const rangeSq = this.stats.range * this.stats.range;
    // keep current target if still valid and in range
    if (this.target && this.target.alive) {
      if (this.group.position.distanceToSquared(this.target.position) <= rangeSq) return;
    }
    this.target = null;
    let bestDistSq = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dSq = this.group.position.distanceToSquared(enemy.position);
      if (dSq <= rangeSq && dSq < bestDistSq) {
        bestDistSq = dSq;
        this.target = enemy;
      }
    }
  }

  // Returns projectile spawn options when firing this frame, else null.
  update(dt, enemies) {
    this.cooldown -= dt;

    // recoil recovery animation
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 5);
      const k = this.recoil;
      if (this.type === 'slow') {
        this.barrel.rotation.y += dt * (4 + k * 20);
        this.barrel.scale.setScalar(1 + k * 0.35);
      } else {
        this.barrel.position.z = (this.type === 'splash' ? 0.45 : 0.5) - k * 0.18;
      }
    } else if (this.type === 'slow') {
      this.barrel.rotation.y += dt * 1.2; // idle spin
    }

    this.acquireTarget(enemies);
    if (!this.target) return null;

    // rotate head to face target (slow tower has no facing)
    if (this.type !== 'slow') {
      _targetPos.copy(this.target.position);
      const dx = _targetPos.x - this.group.position.x;
      const dz = _targetPos.z - this.group.position.z;
      const desired = Math.atan2(dx, dz);
      let diff = desired - this.head.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.head.rotation.y += diff * Math.min(1, dt * 10);
    }

    if (this.cooldown <= 0) {
      this.cooldown = 1 / this.stats.fireRate;
      this.recoil = 1;
      const origin = new THREE.Vector3();
      this.muzzle.getWorldPosition(origin);
      const s = this.stats;
      return {
        origin,
        target: this.target,
        speed: this.cfg.projectileSpeed,
        size: this.cfg.projectileSize,
        color: this.cfg.projectileColor,
        damage: s.damage,
        splashRadius: s.splashRadius || 0,
        slowFactor: s.slowFactor || null,
        slowDuration: s.slowDuration || 0,
      };
    }
    return null;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
