import { Tower } from './Tower.js';
import { Projectile } from './Projectile.js';
import { TOWERS } from '../config.js';

const TRAIL_INTERVAL = 0.035; // seconds between trail puffs per projectile

// Owns towers and their projectiles: placement, upgrades, selling, firing,
// impact resolution (incl. splash), and damage attribution back to towers.
export class TowerManager {
  constructor(scene, map, { onImpact, onShot, onTrail, onDamage } = {}) {
    this.scene = scene;
    this.map = map;
    this.towers = [];
    this.projectiles = [];
    this.onImpact = onImpact || (() => {}); // splash explosions etc.
    this.onShot = onShot || (() => {}); // muzzle flash + fire SFX
    this.onTrail = onTrail || (() => {}); // projectile trail puffs
    this.onDamage = onDamage || (() => {}); // floating damage numbers
  }

  canPlace(col, row, type) {
    return this.map.canPlaceType(col, row, type ? TOWERS[type] : null);
  }

  place(type, col, row) {
    if (!this.canPlace(col, row, type)) return null;
    const pos = this.map.gridToWorld(col, row);
    pos.y = this.map.placementHeight(col, row); // elevated platforms raise the base
    const tower = new Tower(type, pos, { col, row });
    this.towers.push(tower);
    this.scene.add(tower.group);
    this.map.occupy(col, row);
    return tower;
  }

  sell(tower) {
    const value = tower.sellValue;
    this.map.release(tower.cell.col, tower.cell.row);
    this.scene.remove(tower.group);
    tower.dispose();
    const i = this.towers.indexOf(tower);
    if (i !== -1) this.towers.splice(i, 1);
    return value;
  }

  update(dt, enemies) {
    for (const tower of this.towers) {
      const shot = tower.update(dt, enemies);
      if (shot) {
        this.projectiles.push(new Projectile(this.scene, shot.origin, shot.target, shot));
        this.onShot(shot);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const impact = p.update(dt);

      p.trailAcc += dt;
      if (!p.done && p.trailAcc >= TRAIL_INTERVAL) {
        p.trailAcc = 0;
        this.onTrail(p.mesh.position, p.color);
      }

      if (impact) this._resolveImpact(impact, enemies);
      if (p.done) {
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  _applyDamage(enemy, amount, sourceTower) {
    const dealt = enemy.takeDamage(amount);
    if (dealt > 0) {
      if (sourceTower) sourceTower.recordDamage(dealt, !enemy.alive);
      this.onDamage(enemy, dealt);
    }
  }

  _resolveImpact(impact, enemies) {
    if (impact.splashRadius > 0) {
      const rSq = impact.splashRadius * impact.splashRadius;
      const seesHidden = impact.sourceTower ? impact.sourceTower.canSeeHidden : false;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        // hidden enemies pass through splash unharmed unless the source sees them
        if (enemy.hidden && !seesHidden) continue;
        if (enemy.position.distanceToSquared(impact.point) <= rSq) {
          this._applyDamage(enemy, impact.damage, impact.sourceTower);
        }
      }
    } else if (impact.directTarget) {
      this._applyDamage(impact.directTarget, impact.damage, impact.sourceTower);
      if (impact.slowFactor && impact.directTarget.alive) {
        impact.directTarget.applySlow(impact.slowFactor, impact.slowDuration);
      }
    }
    this.onImpact(impact);
  }

  towerFromObject(object) {
    let obj = object;
    while (obj) {
      if (obj.userData && obj.userData.tower) return obj.userData.tower;
      obj = obj.parent;
    }
    return null;
  }

  get selectableMeshes() {
    return this.towers.map((t) => t.group);
  }

  clear() {
    for (const t of this.towers) {
      this.scene.remove(t.group);
      t.dispose();
    }
    this.towers.length = 0;
    for (const p of this.projectiles) p.dispose();
    this.projectiles.length = 0;
  }
}
