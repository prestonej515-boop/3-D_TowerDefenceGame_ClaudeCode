import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.start();

// dev-console handle for debugging/balancing
window.__game = game;
