import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { cautionTexture, crateTexture, warehouseFloorTexture, warehouseWallTexture } from "./textures.js";

export const TEAM = {
  blue: 0x008cff,
  red: 0xff1a12,
};

const MAP_URL = `${import.meta.env.BASE_URL}models/pvp_map.glb`;
const COMMANDO_URL = `${import.meta.env.BASE_URL}models/clone_commando.glb`;
const PHOENIX_URL = `${import.meta.env.BASE_URL}models/phoenix.glb`;
const BLASTER_URL = `${import.meta.env.BASE_URL}models/blaster.glb`;
const BOMB_URL = `${import.meta.env.BASE_URL}models/cs_go_bomb.glb`;

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

export async function loadGameAssets(onProgress) {
  if (mapTemplate && commandoTemplate && phoenixTemplate && blasterTemplate && bombTemplate) return mapTemplate;
  const [mapGltf, commandoGltf, phoenixGltf, blasterGltf, bombGltf] = await Promise.all([
    mapTemplate ? Promise.resolve(null) : loadGltf(MAP_URL),
    commandoTemplate ? Promise.resolve(null) : loadGltf(COMMANDO_URL),
    phoenixTemplate ? Promise.resolve(null) : loadGltf(PHOENIX_URL),
    blasterTemplate ? Promise.resolve(null) : loadGltf(BLASTER_URL),
    bombTemplate ? Promise.resolve(null) : loadGltf(BOMB_URL),
  ]);
  onProgress?.(1, "assets");

  if (mapGltf) {
    const root = mapGltf.scene;
    const styled = new Set();
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        fixTextureColorSpace(m);
        m.envMapIntensity = 0;
        m.fog = true;
        if (styled.has(m.uuid)) continue;
        styled.add(m.uuid);
        const name = (m.name || "").toLowerCase();
        if (name.includes("wall_text")) {
          m.map?.dispose?.();
          m.map = warehouseWallTexture();
          m.color.set(0xc4a882);
          m.roughness = 0.94;
          m.metalness = 0.02;
          m.needsUpdate = true;
        } else if (name.includes("floor_text")) {
          m.map?.dispose?.();
          m.map = warehouseFloorTexture();
          m.color.set(0xc8b089);
          m.roughness = 0.92;
          m.metalness = 0.03;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        } else if (name === "material.016") {
          m.map?.dispose?.();
          m.map = crateTexture();
          m.color.set(0x9a7048);
          m.roughness = 0.92;
          m.metalness = 0.02;
          m.needsUpdate = true;
        }
      }
    });
    mapTemplate = root;
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

  return mapTemplate;
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

/** Red canisters only (`test.001`). Wooden crates (`Material.016`) stay inert scenery. */
function isExplosiveMesh(mesh) {
  if (!mesh?.isMesh) return false;
  return meshMatName(mesh) === "test.001";
}

function batchMapMeshes(map) {
  const CELL = 10;
  const groups = new Map();
  const originals = [];
  map.traverse((mesh) => {
    if (!mesh.isMesh) return;
    originals.push(mesh);
    mesh.updateWorldMatrix(true, false);
    mesh.matrixAutoUpdate = false;
  });
  for (const mesh of originals) {
    if (isExplosiveMesh(mesh)) continue;
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
        for (const mesh of items) {
          mesh.visible = false;
          const src = mesh.material;
          if (!src) continue;
          const twoSided = (m) => {
            const c = m.clone();
            c.side = THREE.DoubleSide;
            return c;
          };
          mesh.material = Array.isArray(src) ? src.map(twoSided) : twoSided(src);
        }
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
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.08,
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

/** Fit the warehouse to a 1.82 m human (doors/ceilings feel walkable, not stadium-sized). */
const MAP_SCALE = 0.62;

export function buildArena(scene) {
  if (!mapTemplate) throw new Error("Call loadGameAssets() before buildArena()");

  scene.background = new THREE.Color(0xb8c4a0);
  scene.fog = new THREE.Fog(0xc5b898, 38, 96);
  scene.add(makeSky());

  scene.add(new THREE.HemisphereLight(0xe8dcc0, 0x8a7a58, 1.28));
  const sun = new THREE.DirectionalLight(0xffe6c4, 1.38);
  sun.position.set(14, 32, 12);
  sun.castShadow = false;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc8b898, 0.48);
  fill.position.set(-16, 12, -12);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xd4c8b0, 0.58));

  const map = mapTemplate.clone(true);
  map.scale.setScalar(MAP_SCALE);
  map.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(map);
  const center = box.getCenter(new THREE.Vector3());
  map.position.x -= center.x;
  map.position.z -= center.z;
  map.updateMatrixWorld(true);
  scene.add(map);

  const walkMeshes = [];
  const wallMeshes = [];
  const floorMeshes = [];
  map.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.updateWorldMatrix(true, false);
    obj.userData.worldBox = new THREE.Box3().setFromObject(obj);
    walkMeshes.push(obj);
    const name = (obj.name || "").toLowerCase();
    if (/floor/.test(name)) floorMeshes.push(obj);
    else wallMeshes.push(obj);
  });

  const batched = batchMapMeshes(map);
  if (batched) scene.add(batched);

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

  function groundHit(x, z, yFrom, maxY) {
    const objs = walkObjs(x, z);
    if (!objs.length) return null;
    _from.set(x, yFrom, z);
    ray.set(_from, down);
    ray.near = 0.01;
    ray.far = Math.max(3, yFrom + 6);
    const hits = ray.intersectObjects(objs, false);
    let best = null;
    for (const h of hits) {
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

  function ceilingHit(x, z, yFrom, maxDist = 2.8) {
    const objs = walkObjs(x, z);
    if (!objs.length) return null;
    _from.set(x, yFrom, z);
    ray.set(_from, up);
    ray.near = 0.02;
    ray.far = Math.max(0.2, maxDist);
    const hits = ray.intersectObjects(objs, false);
    for (const h of hits) {
      if (h.object.userData.exploded) continue;
      return h;
    }
    return null;
  }

  const groundCache = new Map();
  const ceilCache = new Map();
  function sampleGround(x, z, yHint) {
    const y = Number.isFinite(yHint) ? yHint : 0;
    let from = y + STEP;
    if (y > -0.4) {
      const overhead = ceilingHit(x, z, y + 0.16, STEP + 2.4);
      if (overhead) from = Math.max(y + 0.08, Math.min(from, overhead.point.y - 0.06));
    }
    const hit = groundHit(x, z, from, from);
    return hit ? hit.point.y : null;
  }
  function groundAt(x, z, yHint = 0, live = false) {
    if (live) return sampleGround(x, z, yHint);
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
   * Exterior rooftop / overpass top. Shared by player roof-kill and bot spawn.
   * Tunnel interiors stay false: they have a ceiling, and feet sit on the lower slab.
   */
  const roofCache = new Map();
  const ROOF_CLEAR = 1.72;
  function isRooftop(x, z, feetY) {
    const y = Number.isFinite(feetY) ? feetY : 0;
    const k = `${(x * 4) | 0}:${(z * 4) | 0}:${(y * 4) | 0}`;
    if (roofCache.has(k)) return roofCache.get(k);
    const hit = groundHit(x, z, y + STEP, y + STEP);
    if (!hit || Math.abs(hit.point.y - y) > 0.32) {
      roofCache.set(k, false);
      return false;
    }
    const mesh = hit.object;
    if (isExplosiveMesh(mesh) || /floor/.test(mesh.name || "")) {
      roofCache.set(k, false);
      return false;
    }
    const gy = hit.point.y;
    const ceil = ceilingAt(x, z, gy + 0.28, 2.85);
    if (ceil != null && ceil - gy < 2.85) {
      roofCache.set(k, false);
      return false;
    }
    const under = groundHit(x, z, gy - 0.28, gy - 0.28);
    if (under && gy - under.point.y >= ROOF_CLEAR) {
      roofCache.set(k, true);
      return true;
    }
    const wb = mesh.userData.worldBox;
    const meshBot = wb ? wb.min.y : gy;
    const lowA = groundAt(x, z, -1.2);
    const lowB = groundAt(x, z, 0.12);
    const low = lowA != null && lowB != null ? Math.min(lowA, lowB) : (lowA ?? lowB);
    if (low != null && gy - low >= ROOF_CLEAR && meshBot - low >= 1.32) {
      roofCache.set(k, true);
      return true;
    }
    let local = gy;
    for (const r of [2.6, 5.2]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ny = groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r, gy);
        if (ny != null && ny < local) local = ny;
      }
    }
    const roof = gy - local > 2.2;
    roofCache.set(k, roof);
    return roof;
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

  function pickSpawn(scoreFn) {
    let best = waypoints[0] || new THREE.Vector3(0, 0, 0);
    let bestS = -Infinity;
    for (const w of waypoints) {
      if (isRoofAt(w.x, w.z, w.y)) continue;
      const s = scoreFn(w);
      if (s > bestS) {
        bestS = s;
        best = w;
      }
    }
    return best.clone();
  }

  function ensureGroundPad(pos) {
    if (!isRoofAt(pos.x, pos.z, pos.y)) return pos;
    const dropped = dropOffRoof(pos.x, pos.z, pos.y);
    if (dropped != null) {
      pos.y = dropped;
      if (!isRoofAt(pos.x, pos.z, pos.y)) return pos;
    }
    let best = pos;
    let bestD = Infinity;
    for (const w of waypoints) {
      if (isRoofAt(w.x, w.z, w.y)) continue;
      const d = pos.distanceToSquared(w);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best.clone();
  }

  const spawnBlue = ensureGroundPad(pickSpawn((w) => -w.x + w.z));
  const spawnRed = ensureGroundPad(pickSpawn((w) => w.x - w.z));

  const caution = cautionTexture();
  function spawnPad(pos, color) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 24),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        transparent: true,
        opacity: 0.38,
        map: caution,
        depthWrite: false,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(pos.x, pos.y + 0.04, pos.z);
    scene.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.045, 8, 24),
      mat(color, { roughness: 0.4, metalness: 0.2 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.05, pos.z);
    scene.add(ring);
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
      new THREE.CircleGeometry(1.72, 28),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.52,
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
      mat(color, { roughness: 0.35, metalness: 0.28, emissive: color, emissiveIntensity: 0.55 })
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
    scene.add(group);
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

  function lamp(pos) {
    const light = new THREE.PointLight(0xffe2b8, 1.85, 12);
    light.position.set(pos.x, Math.min(pos.y + 2.6, roof - 0.4), pos.z);
    scene.add(light);
  }
  lamp(spawnBlue);
  lamp(spawnRed);
  const mid = new THREE.PointLight(0xffe8c4, 1.45, 16);
  mid.position.set(0, Math.max(2.4, roof - 0.45), 0);
  scene.add(mid);
  const hang = [
    [worldBox.min.x + 4, worldBox.min.z + 4],
    [worldBox.max.x - 4, worldBox.max.z - 4],
    [worldBox.min.x + 4, worldBox.max.z - 4],
    [worldBox.max.x - 4, worldBox.min.z + 4],
  ];
  for (const [x, z] of hang) {
    const gy = groundAt(x, z, 4) ?? 0;
    const light = new THREE.PointLight(0xffe0b0, 1.15, 12);
    light.position.set(x, Math.min(gy + 2.8, roof - 0.35), z);
    scene.add(light);
  }

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

function cheapMat(mat) {
  if (!mat) return mat;
  const s = new THREE.MeshStandardMaterial({
    color: mat.color ? mat.color.clone() : 0x888888,
    map: mat.map || null,
    roughness: mat.roughness ?? 0.55,
    metalness: Math.min(mat.metalness ?? 0.15, 0.45),
    emissive: mat.emissive ? mat.emissive.clone() : 0x000000,
    emissiveMap: mat.emissiveMap || null,
    emissiveIntensity: mat.emissiveIntensity ?? 1,
    normalMap: mat.normalMap || null,
    aoMap: mat.aoMap || null,
    transparent: Boolean(mat.transparent || (mat.opacity != null && mat.opacity < 1)),
    opacity: mat.opacity ?? 1,
    side: mat.side ?? THREE.FrontSide,
    depthWrite: mat.depthWrite !== false,
    envMapIntensity: 0,
  });
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
  hipY: 0.68,
  clipY: CLIP_Y,
  kneeY: 0.4,
};

function commandoHideArmGLSL() {
  return `
            vHideArm = 0.0;
            if (abs(position.x) > 0.30 * bk && position.y > 0.86 * bk && position.y < 1.48 * bk) {
              vHideArm = 1.0;
            }
`;
}

function attachBodyShaders(root, profile, clipY = 8, hideArms = true) {
  const uWalk = { value: 0 };
  const uPhase = { value: 0 };
  const uRun = { value: 0 };
  const uHipY = { value: profile.hipY };
  const uClipY = { value: clipY };
  const uCrouch = { value: 0 };
  const uLookDown = { value: 0 };
  const bk = BODY_K.toFixed(6);
  const ky = profile.kneeY.toFixed(5);
  const armGLSL = hideArms ? commandoHideArmGLSL() : "            vHideArm = 0.0;\n";
  root.traverse((obj) => {
    if (!obj.isMesh) return;
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
          "uniform float uWalk;\nuniform float uPhase;\nuniform float uRun;\nuniform float uHipY;\nuniform float uClipY;\nuniform float uCrouch;\nuniform float uLookDown;\nvarying float vBodyY;\nvarying float vHideArm;\n" +
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

            transformed.y += loc * mix(0.01, 0.04, run) * bk * abs(sin(uPhase));
            transformed.y += run * 0.036 * bk * max(0.0, sin(uPhase * 2.0));
            transformed.x += sin(uPhase) * mix(0.014, 0.036, run) * bk * loc * smoothstep(0.28 * bk, 1.05 * bk, position.y);
            transformed.z += mix(0.02, 0.08, run) * bk * loc * smoothstep(uHipY, 1.42 * bk, position.y);

            if (position.y > uHipY + 0.04 * bk && abs(position.x) < 0.22 * bk) {
              float twist = -sin(uPhase) * mix(0.06, 0.15, run) * loc;
              float ct = cos(twist);
              float st = sin(twist);
              transformed = vec3(transformed.x * ct + transformed.z * st, transformed.y, -transformed.x * st + transformed.z * ct);
            }

            float legMask = smoothstep(0.045 * bk, 0.13 * bk, abs(position.x));
            if (position.y < uHipY && legMask > 0.001) {
              float side = position.x >= 0.0 ? -1.0 : 1.0;
              float gait = sin(uPhase) * side;
              float fwd = max(0.0, -gait);
              float back = max(0.0, gait);
              float swing = mix(0.32, 0.56, run) * loc;
              float ang = gait * swing + uCrouch * 0.72;
              float hipY = uHipY - uCrouch * 0.52 * bk * squat;
              vec3 p = transformed;
              p.y -= hipY;
              float c = cos(ang);
              float s = sin(ang);
              p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);

              float kneeH = ${ky} - uCrouch * 0.22 * bk;
              if (position.y < kneeH) {
                float flex = fwd * mix(0.32, 0.62, run) * loc;
                flex += back * mix(0.08, 0.16, run) * loc;
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

              p.y += fwd * mix(0.02, 0.07, run) * bk * loc * (1.0 - smoothstep(0.04 * bk, 0.26 * bk, position.y));
              p.y -= back * mix(0.0, 0.006, run) * bk * loc;
              transformed = mix(transformed, vec3(p.x, p.y + hipY, p.z), legMask);
            }
${armGLSL}
            vBodyY = position.y;
            `
          );
        shader.fragmentShader =
          "uniform float uClipY;\nvarying float vBodyY;\nvarying float vHideArm;\n" +
          shader.fragmentShader.replace(
            "void main() {",
            "void main() {\n  if (vHideArm > 0.5) discard;\n  if (vBodyY > uClipY) discard;"
          );
      };
      m.customProgramCacheKey = () =>
        `${profile.id}-${profile.hipY.toFixed(2)}-${clipY.toFixed(2)}-${hideArms ? "hide" : "show"}-arms-gait3`;
      m.needsUpdate = true;
    }
  });
  return { uWalk, uPhase, uRun, uHipY, uClipY, uCrouch, uLookDown };
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
  commandoBaked = baked;
  return baked;
}

const PHOENIX_BONES = {
  pelvis: "pelvis_01",
  upLegR: "leg_upper_R_02",
  loLegR: "leg_lower_R_05",
  ankleR: "ankle_R_06",
  upLegL: "leg_upper_L_09",
  loLegL: "leg_lower_L_012",
  ankleL: "ankle_L_013",
  spine2: "spine_2_018",
  upArmR: "arm_upper_R_022",
  loArmR: "arm_lower_R_025",
  handR: "hand_R_028",
  upArmL: "arm_upper_L_052",
  loArmL: "arm_lower_L_055",
  handL: "hand_L_058",
};

const _axis = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _left = new THREE.Vector3();
const _right = new THREE.Vector3();

function collectPhoenixBones(root) {
  const found = {};
  const names = new Set(Object.values(PHOENIX_BONES));
  root.traverse((o) => {
    if (!o.isBone || !names.has(o.name)) return;
    o.userData.restE = o.rotation.clone();
    for (const [key, name] of Object.entries(PHOENIX_BONES)) {
      if (name === o.name) found[key] = o;
    }
  });
  return found;
}

function restThen(bone, x, y, z) {
  if (!bone?.userData.restE) return;
  const e = bone.userData.restE;
  bone.rotation.set(e.x + x, e.y + y, e.z + z, e.order);
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
    o.frustumCulled = true;
    if (o.isSkinnedMesh) {
      o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3.2);
    }
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

function posePhoenix(rig, amt, phase, crouch, run, raise = 1, plant = 0) {
  const body = rig.userData.body;
  const b = body?.userData?.bones;
  if (!b?.upArmR) return;
  const plantK = THREE.MathUtils.clamp(plant, 0, 1);
  const loc = THREE.MathUtils.clamp(amt, 0, 1) * (1 - plantK * 0.9);
  const runK = THREE.MathUtils.clamp(run, 0, 1) * loc;
  const up = THREE.MathUtils.clamp(raise, 0, 1) * (1 - plantK * 0.82);
  const squat = THREE.MathUtils.clamp(crouch, 0, 1) + plantK * 0.82;
  restThen(b.upArmR, plantK * 0.78, THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.16, 1.12, up), 0.58, plantK), plantK * 0.18);
  restThen(b.loArmR, plantK * 0.12, THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.22, 1.42, up), 1.08, plantK), 0);
  restThen(b.handR, plantK * 0.2, THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.04, 0.15, up), 0.22, plantK), 0);
  restThen(b.upArmL, plantK * 0.78, THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.16, -1.12, up), -0.58, plantK), -plantK * 0.18);
  restThen(b.loArmL, plantK * 0.12, THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.22, -1.42, up), -1.08, plantK), 0);
  restThen(b.handL, plantK * 0.2, THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.04, -0.15, up), -0.22, plantK), 0);
  restThen(b.upLegR, plantK * 0.28, 0, 0);
  restThen(b.loLegR, 0, squat * 0.55, 0);
  restThen(b.upLegL, plantK * 0.28, 0, 0);
  restThen(b.loLegL, 0, squat * 0.55, 0);
  restThen(b.pelvis, plantK * 0.48, 0, 0);
  restThen(b.spine2, plantK * 0.42, 0, 0);
  restThen(b.ankleR, 0, plantK * 0.12, 0);
  restThen(b.ankleL, 0, plantK * 0.12, 0);
  body.updateWorldMatrix(true, true);
  _axis.set(0, 0, 1).transformDirection(body.matrixWorld);
  const swing = THREE.MathUtils.lerp(0.36, 0.56, runK) * loc;
  const flex = THREE.MathUtils.lerp(0.26, 0.48, runK) * loc;
  const gait = Math.sin(phase);
  b.upLegR.rotateOnWorldAxis(_axis, gait * swing);
  b.upLegL.rotateOnWorldAxis(_axis, -gait * swing);
  if (b.loLegR) b.loLegR.rotateY(Math.max(0, gait) * flex);
  if (b.loLegL) b.loLegL.rotateY(Math.max(0, -gait) * flex);
  if (b.spine2) b.spine2.rotateY(-gait * 0.09 * loc);
  body.position.y = -squat * 0.32 - plantK * 0.08 + loc * 0.028 * Math.abs(Math.sin(phase));
  body.userData.skeleton?.update();
  const gun = rig.userData.gun;
  if (gun && b.handR && b.handL) {
    b.handR.getWorldPosition(_right);
    b.handL.getWorldPosition(_left);
    _mid.addVectors(_left, _right).multiplyScalar(0.5).lerp(_right, 0.2);
    rig.userData.pose.worldToLocal(_mid);
    gun.position.copy(_mid);
    gun.rotation.set(THREE.MathUtils.lerp(0.78, 0.12, up) + plantK * 0.55, 0.04, 0.05);
    gun.visible = plantK < 0.92;
  }
}

function stubWalkUniforms() {
  return {
    uWalk: { value: 0 },
    uPhase: { value: 0 },
    uRun: { value: 0 },
    uCrouch: { value: 0 },
    uClipY: { value: 8 },
    uLookDown: { value: 0 },
  };
}

export function createFighter(team, isPlayerView = false) {
  const teamId = team === TEAM.red || team === "red" ? "red" : "blue";
  const teamColor = TEAM[teamId];
  const isPhoenix = teamId === "red";
  if (isPhoenix && !phoenixTemplate) throw new Error("Call loadGameAssets() before createFighter()");
  if (!isPhoenix && !commandoTemplate) throw new Error("Call loadGameAssets() before createFighter()");
  const profile = isPhoenix ? PHOENIX_GAIT : COMMANDO_GAIT;
  const g = new THREE.Group();
  const body = isPhoenix ? createPhoenixRig() : bakeCommando().clone(true);
  cloneMaterials(body);
  if (!isPhoenix) applyTeamLights(body, teamColor, false);
  const walkUniforms = isPhoenix ? stubWalkUniforms() : attachBodyShaders(body, profile, 8, !isPlayerView);
  if (isPlayerView) body.visible = false;
  const pose = new THREE.Group();
  let gun = null;
  if (!isPlayerView) {
    gun = createMarker(true, { hands: !isPhoenix });
    gun.position.set(0.1 * BODY_K, 1.02 * BODY_K, -0.3 * BODY_K);
    gun.rotation.set(0.1, 0.05, 0.04);
    pose.add(gun);
  }
  pose.add(body);
  g.add(pose);
  body.rotation.y = Math.PI;
  body.position.z = -0.04;
  pose.rotation.x = -0.03;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46 * BODY_K, 24),
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
    poseSkeleton: isPhoenix ? (amt, phase, crouch, run, raise, plant) => posePhoenix(g, amt, phase, crouch, run, raise, plant) : null,
  };
  if (isPhoenix) posePhoenix(g, 0, 0, 0, 0, 0);
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
  bomb.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bomb);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 0.05);
  bomb.scale.setScalar(0.42 / longest);
  bomb.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(bomb);
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

function armorMat(color, roughness = 0.55, metalness = 0.22) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0 });
}

function limb(radius, len, mat) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 3, 8), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function attachHands(holder, world) {
  const plate = armorMat(0xcfc8bc, 0.58, 0.2);
  const dark = armorMat(0x2a3038, 0.46, 0.32);
  const glove = armorMat(0x161a20, 0.76, 0.05);
  const right = new THREE.Group();
  const left = new THREE.Group();

  if (world) {
    const s = 0.88 * BODY_K;
    const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.048, 0.09), glove);
    rHand.position.set(0.042, -0.038, 0.07);
    rHand.rotation.set(0.28, 0.22, 0.68);
    const rGaunt = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.062, 0.09), dark);
    rGaunt.position.set(0.055, -0.018, 0.13);
    rGaunt.rotation.set(0.22, 0.12, 0.55);
    const rFore = limb(0.028, 0.16, plate);
    rFore.position.set(0.09, 0.04, 0.2);
    rFore.rotation.set(-0.62, 0.08, 0.58);
    const rUpper = limb(0.034, 0.2, plate);
    rUpper.position.set(0.12, 0.14, 0.22);
    rUpper.rotation.set(-0.95, 0.08, 0.42);
    right.add(rHand, rGaunt, rFore, rUpper);
    right.scale.setScalar(s);

    const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.044, 0.082), glove);
    lHand.position.set(-0.032, -0.032, -0.16);
    lHand.rotation.set(0.18, -0.2, -0.62);
    const lGaunt = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.056, 0.082), dark);
    lGaunt.position.set(-0.048, -0.012, -0.08);
    lGaunt.rotation.set(0.14, -0.1, -0.5);
    const lFore = limb(0.026, 0.15, plate);
    lFore.position.set(-0.1, 0.045, 0.02);
    lFore.rotation.set(-0.55, -0.1, -0.62);
    const lUpper = limb(0.032, 0.18, plate);
    lUpper.position.set(-0.13, 0.14, 0.12);
    lUpper.rotation.set(-0.88, -0.08, -0.42);
    left.add(lHand, lGaunt, lFore, lUpper);
    left.scale.setScalar(s);
  } else {
    const rFist = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.058, 0.092), glove);
    rFist.position.set(0.046, -0.03, 0.052);
    rFist.rotation.set(0.2, 0.36, 0.7);
    const rKnuck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.038, 0.052), glove);
    rKnuck.position.set(0.04, -0.006, 0.016);
    rKnuck.rotation.set(0.5, 0.2, 0.52);
    const rCuff = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.066, 0.07), dark);
    rCuff.position.set(0.06, -0.058, 0.108);
    rCuff.rotation.set(0.62, 0.1, 0.38);
    const rFore = limb(0.03, 0.15, plate);
    rFore.position.set(0.085, -0.145, 0.175);
    rFore.rotation.set(1.22, 0.05, 0.22);
    right.add(rFist, rKnuck, rCuff, rFore);

    const lFist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.052, 0.085), glove);
    lFist.position.set(-0.026, -0.022, -0.148);
    lFist.rotation.set(0.16, -0.26, -0.58);
    const lKnuck = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.034, 0.048), glove);
    lKnuck.position.set(-0.02, 0.002, -0.178);
    lKnuck.rotation.set(0.42, -0.16, -0.45);
    const lCuff = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.058, 0.062), dark);
    lCuff.position.set(-0.05, -0.048, -0.092);
    lCuff.rotation.set(0.5, -0.1, -0.38);
    const lFore = limb(0.028, 0.14, plate);
    lFore.position.set(-0.085, -0.13, -0.015);
    lFore.rotation.set(1.18, -0.06, -0.28);
    left.add(lFist, lKnuck, lCuff, lFore);
  }

  holder.add(right, left);
  holder.userData.hands = { left, right };
}

export function createMarker(world = false, opts = {}) {
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
  if (opts.hands !== false) attachHands(g, world);
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

