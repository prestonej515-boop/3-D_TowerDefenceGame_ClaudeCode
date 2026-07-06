import * as THREE from 'three';
import { TOWERS } from '../config.js';
import { getModel } from '../systems/ModelLibrary.js';

const _targetPos = new THREE.Vector3();
const _box = new THREE.Box3();
const DPS_WINDOW = 10; // seconds of damage history for the live DPS meter

export const TARGETING_MODES = ['nearest', 'first', 'strongest'];

// Kenney kit assembly per tower type: stacked segments (one more per upgrade
// tier) with a weapon mounted on top. Parts shorter than 3 entries just stop
// growing (the mortar stays squat).
const ASSEMBLY = {
  single: {
    parts: ['tower-square-bottom-b', 'tower-square-middle-b', 'tower-square-top-b'],
    weapon: 'weapon-turret',
    scale: 2.0,
  },
  splash: {
    parts: ['tower-round-bottom-b', 'tower-round-middle-b', 'tower-round-top-b'],
    weapon: 'weapon-cannon',
    scale: 2.0,
  },
  slow: {
    parts: ['tower-round-bottom-c', 'tower-round-middle-c', 'tower-round-crystals'],
    weapon: 'detail-crystal',
    weaponScale: 1.6,
    scale: 2.0,
  },
  sniper: {
    // watchtower scaffold: short at tier 1, tall from tier 2 (swap, not stack)
    parts: ['wood-structure', 'wood-structure-high'],
    swapParts: true,
    weapon: 'weapon-ballista',
    scale: 1.7,
  },
  mortar: {
    parts: ['tower-round-base'],
    weapon: 'weapon-catapult',
    scale: 2.0,
  },
};

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

    // scaled container for the kit parts; the range ring stays unscaled so
    // its radius remains in world units
    this.body = new THREE.Group();
    this.body.scale.setScalar(ASSEMBLY[this.type].scale);
    this.group.add(this.body);

    this._buildBody();

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

  // (Re)stack the tower body for the current level: one kit segment per tier,
  // then the rotating head with the weapon and muzzle on top. Called on
  // construction and after every upgrade so towers physically grow.
  _buildBody() {
    while (this.body.children.length) this.body.remove(this.body.children[0]);

    const spec = ASSEMBLY[this.type];
    let stackTop = 0;
    if (spec.swapParts) {
      // one body per tier, replaced on upgrade (e.g. watchtower grows taller)
      const part = getModel(spec.parts[Math.min(this.level, spec.parts.length - 1)]);
      if (part) {
        _box.setFromObject(part);
        stackTop = _box.max.y;
        this.body.add(part);
      }
    } else {
      const count = Math.min(this.level + 1, spec.parts.length);
      for (let i = 0; i < count; i++) {
        const part = getModel(spec.parts[i]);
        if (!part) continue;
        _box.setFromObject(part);
        const height = _box.max.y;
        part.position.y = stackTop;
        this.body.add(part);
        stackTop += height;
      }
    }

    // rotating head: weapon + projectile spawn point
    this.head = new THREE.Group();
    this.head.position.y = stackTop;
    this.body.add(this.head);

    this.weapon = getModel(spec.weapon) || new THREE.Group();
    if (spec.weaponScale) this.weapon.scale.setScalar(spec.weaponScale);
    this.head.add(this.weapon);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.45, 0.4);
    this.head.add(this.muzzle);

    this.body.traverse((obj) => {
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
    const headRotation = this.head.rotation.y;
    this._buildBody(); // grow the tower a segment
    this.head.rotation.y = headRotation;
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
        this.weapon.rotation.y += dt * (4 + k * 20);
      } else {
        this.weapon.position.z = -k * 0.22; // kick back along the aim axis
      }
    } else if (this.type === 'slow') {
      this.weapon.rotation.y += dt * 1.2; // idle crystal spin
    }

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
    // kit geometry/materials are shared with the ModelLibrary cache and must
    // stay alive for other towers — only dispose what this tower created
    this.rangeRing.geometry.dispose();
    this.rangeRing.material.dispose();
  }
}
