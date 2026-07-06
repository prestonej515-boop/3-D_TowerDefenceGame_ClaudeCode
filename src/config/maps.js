// ---------------------------------------------------------------------------
// Map definitions. Each map is a self-contained layout + theme + difficulty
// package. Waypoints are grid coordinates [col, row]; they may extend past
// the grid edge so enemies enter from off-screen and the base sits at the rim.
// Modifiers scale enemy hp/speed and gold income per difficulty.
// ---------------------------------------------------------------------------

export const MAPS = [
  {
    id: 'meadow',
    name: 'Green Meadow',
    difficulty: 'Easy',
    theme: 'grass',
    tagline: 'A long winding road with plenty of room to build.',
    cols: 16,
    rows: 12,
    tileSize: 2,
    waypoints: [
      [-1, 2],
      [12, 2],
      [12, 6],
      [3, 6],
      [3, 9],
      [16, 9],
    ],
    decorationCount: 14,
    // grid cells with raised platforms; only sniper towers may build here
    elevatedZones: [[6, 4], [10, 4], [1, 7], [7, 7], [14, 7]],
    modifiers: { hp: 1.0, speed: 1.0, gold: 1.0, startLives: 25 },
  },
  {
    id: 'dunes',
    name: 'Scorched Dunes',
    difficulty: 'Medium',
    theme: 'desert',
    tagline: 'A twisting canyon trail — enemies hit harder out here.',
    cols: 16,
    rows: 12,
    tileSize: 2,
    waypoints: [
      [-1, 1],
      [5, 1],
      [5, 4],
      [10, 4],
      [10, 1],
      [14, 1],
      [14, 7],
      [8, 7],
      [8, 10],
      [16, 10],
    ],
    decorationCount: 18,
    elevatedZones: [[3, 3], [7, 2], [12, 3], [11, 6], [6, 8]],
    modifiers: { hp: 1.25, speed: 1.1, gold: 0.9, startLives: 20 },
  },
  {
    id: 'glacier',
    name: 'Frozen Pass',
    difficulty: 'Hard',
    theme: 'snow',
    tagline: 'A short, brutal run. Every tower placement counts.',
    cols: 16,
    rows: 12,
    tileSize: 2,
    waypoints: [
      [-1, 6],
      [4, 6],
      [4, 3],
      [9, 3],
      [9, 8],
      [13, 8],
      [13, 5],
      [16, 5],
    ],
    decorationCount: 26,
    elevatedZones: [[2, 4], [6, 5], [11, 6], [14, 3]],
    modifiers: { hp: 1.6, speed: 1.2, gold: 0.85, startLives: 15 },
  },
];

// Per-theme palette used by the scene, textures, and decorations.
export const THEMES = {
  grass: {
    sky: 0x87b5d9,
    fog: 0x87b5d9,
    sunColor: 0xfff2d8,
    sunIntensity: 1.9,
    ambient: 0xbfd4e8,
    hemiGround: 0x4a6b3a,
    apronTint: 0xb9ccb0,
    ground: { base: '#5a9e4b', speckles: ['#4f9040', '#66ad55', '#579947', '#71b85f'], blades: 'rgba(46, 92, 36, 0.5)' },
    path: { base: '#9c7a4f', speckles: ['#8d6c42', '#a98756', '#957247', '#b3905e'], pebbles: ['#7a6a55', '#6e5f4c', '#84745f'], ruts: 'rgba(110, 84, 50, 0.35)' },
  },
  desert: {
    sky: 0xf0c987,
    fog: 0xe8bd7a,
    sunColor: 0xffe0b0,
    sunIntensity: 2.2,
    ambient: 0xe8d2b0,
    hemiGround: 0x8a6b3a,
    apronTint: 0xd9c49a,
    ground: { base: '#d4a866', speckles: ['#c69a58', '#dfb474', '#cfa260', '#e2bc80'], blades: 'rgba(150, 110, 60, 0.4)' },
    path: { base: '#a5723f', speckles: ['#946336', '#b37e48', '#9d6b3b', '#bc8850'], pebbles: ['#8a6a48', '#7a5c3e', '#997754'], ruts: 'rgba(120, 80, 42, 0.4)' },
  },
  snow: {
    sky: 0xaec6dd,
    fog: 0xbfd2e4,
    sunColor: 0xe8f0ff,
    sunIntensity: 1.6,
    ambient: 0xd0dcec,
    hemiGround: 0x8a9cb0,
    apronTint: 0xdde6ee,
    ground: { base: '#e8eef4', speckles: ['#dbe4ed', '#f2f6fa', '#d2dde8', '#eef3f8'], blades: 'rgba(170, 190, 210, 0.5)' },
    path: { base: '#9fb2c4', speckles: ['#91a5b8', '#adbfcf', '#98abbd', '#b6c7d5'], pebbles: ['#7e93a8', '#71869b', '#8ba0b3'], ruts: 'rgba(110, 130, 150, 0.4)' },
  },
};
