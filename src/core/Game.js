import * as THREE from 'three';
import { createSceneContext } from '../scene/sceneSetup.js';
import { MapBuilder } from '../scene/MapBuilder.js';
import { EnemyManager } from '../entities/EnemyManager.js';
import { TowerManager } from '../entities/TowerManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { Economy } from '../systems/Economy.js';
import { Effects } from '../systems/Effects.js';
import { UI } from '../ui/UI.js';
import { TOWERS, MAP } from '../config.js';

export class Game {
  constructor(container) {
    const { renderer, scene, camera, controls } = createSceneContext(container);
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;

    this.state = 'playing'; // 'playing' | 'won' | 'lost'
    this.placementType = null; // tower type currently being placed
    this.selectedTower = null;

    this.map = new MapBuilder(scene);
    this.effects = new Effects(scene);

    this.enemyManager = new EnemyManager(scene, this.map.worldWaypoints, {
      onKill: (enemy) => {
        this.economy.addGold(enemy.reward);
        this.effects.deathBurst(enemy.position, enemy.cfg.color);
      },
      onLeak: (enemy) => {
        const remaining = this.economy.loseLives(enemy.livesCost);
        this.effects.shake();
        this.ui.flashDamage();
        if (remaining <= 0 && this.state === 'playing') {
          this.state = 'lost';
          this.ui.showEndScreen(false, this.waveManager.currentWave);
        }
      },
    });

    this.towerManager = new TowerManager(scene, this.map, {
      onImpact: (impact) => {
        if (impact.splashRadius > 0) {
          this.effects.impactPuff(impact.point, 0xffa94d, impact.splashRadius * 0.4);
        }
      },
    });

    this.economy = new Economy();

    this.waveManager = new WaveManager(this.enemyManager, {
      onWaveClear: (wave) => {
        if (this.state !== 'playing') return;
        this.economy.waveClearBonus(wave);
      },
      onAllWavesCleared: () => {
        if (this.state !== 'playing') return;
        this.state = 'won';
        this.ui.showEndScreen(true, this.waveManager.totalWaves);
      },
    });

    this.ui = new UI(this);

    this._buildGhost();
    this._setupInput();

    this.clock = new THREE.Clock();
    this._mapHalfW = (MAP.cols * MAP.tileSize) / 2;
    this._mapHalfH = (MAP.rows * MAP.tileSize) / 2;
  }

  // ---- placement ghost -----------------------------------------------------

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
      new THREE.PlaneGeometry(MAP.tileSize * 0.96, MAP.tileSize * 0.96),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.ghostTile.rotation.x = -Math.PI / 2;
    this.ghostTile.position.y = 0.05;
    this.ghost.add(this.ghostTile);

    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  togglePlacement(type) {
    if (this.state !== 'playing') return;
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
  }

  cancelPlacement() {
    this.placementType = null;
    this.ghost.visible = false;
    this.ui.setPlacementHint(false);
  }

  // ---- input ----------------------------------------------------------------

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
      if (moved > 6 || e.button !== 0) return; // was an orbit drag, not a click
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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cancelPlacement();
        this.deselectTower();
      }
    });
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
    this.ghost.position.set(pos.x, 0, pos.z);
    this.ghost.visible = true;

    const valid = this.map.isBuildable(col, row);
    const color = valid ? 0x4fd15f : 0xd14f4f;
    this.ghostBody.material.color.setHex(valid ? TOWERS[this.placementType].color : color);
    this.ghostTile.material.color.setHex(color);
    this.ghostRing.material.color.setHex(color);
    this._ghostCell = { col, row, valid };
  }

  _handleClick(e) {
    if (this.state !== 'playing') return;

    if (this.placementType) {
      this._updateGhost(e);
      if (this._ghostCell && this._ghostCell.valid) {
        const cost = TOWERS[this.placementType].cost;
        if (this.economy.spend(cost)) {
          this.towerManager.place(this.placementType, this._ghostCell.col, this._ghostCell.row);
          this.cancelPlacement();
        }
      }
      return;
    }

    // otherwise: try selecting a tower
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

  // ---- tower selection -------------------------------------------------------

  selectTower(tower) {
    if (this.selectedTower) this.selectedTower.setSelected(false);
    this.selectedTower = tower;
    tower.setSelected(true);
    this.ui.showTowerPanel(tower);
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
      this.ui.refreshTowerPanel(t);
    }
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;
    const value = this.towerManager.sell(t);
    this.economy.addGold(value);
    this.selectedTower = null;
    this.ui.hideTowerPanel();
  }

  // ---- waves ------------------------------------------------------------------

  startWave() {
    if (this.state !== 'playing') return;
    this.waveManager.startNextWave();
  }

  // ---- main loop ----------------------------------------------------------------

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === 'playing') {
      this.waveManager.update(dt);
      this.enemyManager.update(dt, this.camera);
      this.towerManager.update(dt, this.enemyManager.enemies);
    }
    this.effects.update(dt);

    // keep the orbit target on the map so panning can't lose the board
    this.controls.target.x = THREE.MathUtils.clamp(this.controls.target.x, -this._mapHalfW, this._mapHalfW);
    this.controls.target.z = THREE.MathUtils.clamp(this.controls.target.z, -this._mapHalfH, this._mapHalfH);
    this.controls.target.y = 0;
    this.controls.update();

    this.ui.update();

    this.effects.applyShake(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.effects.removeShake(this.camera);
  }
}
