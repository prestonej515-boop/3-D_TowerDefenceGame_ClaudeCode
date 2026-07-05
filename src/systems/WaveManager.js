import { WAVES, WAVE_HP_GROWTH } from '../config.js';

// Turns declarative wave configs into timed spawn events.
// A wave is cleared when every spawn has happened AND no enemies remain.
export class WaveManager {
  constructor(enemyManager, { onWaveClear, onAllWavesCleared } = {}) {
    this.enemyManager = enemyManager;
    this.onWaveClear = onWaveClear || (() => {});
    this.onAllWavesCleared = onAllWavesCleared || (() => {});

    this.currentWave = 0; // 1-based once started
    this.totalWaves = WAVES.length;
    this.spawnQueue = []; // [{ time, type }] sorted by time
    this.timer = 0;
    this.active = false;
  }

  get canStartWave() {
    return !this.active && this.currentWave < this.totalWaves;
  }

  startNextWave() {
    if (!this.canStartWave) return false;
    this.currentWave++;
    const waveIndex = this.currentWave - 1;
    const groups = WAVES[waveIndex];

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
    this.hpMultiplier = 1 + WAVE_HP_GROWTH * waveIndex;
    return true;
  }

  update(dt) {
    if (!this.active) return;

    this.timer += dt;
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].time <= this.timer) {
      const event = this.spawnQueue.shift();
      this.enemyManager.spawn(event.type, this.hpMultiplier);
    }

    if (this.spawnQueue.length === 0 && this.enemyManager.aliveCount === 0) {
      this.active = false;
      this.onWaveClear(this.currentWave);
      if (this.currentWave >= this.totalWaves) {
        this.onAllWavesCleared();
      }
    }
  }
}
