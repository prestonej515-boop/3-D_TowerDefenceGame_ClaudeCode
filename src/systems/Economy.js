import { ECONOMY } from '../config.js';

export class Economy {
  constructor({ onChange } = {}) {
    this.gold = ECONOMY.startGold;
    this.lives = ECONOMY.startLives;
    this.onChange = onChange || (() => {});
  }

  addGold(amount) {
    this.gold += amount;
    this.onChange();
  }

  canAfford(cost) {
    return this.gold >= cost;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    this.onChange();
    return true;
  }

  loseLives(count) {
    this.lives = Math.max(0, this.lives - count);
    this.onChange();
    return this.lives;
  }

  waveClearBonus(waveNumber) {
    const bonus = ECONOMY.waveClearBonusBase + ECONOMY.waveClearBonusPerWave * waveNumber;
    this.addGold(bonus);
    return bonus;
  }
}
