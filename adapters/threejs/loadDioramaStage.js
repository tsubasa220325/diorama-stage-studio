/**
 * Three.js ESM helper for loading .glb stages exported from Diorama Stage Studio.
 * Usage:
 *   import * as THREE from 'three';
 *   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
 *   const { scene, metadata, anchors } = await loadDioramaGlb(new GLTFLoader(), THREE, './stage.glb');
 */
export async function loadDioramaGlb(gltfLoader, THREE, url) {
  const gltf = await gltfLoader.loadAsync(url);
  const anchors = [];

  gltf.scene.traverse(obj => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        for (const key of ['map', 'normalMap', 'emissiveMap']) {
          if (m[key]) {
            m[key].minFilter = THREE.NearestFilter;
            m[key].magFilter = THREE.NearestFilter;
            m[key].generateMipmaps = false;
            m[key].needsUpdate = true;
          }
        }
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
    if (obj.userData?.dioramaAnchor) {
      anchors.push({
        id: obj.userData.id,
        role: obj.userData.role,
        position: obj.position.clone(),
        meta: obj.userData,
      });
    }
  });

  return {
    scene: gltf.scene,
    metadata: gltf.scene.userData?.dioramaStage ?? null,
    anchors,
  };
}
