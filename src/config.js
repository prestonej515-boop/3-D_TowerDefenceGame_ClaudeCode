// ---------------------------------------------------------------------------
// Central game configuration.
// All balancing data (enemies, towers, waves, economy, map layout) lives here
// so future mechanics can hook in without touching core logic.
// ---------------------------------------------------------------------------

// Map layouts and themes live in ./config/maps.js

export const ECONOMY = {
  startGold: 120,
  startLives: 20,
  sellRefund: 0.7, // fraction of total invested gold returned on sell
  waveClearBonusBase: 25,
  waveClearBonusPerWave: 5,
};

export const ENEMIES = {
  basic: {
    name: 'Basic',
    hp: 40,
    speed: 3.2,
    reward: 8,
    livesCost: 1,
    color: 0xd6494f,
    size: 0.55,
  },
  armored: {
    name: 'Armored',
    hp: 170,
    speed: 1.6,
    reward: 22,
    livesCost: 2,
    color: 0x5c6470,
    size: 0.8,
  },
  swarm: {
    name: 'Swarm',
    hp: 14,
    speed: 4.6,
    reward: 3,
    livesCost: 1,
    color: 0xe8a33d,
    size: 0.35,
  },
};

// Per-wave enemy HP multiplier: hp * (1 + hpGrowth * (waveIndex))
export const WAVE_HP_GROWTH = 0.1;

export const TOWERS = {
  single: {
    name: 'Gunner',
    description: 'Fast single-target fire',
    cost: 50,
    color: 0x3d7bd6,
    projectileColor: 0x8fc2ff,
    projectileSpeed: 26,
    projectileSize: 0.14,
    levels: [
      { range: 7, damage: 12, fireRate: 2.4 },
      { range: 8, damage: 20, fireRate: 3.0, upgradeCost: 60 },
    ],
  },
  splash: {
    name: 'Cannon',
    description: 'Slow AoE splash damage',
    cost: 80,
    color: 0xc46a2b,
    projectileColor: 0xffa94d,
    projectileSpeed: 15,
    projectileSize: 0.26,
    splash: true,
    levels: [
      { range: 6.5, damage: 20, fireRate: 0.8, splashRadius: 2.2 },
      { range: 7, damage: 32, fireRate: 1.0, splashRadius: 2.8, upgradeCost: 100 },
    ],
  },
  slow: {
    name: 'Frost',
    description: 'Low damage, slows enemies',
    cost: 60,
    color: 0x4ecbd4,
    projectileColor: 0xaef4f8,
    projectileSpeed: 20,
    projectileSize: 0.18,
    levels: [
      { range: 6, damage: 4, fireRate: 1.2, slowFactor: 0.55, slowDuration: 2.0 },
      { range: 7, damage: 7, fireRate: 1.4, slowFactor: 0.4, slowDuration: 2.6, upgradeCost: 70 },
    ],
  },
};

// Each wave is a list of spawn groups processed in order.
// { type, count, interval (s between spawns), delay (s before group starts) }
export const WAVES = [
  [{ type: 'basic', count: 6, interval: 1.2 }],
  [{ type: 'basic', count: 10, interval: 1.0 }],
  [
    { type: 'basic', count: 8, interval: 1.0 },
    { type: 'swarm', count: 6, interval: 0.25, delay: 3 },
  ],
  [
    { type: 'armored', count: 4, interval: 2.2 },
    { type: 'basic', count: 6, interval: 0.9, delay: 2 },
  ],
  [
    { type: 'swarm', count: 12, interval: 0.25 },
    { type: 'basic', count: 8, interval: 0.8, delay: 4 },
  ],
  [
    { type: 'armored', count: 6, interval: 1.8 },
    { type: 'swarm', count: 10, interval: 0.25, delay: 3 },
  ],
  [
    { type: 'basic', count: 14, interval: 0.7 },
    { type: 'armored', count: 5, interval: 2.0, delay: 3 },
  ],
  [
    { type: 'swarm', count: 18, interval: 0.22 },
    { type: 'armored', count: 6, interval: 1.6, delay: 4 },
  ],
  [
    { type: 'basic', count: 12, interval: 0.7 },
    { type: 'armored', count: 8, interval: 1.5, delay: 2 },
    { type: 'swarm', count: 12, interval: 0.22, delay: 6 },
  ],
  [
    { type: 'armored', count: 10, interval: 1.3 },
    { type: 'swarm', count: 20, interval: 0.2, delay: 3 },
    { type: 'basic', count: 10, interval: 0.6, delay: 8 },
  ],
];

export const EFFECTS = {
  deathParticleCount: 10,
  deathParticleLife: 0.55,
  shakeDuration: 0.35,
  shakeMagnitude: 0.35,
};
