import * as THREE from 'three';
import { createSceneContext } from '../scene/sceneSetup.js';
import { createPostFX } from '../scene/postfx.js';
import { MapBuilder } from '../scene/MapBuilder.js';
import { EnemyManager } from '../entities/EnemyManager.js';
import { TowerManager } from '../entities/TowerManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { Economy } from '../systems/Economy.js';
import { Effects } from '../systems/Effects.js';
import { UI } from '../ui/UI.js';
import { TOWERS } from '../config.js';
import { THEMES } from '../config/maps.js';

const SHOT_SFX = {
  single: 'shoot_single',
  splash: 'shoot_splash',
  slow: 'shoot_slow',
  sniper: 'shoot_single',
  mortar: 'shoot_splash',
};
const TOWER_HOTKEYS = { 1: 'single', 2: 'splash', 3: 'slow', 4: 'sniper', 5: 'mortar' };

// One playthrough of one map. Created by App per run; dispose() tears the
// whole scene down so the player can return to the menu without a reload.
// mode: 'campaign' (authored waves, win at the end) | 'endless' (generated
// waves that scale until the player falls).
export class Game {
  constructor(container, mapDef, { settings, audio, mode = 'campaign', onPauseRequest, onGameEnd }) {
    this.mapDef = mapDef;
    this.mode = mode;
    this.settings = settings;
    this.audio = audio;
    this.onPauseRequest = onPauseRequest || (() => {});
    this.onGameEnd = onGameEnd || (() => {});

    // post-run stats
    this.killCount = 0;
    this.timeSurvived = 0; // real (unscaled) seconds while playing

    const theme = THEMES[mapDef.theme];
    const ctx = createSceneContext(container, theme, settings);
    this.sceneCtx = ctx;
    this.renderer = ctx.renderer;
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.controls = ctx.controls;

    this.postfx = createPostFX(this.renderer, this.scene, this.camera);
    ctx.onResize((w, h) => this.postfx.setSize(w, h));
    this.postfx.setBloomEnabled(settings.get('shadowQuality') !== 'off');
    this._settingsListener = (key, value) => {
      if (key === 'shadowQuality') {
        ctx.applyShadowQuality(value);
        this.postfx.setBloomEnabled(value !== 'off');
      }
    };
    settings.onChange(this._settingsListener);

    this.state = 'playing'; // 'playing' | 'won' | 'lost'
    this.paused = false;
    this.speedMultiplier = 1;
    this.placementType = null;
    this.selectedTower = null;

    const mods = mapDef.modifiers;
    this.map = new MapBuilder(this.scene, mapDef);
    this.effects = new Effects(this.scene, settings);
    this.economy = new Economy({ startLives: mods.startLives, goldMultiplier: mods.gold });

    this.enemyManager = new EnemyManager(this.scene, this.map.worldWaypoints, {
      modifiers: { hp: mods.hp, speed: mods.speed },
      onKill: (enemy) => {
        this.killCount++;
        const earned = this.economy.addIncome(enemy.reward);
        this.effects.deathBurst(enemy.position, enemy.cfg.color);
        this.effects.goldPopup(enemy.position, earned);
        this.audio.play('death');
      },
      onSummon: (summoner) => {
        this.effects.impactPuff(summoner.position, 0xb060e8, 1.0);
      },
      onLeak: (enemy) => {
        const remaining = this.economy.loseLives(enemy.livesCost);
        this.effects.shake();
        this.ui.flashDamage();
        this.audio.play('base_hit');
        if (remaining <= 0 && this.state === 'playing') {
          this._endGame(false);
        }
      },
    });

    this.towerManager = new TowerManager(this.scene, this.map, {
      onShot: (shot) => {
        this.effects.muzzleFlash(shot.origin, shot.color);
        this.audio.play(SHOT_SFX[shot.sourceTower.type]);
      },
      onTrail: (pos, color) => this.effects.trailPuff(pos, color),
      onDamage: (enemy, dealt) => this.effects.damageNumber(enemy.position, dealt),
      onImpact: (impact) => {
        if (impact.splashRadius > 0) {
          this.effects.impactPuff(impact.point, 0xffa94d, impact.splashRadius * 0.4);
          this.audio.play('explosion');
        }
      },
    });

    this.waveManager = new WaveManager(this.enemyManager, {
      endless: mode === 'endless',
      onWaveClear: (wave) => {
        if (this.state !== 'playing') return;
        const bonus = this.economy.waveClearBonus(wave);
        this.ui.toast(`+${bonus} gold — Wave ${wave} cleared!`);
        this.audio.setMood('calm');
      },
      onAllWavesCleared: () => {
        if (this.state !== 'playing') return;
        this._endGame(true);
      },
    });

    this.ui = new UI(this);

    this._buildGhost();
    this._setupInput();

    this.clock = new THREE.Clock();
    this._mapHalfW = (mapDef.cols * mapDef.tileSize) / 2;
    this._mapHalfH = (mapDef.rows * mapDef.tileSize) / 2;

    this.renderer.setAnimationLoop(() => this._tick());
  }

  _endGame(won) {
    this.state = won ? 'won' : 'lost';
    this.cancelPlacement();
    this.deselectTower();
    this.audio.play(won ? 'win' : 'lose');
    this.audio.setMood('calm');
    this.onGameEnd(won, this.waveManager.currentWave, {
      wavesSurvived: won ? this.waveManager.currentWave : Math.max(this.waveManager.currentWave - 1, 0),
      kills: this.killCount,
      goldEarned: this.economy.totalEarned,
      timeSurvived: this.timeSurvived,
    });
  }

  // ---- placement ghost -------------------------------------------------------

  _buildGhost() {
    this.ghost = new THREE.Group();

    this.ghostBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.85, 1.5, 12),
      new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.55 })
    );
    this.ghostBody.position.y = 0.75;
    this.ghost.add(this.ghostBody);

    this.ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.06, 48),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.position.y = 0.06;
    this.ghost.add(this.ghostRing);

    this.ghostTile = new THREE.Mesh(
      new THREE.PlaneGeometry(this.mapDef.tileSize * 0.96, this.mapDef.tileSize * 0.96),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.ghostTile.rotation.x = -Math.PI / 2;
    this.ghostTile.position.y = 0.05;
    this.ghost.add(this.ghostTile);

    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  togglePlacement(type) {
    if (this.state !== 'playing' || this.paused) return;
    if (this.placementType === type) {
      this.cancelPlacement();
      return;
    }
    if (!this.economy.canAfford(TOWERS[type].cost)) return;
    this.deselectTower();
    this.placementType = type;
    this.ghost.visible = false; // shown on first pointer move over the map
    const range = TOWERS[type].levels[0].range;
    this.ghostRing.geometry.dispose();
    this.ghostRing.geometry = new THREE.RingGeometry(range - 0.06, range, 48);
    this.ui.setPlacementHint(true);
    this.audio.play('ui_click');
  }

  cancelPlacement() {
    this.placementType = null;
    this.ghost.visible = false;
    this.ui.setPlacementHint(false);
  }

  // ---- input -------------------------------------------------------------------

  _setupInput() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const canvas = this.renderer.domElement;
    let downX = 0;
    let downY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    canvas.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6 || e.button !== 0) return; // orbit drag, not a click
      this._handleClick(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.placementType) return;
      this._updateGhost(e);
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.cancelPlacement();
    });

    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        if (this.placementType) {
          this.cancelPlacement();
        } else if (this.selectedTower) {
          this.deselectTower();
        } else {
          this.onPauseRequest();
        }
      } else if (TOWER_HOTKEYS[e.key] && !this.paused) {
        this.togglePlacement(TOWER_HOTKEYS[e.key]);
      } else if (e.key === ' ' && !this.paused) {
        e.preventDefault();
        if (this.waveManager.canStartWave) this.startWave();
        else if (this.waveManager.active) this.toggleSpeed();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _setPointer(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  _groundPoint(e) {
    this._setPointer(e);
    const hits = this.raycaster.intersectObject(this.map.groundMesh);
    return hits.length ? hits[0].point : null;
  }

  _updateGhost(e) {
    const point = this._groundPoint(e);
    if (!point) {
      this.ghost.visible = false;
      return;
    }
    const { col, row } = this.map.worldToGrid(point);
    if (!this.map.inBounds(col, row)) {
      this.ghost.visible = false;
      return;
    }
    const pos = this.map.gridToWorld(col, row);
    // ghost sits on the platform surface when hovering an elevated zone
    this.ghost.position.set(pos.x, this.map.placementHeight(col, row), pos.z);
    this.ghost.visible = true;

    const valid = this.map.canPlaceType(col, row, TOWERS[this.placementType]);
    const color = valid ? 0x4fd15f : 0xd14f4f;
    this.ghostBody.material.color.setHex(valid ? TOWERS[this.placementType].color : color);
    this.ghostTile.material.color.setHex(color);
    this.ghostRing.material.color.setHex(color);
    this._ghostCell = { col, row, valid };
  }

  _handleClick(e) {
    if (this.state !== 'playing' || this.paused) return;

    if (this.placementType) {
      this._updateGhost(e);
      if (this._ghostCell && this._ghostCell.valid) {
        const cost = TOWERS[this.placementType].cost;
        if (this.economy.spend(cost)) {
          this.towerManager.place(this.placementType, this._ghostCell.col, this._ghostCell.row);
          this.audio.play('place');
          this.cancelPlacement();
        }
      }
      return;
    }

    this._setPointer(e);
    const hits = this.raycaster.intersectObjects(this.towerManager.selectableMeshes, true);
    if (hits.length) {
      const tower = this.towerManager.towerFromObject(hits[0].object);
      if (tower) {
        this.selectTower(tower);
        return;
      }
    }
    this.deselectTower();
  }

  // ---- tower selection ------------------------------------------------------------

  selectTower(tower) {
    if (this.selectedTower) this.selectedTower.setSelected(false);
    this.selectedTower = tower;
    tower.setSelected(true);
    this.ui.showTowerPanel(tower);
    this.audio.play('ui_click');
  }

  deselectTower() {
    if (this.selectedTower) this.selectedTower.setSelected(false);
    this.selectedTower = null;
    this.ui.hideTowerPanel();
  }

  upgradeSelected() {
    const t = this.selectedTower;
    if (!t || t.maxLevel) return;
    if (this.economy.spend(t.upgradeCost)) {
      t.upgrade();
      this.audio.play('upgrade');
      this.ui.refreshTowerPanel(t);
    }
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;
    const value = this.towerManager.sell(t);
    this.economy.addGold(value); // refunds are never difficulty-scaled
    this.audio.play('sell');
    this.selectedTower = null;
    this.ui.hideTowerPanel();
  }

  setTargetingMode(mode) {
    if (this.selectedTower) {
      this.selectedTower.setTargetingMode(mode);
      this.ui.refreshTowerPanel(this.selectedTower);
    }
  }

  // ---- flow -----------------------------------------------------------------------

  startWave() {
    if (this.state !== 'playing' || this.paused) return;
    if (this.waveManager.startNextWave()) {
      this.audio.play('wave_start');
      this.audio.setMood('tense');
    }
  }

  toggleSpeed() {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.audio.play('ui_click');
  }

  pause() {
    this.paused = true;
    this.cancelPlacement();
  }

  resume() {
    this.paused = false;
    this.clock.getDelta(); // swallow time spent paused
  }

  // ---- main loop ---------------------------------------------------------------------

  _tick() {
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const dt = this.paused ? 0 : rawDt * this.speedMultiplier;

    if (this.state === 'playing' && !this.paused) {
      this.timeSurvived += rawDt;
      this.waveManager.update(dt);
      this.enemyManager.update(dt, this.camera);
      this.towerManager.update(dt, this.enemyManager.enemies);
    }
    if (!this.paused) {
      this.effects.update(dt);
      this.map.update(dt); // ambient animation (portal, trees, clouds, flag)
    }

    // keep the orbit target on the map so panning can't lose the board
    this.controls.target.x = THREE.MathUtils.clamp(this.controls.target.x, -this._mapHalfW, this._mapHalfW);
    this.controls.target.z = THREE.MathUtils.clamp(this.controls.target.z, -this._mapHalfH, this._mapHalfH);
    this.controls.target.y = 0;
    this.controls.update();

    this.ui.update();

    this.effects.applyShake(this.camera);
    this.postfx.composer.render();
    this.effects.removeShake(this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('keydown', this._keyHandler);
    this.settings.offChange(this._settingsListener);
    this.enemyManager.clear();
    this.towerManager.clear();
    this.effects.clear();
    this.ui.dispose();
    this.postfx.dispose();
    this.sceneCtx.dispose();
  }
}
