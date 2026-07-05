# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install deps (three, vite) — no other tooling in this repo
npm run dev      # start Vite dev server (default http://localhost:5173)
npm run build    # production build via Vite
npm run preview  # preview the production build
```

There is no test suite, no linter, and no TypeScript config in this repo — don't invent commands for them.

## Architecture

FableTower is a single-page, no-backend, no-asset-file 3D tower defense: vanilla JS + Three.js, built with Vite. Every texture, model, and sound is generated procedurally at runtime (see `src/scene/textures.js` and `src/systems/AudioManager.js`) — there are no image/audio files to load.

### Lifecycle: App -> Game, both fully disposable

`src/main.js` creates a single `App` (`src/core/App.js`), which is a screen state machine (`menu <-> map select <-> Game run`). `App` owns a `MenuBackground` (an orbiting camera over a live map, shown behind menu screens) and, once a map is picked, constructs a `Game` (`src/core/Game.js`) — one instance per playthrough.

The critical pattern throughout the codebase: **every long-lived object that touches the GPU or global listeners exposes `dispose()`**, and callers are expected to call it before replacing/discarding the object (scene, renderer, textures, event listeners). `App.startGame`/`quitToMenu` and `Game.dispose` show the expected teardown order. When adding new managers or scene objects, follow this same ownership/dispose contract rather than relying on GC — WebGL resources leak otherwise.

`createSceneContext` (`src/scene/sceneSetup.js`) is the shared factory for renderer/scene/camera/lights/OrbitControls; both `MenuBackground` and `Game` build their scene through it, themed via `THEMES[mapDef.theme]` from `src/config/maps.js`.

### Game composition

`Game` wires together independent manager/system objects rather than using an ECS or engine framework:

- `MapBuilder` (`src/scene/MapBuilder.js`) — builds ground/path/decorations from a map definition, exposes the grid <-> world conversion (`worldToGrid`, `gridToWorld`, `isBuildable`, `worldWaypoints`).
- `EnemyManager` / `Enemy` (`src/entities/`) — spawns and updates enemies along `worldWaypoints`; reports back via `onKill`/`onLeak` callbacks (not events/pubsub).
- `TowerManager` / `Tower` / `Projectile` (`src/entities/`) — placement, targeting, real traveling-projectile collision (no hitscan); reports via `onShot`/`onTrail`/`onDamage`/`onImpact` callbacks.
- `WaveManager` (`src/systems/WaveManager.js`) — turns a `WAVES` entry (`src/config.js`) into a timed spawn queue; `onWaveClear`/`onAllWavesCleared` callbacks drive game-end and audio mood.
- `Economy` (`src/systems/Economy.js`) — gold/lives, difficulty-scaled income.
- `Effects` (`src/systems/Effects.js`) — particle bursts, trails, flashes, floating damage numbers, camera shake.
- `UI` (`src/ui/UI.js`) + `Screens` (`src/ui/screens.js`) — HUD/tower-panel vs. full-screen menu/map-select/settings/pause/end overlays, respectively.

This callback-wiring pattern (constructor takes an options object of `on*` callbacks) is used consistently for manager -> `Game` communication — follow it for new managers rather than introducing an event bus.

`Game._tick()` is the single per-frame driver: advances wave/enemy/tower state (skipped when paused), then effects/map ambient animation, then UI, then renders through `postfx` (bloom composer). `speedMultiplier` (1x/2x) scales `dt` before anything else runs.

### Data-driven config

`src/config.js` (economy, enemy stats, tower stats/levels, wave composition, effects tuning) and `src/config/maps.js` (map layouts + `THEMES` palettes) are the single source of truth for balance. Gameplay/visual tuning changes should go there, not into entity/manager logic. Each tower type has exactly one upgrade tier (`levels: [level0, level1]`); enemy HP scales per wave via `WAVE_HP_GROWTH` in `Economy`/`EnemyManager`, not by editing `WAVES` directly.

### Extension points (called out in README, still accurate)

- `WaveManager` `onWaveClear` — hook for between-wave events.
- `Enemy.applySlow` — the one status effect today; generalize here for more.
- `MapBuilder.worldWaypoints` — swappable at runtime if path-switching is ever added.
- `Game._tick` — an ordered per-frame loop; a new subsystem update call slots in here.
- Tower `levels` arrays — extend for more upgrade tiers.
