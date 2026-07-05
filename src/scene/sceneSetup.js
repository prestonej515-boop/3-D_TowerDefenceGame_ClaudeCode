import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Builds renderer, scene, camera, themed lights, and constrained orbit
// controls. Returns a context object with a dispose() so a scene can be
// fully torn down when returning to the menu.
export function createSceneContext(container, theme, settings) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 60, 130);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(16, 26, 24); // elevated 3/4 view

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2 - 0.12;
  controls.minPolarAngle = 0.1;
  controls.update();

  const ambient = new THREE.AmbientLight(theme.ambient, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  sun.position.set(20, 32, 12);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(theme.sky, theme.hemiGround, 0.35);
  scene.add(hemi);

  function applyShadowQuality(quality) {
    const enabled = quality !== 'off';
    renderer.shadowMap.enabled = enabled;
    sun.castShadow = enabled;
    if (enabled) {
      const res = quality === 'high' ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== res) {
        sun.shadow.mapSize.set(res, res);
        if (sun.shadow.map) {
          sun.shadow.map.dispose();
          sun.shadow.map = null;
        }
      }
    }
    // force material recompile so the shadow toggle takes effect immediately
    scene.traverse((obj) => {
      if (obj.material) obj.material.needsUpdate = true;
    });
  }
  applyShadowQuality(settings ? settings.get('shadowQuality') : 'high');

  const resizeCallbacks = [];
  const onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    for (const cb of resizeCallbacks) cb(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onWindowResize);

  return {
    renderer,
    scene,
    camera,
    controls,
    sun,
    applyShadowQuality,
    onResize(cb) {
      resizeCallbacks.push(cb);
    },
    dispose() {
      window.removeEventListener('resize', onWindowResize);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            for (const key of Object.keys(m)) {
              if (m[key] && m[key].isTexture) m[key].dispose();
            }
            m.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
