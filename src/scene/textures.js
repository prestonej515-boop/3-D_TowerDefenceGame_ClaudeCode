import * as THREE from 'three';

// Procedurally generated canvas textures so the game ships zero asset files.
// All generators take a theme palette (see config/maps.js THEMES) so each map
// gets its own ground/path look.

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function speckle(ctx, size, count, colors, minR, maxR) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createGroundTexture(theme) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = theme.ground;

  ctx.fillStyle = g.base;
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, size, 2600, g.speckles, 2, 7);

  // blade / streak strokes
  ctx.strokeStyle = g.blades;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, y - 4 - Math.random() * 7);
    ctx.stroke();
  }

  // soft light patches for a hand-painted feel
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 70;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,235,0.07)');
    grad.addColorStop(1, 'rgba(255,255,235,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  return toTexture(canvas);
}

export function createPathTexture(theme) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const p = theme.path;

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, size, 1800, p.speckles, 2, 9);
  speckle(ctx, size, 130, p.pebbles, 3, 8);

  // wheel-rut streaks
  ctx.strokeStyle = p.ruts;
  ctx.lineWidth = 5;
  for (let i = 0; i < 20; i++) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      size * 0.3, y + (Math.random() - 0.5) * 18,
      size * 0.6, y + (Math.random() - 0.5) * 18,
      size, y
    );
    ctx.stroke();
  }

  return toTexture(canvas);
}

// Soft radial dot — used for clouds, projectile trails, and glow puffs.
export function createSoftCircleTexture() {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Renders a text label (damage numbers, gold popups) to a sprite texture.
export function createTextTexture(text, color, fontSize = 48) {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(10,14,22,0.9)';
  ctx.strokeText(text, 64, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
