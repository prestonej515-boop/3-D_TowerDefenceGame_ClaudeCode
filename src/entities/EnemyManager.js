import { Enemy } from './Enemy.js';

// Owns all live enemies. Reports kills and leaks through callbacks so the
// game loop / economy stay decoupled.
export class EnemyManager {
  constructor(scene, worldWaypoints, { onKill, onLeak } = {}) {
    this.scene = scene;
    this.waypoints = worldWaypoints;
    this.enemies = [];
    this.onKill = onKill || (() => {});
    this.onLeak = onLeak || (() => {});
  }

  get aliveCount() {
    return this.enemies.length;
  }

  spawn(type, hpMultiplier = 1) {
    const enemy = new Enemy(type, this.waypoints, hpMultiplier);
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
    return enemy;
  }

  update(dt, camera) {
    const cameraQuat = camera.quaternion;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, cameraQuat);

      if (!enemy.alive) {
        this.onKill(enemy);
        this._remove(i);
      } else if (enemy.reachedEnd) {
        this.onLeak(enemy);
        this._remove(i);
      }
    }
  }

  _remove(index) {
    const enemy = this.enemies[index];
    this.scene.remove(enemy.group);
    enemy.dispose();
    this.enemies.splice(index, 1);
  }

  clear() {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.group);
      enemy.dispose();
    }
    this.enemies.length = 0;
  }
}
