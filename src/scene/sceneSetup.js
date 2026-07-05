import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Builds renderer, scene, camera, lights, and constrained orbit controls.
export function createSceneContext(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d9);
  scene.fog = new THREE.Fog(0x87b5d9, 60, 120);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
  // Elevated 3/4 view over the map
  camera.position.set(16, 26, 24);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Keep the player from clipping through the ground or losing the map
  controls.minDistance = 12;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2 - 0.12;
  controls.minPolarAngle = 0.1;
  controls.update();

  // Lighting: warm sun + cool ambient for a soft toony look
  const ambient = new THREE.AmbientLight(0xbfd4e8, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
  sun.position.set(20, 32, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a6b3a, 0.35);
  scene.add(hemi);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls };
}
