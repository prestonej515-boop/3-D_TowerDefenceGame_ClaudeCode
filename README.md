# FableTower — 3D Tower Defense

A wave-based 3D tower defense built with **Three.js + Vite** (vanilla JS, no backend, zero asset files — all textures, models, and audio are procedurally generated).

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

## Features

- **Main menu** with an animated 3D backdrop, map select, and settings
- **3 maps / difficulties:** Green Meadow (Easy), Scorched Dunes (Medium), Frozen Pass (Hard) — each with its own theme (grass/desert/snow), path layout, and modifiers (enemy HP/speed up, gold income down, fewer lives)
- **Procedural audio:** synthesized SFX for every action + a generative chiptune loop that shifts from calm to tense while a wave is active
- **Settings** (persisted in localStorage): music/SFX volume, shadow quality, screen shake
- **Pause menu** (Esc) and **1×/2× game speed**
- **Tower depth:** per-tower live DPS meter (10s window), total damage, kills, targeting mode (Near / First / Strong), and an upgrade preview showing exact stat deltas before you buy
- **Graphics:** bloom post-processing, ACES tone mapping, themed lighting/fog, multi-part tower models with visible level-2 upgrades, enemy faces, projectile trails, muzzle flashes, floating damage numbers, gold popups, death squash + particle bursts, drifting clouds, swaying trees, animated spawn portal

## Controls

| Action | Input |
| --- | --- |
| Orbit / pan / zoom | Left-drag / right-drag / scroll (clamped to the map) |
| Place a tower | Tower card or hotkey `1`/`2`/`3` → click a green tile |
| Cancel placement | `Esc`, right-click, or click the card again |
| Inspect / upgrade / sell / retarget | Click a placed tower |
| Start wave / toggle speed | Button or `Space` |
| Pause | `Esc` or the HUD pause button |

## Gameplay

- **10 waves**, escalating mix + per-wave HP scaling, difficulty-modified per map.
- **Enemies:** Basic (fast), Armored (tanky, 2 lives), Swarm (fragile packs).
- **Towers:** Gunner (fast single-target), Cannon (AoE splash), Frost (slow debuff) — one upgrade tier each with distinct level-2 looks.
- **Targeting:** default rule is nearest-to-tower (sticky while valid); switchable per tower to First (furthest along path) or Strong (highest HP).
- Projectiles are real traveling meshes with per-frame collision — no hitscan.

## Project structure

```
index.html              screens + HUD markup
src/
  main.js               entry — creates App
  config.js             enemies, towers, waves, economy, effects tuning
  config/maps.js        3 map defs + THEMES palettes
  core/
    App.js              screen state machine, game lifecycle, menu backdrop
    Game.js             one playthrough: loop, input, pause/speed, dispose()
  scene/
    sceneSetup.js       renderer, camera, themed lights, shadow tiers, dispose
    postfx.js           EffectComposer + bloom
    textures.js         procedural ground/path/text/glow textures
    MapBuilder.js       map-def-driven ground/path/markers/decorations/clouds
  entities/
    Enemy.js            waypoint movement, difficulty mods, faces, squash death
    EnemyManager.js     spawn/update/remove, kill & leak callbacks
    Tower.js            multi-part models, DPS tracking, targeting modes
    TowerManager.js     placement, projectiles, damage attribution
    Projectile.js       homing projectile with collision + source tower
  systems/
    WaveManager.js      wave config → timed spawn queue
    Economy.js          gold (difficulty-scaled income) + lives
    Effects.js          bursts, trails, flashes, damage numbers, shake
    AudioManager.js     procedural SFX + generative music (Web Audio)
    Settings.js         localStorage settings + change listeners
  ui/
    screens.js          menu / map select / settings / pause / end screens
    UI.js               HUD, tower bar, tower panel, wave preview, toasts
```

## Known limitations

- Path corners are sharp turns, not smoothed curves.
- Music is a single generative progression (two moods), not full tracks.
- Balance is a second pass — tune in `src/config.js` / `src/config/maps.js`.

## Where a future gimmick can plug in

- `WaveManager` callbacks (`onWaveClear`) — between-wave events (day/night, shops, path switches)
- `Enemy.applySlow` — generalize into a status-effect list
- `MapBuilder.worldWaypoints` — swappable at runtime for path-switching
- `Game._tick` — a `GimmickManager.update(dt)` slots into the ordered loop
- Tower `levels` arrays — more tiers or fusion-style branching
