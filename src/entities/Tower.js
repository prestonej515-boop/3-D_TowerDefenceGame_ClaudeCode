import * as THREE from 'three';
import { TOWERS } from '../config.js';

const _targetPos = new THREE.Vector3();
const DPS_WINDOW = 10; // seconds of damage history for the live DPS meter

export const TARGETING_MODES = ['nearest', 'first', 'strongest'];

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
    this.targetingMode = 'nearest';

    // combat stats (for the DPS meter / panel)
    this.time = 0; // local clock, advanced in update
    this.totalDamage = 0;
    this.kills = 0;
    this.damageLog = []; // [{ time, amount }], pruned to DPS_WINDOW

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

  get nextStats() {
    return this.maxLevel ? null : this.cfg.levels[this.level + 1];
  }

  get theoreticalDps() {
    return this.stats.damage * this.stats.fireRate;
  }

  // Whether this tower can target hidden enemies at its current tier.
  // The Cannon is hard-excluded regardless of tier (neverSeesHidden).
  get canSeeHidden() {
    return !this.cfg.neverSeesHidden && !!this.stats.seesHidden;
  }

  get liveDps() {
    let total = 0;
    for (const entry of this.damageLog) total += entry.amount;
    // use the actual observed window so freshly placed towers aren't diluted
    const span = Math.min(DPS_WINDOW, Math.max(this.time - (this.damageLog[0]?.time ?? this.time), 1));
    return total / span;
  }

  recordDamage(amount, killed) {
    this.totalDamage += amount;
    if (killed) this.kills++;
    this.damageLog.push({ time: this.time, amount });
  }

  _pruneDamageLog() {
    const cutoff = this.time - DPS_WINDOW;
    while (this.damageLog.length && this.damageLog[0].time < cutoff) this.damageLog.shift();
  }

  // ---- meshes -----------------------------------------------------------------

  _buildMesh(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    const accent = new THREE.MeshStandardMaterial({ color: this.cfg.color, roughness: 0.5 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x40454e, roughness: 0.5, metalness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.35, metalness: 0.6 });

    // pedestal with a brick lip
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.92, 0.7, 12), stone);
    pedestal.position.y = 0.35;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.group.add(pedestal);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.07, 8, 16), stone);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.72;
    this.group.add(lip);

    // rotating head
    this.head = new THREE.Group();
    this.head.position.y = 0.9;
    this.group.add(this.head);

    // level-2 parts start hidden, revealed on upgrade
    this.lvl2Parts = new THREE.Group();
    this.lvl2Parts.visible = false;

    if (this.type === 'single') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.72), accent);
      body.position.y = 0.25;
      body.castShadow = true;
      this.head.add(body);

      // twin barrels
      this.barrels = [];
      for (const side of [-1, 1]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), dark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(side * 0.16, 0.3, 0.5);
        barrel.castShadow = true;
        this.head.add(barrel);
        this.barrels.push(barrel);
      }
      // ammo box
      const ammo = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.4), dark);
      ammo.position.set(-0.42, 0.25, -0.1);
      this.head.add(ammo);

      // lvl2: muzzle brakes + antenna
      for (const side of [-1, 1]) {
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 8), gold);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(side * 0.16, 0.3, 0.82);
        this.lvl2Parts.add(brake);
      }
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), dark);
      antenna.position.set(0.25, 0.65, -0.2);
      this.lvl2Parts.add(antenna);
      this.head.add(this.lvl2Parts);
    } else if (this.type === 'splash') {
      const mount = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), accent);
      mount.position.y = 0.22;
      mount.castShadow = true;
      this.head.add(mount);

      this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.85, 10), dark);
      this.barrel.rotation.x = Math.PI / 2 - 0.35; // upward tilt
      this.barrel.position.set(0, 0.45, 0.42);
      this.barrel.castShadow = true;
      this.head.add(this.barrel);

      // rivet rings on the barrel
      for (const offset of [-0.22, 0.18]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 12), accent);
        ring.position.set(0, 0.45 - offset * Math.sin(0.35), 0.42 + offset * Math.cos(0.35));
        ring.rotation.x = -0.35;
        this.barrel.getWorldPosition; // keep alignment simple: attach to head
        this.head.add(ring);
      }

      // wheels
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.42, 0.1, 0.1);
        wheel.castShadow = true;
        this.head.add(wheel);
      }

      // lvl2: gold muzzle band + bigger powder keg
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 6, 12), gold);
      band.position.set(0, 0.45 + 0.38 * Math.sin(0.35), 0.42 + 0.38 * Math.cos(0.35));
      band.rotation.x = -0.35;
      this.lvl2Parts.add(band);
      const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), gold);
      keg.position.set(-0.35, 0.3, -0.3);
      this.lvl2Parts.add(keg);
      this.head.add(this.lvl2Parts);
    } else if (this.type === 'sniper') {
      // long rifle on a tripod mount with a scope
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.5), accent);
      mount.position.y = 0.17;
      mount.castShadow = true;
      this.head.add(mount);

      this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8), dark);
      this.barrel.rotation.x = Math.PI / 2;
      this.barrel.position.set(0, 0.42, 0.55);
      this.barrel.castShadow = true;
      this.head.add(this.barrel);

      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.56, 0.1);
      this.head.add(scope);
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.055, 8),
        new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x3f8caf, emissiveIntensity: 0.8 })
      );
      lens.position.set(0, 0.56, 0.245);
      this.head.add(lens);

      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), dark);
        leg.position.set(side * 0.2, 0.2, 0.45);
        leg.rotation.z = side * 0.5;
        this.head.add(leg);
      }

      // lvl2: muzzle brake + longer scope
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 8), gold);
      brake.rotation.x = Math.PI / 2;
      brake.position.set(0, 0.42, 1.2);
      this.lvl2Parts.add(brake);
      const scope2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), gold);
      scope2.rotation.x = Math.PI / 2;
      scope2.position.set(0, 0.56, -0.12);
      this.lvl2Parts.add(scope2);
      this.head.add(this.lvl2Parts);
    } else if (this.type === 'mortar') {
      // stubby high-angle tube on a base plate
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.16, 10), dark);
      plate.position.y = 0.08;
      plate.castShadow = true;
      this.head.add(plate);

      this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 10), accent);
      this.barrel.rotation.x = Math.PI / 2 - 1.05; // steep upward tilt
      this.barrel.position.set(0, 0.5, 0.18);
      this.barrel.castShadow = true;
      this.head.add(this.barrel);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.045, 6, 12), dark);
      rim.position.set(0, 0.5 + 0.4 * Math.cos(1.05), 0.18 + 0.4 * Math.sin(1.05));
      rim.rotation.x = -1.05;
      this.head.add(rim);

      // support struts
      for (const side of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), dark);
        strut.position.set(side * 0.3, 0.32, -0.12);
        strut.rotation.x = -0.35;
        this.head.add(strut);
      }

      // lvl2: gold muzzle ring + shell rack
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.04, 6, 12), gold);
      band.position.copy(rim.position);
      band.rotation.x = -1.05;
      this.lvl2Parts.add(band);
      for (let i = 0; i < 3; i++) {
        const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 6), gold);
        shell.position.set(-0.42, 0.18, -0.15 + i * 0.15);
        this.lvl2Parts.add(shell);
      }
      this.head.add(this.lvl2Parts);
    } else {
      // frost tower: crystal cluster + orbiting shards
      const crystalMat = new THREE.MeshStandardMaterial({
        color: this.cfg.color,
        emissive: this.cfg.color,
        emissiveIntensity: 0.6,
        roughness: 0.25,
      });
      this.barrel = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), crystalMat);
      this.barrel.position.y = 0.6;
      this.barrel.scale.y = 1.5;
      this.barrel.castShadow = true;
      this.head.add(this.barrel);

      for (const [x, z, s] of [[0.26, 0.1, 0.5], [-0.22, -0.14, 0.42]]) {
        const side = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), crystalMat);
        side.position.set(x, 0.28, z);
        side.scale.y = 1.4 * s / 0.4;
        side.castShadow = true;
        this.head.add(side);
      }

      // orbiting shard ring (animated in update)
      this.shardRing = new THREE.Group();
      this.shardRing.position.y = 0.6;
      const shardCount = 3;
      for (let i = 0; i < shardCount; i++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), crystalMat);
        const a = (i / shardCount) * Math.PI * 2;
        shard.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
        this.shardRing.add(shard);
      }
      this.head.add(this.shardRing);

      // lvl2: crown of extra shards
      for (let i = 0; i < 4; i++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), crystalMat);
        const a = (i / 4) * Math.PI * 2 + 0.4;
        shard.position.set(Math.cos(a) * 0.45, 1.05, Math.sin(a) * 0.45);
        shard.scale.y = 1.6;
        this.lvl2Parts.add(shard);
      }
      this.head.add(this.lvl2Parts);
    }

    // tier-3 parts: a shared gold "rank crown" around the head, hidden until
    // the final upgrade (per-type lvl2Parts carry the mid-tier flair)
    this.lvl3Parts = new THREE.Group();
    this.lvl3Parts.visible = false;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 20), gold);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.05;
    this.lvl3Parts.add(crown);
    for (let i = 0; i < 4; i++) {
      const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), gold);
      const a = (i / 4) * Math.PI * 2;
      stud.position.set(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55);
      this.lvl3Parts.add(stud);
    }
    this.head.add(this.lvl3Parts);

    // projectile spawn point
    const muzzleY = { slow: 0.6, sniper: 0.42, mortar: 0.75 }[this.type] ?? 0.32;
    const muzzleZ = { slow: 0, sniper: 1.1, mortar: 0.35 }[this.type] ?? 0.85;
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, muzzleY, muzzleZ);
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

    // click-selection back-pointer
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
    this.rangeRing.geometry.dispose();
    this.rangeRing.geometry = new THREE.RingGeometry(this.stats.range - 0.06, this.stats.range, 48);
    const tierParts = this.level === 1 ? this.lvl2Parts : this.lvl3Parts;
    tierParts.visible = true;
    tierParts.traverse((obj) => {
      obj.userData.tower = this;
    });
    return true;
  }

  get sellValue() {
    return Math.floor(this.invested * 0.7);
  }

  setTargetingMode(mode) {
    if (TARGETING_MODES.includes(mode)) {
      this.targetingMode = mode;
      this.target = null; // re-acquire with the new rule
    }
  }

  // Targeting: pick per mode among enemies in range.
  //  - nearest: closest to the tower
  //  - first: furthest along the path
  //  - strongest: highest current HP
  // Hidden enemies are only targetable when canSeeHidden; towers with a
  // minRange (mortar) can't hit enemies closer than it.
  _canTarget(enemy, dSq, rangeSq, minSq) {
    if (dSq > rangeSq || dSq < minSq) return false;
    if (enemy.hidden && !this.canSeeHidden) return false;
    return true;
  }

  acquireTarget(enemies) {
    const rangeSq = this.stats.range * this.stats.range;
    const minR = this.stats.minRange || 0;
    const minSq = minR * minR;
    if (this.target && this.target.alive) {
      const dSq = this.group.position.distanceToSquared(this.target.position);
      if (this._canTarget(this.target, dSq, rangeSq, minSq)) return;
    }
    this.target = null;
    let bestScore = -Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dSq = this.group.position.distanceToSquared(enemy.position);
      if (!this._canTarget(enemy, dSq, rangeSq, minSq)) continue;
      let score;
      if (this.targetingMode === 'first') score = enemy.progress;
      else if (this.targetingMode === 'strongest') score = enemy.hp;
      else score = -dSq; // nearest
      if (score > bestScore) {
        bestScore = score;
        this.target = enemy;
      }
    }
  }

  // Returns projectile spawn options when firing this frame, else null.
  update(dt, enemies) {
    this.time += dt;
    this.cooldown -= dt;
    this._pruneDamageLog();

    // recoil / idle animation
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 5);
      const k = this.recoil;
      if (this.type === 'slow') {
        this.barrel.rotation.y += dt * (4 + k * 20);
        this.barrel.scale.setScalar(1 + k * 0.35);
        this.barrel.scale.y = 1.5 * (1 + k * 0.35);
      } else if (this.type === 'splash') {
        this.barrel.position.z = 0.42 - k * 0.2;
      } else if (this.type === 'sniper') {
        this.barrel.position.z = 0.55 - k * 0.28;
      } else if (this.type === 'mortar') {
        this.barrel.position.y = 0.5 - k * 0.12;
      } else {
        for (const b of this.barrels) b.position.z = 0.5 - k * 0.16;
      }
    } else if (this.type === 'slow') {
      this.barrel.rotation.y += dt * 1.2;
    }
    if (this.shardRing) this.shardRing.rotation.y += dt * (this.recoil > 0 ? 6 : 1.8);

    this.acquireTarget(enemies);
    if (!this.target) return null;

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
        sourceTower: this,
        speed: this.cfg.projectileSpeed,
        size: this.cfg.projectileSize,
        color: this.cfg.projectileColor,
        damage: s.damage,
        splashRadius: s.splashRadius || 0,
        slowFactor: s.slowFactor || null,
        slowDuration: s.slowDuration || 0,
        arc: !!this.cfg.arc,
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
