import * as THREE from 'three';
import { MAPS, THEMES } from '../config/maps.js';
import { Settings } from '../systems/Settings.js';
import { Records } from '../systems/Records.js';
import { AudioManager } from '../systems/AudioManager.js';
import { loadMidi } from '../systems/MidiSong.js';
import { Screens } from '../ui/screens.js';
import { preloadModels } from '../systems/ModelLibrary.js';
import { preloadChickenModel } from '../systems/ChickenModel.js';
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
    // custom wave/build-time tracks; generative music stays the fallback if
    // either fails to load
    loadMidi(`${import.meta.env.BASE_URL}audio/pixel_pursuit_quiet_pulse.mid`)
      .then((song) => this.audio.setTenseSong(song))
      .catch((err) => console.warn('Tense MIDI failed to load, using generative music:', err));
    loadMidi(`${import.meta.env.BASE_URL}audio/pixel_pursuit_soft_pluck.mid`)
      .then((song) => this.audio.setCalmSong(song))
      .catch((err) => console.warn('Calm MIDI failed to load, using generative music:', err));
    this.game = null;
    this.currentMapDef = null;

    this.currentMode = 'campaign';
    this.records = new Records();
    this.screens = new Screens({
      settings: this.settings,
      audio: this.audio,
      records: this.records,
      onSelectMap: (mapDef, mode, difficulty) => this.startGame(mapDef, mode, difficulty),
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
    // boss chicken loads separately (bigger file; boss/chicks fall back to
    // UFO models if one spawns before it arrives)
    preloadChickenModel().catch((err) => {
      console.error('Chicken boss model failed to load:', err);
    });

    // build the menu backdrop once tile/decoration models are in, so it gets
    // the same kit visuals as real games (MapBuilder falls back gracefully
    // regardless)
    this.menuBg = null;
    this.modelsLoaded.then(() => {
      if (!this.game && !this.menuBg) this.menuBg = new MenuBackground(container, this.settings);
    });
    this.screens.show('menu');
  }

  async startGame(mapDef, mode = 'campaign', difficulty = 'normal') {
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
    this.currentDifficulty = difficulty;
    this.screens.hideEnd();
    this.screens.show('game');
    this.audio.setMood('calm');

    this.game = new Game(this.container, mapDef, {
      settings: this.settings,
      audio: this.audio,
      mode,
      difficulty,
      flameUnlocked: this.records.anyCampaignWon(),
      onPauseRequest: () => this.pauseGame(),
      onGameEnd: (won, wave, stats) => {
        this.records.report(mapDef.id, mode, wave, won);
        this.screens.showEnd(won, wave, mapDef, mode, stats, difficulty);
      },
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
    this.startGame(this.currentMapDef, this.currentMode, this.currentDifficulty);
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
