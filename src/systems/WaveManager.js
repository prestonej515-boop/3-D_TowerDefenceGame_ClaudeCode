import { WAVES, WAVE_HP_GROWTH, ENDLESS } from '../config.js';

// Turns declarative wave configs into timed spawn events.
// A wave is cleared when every spawn has happened AND no enemies remain.
// In endless mode waves are generated from a growing point budget instead of
// the authored WAVES list, with a boss every ENDLESS.bossEveryNWaves waves.
export class WaveManager {
  constructor(enemyManager, { endless = false, onWaveClear, onAllWavesCleared } = {}) {
    this.enemyManager = enemyManager;
    this.onWaveClear = onWaveClear || (() => {});
    this.onAllWavesCleared = onAllWavesCleared || (() => {});

    this.endless = endless;
    this.currentWave = 0; // 1-based once started
    this.totalWaves = endless ? Infinity : WAVES.length;
    this.spawnQueue = []; // [{ time, type }] sorted by time
    this.timer = 0;
    this.active = false;
    this.hpMultiplier = 1;
    this.speedMultiplier = 1;
    this._nextWaveGroups = null; // cached endless composition (for the preview)
  }

  get canStartWave() {
    return !this.active && this.currentWave < this.totalWaves;
  }

  // Spawn groups for the upcoming wave, used by the HUD preview.
  getNextWaveGroups() {
    const nextIndex = this.currentWave; // 0-based index of wave currentWave+1
    if (!this.endless) {
      return nextIndex < WAVES.length ? WAVES[nextIndex] : null;
    }
    if (!this._nextWaveGroups) this._nextWaveGroups = this._generateWave(this.currentWave + 1);
    return this._nextWaveGroups;
  }

  // Random endless wave: spend a budget on weighted enemy groups.
  _generateWave(waveNumber) {
    const groups = [];
    let budget = ENDLESS.baseBudget + ENDLESS.budgetPerWave * (waveNumber - 1);
    const available = ENDLESS.pool.filter((p) => p.minWave <= waveNumber);
    let delay = 0;

    let guard = 30; // hard stop so a config mistake can't loop forever
    while (budget > 0 && guard-- > 0) {
      const affordable = available.filter((p) => p.cost <= budget);
      if (!affordable.length) break;
      const totalWeight = affordable.reduce((sum, p) => sum + p.weight, 0);
      let roll = Math.random() * totalWeight;
      let pick = affordable[affordable.length - 1];
      for (const p of affordable) {
        roll -= p.weight;
        if (roll <= 0) {
          pick = p;
          break;
        }
      }
      const maxCount = Math.floor(budget / pick.cost);
      const desired = pick.type === 'mage' ? 1 : 3 + Math.floor(Math.random() * 6);
      const count = Math.max(1, Math.min(maxCount, desired));
      budget -= count * pick.cost;
      const interval = pick.type === 'swarm' ? 0.25 : pick.type === 'armored' ? 1.6 : 0.9;
      groups.push({ type: pick.type, count, interval, delay });
      delay += 1.5 + Math.random() * 2;
    }

    if (waveNumber % ENDLESS.bossEveryNWaves === 0) {
      const bossCount = Math.floor(waveNumber / ENDLESS.bossEveryNWaves);
      groups.push({ type: 'boss', count: bossCount, interval: 5, delay: delay + 2 });
    }
    return groups;
  }

  startNextWave() {
    if (!this.canStartWave) return false;
    this.currentWave++;
    const waveIndex = this.currentWave - 1;
    const groups = this.endless
      ? this._nextWaveGroups || this._generateWave(this.currentWave)
      : WAVES[waveIndex];
    this._nextWaveGroups = null;

    this.spawnQueue = [];
    for (const group of groups) {
      const delay = group.delay || 0;
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({ time: delay + i * group.interval, type: group.type });
      }
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);
    this.timer = 0;
    this.active = true;
    if (this.endless) {
      this.hpMultiplier = 1 + ENDLESS.hpGrowthPerWave * waveIndex;
      this.speedMultiplier = Math.min(1 + ENDLESS.speedGrowthPerWave * waveIndex, ENDLESS.speedCap);
    } else {
      this.hpMultiplier = 1 + WAVE_HP_GROWTH * waveIndex;
      this.speedMultiplier = 1;
    }
    return true;
  }

  update(dt) {
    if (!this.active) return;

    this.timer += dt;
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].time <= this.timer) {
      const event = this.spawnQueue.shift();
      this.enemyManager.spawn(event.type, this.hpMultiplier, { speedMult: this.speedMultiplier });
    }

    if (this.spawnQueue.length === 0 && this.enemyManager.aliveCount === 0) {
      this.active = false;
      this.onWaveClear(this.currentWave);
      if (!this.endless && this.currentWave >= this.totalWaves) {
        this.onAllWavesCleared();
      }
    }
  }
}
