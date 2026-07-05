import * as THREE from 'three';
import { Tower } from './Tower.js';
import { Projectile } from './Projectile.js';
import { TOWERS } from '../config.js';

// Owns towers and their projectiles: placement, upgrades, selling,
// firing, and projectile impact resolution (including splash).
export class TowerManager {
  constructor(scene, map, { onImpact } = {}) {
    this.scene = scene;
    this.map = map;
    this.towers = [];
    this.projectiles = [];
    this.onImpact = onImpact || (() => {}); // for effects hooks
  }

  canPlace(col, row) {
    return this.map.isBuildable(col, row);
  }

  place(type, col, row) {
    if (!this.canPlace(col, row)) return null;
    const pos = this.map.gridToWorld(col, row);
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
    // towers fire
    for (const tower of this.towers) {
      const shot = tower.update(dt, enemies);
      if (shot) {
        this.projectiles.push(
          new Projectile(this.scene, shot.origin, shot.target, shot)
        );
      }
    }

    // projectiles fly & resolve impacts
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const impact = p.update(dt);
      if (impact) this._resolveImpact(impact, enemies);
      if (p.done) {
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  _resolveImpact(impact, enemies) {
    if (impact.splashRadius > 0) {
      // AoE: damage everything within the radius of the impact point
      const rSq = impact.splashRadius * impact.splashRadius;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (enemy.position.distanceToSquared(impact.point) <= rSq) {
          enemy.takeDamage(impact.damage);
        }
      }
    } else if (impact.directTarget) {
      impact.directTarget.takeDamage(impact.damage);
      if (impact.slowFactor) {
        impact.directTarget.applySlow(impact.slowFactor, impact.slowDuration);
      }
    }
    this.onImpact(impact);
  }

  // raycast helper: find a tower from an intersected object
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
