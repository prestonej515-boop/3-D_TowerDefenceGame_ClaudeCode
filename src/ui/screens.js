import { MAPS } from '../config/maps.js';

// Menu / map select / settings / pause / end screens. Pure DOM — the App
// wires the callbacks. Handlers are assigned (not addEventListener'd) so the
// class can be constructed once and screens reused across game runs.
export class Screens {
  constructor({ settings, audio, onSelectMap, onResume, onQuitToMenu, onRetry }) {
    this.settings = settings;
    this.audio = audio;

    this.menu = document.getElementById('menu-screen');
    this.mapSelect = document.getElementById('map-select-screen');
    this.settingsModal = document.getElementById('settings-modal');
    this.pause = document.getElementById('pause-screen');
    this.end = document.getElementById('end-screen');
    this.hud = document.getElementById('ui');

    // ---- menu ----
    document.getElementById('menu-play-btn').onclick = () => {
      audio.play('ui_click');
      this.show('mapSelect');
    };
    document.getElementById('menu-settings-btn').onclick = () => {
      audio.play('ui_click');
      this.openSettings();
    };
    document.getElementById('map-back-btn').onclick = () => {
      audio.play('ui_click');
      this.show('menu');
    };

    // ---- map cards ----
    const cardsRoot = document.getElementById('map-cards');
    for (const mapDef of MAPS) {
      cardsRoot.appendChild(this._buildMapCard(mapDef, onSelectMap));
    }

    // ---- settings ----
    this.musicSlider = document.getElementById('setting-music');
    this.sfxSlider = document.getElementById('setting-sfx');
    this.shadowSelect = document.getElementById('setting-shadows');
    this.shakeCheck = document.getElementById('setting-shake');

    this.musicSlider.oninput = () => settings.set('musicVolume', parseFloat(this.musicSlider.value));
    this.sfxSlider.oninput = () => {
      settings.set('sfxVolume', parseFloat(this.sfxSlider.value));
      audio.play('ui_click'); // audible feedback while dragging
    };
    this.shadowSelect.onchange = () => settings.set('shadowQuality', this.shadowSelect.value);
    this.shakeCheck.onchange = () => settings.set('screenShake', this.shakeCheck.checked);
    document.getElementById('settings-close-btn').onclick = () => {
      audio.play('ui_click');
      this.closeSettings();
    };

    // ---- pause ----
    document.getElementById('pause-resume-btn').onclick = () => {
      audio.play('ui_click');
      onResume();
    };
    document.getElementById('pause-settings-btn').onclick = () => {
      audio.play('ui_click');
      this.openSettings();
    };
    document.getElementById('pause-quit-btn').onclick = () => {
      audio.play('ui_click');
      onQuitToMenu();
    };

    // ---- end screen ----
    document.getElementById('end-retry-btn').onclick = () => {
      audio.play('ui_click');
      onRetry();
    };
    document.getElementById('end-menu-btn').onclick = () => {
      audio.play('ui_click');
      onQuitToMenu();
    };
  }

  _buildMapCard(mapDef, onSelectMap) {
    const card = document.createElement('button');
    card.className = 'map-card';
    const badge = mapDef.difficulty.toLowerCase();
    const m = mapDef.modifiers;
    card.innerHTML = `
      <span class="difficulty-badge ${badge}">${mapDef.difficulty}</span>
      <div class="mc-name">${mapDef.name}</div>
      <canvas width="220" height="140"></canvas>
      <div class="mc-tagline">${mapDef.tagline}</div>
      <div class="mc-mods">
        &#10084; ${m.startLives} lives &middot; Enemy HP &times;${m.hp}<br>
        Speed &times;${m.speed} &middot; Gold &times;${m.gold}
      </div>`;
    this._drawMapPreview(card.querySelector('canvas'), mapDef);
    card.onclick = () => {
      this.audio.play('ui_click');
      onSelectMap(mapDef);
    };
    return card;
  }

  // mini top-down path preview on the card
  _drawMapPreview(canvas, mapDef) {
    const ctx = canvas.getContext('2d');
    const themeColors = { grass: '#3f7a37', desert: '#c39a5e', snow: '#dbe4ed' };
    const pathColors = { grass: '#9c7a4f', desert: '#a5723f', snow: '#8ba0b3' };
    ctx.fillStyle = themeColors[mapDef.theme];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sx = canvas.width / mapDef.cols;
    const sy = canvas.height / mapDef.rows;
    ctx.strokeStyle = pathColors[mapDef.theme];
    ctx.lineWidth = Math.min(sx, sy) * 0.9;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    mapDef.waypoints.forEach(([c, r], i) => {
      const x = (c + 0.5) * sx;
      const y = (r + 0.5) * sy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // spawn + base markers
    const [sc, sr] = mapDef.waypoints[0];
    const [ec, er] = mapDef.waypoints[mapDef.waypoints.length - 1];
    ctx.fillStyle = '#b060e8';
    ctx.beginPath();
    ctx.arc((sc + 0.5) * sx, (sr + 0.5) * sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4c542';
    ctx.beginPath();
    ctx.arc((ec + 0.5) * sx, (er + 0.5) * sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- visibility ----------------------------------------------------------

  show(name) {
    this.menu.classList.toggle('hidden', name !== 'menu');
    this.mapSelect.classList.toggle('hidden', name !== 'mapSelect');
    this.hud.classList.toggle('hidden', name !== 'game');
    if (name !== 'game') {
      this.pause.classList.add('hidden');
      this.end.classList.add('hidden');
    }
  }

  openSettings() {
    // sync widgets with current values every open
    this.musicSlider.value = this.settings.get('musicVolume');
    this.sfxSlider.value = this.settings.get('sfxVolume');
    this.shadowSelect.value = this.settings.get('shadowQuality');
    this.shakeCheck.checked = this.settings.get('screenShake');
    this.settingsModal.classList.remove('hidden');
  }

  closeSettings() {
    this.settingsModal.classList.add('hidden');
  }

  get settingsOpen() {
    return !this.settingsModal.classList.contains('hidden');
  }

  showPause() {
    this.pause.classList.remove('hidden');
  }

  hidePause() {
    this.pause.classList.add('hidden');
    this.closeSettings();
  }

  get pauseOpen() {
    return !this.pause.classList.contains('hidden');
  }

  showEnd(won, wave, mapDef) {
    document.getElementById('end-title').textContent = won ? 'Victory!' : 'Game Over';
    document.getElementById('end-text').textContent = won
      ? `You held ${mapDef.name} through all ${wave} waves.`
      : `${mapDef.name} fell on wave ${wave}.`;
    this.end.classList.remove('hidden');
  }

  hideEnd() {
    this.end.classList.add('hidden');
  }
}
