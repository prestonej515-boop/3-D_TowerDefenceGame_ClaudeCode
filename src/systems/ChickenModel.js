import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// The chicken boss GLB (public/models/chicken.glb) is skinned + animated, so
// it can't go through ModelLibrary's plain .clone() — skinned meshes need
// SkeletonUtils.clone to rebind their skeletons. Same contract otherwise:
// preload once, hand out clones that share geometry/textures with the cache
// (Enemy only disposes its per-instance cloned materials).

let cachedGltf = null;
let cachedRoast = null;
let loadPromise = null;

export function preloadChickenModel() {
  if (!loadPromise) {
    loadPromise = new GLTFLoader()
      .loadAsync(`${import.meta.env.BASE_URL}models/chicken.glb`)
      .then((gltf) => {
        gltf.scene.traverse((obj) => {
          if (obj.isMesh) obj.castShadow = true;
        });
        // the GLB ships the live chicken AND a roasted-chicken prop in one
        // scene — detach the roast so enemies don't spawn with dinner beside
        // them; the boss death sequence reuses it via createRoastedChicken()
        const roast = findRoast(gltf.scene);
        if (roast) {
          // bake the ancestor chain (Sketchfab root scale + rotations) into
          // the detached node, then drop the side-by-side offset so the prop
          // shares the live chicken's origin
          gltf.scene.updateMatrixWorld(true);
          roast.matrixWorld.decompose(roast.position, roast.quaternion, roast.scale);
          roast.position.set(0, 0, 0);
          roast.removeFromParent();
          cachedRoast = roast;
        }
        cachedGltf = gltf;
        return gltf;
      });
  }
  return loadPromise;
}

// The roast prop's subtree root is named "ROASTED CHICKEN_55"; its inner
// nodes use "chicken_roasted_*", so only the subtree root starts with the
// word. Climbing from any match to the outermost roasted ancestor keeps this
// safe even if a re-export renames things.
function findRoast(scene) {
  let found = null;
  scene.traverse((obj) => {
    if (!found && /^roasted/i.test(obj.name)) found = obj;
  });
  if (!found) return null;
  let top = found;
  for (let node = found.parent; node && node !== scene; node = node.parent) {
    if (/roasted/i.test(node.name)) top = node;
  }
  return top;
}

// Returns { model, clips } or null while still loading (Enemy falls back to
// a UFO model in that case). Materials are NOT cloned here — Enemy._buildMesh
// already clones every mesh material per instance.
export function createChickenInstance() {
  if (!cachedGltf) return null;
  return { model: cloneSkeleton(cachedGltf.scene), clips: cachedGltf.animations };
}

// The roasted-chicken prop detached at preload — used as the boss's corpse.
// Returns null if unavailable (callers keep the plain squash death instead).
export function createRoastedChicken() {
  if (!cachedRoast) return null;
  return cloneSkeleton(cachedRoast);
}
