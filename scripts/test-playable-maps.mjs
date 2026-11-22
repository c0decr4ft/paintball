import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
globalThis.self = globalThis;
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MAPS = [
  { id: "pvp_map", file: resolve("public/models/pvp_map.glb") },
  { id: "castle_wars", file: resolve("public/models/castle_wars_pavlov_vr.glb") },
];

const FAIL = [];
const PASS = [];
function ok(name, cond, detail = "") {
  if (cond) PASS.push(name);
  else FAIL.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function loadGltf(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolveP, reject) => {
    new GLTFLoader().parse(ab, "", resolveP, reject);
  });
}

function computeMapScale(rawBox) {
  const h = rawBox.max.y - rawBox.min.y;
  const span = Math.max(rawBox.max.x - rawBox.min.x, rawBox.max.z - rawBox.min.z);
  if (h < 1.6 && span < 12) return THREE.MathUtils.clamp(3.2 / Math.max(h, 0.4), 1, 2.4);
  if (h > 48 || span > 280) return THREE.MathUtils.clamp(22 / Math.max(h, span * 0.12), 0.35, 1);
  return 1;
}

async function testMap({ id, file }) {
  const started = performance.now();
  ok(`${id} file exists`, existsSync(file), file);
  const gltf = await loadGltf(file);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(scene);
  const scale = computeMapScale(raw);
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);
  const lifted = new THREE.Box3().setFromObject(scene);
  scene.position.x -= (lifted.min.x + lifted.max.x) * 0.5;
  scene.position.y -= lifted.min.y;
  scene.position.z -= (lifted.min.z + lifted.max.z) * 0.5;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());

  ok(`${id} sits on y=0`, Math.abs(box.min.y) < 0.08, `minY=${box.min.y.toFixed(3)}`);
  ok(`${id} scale is not exploded/squashed`, scale >= 0.35 && scale <= 2.4, `scale=${scale}`);
  ok(`${id} footprint is playable`, size.x > 20 && size.z > 12 && size.x < 220, `size=${size.x.toFixed(1)}x${size.z.toFixed(1)}`);

  const meshes = [];
  let basicOrStd = 0;
  let triangles = 0;
  let collisionMeshes = 0;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o);
    const posN = o.geometry?.attributes?.position?.count || 0;
    triangles += o.geometry?.index ? o.geometry.index.count / 3 : posN / 3;
    const mb = new THREE.Box3().setFromObject(o);
    const ms = mb.getSize(new THREE.Vector3());
    const shell = ms.x > size.x * 0.82 && ms.z > size.z * 0.82 && ms.y > 3.2;
    if (ms.y >= 0.62 && (!shell || id === "pvp_map")) collisionMeshes++;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (m?.isMeshBasicMaterial || m?.isMeshStandardMaterial || m?.isMeshLambertMaterial) basicOrStd += 1;
    }
  });
  ok(`${id} has solid meshes`, meshes.length >= 8, `n=${meshes.length}`);
  ok(`${id} has collision coverage`, collisionMeshes >= 2, `collisionMeshes=${collisionMeshes}`);

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();

  function floorsAt(x, z) {
    ray.set(new THREE.Vector3(x, box.max.y + 2.4, z), down);
    ray.near = 0.02;
    ray.far = box.max.y + 8;
    const hits = ray.intersectObjects(meshes, false);
    const ys = [];
    for (const h of hits) {
      if (h.face) n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      else n.set(0, 1, 0);
      if (n.y < 0.42) continue;
      if (ys.some((v) => Math.abs(v - h.point.y) < 0.4)) continue;
      ray.set(new THREE.Vector3(x, h.point.y + 0.18, z), up);
      ray.far = 5.2;
      const ceil = ray.intersectObjects(meshes, false)[0];
      const room = ceil ? ceil.point.y - h.point.y : 8;
      if (room < 2.05) continue;
      ys.push(h.point.y);
    }
    return ys;
  }

  const TARGET = id === "castle_wars" ? 240 : 380;
  const spanX = box.max.x - box.min.x;
  const spanZ = box.max.z - box.min.z;
  let stepX = 2.5;
  let stepZ = 2.5;
  const guess = (spanX / stepX) * (spanZ / stepZ);
  if (guess > TARGET) {
    const grow = Math.sqrt(guess / TARGET);
    stepX *= grow;
    stepZ *= grow;
  }
  stepX = Math.max(2.2, Math.min(8, stepX));
  stepZ = Math.max(2.2, Math.min(8, stepZ));

  const waypoints = [];
  for (let x = box.min.x + 2; x <= box.max.x - 2; x += stepX) {
    for (let z = box.min.z + 2; z <= box.max.z - 2; z += stepZ) {
      for (const y of floorsAt(x, z)) waypoints.push(new THREE.Vector3(x, y, z));
    }
  }
  ok(`${id} waypoint density capped`, waypoints.length <= 900, `n=${waypoints.length} step=${stepX.toFixed(2)}`);
  ok(`${id} enough walkable cells`, waypoints.length >= 24, `n=${waypoints.length}`);

  const yBuckets = new Map();
  for (const w of waypoints) {
    const k = Math.round(w.y * 2) / 2;
    yBuckets.set(k, (yBuckets.get(k) || 0) + 1);
  }
  const roof = box.max.y;
  const scored = [...yBuckets.keys()].map((y) => ({
    y,
    n: waypoints.filter((w) => Math.abs(w.y - y) < 1.4).length,
    roof: y > roof - 1.85,
  }));
  scored.sort((a, b) => b.n - a.n);
  const ground = scored.find((s) => !s.roof && s.n >= 16) || scored[0];
  const mainY = ground?.y ?? waypoints[0].y;
  const main = waypoints.filter((w) => Math.abs(w.y - mainY) < 1.4);
  ok(`${id} spawn floor is not the roof deck`, mainY < roof - 1.4 || scored[0].n < 16, `mainY=${mainY.toFixed(2)} roof=${roof.toFixed(2)}`);

  const linkR = Math.max(3.15, Math.hypot(stepX, stepZ) * 1.08);
  const LINK_R2 = linkR * linkR;
  function linkCount(w, pool) {
    let c = 0;
    for (const o of pool) {
      if (o === w) continue;
      const dx = o.x - w.x;
      const dz = o.z - w.z;
      if (dx * dx + dz * dz <= LINK_R2 && Math.abs(o.y - w.y) < 1.2) c += 1;
    }
    return c;
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
        for (const nb of adj[cur]) {
          if (seen[nb]) continue;
          seen[nb] = 1;
          stack.push(nb);
        }
      }
      if (comp.length > bestN) {
        bestN = comp.length;
        best = comp;
      }
    }
    return best;
  }

  function standing(w) {
    ray.set(new THREE.Vector3(w.x, w.y + 0.2, w.z), down);
    ray.far = 1.2;
    const floor = ray.intersectObjects(meshes, false).find((h) => {
      if (!h.face) return false;
      n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      return n.y > 0.4;
    });
    ray.set(new THREE.Vector3(w.x, w.y + 0.16, w.z), up);
    ray.far = 2.0;
    const bonk = ray.intersectObjects(meshes, false)[0];
    const room = bonk ? bonk.point.y - w.y : 8;
    return Boolean(floor) && room >= 2.0;
  }

  const linked = largestFloor(main.length > 10 ? main : waypoints);
  const spawnPool = linked.length > 10 ? linked : main;
  const neighbors = spawnPool.filter((w) => linkCount(w, spawnPool) >= 2 && standing(w));
  const vs = neighbors.length >= 8 ? neighbors : spawnPool;
  ok(`${id} standable neighbor cells`, vs.length >= 4, `n=${vs.length}`);

  const alongX = size.x >= size.z;
  const anchors = id === "pvp_map"
    ? { blue: new THREE.Vector3(-22.65, 3.18, -7.99), red: new THREE.Vector3(16.16, 2.47, 22.5) }
    : { blue: new THREE.Vector3(-58.9, 5, -6.61), red: new THREE.Vector3(58.82, 5, 8.58) };
  function pickSpawn(scoreFn) {
    let best = vs[0];
    let bestS = -Infinity;
    for (const w of vs) {
      if (!standing(w)) continue;
      const s = scoreFn(w) + linkCount(w, spawnPool) * 2.8;
      if (s > bestS) {
        bestS = s;
        best = w;
      }
    }
    return best;
  }
  const spawnBlue = pickSpawn((w) => -w.distanceToSquared(anchors.blue) * 4);
  let spawnRed = pickSpawn((w) => -w.distanceToSquared(anchors.red) * 4);
  const span = Math.hypot(size.x, size.z);
  if (spawnBlue.distanceTo(spawnRed) < Math.max(14, span * 0.28)) {
    spawnRed = pickSpawn((w) => w.distanceToSquared(spawnBlue));
  }
  const dist = spawnBlue.distanceTo(spawnRed);
  ok(`${id} team spawns separated`, dist > 12, `dist=${dist.toFixed(1)}`);
  ok(`${id} blue standable`, standing(spawnBlue));
  ok(`${id} red standable`, standing(spawnRed));
  ok(`${id} spawns share floor band`, Math.abs(spawnBlue.y - spawnRed.y) < 2.2, `by=${spawnBlue.y.toFixed(2)} ry=${spawnRed.y.toFixed(2)}`);
  ok(`${id} spawn coordinates finite`, [...spawnBlue.toArray(), ...spawnRed.toArray()].every(Number.isFinite));

  function connected(a, b) {
    const nearest = (p) => {
      let bi = -1;
      let bd = Infinity;
      for (let i = 0; i < spawnPool.length; i++) {
        const d = spawnPool[i].distanceToSquared(p);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return bi;
    };
    const start = nearest(a);
    const goal = nearest(b);
    const seen = new Uint8Array(spawnPool.length);
    const queue = [start];
    seen[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      if (cur === goal) return true;
      for (let j = 0; j < spawnPool.length; j++) {
        if (seen[j] || j === cur) continue;
        const dx = spawnPool[cur].x - spawnPool[j].x;
        const dz = spawnPool[cur].z - spawnPool[j].z;
        if (dx * dx + dz * dz > LINK_R2 || Math.abs(spawnPool[cur].y - spawnPool[j].y) >= 1.2) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    return false;
  }
  ok(`${id} opposing sides connected`, connected(spawnBlue, spawnRed));

  const elapsedMs = performance.now() - started;

  return {
    id,
    size: size.toArray().map((v) => +v.toFixed(2)),
    scale,
    waypoints: waypoints.length,
    mainY: +mainY.toFixed(2),
    spawnPool: spawnPool.length,
    spawnBlue: spawnBlue.toArray().map((v) => +v.toFixed(2)),
    spawnRed: spawnRed.toArray().map((v) => +v.toFixed(2)),
    spawnDist: +dist.toFixed(2),
    meshes: meshes.length,
    triangles: Math.round(triangles),
    collisionMeshes,
    setupMs: +elapsedMs.toFixed(1),
    camFar: Math.max(160, Math.min(420, span * 1.85 + box.max.y * 3)),
  };
}

const arenaSrc = readFileSync(resolve("src/arena.js"), "utf8");
ok("50/50 uses Math.random() < 0.5", /Math\.random\(\)\s*<\s*0\.5/.test(arenaSrc));
ok("pvp_map.glb is a playable map", arenaSrc.includes("pvp_map.glb"));
ok("castle_wars_pavlov_vr.glb is a playable map", arenaSrc.includes("castle_wars_pavlov_vr.glb"));
ok("does not load cs_office as playable", !/models\/cs_office\.glb/.test(arenaSrc));
ok("does not restyle with village plaster on playable maps", !/styleVillageMap\(map/.test(arenaSrc));
ok("both teams use existing Phoenix skeleton", arenaSrc.includes("const isPhoenix = Boolean(phoenixTemplate)"));
ok("third-person gun remains original blaster", /gun\s*=\s*createMarker\(true\)/.test(arenaSrc));
ok("world blaster is body-scaled", /world \? 0\.54 \* BODY_K/.test(arenaSrc));

const gameSrc = readFileSync(resolve("src/game.js"), "utf8");
ok("start/reset rebuilds a random map", gameSrc.includes("pickPlayableMapId"));
ok("online reset prefers server map id", gameSrc.includes("_netMapId") && gameSrc.includes("this.netOnline"));
ok("unstuck prefers nearest waypoint", gameSrc.includes("nearest") && gameSrc.includes("spawnPool"));
ok("FPS camera disables body layer 2", gameSrc.includes("layers.disable(2)"));
ok("fire rate remains 0.11", /const FIRE_RATE = 0\.11;/.test(gameSrc));
ok("ammo remains 200", /const AMMO_MAX = 200;/.test(gameSrc));
ok("movement uses swept collision substeps", gameSrc.includes("moveWithCollision") && gameSrc.includes("radius * 0.48"));
ok("castle bot visibility work is staggered", gameSrc.includes('this.arena?.mapId === "castle_wars"') && gameSrc.includes("visionIn"));

const htmlSrc = readFileSync(resolve("index.html"), "utf8");
ok("visible title is PAIN - FIELD", htmlSrc.includes("<h1>PAIN - FIELD</h1>"));
ok("HTML title is PAIN - FIELD", htmlSrc.includes("<title>PAIN - FIELD</title>"));

const serverSrc = readFileSync(resolve("server/index.mjs"), "utf8");
ok("server picks playable map 50/50", serverSrc.includes("pickPlayableMapId") && /Math\.random\(\)\s*<\s*0\.5/.test(serverSrc));
ok("server begin payload includes mapId", /mapId:\s*ensureRoomMap\(room\)/.test(serverSrc));
ok("joiners reuse room mapId", serverSrc.includes("ensureRoomMap"));

const netSrc = readFileSync(resolve("src/net.js"), "utf8");
ok("net stores begin mapId", /if \(msg\.mapId\) this\.mapId = msg\.mapId/.test(netSrc));

const summaries = [];
for (const m of MAPS) summaries.push(await testMap(m));

console.log(`PASS ${PASS.length}  FAIL ${FAIL.length}`);
for (const n of PASS) console.log("  ok ", n);
for (const n of FAIL) console.log("  FAIL", n);
console.log(JSON.stringify(summaries, null, 2));
if (FAIL.length) process.exit(1);
