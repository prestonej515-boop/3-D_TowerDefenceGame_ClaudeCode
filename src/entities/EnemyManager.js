import { Enemy } from './Enemy.js';
import { ENDLESS } from '../config.js';

const DEATH_LINGER = 0.22; // seconds the squash animation plays before removal

// Owns all live enemies. Reports kills and leaks through callbacks so the
// game loop / economy stay decoupled. Also runs summoner timers (mage/boss)
// since spawning new enemies needs manager-level access.
export class EnemyManager {
  constructor(scene, worldWaypoints, { onKill, onLeak, onSummon, modifiers } = {}) {
    this.scene = scene;
    this.waypoints = worldWaypoints;
    this.enemies = [];
    this.onKill = onKill || (() => {});
    this.onLeak = onLeak || (() => {});
    this.onSummon = onSummon || (() => {}); // visual/audio hook
    this.modifiers = modifiers || { hp: 1, speed: 1 };
  }

  // living enemies only (dying ones are just playing their squash animation)
  get aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  spawn(type, hpMultiplier = 1, opts = {}) {
    const enemy = new Enemy(type, this.waypoints, hpMultiplier, this.modifiers, opts);
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
    return enemy;
  }

  // Mage/boss summoning: spawn minions at the summoner's path position.
  _runSummons(enemy, dt) {
    const s = enemy.cfg.summons;
    if (!s || !enemy.alive) return;
    enemy.summonTimer -= dt;
    if (enemy.summonTimer > 0) return;
    enemy.summonTimer = s.interval;
    if (this.aliveCount > ENDLESS.maxAliveEnemies) return; // perf safety cap
    for (let i = 0; i < s.count; i++) {
      this.spawn(s.type, 1, {
        at: { position: enemy.position, waypointIndex: enemy.waypointIndex },
      });
    }
    this.onSummon(enemy);
  }

  update(dt, camera) {
    const cameraQuat = camera.quaternion;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, cameraQuat);
      this._runSummons(enemy, dt);

      if (!enemy.alive) {
        if (!enemy.deathHandled) {
          enemy.deathHandled = true;
          this.onKill(enemy);
        }
        if (enemy.deathAnim >= DEATH_LINGER) this._remove(i);
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
