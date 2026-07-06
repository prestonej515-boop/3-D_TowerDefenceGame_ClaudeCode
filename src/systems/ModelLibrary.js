import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Kenney Tower Defense Kit pieces (public/models/*.glb, CC0).
// Everything is preloaded once at startup; getModel() hands out cheap clones
// that share geometry/materials with the cached original — so consumers must
// NOT dispose those shared resources.
const loader = new GLTFLoader();
const cache = new Map(); // name -> THREE.Group (original scene)

// Only list what the game actually composes; add names here as needed.
const MODEL_NAMES = [
  // gunner (square tower + turret)
  'tower-square-bottom-b',
  'tower-square-middle-b',
  'tower-square-top-b',
  'weapon-turret',
  // cannon (round tower + cannon)
  'tower-round-bottom-b',
  'tower-round-middle-b',
  'tower-round-top-b',
  'weapon-cannon',
  // frost (round tower + crystals)
  'tower-round-bottom-c',
  'tower-round-middle-c',
  'tower-round-crystals',
  'detail-crystal',
  // sniper (tall square tower + ballista)
  'tower-square-bottom-a',
  'tower-square-middle-a',
  'tower-square-top-a',
  'weapon-ballista',
  // mortar (squat round base + catapult)
  'tower-round-base',
  'weapon-catapult',
  // enemies
  'enemy-ufo-a',
  'enemy-ufo-b',
  'enemy-ufo-c',
  'enemy-ufo-d',
];

let readyPromise = null;

export function preloadModels() {
  if (!readyPromise) {
    readyPromise = Promise.all(
      MODEL_NAMES.map(async (name) => {
        const gltf = await loader.loadAsync(`/models/${name}.glb`);
        cache.set(name, gltf.scene);
      })
    );
  }
  return readyPromise;
}

export function modelsReady() {
  return cache.size >= MODEL_NAMES.length;
}

// Returns a shadow-casting clone, or null if not preloaded (callers fall back
// to procedural meshes so a failed fetch can't break the game).
export function getModel(name) {
  const src = cache.get(name);
  if (!src) return null;
  const clone = src.clone(true);
  clone.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return clone;
}
