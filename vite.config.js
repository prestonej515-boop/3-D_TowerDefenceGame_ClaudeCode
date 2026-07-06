import { defineConfig } from 'vite';

// GitHub Pages serves this repo at /<repo-name>/, so production builds need
// that base path; dev stays at / so localhost:5173 keeps working.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/3-D_TowerDefenceGame_ClaudeCode/' : '/',
}));
