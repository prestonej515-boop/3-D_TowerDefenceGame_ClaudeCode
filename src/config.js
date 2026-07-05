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
  hidden: {
    name: 'Hidden',
    hp: 55,
    speed: 3.4,
    reward: 14,
    livesCost: 1,
    color: 0x8a7ff0,
    size: 0.5,
    hidden: true, // untargetable unless the tower's current tier seesHidden
  },
  mage: {
    name: 'Mage',
    hp: 520,
    speed: 1.1,
    reward: 60,
    livesCost: 3,
    color: 0x9b59d0,
    size: 0.9,
    // periodically summons minions at its own position while alive
    summons: { type: 'minion', count: 3, interval: 6 },
  },
  minion: {
    name: 'Minion',
    hp: 10,
    speed: 3.8,
    reward: 2,
    livesCost: 1,
    color: 0xc9a2e8,
    size: 0.3,
  },
  boss: {
    name: 'Boss',
    hp: 2400,
    speed: 0.9,
    reward: 250,
    livesCost: 10,
    color: 0x8c1f1f,
    size: 1.3,
    boss: true,
    summons: { type: 'minion', count: 4, interval: 8 },
    // below this HP fraction the boss enrages: faster and tinted hot
    enrage: { hpThreshold: 0.35, speedMult: 1.7 },
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
      { range: 9, damage: 32, fireRate: 3.6, upgradeCost: 130, seesHidden: true },
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
    neverSeesHidden: true, // explosive shells can't reveal hidden enemies, ever
    levels: [
      { range: 6.5, damage: 20, fireRate: 0.8, splashRadius: 2.2 },
      { range: 7, damage: 32, fireRate: 1.0, splashRadius: 2.8, upgradeCost: 100 },
      { range: 7.5, damage: 50, fireRate: 1.1, splashRadius: 3.4, upgradeCost: 180 },
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
      { range: 7, damage: 7, fireRate: 1.4, slowFactor: 0.4, slowDuration: 2.6, upgradeCost: 70, seesHidden: true },
      { range: 7.5, damage: 12, fireRate: 1.6, slowFactor: 0.3, slowDuration: 3.2, upgradeCost: 140, seesHidden: true },
    ],
  },
  sniper: {
    name: 'Sniper',
    description: 'Huge damage, elevated spots only',
    cost: 100,
    color: 0x4a5d3a,
    projectileColor: 0xd8ffb0,
    projectileSpeed: 55,
    projectileSize: 0.12,
    elevatedOnly: true, // only placeable on a map's elevated zones
    levels: [
      { range: 12, damage: 60, fireRate: 0.35, seesHidden: true },
      { range: 13.5, damage: 110, fireRate: 0.4, upgradeCost: 120, seesHidden: true },
      { range: 15, damage: 190, fireRate: 0.5, upgradeCost: 220, seesHidden: true },
    ],
  },
  mortar: {
    name: 'Mortar',
    description: 'Arcing splash, blind up close',
    cost: 90,
    color: 0x6e5a8c,
    projectileColor: 0xd0b0ff,
    projectileSpeed: 11,
    projectileSize: 0.3,
    splash: true,
    arc: true, // projectiles fly a ballistic arc
    levels: [
      { range: 9, minRange: 3.5, damage: 28, fireRate: 0.5, splashRadius: 2.6 },
      { range: 10, minRange: 3.5, damage: 45, fireRate: 0.55, splashRadius: 3.0, upgradeCost: 110 },
      { range: 11, minRange: 3.5, damage: 70, fireRate: 0.6, splashRadius: 3.6, upgradeCost: 200, seesHidden: true },
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
    { type: 'hidden', count: 3, interval: 1.5, delay: 6 },
  ],
  [
    { type: 'armored', count: 6, interval: 1.8 },
    { type: 'swarm', count: 10, interval: 0.25, delay: 3 },
  ],
  [
    { type: 'basic', count: 14, interval: 0.7 },
    { type: 'armored', count: 5, interval: 2.0, delay: 3 },
    { type: 'hidden', count: 5, interval: 1.2, delay: 5 },
  ],
  [
    { type: 'swarm', count: 18, interval: 0.22 },
    { type: 'armored', count: 6, interval: 1.6, delay: 4 },
    { type: 'mage', count: 1, interval: 1, delay: 8 },
  ],
  [
    { type: 'basic', count: 12, interval: 0.7 },
    { type: 'armored', count: 8, interval: 1.5, delay: 2 },
    { type: 'swarm', count: 12, interval: 0.22, delay: 6 },
    { type: 'hidden', count: 6, interval: 1.0, delay: 8 },
  ],
  [
    { type: 'armored', count: 10, interval: 1.3 },
    { type: 'swarm', count: 20, interval: 0.2, delay: 3 },
    { type: 'basic', count: 10, interval: 0.6, delay: 8 },
    { type: 'mage', count: 1, interval: 1, delay: 6 },
    { type: 'boss', count: 1, interval: 1, delay: 14 },
  ],
];

// ---------------------------------------------------------------------------
// Endless mode: waves are generated from a growing point budget instead of
// the authored list. Costs are rough per-enemy threat weights.
// ---------------------------------------------------------------------------
export const ENDLESS = {
  baseBudget: 40,
  budgetPerWave: 14, // budget = baseBudget + budgetPerWave * (wave - 1)
  hpGrowthPerWave: 0.08, // hp mult = 1 + this * (wave - 1)
  speedGrowthPerWave: 0.012, // speed mult = min(1 + this * (wave - 1), speedCap)
  speedCap: 1.6,
  bossEveryNWaves: 10,
  maxAliveEnemies: 220, // safety cap: summons pause above this
  // { type, cost, minWave, weight } — weight biases the random group picker
  pool: [
    { type: 'basic', cost: 4, minWave: 1, weight: 4 },
    { type: 'swarm', cost: 2, minWave: 1, weight: 3 },
    { type: 'armored', cost: 10, minWave: 2, weight: 3 },
    { type: 'hidden', cost: 8, minWave: 3, weight: 2 },
    { type: 'mage', cost: 30, minWave: 5, weight: 1 },
  ],
};

export const EFFECTS = {
  deathParticleCount: 10,
  deathParticleLife: 0.55,
  shakeDuration: 0.35,
  shakeMagnitude: 0.35,
};
