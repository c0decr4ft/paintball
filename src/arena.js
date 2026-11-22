import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cautionTexture, crateTexture, villageFloorTexture, villageWallTexture } from "./textures.js";

export const TEAM = {
  blue: 0x008cff,
  red: 0xff1a12,
};

export const PLAYABLE_MAPS = [
  { id: "pvp_map", file: "pvp_map.glb" },
  { id: "castle_wars", file: "castle_wars_pavlov_vr.glb" },
];

function mapUrl(file) {
  return `${import.meta.env.BASE_URL}models/${file}`;
}

export function pickPlayableMapId() {
  return Math.random() < 0.5 ? PLAYABLE_MAPS[0].id : PLAYABLE_MAPS[1].id;
}

const COMMANDO_URL = `${import.meta.env.BASE_URL}models/clone_commando.glb`;
const PHOENIX_URL = `${import.meta.env.BASE_URL}models/phoenix.glb`;
const BLASTER_URL = `${import.meta.env.BASE_URL}models/blaster.glb`;
const BOMB_URL = `${import.meta.env.BASE_URL}models/cs_go_bomb.glb`;
const GLOCK_URL = `${import.meta.env.BASE_URL}models/gun_10mm.glb`;
const PISTOL_URL = `${import.meta.env.BASE_URL}models/gun.glb`;
const MP5_URL = `${import.meta.env.BASE_URL}models/mp5_submachine_gun.glb`;

export const MAX_HP = 100;

/** Glock hits hard and slow. Roach sprays fast. MP5 sits in between. */
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
    fpsLen: 0.4,
    worldLen: 0.2,
    adsFov: 52,
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
    fpsLen: 0.46,
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
    fpsLen: 0.9,
    worldLen: 0.72,
    adsFov: 38,
  },
};

export const DEFAULT_WEAPON = "glock";

/** @type {Record<string, THREE.Object3D>} */
const mapTemplates = {};
/** @type {string | null} */
let activeMapId = null;
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

async function loadRequiredGltf(url, label) {
  try {
    return await loadGltf(url);
  } catch {
    throw new Error(`Missing ${label} (${url}).`);
  }
}

let _wallDraw = null;
let _floorDraw = null;
let _crateDraw = null;
const _propDraw = new Map();

function styleVillageMap(root) {
  if (!root) return;
  if (!_wallDraw) {
    _wallDraw = new THREE.MeshLambertMaterial({
      map: villageWallTexture(),
      color: 0xffffff,
      fog: true,
    });
  }
  if (!_floorDraw) {
    _floorDraw = new THREE.MeshLambertMaterial({
      map: villageFloorTexture(),
      color: 0xffffff,
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

function isGlassMesh(mesh) {
  if (!mesh?.isMesh) return false;
  const n = `${mesh.name || ""} ${meshMatName(mesh)}`.toLowerCase();
  return n.includes("glass");
}

function toBakedBasic(src) {
  if (!src) return src;
  if (src.isMeshBasicMaterial) {
    fixTextureColorSpace(src);
    src.toneMapped = false;
    return src;
  }
  const m = new THREE.MeshBasicMaterial();
  if (src.color) m.color.copy(src.color);
  m.map = src.map || src.emissiveMap || null;
  m.lightMap = src.lightMap || null;
  m.lightMapIntensity = src.lightMapIntensity ?? 1;
  m.vertexColors = Boolean(src.vertexColors);
  m.side = src.side;
  m.transparent = src.transparent;
  m.opacity = src.opacity;
  m.alphaTest = src.alphaTest || 0;
  m.depthWrite = src.depthWrite !== false;
  m.fog = src.fog !== false;
  m.toneMapped = false;
  m.name = src.name;
  fixTextureColorSpace(m);
  return m;
}

/** Keep MeshBasic baked lighting; convert lit mats to basic. Never village plaster. */
function stylePlayableMap(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = true;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((m) => {
      if (!m) return m;
      const baked = toBakedBasic(m);
      if (isGlassMesh(obj) || m.transparent || baked.transparent) {
        baked.transparent = true;
        baked.opacity = Math.min(baked.opacity ?? 1, 0.28);
        baked.depthWrite = false;
        obj.userData.noCollide = true;
      }
      return baked;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
}

export async function loadGameAssets(onProgress) {
  const mapsReady = PLAYABLE_MAPS.every((m) => mapTemplates[m.id]);
  if (mapsReady && commandoTemplate && phoenixTemplate && blasterTemplate && bombTemplate) {
    for (const m of PLAYABLE_MAPS) stylePlayableMap(mapTemplates[m.id]);
    return mapTemplates[activeMapId] || mapTemplates[PLAYABLE_MAPS[0].id];
  }
  const mapLoads = PLAYABLE_MAPS.map((m) =>
    mapTemplates[m.id] ? Promise.resolve(null) : loadRequiredGltf(mapUrl(m.file), m.file).then((gltf) => ({ id: m.id, gltf }))
  );
  const [mapHits, commandoGltf, phoenixGltf, blasterGltf, bombGltf] = await Promise.all([
    Promise.all(mapLoads),
    commandoTemplate ? Promise.resolve(null) : loadRequiredGltf(COMMANDO_URL, "clone_commando.glb"),
    phoenixTemplate ? Promise.resolve(null) : loadRequiredGltf(PHOENIX_URL, "phoenix.glb"),
    blasterTemplate ? Promise.resolve(null) : loadRequiredGltf(BLASTER_URL, "blaster.glb"),
    bombTemplate ? Promise.resolve(null) : loadRequiredGltf(BOMB_URL, "cs_go_bomb.glb"),
  ]);
  onProgress?.(1, "assets");

  for (const hit of mapHits) {
    if (!hit?.gltf) continue;
    mapTemplates[hit.id] = hit.gltf.scene;
    stylePlayableMap(mapTemplates[hit.id]);
  }

  if (commandoGltf) {
    commandoGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (!m) return m;
        fixTextureColorSpace(m);
        if (m.envMapIntensity != null) m.envMapIntensity = 0;
        return cheapMat(m);
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });
    commandoTemplate = commandoGltf.scene;
  }

  if (phoenixGltf) {
    phoenixGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (!m) return m;
        fixTextureColorSpace(m);
        if (m.envMapIntensity != null) m.envMapIntensity = 0;
        return cheapMat(m);
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });
    phoenixTemplate = phoenixGltf.scene;
  }

  if (blasterGltf) {
    blasterGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (!m) return m;
        fixTextureColorSpace(m);
        if (m.envMapIntensity != null) m.envMapIntensity = 0;
        return cheapMat(m);
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });
    blasterTemplate = blasterGltf.scene;
  }

  if (bombGltf) {
    bombGltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (!m) return m;
        fixTextureColorSpace(m);
        if (m.envMapIntensity != null) m.envMapIntensity = 0;
        return cheapMat(m);
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });
    bombTemplate = bombGltf.scene;
  }

  return mapTemplates[activeMapId] || mapTemplates[PLAYABLE_MAPS[0].id];
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
    if (isExplosiveMesh(mesh) || isCrateMesh(mesh) || mesh.userData?.noCollide) continue;
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
        const draw = new THREE.Mesh(merged, toBakedBasic(mat));
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

function computeMapScale(rawBox) {
  const h = rawBox.max.y - rawBox.min.y;
  const span = Math.max(rawBox.max.x - rawBox.min.x, rawBox.max.z - rawBox.min.z);
  if (h < 1.6 && span < 12) return THREE.MathUtils.clamp(3.2 / Math.max(h, 0.4), 1, 2.4);
  if (h > 48 || span > 280) return THREE.MathUtils.clamp(22 / Math.max(h, span * 0.12), 0.35, 1);
  return 1;
}

export function disposeArena(scene, arena) {
  if (!arena?.world) return;
  if (arena.world.parent) arena.world.parent.remove(arena.world);
  arena.batched?.traverse((obj) => {
    obj.geometry?.dispose?.();
  });
}

export function buildArena(scene, mapId) {
  const id = PLAYABLE_MAPS.some((m) => m.id === mapId) ? mapId : pickPlayableMapId();
  const mapTemplate = mapTemplates[id];
  if (!mapTemplate) throw new Error("Call loadGameAssets() before buildArena()");
  activeMapId = id;

  mapTemplate.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(mapTemplate);
  const MAP_SCALE = computeMapScale(rawBox);

  scene.background = new THREE.Color(0x10100e);

  const world = new THREE.Group();
  world.name = "world";
  scene.add(world);

  if (!scene.children.some((c) => c.isHemisphereLight)) {
    scene.add(new THREE.HemisphereLight(0xe8e2d6, 0x3a3228, 1.22));
  }
  if (!scene.children.some((c) => c.isDirectionalLight)) {
    const sun = new THREE.DirectionalLight(0xffead4, 0.92);
    sun.position.set(18, 28, 10);
    sun.castShadow = false;
    scene.add(sun);
  }

  const map = mapTemplate.clone(true);
  stylePlayableMap(map);
  map.scale.setScalar(MAP_SCALE);
  map.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(map);
  map.position.x -= (fitBox.min.x + fitBox.max.x) * 0.5;
  map.position.y -= fitBox.min.y;
  map.position.z -= (fitBox.min.z + fitBox.max.z) * 0.5;
  map.updateMatrixWorld(true);
  world.add(map);

  const walkMeshes = [];
  const wallMeshes = [];
  const floorMeshes = [];
  const mapFoot = new THREE.Box3().setFromObject(map);
  const mapW = mapFoot.max.x - mapFoot.min.x;
  const mapD = mapFoot.max.z - mapFoot.min.z;
  map.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.updateWorldMatrix(true, false);
    obj.userData.worldBox = new THREE.Box3().setFromObject(obj);
    if (obj.userData.noCollide || isGlassMesh(obj)) {
      obj.userData.noCollide = true;
      return;
    }
    if (isPropSolid(obj)) obj.userData.propSolid = true;
    walkMeshes.push(obj);
    const box = obj.userData.worldBox;
    const hy = box ? box.max.y - box.min.y : 1;
    const hx = box ? box.max.x - box.min.x : 0;
    const hz = box ? box.max.z - box.min.z : 0;
    const mapShell = hx > mapW * 0.82 && hz > mapD * 0.82 && hy > 3.2;
    // pvp_map stores much of its architecture in one large mesh. Excluding that
    // shell made its internal walls entirely pass-through. Castle has separate
    // wall meshes, so retaining its huge shell would only inflate raycast cost.
    if (hy >= 0.62 && (!mapShell || id === "pvp_map")) wallMeshes.push(obj);
    floorMeshes.push(obj);
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
      if (h.object.userData.exploded || h.object.userData.propSolid || h.object.userData.noCollide) continue;
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
      if (h.object.userData.exploded || h.object.userData.noCollide) continue;
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
  function isRooftop() {
    return false;
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
    const ceil = ceilingAt(x, z, gy + 0.18, 1.9 * BODY_K);
    if (ceil != null && ceil - gy < 0.86) return true;
    const yLo = gy + 0.38 * BODY_K;
    const yHi = gy + 1.08 * BODY_K;
    const r2 = radius * radius;
    for (const mesh of nearbyWalls(x, z, radius + 0.85)) {
      if (mesh.userData.exploded || mesh.userData.noCollide) continue;
      const box = mesh.userData.worldBox;
      if (!box) continue;
      const hy = box.max.y - box.min.y;
      const hx = box.max.x - box.min.x;
      const hz = box.max.z - box.min.z;
      if (hy < 0.55) continue;
      if (box.max.y < yLo || box.min.y > yHi) continue;
      if (hx > 10 && hz > 10) {
        const edge = Math.min(x - box.min.x, box.max.x - x, z - box.min.z, box.max.z - z);
        if (edge > radius + 0.16) continue;
      }
      const cx = Math.max(box.min.x, Math.min(x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(z, box.max.z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  const worldBox = new THREE.Box3().setFromObject(map);
  const halfX = (worldBox.max.x - worldBox.min.x) / 2;
  const halfZ = (worldBox.max.z - worldBox.min.z) / 2;
  const roof = worldBox.max.y;
  const spanXZ = Math.hypot(worldBox.max.x - worldBox.min.x, worldBox.max.z - worldBox.min.z);
  scene.fog = new THREE.Fog(0x1a1814, Math.max(36, spanXZ * 0.4), Math.max(120, spanXZ * 1.25));
  const camFar = Math.max(160, Math.min(420, spanXZ * 1.85 + roof * 3));
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

  function floorsAt(x, z) {
    const objs = walkObjs(x, z);
    if (!objs.length) return [];
    _from.set(x, worldBox.max.y + 2.4, z);
    ray.set(_from, down);
    ray.near = 0.02;
    ray.far = Math.max(4, worldBox.max.y + 6);
    const hits = ray.intersectObjects(objs, false);
    const ys = [];
    for (const h of hits) {
      if (h.object.userData.exploded || h.object.userData.noCollide || h.object.userData.propSolid) continue;
      if (h.face) _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      else _n.set(0, 1, 0);
      if (_n.y < 0.42) continue;
      const y = h.point.y;
      if (ys.some((v) => Math.abs(v - y) < 0.4)) continue;
      const overhead = ceilingHit(x, z, y + 0.18, 5.2, true);
      const room = overhead ? overhead.point.y - y : 8;
      if (room < 2.05) continue;
      ys.push(y);
    }
    return ys;
  }

  const rawWaypoints = [];
  const spanX = worldBox.max.x - worldBox.min.x;
  const spanZ = worldBox.max.z - worldBox.min.z;
  // Castle is long and visually detailed. A coarser one-time nav sample keeps
  // loading and path setup bounded without touching render detail.
  const TARGET_CELLS = id === "castle_wars" ? 240 : 380;
  let stepX = 2.5;
  let stepZ = 2.5;
  const guess = (spanX / stepX) * (spanZ / stepZ);
  if (guess > TARGET_CELLS) {
    const grow = Math.sqrt(guess / TARGET_CELLS);
    stepX *= grow;
    stepZ *= grow;
  }
  stepX = Math.max(2.2, Math.min(8, stepX));
  stepZ = Math.max(2.2, Math.min(8, stepZ));
  for (let x = worldBox.min.x + 2; x <= worldBox.max.x - 2; x += stepX) {
    for (let z = worldBox.min.z + 2; z <= worldBox.max.z - 2; z += stepZ) {
      const floors = floorsAt(x, z);
      for (const y of floors) {
        rawWaypoints.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  const waypoints = rawWaypoints.length ? rawWaypoints : [new THREE.Vector3(0, 0.05, 0)];

  const yBuckets = new Map();
  for (const w of waypoints) {
    const k = Math.round(w.y * 2) / 2;
    yBuckets.set(k, (yBuckets.get(k) || 0) + 1);
  }
  let mainY = waypoints[0].y;
  let mainCount = 0;
  const scoredY = [];
  for (const [y, n] of yBuckets) {
    const band = waypoints.filter((w) => Math.abs(w.y - y) < 1.4).length;
    scoredY.push({ y, n: band, roof: y > roof - 1.85 });
    if (n > mainCount) {
      mainCount = n;
      mainY = y;
    }
  }
  scoredY.sort((a, b) => b.n - a.n);
  const groundBand = scoredY.find((s) => !s.roof && s.n >= 16);
  if (groundBand) mainY = groundBand.y;
  const mainFloor = waypoints.filter((w) => Math.abs(w.y - mainY) < 1.4);
  const LINK_R = Math.max(3.15, Math.hypot(stepX, stepZ) * 1.08);
  const LINK_R2 = LINK_R * LINK_R;
  const HEADROOM = 2.0;

  function linkCount(w, pool) {
    let n = 0;
    for (const o of pool) {
      if (o === w) continue;
      const dx = o.x - w.x;
      const dz = o.z - w.z;
      if (dx * dx + dz * dz <= LINK_R2 && Math.abs(o.y - w.y) < 1.2) n += 1;
    }
    return n;
  }

  function largestFloor(pool) {
    const adj = Array.from({ length: pool.length }, () => []);
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const dx = pool[i].x - pool[j].x;
        const dz = pool[i].z - pool[j].z;
        if (dx * dx + dz * dz <= LINK_R2 && Math.abs(pool[i].y - pool[j].y) < 1.2) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }
    const seen = new Uint8Array(pool.length);
    let best = pool;
    let bestN = 0;
    for (let i = 0; i < pool.length; i++) {
      if (seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      const comp = [];
      while (stack.length) {
        const cur = stack.pop();
        comp.push(pool[cur]);
        for (const n of adj[cur]) {
          if (seen[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (comp.length > bestN) {
        bestN = comp.length;
        best = comp;
      }
    }
    return best;
  }

  const spawnBand = mainFloor.length > 10 ? mainFloor : waypoints;
  const spawnLinked = largestFloor(spawnBand);
  const spawnPool = spawnLinked.length > 10 ? spawnLinked : spawnBand;
  const neighborN = new Map();
  for (const w of spawnPool) neighborN.set(w, linkCount(w, spawnPool));

  function standingAt(w) {
    const gy = groundAt(w.x, w.z, w.y);
    if (gy == null || Math.abs(gy - w.y) > 0.55) return false;
    const ceil = ceilingHit(w.x, w.z, gy + 0.16, HEADROOM, true);
    if (ceil && ceil.point.y - gy < HEADROOM) return false;
    return !blockedXZ(w.x, w.z, 0.85, gy);
  }

  function pickSpawn(scoreFn, pool = spawnPool) {
    const ranked = [];
    for (const w of pool) {
      const n = neighborN.get(w) ?? linkCount(w, pool);
      if (n < 2) continue;
      ranked.push({ w, s: scoreFn(w) + n * 2.8 });
    }
    ranked.sort((a, b) => b.s - a.s);
    for (const { w } of ranked) {
      if (!standingAt(w)) continue;
      return w.clone();
    }
    for (const w of pool) {
      const n = neighborN.get(w) ?? linkCount(w, pool);
      if (n < 1) continue;
      if (!standingAt(w)) continue;
      return w.clone();
    }
    const fallback = ranked[0]?.w || pool[0] || waypoints[0] || new THREE.Vector3(0, 0, 0);
    return fallback.clone();
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
    const padPool = spawnPool.length ? spawnPool : waypoints;
    for (const w of padPool) {
      if (!padOpen(w)) continue;
      const d = p.distanceToSquared(w);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best.clone();
  }

  const standPool = spawnPool.filter((w) => (neighborN.get(w) ?? 0) >= 2 && standingAt(w));
  const vs = standPool.length >= 8 ? standPool : spawnPool;
  let minSX = Infinity;
  let maxSX = -Infinity;
  let minSZ = Infinity;
  let maxSZ = -Infinity;
  for (const w of vs) {
    if (w.x < minSX) minSX = w.x;
    if (w.x > maxSX) maxSX = w.x;
    if (w.z < minSZ) minSZ = w.z;
    if (w.z > maxSZ) maxSZ = w.z;
  }
  const alongX = maxSX - minSX >= maxSZ - minSZ;
  const spawnAnchors = {
    pvp_map: {
      blue: new THREE.Vector3(-22.65, 3.18, -7.99),
      red: new THREE.Vector3(16.16, 2.47, 22.5),
    },
    castle_wars: {
      blue: new THREE.Vector3(-58.9, 5, -6.61),
      red: new THREE.Vector3(58.82, 5, 8.58),
    },
  };
  const anchors = spawnAnchors[id];
  let spawnBlue = ensureGroundPad(
    pickSpawn(
      (w) => anchors ? -w.distanceToSquared(anchors.blue) * 4 : (alongX ? -w.x : -w.z) + (neighborN.get(w) ?? 0),
      vs
    )
  );
  let spawnRed = ensureGroundPad(
    pickSpawn(
      (w) => anchors
        ? -w.distanceToSquared(anchors.red) * 4
        : w.distanceToSquared(spawnBlue) * 1.35 + (alongX ? w.x : w.z) * 10,
      vs
    )
  );
  const minSep = Math.max(14, spanXZ * 0.28);
  if (spawnBlue.distanceTo(spawnRed) < minSep) {
    spawnRed = ensureGroundPad(pickSpawn((w) => w.distanceToSquared(spawnBlue), vs));
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
    const pool = spawnPool.length ? spawnPool : waypoints;
    let best = pool[0] || new THREE.Vector3();
    let bestS = -Infinity;
    let found = false;
    for (const w of pool) {
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
    const sitePool = spawnPool.length ? spawnPool : waypoints;

    const consider = (requireDist) => {
      let best = null;
      let bestS = -Infinity;
      for (const w of sitePool) {
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
    spawnPool,
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
    mapId: id,
    mapScale: MAP_SCALE,
    camFar,
    outdoor: true,
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

function isAccentMesh(obj, mat) {
  const name = `${obj.name || ""} ${mat?.name || ""}`.toLowerCase();
  if (/visor|goggle|lens|led|light|armband|stripe|trim|badge|patch/.test(name)) return true;
  return isTeamLight(mat);
}

function applyTeamLights(root, teamColor, _softTint = false) {
  const color = new THREE.Color(teamColor);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (!isAccentMesh(obj, m)) continue;
      if (m.emissive) {
        m.emissive.copy(color).multiplyScalar(0.28);
        m.emissiveIntensity = Math.min(0.55, Math.max(m.emissiveIntensity || 0, 0.28));
      }
      if (m.color && !m.map && !m.emissiveMap) m.color.lerp(color, 0.35);
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
  clipY: 1.28,
  kneeY: 0.44 * BODY_K,
  shX: 0.18,
  shY: 1.22,
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

function attachBodyShaders(root, profile, clipY = 8, holdArms = true) {
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
  const sx = (profile.shX ?? 0.18).toFixed(5);
  const sy = (profile.shY ?? 1.22).toFixed(5);
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
        shader.uniforms.uHold = uHold;
        shader.vertexShader =
          "uniform float uWalk;\nuniform float uPhase;\nuniform float uRun;\nuniform float uHipY;\nuniform float uClipY;\nuniform float uCrouch;\nuniform float uLookDown;\nuniform float uHold;\nvarying float vBodyY;\nvarying float vBodyX;\n" +
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
            transformed.y += loc * mix(0.02, 0.042, run) * bk * bob;
            transformed.x += step * mix(0.01, 0.024, run) * bk * loc * smoothstep(0.32 * bk, 1.12 * bk, position.y);
            transformed.z += mix(0.0, 0.012, run) * bk * loc * smoothstep(uHipY, 1.38 * bk, position.y);

            if (position.y > uHipY + 0.04 * bk && abs(position.x) < 0.22 * bk) {
              float twist = -step * mix(0.08, 0.18, run) * loc;
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
              float swing = mix(0.82, 1.22, run) * loc;
              float ang = gait * swing + uCrouch * 0.72;
              float hipY = uHipY - uCrouch * 0.52 * bk * squat;
              vec3 p = transformed;
              p.y -= hipY;
              float c = cos(ang);
              float s = sin(ang);
              p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);

              float kneeH = ${ky} - uCrouch * 0.22 * bk;
              if (position.y < kneeH) {
                float flex = fwd * mix(0.95, 1.42, run) * loc;
                flex += back * mix(0.2, 0.42, run) * loc;
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
              p.y += fwd * mix(0.09, 0.2, run) * bk * loc * foot;
              p.y -= back * mix(0.0, 0.014, run) * bk * loc * foot;
              p.z += gait * mix(0.06, 0.12, run) * bk * loc;
              transformed = mix(transformed, vec3(p.x, p.y + hipY, p.z), legMask);
            }

            float hold = clamp(uHold, 0.0, 1.0);
            float armMask = smoothstep(0.10, 0.17, abs(position.x)) * smoothstep(uHipY + 0.04, uHipY + 0.22, position.y);
            if (armMask * hold > 0.001) {
              float armSide = position.x >= 0.0 ? 1.0 : -1.0;
              vec3 sh = vec3(armSide * ${sx}, ${sy}, 0.0);
              vec3 ap = transformed - sh;
              float drop = mix(1.08, 0.92, run);
              float cd = cos(-drop * armSide);
              float sd = sin(-drop * armSide);
              ap = vec3(ap.x * cd - ap.y * sd, ap.x * sd + ap.y * cd, ap.z);
              float yawA = 0.72 * armSide;
              float cy = cos(yawA);
              float sya = sin(yawA);
              ap = vec3(ap.x * cy + ap.z * sya, ap.y, -ap.x * sya + ap.z * cy);
              float reach = length(ap);
              if (reach > 0.22) {
                float elbow = mix(0.95, 0.72, run);
                float ce = cos(-elbow * armSide);
                float se = sin(-elbow * armSide);
                vec3 ep = ap;
                ep.y += 0.06;
                ep = vec3(ep.x * ce - ep.y * se, ep.x * se + ep.y * ce, ep.z);
                ep.y -= 0.06;
                ap = mix(ap, ep, smoothstep(0.20, 0.32, reach));
              }
              float sway = step * mix(0.05, 0.1, run) * loc * armSide;
              float cs = cos(sway);
              float ss = sin(sway);
              ap = vec3(ap.x, ap.y * cs - ap.z * ss, ap.y * ss + ap.z * cs);
              transformed = mix(transformed, ap + sh, armMask * hold);
            }
            vBodyY = position.y;
            vBodyX = position.x;
            `
          );
        shader.fragmentShader =
          "uniform float uClipY;\nvarying float vBodyY;\nvarying float vBodyX;\n" +
          shader.fragmentShader.replace(
            "void main() {",
            "void main() {\n  if (vBodyY > uClipY) discard;"
          );
      };
      m.customProgramCacheKey = () => `${profile.id}-${profile.hipY.toFixed(3)}-${clipY.toFixed(2)}-gait-arms`;
      m.needsUpdate = true;
    }
  });
  return { uWalk, uPhase, uRun, uHipY, uClipY, uCrouch, uLookDown, uHold };
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

const PHOENIX_BONES = {
  pelvis: "pelvis_01",
  upLegR: "leg_upper_R_02",
  loLegR: "leg_lower_R_05",
  ankleR: "ankle_R_06",
  ballR: "ball_R_07",
  upLegL: "leg_upper_L_09",
  loLegL: "leg_lower_L_012",
  ankleL: "ankle_L_013",
  ballL: "ball_L_014",
  spine0: "spine_0_016",
  spine2: "spine_2_018",
  spine3: "spine_3_020",
  clavR: "clavicle_R_021",
  upArmR: "arm_upper_R_022",
  loArmR: "arm_lower_R_025",
  handR: "hand_R_028",
  weaponR: "weapon_hand_R_030",
  clavL: "clavicle_L_051",
  upArmL: "arm_upper_L_052",
  loArmL: "arm_lower_L_055",
  handL: "hand_L_058",
  neck: "neck_0_082",
  head: "head_0_083",
};

const _axis = new THREE.Vector3();
const _side = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mid = new THREE.Vector3();
const _left = new THREE.Vector3();
const _right = new THREE.Vector3();

function sm01(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / Math.max(1e-4, b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function collectPhoenixBones(root) {
  const found = {};
  const names = new Set(Object.values(PHOENIX_BONES));
  root.traverse((o) => {
    if (!o.isBone || !names.has(o.name)) return;
    o.userData.restQ = o.quaternion.clone();
    o.userData.restS = o.scale.clone();
    for (const [key, name] of Object.entries(PHOENIX_BONES)) {
      if (name === o.name) found[key] = o;
    }
  });
  return found;
}

function resetBone(bone) {
  if (!bone?.userData.restQ) return;
  bone.quaternion.copy(bone.userData.restQ);
  if (bone.userData.restS) bone.scale.copy(bone.userData.restS);
}

function stubWalkUniforms() {
  return {
    uWalk: { value: 0 },
    uPhase: { value: 0 },
    uRun: { value: 0 },
    uCrouch: { value: 0 },
    uClipY: { value: 8 },
    uLookDown: { value: 0 },
    uHold: { value: 0 },
  };
}

function createPhoenixRig() {
  if (!phoenixTemplate) throw new Error("Call loadGameAssets() before createFighter()");
  const wrap = new THREE.Group();
  const clone = cloneSkinned(phoenixTemplate);
  wrap.add(clone);
  clone.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
  });
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const s = COMMANDO_H / Math.max(0.001, box.max.y - box.min.y);
  wrap.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(wrap);
  wrap.position.set(-(after.min.x + after.max.x) * 0.5, -after.min.y, -(after.min.z + after.max.z) * 0.5);
  wrap.updateMatrixWorld(true);
  const bones = collectPhoenixBones(wrap);
  if (bones.pelvis) {
    bones.pelvis.getWorldPosition(_mid);
    wrap.position.x -= _mid.x;
    wrap.position.z -= _mid.z;
  }
  wrap.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(wrap);
  wrap.position.y -= floor.min.y;
  wrap.updateMatrixWorld(true);
  wrap.userData.bones = bones;
  wrap.userData.skeleton = null;
  wrap.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) wrap.userData.skeleton = o.skeleton;
  });
  return wrap;
}

function poseAxes(rig) {
  const pose = rig.userData.pose;
  pose.updateWorldMatrix(true, false);
  _side.set(1, 0, 0).transformDirection(pose.matrixWorld).normalize();
  _fwd.set(0, 0, -1).transformDirection(pose.matrixWorld).normalize();
}

function posePhoenixHold(b, loc, runK, up, plantK, phase = 0) {
  const stride = Math.sin(phase);
  const sway = stride * THREE.MathUtils.lerp(0.025, 0.065, runK) * loc;
  // Pose the model's real shoulders, elbows and wrists around the blaster.
  // The support arm reaches farther forward while the trigger elbow stays tucked.
  b.clavR?.rotateOnWorldAxis(_up, -0.24 * up);
  b.clavL?.rotateOnWorldAxis(_up, 0.34 * up);
  b.clavR?.rotateOnWorldAxis(_side, 0.08 * up);
  b.clavL?.rotateOnWorldAxis(_side, 0.12 * up);
  b.upArmR?.rotateOnWorldAxis(_up, THREE.MathUtils.lerp(0.18, 1.02, up) + plantK * 0.2);
  b.upArmR?.rotateOnWorldAxis(_side, THREE.MathUtils.lerp(0.1, 0.58, up) + plantK * 0.35);
  b.loArmR?.rotateOnWorldAxis(_up, THREE.MathUtils.lerp(0.16, 1.16, up));
  b.loArmR?.rotateOnWorldAxis(_side, 0.24 * up);
  b.handR?.rotateOnWorldAxis(_up, 0.16 * up);
  b.handR?.rotateOnWorldAxis(_side, 0.16 * up);
  b.upArmL?.rotateOnWorldAxis(_up, THREE.MathUtils.lerp(-0.16, -1.16, up) - plantK * 0.2);
  b.upArmL?.rotateOnWorldAxis(_side, THREE.MathUtils.lerp(0.08, 0.48, up) + plantK * 0.35);
  b.loArmL?.rotateOnWorldAxis(_up, THREE.MathUtils.lerp(-0.14, -1.28, up));
  b.loArmL?.rotateOnWorldAxis(_side, 0.3 * up);
  b.handL?.rotateOnWorldAxis(_up, -0.2 * up);
  b.handL?.rotateOnWorldAxis(_side, 0.1 * up);
  if (loc > 0.02) {
    b.upArmR?.rotateOnWorldAxis(_fwd, sway * 0.45);
    b.upArmL?.rotateOnWorldAxis(_fwd, -sway * 0.35);
  }
}

function posePhoenixDeath(rig, t) {
  const body = rig.userData.body;
  const b = body?.userData?.bones;
  if (!b?.upLegR) return;
  for (const bone of Object.values(b)) resetBone(bone);
  poseAxes(rig);
  const kneel = sm01(0, 0.42, t);
  const crumple = sm01(0.42, 0.86, t);
  const flop = sm01(0.86, 1.32, t);
  const fold = kneel * 1.18 + crumple * 0.22;
  b.upLegR.rotateOnWorldAxis(_side, fold);
  b.upLegL.rotateOnWorldAxis(_side, fold);
  b.loLegR?.rotateOnWorldAxis(_side, -1.45 * kneel - 0.2 * crumple);
  b.loLegL?.rotateOnWorldAxis(_side, -1.45 * kneel - 0.2 * crumple);
  b.ankleR?.rotateOnWorldAxis(_side, 0.35 * kneel);
  b.ankleL?.rotateOnWorldAxis(_side, 0.35 * kneel);
  b.pelvis?.rotateOnWorldAxis(_side, 0.3 * kneel + 0.32 * crumple);
  b.spine0?.rotateOnWorldAxis(_side, 0.12 * kneel + 0.28 * crumple);
  b.spine2?.rotateOnWorldAxis(_side, 0.22 * kneel + 0.42 * crumple);
  b.spine3?.rotateOnWorldAxis(_side, 0.1 * kneel + 0.26 * crumple);
  b.upArmR?.rotateOnWorldAxis(_side, 0.35 * kneel + 0.85 * crumple);
  b.upArmL?.rotateOnWorldAxis(_side, 0.35 * kneel + 0.85 * crumple);
  b.loArmR?.rotateOnWorldAxis(_up, 0.4 + 0.5 * crumple);
  b.loArmL?.rotateOnWorldAxis(_up, -0.4 - 0.5 * crumple);
  body.position.y = -0.25 * kneel - 0.1 * crumple - 0.03 * flop;
  body.updateMatrixWorld(true);
  body.userData.skeleton?.update();
  const gun = rig.userData.gun;
  if (gun) gun.visible = flop < 0.55;
}

function posePhoenix(rig, amt, phase, crouch, run, raise = 1, plant = 0, deathT = 0) {
  const body = rig.userData.body;
  const b = body?.userData?.bones;
  if (!b?.upArmR) return;
  if (deathT > 0) {
    posePhoenixDeath(rig, deathT);
    return;
  }
  for (const bone of Object.values(b)) resetBone(bone);
  const hideHead = rig.userData.fpsHideHead;
  if (hideHead) {
    if (b.head) b.head.scale.setScalar(0.01);
    if (b.neck) b.neck.scale.setScalar(0.01);
  }
  poseAxes(rig);
  const plantK = THREE.MathUtils.clamp(plant, 0, 1);
  const loc = THREE.MathUtils.clamp(amt, 0, 1) * (1 - plantK * 0.9);
  const runK = THREE.MathUtils.clamp(run, 0, 1) * loc;
  const up = THREE.MathUtils.clamp(raise, 0, 1) * (1 - plantK * 0.82);
  const squat = THREE.MathUtils.clamp(crouch, 0, 1) + plantK * 0.82;
  posePhoenixHold(b, loc, runK, up, plantK, phase);
  const gait = Math.sin(phase);
  const swing = THREE.MathUtils.lerp(0.48, 0.92, runK) * loc;
  const flex = THREE.MathUtils.lerp(0.42, 0.88, runK) * loc;
  b.upLegR?.rotateOnWorldAxis(_side, gait * swing + squat * 0.55);
  b.upLegL?.rotateOnWorldAxis(_side, -gait * swing + squat * 0.55);
  b.loLegR?.rotateOnWorldAxis(_side, -Math.max(0.12, gait) * flex - squat * 0.7);
  b.loLegL?.rotateOnWorldAxis(_side, -Math.max(0.12, -gait) * flex - squat * 0.7);
  b.ankleR?.rotateOnWorldAxis(_side, Math.max(0, -gait) * 0.28 * loc);
  b.ankleL?.rotateOnWorldAxis(_side, Math.max(0, gait) * 0.28 * loc);
  b.pelvis?.rotateOnWorldAxis(_up, -gait * THREE.MathUtils.lerp(0.06, 0.12, runK) * loc);
  b.spine2?.rotateOnWorldAxis(_up, -gait * 0.08 * loc);
  b.spine2?.rotateOnWorldAxis(_side, 0.08 * loc * (0.4 + runK) + squat * 0.22);
  body.position.y = -squat * 0.32 + Math.abs(gait) * THREE.MathUtils.lerp(0.018, 0.034, runK) * loc;
  body.updateMatrixWorld(true);
  body.userData.skeleton?.update();
  const gun = rig.userData.gun;
  if (gun && b.handR) {
    const hold = b.weaponR || b.handR;
    hold.getWorldPosition(_right);
    if (b.handL) b.handL.getWorldPosition(_left);
    else _left.copy(_right);
    _mid.addVectors(_left, _right).multiplyScalar(0.5).lerp(_right, 0.28);
    rig.userData.pose.worldToLocal(_mid);
    gun.position.copy(_mid);
    gun.rotation.set(0.1, 0.04, 0.05);
    gun.visible = plantK < 0.88;
  }
}

function posePhoenixDance(rig, t) {
  const body = rig.userData.body;
  const b = body?.userData?.bones;
  if (!b?.upArmR) return;
  for (const bone of Object.values(b)) resetBone(bone);
  poseAxes(rig);
  const step = t * ((102 / 60) * Math.PI * 2);
  const leftLeg = Math.sin(step);
  const rightLeg = Math.sin(step + Math.PI);
  const armR = Math.sin(step + 0.55);
  const armL = Math.sin(step * 0.92 + Math.PI + 0.8);
  const shoulder = Math.sin(step * 0.5 + 0.9);
  const kneeL = Math.max(0, Math.sin(step + 0.22));
  const kneeR = Math.max(0, Math.sin(step + Math.PI + 0.4));
  b.upLegR?.rotateOnWorldAxis(_side, rightLeg * 0.52 + 0.1);
  b.upLegL?.rotateOnWorldAxis(_side, leftLeg * 0.58 + 0.08);
  b.loLegR?.rotateOnWorldAxis(_side, -kneeR * 0.92);
  b.loLegL?.rotateOnWorldAxis(_side, -kneeL * 0.7);
  b.ankleR?.rotateOnWorldAxis(_side, Math.max(0, -rightLeg) * 0.22);
  b.ankleL?.rotateOnWorldAxis(_side, Math.max(0, -leftLeg) * 0.18);
  b.clavR?.rotateOnWorldAxis(_fwd, shoulder * 0.2);
  b.clavL?.rotateOnWorldAxis(_fwd, -shoulder * 0.12);
  b.upArmR?.rotateOnWorldAxis(_side, 0.42 + Math.abs(armR) * 0.5);
  b.upArmR?.rotateOnWorldAxis(_fwd, armR * 0.62);
  b.loArmR?.rotateOnWorldAxis(_up, 0.55 + armR * 0.42);
  b.upArmL?.rotateOnWorldAxis(_side, 0.18 + Math.abs(armL) * 0.38);
  b.upArmL?.rotateOnWorldAxis(_fwd, armL * 0.95);
  b.loArmL?.rotateOnWorldAxis(_up, -0.62 + armL * 0.28);
  b.handL?.rotateOnWorldAxis(_side, -0.15 + armL * 0.12);
  b.spine2?.rotateOnWorldAxis(_up, shoulder * 0.14);
  b.spine2?.rotateOnWorldAxis(_side, 0.06 + Math.abs(leftLeg) * 0.04);
  b.pelvis?.rotateOnWorldAxis(_up, Math.sin(step * 0.5) * 0.12);
  b.head?.rotateOnWorldAxis(_side, Math.sin(step * 0.5) * 0.08);
  body.position.y = -Math.max(kneeL, kneeR) * 0.07;
  body.updateMatrixWorld(true);
  body.userData.skeleton?.update();
  const gun = rig.userData.gun;
  if (gun) gun.visible = false;
}

export function createFighter(team, isPlayerView = false) {
  const teamId = team === TEAM.red || team === "red" ? "red" : "blue";
  const teamColor = TEAM[teamId];
  // One consistent, fully rigged character for both teams. The static commando
  // remains an asset fallback only; Phoenix supplies the existing real arms,
  // hands and leg skeleton required for believable weapon and locomotion poses.
  const isPhoenix = Boolean(phoenixTemplate);
  if (!isPhoenix && !commandoTemplate) throw new Error("Call loadGameAssets() before createFighter()");
  const profile = isPhoenix ? PHOENIX_GAIT : COMMANDO_GAIT;
  const g = new THREE.Group();
  const body = isPhoenix ? createPhoenixRig() : bakeCommando().clone(true);
  cloneMaterials(body);
  applyTeamLights(body, teamColor);
  const fpsClip = isPlayerView && !isPhoenix ? 0.12 : 8;
  const walkUniforms = isPhoenix ? stubWalkUniforms() : attachBodyShaders(body, profile, fpsClip, true);
  const pose = new THREE.Group();
  let gun = null;
  if (!isPlayerView) {
    gun = createMarker(true);
    gun.position.set(0.12 * BODY_K, 1.0 * BODY_K, -0.31 * BODY_K);
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
    fpsClipY: isPlayerView && !isPhoenix ? 0.12 : isPlayerView ? 8 : null,
    fpsHideHead: Boolean(isPlayerView),
    poseSkeleton: isPhoenix
      ? (amt, phase, crouch, run, up, plant, deathT) => posePhoenix(g, amt, phase, crouch, run, up, plant, deathT)
      : null,
    dancePose: isPhoenix ? (t) => posePhoenixDance(g, t) : null,
  };
  if (isPhoenix) posePhoenix(g, 0, 0, 0, 0, 1, 0, 0);
  if (isPlayerView) {
    g.frustumCulled = false;
    body.visible = false;
    body.traverse((obj) => {
      obj.layers.set(2);
      obj.frustumCulled = false;
    });
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

function brightenViewmodel(root) {
  const floor = new THREE.Color(0x6e6458);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.color) {
        const lum = m.color.r * 0.3 + m.color.g * 0.5 + m.color.b * 0.2;
        if (lum < 0.16) m.color.copy(floor);
        else m.color.multiplyScalar(1.45);
      }
      if (m.emissive) {
        m.emissive.setHex(0x3a342c);
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.42);
      }
      m.needsUpdate = true;
    }
  });
}

export function createMarker(world = false) {
  if (!blasterTemplate) throw new Error("Call loadGameAssets() before createMarker()");
  const g = new THREE.Group();
  const gun = blasterTemplate.clone(true);
  cloneMaterials(gun);
  brightenViewmodel(gun);
  gun.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gun);
  const len = Math.max(0.05, box.max.z - box.min.z, box.max.x - box.min.x);
  gun.scale.setScalar((world ? 0.54 * BODY_K : 0.26) / len);
  gun.rotation.y = Math.PI;
  g.add(gun);
  gun.updateMatrixWorld(true);
  if (!world) {
    const fitted = new THREE.Box3().setFromObject(g);
    gun.position.x -= (fitted.min.x + fitted.max.x) * 0.5;
    gun.position.y -= (fitted.min.y + fitted.max.y) * 0.5;
    gun.position.z -= fitted.max.z;
  }
  gun.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(g);
  g.userData.muzzle = new THREE.Vector3(
    (after.min.x + after.max.x) * 0.5,
    (after.min.y + after.max.y) * 0.5 + 0.015,
    after.min.z - 0.02
  );
  g.userData.weaponId = "blaster";
  g.userData.adsFov = 64;
  g.userData.hipPos = new THREE.Vector3(0.5, -0.48, -0.82);
  g.userData.adsPos = new THREE.Vector3(0.24, -0.34, -0.74);
  g.userData.adsQuat = new THREE.Quaternion();
  g.userData.sight = new THREE.Vector3(0, 0.02, 0.08);
  if (!world) {
    g.position.copy(g.userData.hipPos);
    g.rotation.set(0.05, 0.14, 0.035);
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
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
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
  const front = namedAxisAvg(g, /barrel|muzzle|slide|innerpart|bolt/i, "z");
  const rear = namedAxisAvg(g, /stock|handle|grip/i, "z");
  if (front != null && rear != null && Math.abs(front - rear) > 1e-4) return Math.sign(front - rear);
  if (front != null && Math.abs(front) > 1e-4) return Math.sign(front);
  const box = new THREE.Box3().setFromObject(g);
  const span = box.max.z - box.min.z;
  const tNeg = xySpanInZ(g, box.min.z, box.min.z + span * 0.28);
  const tPos = xySpanInZ(g, box.max.z - span * 0.28, box.max.z);
  return tPos < tNeg ? 1 : -1;
}

function zSpanAbove(g, predY) {
  let minZ = Infinity;
  let maxZ = -Infinity;
  g.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, (pos.count / 2500) | 0);
    for (let i = 0; i < pos.count; i += step) {
      if (!predY(pos.getY(i))) continue;
      const z = pos.getZ(i);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  });
  return Number.isFinite(minZ) ? maxZ - minZ : 0;
}

function detectUpSign(g) {
  const down = namedAxisAvg(g, /mag|magazine|handle|grip/i, "y");
  const up = namedAxisAvg(g, /slide|receiver|barrel|rail|stock/i, "y");
  if (down != null && up != null && Math.abs(up - down) > 1e-4) return Math.sign(up - down);
  const box = gunBox(g);
  const midY = (box.min.y + box.max.y) * 0.5;
  const high = zSpanAbove(g, (y) => y > midY);
  const low = zSpanAbove(g, (y) => y < midY);
  return high >= low ? 1 : -1;
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

function eigenVectors3(cov) {
  let a = cov.slice();
  let v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let iter = 0; iter < 48; iter++) {
    let p = 0;
    let q = 1;
    let max = Math.abs(a[1]);
    if (Math.abs(a[2]) > max) {
      max = Math.abs(a[2]);
      p = 0;
      q = 2;
    }
    if (Math.abs(a[5]) > max) {
      max = Math.abs(a[5]);
      p = 1;
      q = 2;
    }
    if (max < 1e-14) break;
    const app = a[p * 3 + p];
    const aqq = a[q * 3 + q];
    const apq = a[p * 3 + q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const next = a.slice();
    for (let i = 0; i < 3; i++) {
      if (i === p || i === q) continue;
      const aip = a[i * 3 + p];
      const aiq = a[i * 3 + q];
      next[i * 3 + p] = next[p * 3 + i] = c * aip - s * aiq;
      next[i * 3 + q] = next[q * 3 + i] = s * aip + c * aiq;
    }
    next[p * 3 + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    next[q * 3 + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    next[p * 3 + q] = next[q * 3 + p] = 0;
    a = next;
    const nv = v.slice();
    for (let i = 0; i < 3; i++) {
      const vip = v[i * 3 + p];
      const viq = v[i * 3 + q];
      nv[i * 3 + p] = c * vip - s * viq;
      nv[i * 3 + q] = s * vip + c * viq;
    }
    v = nv;
  }
  const axes = [0, 1, 2].map((i) => ({
    l: a[i * 3 + i],
    v: new THREE.Vector3(v[i], v[3 + i], v[6 + i]),
  }));
  axes.sort((x, y) => y.l - x.l);
  return axes;
}

function pcaAlignGun(g) {
  const pts = [];
  g.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, (pos.count / 4000) | 0);
    for (let i = 0; i < pos.count; i += step) pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  });
  const n = pts.length / 3;
  if (n < 8) return;
  const mean = [0, 0, 0];
  for (let i = 0; i < pts.length; i += 3) {
    mean[0] += pts[i];
    mean[1] += pts[i + 1];
    mean[2] += pts[i + 2];
  }
  mean[0] /= n;
  mean[1] /= n;
  mean[2] /= n;
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i] - mean[0];
    const y = pts[i + 1] - mean[1];
    const z = pts[i + 2] - mean[2];
    C[0] += x * x;
    C[1] += x * y;
    C[2] += x * z;
    C[4] += y * y;
    C[5] += y * z;
    C[8] += z * z;
  }
  C[3] = C[1];
  C[6] = C[2];
  C[7] = C[5];
  const axes = eigenVectors3(C);
  const zv = axes[0].v.normalize();
  let yv = axes[1].v;
  yv.sub(zv.clone().multiplyScalar(yv.dot(zv)));
  if (yv.lengthSq() < 1e-10) yv = new THREE.Vector3(0, 1, 0).cross(zv);
  yv.normalize();
  const xv = new THREE.Vector3().crossVectors(yv, zv).normalize();
  yv.crossVectors(zv, xv).normalize();
  applyGunMatrix(g, new THREE.Matrix4().makeBasis(xv, yv, zv).invert());
}

function orientGun(g) {
  pcaAlignGun(g);
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

function findFrontSight(g, box) {
  const span = Math.max(0.04, box.max.z - box.min.z);
  const zB = box.min.z + span * 0.2;
  return (
    sampleGunPoint(g, (p) => (p.z > zB ? -1e9 : p.y * 8 - Math.abs(p.x) * 5)) ||
    new THREE.Vector3(0, box.max.y * 0.92, box.min.z + span * 0.08)
  );
}

function findRearSight(g, box) {
  const span = Math.max(0.04, box.max.z - box.min.z);
  const zA = -span * 0.22;
  const zB = span * 0.1;
  return (
    sampleGunPoint(g, (p) => (p.z < zA || p.z > zB ? -1e9 : p.y * 8 - Math.abs(p.x) * 5 - Math.abs(p.z) * 0.35)) ||
    new THREE.Vector3(0, box.max.y * 0.95, 0)
  );
}

function computeAdsPose(rear, front) {
  const look = rear.clone();
  look.x *= 0.2;
  look.y -= Math.max(0.007, Math.abs(rear.y - front.y) * 0.22 + 0.008);
  const dir = front.clone().sub(look);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
  else dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 0, -1));
  const rotated = look.clone().applyQuaternion(q);
  const pos = new THREE.Vector3(0, 0, -0.038).sub(rotated);
  return { pos, quat: q, look };
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
  const front = findFrontSight(g, box);
  const rear = findRearSight(g, box);
  const ads = computeAdsPose(rear, front);
  g.userData.grip = new THREE.Vector3(0, 0, 0);
  g.userData.sight = ads.look;
  g.userData.frontSight = front;
  g.userData.adsPos = ads.pos;
  g.userData.adsQuat = ads.quat;
  g.userData.hipPos = new THREE.Vector3(0.22, -0.2, -Math.max(0.4, box.max.z + 0.16));
  g.userData.muzzle = new THREE.Vector3(0, Math.max(0.01, box.max.y * 0.28), box.min.z - 0.012);
  g.userData.weaponId = spec.id;
  g.userData.adsFov = spec.adsFov ?? 50;
  g.frustumCulled = false;
  g.traverse((obj) => {
    obj.frustumCulled = false;
    if (!world && obj.isMesh && /stock/i.test(obj.name || "")) obj.visible = false;
  });
  return g;
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

