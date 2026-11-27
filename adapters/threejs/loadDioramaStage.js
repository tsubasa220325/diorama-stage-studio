/**
 * Three.js ESM helper for loading .glb stages and v0.7.0 2.5D animated cutouts
 * exported from Diorama Stage Studio.
 * Usage:
 *   import * as THREE from 'three';
 *   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
 *   const { scene, metadata, anchors, cutouts, updateCutouts } = await loadDioramaGlb(new GLTFLoader(), THREE, './stage.glb');
 */
export async function loadDioramaGlb(gltfLoader, THREE, url, options = {}) {
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

  const metadata = gltf.scene.userData?.dioramaStage ?? null;
  const cutouts = await loadDioramaCutouts(THREE, gltf.scene, metadata, options);

  return {
    scene: gltf.scene,
    metadata,
    anchors,
    cutouts,
    updateCutouts: beats => updateDioramaCutouts(cutouts, beats),
  };
}

export async function loadDioramaCutouts(THREE, parentGroup, metadata, options = {}) {
  const specs = (metadata?.geometry?.cutouts ?? []).filter(c => !c.hidden && c.imageUrl);
  if (!specs.length || !options.textureLoader) return [];
  const baseUrl = options.assetBaseUrl ?? '';
  const instances = [];

  for (const spec of specs) {
    const src = /^https?:\/\//i.test(spec.imageUrl) ? spec.imageUrl : `${baseUrl}${spec.imageUrl}`;
    const tex = await options.textureLoader.loadAsync(src);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const [w, h] = spec.size ?? [1.6, 2.4];
    const [pu, pv] = spec.pivotUv ?? [0.5, 1.0];
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((0.5 - pu) * w, (pv - 0.5) * h, 0);
    const mat = spec.emissive
      ? new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.2, transparent: false, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.2, roughness: 0.85, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    const [x, y, z] = spec.pos ?? [0, 0, -2.5];
    mesh.position.set(x, y, z);
    mesh.castShadow = spec.castShadow !== false;
    mesh.receiveShadow = false;
    mesh.name = spec.id ?? 'cutout';
    parentGroup.add(mesh);
    instances.push({ mesh, spec, baseY: y });
  }
  return instances;
}

export function updateDioramaCutouts(cutouts, beats = 0) {
  for (const item of cutouts ?? []) {
    const { mesh, spec, baseY } = item;
    const ph = spec.phase ?? 0;
    const amp = spec.swingAmp ?? 0.36;
    let rot = 0;
    let y = baseY;
    if (spec.beatAnim === 'pendulum') rot = Math.cos(beats * Math.PI + ph) * amp;
    else if (spec.beatAnim === 'sway') rot = Math.sin(beats * Math.PI + ph) * amp;
    else if (spec.beatAnim === 'bob') y = baseY + Math.sin(beats * Math.PI * 0.5 + ph) * 0.13;
    mesh.position.y = y;
    mesh.rotation.z = rot;
  }
}
