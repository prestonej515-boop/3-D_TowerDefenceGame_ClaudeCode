import { TOWERS, ENEMIES } from '../config.js';
import { TARGETING_MODES } from '../entities/Tower.js';

const TARGETING_LABELS = { nearest: 'Near', first: 'First', strongest: 'Strong' };

// In-game HUD: top bar, tower bar, wave controls, tower panel with live DPS
// and upgrade preview, toasts. Handlers are assigned with .onclick so a new
// UI per game run never stacks duplicate listeners on the persistent DOM.
export class UI {
  constructor(game) {
    this.game = game;

    this.goldEl = document.getElementById('gold-value');
    this.waveEl = document.getElementById('wave-value');
    this.livesEl = document.getElementById('lives-value');
    this.mapNameEl = document.getElementById('hud-map-name');
    this.startBtn = document.getElementById('start-wave-btn');
    this.speedBtn = document.getElementById('speed-btn');
    this.towerBar = document.getElementById('tower-bar');
    this.wavePreview = document.getElementById('wave-preview');
    this.wavePreviewItems = document.getElementById('wave-preview-items');
    this.panel = document.getElementById('tower-panel');
    this.panelTitle = document.getElementById('tower-panel-title');
    this.panelPips = document.getElementById('tower-panel-pips');
    this.statsTable = document.getElementById('tower-stats-table');
    this.liveStats = document.getElementById('tower-live-stats');
    this.targetingModes = document.getElementById('targeting-modes');
    this.upgradePreview = document.getElementById('upgrade-preview');
    this.upgradePreviewRows = document.getElementById('upgrade-preview-rows');
    this.upgradeBtn = document.getElementById('upgrade-btn');
    this.sellBtn = document.getElementById('sell-btn');
    this.hint = document.getElementById('placement-hint');
    this.flash = document.getElementById('damage-flash');
    this.toastContainer = document.getElementById('toast-container');

    this._lastGold = null;
    this._lastWave = null;
    this._lastLives = null;
    this._lastWavePreviewFor = null;
    this._liveStatsTimer = 0;

    this.mapNameEl.textContent = `${game.mapDef.name} (${game.mapDef.difficulty})`;

    this._buildTowerBar();
    this._wireEvents();
  }

  _buildTowerBar() {
    this.towerBar.innerHTML = '';
    this.towerButtons = {};
    let hotkey = 1;
    for (const [type, cfg] of Object.entries(TOWERS)) {
      const lv1 = cfg.levels[0];
      const btn = document.createElement('button');
      btn.className = 'tower-btn';
      let tooltip = `Damage: ${lv1.damage}\nFire rate: ${lv1.fireRate}/s\nRange: ${lv1.range}\nDPS: ${(lv1.damage * lv1.fireRate).toFixed(0)}`;
      if (lv1.splashRadius) tooltip += `\nSplash radius: ${lv1.splashRadius}`;
      if (lv1.slowFactor) tooltip += `\nSlow: ${Math.round((1 - lv1.slowFactor) * 100)}% for ${lv1.slowDuration}s`;
      if (lv1.minRange) tooltip += `\nMin range: ${lv1.minRange} (can't hit closer)`;
      if (cfg.elevatedOnly) tooltip += `\n⛰ Elevated platforms only`;
      if (cfg.neverSeesHidden) tooltip += `\n✕ Never sees Hidden enemies`;
      else if (lv1.seesHidden) tooltip += `\n👁 Sees Hidden enemies`;
      else {
        const tier = cfg.levels.findIndex((l) => l.seesHidden);
        if (tier > 0) tooltip += `\n👁 Sees Hidden at tier ${tier + 1}`;
      }
      btn.innerHTML = `
        <span class="t-key">${hotkey}</span>
        <div class="t-name">${cfg.name}</div>
        <div class="t-swatch" style="background:#${cfg.color.toString(16).padStart(6, '0')}"></div>
        <div class="t-cost">${cfg.cost} gold</div>
        <div class="t-desc">${cfg.description}</div>
        <div class="t-tooltip">${tooltip}</div>`;
      btn.onclick = () => this.game.togglePlacement(type);
      this.towerBar.appendChild(btn);
      this.towerButtons[type] = btn;
      hotkey++;
    }
  }

  _wireEvents() {
    this.startBtn.onclick = () => this.game.startWave();
    this.speedBtn.onclick = () => this.game.toggleSpeed();
    this.upgradeBtn.onclick = () => this.game.upgradeSelected();
    this.sellBtn.onclick = () => this.game.sellSelected();
    document.getElementById('close-panel-btn').onclick = () => this.game.deselectTower();
    document.getElementById('pause-btn').onclick = () => this.game.onPauseRequest();

    for (const btn of this.targetingModes.querySelectorAll('button')) {
      btn.onclick = () => this.game.setTargetingMode(btn.dataset.mode);
    }
  }

  // Called every frame; only writes to the DOM when a value changed.
  update() {
    const { economy, waveManager } = this.game;

    if (economy.gold !== this._lastGold) {
      this._lastGold = economy.gold;
      this.goldEl.textContent = economy.gold;
    }
    const waveText = waveManager.endless
      ? `${waveManager.currentWave} / ∞`
      : `${waveManager.currentWave} / ${waveManager.totalWaves}`;
    if (waveText !== this._lastWave) {
      this._lastWave = waveText;
      this.waveEl.textContent = waveText;
    }
    if (economy.lives !== this._lastLives) {
      this._lastLives = economy.lives;
      this.livesEl.textContent = economy.lives;
    }

    // start / speed buttons
    const canStart = waveManager.canStartWave && this.game.state === 'playing';
    this.startBtn.disabled = !canStart;
    if (canStart) {
      this.startBtn.textContent = `Start Wave ${waveManager.currentWave + 1}`;
    } else if (waveManager.active) {
      this.startBtn.textContent = `Wave ${waveManager.currentWave} in progress…`;
    }
    this.speedBtn.textContent = this.game.speedMultiplier === 2 ? '2×' : '1×';
    this.speedBtn.classList.toggle('fast', this.game.speedMultiplier === 2);

    this._updateWavePreview(canStart, waveManager.currentWave);

    // tower buttons: affordability + active placement highlight
    for (const [type, btn] of Object.entries(this.towerButtons)) {
      btn.classList.toggle('unaffordable', !economy.canAfford(TOWERS[type].cost));
      btn.classList.toggle('active', this.game.placementType === type);
    }

    // refresh live DPS block a few times a second while the panel is open
    const t = this.game.selectedTower;
    if (t && !this.panel.classList.contains('hidden')) {
      this._liveStatsTimer -= 1 / 60;
      if (this._liveStatsTimer <= 0) {
        this._liveStatsTimer = 0.25;
        this._renderLiveStats(t);
      }
      if (!t.maxLevel) {
        this.upgradeBtn.disabled = !economy.canAfford(t.upgradeCost);
      }
    }
  }

  _updateWavePreview(canStart, currentWave) {
    if (!canStart) {
      if (this._lastWavePreviewFor !== null) {
        this._lastWavePreviewFor = null;
        this.wavePreview.classList.add('hidden');
      }
      return;
    }
    const nextIndex = currentWave; // currentWave is 1-based; next wave config index
    if (this._lastWavePreviewFor === nextIndex) return;
    const groups = this.game.waveManager.getNextWaveGroups();
    if (!groups) return;
    this._lastWavePreviewFor = nextIndex;

    const counts = {};
    for (const group of groups) {
      counts[group.type] = (counts[group.type] || 0) + group.count;
    }
    this.wavePreviewItems.innerHTML = Object.entries(counts)
      .map(([type, count]) => {
        const color = `#${ENEMIES[type].color.toString(16).padStart(6, '0')}`;
        return `<span class="wp-item"><span class="wp-dot" style="background:${color}"></span>${ENEMIES[type].name} ×${count}</span>`;
      })
      .join('');
    this.wavePreview.classList.remove('hidden');
  }

  setPlacementHint(visible) {
    this.hint.classList.toggle('hidden', !visible);
  }

  // ---- tower panel -----------------------------------------------------------

  showTowerPanel(tower) {
    this.panel.classList.remove('hidden');
    this.refreshTowerPanel(tower);
  }

  refreshTowerPanel(tower) {
    const s = tower.stats;
    this.panelTitle.textContent = tower.cfg.name;
    this.panelPips.textContent = '★'.repeat(tower.level + 1) + '☆'.repeat(tower.cfg.levels.length - tower.level - 1);

    // stats table
    const rows = [
      ['Damage', s.damage],
      ['Fire rate', `${s.fireRate}/s`],
      ['Range', s.range],
      ['DPS (max)', (s.damage * s.fireRate).toFixed(0)],
    ];
    if (s.splashRadius) rows.push(['Splash radius', s.splashRadius]);
    if (s.slowFactor) rows.push(['Slow', `${Math.round((1 - s.slowFactor) * 100)}% / ${s.slowDuration}s`]);
    if (s.minRange) rows.push(['Min range', s.minRange]);
    rows.push(['Sees Hidden', tower.cfg.neverSeesHidden ? 'Never' : tower.canSeeHidden ? 'Yes' : 'No']);
    this.statsTable.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

    this._renderLiveStats(tower);

    // targeting mode buttons
    for (const btn of this.targetingModes.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.mode === tower.targetingMode);
    }

    // upgrade preview: current -> next deltas
    if (tower.maxLevel) {
      this.upgradePreview.classList.add('hidden');
      this.upgradeBtn.textContent = 'Max level';
      this.upgradeBtn.disabled = true;
    } else {
      const next = tower.nextStats;
      const previewRows = [];
      const compare = [
        ['Damage', s.damage, next.damage, (v) => v],
        ['Fire rate', s.fireRate, next.fireRate, (v) => `${v}/s`],
        ['Range', s.range, next.range, (v) => v],
        ['DPS', s.damage * s.fireRate, next.damage * next.fireRate, (v) => v.toFixed(0)],
      ];
      if (next.splashRadius) compare.push(['Splash', s.splashRadius, next.splashRadius, (v) => v]);
      if (next.slowFactor) {
        compare.push(['Slow', Math.round((1 - s.slowFactor) * 100), Math.round((1 - next.slowFactor) * 100), (v) => `${v}%`]);
        compare.push(['Slow time', s.slowDuration, next.slowDuration, (v) => `${v}s`]);
      }
      for (const [label, cur, nxt, fmt] of compare) {
        if (cur === nxt) continue;
        const delta = nxt - cur;
        previewRows.push(
          `<div>${label}: ${fmt(cur)} → <span class="up-new">${fmt(nxt)}</span> <span class="up-delta">(${delta > 0 ? '+' : ''}${fmt(Math.round(delta * 100) / 100)})</span></div>`
        );
      }
      if (next.seesHidden && !tower.canSeeHidden && !tower.cfg.neverSeesHidden) {
        previewRows.push(`<div>Detection: <span class="up-new">Sees Hidden enemies</span></div>`);
      }
      this.upgradePreviewRows.innerHTML = previewRows.join('');
      this.upgradePreview.classList.remove('hidden');
      this.upgradeBtn.textContent = `Upgrade (${tower.upgradeCost} gold)`;
      this.upgradeBtn.disabled = !this.game.economy.canAfford(tower.upgradeCost);
    }
    this.sellBtn.textContent = `Sell (+${tower.sellValue} gold)`;
  }

  _renderLiveStats(tower) {
    this.liveStats.innerHTML =
      `Live DPS (10s): <span class="dps-value">${tower.liveDps.toFixed(1)}</span><br>` +
      `Total damage: ${Math.round(tower.totalDamage)} · Kills: ${tower.kills}`;
  }

  hideTowerPanel() {
    this.panel.classList.add('hidden');
  }

  // ---- feedback -----------------------------------------------------------------

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  flashDamage() {
    this.flash.classList.add('active');
    setTimeout(() => this.flash.classList.remove('active'), 80);
  }

  dispose() {
    this.hideTowerPanel();
    this.setPlacementHint(false);
    this.toastContainer.innerHTML = '';
    this.flash.classList.remove('active');
  }
}
