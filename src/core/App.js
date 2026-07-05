import * as THREE from 'three';
import { MAPS, THEMES } from '../config/maps.js';
import { Settings } from '../systems/Settings.js';
import { AudioManager } from '../systems/AudioManager.js';
import { Screens } from '../ui/screens.js';
import { preloadModels } from '../systems/ModelLibrary.js';
import { createSceneContext } from '../scene/sceneSetup.js';
import { MapBuilder } from '../scene/MapBuilder.js';
import { Game } from './Game.js';

// Slowly orbiting camera over the meadow map — a living backdrop for the
// menu screens, torn down when a real game starts.
class MenuBackground {
  constructor(container, settings) {
    this.ctx = createSceneContext(container, THEMES.grass, settings);
    this.ctx.controls.enabled = false;
    this.map = new MapBuilder(this.ctx.scene, MAPS[0]);
    this.clock = new THREE.Clock();
    this.angle = 0.6;
    this.ctx.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.angle += dt * 0.06;
    this.map.update(dt);
    const cam = this.ctx.camera;
    cam.position.set(Math.cos(this.angle) * 30, 21, Math.sin(this.angle) * 30);
    cam.lookAt(0, 0, 0);
    this.ctx.renderer.render(this.ctx.scene, cam);
  }

  dispose() {
    this.ctx.renderer.setAnimationLoop(null);
    this.ctx.dispose();
  }
}

// Top-level screen state machine: menu <-> map select <-> a Game run.
// Each run gets a fresh Game (and scene/renderer), fully disposed on exit.
export class App {
  constructor(container) {
    this.container = container;
    this.settings = new Settings();
    this.audio = new AudioManager(this.settings);
    this.game = null;
    this.currentMapDef = null;

    this.currentMode = 'campaign';
    this.screens = new Screens({
      settings: this.settings,
      audio: this.audio,
      onSelectMap: (mapDef, mode) => this.startGame(mapDef, mode),
      onResume: () => this.resumeGame(),
      onQuitToMenu: () => this.quitToMenu(),
      onRetry: () => this.retry(),
    });

    // browsers require a user gesture before audio can start
    const unlockAudio = () => {
      this.audio.unlock();
      this.audio.startMusic();
      this.audio.setMood('calm');
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    // kick off tower-model loading while the player sits in the menu
    this.modelsLoaded = preloadModels().catch((err) => {
      console.error('Tower models failed to load:', err);
    });

    this.menuBg = new MenuBackground(container, this.settings);
    this.screens.show('menu');
  }

  async startGame(mapDef, mode = 'campaign') {
    await this.modelsLoaded; // ~instant unless the menu was skipped fast
    if (this.menuBg) {
      this.menuBg.dispose();
      this.menuBg = null;
    }
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    this.currentMapDef = mapDef;
    this.currentMode = mode;
    this.screens.hideEnd();
    this.screens.show('game');
    this.audio.setMood('calm');

    this.game = new Game(this.container, mapDef, {
      settings: this.settings,
      audio: this.audio,
      mode,
      onPauseRequest: () => this.pauseGame(),
      onGameEnd: (won, wave, stats) => this.screens.showEnd(won, wave, mapDef, mode, stats),
    });
  }

  pauseGame() {
    if (!this.game || this.game.state !== 'playing') return;
    if (this.screens.settingsOpen) {
      // settings stacks above pause — Esc should peel it off, not resume
      this.screens.closeSettings();
      return;
    }
    if (this.screens.pauseOpen) {
      this.resumeGame();
      return;
    }
    this.game.pause();
    this.screens.showPause();
  }

  resumeGame() {
    this.screens.hidePause();
    if (this.game) this.game.resume();
  }

  retry() {
    this.startGame(this.currentMapDef, this.currentMode);
  }

  quitToMenu() {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    this.screens.hidePause();
    this.screens.hideEnd();
    this.menuBg = new MenuBackground(this.container, this.settings);
    this.screens.show('menu');
    this.audio.setMood('calm');
  }
}
