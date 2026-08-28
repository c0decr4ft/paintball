import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { cautionTexture, crateTexture, gymCourtFloorTexture, gymCourtWallTexture } from "./textures.js";

export const TEAM = {
  blue: 0x008cff,
  red: 0xff1a12,
};

const MAP_URL = `${import.meta.env.BASE_URL}models/pvp_map.glb`;
const COMMANDO_URL = `${import.meta.env.BASE_URL}models/clone_commando.glb`;
const PHOENIX_URL = `${import.meta.env.BASE_URL}models/phoenix.glb`;
const BLASTER_URL = `${import.meta.env.BASE_URL}models/blaster.glb`;
const BOMB_URL = `${import.meta.env.BASE_URL}models/cs_go_bomb.glb`;
const GLOCK_URL = `${import.meta.env.BASE_URL}models/gun_10mm.glb`;
const PISTOL_URL = `${import.meta.env.BASE_URL}models/gun.glb`;
const MP5_URL = `${import.meta.env.BASE_URL}models/mp5_submachine_gun.glb`;

export const MAX_HP = 100;

/** Glock hits hard and slow. Roach sprays fast for chip damage. MP5 sits in between. */
export const WEAPONS = {
  glock: {
    id: "glock",
    name: "Glock",
    fire: 0.42,
    dmg: 54,
    ammo: 17,
    reload: 1.5,
    weight: 52,
    recoil: 0.07,
    fpsLen: 0.34,
    worldLen: 0.2,
    adsFov: 50,
  },
  roach: {
    id: "roach",
    name: "Roach",
    fire: 0.068,
    dmg: 14,
    ammo: 24,
    reload: 1.35,
    weight: 34,
    recoil: 0.022,
    fpsLen: 0.38,
    worldLen: 0.24,
    adsFov: 50,
  },
  mp5: {
    id: "mp5",
    name: "MP5",
    fire: 0.09,
    dmg: 22,
    ammo: 30,
    reload: 1.8,
    weight: 14,
    recoil: 0.03,
    fpsLen: 0.7,
    worldLen: 0.66,
    adsFov: 42,
  },
};

export const DEFAULT_WEAPON = "glock";

/** @type {THREE.Object3D | null} */
let mapTemplate = null;
/** @type {THREE.Object3D | null} */
let commandoTemplate = null;
/** @type {THREE.Object3D | null} */
let phoenixTemplate = null;
/** @type {THREE.Object3D | null} */
let blasterTemplate = null;
/** @type {THREE.Object3D | null} */
let bombTemplate = null;
/** @type {Record<string, THREE.Object3D | null>} */
const weaponTemplates = { glock: null, roach: null, mp5: null };

function fixTextureColorSpace(mat) {
  if (!mat) return;
  const maps = ["map", "emissiveMap", "sheenColorMap", "specularColorMap"];
  for (const key of maps) {
    if (mat[key]?.isTexture) {
      mat[key].colorSpace = THREE.SRGBColorSpace;
      mat[key].needsUpdate = true;
    }
  }
}

function loadGltf(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

let _wallDraw = null;
let _floorDraw = null;
let _crateDraw = null;
const _propDraw = new Map();

function styleVillageMap(root) {
  if (!root) return;
  if (!_wallDraw) {
    _wallDraw = new THREE.MeshLambertMaterial({
      map: gymCourtWallTexture(),
      color: 0xf6ead8,
      fog: true,
    });
  }
  if (!_floorDraw) {
    _floorDraw = new THREE.MeshLambertMaterial({
      map: gymCourtFloorTexture(),
      color: 0xeee4d4,
      fog: true,
      side: THREE.DoubleSide,
    });
  }
  if (!_crateDraw) {
    _crateDraw = new THREE.MeshLambertMaterial({
      map: crateTexture(),
      color: 0x9a7048,
      fog: true,
    });
  }
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = true;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((m) => {
      if (!m) return m;
      if (m === _wallDraw || m === _floorDraw || m === _crateDraw) return m;
      fixTextureColorSpace(m);
      const name = (m.name || "").toLowerCase();
      if (name.includes("wall_text")) return _wallDraw;
      if (name.includes("floor_text")) return _floorDraw;
      if (name === "material.016") return _crateDraw;
      const key = `${m.map?.uuid || "none"}:${m.color?.getHex?.() ?? 0}:${m.side}:${m.transparent}:${m.opacity ?? 1}`;
      let lam = _propDraw.get(key);
      if (!lam) {
        lam = litFast(m);
        _propDraw.set(key, lam);
      }
      return lam;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

export async function loadGameAssets(onProgress) {
  if (mapTemplate && commandoTemplate && blasterTemplate && weaponTemplates.glock) {
    styleVillageMap(mapTemplate);
    return mapTemplate;
  }
  const [mapGltf, commandoGltf, phoenixGltf, blasterGltf, bombGltf, glockGltf, pistolGltf, mp5Gltf] = await Promise.all([
    mapTemplate ? Promise.resolve(null) : loadGltf(MAP_URL),
    commandoTemplate ? Promise.resolve(null) : loadGltf(COMMANDO_URL),
    phoenixTemplate ? Promise.resolve(null) : loadGltf(PHOENIX_URL).catch(() => null),
    blasterTemplate ? Promise.resolve(null) : loadGltf(BLASTER_URL),
    bombTemplate ? Promise.resolve(null) : loadGltf(BOMB_URL),
    weaponTemplates.glock ? Promise.resolve(null) : loadGltf(GLOCK_URL).catch(() => null),
    weaponTemplates.roach ? Promise.resolve(null) : loadGltf(PISTOL_URL).catch(() => null),
    weaponTemplates.mp5 ? Promise.resolve(null) : loadGltf(MP5_URL).catch(() => null),
  ]);
  onProgress?.(1, "assets");

  if (mapGltf) {
    mapTemplate = mapGltf.scene;
    styleVillageMap(mapTemplate);
  }

  if (commandoGltf) {
    commandoGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        fixTextureColorSpace(m);
        if (m) m.envMapIntensity = 0;
      }
    });
    commandoTemplate = commandoGltf.scene;
  }

  if (phoenixGltf) {
    phoenixGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        fixTextureColorSpace(m);
        if (m) m.envMapIntensity = 0;
      }
    });
    phoenixTemplate = phoenixGltf.scene;
  }

  if (blasterGltf) {
    blasterGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        fixTextureColorSpace(m);
        if (m) m.envMapIntensity = 0;
      }
    });
    blasterTemplate = blasterGltf.scene;
  }

  if (bombGltf) {
    bombGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        fixTextureColorSpace(m);
        if (m) m.envMapIntensity = 0;
      }
    });
    bombTemplate = bombGltf.scene;
  }

  if (glockGltf) weaponTemplates.glock = prepareGunTemplate(glockGltf.scene);
  if (pistolGltf) weaponTemplates.roach = prepareGunTemplate(pistolGltf.scene);
  if (mp5Gltf) weaponTemplates.mp5 = prepareGunTemplate(mp5Gltf.scene);

  return mapTemplate;
}

function prepareGunTemplate(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((m) => {
      if (!m) return m;
      fixTextureColorSpace(m);
      return litFast(m);
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
  return root;
}

export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS[DEFAULT_WEAPON];
}

export function pickLootWeapon() {
  const list = Object.values(WEAPONS);
  let total = 0;
  for (const w of list) total += w.weight;
  let roll = Math.random() * total;
  for (const w of list) {
    roll -= w.weight;
    if (roll <= 0) return w.id;
  }
  return DEFAULT_WEAPON;
}

function makeGrid(meshes, cell = 5) {
  const buckets = new Map();
  for (const mesh of meshes) {
    const b = new THREE.Box3().setFromObject(mesh);
    const x0 = Math.floor(b.min.x / cell);
    const x1 = Math.floor(b.max.x / cell);
    const z0 = Math.floor(b.min.z / cell);
    const z1 = Math.floor(b.max.z / cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = `${x}:${z}`;
        let list = buckets.get(k);
        if (!list) {
          list = [];
          buckets.set(k, list);
        }
        list.push(mesh);
      }
    }
  }
  return {
    query(x, z, r) {
      const out = [];
      const seen = new Set();
      const x0 = Math.floor((x - r) / cell);
      const x1 = Math.floor((x + r) / cell);
      const z0 = Math.floor((z - r) / cell);
      const z1 = Math.floor((z + r) / cell);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const list = buckets.get(`${ix}:${iz}`);
          if (!list) continue;
          for (const m of list) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            out.push(m);
          }
        }
      }
      return out;
    },
  };
}

function meshMatName(mesh) {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat?.name || "").toLowerCase();
}

/** Red canisters (`test.001`) and wooden SYNTRAX crates (`Material.016`). Keep unbatched so they can hide. CRATE_EXPLODE_MARK */
function isExplosiveMesh(mesh) {
  if (!mesh?.isMesh) return false;
  const mat = meshMatName(mesh);
  return mat === "test.001" || mat === "material.016";
}

function isCrateMesh(mesh) {
  if (!mesh?.isMesh) return false;
  return meshMatName(mesh) === "material.016";
}

/** Crates and barrels: solid obstacles, not walkable lids. */
function isPropSolid(mesh) {
  return isCrateMesh(mesh) || isExplosiveMesh(mesh);
}

function stripGeo(geo) {
  const keep = new Set(["position", "normal", "uv"]);
  for (const name of Object.keys(geo.attributes)) {
    if (!keep.has(name)) geo.deleteAttribute(name);
  }
  if (geo.morphAttributes) {
    for (const key of Object.keys(geo.morphAttributes)) delete geo.morphAttributes[key];
  }
  geo.clearGroups?.();
  return geo;
}

function batchMapMeshes(map) {
  const CELL = 22;
  const groups = new Map();
  const originals = [];
  map.traverse((mesh) => {
    if (!mesh.isMesh) return;
    originals.push(mesh);
    mesh.updateWorldMatrix(true, false);
    mesh.matrixAutoUpdate = false;
  });
  for (const mesh of originals) {
    if (isExplosiveMesh(mesh) || isCrateMesh(mesh)) continue;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) continue;
    const box = mesh.userData.worldBox || new THREE.Box3().setFromObject(mesh);
    const cx = Math.floor(((box.min.x + box.max.x) * 0.5) / CELL);
    const cz = Math.floor(((box.min.z + box.max.z) * 0.5) / CELL);
    const key = `${mat.uuid}:${cx}:${cz}`;
    let group = groups.get(key);
    if (!group) {
      group = { mat, items: [] };
      groups.set(key, group);
    }
    group.items.push(mesh);
  }
  const batch = new THREE.Group();
  batch.name = "map_draw";
  for (const { mat, items } of groups.values()) {
    const geos = [];
    for (const mesh of items) {
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      stripGeo(geo);
      geos.push(geo);
    }
    try {
      const merged = mergeGeometries(geos, false);
      if (merged) {
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const draw = new THREE.Mesh(merged, litFast(mat));
        draw.castShadow = false;
        draw.receiveShadow = false;
        draw.matrixAutoUpdate = false;
        draw.frustumCulled = true;
        draw.raycast = () => {};
        batch.add(draw);
        for (const mesh of items) mesh.visible = false;
      }
    } catch {
      /* leave original meshes visible */
    }
    for (const g of geos) g.dispose();
  }
  return batch.children.length ? batch : null;
}

const _litFast = new Map();
function litFast(src) {
  if (!src || src.isMeshBasicMaterial || src.isMeshLambertMaterial) return src;
  let m = _litFast.get(src.uuid);
  if (m) return m;
  m = new THREE.MeshLambertMaterial();
  if (src.color) m.color.copy(src.color);
  m.map = src.map || null;
  if (src.emissive && m.emissive) m.emissive.copy(src.emissive);
  m.emissiveMap = src.emissiveMap || null;
  m.emissiveIntensity = src.emissiveIntensity ?? 0;
  m.side = src.side;
  m.transparent = src.transparent;
  m.opacity = src.opacity;
  m.fog = src.fog !== false;
  m.vertexColors = src.vertexColors;
  m.alphaTest = src.alphaTest || 0;
  m.depthWrite = src.depthWrite;
  m.toneMapped = src.toneMapped;
  _litFast.set(src.uuid, m);
  return m;
}

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({
    color,
    ...extra,
  });
}

function makeSky() {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#4a7aaa");
  g.addColorStop(0.28, "#8aa8b8");
  g.addColorStop(0.55, "#c4b48a");
  g.addColorStop(0.78, "#d8c49a");
  g.addColorStop(1, "#e8d8b0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

/** Fit the village to a 1.82 m human (doors/ceilings feel walkable, not stadium-sized). */
const MAP_SCALE = 0.62;

export function buildArena(scene) {
  if (!mapTemplate) throw new Error("Call loadGameAssets() before buildArena()");

  scene.background = new THREE.Color(0xb8c4a0);
  scene.fog = new THREE.Fog(0xc5b898, 38, 96);

  const world = new THREE.Group();
  world.name = "world";
  scene.add(world);
  world.add(makeSky());

  scene.add(new THREE.HemisphereLight(0xe8dcc0, 0x8a7a58, 1.22));
  const sun = new THREE.DirectionalLight(0xffe6c4, 1.55);
  sun.position.set(14, 32, 12);
  sun.castShadow = false;
  scene.add(sun);

  const map = mapTemplate.clone(true);
  styleVillageMap(map);
  map.scale.setScalar(MAP_SCALE);
  map.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(map);
  const center = box.getCenter(new THREE.Vector3());
  map.position.x -= center.x;
  map.position.z -= center.z;
  map.updateMatrixWorld(true);
  world.add(map);

  const walkMeshes = [];
  const wallMeshes = [];
  const floorMeshes = [];
  map.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.updateWorldMatrix(true, false);
    obj.userData.worldBox = new THREE.Box3().setFromObject(obj);
    if (isPropSolid(obj)) obj.userData.propSolid = true;
    walkMeshes.push(obj);
    const name = (obj.name || "").toLowerCase();
    if (/floor/.test(name)) floorMeshes.push(obj);
    else wallMeshes.push(obj);
  });

  const batched = batchMapMeshes(map);
  if (batched) world.add(batched);

  const wallGrid = makeGrid(wallMeshes, 5);
  const floorGrid = makeGrid(floorMeshes.length ? floorMeshes : walkMeshes, 5);

  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const ray = new THREE.Raycaster();
  const _n = new THREE.Vector3();
  const _from = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  function nearbyWalls(x, z, r = 1.4) {
    return wallGrid.query(x, z, r);
  }

  function nearbyFloors(x, z, r = 2.5) {
    return floorGrid.query(x, z, r);
  }

  const STEP = 0.52;

  function walkObjs(x, z) {
    const floors = nearbyFloors(x, z, 3);
    const walls = nearbyWalls(x, z, 2.4);
    return (floors.length ? floors.concat(walls) : walls).filter((m) => !m.userData.exploded);
  }

  function groundHit(x, z, yFrom, maxY, maxDrop = 6.5) {
    const objs = walkObjs(x, z);
    if (!objs.length) return null;
    _from.set(x, yFrom, z);
    ray.set(_from, down);
    ray.near = 0.01;
    ray.far = Math.max(0.9, maxDrop);
    const hits = ray.intersectObjects(objs, false);
    let best = null;
    for (const h of hits) {
      if (h.object.userData.exploded || h.object.userData.propSolid) continue;
      if (h.face) {
        _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      } else {
        _n.set(0, 1, 0);
      }
      if (_n.y < 0.35) continue;
      if (h.point.y > maxY + 0.04) continue;
      if (!best || h.distance < best.distance) best = h;
    }
    return best;
  }

  function ceilingHit(x, z, yFrom, maxDist = 2.8, skipProp = false) {
    const objs = walkObjs(x, z);
    if (!objs.length) return null;
    _from.set(x, yFrom, z);
    ray.set(_from, up);
    ray.near = 0.02;
    ray.far = Math.max(0.2, maxDist);
    const hits = ray.intersectObjects(objs, false);
    for (const h of hits) {
      if (h.object.userData.exploded) continue;
      if (skipProp && h.object.userData.propSolid) continue;
      return h;
    }
    return null;
  }

  const groundCache = new Map();
  const ceilCache = new Map();
  function sampleGround(x, z, yHint, maxDrop = 6.5) {
    const y = Number.isFinite(yHint) ? yHint : 0;
    let from = y + STEP;
    if (y > -0.4) {
      const overhead = ceilingHit(x, z, y + 0.16, STEP + 2.4, true);
      if (overhead) from = Math.max(y + 0.08, Math.min(from, overhead.point.y - 0.06));
    }
    const hit = groundHit(x, z, from, from, maxDrop);
    return hit ? hit.point.y : null;
  }
  function groundAt(x, z, yHint = 0, live = false) {
    if (live) return sampleGround(x, z, yHint, 2.8);
    const y = Number.isFinite(yHint) ? yHint : 0;
    const k = `${(x * 10) | 0}:${(z * 10) | 0}:${(y * 8) | 0}`;
    if (groundCache.has(k)) return groundCache.get(k);
    const gy = sampleGround(x, z, yHint);
    if (groundCache.size > 9000) groundCache.clear();
    groundCache.set(k, gy);
    return gy;
  }

  function ceilingAt(x, z, yFrom = 0.2, maxDist = 2.8) {
    const y = Number.isFinite(yFrom) ? yFrom : 0.2;
    const k = `${(x * 4) | 0}:${(z * 4) | 0}:${(y * 4) | 0}:${(maxDist * 2) | 0}`;
    if (ceilCache.has(k)) return ceilCache.get(k);
    const hit = ceilingHit(x, z, y, maxDist);
    const cy = hit ? hit.point.y : null;
    if (ceilCache.size > 9000) ceilCache.clear();
    ceilCache.set(k, cy);
    return cy;
  }

  /**
   * True building roof only — not crates, pallets, curbs, or pavement.
   * Feet must be standing on the top face of that roof. Shared by roof-kill and bot spawn.
   */
  const roofCache = new Map();
  let roofDeckY = 3.5;
  function isRooftop(x, z, feetY) {
    const y = Number.isFinite(feetY) ? feetY : 0;
    const k = `${(x * 4) | 0}:${(z * 4) | 0}:${(y * 4) | 0}`;
    if (roofCache.has(k)) return roofCache.get(k);
    if (y < roofDeckY - 0.55) {
      roofCache.set(k, false);
      return false;
    }
    const hit = groundHit(x, z, y + STEP, y + STEP);
    if (!hit || Math.abs(hit.point.y - y) > 0.16) {
      roofCache.set(k, false);
      return false;
    }
    const gy = hit.point.y;
    if (gy < roofDeckY - 0.32) {
      roofCache.set(k, false);
      return false;
    }
    const mesh = hit.object;
    const name = (mesh.name || "").toLowerCase();
    if (isExplosiveMesh(mesh) || isCrateMesh(mesh) || /floor|pallet/.test(name)) {
      roofCache.set(k, false);
      return false;
    }
    const ceil = ceilingAt(x, z, gy + 0.22, 2.4);
    if (ceil != null && ceil - gy < 2.35) {
      roofCache.set(k, false);
      return false;
    }
    roofCache.set(k, true);
    return true;
  }
  const isRoofAt = isRooftop;

  function dropOffRoof(x, z, yHint = 0) {
    let hint = Number.isFinite(yHint) ? yHint : 0;
    for (let i = 0; i < 6; i++) {
      const gy = groundAt(x, z, hint);
      if (gy == null) return null;
      if (!isRooftop(x, z, gy)) return gy;
      const under = groundHit(x, z, gy - 0.1, gy - 0.1);
      if (!under || gy - under.point.y < 0.45) return null;
      hint = under.point.y;
    }
    const gy = groundAt(x, z, hint);
    return gy != null && !isRooftop(x, z, gy) ? gy : null;
  }

  function blockedXZ(x, z, radius = 0.55, yHint = 0) {
    const gy = groundAt(x, z, yHint);
    if (gy == null) return true;
    const walls = nearbyWalls(x, z, radius + 1.2);
    if (!walls.length) return false;
    const ceil = ceilingAt(x, z, gy + 0.18, 1.9 * BODY_K);
    if (ceil != null && ceil - gy < 0.86) return true;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.71, 0.71],
      [-0.71, 0.71],
      [0.71, -0.71],
      [-0.71, -0.71],
    ];
    const probes = [gy + 0.42 * BODY_K, gy + 1.12 * BODY_K];
    for (const py of probes) {
      for (const [dx, dz] of dirs) {
        _dir.set(dx, 0, dz);
        _from.set(x, py, z);
        ray.set(_from, _dir);
        ray.near = 0;
        ray.far = radius + 0.08;
        const hit = ray.intersectObjects(walls, false)[0];
        if (!hit || hit.object.userData.exploded) continue;
        const wb = hit.object.userData.worldBox;
        if (wb && wb.min.y > py + 0.14) continue;
        return true;
      }
    }
    return false;
  }

  const worldBox = new THREE.Box3().setFromObject(map);
  const halfX = (worldBox.max.x - worldBox.min.x) / 2;
  const halfZ = (worldBox.max.z - worldBox.min.z) / 2;
  const roof = worldBox.max.y;
  {
    const bins = new Map();
    for (const mesh of wallMeshes) {
      const wb = mesh.userData.worldBox;
      if (!wb || isExplosiveMesh(mesh)) continue;
      const name = (mesh.name || "").toLowerCase();
      if (/pallet/.test(name)) continue;
      const sx = wb.max.x - wb.min.x;
      const sz = wb.max.z - wb.min.z;
      if (sx * sz < 1.1 && wb.max.y - wb.min.y < 0.35) continue;
      const b = Math.round(wb.max.y * 4) / 4;
      bins.set(b, (bins.get(b) || 0) + 1);
    }
    let best = -Infinity;
    for (const minCount of [6, 3, 1]) {
      best = -Infinity;
      for (const [b, c] of bins) {
        if (c >= minCount && b > best) best = b;
      }
      if (best > 1.5) break;
    }
    if (best > 1.5) roofDeckY = best;
  }

  const rawWaypoints = [];
  for (let x = worldBox.min.x + 1.4; x <= worldBox.max.x - 1.4; x += 1.7) {
    for (let z = worldBox.min.z + 1.4; z <= worldBox.max.z - 1.4; z += 1.7) {
      if (blockedXZ(x, z, 0.7, 0.12)) continue;
      const y = groundAt(x, z, 0.12);
      if (y == null) continue;
      rawWaypoints.push(new THREE.Vector3(x, y, z));
    }
  }
  const groundWaypoints = rawWaypoints.filter((w) => !isRoofAt(w.x, w.z, w.y));
  const waypoints = groundWaypoints.length ? groundWaypoints : rawWaypoints;

  function spawnOpenness(w) {
    if (blockedXZ(w.x, w.z, 1.05, w.y)) return -1e6;
    let open = 0;
    const ring = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.71, 0.71],
      [-0.71, 0.71],
      [0.71, -0.71],
      [-0.71, -0.71],
    ];
    for (const [dx, dz] of ring) {
      if (!blockedXZ(w.x + dx * 1.15, w.z + dz * 1.15, 0.55, w.y)) open += 1;
    }
    return open;
  }

  function pickSpawn(scoreFn) {
    let best = waypoints[0] || new THREE.Vector3(0, 0, 0);
    let bestS = -Infinity;
    for (const w of waypoints) {
      if (isRoofAt(w.x, w.z, w.y)) continue;
      const open = spawnOpenness(w);
      if (open < -1e5) continue;
      const s = scoreFn(w) + open * 3.2;
      if (s > bestS) {
        bestS = s;
        best = w;
      }
    }
    return best.clone();
  }

  function padOpen(p) {
    return !isRoofAt(p.x, p.z, p.y) && !blockedXZ(p.x, p.z, 1.0, p.y);
  }

  function ensureGroundPad(pos) {
    const p = pos.clone();
    if (isRoofAt(p.x, p.z, p.y)) {
      const dropped = dropOffRoof(p.x, p.z, p.y);
      if (dropped != null) p.y = dropped;
    }
    if (padOpen(p)) return p;
    let best = p;
    let bestD = Infinity;
    for (const w of waypoints) {
      if (!padOpen(w)) continue;
      const d = p.distanceToSquared(w);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best.clone();
  }

  let spawnBlue = ensureGroundPad(pickSpawn((w) => -w.x + w.z));
  let spawnRed = ensureGroundPad(pickSpawn((w) => w.x - w.z));
  if (spawnBlue.distanceToSquared(spawnRed) < 8 * 8) {
    spawnRed = ensureGroundPad(pickSpawn((w) => w.distanceToSquared(spawnBlue)));
  }

  const caution = cautionTexture();
  function spawnPad(pos, color) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 16),
      new THREE.MeshLambertMaterial({
        color,
        transparent: true,
        opacity: 0.38,
        map: caution,
        depthWrite: false,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(pos.x, pos.y + 0.04, pos.z);
    world.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.045, 8, 24),
      mat(color)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.05, pos.z);
    world.add(ring);
  }
  spawnPad(spawnBlue, TEAM.blue);
  spawnPad(spawnRed, TEAM.red);

  function pickSite(scoreFn, avoid = [], minDist = 9) {
    let best = waypoints[0] || new THREE.Vector3();
    let bestS = -Infinity;
    let found = false;
    for (const w of waypoints) {
      if (isRoofAt(w.x, w.z, w.y)) continue;
      if (avoid.some((p) => w.distanceTo(p) < minDist)) continue;
      const s = scoreFn(w);
      if (s > bestS) {
        bestS = s;
        best = w;
        found = true;
      }
    }
    if (!found) {
      for (const w of waypoints) {
        if (isRoofAt(w.x, w.z, w.y)) continue;
        const s = scoreFn(w);
        if (s > bestS) {
          bestS = s;
          best = w;
        }
      }
    }
    return ensureGroundPad(best.clone());
  }

  function siteLetterTex(letter) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(10, 8, 4, 0.62)";
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f4e4b0";
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.fillStyle = "#f4e4b0";
    ctx.font = "700 148px Rajdhani, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 128, 148);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeBombSite(pos, letter, color) {
    const group = new THREE.Group();
    group.name = `bomb_site_${letter}`;
    group.visible = false;
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.72, 16),
      new THREE.MeshLambertMaterial({
        color,
        transparent: true,
        opacity: 0.48,
        map: caution,
        depthWrite: false,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(pos.x, pos.y + 0.045, pos.z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.055, 8, 28),
      mat(color, { emissive: color, emissiveIntensity: 0.55 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.055, pos.z);
    const labelMat = new THREE.MeshBasicMaterial({
      map: siteLetterTex(letter),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const labelA = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.42), labelMat);
    labelA.position.set(pos.x, pos.y + 1.38, pos.z);
    const labelB = labelA.clone();
    labelB.rotation.y = Math.PI / 2;
    group.add(pad, ring, labelA, labelB);
    world.add(group);
    return { id: letter, pos: pos.clone(), group, pad, ring, labels: [labelA, labelB] };
  }

  function openScore(w) {
    let n = 0;
    for (const o of waypoints) {
      const dx = o.x - w.x;
      const dz = o.z - w.z;
      if (dx * dx + dz * dz < 22) n++;
    }
    return n;
  }

  const siteA = pickSite((w) => w.x + w.z, [spawnBlue, spawnRed]);

  function pickSiteB(fromA) {
    const cx = (worldBox.min.x + worldBox.max.x) * 0.5;
    const cz = (worldBox.min.z + worldBox.max.z) * 0.5;
    const span = Math.hypot(worldBox.max.x - worldBox.min.x, worldBox.max.z - worldBox.min.z);
    const minDist = Math.max(18, span * 0.4);
    const avoid = [spawnBlue, spawnRed, fromA];
    const wantX = fromA.x >= cx ? -1 : 1;
    const wantZ = fromA.z >= cz ? -1 : 1;

    const consider = (requireDist) => {
      let best = null;
      let bestS = -Infinity;
      for (const w of waypoints) {
        if (isRoofAt(w.x, w.z, w.y)) continue;
        if (avoid.some((p) => w.distanceTo(p) < 9)) continue;
        const distA = w.distanceTo(fromA);
        if (requireDist && distA < minDist) continue;
        const side = (w.x - cx) * wantX + (w.z - cz) * wantZ;
        const s = distA * 1.7 + side * 7.5 + openScore(w) * 0.6 - w.y * 2.8;
        if (s > bestS) {
          bestS = s;
          best = w;
        }
      }
      return best;
    };

    const picked = consider(true) || consider(false) || pickSite((w) => -w.x - w.z, avoid, minDist);
    return ensureGroundPad(picked.clone());
  }

  const siteB = pickSiteB(siteA);
  const bombSites = [makeBombSite(siteA, "A", 0xe8b23a), makeBombSite(siteB, "B", 0xe8b23a)];

  const colliders = wallMeshes.map((mesh) => ({
    mesh,
    box: mesh.userData.worldBox || new THREE.Box3().setFromObject(mesh),
  }));

  const barrels = [];
  for (const mesh of wallMeshes) {
    if (!isExplosiveMesh(mesh)) continue;
    const box = mesh.userData.worldBox;
    if (!box) continue;
    const size = box.getSize(new THREE.Vector3());
    if (size.y < 0.28 || Math.max(size.x, size.z) < 0.28) continue;
    mesh.userData.barrel = true;
    mesh.visible = true;
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    barrels.push({
      mesh,
      center: box.getCenter(new THREE.Vector3()),
      radius: Math.max(size.x, size.y, size.z) * 0.52,
      alive: true,
    });
  }

  return {
    map,
    world,
    batched,
    colliders,
    walkMeshes,
    wallMeshes,
    floorMeshes,
    barrels,
    spawnBlue,
    spawnRed,
    bombSites,
    halfX,
    halfZ,
    waypoints,
    blockedXZ,
    groundAt,
    ceilingAt,
    isRooftop,
    isRoofAt,
    dropOffRoof,
    nearbyWalls,
    nearbyWalk(x, z, r) {
      return nearbyWalls(x, z, r).concat(nearbyFloors(x, z, r));
    },
    meshNav: true,
    worldBox,
  };
}


function cloneMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.material = Array.isArray(obj.material) ? obj.material.map((m) => m.clone()) : obj.material.clone();
  });
}

function isTeamLight(mat) {
  if (!mat?.emissive) return false;
  const e = mat.emissive;
  return e.b > 0.18 && e.b > e.r * 1.05 && e.b >= e.g * 0.45;
}

function isArmorPlate(mat) {
  if (!mat?.color) return false;
  const c = mat.color;
  const lum = c.r * 0.3 + c.g * 0.5 + c.b * 0.2;
  const sat = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  return lum > 0.28 && sat < 0.22;
}

function applyTeamLights(root, teamColor, softTint = false) {
  const color = new THREE.Color(teamColor);
  const glow = color.clone().multiplyScalar(1.15);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (softTint) {
        if (!m?.color) continue;
        m.color.lerp(color, 0.34);
        m.emissive.copy(color);
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.28);
        m.needsUpdate = true;
        continue;
      }
      if (isTeamLight(m)) {
        m.emissive.copy(glow);
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 1, 22);
        m.color.copy(color);
        if (m.opacity < 1) m.opacity = Math.min(1, m.opacity + 0.15);
        m.needsUpdate = true;
        continue;
      }
      if (!isArmorPlate(m)) continue;
      m.color.lerp(color, 0.62);
      m.emissive.copy(color);
      m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.55);
      m.needsUpdate = true;
    }
  });
}

const _cheapCache = new Map();
function cheapMat(mat) {
  if (!mat) return mat;
  const hit = _cheapCache.get(mat.uuid);
  if (hit) return hit;
  const s = new THREE.MeshLambertMaterial({
    color: mat.color ? mat.color.clone() : 0x888888,
    map: mat.map || null,
    emissive: mat.emissive ? mat.emissive.clone() : 0x000000,
    emissiveMap: mat.emissiveMap || null,
    emissiveIntensity: mat.emissiveIntensity ?? 1,
    transparent: Boolean(mat.transparent || (mat.opacity != null && mat.opacity < 1)),
    opacity: mat.opacity ?? 1,
    side: mat.side ?? THREE.FrontSide,
    depthWrite: mat.depthWrite !== false,
    fog: true,
  });
  _cheapCache.set(mat.uuid, s);
  return s;
}

/** Standing height after bake. Was 1.82 m; shrink so fighters fit doors/cover. */
export const COMMANDO_H = 1.6;
const BODY_K = COMMANDO_H / 1.82;
const HIP_Y = 0.78 * BODY_K;
const CLIP_Y = 1.12 * BODY_K;

const COMMANDO_GAIT = {
  id: "commando",
  hipY: HIP_Y,
  clipY: CLIP_Y,
  kneeY: 0.44 * BODY_K,
};

const PHOENIX_GAIT = {
  id: "phoenix",
  hipY: 0.88,
  clipY: CLIP_Y,
  kneeY: 0.48,
  shX: 0.16,
  shY: 1.255,
  shZ: -0.04,
};

function phoenixLimb(matName, meshName) {
  const n = `${matName || ""} ${meshName || ""}`.toLowerCase();
  if (n.includes("glove") || n.includes("bare_arm")) return "arm";
  if (n.includes("leg")) return "legs";
  if (n.includes("balaclava") || n.includes("head")) return "head";
  return "body";
}

function attachBodyShaders(root, profile, clipY = 8, holdArms = false) {
  const uWalk = { value: 0 };
  const uPhase = { value: 0 };
  const uRun = { value: 0 };
  const uHipY = { value: profile.hipY };
  const uClipY = { value: clipY };
  const uCrouch = { value: 0 };
  const uLookDown = { value: 0 };
  const uHold = { value: holdArms ? 1 : 0 };
  const bk = BODY_K.toFixed(6);
  const ky = profile.kneeY.toFixed(5);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const matName = Array.isArray(obj.material)
      ? obj.material.map((m) => m?.name).join(" ")
      : obj.material?.name;
    const limb = obj.userData.limb || phoenixLimb(matName, obj.name);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader) => {
        prev?.(shader);
        shader.uniforms.uWalk = uWalk;
        shader.uniforms.uPhase = uPhase;
        shader.uniforms.uRun = uRun;
        shader.uniforms.uHipY = uHipY;
        shader.uniforms.uClipY = uClipY;
        shader.uniforms.uCrouch = uCrouch;
        shader.uniforms.uLookDown = uLookDown;
        shader.vertexShader =
          "uniform float uWalk;\nuniform float uPhase;\nuniform float uRun;\nuniform float uHipY;\nuniform float uClipY;\nuniform float uCrouch;\nuniform float uLookDown;\nvarying float vBodyY;\n" +
          shader.vertexShader.replace(
            "#include <begin_vertex>",
            `
            vec3 transformed = vec3( position );
            const float bk = ${bk};
            float loc = clamp(uWalk, 0.0, 1.0);
            float run = clamp(uRun, 0.0, 1.0) * loc;
            float squat = smoothstep(0.04 * bk, uHipY, position.y);
            transformed.y -= uCrouch * 0.52 * bk * squat;
            transformed.z += uCrouch * squat * 0.1 * bk;

            float step = sin(uPhase);
            float bob = abs(step);
            transformed.y += loc * mix(0.014, 0.032, run) * bk * bob;
            transformed.x += step * mix(0.008, 0.02, run) * bk * loc * smoothstep(0.32 * bk, 1.12 * bk, position.y);
            transformed.z += mix(0.0, 0.008, run) * bk * loc * smoothstep(uHipY, 1.38 * bk, position.y);

            if (position.y > uHipY + 0.04 * bk && abs(position.x) < 0.22 * bk) {
              float twist = -step * mix(0.07, 0.16, run) * loc;
              float ct = cos(twist);
              float st = sin(twist);
              transformed = vec3(transformed.x * ct + transformed.z * st, transformed.y, -transformed.x * st + transformed.z * ct);
            }

            float legMask = smoothstep(0.02 * bk, 0.07 * bk, abs(position.x));
            if (position.y < uHipY + 0.04 * bk && legMask > 0.001) {
              float side = position.x >= 0.0 ? -1.0 : 1.0;
              float gait = step * side;
              float fwd = max(0.0, -gait);
              float back = max(0.0, gait);
              float swing = mix(0.72, 1.12, run) * loc;
              float ang = gait * swing + uCrouch * 0.72;
              float hipY = uHipY - uCrouch * 0.52 * bk * squat;
              vec3 p = transformed;
              p.y -= hipY;
              float c = cos(ang);
              float s = sin(ang);
              p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);

              float kneeH = ${ky} - uCrouch * 0.22 * bk;
              if (position.y < kneeH) {
                float flex = fwd * mix(0.85, 1.28, run) * loc;
                flex += back * mix(0.16, 0.38, run) * loc;
                flex += uCrouch * 0.35;
                float ky = kneeH - hipY;
                vec3 k = p;
                k.y -= ky;
                float ck = cos(flex);
                float sk = sin(flex);
                k = vec3(k.x, k.y * ck - k.z * sk, k.y * sk + k.z * ck);
                k.y += ky;
                p = k;
              }

              float foot = 1.0 - smoothstep(0.02 * bk, 0.18 * bk, position.y);
              p.y += fwd * mix(0.08, 0.18, run) * bk * loc * foot;
              p.y -= back * mix(0.0, 0.012, run) * bk * loc * foot;
              p.z += gait * mix(0.05, 0.1, run) * bk * loc;
              transformed = mix(transformed, vec3(p.x, p.y + hipY, p.z), legMask);
            }
            vBodyY = position.y;
            `
          );
        shader.fragmentShader =
          "uniform float uClipY;\nvarying float vBodyY;\n" +
          shader.fragmentShader.replace(
            "void main() {",
            "void main() {\n  if (vBodyY > uClipY) discard;"
          );
      };
      m.customProgramCacheKey = () => `${profile.id}-${profile.hipY.toFixed(3)}-${clipY.toFixed(2)}-gait`;
      m.needsUpdate = true;
    }
  });
  return { uWalk, uPhase, uRun, uHipY, uClipY, uCrouch, uLookDown };
}

function mergeBakedMeshes(root) {
  const groups = new Map();
  const meshes = root.children.filter((c) => c.isMesh);
  if (meshes.length < 3) return;
  for (const mesh of meshes) {
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const limb = mesh.userData.limb || "body";
    const key = `${limb}:${mat?.uuid || "m"}`;
    let g = groups.get(key);
    if (!g) {
      g = { mat, limb, items: [] };
      groups.set(key, g);
    }
    g.items.push(mesh);
  }
  for (const { mat, limb, items } of groups.values()) {
    if (items.length < 2) continue;
    const geos = [];
    for (const mesh of items) {
      const geo = mesh.geometry.clone();
      stripGeo(geo);
      geos.push(geo);
    }
    try {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const draw = new THREE.Mesh(merged, mat);
      draw.userData.limb = limb;
      draw.castShadow = false;
      draw.receiveShadow = false;
      for (const mesh of items) {
        root.remove(mesh);
        mesh.geometry.dispose();
      }
      root.add(draw);
    } catch {
      for (const g of geos) g.dispose();
    }
  }
}

/** @type {THREE.Group | null} */
let commandoBaked = null;

function bakeCommando() {
  if (commandoBaked) return commandoBaked;
  const raw = commandoTemplate.clone(true);
  raw.updateMatrixWorld(true);
  const baked = new THREE.Group();
  raw.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (/pcube/i.test(mesh.name || "")) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3());
    if (size.length() < 0.002) return;
    if ((geo.attributes.position?.count || 0) < 12) return;
    const mat = Array.isArray(mesh.material)
      ? mesh.material.map((m) => cheapMat(m))
      : cheapMat(mesh.material);
    const nm = new THREE.Mesh(geo, mat);
    nm.name = mesh.name;
    nm.castShadow = false;
    nm.receiveShadow = false;
    baked.add(nm);
  });
  baked.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(baked);
  const s = COMMANDO_H / Math.max(0.001, box.max.y - box.min.y);
  const center = box.getCenter(new THREE.Vector3());
  const xform = new THREE.Matrix4()
    .makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  for (const mesh of baked.children) {
    mesh.geometry.applyMatrix4(xform);
  }
  const footY = 0.14 * BODY_K;
  let footX = 0;
  let footZ = 0;
  let footN = 0;
  for (const mesh of baked.children) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > footY) continue;
      footX += pos.getX(i);
      footZ += pos.getZ(i);
      footN++;
    }
  }
  if (footN > 0) {
    const recenter = new THREE.Matrix4().makeTranslation(-footX / footN, 0, -footZ / footN);
    for (const mesh of baked.children) {
      mesh.geometry.applyMatrix4(recenter);
    }
  }
  const hipY = HIP_Y;
  const straighten = new THREE.Matrix4()
    .makeTranslation(0, hipY, 0)
    .multiply(new THREE.Matrix4().makeRotationX(0.14))
    .multiply(new THREE.Matrix4().makeTranslation(0, -hipY, 0));
  footX = 0;
  footZ = 0;
  footN = 0;
  for (const mesh of baked.children) {
    mesh.geometry.applyMatrix4(straighten);
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > footY) continue;
      footX += pos.getX(i);
      footZ += pos.getZ(i);
      footN++;
    }
  }
  if (footN > 0) {
    const recenter = new THREE.Matrix4().makeTranslation(-footX / footN, 0, -footZ / footN);
    for (const mesh of baked.children) {
      mesh.geometry.applyMatrix4(recenter);
    }
  }
  baked.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(baked);
  const fitH = Math.max(0.001, fitBox.max.y - fitBox.min.y);
  const fit = COMMANDO_H / fitH;
  const settle = new THREE.Matrix4()
    .makeScale(fit, fit, fit)
    .multiply(new THREE.Matrix4().makeTranslation(0, -fitBox.min.y, 0));
  for (const mesh of baked.children) {
    mesh.geometry.applyMatrix4(settle);
  }
  for (const mesh of baked.children) {
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  mergeBakedMeshes(baked);
  commandoBaked = baked;
  return baked;
}

/** @type {THREE.Group | null} */
let phoenixBaked = null;

function bakeSkinnedGeometry(mesh) {
  const geo = mesh.geometry.clone();
  const pos = geo.attributes.position;
  const skinIndex = geo.attributes.skinIndex;
  const skinWeight = geo.attributes.skinWeight;
  if (!skinIndex || !skinWeight || !mesh.skeleton) {
    geo.applyMatrix4(mesh.matrixWorld);
    return geo;
  }
  mesh.skeleton.update();
  const boneMat = mesh.skeleton.boneMatrices;
  const bind = mesh.bindMatrix;
  const bindInv = mesh.bindMatrixInverse;
  const skinVertex = new THREE.Vector4();
  const skinned = new THREE.Vector4();
  const tmp = new THREE.Vector4();
  const bm = new THREE.Matrix4();
  for (let i = 0; i < pos.count; i++) {
    skinVertex.set(pos.getX(i), pos.getY(i), pos.getZ(i), 1).applyMatrix4(bind);
    skinned.set(0, 0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = skinWeight.getComponent(i, j);
      if (w === 0) continue;
      bm.fromArray(boneMat, skinIndex.getComponent(i, j) * 16);
      tmp.copy(skinVertex).applyMatrix4(bm).multiplyScalar(w);
      skinned.add(tmp);
    }
    skinned.applyMatrix4(bindInv);
    pos.setXYZ(i, skinned.x, skinned.y, skinned.z);
  }
  geo.deleteAttribute("skinIndex");
  geo.deleteAttribute("skinWeight");
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeVertexNormals();
  return geo;
}

function measurePhoenixGait(baked) {
  const box = new THREE.Box3().setFromObject(baked);
  const h = Math.max(0.001, box.max.y - box.min.y);
  let hipSum = 0;
  let hipN = 0;
  let shX = 0;
  let shY = 0;
  let shZ = 0;
  let shN = 0;
  for (const mesh of baked.children) {
    const pos = mesh.geometry.attributes.position;
    const limb = mesh.userData.limb;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ax = Math.abs(x);
      if (limb === "legs" && ax < 0.12 && y > h * 0.48 && y < h * 0.62) {
        hipSum += y;
        hipN++;
      }
      if (limb === "body" && ax > 0.14 && ax < 0.22 && y > 1.18 && y < 1.32) {
        shX += ax;
        shY += y;
        shZ += z;
        shN++;
      }
    }
  }
  PHOENIX_GAIT.hipY = hipN ? hipSum / hipN : h * 0.55;
  PHOENIX_GAIT.kneeY = PHOENIX_GAIT.hipY * 0.54;
  if (shN) {
    PHOENIX_GAIT.shX = shX / shN;
    PHOENIX_GAIT.shY = shY / shN;
    PHOENIX_GAIT.shZ = shZ / shN;
  }
}

function bakePhoenix() {
  if (phoenixBaked) return phoenixBaked;
  if (!phoenixTemplate) throw new Error("Call loadGameAssets() before createFighter()");
  phoenixTemplate.updateMatrixWorld(true);
  phoenixTemplate.traverse((mesh) => {
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
  });
  const baked = new THREE.Group();
  phoenixTemplate.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (/pcube|helper|collision|hitbox/i.test(mesh.name || "")) return;
    const geo = mesh.isSkinnedMesh ? bakeSkinnedGeometry(mesh) : mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3());
    if (size.length() < 0.002) return;
    if ((geo.attributes.position?.count || 0) < 12) return;
    const matName = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m?.name).join(" ")
      : mesh.material?.name;
    const mat = Array.isArray(mesh.material)
      ? mesh.material.map((m) => cheapMat(m))
      : cheapMat(mesh.material);
    const nm = new THREE.Mesh(geo, mat);
    nm.name = mesh.name;
    nm.userData.limb = phoenixLimb(matName, mesh.name);
    nm.castShadow = false;
    nm.receiveShadow = false;
    baked.add(nm);
  });
  baked.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(baked);
  const s = COMMANDO_H / Math.max(0.001, box.max.y - box.min.y);
  const center = box.getCenter(new THREE.Vector3());
  const xform = new THREE.Matrix4()
    .makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  for (const mesh of baked.children) mesh.geometry.applyMatrix4(xform);
  const footY = 0.14 * BODY_K;
  let footX = 0;
  let footZ = 0;
  let footN = 0;
  for (const mesh of baked.children) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > footY) continue;
      footX += pos.getX(i);
      footZ += pos.getZ(i);
      footN++;
    }
  }
  if (footN > 0) {
    const recenter = new THREE.Matrix4().makeTranslation(-footX / footN, 0, -footZ / footN);
    for (const mesh of baked.children) mesh.geometry.applyMatrix4(recenter);
  }
  baked.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(baked);
  const fitH = Math.max(0.001, fitBox.max.y - fitBox.min.y);
  const fit = COMMANDO_H / fitH;
  const settle = new THREE.Matrix4()
    .makeScale(fit, fit, fit)
    .multiply(new THREE.Matrix4().makeTranslation(0, -fitBox.min.y, 0));
  for (const mesh of baked.children) {
    mesh.geometry.applyMatrix4(settle);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  measurePhoenixGait(baked);
  mergeBakedMeshes(baked);
  phoenixBaked = baked;
  return baked;
}

export function createFighter(team, isPlayerView = false) {
  const teamId = team === TEAM.red || team === "red" ? "red" : "blue";
  const teamColor = TEAM[teamId];
  const isPhoenix = teamId === "red" && Boolean(phoenixTemplate);
  if (!commandoTemplate && !isPhoenix) throw new Error("Call loadGameAssets() before createFighter()");
  const profile = isPhoenix ? PHOENIX_GAIT : COMMANDO_GAIT;
  const g = new THREE.Group();
  const body = (isPhoenix ? bakePhoenix() : bakeCommando()).clone(true);
  cloneMaterials(body);
  if (!isPhoenix) applyTeamLights(body, teamColor, false);
  const fpsClip = isPlayerView ? profile.clipY : 8;
  const walkUniforms = attachBodyShaders(body, profile, fpsClip);
  if (isPlayerView) body.visible = false;
  const pose = new THREE.Group();
  let gun = null;
  if (!isPlayerView) {
    gun = createWeapon(DEFAULT_WEAPON, true);
    gun.position.set(0.14 * BODY_K, 0.98 * BODY_K, -0.28 * BODY_K);
    gun.rotation.set(0.12, 0, 0.06);
    pose.add(gun);
  }
  pose.add(body);
  g.add(pose);
  body.rotation.y = Math.PI;
  body.position.z = -0.04;
  pose.rotation.x = -0.02;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46 * BODY_K, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);
  g.userData = {
    body,
    pose,
    walkUniforms,
    teamColor,
    team: teamId,
    shadow,
    gun,
    kind: profile.id,
    fpsView: isPlayerView,
    fpsClipY: isPlayerView ? profile.clipY : null,
  };
  if (isPlayerView) {
    g.frustumCulled = false;
    g.traverse((obj) => {
      obj.frustumCulled = false;
    });
  }
  return g;
}

export function createBomb() {
  if (!bombTemplate) throw new Error("Call loadGameAssets() before createBomb()");
  const g = new THREE.Group();
  const bomb = bombTemplate.clone(true);
  cloneMaterials(bomb);
  const drop = [];
  bomb.traverse((obj) => {
    if (obj.isLight || obj.isCamera) drop.push(obj);
  });
  for (const obj of drop) obj.removeFromParent();
  bomb.updateMatrixWorld(true);
  const box = new THREE.Box3();
  bomb.traverse((obj) => {
    if (obj.isMesh) box.expandByObject(obj);
  });
  if (box.isEmpty()) box.setFromObject(bomb);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 0.05);
  bomb.scale.setScalar(0.42 / longest);
  bomb.updateMatrixWorld(true);
  const after = new THREE.Box3();
  bomb.traverse((obj) => {
    if (obj.isMesh) after.expandByObject(obj);
  });
  if (after.isEmpty()) after.setFromObject(bomb);
  bomb.position.set(
    -(after.min.x + after.max.x) * 0.5,
    -after.min.y,
    -(after.min.z + after.max.z) * 0.5
  );
  g.add(bomb);
  const light = new THREE.PointLight(0xff3a18, 0, 4.5);
  light.position.set(0, 0.18, 0);
  g.add(light);
  g.userData.light = light;
  return g;
}

export function createMarker(world = false, opts = {}) {
  const id = opts.weapon || DEFAULT_WEAPON;
  if (weaponTemplates[id] || weaponTemplates.glock) return createWeapon(id, world);
  if (!blasterTemplate) throw new Error("Call loadGameAssets() before createMarker()");
  const g = new THREE.Group();
  const gun = blasterTemplate.clone(true);
  cloneMaterials(gun);
  gun.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gun);
  const len = Math.max(0.05, box.max.z - box.min.z, box.max.x - box.min.x);
  gun.scale.setScalar((world ? 0.76 * BODY_K : 0.6) / len);
  gun.rotation.y = Math.PI;
  g.add(gun);
  gun.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(g);
  g.userData.muzzle = new THREE.Vector3(
    (after.min.x + after.max.x) * 0.5,
    (after.min.y + after.max.y) * 0.5 + 0.015,
    after.min.z - 0.02
  );
  g.userData.weaponId = id;
  if (!world) {
    g.position.set(0.3, -0.24, -0.48);
    g.rotation.set(0.05, 0.14, 0.03);
    g.frustumCulled = false;
    g.traverse((obj) => {
      obj.frustumCulled = false;
    });
  }
  return g;
}

function cloneGunRoot(src) {
  let skinned = false;
  src.traverse((obj) => {
    if (obj.isSkinnedMesh) skinned = true;
  });
  return skinned ? cloneSkinned(src) : src.clone(true);
}

function stripSketchfabTilt(root) {
  root.traverse((obj) => {
    if (!/^sketchfab_(model|scene)$/i.test(obj.name || "")) return;
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
  });
}

function flattenGunMeshes(src) {
  src.updateMatrixWorld(true);
  const g = new THREE.Group();
  src.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.isSkinnedMesh ? bakeSkinnedGeometry(mesh) : mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const nm = new THREE.Mesh(geo, mesh.material);
    nm.name = mesh.name;
    nm.castShadow = false;
    nm.receiveShadow = false;
    nm.frustumCulled = false;
    g.add(nm);
  });
  return g;
}

function applyGunMatrix(g, matrix) {
  g.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.applyMatrix4(matrix);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function namedAxisAvg(g, re, axis) {
  let sum = 0;
  let n = 0;
  const c = new THREE.Vector3();
  g.traverse((mesh) => {
    if (!mesh.isMesh || !re.test(mesh.name || "")) return;
    new THREE.Box3().setFromObject(mesh).getCenter(c);
    sum += c[axis];
    n += 1;
  });
  return n ? sum / n : null;
}

function xySpanInZ(g, z0, z1) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hits = 0;
  g.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += Math.max(1, (pos.count / 2500) | 0)) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (z < z0 || z > z1) continue;
      hits += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  });
  if (!hits) return 1;
  return Math.max(0.001, maxX - minX) * Math.max(0.001, maxY - minY);
}

function detectMuzzleSign(g) {
  const front = namedAxisAvg(g, /barrel|muzzle|slide|innerpart|bolt|fs_low/i, "z");
  const rear = namedAxisAvg(g, /stock|handle|grip/i, "z");
  if (front != null && rear != null && Math.abs(front - rear) > 1e-4) return Math.sign(front - rear);
  if (front != null && Math.abs(front) > 1e-4) return Math.sign(front);
  const box = new THREE.Box3().setFromObject(g);
  const span = box.max.z - box.min.z;
  const tNeg = xySpanInZ(g, box.min.z, box.min.z + span * 0.28);
  const tPos = xySpanInZ(g, box.max.z - span * 0.28, box.max.z);
  return tPos < tNeg ? 1 : -1;
}

function detectUpSign(g) {
  const down = namedAxisAvg(g, /mag|magazine|handle|grip/i, "y");
  const up = namedAxisAvg(g, /slide|receiver|barrel|rail|stock/i, "y");
  if (down != null && up != null && Math.abs(up - down) > 1e-4) return Math.sign(up - down);
  return 1;
}

function gunBox(g) {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
}

function centerGun(g) {
  const box = gunBox(g);
  const c = box.getCenter(new THREE.Vector3());
  applyGunMatrix(g, new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}

function orientGun(g) {
  let box = gunBox(g);
  let size = box.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) {
    applyGunMatrix(g, new THREE.Matrix4().makeRotationY(Math.PI * 0.5));
  } else if (size.y >= size.x && size.y >= size.z) {
    applyGunMatrix(g, new THREE.Matrix4().makeRotationX(Math.PI * 0.5));
  }
  centerGun(g);
  if (detectMuzzleSign(g) > 0) applyGunMatrix(g, new THREE.Matrix4().makeRotationY(Math.PI));
  if (detectUpSign(g) < 0) applyGunMatrix(g, new THREE.Matrix4().makeRotationZ(Math.PI));
  centerGun(g);
}

function sampleGunPoint(g, pick) {
  const p = new THREE.Vector3();
  let best = null;
  let bestScore = -Infinity;
  g.updateMatrixWorld(true);
  g.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const e = mesh.matrixWorld.elements;
    const step = Math.max(1, (pos.count / 5000) | 0);
    for (let i = 0; i < pos.count; i += step) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      p.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const score = pick(p);
      if (score > bestScore) {
        bestScore = score;
        best = p.clone();
      }
    }
  });
  return best;
}

function findGripPoint(g, box) {
  const zMid = (box.min.z + box.max.z) * 0.5;
  return (
    sampleGunPoint(g, (p) => (p.z < zMid ? -1e9 : -p.y * 4 - Math.abs(p.x) * 0.6 + p.z * 0.15)) ||
    new THREE.Vector3(0, box.min.y, box.max.z * 0.2)
  );
}

function findSightPoint(g, box) {
  const span = box.max.z - box.min.z;
  const zA = box.min.z + span * 0.38;
  const zB = box.min.z + span * 0.88;
  return (
    sampleGunPoint(g, (p) => (p.z < zA || p.z > zB ? -1e9 : p.y * 5 - Math.abs(p.x) * 2.2 - Math.abs(p.z - (zA + zB) * 0.5) * 0.15)) ||
    new THREE.Vector3(0, box.max.y, box.min.z + span * 0.62)
  );
}

export function createWeapon(id = DEFAULT_WEAPON, world = false) {
  const spec = getWeapon(id);
  const src = weaponTemplates[spec.id] || weaponTemplates.glock;
  if (!src) return createMarker(world, { weapon: spec.id });
  const raw = cloneGunRoot(src);
  cloneMaterials(raw);
  stripSketchfabTilt(raw);
  const gun = flattenGunMeshes(raw);
  orientGun(gun);
  let box = gunBox(gun);
  const len = Math.max(0.04, box.max.z - box.min.z);
  const grip = findGripPoint(gun, box);
  applyGunMatrix(gun, new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
  const g = new THREE.Group();
  g.add(gun);
  const target = world ? spec.worldLen : spec.fpsLen;
  g.scale.setScalar(target / len);
  g.updateMatrixWorld(true);
  box = gunBox(g);
  g.userData.grip = new THREE.Vector3(0, 0, 0);
  g.userData.sight = findSightPoint(g, box);
  g.userData.muzzle = new THREE.Vector3(0, Math.max(0.01, box.max.y * 0.28), box.min.z - 0.012);
  g.userData.weaponId = spec.id;
  g.userData.adsFov = spec.adsFov ?? 50;
  g.frustumCulled = false;
  g.traverse((obj) => {
    obj.frustumCulled = false;
  });
  return g;
}

function armorMat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function limb(radius, len, mat) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 3, 8), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function attachHands(holder) {
  const plate = armorMat(0xcfc8bc, 0.58, 0.2);
  const dark = armorMat(0x2a3038, 0.46, 0.32);
  const glove = armorMat(0x14171c, 0.74, 0.06);
  const s = 1.08;

  const right = new THREE.Group();
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.05, 0.1), glove);
  const rGaunt = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.068, 0.11), dark);
  const rFore = limb(0.03, 0.2, plate);
  const rUpper = limb(0.038, 0.26, plate);
  rHand.position.set(0.038, -0.044, 0.078);
  rHand.rotation.set(0.42, 0.16, 0.84);
  rGaunt.position.set(0.05, -0.024, 0.128);
  rGaunt.rotation.set(0.32, 0.1, 0.7);
  rFore.position.set(0.078, 0.02, 0.22);
  rFore.rotation.set(-0.5, 0.1, 0.56);
  rUpper.position.set(0.11, 0.1, 0.34);
  rUpper.rotation.set(-0.82, 0.08, 0.4);
  right.add(rHand, rGaunt, rFore, rUpper);
  right.scale.setScalar(s);

  const left = new THREE.Group();
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.048, 0.092), glove);
  const lGaunt = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.062, 0.1), dark);
  const lFore = limb(0.028, 0.18, plate);
  const lUpper = limb(0.036, 0.24, plate);
  lHand.position.set(-0.028, -0.034, -0.148);
  lHand.rotation.set(0.24, -0.14, -0.78);
  lGaunt.position.set(-0.04, -0.014, -0.072);
  lGaunt.rotation.set(0.18, -0.1, -0.6);
  lFore.position.set(-0.072, 0.038, 0.048);
  lFore.rotation.set(-0.4, -0.12, -0.62);
  lUpper.position.set(-0.095, 0.12, 0.2);
  lUpper.rotation.set(-0.78, -0.06, -0.4);
  left.add(lHand, lGaunt, lFore, lUpper);
  left.scale.setScalar(s);

  holder.add(right, left);
  holder.userData.hands = { left, right };
}

export function attachWeapon(fighter, weaponId) {
  if (!fighter?.userData?.pose) return null;
  const old = fighter.userData.gun;
  if (old?.parent) old.parent.remove(old);
  const gun = createWeapon(weaponId, true);
  gun.position.set(0.14 * BODY_K, 0.98 * BODY_K, -0.28 * BODY_K);
  gun.rotation.set(0.12, 0, 0.06);
  fighter.userData.pose.add(gun);
  fighter.userData.gun = gun;
  return gun;
}

export function createChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({
    map: crateTexture(),
    color: 0x7a5630,
  });
  const band = new THREE.MeshLambertMaterial({ color: 0xc4a24a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.4), wood);
  body.position.y = 0.16;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.07, 0.42), wood);
  lid.position.y = 0.355;
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.44), band);
  strap.position.y = 0.18;
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), band);
  latch.position.set(0, 0.34, 0.22);
  g.add(body, lid, strap, latch);
  g.userData.lid = lid;
  g.userData.chest = true;
  const box = new THREE.Box3().setFromObject(g);
  g.userData.worldBox = box;
  g.userData.propSolid = true;
  return g;
}

