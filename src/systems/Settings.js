// Persistent user settings (localStorage) with change listeners so systems
// like audio and rendering can react live when a slider moves.

const STORAGE_KEY = 'fabletower-settings';

const DEFAULTS = {
  musicVolume: 0.6,
  sfxVolume: 0.8,
  shadowQuality: 'high', // 'off' | 'medium' | 'high'
  screenShake: true,
  autoStartWave: false, // auto-launch the next wave after a short countdown
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = [];
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && typeof stored === 'object') {
        for (const key of Object.keys(DEFAULTS)) {
          if (key in stored) this.values[key] = stored[key];
        }
      }
    } catch {
      // corrupted storage — fall back to defaults
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // storage unavailable (private mode) — settings just won't persist
    }
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  offChange(fn) {
    const i = this.listeners.indexOf(fn);
    if (i !== -1) this.listeners.splice(i, 1);
  }
}
