import { TOWERS } from '../config.js';

// All DOM/HUD handling. Talks to the game only through the passed-in
// interface object so the game core stays DOM-free.
export class UI {
  constructor(game) {
    this.game = game;

    this.goldEl = document.getElementById('gold-value');
    this.waveEl = document.getElementById('wave-value');
    this.livesEl = document.getElementById('lives-value');
    this.startBtn = document.getElementById('start-wave-btn');
    this.towerBar = document.getElementById('tower-bar');
    this.panel = document.getElementById('tower-panel');
    this.panelTitle = document.getElementById('tower-panel-title');
    this.panelStats = document.getElementById('tower-panel-stats');
    this.upgradeBtn = document.getElementById('upgrade-btn');
    this.sellBtn = document.getElementById('sell-btn');
    this.closePanelBtn = document.getElementById('close-panel-btn');
    this.hint = document.getElementById('placement-hint');
    this.flash = document.getElementById('damage-flash');
    this.overlay = document.getElementById('overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlayText = document.getElementById('overlay-text');
    this.restartBtn = document.getElementById('restart-btn');

    this._lastGold = null;
    this._lastWave = null;
    this._lastLives = null;

    this._buildTowerBar();
    this._wireEvents();
  }

  _buildTowerBar() {
    this.towerButtons = {};
    for (const [type, cfg] of Object.entries(TOWERS)) {
      const btn = document.createElement('button');
      btn.className = 'tower-btn';
      btn.innerHTML = `
        <div class="t-name">${cfg.name}</div>
        <div class="t-swatch" style="background:#${cfg.color.toString(16).padStart(6, '0')}"></div>
        <div class="t-cost">${cfg.cost} gold</div>
        <div class="t-desc">${cfg.description}</div>`;
      btn.addEventListener('click', () => this.game.togglePlacement(type));
      this.towerBar.appendChild(btn);
      this.towerButtons[type] = btn;
    }
  }

  _wireEvents() {
    this.startBtn.addEventListener('click', () => this.game.startWave());
    this.upgradeBtn.addEventListener('click', () => this.game.upgradeSelected());
    this.sellBtn.addEventListener('click', () => this.game.sellSelected());
    this.closePanelBtn.addEventListener('click', () => this.game.deselectTower());
    this.restartBtn.addEventListener('click', () => window.location.reload());
  }

  // Called every frame; only writes to the DOM when a value changed.
  update() {
    const { economy, waveManager } = this.game;

    if (economy.gold !== this._lastGold) {
      this._lastGold = economy.gold;
      this.goldEl.textContent = economy.gold;
    }
    const waveText = `${waveManager.currentWave} / ${waveManager.totalWaves}`;
    if (waveText !== this._lastWave) {
      this._lastWave = waveText;
      this.waveEl.textContent = waveText;
    }
    if (economy.lives !== this._lastLives) {
      this._lastLives = economy.lives;
      this.livesEl.textContent = economy.lives;
    }

    // start button state
    const canStart = waveManager.canStartWave && this.game.state === 'playing';
    this.startBtn.disabled = !canStart;
    if (canStart) {
      this.startBtn.textContent = `Start Wave ${waveManager.currentWave + 1}`;
    } else if (waveManager.active) {
      this.startBtn.textContent = `Wave ${waveManager.currentWave} in progress…`;
    }

    // tower button affordability + active placement highlight
    for (const [type, btn] of Object.entries(this.towerButtons)) {
      btn.classList.toggle('unaffordable', !economy.canAfford(TOWERS[type].cost));
      btn.classList.toggle('active', this.game.placementType === type);
    }

    // live-refresh upgrade affordability while panel is open
    const t = this.game.selectedTower;
    if (t && !this.panel.classList.contains('hidden')) {
      if (!t.maxLevel) {
        this.upgradeBtn.disabled = !economy.canAfford(t.upgradeCost);
      }
    }
  }

  setPlacementHint(visible) {
    this.hint.classList.toggle('hidden', !visible);
  }

  showTowerPanel(tower) {
    this.panel.classList.remove('hidden');
    this.refreshTowerPanel(tower);
  }

  refreshTowerPanel(tower) {
    const s = tower.stats;
    this.panelTitle.textContent = `${tower.cfg.name} — Lv ${tower.level + 1}`;
    let stats = `Damage: ${s.damage}\nFire rate: ${s.fireRate}/s\nRange: ${s.range}`;
    if (s.splashRadius) stats += `\nSplash radius: ${s.splashRadius}`;
    if (s.slowFactor) stats += `\nSlow: ${Math.round((1 - s.slowFactor) * 100)}% for ${s.slowDuration}s`;
    this.panelStats.textContent = stats;

    if (tower.maxLevel) {
      this.upgradeBtn.textContent = 'Max level';
      this.upgradeBtn.disabled = true;
    } else {
      this.upgradeBtn.textContent = `Upgrade (${tower.upgradeCost} gold)`;
      this.upgradeBtn.disabled = !this.game.economy.canAfford(tower.upgradeCost);
    }
    this.sellBtn.textContent = `Sell (+${tower.sellValue} gold)`;
  }

  hideTowerPanel() {
    this.panel.classList.add('hidden');
  }

  flashDamage() {
    this.flash.classList.add('active');
    setTimeout(() => this.flash.classList.remove('active'), 80);
  }

  showEndScreen(won, wave) {
    this.overlay.classList.remove('hidden');
    if (won) {
      this.overlayTitle.textContent = 'Victory!';
      this.overlayText.textContent = `You held the line through all ${wave} waves.`;
    } else {
      this.overlayTitle.textContent = 'Game Over';
      this.overlayText.textContent = `The base fell on wave ${wave}.`;
    }
  }
}
