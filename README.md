# FableTower — 3D Tower Defense Prototype

A playable wave-based 3D tower defense built with **Three.js + Vite** (vanilla JS, no backend).

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

## Controls

| Action | Input |
| --- | --- |
| Orbit camera | Left-drag |
| Pan camera | Right-drag (target stays clamped to the map) |
| Zoom | Scroll wheel (clamped 12–60 units) |
| Place a tower | Click a tower card → click a green tile (ghost turns red on invalid tiles) |
| Cancel placement | `Esc`, right-click, or click the card again |
| Inspect / upgrade / sell | Click a placed tower |
| Start the next wave | **Start Wave** button (waves never auto-start) |

## Gameplay

- **10 waves**, escalating mix + per-wave HP scaling (`WAVE_HP_GROWTH`).
- **Enemies:** Basic (fast, low HP), Armored (slow, tanky, costs 2 lives), Swarm (very fast, fragile, spawns in packs).
- **Towers:** Gunner (fast single-target), Cannon (slow AoE splash), Frost (low damage + slow debuff). Each has one upgrade tier.
- **Economy:** gold from kills + wave-clear bonuses; selling refunds 70% of invested gold.
- **Targeting rule:** towers target the **nearest enemy to the tower** among those in range, and keep their current target while it stays alive and in range.
- Projectiles are real traveling meshes with per-frame collision checks — no hitscan.

## Project structure

```
index.html            HTML shell + HUD/panel markup
src/
  main.js             entry point
  config.js           ALL balance data: map, enemies, towers, waves, economy, effects
  style.css           HUD / panel styling
  core/Game.js        game loop, input (raycast placement & selection), state machine
  scene/
    sceneSetup.js     renderer, camera, constrained OrbitControls, lights
    textures.js       procedural canvas textures (grass, dirt)
    MapBuilder.js     ground, path tiles, grid helpers, base/spawn markers, trees
  entities/
    Enemy.js          waypoint movement, HP bar, slow debuff, hit flash
    EnemyManager.js   spawn/update/remove, kill & leak callbacks
    Tower.js          per-type meshes, targeting, fire cooldown, recoil, upgrades
    TowerManager.js   placement, sell, projectile ownership, splash resolution
    Projectile.js     homing projectile with collision + lifetime failsafe
  systems/
    WaveManager.js    wave config → timed spawn queue, clear/win detection
    Economy.js        gold + lives
    Effects.js        death bursts, splash puffs, camera shake
  ui/UI.js            DOM HUD, tower bar, upgrade/sell panel, end screens
```

## Known limitations / rough edges

- Restart reloads the page rather than doing an in-place state reset.
- Placement mode exits after each placement (no shift-to-place-multiple).
- HP bars are simple billboarded planes; no damage numbers.
- Enemy path corners are sharp turns, not smoothed curves.
- No sound.
- Balance is a first pass — tune everything in `src/config.js`.

## Where a future gimmick can plug in

- **`src/config.js`** — add gimmick tuning data without touching logic.
- **`WaveManager` callbacks** (`onWaveClear`, `onAllWavesCleared`) — natural hooks for between-wave events (day/night flip, path switch, shop).
- **`Enemy.applySlow` / `slowFactor` pattern** — generalize into a status-effect list for new debuffs/buffs.
- **`MapBuilder.worldWaypoints`** — swap or mutate at runtime for path-switching mechanics; `pathCells` recompute is isolated in `_computePathCells`.
- **`Game._tick`** — single ordered update loop; a `GimmickManager.update(dt)` slots in cleanly.
- **`Tower` upgrade system** — `levels` array in config already supports more tiers or branching (fusion could merge two towers into a new config entry).
