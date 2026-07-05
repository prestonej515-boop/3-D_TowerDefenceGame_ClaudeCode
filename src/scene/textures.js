import * as THREE from 'three';

// Procedurally generated canvas textures so the prototype needs no external
// asset files. Speckled noise + strokes give a stylized hand-painted look.

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

export function createGrassTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#5a9e4b';
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, size, 900, ['#4f9040', '#66ad55', '#579947', '#71b85f'], 1.5, 4);

  // grass blade strokes
  ctx.strokeStyle = 'rgba(46, 92, 36, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 4);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDirtTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#9c7a4f';
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, size, 700, ['#8d6c42', '#a98756', '#957247', '#b3905e'], 1.5, 5);

  // pebbles
  speckle(ctx, size, 60, ['#7a6a55', '#6e5f4c', '#84745f'], 2, 4.5);

  // subtle wheel-rut streaks along one axis
  ctx.strokeStyle = 'rgba(110, 84, 50, 0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 10, size * 0.6, y + (Math.random() - 0.5) * 10, size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
