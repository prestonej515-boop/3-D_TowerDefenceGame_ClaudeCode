import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Subtle bloom so emissive things (projectiles, portal, frost crystals) glow.
// Threshold is high so the base scene stays clean and toony.
export function createPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45, // strength
    0.5, // radius
    0.85 // threshold — only bright emissives bloom
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
    },
    setBloomEnabled(enabled) {
      bloom.enabled = enabled;
    },
    dispose() {
      composer.dispose();
    },
  };
}
