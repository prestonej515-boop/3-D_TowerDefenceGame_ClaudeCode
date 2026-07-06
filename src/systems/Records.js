// Persistent per-map run records (localStorage): best campaign wave, whether
// the campaign was ever won, and best endless wave. Same defensive storage
// pattern as Settings.

const STORAGE_KEY = 'fabletower-records';

export class Records {
  constructor() {
    this.data = {};
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && typeof stored === 'object') this.data = stored;
    } catch {
      // corrupted storage — start fresh
    }
  }

  get(mapId) {
    return this.data[mapId] || { bestCampaignWave: 0, campaignWon: false, bestEndlessWave: 0 };
  }

  anyCampaignWon() {
    return Object.values(this.data).some((r) => r.campaignWon);
  }

  // Called on every game end. `wave` is the furthest wave reached.
  report(mapId, mode, wave, won) {
    const rec = { ...this.get(mapId) };
    if (mode === 'endless') {
      rec.bestEndlessWave = Math.max(rec.bestEndlessWave, wave);
    } else {
      rec.bestCampaignWave = Math.max(rec.bestCampaignWave, wave);
      if (won) rec.campaignWon = true;
    }
    this.data[mapId] = rec;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage unavailable (private mode) — records just won't persist
    }
  }
}
