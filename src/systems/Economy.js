import { ECONOMY } from '../config.js';

export class Economy {
  // goldMultiplier / startLives come from the map's difficulty modifiers
  constructor({ startLives = ECONOMY.startLives, goldMultiplier = 1 } = {}) {
    this.gold = ECONOMY.startGold;
    this.lives = startLives;
    this.startLives = startLives;
    this.goldMultiplier = goldMultiplier;
  }

  addGold(amount) {
    this.gold += amount;
  }

  // for income (kills, bonuses) that difficulty scales; returns amount granted
  addIncome(amount) {
    const scaled = Math.max(1, Math.round(amount * this.goldMultiplier));
    this.gold += scaled;
    return scaled;
  }

  canAfford(cost) {
    return this.gold >= cost;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    return true;
  }

  loseLives(count) {
    this.lives = Math.max(0, this.lives - count);
    return this.lives;
  }

  waveClearBonus(waveNumber) {
    return this.addIncome(ECONOMY.waveClearBonusBase + ECONOMY.waveClearBonusPerWave * waveNumber);
  }
}
