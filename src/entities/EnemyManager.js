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
    this.pendingBroods = []; // delayed spawnOnDeath bursts (timed to corpse anims)
  }

  // living enemies only (dying ones are just playing their squash animation)
  get aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  // true while more enemies are guaranteed to appear: a queued delayed brood,
  // or a freshly-dead spawner whose brood hasn't been queued yet (projectiles
  // can kill between our update and the wave-clear check)
  get hasPendingSpawns() {
    if (this.pendingBroods.length > 0) return true;
    for (const e of this.enemies) {
      if (!e.alive && !e.deathHandled && e.cfg.spawnOnDeath) return true;
    }
    return false;
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
      const minion = this.spawn(s.type, 1, {
        at: { position: enemy.position, waypointIndex: enemy.waypointIndex },
      });
      // shieldedBySummons bosses are protected while their escort lives
      enemy.activeMinions.push(minion);
    }
    this.onSummon(enemy);
  }

  // Keep summon-shield bosses in sync with their escort each frame.
  _updateShields(enemy) {
    if (!enemy.cfg.shieldedBySummons) return;
    enemy.activeMinions = enemy.activeMinions.filter((m) => m.alive);
    enemy.setShielded(enemy.alive && enemy.activeMinions.length > 0);
  }

  // Boss death mechanic: burst into sub-enemies at the corpse's path position.
  // An optional delay times the burst to the corpse animation (chicks erupt
  // as the roast lands rather than in the death frame).
  _queueDeathBrood(boss) {
    const { type, count, delay } = boss.cfg.spawnOnDeath;
    this.pendingBroods.push({
      t: delay || 0,
      type,
      count,
      position: boss.position.clone(),
      waypointIndex: boss.waypointIndex,
      source: boss, // for the onSummon visual hook; may be disposed by then
    });
  }

  _runPendingBroods(dt) {
    for (let i = this.pendingBroods.length - 1; i >= 0; i--) {
      const brood = this.pendingBroods[i];
      brood.t -= dt;
      if (brood.t > 0) continue;
      this.pendingBroods.splice(i, 1);
      if (this.aliveCount > ENDLESS.maxAliveEnemies) continue; // perf safety cap
      for (let j = 0; j < brood.count; j++) {
        const position = brood.position.clone();
        // scatter the brood so they don't spawn as a single stack
        position.x += (Math.random() - 0.5) * 1.6;
        position.z += (Math.random() - 0.5) * 1.6;
        this.spawn(brood.type, 1, { at: { position, waypointIndex: brood.waypointIndex } });
      }
      this.onSummon(brood.source);
    }
  }

  update(dt, camera) {
    const cameraQuat = camera.quaternion;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      this._updateShields(enemy); // before update so damage this frame respects it
      enemy.update(dt, cameraQuat);
      this._runSummons(enemy, dt);

      if (!enemy.alive) {
        if (!enemy.deathHandled) {
          enemy.deathHandled = true;
          this.onKill(enemy);
          if (enemy.cfg.spawnOnDeath) this._queueDeathBrood(enemy);
        }
        if (enemy.deathAnim >= (enemy.cfg.deathLinger || DEATH_LINGER)) this._remove(i);
      } else if (enemy.reachedEnd) {
        this.onLeak(enemy);
        this._remove(i);
      }
    }
    this._runPendingBroods(dt);
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
    this.pendingBroods.length = 0;
  }
}
