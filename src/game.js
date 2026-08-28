import * as THREE from "three";
import { AudioEngine } from "./audio.js";
import {
  attachWeapon,
  buildArena,
  COMMANDO_H,
  createBomb,
  createChest,
  createFighter,
  createMarker,
  createWeapon,
  DEFAULT_WEAPON,
  getWeapon,
  loadGameAssets,
  MAX_HP,
  pickLootWeapon,
} from "./arena.js";
import { NetClient } from "./net.js";
import { dentTexture, fireTexture, puddleTexture, splatTexture } from "./textures.js";

const AMMO_MAX = 200;
const TO_WIN = 5;
const MATCH_TIME = 180;
const BODY_K = COMMANDO_H / 1.82;
const EYE = 1.62 * BODY_K;
const RADIUS = 0.38 * BODY_K;
const BOT_R = 0.42 * BODY_K;
const BOT_H = 1.7 * BODY_K;
const CHEST_Y = 1.35 * BODY_K;
const GRAVITY = 26;
const BALL_SPEED = 128;
const BALL_GRAVITY = 0;
const FIRE_RATE = 0.11;
const MAX_SPLATS = 96;
const MAX_BALLS = 48;
const MAX_DENTS = 36;
const DENT_LIFE = 10;
const BLOOD = 0xb41c1c;
const EVENT_START = 4;
const EVENT_CAP = 40;
const BLAST_R = 3.4;
const FIRE_LIFE = 3;
const NADE_FUSE = 2.1;
const BOMB_FUSE = 40;

function stepCadence(speed, runAmt = 0) {
  const stride = THREE.MathUtils.lerp(0.52, 0.88, THREE.MathUtils.clamp(runAmt, 0, 1));
  const steps = THREE.MathUtils.clamp(Math.abs(speed) / Math.max(0.4, stride), 2.6, 7.4);
  return steps * Math.PI;
}

const PLANT_T = 3.2;
const DEFUSE_T = 7;
const SITE_R = 2.15;

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = new AudioEngine();
    this.state = "menu";
    this.keys = new Set();
    this.buttons = { fire: false, aim: false };
    this.yaw = 0;
    this.pitch = -0.12;
    this.clock = new THREE.Clock();
    this.locked = false;
    this.mouseDown = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 140);
    this.camera.position.set(18, 14, 32);
    this.scene.environment = null;

    this.splats = [];
    this.dents = [];
    this.balls = [];
    this.bots = [];
    this.walkYaw = 0;
    this.walkPhase = 0;
    this.walkAmt = 0;
    this.runAmt = 0;
    this.muzzleLight = new THREE.PointLight(0xff9a3a, 0, 5);
    this.scene.add(this.muzzleLight);
    this.radarYaw = 0;
    this.radarMap = null;
    this._toastAt = 0;
    this._menuLook = new THREE.Vector3();
    this._menuPos = new THREE.Vector3();
    this._menuSize = new THREE.Vector3();
    this._menuCamReady = false;
    this.menuShot = null;
    this._navRay = new THREE.Raycaster();
    this._colOrigin = new THREE.Vector3();
    this._colDir = new THREE.Vector3();
    this._colN = new THREE.Vector3();
    this._losFrom = new THREE.Vector3();
    this._losTo = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._projScreen = new THREE.Matrix4();
    this._cullSphere = new THREE.Sphere();
    this._camWorld = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();
    this._cullReady = false;
    this._playerAim = new THREE.Vector3();
    this.ready = false;
    this.loading = true;
    this.arena = null;
    this.marker = null;
    this.playerRig = null;
    this.pos = new THREE.Vector3();
    this._safePos = new THREE.Vector3();
    this._hasSafePos = false;
    this._playerPlanted = false;
    this._pendingSideSwap = false;

    this.blueScore = 0;
    this.redScore = 0;
    this.matchTime = MATCH_TIME;
    this._timeUp = false;
    this.roundLock = false;
    this.lives = 1;
    this.hp = MAX_HP;
    this.weaponId = DEFAULT_WEAPON;
    this.chests = [];
    this.elims = 0;
    this.ammo = getWeapon(DEFAULT_WEAPON).ammo;
    this.grenades = 1;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.out = false;
    this.spectateIdx = -1;
    this.spectating = false;
    this.velY = 0;
    this.onGround = true;
    this.roofDying = false;
    this.roofCorpse = false;
    this.roofFall = 0;
    this.roofNoted = false;
    this._toastHold = 1.5;
    this.crouch = 0;
    this.bob = 0;
    this.recoil = 0;
    this.ads = 0;
    this.plantAmt = 0;
    this.spectateSnap = true;
    this.spectateCamPos = new THREE.Vector3();
    this.spectateLook = new THREE.Vector3();
    this._possessBuf = "";
    this._possessAt = 0;
    this.eventMode = false;
    this.bombMode = false;
    this.netOnline = false;
    this._netSearching = false;
    this._netBombSite = "A";
    this._netCarrierId = "";
    this._bombDetonating = false;
    this.playerTeam = "blue";
    this.swarmPeak = 0;
    this.grenades = 1;
    this.fires = [];
    this.thrown = [];
    this.explodeWait = [];
    this._fireTex = null;
    this._introing = false;
    this._introT = 0;

    this.bind();
    this.resize();
    this.previewMap = new URLSearchParams(location.search).has("preview");
    const tag = document.querySelector("#menu .tag");
    this._menuTag = tag ? tag.textContent : "";
    if (tag) tag.textContent = "Loading PVP map…";
    const play = $("play");
    if (play) play.disabled = true;
    const eventBtn = $("event");
    if (eventBtn) eventBtn.disabled = true;
    const bombBtn = $("bomb");
    if (bombBtn) bombBtn.disabled = true;
    const onlineBtn = $("online");
    if (onlineBtn) onlineBtn.disabled = true;
  }

  async init() {
    await loadGameAssets();
    this.arena = buildArena(this.scene);
    this.bakeRadar();
    this.marker = createWeapon(DEFAULT_WEAPON);
    this.camera.add(this.marker);
    this.scene.add(this.camera);
    try {
      this.bombMesh = createBomb();
    } catch {
      this.bombMesh = new THREE.Group();
    }
    this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);
    this.playerRig = createFighter(this.playerTeam, true);
    this.scene.add(this.playerRig);
    this._playerClipY = this.playerRig.userData?.fpsClipY ?? this.playerRig.userData?.walkUniforms?.uClipY?.value ?? 1.12;
    this.pos.copy(this.arena.spawnBlue);
    this._playBg = this.scene.background?.clone?.() || new THREE.Color(0xb8c4a0);
    this._playFog = this.scene.fog;
    this._menuBg = new THREE.Color(0x0c0806);
    this.resetMatch(false);
    this.ready = true;
    this.loading = false;
    const play = $("play");
    if (play) play.disabled = false;
    const eventBtn = $("event");
    if (eventBtn) eventBtn.disabled = false;
    const bombBtn = $("bomb");
    if (bombBtn) bombBtn.disabled = false;
    const onlineBtn = $("online");
    if (onlineBtn) onlineBtn.disabled = false;
    const tag = document.querySelector("#menu .tag");
    if (tag) tag.textContent = "";
    if (this.previewMap) {
      $("menu").hidden = true;
      $("hud").hidden = true;
    }
    this.applyBootParams();
  }

  resetMatch(playing) {
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls.length = 0;
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots.length = 0;
    // Paint clears only on a fresh match — rounds keep every splat
    for (const s of this.splats) {
      this.scene.remove(s);
      s.geometry?.dispose();
      s.material?.dispose();
    }
    this.splats.length = 0;
    for (const d of this.dents) {
      this.scene.remove(d.mesh);
      d.mesh.geometry?.dispose();
      d.mesh.material?.dispose();
    }
    this.dents.length = 0;

    this.blueScore = 0;
    this.redScore = 0;
    this.matchTime = MATCH_TIME;
    this._timeUp = false;
    this.roundLock = false;
    this.lives = 1;
    this.hp = MAX_HP;
    this.elims = 0;
    this.wave = 1;
    this.swarmPeak = 0;
    this.weaponId = DEFAULT_WEAPON;
    this.ammo = getWeapon(DEFAULT_WEAPON).ammo;
    this.grenades = 1;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.hitFlash = 0;
    this.respawnTimer = 0;
    this.out = false;
    this.spectateIdx = -1;
    this.spectating = false;
    this.velY = 0;
    this.onGround = true;
    this.roofDying = false;
    this.roofCorpse = false;
    this.roofFall = 0;
    this.roofNoted = false;
    this.crouch = 0;
    this.bob = 0;
    this.recoil = 0;
    this.ads = 0;
    this.plantAmt = 0;
    this._playerPlanted = false;
    this._pendingSideSwap = false;
    if (this.marker) this.equipWeapon(DEFAULT_WEAPON, true);
    if (playing) this.assignPlayerTeam();
    this.startRound(playing);
    this.syncHud();
    if (playing) {
      if (this.eventMode) this.toast("");
      else if (this.bombMode) {
        this.toast(
          this.playerTeam === "blue"
            ? "Police · Stop the plant / defuse"
            : `Terrorist · Plant ${this.bombSiteId || "A"}`
        );
      }
      else this.toast(this.playerTeam === "blue" ? "Police" : "Terrorist");
    } else this.toast("");
    const feed = $("feed");
    if (feed) feed.innerHTML = "";
  }

  enemyTeam() {
    return this.playerTeam === "blue" ? "red" : "blue";
  }

  playerSpawn() {
    return this.playerTeam === "red" ? this.arena.spawnRed : this.arena.spawnBlue;
  }

  spawnClear(x, z, y) {
    if (y == null || this.onRoof(x, z, y)) return false;
    return !this.blocked(x, z, RADIUS + 0.28, y);
  }

  botStandClear(x, z, y) {
    if (y == null || this.onRoof(x, z, y)) return false;
    if (this.arena.groundAt?.(x, z, y) == null) return false;
    return !this.blocked(x, z, BOT_R + 0.12, y);
  }

  placeAtSpawn() {
    this.pos.copy(this.safePlayerPos(this.playerSpawn()));
    this.velY = 0;
    this.onGround = true;
    this._lastGroundY = this.pos.y;
  }

  safePlayerPos(from = null) {
    const origin = (from || this.playerSpawn()).clone();
    const dropped = this.arena.dropOffRoof?.(origin.x, origin.z, origin.y);
    if (dropped != null) origin.y = dropped;
    else {
      const gy = this.arena.groundAt?.(origin.x, origin.z, origin.y);
      if (gy != null) origin.y = gy;
    }
    this.unstuck(origin);
    if (this.spawnClear(origin.x, origin.z, origin.y)) return origin;

    let best = null;
    let bestD = 1e9;
    for (const w of this.arena.waypoints || []) {
      if (!this.spawnClear(w.x, w.z, w.y)) continue;
      const d = (w.x - origin.x) ** 2 + (w.z - origin.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) {
      origin.copy(best);
      this.unstuck(origin);
    }
    return origin;
  }

  unstuck(pos) {
    const r = RADIUS + 0.14;
    const h = Math.max(this.eyeHeight(), EYE);
    for (let i = 0; i < 6; i++) this.collide(pos, r, h);
    const gyHere = this.arena.groundAt?.(pos.x, pos.z, pos.y);
    if (gyHere != null) pos.y = gyHere;
    if (this.spawnClear(pos.x, pos.z, pos.y)) return pos;

    const gy0 = pos.y;
    const ox = pos.x;
    const oz = pos.z;
    for (let ring = 1; ring <= 12; ring++) {
      const rad = ring * 0.38;
      const steps = 8 + ring * 2;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2 + ring * 0.15;
        const x = ox + Math.cos(a) * rad;
        const z = oz + Math.sin(a) * rad;
        const gy = this.arena.dropOffRoof?.(x, z, gy0) ?? this.arena.groundAt?.(x, z, gy0);
        if (gy == null || !this.spawnClear(x, z, gy)) continue;
        pos.set(x, gy, z);
        this.collide(pos, r, h);
        const gy2 = this.arena.groundAt?.(pos.x, pos.z, pos.y);
        if (gy2 != null) pos.y = gy2;
        return pos;
      }
    }
    return pos;
  }

  enemySpawn() {
    return this.playerTeam === "red" ? this.arena.spawnBlue : this.arena.spawnRed;
  }

  assignPlayerTeam() {
    if (this.netOnline) {
      const me = this.net?.players?.find((p) => p.id === this.net.myId);
      const team = me?.team === "red" || me?.team === "blue" ? me.team : this.playerTeam;
      if (team !== this.playerTeam || !this.playerRig) {
        this.playerTeam = team;
        if (this.playerRig) this.scene.remove(this.playerRig);
        this.playerRig = createFighter(this.playerTeam, true);
        this.scene.add(this.playerRig);
        this._playerClipY = this.playerRig.userData?.fpsClipY ?? 1.12 * BODY_K;
      }
      return;
    }
    const forced = this._bootParams?.get("team");
    const team = forced === "red" || forced === "blue" ? forced : Math.random() < 0.5 ? "blue" : "red";
    this.setPlayerTeam(team);
  }

  setPlayerTeam(team) {
    const next = team === "red" ? "red" : "blue";
    if (this.playerTeam === next && this.playerRig) {
      this._playerClipY = this.playerRig.userData?.fpsClipY ?? 1.12 * BODY_K;
      return;
    }
    this.playerTeam = next;
    if (this.playerRig) this.scene.remove(this.playerRig);
    this.playerRig = createFighter(this.playerTeam, true);
    this.scene.add(this.playerRig);
    this._playerClipY = this.playerRig.userData?.fpsClipY ?? 1.12 * BODY_K;
  }

  nearSpawnPad(x, z) {
    const blue = this.arena?.spawnBlue;
    const red = this.arena?.spawnRed;
    const r2 = 7.2 * 7.2;
    if (blue && (x - blue.x) ** 2 + (z - blue.z) ** 2 < r2) return true;
    if (red && (x - red.x) ** 2 + (z - red.z) ** 2 < r2) return true;
    return false;
  }

  pickSpawnSpots(origin, count, skipSelf = false) {
    const spots = [];
    const minSepSq = 2.15 * 2.15;
    const originIsBlue =
      origin.distanceToSquared(this.arena.spawnBlue) <= origin.distanceToSquared(this.arena.spawnRed);
    const consider = (x, z, y) => {
      if (spots.length >= count) return;
      const safe = this.safeBotPos(x, z, y);
      const p = new THREE.Vector3(safe.x, safe.y, safe.z);
      if (skipSelf && p.distanceToSquared(origin) < 0.36) return;
      if (this.blocked(safe.x, safe.z, BOT_R + 0.1, safe.y)) return;
      if (spots.some((s) => s.distanceToSquared(p) < minSepSq)) return;
      spots.push(p);
    };
    const nearby = [...(this.arena.waypoints || [])]
      .filter((w) => {
        if (w.distanceToSquared(origin) > 14 * 14) return false;
        if (this.onRoof(w.x, w.z, w.y)) return false;
        const toBlue = w.distanceToSquared(this.arena.spawnBlue);
        const toRed = w.distanceToSquared(this.arena.spawnRed);
        return originIsBlue ? toBlue <= toRed + 8 : toRed <= toBlue + 8;
      })
      .sort((a, b) => a.distanceToSquared(origin) - b.distanceToSquared(origin));
    for (const w of nearby) {
      consider(w.x, w.z, w.y);
      if (spots.length >= count) return spots;
    }
    const ring = [
      [2.2, 1.5],
      [-2.3, 1.4],
      [-2.1, -1.6],
      [2.4, -1.3],
      [3.0, 0.2],
      [-3.0, -0.2],
      [0.3, 2.7],
      [-0.4, -2.6],
    ];
    for (const [dx, dz] of ring) {
      consider(origin.x + dx, origin.z + dz, origin.y);
      if (spots.length >= count) return spots;
    }
    const fb = this.safeBotPos(origin.x, origin.z, origin.y);
    for (let i = spots.length; i < count; i++) {
      const a = i * 1.85 + 0.35;
      consider(fb.x + Math.cos(a) * 2.05, fb.z + Math.sin(a) * 2.05, fb.y);
    }
    while (spots.length < count) spots.push(new THREE.Vector3(fb.x, fb.y, fb.z));
    return spots;
  }

  startRound(playing = this.state === "play") {
    this.roundLock = false;
    this.clearMenuShot();
    this.clearChests();
    this.setMenuStudio(false);
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls.length = 0;
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots.length = 0;

    this.out = false;
    this.spectateIdx = -1;
    this.spectating = false;
    this.spectateSnap = true;
    this._possessBuf = "";
    this._possessAt = 0;
    this.roofDying = false;
    this.roofCorpse = false;
    this.roofFall = 0;
    this.roofNoted = false;
    this.marker.visible = true;
    if (this.playerRig) {
      this.playerRig.visible = true;
      this.playerRig.rotation.x = 0;
      this.playerRig.rotation.z = 0;
      if (this._playerClipY != null) this.playerRig.userData.fpsClipY = this._playerClipY;
      const u = this.playerRig.userData?.walkUniforms;
      if (u?.uClipY) u.uClipY.value = this._playerClipY ?? u.uClipY.value;
    }
    this.lives = 1;
    this.hp = MAX_HP;
    this.ammo = getWeapon(this.weaponId || DEFAULT_WEAPON).ammo;
    this.grenades = 1;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.velY = 0;
    this.clearFires();
    this.resetBarrels();
    this.placeAtSpawn();
    this.yaw = Math.atan2(-(0 - this.pos.x), -(0 - this.pos.z));
    this.pitch = 0;
    this.walkYaw = this.yaw;
    this.radarYaw = this.yaw;
    this.walkPhase = 0;
    this.walkAmt = 0;
    this.runAmt = 0;
    this.ads = 0;
    this.plantAmt = 0;
    this.buttons.aim = false;
    this.bombBusy = false;
    this._playerPlanted = false;
    this._safePos.copy(this.pos);
    this._lastGroundY = this.pos.y;
    this._hasSafePos = true;

    if (!playing) {
      if (this.playerRig) this.playerRig.visible = false;
      this.setupBombRound(false);
      this.ensureMenuShot();
      this.syncHud();
      return;
    }

    this.muzzleLight.color.set(0xff9a3a);
    this.muzzleLight.distance = 5;
    this.muzzleLight.intensity = 0;
    this.spawnChests();

    if (this.netOnline) {
      this.spawnNetRound();
      this.setupBombRound(playing);
      this.syncHud();
      return;
    }

    if (this.eventMode) {
      const enemy = this.enemyTeam();
      this.pickSpawnSpots(this.enemySpawn(), EVENT_START).forEach((w, i) => this.spawnBot(enemy, w.x, w.z, i, w.y));
      this.swarmPeak = Math.max(this.swarmPeak, this.teamAlive(enemy));
    } else {
      const redN = this.playerTeam === "red" ? 4 : 5;
      const blueN = this.playerTeam === "blue" ? 4 : 5;
      this.pickSpawnSpots(this.arena.spawnBlue, blueN, this.playerTeam === "blue").forEach((w, i) =>
        this.spawnBot("blue", w.x, w.z, i, w.y)
      );
      this.pickSpawnSpots(this.arena.spawnRed, redN, this.playerTeam === "red").forEach((w, i) =>
        this.spawnBot("red", w.x, w.z, i, w.y)
      );
    }
    for (const bot of this.bots) {
      bot.mesh.visible = true;
      bot.pushOut = 8 + Math.random() * 2.5;
      bot.mode = bot.personality === "flank" ? "flank" : bot.personality === "push" ? "advance" : "roam";
      bot.holdSpot = null;
      bot.think = 0;
      bot.stuck = 0;
      bot.roamTarget = this.pickRoamTarget(bot);
      bot.roamIn = 6 + Math.random() * 4;
      bot.waypoint = this.pickWaypoint(bot, bot.roamTarget);
      this.nudgeBotOut(bot);
    }
    if (this.eventMode) {
      const rush = this.playerSpawn();
      const enemy = this.enemyTeam();
      for (const bot of this.bots) {
        if (bot.team !== enemy) continue;
        this.armEventRush(bot, rush);
        bot.waypoint = this.pickWaypoint(bot, rush);
        this.nudgeBotOut(bot);
      }
    }
    this.setupBombRound(playing);
    this.syncHud();
  }

  spawnNetRound() {
    this.syncNetSeats();
  }

  syncNetSeats() {
    if (!this.netOnline || !this.arena) return;
    const players = this.net?.players || [];
    for (const p of players) {
      if (p.id === this.net.myId) continue;
      if (this.bots.some((b) => b.netId === p.id)) continue;
      const ai = this.bots.find((b) => b.alive && b.team === p.team && !b.remote);
      if (ai) {
        this.scene.remove(ai.mesh);
        this.bots.splice(this.bots.indexOf(ai), 1);
      }
      const origin = p.team === "red" ? this.arena.spawnRed : this.arena.spawnBlue;
      const bot = this.spawnBot(p.team, origin.x, origin.z, 0, origin.y);
      bot.remote = true;
      bot.netId = p.id;
      bot.name = p.name;
      bot.raiseAmt = 1;
    }
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (!b.remote || players.some((p) => p.id === b.netId)) continue;
      this.scene.remove(b.mesh);
      this.bots.splice(i, 1);
    }
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (b.remote || b.netId) continue;
      this.scene.remove(b.mesh);
      this.bots.splice(i, 1);
    }
  }

  spawnBot(team, x, z, lane = 0, y = null) {
    const mesh = createFighter(team === "red" ? "red" : "blue");
    mesh.visible = true;
    const safe = this.safeBotPos(x, z, y);
    const px = safe.x;
    const pz = safe.z;
    const py = safe.y;
    mesh.position.set(px, py, pz);
    mesh.rotation.y = Math.atan2(px, pz);
    this.scene.add(mesh);
    const laneCount = team === "red" ? 5 : 4;
    const margin = Math.min(5, this.arena.halfX * 0.28);
    const span = Math.max(6, (this.arena.halfX - margin) * 2);
    const personalities = ["wander", "flank", "push"];
    const hx = this.arena.halfX;
    const hz = this.arena.halfZ;
    const laneI = ((lane % laneCount) + laneCount) % laneCount;
    const preferredX = -this.arena.halfX + margin + ((laneI + 0.5) / laneCount) * span;
    this.bots.push({
      mesh,
      team,
      lane: laneI,
      preferredX,
      roamSector: new THREE.Vector3(
        -hx + ((laneI + 0.5) / laneCount) * hx * 2 + (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * hz * 1.7
      ),
      alive: true,
      hp: MAX_HP,
      weaponId: pickLootWeapon(),
      yaw: Math.atan2(px, pz),
      vel: new THREE.Vector3(),
      walkPhase: Math.random() * Math.PI * 2,
      walkAmt: 0,
      runAmt: 0,
      cooldown: 0.08 + Math.random() * 0.16,
      think: 0.04 + Math.random() * 0.16,
      maxSpeed: 11.6 + Math.random() * 1.4,
      strafe: laneI % 2 === 0 ? 1 : -1,
      mode: this.eventMode && team === this.enemyTeam() ? "advance" : "roam",
      personality: personalities[laneI % personalities.length],
      fall: 0,
      blood: false,
      roofDeath: false,
      deathX: px,
      deathZ: pz,
      deathY: py,
      roamTarget: null,
      roamIn: 0,
      pushOut: 8,
      waypoint: this.nearestOpen(new THREE.Vector3(preferredX, py, team === "blue" ? 6 : -6), mesh.position),
      stuck: 0,
      lastPos: mesh.position.clone(),
      grenades: 1,
      alert: 0,
      heardAt: null,
      lastSeen: null,
      hadLos: false,
      reactIn: 0,
      raiseAmt: 0,
      reactTime: 0.14 + Math.random() * 0.18,
      fovCos: 0.4 + Math.random() * 0.16,
      aimErr: 0.028 + Math.random() * 0.036,
      trackRate: 10 + Math.random() * 5,
      noiseX: 0,
      noiseY: 0,
      seeGrace: 0,
      hearCd: 0,
      holdSpot: null,
      peekT: Math.random() * 0.4,
      plantAmt: 0,
    });
    const spawned = this.bots[this.bots.length - 1];
    attachWeapon(spawned.mesh, spawned.weaponId);
    return spawned;
  }

  nudgeBotOut(bot) {
    if (!bot?.mesh) return;
    const pos = bot.mesh.position;
    const safe = this.safeBotPos(pos.x, pos.z, pos.y);
    pos.set(safe.x, safe.y, safe.z);
    bot.lastPos.copy(pos);
    const goal = bot.waypoint || bot.roamTarget;
    if (!goal) return;
    let dx = goal.x - pos.x;
    let dz = goal.z - pos.z;
    let len = Math.hypot(dx, dz);
    if (len < 1.6) {
      bot.roamTarget = this.pickRoamTarget(bot);
      bot.waypoint = this.pickWaypoint(bot, bot.roamTarget);
      const next = bot.waypoint || bot.roamTarget;
      if (!next) return;
      dx = next.x - pos.x;
      dz = next.z - pos.z;
      len = Math.hypot(dx, dz);
    }
    if (len < 0.2) return;
    bot.vel.set((dx / len) * 5.2, 0, (dz / len) * 5.2);
  }

  clearChests() {
    for (const c of this.chests || []) this.scene.remove(c.mesh);
    this.chests = [];
  }

  spawnChests() {
    this.clearChests();
    if (!this.arena) return;
    const scored = [];
    for (const w of this.arena.waypoints || []) {
      const tuck = this.chestTuck(w);
      if (!tuck) continue;
      scored.push(tuck);
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const p of scored) {
      if (picked.length >= 4) break;
      if (picked.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 81)) continue;
      picked.push(p);
    }
    if (picked.length < 3) {
      for (const w of this.arena.waypoints || []) {
        if (picked.length >= 4) break;
        if (this.onRoof(w.x, w.z, w.y) || this.nearSpawnPad(w.x, w.z) || this.blocked(w.x, w.z, 0.5, w.y)) continue;
        if (picked.some((q) => (q.x - w.x) ** 2 + (q.z - w.z) ** 2 < 64)) continue;
        const gy = this.arena.groundAt?.(w.x, w.z, w.y) ?? w.y;
        picked.push({ x: w.x, y: gy, z: w.z, yaw: Math.random() * Math.PI * 2 });
      }
    }
    for (const p of picked) {
      const mesh = createChest();
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.y = p.yaw;
      mesh.updateMatrixWorld(true);
      mesh.userData.worldBox = new THREE.Box3().setFromObject(mesh);
      this.scene.add(mesh);
      this.chests.push({ mesh, open: false, weapon: pickLootWeapon() });
    }
  }

  chestTuck(w) {
    if (this.onRoof(w.x, w.z, w.y)) return null;
    if (this.nearSpawnPad(w.x, w.z)) return null;
    if (this.blocked(w.x, w.z, 0.48, w.y)) return null;
    const sites = this.arena?.bombSites || [];
    for (const s of sites) {
      const p = s.pos || s;
      if ((p.x - w.x) ** 2 + (p.z - w.z) ** 2 < 20) return null;
    }
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
    let walls = 0;
    let open = 0;
    let openX = 0;
    let openZ = 0;
    for (const [dx, dz] of dirs) {
      const x = w.x + dx * 1.2;
      const z = w.z + dz * 1.2;
      if (this.blocked(x, z, 0.4, w.y) || this.onRoof(x, z, w.y)) walls += 1;
      else {
        open += 1;
        openX += dx;
        openZ += dz;
      }
    }
    if (open < 2 || open > 5 || walls < 3) return null;
    const len = Math.hypot(openX, openZ) || 1;
    const x = w.x + (openX / len) * 0.38;
    const z = w.z + (openZ / len) * 0.38;
    if (this.blocked(x, z, 0.5, w.y)) return null;
    const gy = this.arena.groundAt?.(x, z, w.y) ?? w.y;
    if (gy == null || this.onRoof(x, z, gy)) return null;
    const blue = this.arena.spawnBlue;
    const red = this.arena.spawnRed;
    const hide = Math.min(
      blue ? Math.hypot(x - blue.x, z - blue.z) : 20,
      red ? Math.hypot(x - red.x, z - red.z) : 20
    );
    const score = walls * 5 + (open === 2 ? 8 : open === 3 ? 4 : 0) + hide * 0.22;
    return { x, y: gy, z, yaw: Math.atan2(openX, openZ), score };
  }

  nearestChest() {
    let best = null;
    let bestD = 1.9;
    for (const c of this.chests || []) {
      const p = c.mesh.position;
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < bestD && Math.abs((p.y || 0) - this.pos.y) < 1.5) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  lootChest() {
    if (this.state !== "play" || this.out) return;
    const c = this.nearestChest();
    if (!c) return;
    if (c.open) {
      this.toast("Empty");
      return;
    }
    c.open = true;
    const lid = c.mesh.userData?.lid;
    if (lid) {
      lid.position.z -= 0.08;
      lid.rotation.x = -1.2;
    }
    this.equipWeapon(c.weapon, true);
    this.toast(getWeapon(c.weapon).name, 2);
  }

  equipWeapon(id, fillAmmo = true) {
    const spec = getWeapon(id);
    this.weaponId = spec.id;
    const next = createWeapon(spec.id, false);
    if (this.marker?.parent) this.marker.parent.remove(this.marker);
    this.marker = next;
    if (this.camera) this.camera.add(this.marker);
    if (fillAmmo) this.ammo = spec.ammo;
    this.syncHud();
  }

  setupBombRound(playing) {
    this.bombBusy = false;
    this.bombWork = 0;
    this.bombWorkKind = null;
    this.bombWorker = null;
    this.bombPlanted = false;
    this.bombDropped = false;
    this.bombFuse = 0;
    this.bombCarrier = null;
    this._bombBeep = 0;
    this._bombDetonating = false;
    const sites = this.arena?.bombSites;
    if (this.bombMesh?.userData?.light) this.bombMesh.userData.light.intensity = 0;
    if (!this.bombMode || !sites?.length) {
      if (this.bombMesh) {
        this.scene.add(this.bombMesh);
        this.bombMesh.visible = false;
        this.bombMesh.scale.setScalar(1);
      }
      if (sites) for (const s of sites) s.group.visible = false;
      this.syncBombHud();
      return;
    }
    this.bombSiteId = this.netOnline && this._netBombSite ? this._netBombSite : Math.random() < 0.5 ? "A" : "B";
    this.bombSite = sites.find((s) => s.id === this.bombSiteId) || sites[0];
    for (const s of sites) {
      s.group.visible = true;
      if (s.pad?.material) s.pad.material.opacity = 0.5;
      if (s.ring?.material) s.ring.material.emissiveIntensity = 0.62;
    }
    if (!playing || !this.bombMesh) {
      this.bombMesh.visible = false;
      this.syncBombHud();
      return;
    }
    if (this.netOnline) {
      const carrierId = this._netCarrierId;
      if (carrierId && carrierId === this.net.myId) this.giveBomb("player");
      else {
        const remote = this.bots.find((b) => b.netId === carrierId);
        if (remote) this.giveBomb(remote);
        else {
          const t = this.bots.find((b) => b.alive && b.team === "red" && !b.remote);
          this.giveBomb(t || (this.playerTeam === "red" ? "player" : this.bots.find((b) => b.alive && b.team === "red") || "player"));
        }
      }
    } else if (this.playerTeam === "red") this.giveBomb("player");
    else {
      const t = this.bots.find((b) => b.alive && b.team === "red");
      this.giveBomb(t || "player");
    }
    this.syncBombHud();
  }

  giveBomb(who) {
    this.bombCarrier = who;
    this.bombDropped = false;
    this.bombPlanted = false;
    this.bombWork = 0;
    if (!this.bombMesh) return;
    if (who === "player") {
      this.scene.add(this.bombMesh);
      this.bombMesh.visible = false;
      this.bombMesh.scale.setScalar(1);
      this.bombMesh.rotation.set(0, 0, 0);
    } else if (who?.mesh) {
      who.mesh.add(this.bombMesh);
      this.bombMesh.visible = true;
      this.bombMesh.scale.setScalar(0.7);
      this.bombMesh.position.set(0.2 * BODY_K, 0.9 * BODY_K, 0.1 * BODY_K);
      this.bombMesh.rotation.set(0.4, 0.85, 1.15);
    }
    if (this.bombMesh.userData?.light) this.bombMesh.userData.light.intensity = 0;
    this.syncBombHud();
  }

  dropBomb(pos, fromNet = false) {
    if (!this.bombMode || this.bombPlanted || !this.bombMesh) return;
    this.bombCarrier = null;
    this.bombDropped = true;
    this.bombWork = 0;
    this.scene.add(this.bombMesh);
    const gy = this.arena.groundAt?.(pos.x, pos.z, pos.y) ?? pos.y;
    this.bombMesh.visible = true;
    this.bombMesh.scale.setScalar(1);
    this.bombMesh.position.set(pos.x, gy, pos.z);
    this.bombMesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    if (this.bombMesh.userData?.light) this.bombMesh.userData.light.intensity = 0.4;
    this.syncBombHud();
    if (this.netOnline && !fromNet) this.net.sendDrop(pos.x, gy, pos.z);
  }

  plantSiteAt(x, z) {
    const sites = this.arena?.bombSites;
    if (!sites?.length) return null;
    let best = null;
    let bestD = SITE_R;
    for (const s of sites) {
      const d = Math.hypot(x - s.pos.x, z - s.pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  plantBomb(pos, fromNet = false) {
    if (!this.bombMode || this.bombPlanted || this.roundLock) return;
    if (!fromNet && (this.bombCarrier === "player" || this.bombWorker === "player")) this._playerPlanted = true;
    const site = this.plantSiteAt(pos.x, pos.z) || this.bombSite;
    if (site) {
      this.bombSite = site;
      this.bombSiteId = site.id;
    }
    this.bombCarrier = null;
    this.bombDropped = false;
    this.bombPlanted = true;
    this.bombFuse = BOMB_FUSE;
    this.bombWork = 0;
    this.bombWorkKind = null;
    this.bombWorker = null;
    this.bombBusy = false;
    this._bombBeep = 0;
    this.scene.add(this.bombMesh);
    const gy = this.arena.groundAt?.(pos.x, pos.z, pos.y) ?? pos.y;
    this.bombMesh.visible = true;
    this.bombMesh.scale.setScalar(1);
    this.bombMesh.position.set(pos.x, gy, pos.z);
    this.bombMesh.rotation.set(0, 0.2, 0);
    this.feed(`Bomb planted ${this.bombSiteId || ""}`.trim());
    this.audio.plant();
    this.syncBombHud();
    if (this.netOnline && !fromNet) this.net.sendPlant(pos.x, gy, pos.z, this.bombSiteId);
  }

  defuseBomb(fromNet = false) {
    if (!this.bombMode || !this.bombPlanted || this.roundLock) return;
    this.bombPlanted = false;
    this.bombWork = 0;
    this.bombBusy = false;
    if (this.bombMesh) {
      this.bombMesh.visible = false;
      if (this.bombMesh.userData?.light) this.bombMesh.userData.light.intensity = 0;
    }
    this.feed("Bomb defused");
    this.audio.defuse();
    if (this.netOnline && !fromNet) this.net.sendDefuse();
    if (!this.netOnline || this.net.isHost) this.endRound("blue");
  }

  nearXZ(ax, az, bx, bz, r) {
    return Math.hypot(ax - bx, az - bz) < r;
  }

  bombInteractKind() {
    if (!this.bombMode || this.out || this.roundLock) return null;
    if (this.bombPlanted) {
      if (this.playerTeam === "blue" && this.bombMesh && this.nearXZ(this.pos.x, this.pos.z, this.bombMesh.position.x, this.bombMesh.position.z, SITE_R)) {
        return "defuse";
      }
      return null;
    }
    if (this.playerTeam === "red" && this.bombCarrier === "player" && this.plantSiteAt(this.pos.x, this.pos.z)) {
      return "plant";
    }
    return null;
  }

  bombObjective(bot) {
    if (!this.bombMode || this.roundLock) return null;
    if (this.bombPlanted) return this.bombMesh.position;
    if (this.bombDropped) return this.bombMesh.position;
    if (bot.team === "red") return this.bombSite?.pos;
    return this.bombSite?.pos;
  }

  tryBotBombPickup(bot) {
    if (!this.bombDropped || this.bombPlanted || bot.team !== "red" || !bot.alive) return;
    const p = this.bombMesh.position;
    if (this.nearXZ(bot.mesh.position.x, bot.mesh.position.z, p.x, p.z, 1.35)) this.giveBomb(bot);
  }

  botAtBombWork(bot, los, dist) {
    if (!this.bombMode || this.roundLock || !bot.alive) return false;
    const busy = this.bombWorker && this.bombWorker !== bot && (this.bombWorker === "player" || this.bombWorker?.alive);
    if (this.bombPlanted) {
      if (bot.team !== "blue") return false;
      if (los && dist < 3.2) return false;
      if (busy) return false;
      const p = this.bombMesh.position;
      return this.nearXZ(bot.mesh.position.x, bot.mesh.position.z, p.x, p.z, SITE_R);
    }
    if (this.bombCarrier !== bot) return false;
    if (busy) return false;
    return Boolean(this.plantSiteAt(bot.mesh.position.x, bot.mesh.position.z));
  }

  botBombWork(bot, dt) {
    if (this.bombWorker && this.bombWorker !== bot && (this.bombWorker === "player" || this.bombWorker?.alive)) return;
    if (this.bombWorker !== bot) {
      this.bombWork = 0;
      this.bombWorker = bot;
    }
    if (this.bombPlanted) {
      this.bombWorkKind = "defuse";
      this.bombWork = Math.min(1, this.bombWork + dt / DEFUSE_T);
      if (this.bombWork >= 1) this.defuseBomb();
      return;
    }
    this.bombWorkKind = "plant";
    this.bombWork = Math.min(1, this.bombWork + dt / PLANT_T);
    if (this.bombCarrier === bot && this.bombMesh?.parent === bot.mesh) {
      const t = this.bombWork;
      this.bombMesh.position.set(
        THREE.MathUtils.lerp(0.2, 0.04, t) * BODY_K,
        THREE.MathUtils.lerp(0.9, 0.1, t) * BODY_K,
        THREE.MathUtils.lerp(0.1, -0.48, t) * BODY_K
      );
      this.bombMesh.rotation.set(
        THREE.MathUtils.lerp(0.4, 0.06, t),
        THREE.MathUtils.lerp(0.85, 0.12, t),
        THREE.MathUtils.lerp(1.15, 0.04, t)
      );
      this.bombMesh.scale.setScalar(THREE.MathUtils.lerp(0.7, 1, t));
    }
    if (this.bombWork >= 1) this.plantBomb(bot.mesh.position);
  }

  tryPlayerBombPickup() {
    if (!this.bombMode || this.out || this.playerTeam !== "red" || this.bombPlanted) return;
    if (this.bombCarrier === "player") return;
    if (!this.bombDropped || !this.bombMesh) return;
    const p = this.bombMesh.position;
    if (this.nearXZ(this.pos.x, this.pos.z, p.x, p.z, 1.35)) this.giveBomb("player");
  }

  updateBomb(dt) {
    if (!this.bombMode || this.state !== "play") {
      this.syncBombHud();
      return;
    }
    this.tryPlayerBombPickup();
    const kind = this.bombInteractKind();
    if (kind && this.keys.has("KeyE") && !this.roundLock) {
      if (this.bombWorker !== "player" || this.bombWorkKind !== kind) this.bombWork = 0;
      this.bombWorker = "player";
      this.bombWorkKind = kind;
      this.bombWork = Math.min(1, this.bombWork + dt / (kind === "plant" ? PLANT_T : DEFUSE_T));
      this.posePlayerBombWork(kind);
      if (this.bombWork >= 1) {
        if (kind === "plant") this.plantBomb(this.pos);
        else this.defuseBomb();
      }
    } else if (this.bombWorker === "player") {
      this.bombWork = 0;
      this.bombWorkKind = null;
      this.bombWorker = null;
      this.clearPlayerBombWork();
    }

    if (this.bombPlanted && !this.roundLock) {
      this.bombFuse -= dt;
      const light = this.bombMesh?.userData?.light;
      if (light) light.intensity = 0.35 + (Math.sin(this.clock.elapsedTime * (this.bombFuse < 10 ? 14 : 7)) * 0.5 + 0.5) * 1.8;
      this._bombBeep -= dt;
      if (this._bombBeep <= 0) {
        this.audio.bombBeep(this.bombFuse < 10);
        this._bombBeep = this.bombFuse < 10 ? 0.28 : this.bombFuse < 20 ? 0.55 : 0.95;
      }
      if (this.bombFuse <= 0) {
        this.bombFuse = 0;
        this._bombDetonating = true;
        const p = this.bombMesh.position.clone();
        if (this.bombMesh.userData?.light) this.bombMesh.userData.light.intensity = 0;
        this.bombMesh.visible = false;
        this.explodeBomb(p);
        this.feed("Bomb exploded");
        this.bombPlanted = false;
        this.endRound("red");
      }
    }
    this.syncBombHud();
  }

  posePlayerBombWork(kind) {
    if (!this.bombMesh) return;
    if (kind === "plant" && this.bombCarrier === "player") {
      this.camera.add(this.bombMesh);
      this.bombMesh.visible = true;
      const t = this.bombWork;
      this.bombMesh.scale.setScalar(0.52);
      this.bombMesh.position.set(0.16, -0.28 - t * 0.28, -0.46);
      this.bombMesh.rotation.set(0.55 + t * 0.35, 0.35, 1.05);
    }
  }

  clearPlayerBombWork() {
    if (!this.bombMesh) return;
    if (this.bombCarrier === "player" && !this.bombPlanted) {
      this.scene.add(this.bombMesh);
      this.bombMesh.visible = false;
      this.bombMesh.scale.setScalar(1);
      this.bombMesh.rotation.set(0, 0, 0);
    }
  }

  syncBombHud() {
    const hud = $("bomb-hud");
    if (!hud) return;
    hud.hidden = !this.bombMode || this.state !== "play";
    const carry = $("bomb-carry");
    if (carry) carry.hidden = !(this.bombMode && this.bombCarrier === "player" && !this.bombPlanted && !this.out);
    const clock = $("bomb-clock");
    if (clock) {
      const show = this.bombMode && this.bombPlanted;
      clock.hidden = !show;
      if (show) {
        const t = Math.max(0, Math.ceil(this.bombFuse));
        clock.textContent = `0:${String(t).padStart(2, "0")}`;
        clock.classList.toggle("urgent", this.bombFuse < 10);
      }
    }
    const bar = $("bomb-bar");
    const fill = bar?.querySelector("i");
    const working = this.bombWork > 0.02 && (this.bombWorkKind === "plant" || this.bombWorkKind === "defuse");
    if (bar) bar.hidden = !working;
    if (fill) fill.style.width = `${Math.round(this.bombWork * 100)}%`;
    const prompt = $("bomb-prompt");
    const use = $("use-prompt");
    const chest = this.state === "play" && !this.out ? this.nearestChest() : null;
    const chestHint = chest && !chest.open ? "F / E — Open crate" : chest?.open ? "Empty crate" : "";
    if (prompt) {
      const kind = this.state === "play" ? this.bombInteractKind() : null;
      if (kind === "plant") {
        const site = this.plantSiteAt(this.pos.x, this.pos.z);
        prompt.textContent = `Hold E — Plant ${site?.id || this.bombSiteId || ""}`;
      } else if (kind === "defuse") prompt.textContent = "Hold E — Defuse";
      else if (this.bombMode && this.bombDropped && this.playerTeam === "red" && !this.out) prompt.textContent = "Pick up the bomb";
      else prompt.textContent = "";
    }
    if (use) {
      const bombText = prompt?.textContent || "";
      use.textContent = bombText ? "" : chestHint;
    }
  }

  bind() {
    this.canvas.tabIndex = 0;
    const gameKeys = new Set([
      "Space",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyC",
      "KeyR",
      "KeyG",
      "KeyE",
      "KeyF",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
    ]);

    addEventListener("resize", () => this.resize());
    addEventListener("keydown", (e) => {
      if (this.state === "play" && gameKeys.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "KeyR") this.reload();
      if (e.code === "KeyG") this.throwGrenade();
      if (e.code === "KeyF") this.lootChest();
      if (e.code === "KeyE" && !this.bombInteractKind()) this.lootChest();
      if (e.code === "Escape" && this.state === "play") this.pause();
      if (e.code === "Space" && this.state === "play" && this.out && !this.roofDying) this.cycleSpectate();
      this.notePossessKey(e);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clearInput();
    });

    addEventListener("mousedown", (e) => {
      if (e.button === 2) {
        if (this.state === "play" && this.locked && !this.out) this.buttons.aim = true;
        return;
      }
      if (e.button !== 0) return;
      if (this.state === "pause") {
        if (!e.target.closest("button")) this.start();
        return;
      }
      if (this.state !== "play") return;
      this.mouseDown = true;
      if (!this.locked) {
        this.lock();
        return;
      }
      this.buttons.fire = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 2) {
        this.buttons.aim = false;
        return;
      }
      if (e.button !== 0) return;
      this.mouseDown = false;
      this.buttons.fire = false;
    });
    addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => this.onMouse(e));
    document.addEventListener("pointerlockchange", () => this.onPointerLock());
    document.addEventListener("pointerlockerror", () => {});

    $("play").addEventListener("click", (e) => {
      e.preventDefault();
      this.eventMode = false;
      this.bombMode = false;
      this.beginMatch();
    });
    $("event")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.eventMode = true;
      this.bombMode = false;
      this.beginMatch();
    });
    $("bomb")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.eventMode = false;
      this.bombMode = true;
      this.beginMatch();
    });
    $("online")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.quickPlay();
    });
    $("resume").addEventListener("click", (e) => {
      e.preventDefault();
      this.start();
    });
    $("again").addEventListener("click", (e) => {
      e.preventDefault();
      if (this.netOnline) {
        if (this.net?.isHost) this.net.sendStart();
        else this.toast("Waiting for host");
        return;
      }
      this.beginMatch(true);
    });
    $("pause").addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      this.start();
    });

    this._bootParams = new URLSearchParams(location.search);
    this.setupNet();
  }

  setupNet() {
    this.net = new NetClient({
      onStatus: (text) => this.setNetStatus(text),
      onError: (text) => {
        this._netSearching = false;
        const onlineBtn = $("online");
        if (onlineBtn) onlineBtn.disabled = false;
        this.setNetStatus(text);
        $("menu").hidden = false;
        this.toast(text || "Could not join", 2.4, true);
      },
      onPing: () => {},
      onWelcome: (msg) => {
        this.setNetStatus(msg.room ? `Match ${msg.room}` : "Joining…");
      },
      onLobby: (msg) => {
        if (this.netOnline && this.state === "play") this.syncNetSeats();
      },
      onNotice: (text) => this.toast(text, 1.8, true),
      onBegin: (msg) => this.onNetBegin(msg),
      onState: (msg) => this.onNetState(msg),
      onShot: (msg) => this.onNetShot(msg),
      onKill: (msg) => this.onNetKill(msg),
      onBotKill: (msg) => this.onNetBotKill(msg),
      onPlanted: (msg) => this.onNetPlanted(msg),
      onDefused: (msg) => this.onNetDefused(msg),
      onDropped: (msg) => this.onNetDropped(msg),
      onRound: (msg) => this.onNetRound(msg),
      onOver: (msg) => this.onNetOver(msg),
      onLeave: (msg) => {
        if (this.netOnline && msg?.id) {
          const bot = this.bots.find((b) => b.netId === msg.id);
          if (bot?.alive) this.paintBot(bot, bot.mesh.position.clone(), null, bot.team === "red" ? "blue" : "red");
          if (this.state === "play") this.syncNetSeats();
        }
      },
      onDisconnect: () => {
        this._netSearching = false;
        const onlineBtn = $("online");
        if (onlineBtn && this.state === "menu") onlineBtn.disabled = false;
        if (this.netOnline && this.state === "play") {
          this.netOnline = false;
          this.toast("Disconnected");
        } else if (this.state === "menu") {
          this.setNetStatus("Disconnected");
        }
      },
    });
  }

  netPlayerName() {
    try {
      const stored = localStorage.getItem("paintfield-name");
      if (stored?.trim()) return stored.trim().slice(0, 16);
    } catch {
      /* ignore */
    }
    return "Player";
  }

  setNetStatus(text) {
    const tag = document.querySelector("#menu .tag");
    if (tag) tag.textContent = text || "";
  }

  quickPlay() {
    if (!this.ready || this._netSearching) return;
    this._netSearching = true;
    const onlineBtn = $("online");
    if (onlineBtn) onlineBtn.disabled = true;
    this.setNetStatus("Finding match…");
    this.net.quickPlay({ name: this.netPlayerName() });
  }

  onNetBegin(msg) {
    this._netSearching = false;
    this.netOnline = true;
    this.eventMode = false;
    this.bombMode = msg.mode === "bomb";
    this._netBombSite = msg.site || "A";
    this._netCarrierId = msg.carrierId || "";
    const me = (msg.players || []).find((p) => p.id === this.net.myId);
    if (me?.team) this.playerTeam = me.team;
    this.showIntro(() => {
      this.start(true);
      if (Number.isFinite(msg.blueScore)) this.blueScore = msg.blueScore;
      if (Number.isFinite(msg.redScore)) this.redScore = msg.redScore;
      this.syncHud();
    });
  }

  onNetState(msg) {
    if (!this.netOnline || this.state !== "play") return;
    for (const p of msg.players || []) {
      if (p.id === this.net.myId) continue;
      let bot = this.bots.find((b) => b.netId === p.id);
      if (!bot && p.team) {
        const origin = p.team === "red" ? this.arena.spawnRed : this.arena.spawnBlue;
        bot = this.spawnBot(p.team, p.x ?? origin.x, p.z ?? origin.z, 0, p.y ?? origin.y);
        bot.remote = true;
        bot.netId = p.id;
        bot.name = p.name;
        bot.raiseAmt = 1;
      }
      if (bot) {
        if (p.name) bot.name = p.name;
        bot._netPose = p;
      }
    }
  }

  ensureNetBot(snap) {
    let bot = this.bots.find((b) => !b.remote && b.netI === snap.i);
    if (!bot) {
      bot = this.spawnBot(snap.team, snap.x, snap.z, snap.i, snap.y);
      bot.netI = snap.i;
      bot.netPuppet = true;
    }
    bot._netPose = snap;
  }

  packNetBots() {
    return [];
  }

  applyNetBot(bot, dt) {
    const pose = bot._netPose;
    if (!bot.alive) {
      this.animateDeath(bot, dt);
      return;
    }
    if (pose?.alive === false) {
      this.paintBot(bot, bot.mesh.position.clone(), null, bot.team === "red" ? "blue" : "red");
      this.animateDeath(bot, dt);
      return;
    }
    if (!pose) {
      this.animateBot(bot, dt, false, this.sphereInView(bot.mesh.position.x, bot.mesh.position.y + 0.9, bot.mesh.position.z, 4.6));
      return;
    }
    const p = bot.mesh.position;
    p.x = THREE.MathUtils.damp(p.x, pose.x, 16, dt);
    p.z = THREE.MathUtils.damp(p.z, pose.z, 16, dt);
    p.y = pose.y;
    bot.yaw = this.lerpAngle(bot.yaw, pose.yaw, Math.min(1, dt * 14));
    bot.mesh.rotation.y = bot.yaw;
    bot.walkAmt = pose.walk ?? 0;
    bot.runAmt = pose.run ?? 0;
    bot.plantAmt = pose.plant ?? 0;
    bot.raiseAmt = pose.raise ?? 1;
    const netSpeed = THREE.MathUtils.lerp(7.2, 11.2, bot.runAmt) * bot.walkAmt;
    bot.walkPhase = (bot.walkPhase || 0) + dt * stepCadence(netSpeed, bot.runAmt);
    const draw = this.sphereInView(p.x, p.y + 0.9, p.z, 4.6);
    if (draw) {
      const plant = bot.plantAmt || 0;
      this.animateWalk(
        bot.mesh,
        bot.walkAmt * (1 - plant * 0.9),
        bot.walkPhase,
        plant * 0.72,
        bot.runAmt * (1 - plant),
        (bot.raiseAmt ?? 1) * (1 - plant * 0.85),
        plant
      );
    }
  }

  onNetShot(msg) {
    if (!this.netOnline || this.state !== "play" || msg.id === this.net.myId) return;
    const dir = new THREE.Vector3(msg.dx, msg.dy, msg.dz);
    if (dir.lengthSq() < 0.0001) return;
    dir.normalize();
    this.spawnTracer(new THREE.Vector3(msg.ox, msg.oy, msg.oz), dir, msg.team, msg.id, msg.dmg);
  }

  onNetKill(msg) {
    if (!this.netOnline) return;
    if (msg.id === this.net.myId) {
      if (!this.out) this.playerHit(this.pos.clone(), null, true);
      return;
    }
    const bot = this.bots.find((b) => b.netId === msg.id);
    if (bot?.alive) this.paintBot(bot, bot.mesh.position.clone(), null, bot.team === "red" ? "blue" : "red", true);
    if (msg.byName && msg.name) this.feed(`${msg.byName} splashed ${msg.name}`);
  }

  onNetBotKill(msg) {
    if (!this.netOnline) return;
    const bot = this.bots.find((b) => !b.remote && b.netI === msg.i);
    if (bot?.alive) this.paintBot(bot, bot.mesh.position.clone(), null, bot.team === "red" ? "blue" : "red", true);
  }

  onNetPlanted(msg) {
    if (!this.netOnline || this.bombPlanted) return;
    this.plantBomb(new THREE.Vector3(msg.x, msg.y, msg.z), true);
  }

  onNetDefused(msg) {
    if (!this.netOnline || !this.bombPlanted) return;
    this.defuseBomb(true);
  }

  onNetDropped(msg) {
    if (!this.netOnline || this.bombPlanted) return;
    this.dropBomb(new THREE.Vector3(msg.x, msg.y, msg.z), true);
  }

  onNetRound(msg) {
    if (!this.netOnline) return;
    this._netBombSite = msg.site || this._netBombSite;
    this._netCarrierId = msg.carrierId || "";
    if (this.net.isHost) return;
    this.roundLock = true;
    this._bombDetonating = false;
    this.blueScore = msg.blueScore;
    this.redScore = msg.redScore;
    this.syncHud();
    this.feed(msg.winner === "blue" ? "Police win the round" : "Terrorists win the round");
    if (this.blueScore >= TO_WIN || this.redScore >= TO_WIN) {
      setTimeout(() => {
        if (this.state === "play") this.gameOver((this.playerTeam === "blue" ? this.blueScore : this.redScore) >= TO_WIN);
      }, 1100);
      return;
    }
    setTimeout(() => {
      if (this.state === "play") this.startRound();
    }, 2200);
  }

  onNetOver(msg) {
    if (!this.netOnline) return;
    const won = (this.playerTeam === "blue" ? msg.blueScore : msg.redScore) >= TO_WIN;
    if (this.state !== "over") this.gameOver(won);
  }

  applyBootParams() {
    const params = this._bootParams;
    if (!params) return;
    if (params.has("event")) this.eventMode = true;
    if (params.has("bomb")) {
      this.bombMode = true;
      this.eventMode = false;
    }
    if (params.has("play") || params.has("demo") || params.has("spectate") || params.has("event") || params.has("bomb")) {
      this.start();
      if (params.has("lookdown")) this.pitch = -1.05;
      if (params.has("crouch")) this.keys.add("KeyC");
      if (params.has("spectate")) {
        setTimeout(() => this.playerHit(this.pos.clone()), 700);
      }
    }
  }

  clearInput() {
    this.keys.clear();
    this.buttons.fire = false;
    this.buttons.aim = false;
    this.mouseDown = false;
  }

  onPointerLock() {
    this.locked = Boolean(document.pointerLockElement);
    if (this.locked) return;
    this.buttons.fire = false;
    this.buttons.aim = false;
  }

  lock() {
    const target = this.canvas;
    if (!target.requestPointerLock) return;
    try {
      const result = target.requestPointerLock({ unadjustedMovement: true });
      if (result && typeof result.catch === "function") {
        result.catch(() => target.requestPointerLock());
      }
    } catch {
      target.requestPointerLock();
    }
  }

  beginMatch(reset = false) {
    this.showIntro(() => this.start(reset));
  }

  showIntro(done) {
    if (!this.ready) return;
    if (this._introing) return;
    this._introing = true;
    this.audio.unlock();
    $("menu").hidden = true;
    $("pause").hidden = true;
    $("over").hidden = true;
    $("hud").hidden = true;
    const el = $("intro");
    if (el) {
      el.hidden = false;
      el.style.display = "grid";
      el.style.background = "#000";
      el.style.zIndex = "20";
    }
    clearTimeout(this._introT);
    this._introT = setTimeout(() => {
      this._introing = false;
      if (el) {
        el.hidden = true;
        el.style.display = "";
      }
      try {
        done?.();
      } catch (err) {
        console.error("Failed to start match:", err);
        $("menu").hidden = false;
      }
    }, 2400);
  }

  start(reset = false) {
    if (!this.ready) return;
    try {
      this.audio.unlock();
      const intro = $("intro");
      if (intro) {
        intro.hidden = true;
        intro.style.display = "";
      }
      this._introing = false;
      if (reset || this.state === "menu" || this.state === "over") this.resetMatch(true);
      this.state = "play";
      this.clearInput();
      $("menu").hidden = true;
      $("pause").hidden = true;
      $("over").hidden = true;
      $("hud").hidden = false;
      document.activeElement?.blur();
      this.canvas.focus({ preventScroll: true });
      this.clock.getDelta();
      this.lock();
    } catch (err) {
      console.error("Failed to start match:", err);
      if ($("toast")) this.toast("Failed");
    }
  }

  pause() {
    if (this.netOnline) return;
    if (this.state !== "play") return;
    this.state = "pause";
    this.clearInput();
    $("pause").hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  gameOver(won) {
    this.state = "over";
    $("hud").hidden = true;
    $("over").hidden = false;
    if (this.eventMode) {
      $("over-kicker").textContent = this._timeUp ? "Time" : "";
      $("over-title").textContent = won ? "Victory" : "Defeat";
      $("over-copy").textContent = "";
    } else {
      $("over-kicker").textContent = this._timeUp ? "Time" : this.bombMode ? "Bomb" : "";
      $("over-title").textContent = won ? "Victory" : "Defeat";
      $("over-copy").textContent = `${this.blueScore} – ${this.redScore}`;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    this.ensureMenuShot();
    if (this.netOnline && this.net?.isHost) {
      const winner = (this.playerTeam === "blue" ? this.blueScore : this.redScore) >= TO_WIN ? this.playerTeam : this.enemyTeam();
      this.net.sendOver(winner);
    }
  }

  onMouse(e) {
    if (this.state !== "play") return;
    if (!this.locked && !this.mouseDown) return;
    const sens = this.ads > 0.4 ? 0.00135 : 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  reload() {
    const spec = getWeapon(this.weaponId || DEFAULT_WEAPON);
    if (this.state !== "play" || this.reloading > 0 || this.ammo >= spec.ammo || this.out) return;
    this.reloading = spec.reload || 1.5;
    this.audio.reload();
    this.toast("Reloading");
  }

  toast(text, hold = 1.5, note = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("note", Boolean(note) && Boolean(text));
    this._toastAt = this.clock.elapsedTime;
    this._toastHold = text ? hold : 1.5;
  }

  feed(text) {
    const wrap = $("feed");
    if (!wrap) return;
    const b = document.createElement("b");
    b.textContent = text;
    wrap.prepend(b);
    while (wrap.children.length > 4) wrap.lastChild.remove();
  }

  setPips(id, alive, total) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const d = document.createElement("span");
      if (i >= alive) d.className = "off";
      el.appendChild(d);
    }
  }

  syncHud() {
    const blueN = this.teamAlive("blue");
    const redN = this.teamAlive("red");
    const matchScore = $("match-score");
    const eventScore = $("event-score");
    if (matchScore) matchScore.hidden = Boolean(this.eventMode);
    if (eventScore) eventScore.hidden = !this.eventMode;
    if ($("swarm-size")) $("swarm-size").textContent = String(this.teamAlive(this.enemyTeam()));
    const people = this.netOnline ? this.net?.players || [] : [];
    const blueTotal = this.eventMode
      ? this.playerTeam === "blue"
        ? 1
        : Math.max(blueN, 1)
      : this.netOnline
        ? Math.max(blueN, people.filter((p) => p.team === "blue").length)
        : 5;
    const redTotal = this.eventMode
      ? this.playerTeam === "red"
        ? 1
        : Math.max(redN, 1)
      : this.netOnline
        ? Math.max(redN, people.filter((p) => p.team === "red").length)
        : 5;
    this.setPips("blue-pips", blueN, blueTotal);
    this.setPips("red-pips", redN, redTotal);
    if ($("score-blue")) $("score-blue").textContent = this.blueScore;
    if ($("score-red")) $("score-red").textContent = this.redScore;
    if ($("ammo")) $("ammo").textContent = this.ammo;
    if ($("gun-name")) $("gun-name").textContent = getWeapon(this.weaponId || DEFAULT_WEAPON).name;
    const hpFill = $("hp-fill");
    if (hpFill) hpFill.style.width = `${Math.round((Math.max(0, this.hp) / MAX_HP) * 100)}%`;
    if ($("nades")) {
      $("nades").textContent = this.grenades ? "1" : "0";
      $("nades").classList.toggle("off", this.grenades <= 0);
    }
    this.syncBombHud();
    this.syncMatchClock();
  }

  formatClock(seconds) {
    const t = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  syncMatchClock() {
    const el = $("match-clock");
    if (!el) return;
    el.textContent = this.formatClock(this.matchTime);
    el.classList.toggle("urgent", this.matchTime <= 30);
  }

  updateMatchTimer(dt) {
    if (this.state !== "play" || this._timeUp) return;
    this.matchTime = Math.max(0, this.matchTime - dt);
    this.syncMatchClock();
    if (this.matchTime > 0) return;
    this.onMatchTimeUp();
  }

  onMatchTimeUp() {
    this._timeUp = true;
    if (this.eventMode) {
      this.gameOver(!this.out);
      return;
    }
    let winner = null;
    if (this.blueScore !== this.redScore) winner = this.blueScore > this.redScore ? "blue" : "red";
    else {
      const bN = this.teamAlive("blue");
      const rN = this.teamAlive("red");
      if (bN !== rN) winner = bN > rN ? "blue" : "red";
    }
    this.gameOver(winner ? winner === this.playerTeam : false);
  }

  bakeRadar() {
    const SIZE = 512;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const box = this.arena?.worldBox;
    if (!box || !ctx) {
      this.radarMap = null;
      return;
    }
    const minX = box.min.x;
    const minZ = box.min.z;
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 8);
    const s = SIZE / span;
    this.radarOrigin = { x: minX, z: minZ, s, size: SIZE };
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const fillAabb = (mesh, fill) => {
      const b = this._radarBox || (this._radarBox = new THREE.Box3());
      b.setFromObject(mesh);
      const x0 = (b.min.x - minX) * s;
      const y0 = (b.min.z - minZ) * s;
      const x1 = (b.max.x - minX) * s;
      const y1 = (b.max.z - minZ) * s;
      ctx.fillStyle = fill;
      ctx.fillRect(x0, y0, Math.max(1.2, x1 - x0), Math.max(1.2, y1 - y0));
    };
    for (const m of this.arena.floorMeshes || []) fillAabb(m, "#161b22");
    for (const m of this.arena.wallMeshes || []) fillAabb(m, "#2c3442");
    this.radarMap = canvas;
  }

  radarFocus() {
    if (this.out && this.spectating) {
      const bot = this.spectateTargets()[this.spectateIdx];
      if (bot?.mesh) {
        return { x: bot.mesh.position.x, z: bot.mesh.position.z, yaw: bot.yaw ?? this.yaw };
      }
    }
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
  }

  drawRadar(dt) {
    const canvas = $("radar");
    if (!canvas || !this.radarMap || this.state !== "play") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const R = W * 0.5 - 1;
    const focus = this.radarFocus();
    let d = focus.yaw - this.radarYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.radarYaw += d * (1 - Math.exp(-10 * dt));

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const { x: minX, z: minZ, s, size } = this.radarOrigin;
    const meters = 16;
    const pxPerM = R / meters;
    ctx.translate(cx, cy);
    ctx.rotate(this.radarYaw);
    const mapScale = pxPerM / s;
    ctx.drawImage(
      this.radarMap,
      -(focus.x - minX) * s * mapScale,
      -(focus.z - minZ) * s * mapScale,
      size * mapScale,
      size * mapScale
    );

    const worldToRadar = (wx, wz) => {
      const dx = wx - focus.x;
      const dz = wz - focus.z;
      return [dx * pxPerM, dz * pxPerM];
    };

    const drawBlip = (wx, wz, color, r) => {
      const [x, y] = worldToRadar(wx, wz);
      if (x * x + y * y > (R - 6) * (R - 6)) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const bot of this.bots) {
      if (!bot.alive || bot.team !== this.playerTeam) continue;
      const p = bot.mesh.position;
      drawBlip(p.x, p.z, this.playerTeam === "red" ? "#ff2a18" : "#00a2ff", 3.2);
    }
    if (!this.out) drawBlip(this.pos.x, this.pos.z, "#f2efe8", 2.2);

    if (this.bombMode && this.arena?.bombSites) {
      ctx.font = "700 13px Rajdhani, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const s of this.arena.bombSites) {
        const [x, y] = worldToRadar(s.pos.x, s.pos.z);
        if (x * x + y * y > (R - 8) * (R - 8)) continue;
        ctx.fillStyle = "#f4e08a";
        ctx.fillText(s.id, x, y);
      }
      if (this.bombMesh?.visible && (this.bombPlanted || this.bombDropped)) {
        drawBlip(this.bombMesh.position.x, this.bombMesh.position.z, "#ffcc33", 3.6);
      }
    }

    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(242,239,232,0.14)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R * 0.62, -Math.PI * 0.5 - 0.38, -Math.PI * 0.5 + 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(242,239,232,0.22)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(242,239,232,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  eyeHeight() {
    return THREE.MathUtils.lerp(EYE, 1.05 * BODY_K, this.crouch);
  }

  collide(pos, radius, height) {
    if (this.arena?.meshNav) {
      const solids = this.arena.nearbyWalk?.(pos.x, pos.z, radius + 1.2) || this.arena.nearbyWalls?.(pos.x, pos.z, radius + 1.2) || this.arena.wallMeshes;
      if (solids.length) {
        const ray = this._navRay;
        const origin = this._colOrigin;
        const dir = this._colDir;
        const n = this._colN;
        const head = Math.max(1.12 * BODY_K, height - 0.08);
        const heights = height > 1.05 * BODY_K ? [0.48 * BODY_K, head, height] : [0.48 * BODY_K];
        for (const h of heights) {
          const y = pos.y + h;
          const probeR = h >= height - 0.04 ? radius + 0.12 : radius;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            dir.set(Math.cos(a), 0, Math.sin(a));
            origin.set(pos.x, y, pos.z);
            ray.set(origin, dir);
            ray.near = 0;
            ray.far = probeR + 0.14;
            const hit = ray.intersectObjects(solids, false)[0];
            if (!hit || hit.object.userData.exploded) continue;
            const wb = hit.object.userData?.worldBox;
            if (wb && wb.min.y > y + 0.14) continue;
            const prop = Boolean(hit.object.userData.propSolid);
            if (hit.face) {
              n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
              if (n.dot(dir) > 0) n.negate();
              if (!prop && n.y > 0.42) continue;
              if (!prop && n.y > 0.28 && hit.point.y <= pos.y + 0.55) continue;
              if (prop && n.y > 0.72) continue;
              n.y = 0;
              if (n.lengthSq() < 0.0001) n.copy(dir).negate();
              else n.normalize();
            } else {
              n.copy(dir).negate();
            }
            const push = probeR + 0.06 - hit.distance;
            if (push > 0) {
              pos.x += n.x * push;
              pos.z += n.z * push;
            }
          }
        }
        this.resolvePropSolid(pos, radius, height, solids);
      }
      if (this.chests?.length) this.resolvePropSolid(pos, radius, height, this.chests.map((c) => c.mesh));
      const box = this.arena.worldBox;
      const m = 1.15;
      pos.x = Math.max(box.min.x + m, Math.min(box.max.x - m, pos.x));
      pos.z = Math.max(box.min.z + m, Math.min(box.max.z - m, pos.z));
      return;
    }
    const yMin = pos.y + 0.08;
    const yMax = pos.y + height;
    for (const c of this.arena.colliders) {
      const box = c.box;
      if (box.max.y - box.min.y < 0.42) continue;
      if (yMax < box.min.y || yMin > box.max.y) continue;
      const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
    pos.x = Math.max(-this.arena.halfX + 1.15, Math.min(this.arena.halfX - 1.15, pos.x));
    pos.z = Math.max(-this.arena.halfZ + 1.15, Math.min(this.arena.halfZ - 1.15, pos.z));
  }

  resolvePropSolid(pos, radius, height, solids) {
    const yMin = pos.y + 0.08;
    const yMax = pos.y + height;
    for (let pass = 0; pass < 2; pass++) {
      for (const mesh of solids) {
        if (!mesh.userData.propSolid || mesh.userData.exploded) continue;
        const box = mesh.userData.worldBox;
        if (!box) continue;
        if (box.max.y - box.min.y < 0.38) continue;
        if (yMax < box.min.y + 0.04 || yMin > box.max.y) continue;
        const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
        const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1e-8) {
          const left = pos.x - box.min.x;
          const right = box.max.x - pos.x;
          const south = pos.z - box.min.z;
          const north = box.max.z - pos.z;
          const m = Math.min(left, right, south, north);
          if (m === left) pos.x = box.min.x - radius;
          else if (m === right) pos.x = box.max.x + radius;
          else if (m === south) pos.z = box.min.z - radius;
          else pos.z = box.max.z + radius;
        } else if (d2 < radius * radius) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        }
      }
    }
  }

  blocked(x, z, radius = 0.7, y = 0.9) {
    return this.arena.blockedXZ(x, z, radius, y);
  }

  onRoof(x, z, y) {
    const fn = this.arena?.isRoofAt || this.arena?.isRooftop;
    return Boolean(fn?.(x, z, y));
  }

  safeBotPos(x, z, y = null) {
    const pos = new THREE.Vector3(x, Number.isFinite(y) ? y : 0.12, z);
    const dropped = this.arena.dropOffRoof?.(pos.x, pos.z, pos.y);
    if (dropped != null) pos.y = dropped;
    else {
      const gy = this.arena.groundAt?.(pos.x, pos.z, pos.y);
      if (gy != null) pos.y = gy;
    }
    this.unstuck(pos);
    if (this.botStandClear(pos.x, pos.z, pos.y)) return { x: pos.x, z: pos.z, y: pos.y };
    const open = this.nearestOpenAway(pos, pos, 2.4);
    pos.set(open.x, open.y, open.z);
    this.unstuck(pos);
    return { x: pos.x, z: pos.z, y: pos.y };
  }

  nearestOpenAway(target, from, minDist = 4.2) {
    const fy = from ? from.y : target.y || 0;
    const fx = from ? from.x : target.x;
    const fz = from ? from.z : target.z;
    const minSq = minDist * minDist;
    let best = null;
    let bestD = 1e9;
    let fallback = null;
    let fallbackD = -1;
    for (const w of this.arena.waypoints || []) {
      if (this.onRoof(w.x, w.z, w.y)) continue;
      if (Math.abs(w.y - fy) > 1.4) continue;
      const fromSq = (w.x - fx) ** 2 + (w.z - fz) ** 2;
      const toSq = (w.x - target.x) ** 2 + (w.z - target.z) ** 2;
      if (fromSq > fallbackD) {
        fallbackD = fromSq;
        fallback = w;
      }
      if (fromSq < minSq) continue;
      if (toSq < bestD) {
        bestD = toSq;
        best = w;
      }
    }
    const pick = best || fallback;
    if (!pick) return (from || target).clone();
    return pick.clone();
  }

  clearPath(ax, az, bx, bz, radius = 0.52, y = 0.9) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return !this.blocked(ax, az, radius, y);
    const steps = Math.max(2, Math.ceil(dist / 0.4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked(ax + dx * t, az + dz * t, radius, y)) return false;
    }
    return true;
  }

  nearestOpen(target, from = null) {
    const fy = from ? from.y : target.y || 0;
    let best = null;
    let bestD = 1e9;
    let bestAny = null;
    let bestAnyD = 1e9;
    for (const w of this.arena.waypoints) {
      const d = (w.x - target.x) ** 2 + (w.z - target.z) ** 2;
      if (d < bestAnyD) {
        bestAnyD = d;
        bestAny = w;
      }
      if (this.onRoof(w.x, w.z, w.y)) continue;
      if (Math.abs(w.y - fy) > 1.4) continue;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) return best.clone();
    if (bestAny) {
      const dropped = this.arena.dropOffRoof?.(bestAny.x, bestAny.z, bestAny.y);
      if (dropped != null) return new THREE.Vector3(bestAny.x, dropped, bestAny.z);
      return bestAny.clone();
    }
    return target.clone();
  }

  pickWaypoint(bot, goal) {
    const others = this.bots.filter((o) => o !== bot && o.alive);
    let best = null;
    let bestScore = -1e9;
    const px = bot.mesh.position.x;
    const pz = bot.mesh.position.z;
    const py = bot.mesh.position.y;
    const keepMoving = bot.mode !== "peek";
    for (const w of this.arena.waypoints) {
      if (this.onRoof(w.x, w.z, w.y)) continue;
      if (Math.abs(w.y - py) > 1.1) continue;
      let crowd = 0;
      for (const o of others) {
        const d = Math.hypot(w.x - o.mesh.position.x, w.z - o.mesh.position.z);
        if (d < 12) crowd += (12 - d) * (o.team === bot.team ? 1.35 : 0.7);
        if (o.waypoint) {
          const wd = Math.hypot(w.x - o.waypoint.x, w.z - o.waypoint.z);
          if (wd < 8) crowd += (8 - wd) * 0.9;
        }
      }
      const toGoal = Math.hypot(w.x - goal.x, w.z - goal.z);
      const toBot = Math.hypot(w.x - px, w.z - pz);
      if (toBot > 22) continue;
      const linger = keepMoving && toBot < 3.4 ? 48 : 0;
      const open = this.clearPath(px, pz, w.x, w.z, 0.5, py + 0.9);
      const here = Math.hypot(goal.x - px, goal.z - pz);
      const progress = here - toGoal;
      const score =
        -toGoal * 0.18 -
        toBot * 0.08 -
        crowd * 3.2 -
        linger +
        progress * 3.2 +
        (open ? 22 : -40) +
        Math.random() * 12;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best && Math.hypot(best.x - px, best.z - pz) > 1.8
      ? best.clone()
      : this.nearestOpenAway(goal, bot.mesh.position, keepMoving ? 5.5 : 1.2);
  }

  pickRoamTarget(bot) {
    const py = bot.mesh.position.y;
    const pos = bot.mesh.position;
    const pool = this.arena.waypoints.filter((w) => Math.abs(w.y - py) <= 1.1 && !this.onRoof(w.x, w.z, w.y));
    if (!pool.length) return this.nearestOpen(pos, pos);
    const others = this.bots.filter((o) => o !== bot && o.alive);
    const sector = bot.roamSector;
    const enemyZ = bot.team === "blue" ? -this.arena.halfZ * 0.45 : this.arena.halfZ * 0.45;
    let best = null;
    let bestScore = -1e9;
    let far = null;
    let farD = -1;
    for (const w of pool) {
      const distSelf = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (distSelf > farD) {
        farD = distSelf;
        far = w;
      }
      if (distSelf < 6.5) continue;
      const travel = distSelf < 7 ? distSelf * 0.15 : Math.min(24, distSelf) * 0.42;
      let crowd = 0;
      for (const o of others) {
        const d = Math.hypot(w.x - o.mesh.position.x, w.z - o.mesh.position.z);
        if (d < 16) crowd += (16 - d) * (o.team === bot.team ? 1.5 : 0.55);
        if (o.roamTarget) {
          const td = Math.hypot(w.x - o.roamTarget.x, w.z - o.roamTarget.z);
          if (td < 14) crowd += (14 - td) * 2.1;
        }
      }
      let flavor = 0;
      if (sector) flavor -= Math.hypot(w.x - sector.x, w.z - sector.z) * 0.12;
      if (bot.personality === "flank") flavor += Math.abs(w.x) * 0.18;
      else if (bot.personality === "push") flavor -= Math.abs(w.z - enemyZ) * 0.16;
      else flavor += Math.random() * 8;
      const score = travel - crowd * 2.6 + flavor + Math.random() * 22;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (best) return best.clone();
    if (far && farD > 2.4) return far.clone();
    return this.nearestOpenAway(pos, pos, 6);
  }

  pickHoldSpot(bot, lookAt) {
    const pos = bot.mesh.position;
    const py = pos.y;
    const lx = lookAt?.x ?? 0;
    const lz = lookAt?.z ?? 0;
    const others = this.bots.filter((o) => o !== bot && o.alive);
    const lookDist = Math.hypot(lx - pos.x, lz - pos.z) || 1;
    let best = null;
    let bestScore = -1e9;
    for (const w of this.arena.waypoints) {
      if (this.onRoof(w.x, w.z, w.y)) continue;
      if (Math.abs(w.y - py) > 1.1) continue;
      const toLook = Math.hypot(w.x - lx, w.z - lz);
      if (toLook < 4.5 || toLook > 24) continue;
      const toBot = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (toBot > 16) continue;
      if (!this.clearPath(pos.x, pos.z, w.x, w.z, 0.5, py + 0.9)) continue;
      let crowd = 0;
      for (const o of others) {
        const d = Math.hypot(w.x - o.mesh.position.x, w.z - o.mesh.position.z);
        if (d < 11) crowd += (11 - d) * (o.team === bot.team ? 1.8 : 0.6);
        if (o.holdSpot) {
          const hd = Math.hypot(w.x - o.holdSpot.x, w.z - o.holdSpot.z);
          if (hd < 9) crowd += (9 - hd) * 2.2;
        }
      }
      const side =
        Math.abs((w.x - pos.x) * -(lz - pos.z) + (w.z - pos.z) * (lx - pos.x)) / lookDist;
      const score = -toBot * 0.32 - crowd * 2.6 + Math.min(9, side) * 0.85 + Math.random() * 9;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best ? best.clone() : this.nearestOpen(new THREE.Vector3(lx, py, lz), pos);
  }

  steerDir(from, want) {
    const len = Math.hypot(want.x, want.z) || 1;
    const nx = want.x / len;
    const nz = want.z / len;
    const base = Math.atan2(nx, nz);
    const tries = [0, 0.7, -0.7, 1.6];
    let best = null;
    for (const a of tries) {
      const ang = base + a;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      if (this.blocked(from.x + dx * 1.6, from.z + dz * 1.6, 0.55, from.y + 0.9)) continue;
      const score = dx * nx + dz * nz - Math.abs(a) * 0.12;
      if (!best || score > best.s) best = { dx, dz, s: score };
    }
    if (!best) return new THREE.Vector3(-nx, 0, -nz);
    return new THREE.Vector3(best.dx, 0, best.dz);
  }

  groundY(pos, radius) {
    if (this.arena?.meshNav) {
      const y = this.arena.groundAt(pos.x, pos.z, pos.y, true);
      if (y == null) return null;
      if (y > pos.y + 0.58) return null;
      return y;
    }
    let gy = 0;
    for (const c of this.arena.colliders) {
      const box = c.box;
      if (
        pos.x + radius > box.min.x &&
        pos.x - radius < box.max.x &&
        pos.z + radius > box.min.z &&
        pos.z - radius < box.max.z
      ) {
        if (pos.y >= box.max.y - 0.55 && pos.y <= box.max.y + 0.7) {
          gy = Math.max(gy, box.max.y);
        }
      }
    }
    return gy;
  }

  mapMinY() {
    const box = this.arena?.worldBox;
    return (box?.min.y ?? -1) + 0.04;
  }

  restoreSafePos(pos = this.pos) {
    if (this._hasSafePos) pos.copy(this._safePos);
    else pos.copy(this.playerSpawn());
    this.unstuck(pos);
    if (this.blocked(pos.x, pos.z, RADIUS * 0.42, pos.y) || this.onRoof(pos.x, pos.z, pos.y)) {
      pos.copy(this.safePlayerPos(pos));
    }
    this.velY = 0;
    this.onGround = true;
    this._lastGroundY = pos.y;
  }

  markSafePos() {
    this._safePos.copy(this.pos);
    this._lastGroundY = this.pos.y;
    this._hasSafePos = true;
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  lookDir() {
    const cy = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cy,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cy
    ).normalize();
  }

  applyCamera(bobX = 0, bobY = 0) {
    const adsFov = this.marker?.userData?.adsFov ?? 48;
    const fov = THREE.MathUtils.lerp(72, adsFov, this.ads);
    if (Math.abs(this.camera.fov - fov) > 0.04) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.up.set(0, 1, 0);
    const eyeY = this.pos.y + this.eyeHeight() + bobY - (this.plantAmt || 0) * 0.28;
    let camY = eyeY;
    const ceilHere = this.arena.ceilingAt?.(this.pos.x, this.pos.z, this.pos.y + 0.28, 2.6);
    const look = this.forward();
    const ceilAhead = this.arena.ceilingAt?.(
      this.pos.x + look.x * 0.65,
      this.pos.z + look.z * 0.65,
      this.pos.y + 0.28,
      2.6
    );
    const ceil = ceilHere == null ? ceilAhead : ceilAhead == null ? ceilHere : Math.min(ceilHere, ceilAhead);
    if (ceil != null) camY = Math.min(camY, ceil - 0.18);
    this.camera.position.set(this.pos.x + bobX * (1 - this.ads * 0.7), camY, this.pos.z);
    this.clipCamera();
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    if (this.playerRig) {
      this.playerRig.position.copy(this.pos);
      this.playerRig.rotation.y = this.walkYaw;
      this.playerRig.visible = !this.out || this.roofDying || this.roofCorpse;
      const body = this.playerRig.userData.body;
      if (body && this.playerRig.userData.fpsView) {
        body.visible = Boolean(this.out || this.roofDying || this.roofCorpse);
      }
      this.applyPlayerClip();
    }
  }

  clipCamera() {
    const cam = this.camera.position;
    const pad = 0.22;
    let solids = this.arena.nearbyWalls?.(cam.x, cam.z, 2.2) || this.arena.wallMeshes;
    if (!solids?.length && !this.chests?.length) return;
    if (this.chests?.length) {
      solids = solids ? solids.slice() : [];
      for (const c of this.chests) if (c.mesh) solids.push(c.mesh);
    }
    if (!solids?.length) return;
    const ray = this._navRay;
    const origin = this._colOrigin;
    const dir = this._colDir;
    const n = this._colN;
    const skip = (hit) => !hit || hit.object.userData.exploded;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        dir.set(Math.cos(a), 0, Math.sin(a));
        origin.copy(cam);
        ray.set(origin, dir);
        ray.near = 0;
        ray.far = pad;
        const hit = ray.intersectObjects(solids, false)[0];
        if (skip(hit)) continue;
        if (hit.face) {
          n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
          if (n.dot(dir) > 0) n.negate();
        } else n.copy(dir).negate();
        n.y = 0;
        if (n.lengthSq() < 1e-6) continue;
        n.normalize();
        const push = pad - hit.distance;
        if (push > 0) {
          cam.x += n.x * push;
          cam.z += n.z * push;
        }
      }
    }

    const look = this.lookDir();
    origin.copy(cam);
    ray.set(origin, look);
    ray.near = 0;
    ray.far = pad;
    const lookHit = ray.intersectObjects(solids, false)[0];
    if (!skip(lookHit)) {
      if (lookHit.face) {
        n.copy(lookHit.face.normal).transformDirection(lookHit.object.matrixWorld).normalize();
        if (n.dot(look) > 0) n.negate();
      } else n.copy(look).negate();
      const push = pad - lookHit.distance;
      if (push > 0) cam.addScaledVector(n, push);
    }

    origin.set(this.pos.x, this.pos.y + 0.62 * BODY_K, this.pos.z);
    dir.subVectors(cam, origin);
    const dist = dir.length();
    if (dist > 0.03) {
      dir.multiplyScalar(1 / dist);
      ray.set(origin, dir);
      ray.near = 0.02;
      ray.far = dist;
      const through = ray.intersectObjects(solids, false)[0];
      if (!skip(through)) {
        cam.copy(through.point).addScaledVector(dir, -0.14);
      }
    }

    const ceil = this.arena.ceilingAt?.(cam.x, cam.z, this.pos.y + 0.28, 2.6);
    if (ceil != null) cam.y = Math.min(cam.y, ceil - 0.16);
  }

  applyPlayerClip() {
    const u = this.playerRig?.userData?.walkUniforms;
    if (!u?.uClipY) return;
    const base = this.playerRig.userData.fpsClipY;
    if (base == null) return;
    if (base >= 7) {
      u.uClipY.value = base;
      if (u.uLookDown) u.uLookDown.value = 0;
      return;
    }
    const lookDown = THREE.MathUtils.smoothstep(-0.14, -1.02, this.pitch);
    u.uClipY.value = base + lookDown * 0.28 * BODY_K;
    if (u.uLookDown) u.uLookDown.value = lookDown;
  }

  spectateTargets() {
    return this.bots.filter((b) => b.alive && b.mesh && !b.remote && b.team === this.playerTeam);
  }

  notePossessKey(e) {
    if (this.state !== "play" || !this.out || this.roofDying || this.eventMode) {
      this._possessBuf = "";
      return;
    }
    const ch = e.code?.startsWith("Key")
      ? e.code.slice(3).toLowerCase()
      : e.key?.length === 1
        ? e.key.toLowerCase()
        : "";
    if (!/[a-z]/.test(ch)) return;
    const now = performance.now();
    if (now - this._possessAt > 2500) this._possessBuf = "";
    this._possessAt = now;
    const word = "luca";
    const expect = word[this._possessBuf.length];
    if (ch !== expect) {
      this._possessBuf = ch === word[0] ? ch : "";
      return;
    }
    this._possessBuf += ch;
    if (this._possessBuf === word) {
      this._possessBuf = "";
      this.possessSpectate();
    }
  }

  possessSpectate() {
    if (this.state !== "play" || !this.out || this.eventMode) return;
    const targets = this.spectateTargets();
    if (!targets.length) return;
    if (!this.spectating || this.spectateIdx < 0) this.spectateIdx = 0;
    const bot = targets[this.spectateIdx % targets.length];
    if (!bot?.alive || !bot.mesh) return;

    if (bot.team && bot.team !== this.playerTeam) this.setPlayerTeam(bot.team);

    const hadBomb = this.bombMode && this.bombCarrier === bot;
    if (this.bombWorker === bot) {
      this.bombWorker = null;
      this.bombWork = 0;
      this.bombWorkKind = null;
    }
    this.pos.copy(bot.mesh.position);
    this.unstuck(this.pos);
    if (this.blocked(this.pos.x, this.pos.z, RADIUS * 0.42, this.pos.y) || this.onRoof(this.pos.x, this.pos.z, this.pos.y)) {
      this.pos.copy(this.safePlayerPos(this.pos));
    }
    this.yaw = bot.yaw ?? bot.mesh.rotation.y ?? 0;
    this.pitch = 0;
    if (hadBomb) this.giveBomb("player");

    this.scene.remove(bot.mesh);
    this.bots = this.bots.filter((b) => b !== bot);
    this.walkYaw = this.yaw;
    this.radarYaw = this.yaw;
    this.velY = 0;
    this.onGround = true;
    this.out = false;
    this.lives = 1;
    this.spectating = false;
    this.spectateIdx = -1;
    this.spectateSnap = true;
    this.roofDying = false;
    this.roofCorpse = false;
    this.roofFall = 0;
    this.equipWeapon(bot.weaponId || DEFAULT_WEAPON, true);
    this.hp = MAX_HP;
    this.grenades = bot.grenades > 0 ? 1 : this.grenades;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.crouch = 0;
    this.ads = 0;
    this.plantAmt = 0;
    this.recoil = 0;
    this.hitFlash = 0;
    this.bombBusy = false;
    this.walkPhase = bot.walkPhase || 0;
    this.walkAmt = 0;
    this.runAmt = 0;
    this.buttons.fire = false;
    this.buttons.aim = false;
    this.keys.delete("KeyC");
    this.keys.delete("KeyA");
    this.keys.delete("KeyD");
    this.keys.delete("KeyW");
    this.keys.delete("KeyS");
    this.markSafePos();

    this.marker.visible = true;
    if (!this.camera.children.includes(this.marker)) this.camera.add(this.marker);

    if (this.playerRig) {
      this.playerRig.visible = true;
      this.playerRig.position.copy(this.pos);
      this.playerRig.rotation.set(0, this.walkYaw, 0);
      if (this._playerClipY != null) this.playerRig.userData.fpsClipY = this._playerClipY;
      const u = this.playerRig.userData?.walkUniforms;
      if (u?.uClipY) u.uClipY.value = this._playerClipY ?? u.uClipY.value;
      if (u?.uLookDown) u.uLookDown.value = 0;
      const body = this.playerRig.userData.body;
      if (body && this.playerRig.userData.fpsView) {
        body.visible = false;
      }
    }

    if (Math.abs(this.camera.fov - 72) > 0.1) {
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
    }
    this.camera.up.set(0, 1, 0);
    this.syncHud();
    this.applyCamera(0, 0);
    this.lock();
    this.toast("Possessed", 1.2);
  }

  cycleSpectate() {
    const targets = this.spectateTargets();
    if (!targets.length) {
      this.spectating = false;
      this.spectateIdx = -1;
      this.toast("");
      return;
    }
    this.spectating = true;
    this.spectateSnap = true;
    this.spectateIdx = (this.spectateIdx + 1) % targets.length;
  }

  applySpectateCamera(dt = 0.016) {
    if (Math.abs(this.camera.fov - 72) > 0.1) {
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
    }
    const targets = this.spectateTargets();
    this.marker.visible = false;
    this.camera.remove(this.marker);
    if (!targets.length) {
      this.spectating = false;
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(0, 26, 18);
      this.camera.lookAt(0, 0.4, 0);
      return;
    }
    if (!this.spectating || this.spectateIdx < 0) {
      this.spectating = true;
      this.spectateIdx = 0;
      this.spectateSnap = true;
    }
    this.spectateIdx %= targets.length;
    const bot = targets[this.spectateIdx];
    const pos = bot.mesh.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(bot.mesh.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    else forward.normalize();
    const back = forward.clone().multiplyScalar(-1);

    const ceilHere = this.arena.ceilingAt?.(pos.x, pos.z, pos.y + 0.22, 3.2);
    const ceilAhead = this.arena.ceilingAt?.(
      pos.x + forward.x * 1.15,
      pos.z + forward.z * 1.15,
      pos.y + 0.22,
      3.2
    );
    const ceilY = ceilHere == null ? ceilAhead : ceilAhead == null ? ceilHere : Math.min(ceilHere, ceilAhead);
    const headroom = ceilY == null ? 3.4 : ceilY - pos.y;
    const tight = THREE.MathUtils.clamp((2.25 - headroom) / 1.2, 0, 1);

    const follow = THREE.MathUtils.lerp(5.1, 1.4, tight);
    const lift = THREE.MathUtils.lerp(0.85, 0.05, tight);
    const fromH = THREE.MathUtils.lerp(BOT_H, 0.78 * BODY_K, tight);
    const lookH = THREE.MathUtils.lerp(CHEST_Y, 0.7 * BODY_K, tight);
    const lookFwd = THREE.MathUtils.lerp(1.6, 0.65, tight);

    const desiredLook = pos.clone().add(new THREE.Vector3(0, lookH, 0)).addScaledVector(forward, lookFwd);
    const from = pos.clone().add(new THREE.Vector3(0, fromH, 0));
    const desiredCam = from.clone().add(new THREE.Vector3(0, lift, 0)).addScaledVector(back, follow);
    if (ceilY != null) {
      desiredCam.y = Math.min(desiredCam.y, ceilY - 0.2);
      desiredLook.y = Math.min(desiredLook.y, ceilY - 0.28);
    }

    const toCam = desiredCam.clone().sub(from);
    const dist = toCam.length();
    if (dist > 0.2) {
      const ray = new THREE.Raycaster(from, toCam.normalize(), 0.2, dist);
      let closest = null;
      const solids =
        this.arena.nearbyWalk?.(from.x, from.z, dist + 1.4) ||
        this.arena.nearbyWalls?.(from.x, from.z, dist + 1) ||
        this.arena.wallMeshes;
      if (solids) closest = ray.intersectObjects(solids, false)[0];
      else {
        for (const c of this.arena.colliders) {
          const hit = ray.intersectObject(c.mesh, true)[0];
          if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
        }
      }
      if (closest) {
        desiredCam.copy(closest.point).addScaledVector(ray.ray.direction, -0.55);
        desiredCam.y = Math.max(desiredCam.y, from.y + 0.1);
        if (ceilY != null) desiredCam.y = Math.min(desiredCam.y, ceilY - 0.18);
      }
    }

    if (this.spectateSnap || !this.spectateCamPos.lengthSq()) {
      this.spectateCamPos.copy(desiredCam);
      this.spectateLook.copy(desiredLook);
      this.spectateSnap = false;
    } else {
      const k = 1 - Math.exp(-6.2 * dt);
      this.spectateCamPos.lerp(desiredCam, k);
      this.spectateLook.lerp(desiredLook, k);
    }
    if (ceilY != null) {
      this.spectateCamPos.y = Math.min(this.spectateCamPos.y, ceilY - 0.18);
      this.spectateLook.y = Math.min(this.spectateLook.y, ceilY - 0.26);
    }
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.spectateCamPos);
    this.camera.lookAt(this.spectateLook);
  }

  updatePlayer(dt) {
    if (this.roofDying) {
      this.marker.visible = false;
      const xh = document.querySelector(".crosshair");
      if (xh) xh.style.opacity = "0";
      this.updatePlayerRoofDeath(dt);
      return;
    }
    if (this.out) {
      this.marker.visible = false;
      const xh = document.querySelector(".crosshair");
      if (xh) xh.style.opacity = "0";
      this.applySpectateCamera(dt);
      return;
    }

    this.marker.visible = true;
    const xhair = document.querySelector(".crosshair");
    this.ads = THREE.MathUtils.damp(this.ads, this.buttons.aim && !this.reloading && !this.bombBusy ? 1 : 0, 11, dt);
    if (xhair) xhair.style.opacity = String(0.82 * Math.max(0, 1 - this.ads * 1.15));
    this.crouch = THREE.MathUtils.damp(this.crouch, this.keys.has("KeyC") || this.bombBusy ? 1 : 0, 9, dt);
    this.plantAmt = THREE.MathUtils.damp(this.plantAmt || 0, this.bombBusy ? 1 : 0, 10, dt);
    const sprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.crouch < 0.35 && this.ads < 0.4 && !this.bombBusy;
    const speed = (this.crouch > 0.35 ? 3.15 : sprint ? 11.5 : 7.2) * (this.onGround ? 1 : 0.85);

    const f = this.forward();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) wish.add(f);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) wish.sub(f);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) wish.add(r);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) wish.sub(r);
    const bombWork = this.bombInteractKind();
    this.bombBusy = Boolean(bombWork && this.keys.has("KeyE"));
    if (this.bombBusy) wish.set(0, 0, 0);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * dt);

    const wasGrounded = this.onGround;
    this.pos.add(wish);
    const preMove = this.pos.clone();
    this.collide(this.pos, RADIUS, this.eyeHeight());
    if (this.arena?.meshNav) {
      const gyHere = this.arena.groundAt(this.pos.x, this.pos.z, this.pos.y, true);
      const droppedOff = gyHere == null || (wasGrounded && gyHere < preMove.y - 1.45);
      if (droppedOff) {
        this.pos.x = preMove.x - wish.x;
        this.pos.z = preMove.z - wish.z;
        this.collide(this.pos, RADIUS, this.eyeHeight());
      }
      if (this.blocked(this.pos.x, this.pos.z, RADIUS * 0.42, this.pos.y)) {
        this.unstuck(this.pos);
      }
    }

    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;
    const gy = this.groundY(this.pos, RADIUS);
    let feetOnSurface = false;
    if (gy == null || this.pos.y < this.mapMinY() - 0.8) {
      this.restoreSafePos();
      feetOnSurface = true;
    } else if (wasGrounded && gy < this.pos.y - 2.4 && this.velY <= 1) {
      this.restoreSafePos();
      feetOnSurface = true;
    } else {
      feetOnSurface = this.pos.y + 0.12 >= gy;
      if (wasGrounded && this.velY <= 1.2 && gy <= this.pos.y + 0.58 && gy >= this.pos.y - 0.28) {
        this.pos.y = gy;
        this.velY = 0;
        this.onGround = true;
      } else if (this.pos.y <= gy) {
        this.pos.y = gy;
        this.velY = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
      if (this.onGround && feetOnSurface) this.markSafePos();
    }
    const ceil = this.arena.ceilingAt?.(this.pos.x, this.pos.z, this.pos.y + 0.2, 2.4);
    if (ceil != null) {
      const floorY = gy ?? this._lastGroundY ?? this.pos.y;
      const maxY = ceil - this.eyeHeight() - 0.12;
      if (this.pos.y > maxY) {
        this.pos.y = Math.max(floorY, maxY);
        if (this.velY > 0) this.velY = 0;
      }
    }
    if (
      this.onGround &&
      feetOnSurface &&
      this.velY <= 0.2 &&
      gy != null &&
      Math.abs(this.pos.y - gy) <= 0.14 &&
      this.arena?.isRooftop?.(this.pos.x, this.pos.z, this.pos.y) &&
      !this.nearSpawnPad(this.pos.x, this.pos.z)
    ) {
      this.startPlayerRoofDeath();
      this.updatePlayerRoofDeath(dt);
      return;
    }
    if (this.keys.has("Space") && this.onGround && this.crouch < 0.4) {
      this.velY = 9.1;
      this.onGround = false;
    }

    const moving = wish.lengthSq() > 0 && this.onGround;
    if (wish.lengthSq() > 0) {
      const face = Math.atan2(-wish.x, -wish.z);
      this.walkYaw = this.lerpAngle(this.walkYaw, face, 1 - Math.exp(-12 * dt));
    } else {
      this.walkYaw = this.lerpAngle(this.walkYaw, this.yaw, 1 - Math.exp(-8 * dt));
    }
    this.walkAmt = THREE.MathUtils.damp(this.walkAmt, moving ? 1 : 0, 18, dt);
    this.runAmt = THREE.MathUtils.damp(this.runAmt, moving && sprint ? 1 : 0, 12, dt);
    const cadence = moving ? stepCadence(speed, this.runAmt) : 8;
    this.walkPhase += dt * cadence * this.walkAmt;
    this.animateWalk(this.playerRig, this.walkAmt, this.walkPhase, this.crouch, this.runAmt, 1, this.plantAmt);

    const bobMul = 1 - this.ads * 0.82 - this.crouch * 0.25;
    this.bob += dt * (moving ? (sprint ? 14 : 10) : 2);
    const bobY = moving ? Math.sin(this.bob) * 0.035 * bobMul : 0;
    const bobX = moving ? Math.cos(this.bob * 0.5) * 0.02 * bobMul : 0;

    this.applyCamera(bobX, bobY);

    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 14, dt);
    const loc = this.walkAmt * (1 - this.ads * 0.85);
    const run = this.runAmt * loc;
    const ph = this.walkPhase;
    const gunLift = Math.sin(ph) * THREE.MathUtils.lerp(0.014, 0.026, run) * loc;
    const gunStrafe = Math.cos(ph) * THREE.MathUtils.lerp(0.01, 0.02, run) * loc;
    const gunSurge = Math.cos(ph * 2) * THREE.MathUtils.lerp(0.006, 0.016, run) * loc;
    const gunRoll = Math.sin(ph) * THREE.MathUtils.lerp(0.022, 0.048, run) * loc;
    const gunPitch = Math.abs(Math.sin(ph)) * THREE.MathUtils.lerp(0.018, 0.034, run) * loc;
    const hipX = 0.24 + bobX * 0.35 + gunStrafe;
    const hipY = -0.2 - this.recoil * 0.55 + gunLift;
    const hipZ = -0.42 + this.recoil * 0.35 + gunSurge;
    const sight = this.marker.userData?.sight || new THREE.Vector3(0, 0.05, 0.08);
    const adsX = -sight.x;
    const adsY = -sight.y - this.recoil * 0.12;
    const adsZ = -sight.z - 0.028 + this.recoil * 0.08;
    this.marker.position.set(
      THREE.MathUtils.lerp(hipX, adsX, this.ads),
      THREE.MathUtils.lerp(hipY, adsY, this.ads),
      THREE.MathUtils.lerp(hipZ, adsZ, this.ads)
    );
    this.marker.rotation.set(
      THREE.MathUtils.lerp(0.05 + this.recoil * 1.6 + gunPitch, this.recoil * 0.35, this.ads),
      THREE.MathUtils.lerp(0.22, 0, this.ads),
      THREE.MathUtils.lerp(0.04 + gunRoll, 0, this.ads)
    );
    const plant = this.plantAmt || 0;
    if (plant > 0.01) {
      this.marker.position.x = THREE.MathUtils.lerp(this.marker.position.x, 0.1, plant);
      this.marker.position.y = THREE.MathUtils.lerp(this.marker.position.y, -0.62, plant);
      this.marker.position.z = THREE.MathUtils.lerp(this.marker.position.z, -0.38, plant);
      this.marker.rotation.x = THREE.MathUtils.lerp(this.marker.rotation.x, 1.05, plant);
      this.marker.rotation.y = THREE.MathUtils.lerp(this.marker.rotation.y, 0.08, plant);
      this.marker.visible = plant < 0.75;
    } else {
      this.marker.visible = true;
    }

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = getWeapon(this.weaponId || DEFAULT_WEAPON).ammo;
        this.toast("");
        this.syncHud();
      }
    }

    this.fireCooldown -= dt;
    if (this.buttons.fire && !this.bombBusy) this.tryFire();
  }

  tryFire() {
    if (this.out || this.reloading > 0 || this.fireCooldown > 0 || this.bombBusy) return;
    const spec = getWeapon(this.weaponId || DEFAULT_WEAPON);
    if (this.ammo <= 0) {
      this.audio.empty();
      this.fireCooldown = 0.18;
      this.toast("Reload");
      return;
    }
    this.ammo -= 1;
    this.fireCooldown = spec.fire;
    this.recoil = spec.recoil ?? 0.04;
    this.audio.shoot();
    this.syncHud();

    const dir = this.lookDir();
    const origin = this.camera.position.clone().addScaledVector(dir, 0.28);
    this.spawnTracer(origin, dir, this.playerTeam, null, spec.dmg);
    const muzzle = this.marker.userData.muzzle.clone();
    this.marker.localToWorld(muzzle);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleLight.intensity = 6.5;
  }

  spawnTracer(origin, dir, team, netFrom = null, dmg = null) {
    if (this.balls.length >= MAX_BALLS) {
      const old = this.balls.shift();
      this.scene.remove(old.mesh);
      old.mesh.material?.dispose();
    }
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.006, 0.62, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 })
    );
    mesh.position.copy(origin);
    const vel = dir.clone().multiplyScalar(BALL_SPEED);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel.clone().normalize());
    this.scene.add(mesh);
    const damage = Number.isFinite(dmg) ? dmg : getWeapon(this.weaponId || DEFAULT_WEAPON).dmg;
    this.balls.push({
      mesh,
      vel,
      team,
      life: 1.15,
      netFrom,
      dmg: damage,
    });
    this.alertFromShot(origin, team);
    if (this.netOnline && !netFrom) {
      this.net.sendShoot(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, team, damage);
    }
  }

  pingCombat(bot, heardPos) {
    if (!bot?.alive) return;
    bot.alert = Math.max(bot.alert || 0, 3.8);
    bot.reactIn = Math.min(bot.reactIn || 0, 0.06);
    bot.raiseAmt = Math.max(bot.raiseAmt || 0, 0.62);
    if (heardPos) {
      if (!bot.heardAt) bot.heardAt = heardPos.clone();
      else bot.heardAt.set(heardPos.x, heardPos.y, heardPos.z);
    }
    if (bot.mode === "roam" || bot.mode === "hold") bot.think = Math.min(bot.think, 0.02);
  }

  alertFromShot(origin, team) {
    const enemy = team === "blue" ? "red" : "blue";
    const r2 = 28 * 28;
    for (const bot of this.bots) {
      if (!bot.alive || bot.team !== enemy) continue;
      const dx = bot.mesh.position.x - origin.x;
      const dz = bot.mesh.position.z - origin.z;
      if (dx * dx + dz * dz > r2) continue;
      this.pingCombat(bot, origin);
    }
  }

  alertFromBall(b) {
    const p = b.mesh.position;
    const enemy = b.team === "blue" ? "red" : "blue";
    for (const bot of this.bots) {
      if (!bot.alive || bot.team !== enemy) continue;
      const dx = bot.mesh.position.x - p.x;
      const dz = bot.mesh.position.z - p.z;
      if (dx * dx + dz * dz > 36) continue;
      this.pingCombat(bot, p);
      bot.alert = Math.max(bot.alert, 3.2);
      bot.think = 0;
    }
  }

  normalFromBox(box, point) {
    const d = [
      { n: new THREE.Vector3(-1, 0, 0), v: Math.abs(point.x - box.min.x) },
      { n: new THREE.Vector3(1, 0, 0), v: Math.abs(point.x - box.max.x) },
      { n: new THREE.Vector3(0, -1, 0), v: Math.abs(point.y - box.min.y) },
      { n: new THREE.Vector3(0, 1, 0), v: Math.abs(point.y - box.max.y) },
      { n: new THREE.Vector3(0, 0, -1), v: Math.abs(point.z - box.min.z) },
      { n: new THREE.Vector3(0, 0, 1), v: Math.abs(point.z - box.max.z) },
    ];
    d.sort((a, b) => a.v - b.v);
    return d[0].n;
  }

  resolveSurface(prev, curr) {
    const ray = new THREE.Raycaster();
    const delta = curr.clone().sub(prev);
    const dist = delta.length();
    let hit = null;
    let hitNormal = new THREE.Vector3(0, 1, 0);
    let hitDist = Infinity;
    let hitObj = null;

    if (this.arena?.meshNav) {
      if (dist > 0.0001) {
        ray.set(prev, delta.clone().normalize());
        ray.far = dist + 0.12;
        const hits = ray
          .intersectObjects(
            this.arena.nearbyWalk?.(curr.x, curr.z, dist + 2.2) || this.arena.walkMeshes,
            false
          )
          .filter((h) => !h.object.userData.exploded);
        // Prefer a crate/barrel when a batched wall collider sits a few cm in front of it.
        const first = hits[0];
        const explosive = hits.find(
          (h) => h.object.userData.barrel && h.distance <= (first?.distance ?? 0) + 0.55
        );
        const chosen = explosive || first;
        if (chosen) {
          hit = chosen.point.clone();
          hitDist = chosen.distance;
          hitObj = chosen.object;
          if (chosen.face) {
            hitNormal = chosen.face.normal.clone().transformDirection(chosen.object.matrixWorld).normalize();
          }
        }
      }
      if (!hit) return null;
      const inbound = curr.clone().sub(prev);
      if (inbound.lengthSq() > 0 && hitNormal.dot(inbound) > 0) hitNormal.negate();
      return { point: hit, normal: hitNormal.normalize(), object: hitObj };
    }

    if (curr.y <= 0.05 || prev.y <= 0.05) {
      const t = prev.y <= 0.05 ? 0 : prev.y / (prev.y - curr.y);
      const p = prev.clone().lerp(curr, THREE.MathUtils.clamp(t, 0, 1));
      p.y = 0.02;
      hit = p;
      hitNormal.set(0, 1, 0);
      hitDist = prev.distanceTo(p);
    }

    if (dist > 0.0001) {
      ray.set(prev, delta.clone().normalize());
      ray.far = dist + 0.08;
      for (const c of this.arena.colliders) {
        const hits = ray.intersectObject(c.mesh, true);
        if (hits[0] && hits[0].distance < hitDist) {
          hit = hits[0].point.clone();
          hitDist = hits[0].distance;
          if (hits[0].face) {
            hitNormal = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize();
          } else {
            hitNormal = this.normalFromBox(c.box, hit);
          }
        }
      }
    }

    if (!hit) {
      for (const c of this.arena.colliders) {
        const box = c.box;
        if (
          curr.x >= box.min.x - 0.12 &&
          curr.x <= box.max.x + 0.12 &&
          curr.y >= box.min.y - 0.12 &&
          curr.y <= box.max.y + 0.12 &&
          curr.z >= box.min.z - 0.12 &&
          curr.z <= box.max.z + 0.12
        ) {
          hit = curr.clone();
          hitNormal = this.normalFromBox(box, curr);
          hit.x = THREE.MathUtils.clamp(hit.x, box.min.x, box.max.x);
          hit.y = THREE.MathUtils.clamp(hit.y, box.min.y, box.max.y);
          hit.z = THREE.MathUtils.clamp(hit.z, box.min.z, box.max.z);
          break;
        }
      }
    }

    if (!hit) return null;
    const inbound = curr.clone().sub(prev);
    if (inbound.lengthSq() > 0 && hitNormal.dot(inbound) > 0) hitNormal.negate();
    return { point: hit, normal: hitNormal.normalize() };
  }

  spawnSplat(point, normal, color) {
    const n = normal.clone().normalize();
    if (n.lengthSq() < 0.01) n.set(0, 1, 0);
    const tex = splatTexture(color);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: THREE.DoubleSide,
    });
    const size = 0.7 + Math.random() * 0.45;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.rotateZ(Math.random() * Math.PI);
    mesh.position.copy(point).addScaledVector(n, 0.028);
    this.scene.add(mesh);
    this.splats.push(mesh);

    while (this.splats.length > MAX_SPLATS) {
      const old = this.splats.shift();
      this.scene.remove(old);
      old.geometry?.dispose();
      old.material?.dispose();
    }
    return mesh;
  }

  spawnPuddle(x, z, y) {
    const gy = this.arena.groundAt?.(x, z, y) ?? y;
    const tex = puddleTexture(BLOOD);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.72 + Math.random() * 0.22, 28), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.position.set(x, gy + 0.018, z);
    this.scene.add(mesh);
    this.splats.push(mesh);
    while (this.splats.length > MAX_SPLATS) {
      const old = this.splats.shift();
      this.scene.remove(old);
      old.geometry?.dispose();
      old.material?.dispose();
    }
  }

  spawnDent(point, normal) {
    const n = normal.clone().normalize();
    if (n.lengthSq() < 0.01) n.set(0, 1, 0);
    const tex = dentTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      side: THREE.DoubleSide,
    });
    const size = 0.11 + Math.random() * 0.05;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.78), mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.rotateZ(Math.random() * Math.PI);
    mesh.position.copy(point).addScaledVector(n, 0.018);
    this.scene.add(mesh);
    this.dents.push({ mesh, life: DENT_LIFE });
    while (this.dents.length > MAX_DENTS) {
      const old = this.dents.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry?.dispose();
      old.mesh.material?.dispose();
    }
  }

  updateDents(dt) {
    for (let i = this.dents.length - 1; i >= 0; i--) {
      const d = this.dents[i];
      d.life -= dt;
      if (d.life < 0.8 && d.mesh.material) {
        d.mesh.material.opacity = Math.max(0, d.life / 0.8) * 0.92;
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.material?.dispose();
        this.dents.splice(i, 1);
      }
    }
  }

  resetBarrels() {
    if (!this.arena?.barrels) return;
    for (const b of this.arena.barrels) {
      b.alive = true;
      b.mesh.userData.exploded = false;
      b.mesh.visible = true;
    }
  }

  clearFires() {
    for (const f of this.fires) {
      this.scene.remove(f.group);
      for (const s of f.sprites || []) s.s.material?.dispose();
      f.shock?.geometry?.dispose();
      f.shock?.material?.dispose();
    }
    this.fires.length = 0;
    for (const g of this.thrown) this.scene.remove(g.mesh);
    this.thrown.length = 0;
    this.explodeWait.length = 0;
  }

  fireTex() {
    if (!this._fireTex) this._fireTex = fireTexture();
    return this._fireTex;
  }

  explodeAt(pos, byTeam = "blue", barrelMesh = null) {
    if (barrelMesh) {
      if (barrelMesh.userData.exploded) return;
      barrelMesh.userData.exploded = true;
      barrelMesh.visible = false;
      const rec = this.arena?.barrels?.find((b) => b.mesh === barrelMesh);
      if (rec) rec.alive = false;
      const box = barrelMesh.userData.worldBox;
      if (box) pos = box.getCenter(new THREE.Vector3());
    }
    this.audio.explode();
    this.spawnFire(pos, byTeam);
    this.blastKill(pos, BLAST_R, byTeam);
    if (this.arena?.barrels) {
      const r2 = (BLAST_R + 0.85) ** 2;
      for (const b of this.arena.barrels) {
        if (!b.alive) continue;
        if (b.center.distanceToSquared(pos) < r2) {
          this.explodeWait.push({ mesh: b.mesh, team: byTeam, t: 0.08 + Math.random() * 0.16 });
        }
      }
    }
  }

  explodeBomb(pos) {
    this._bombDetonating = true;
    if (this.audio.bombBlast) this.audio.bombBlast();
    else this.audio.explode();
    this.spawnFire(pos, "red", { bomb: true });
    this.bombFlash();
    const box = this.arena?.worldBox;
    const span = box
      ? Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)
      : 80;
    this.blastKill(pos, Math.max(72, span * 1.35), "red");
  }

  bombFlash() {
    const el = $("bomb-flash");
    if (!el) return;
    el.classList.add("on");
    setTimeout(() => el.classList.remove("on"), 980);
  }

  blastKill(pos, radius, byTeam) {
    const mapWipe = radius > 40;
    if (!this.out && (mapWipe || this.pos.distanceTo(pos) < radius)) {
      this.playerHit(pos.clone());
    }
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const p = bot.mesh.position;
      if (mapWipe || (Math.hypot(p.x - pos.x, p.z - pos.z) < radius && Math.abs(p.y - pos.y) < 2.4)) {
        this.paintBot(bot, p.clone(), null, byTeam);
      }
    }
  }

  spawnFire(pos, team = "blue", opts = {}) {
    const bomb = Boolean(opts.bomb);
    const group = new THREE.Group();
    group.position.copy(pos);
    const sprites = [];
    const tex = this.fireTex();
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const count = bomb ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(mat);
      if (bomb) {
        const r = 2.2 + Math.random() * 14;
        const a = Math.random() * Math.PI * 2;
        s.position.set(Math.cos(a) * r, 0.4 + Math.random() * 11, Math.sin(a) * r);
        s.scale.setScalar(5.5 + Math.random() * 10);
      } else {
        s.position.set((Math.random() - 0.5) * 1.4, 0.15 + Math.random() * 1.1, (Math.random() - 0.5) * 1.4);
        s.scale.setScalar(1.1 + Math.random() * 1.3);
      }
      group.add(s);
      sprites.push({ s, base: s.scale.x, phase: Math.random() * 6 });
    }
    let shock = null;
    if (bomb) {
      shock = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xff7a22,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      shock.position.y = 1.2;
      group.add(shock);
    }
    this.scene.add(group);
    this.fires.push({
      group,
      sprites,
      shock,
      bomb,
      pos: pos.clone(),
      team,
      life: bomb ? 2.4 : FIRE_LIFE,
      age: 0,
    });
  }

  updateFires(dt) {
    for (let i = this.explodeWait.length - 1; i >= 0; i--) {
      const w = this.explodeWait[i];
      w.t -= dt;
      if (w.t <= 0) {
        this.explodeWait.splice(i, 1);
        this.explodeAt(new THREE.Vector3(), w.team, w.mesh);
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.age += dt;
      f.life -= dt;
      const bomb = Boolean(f.bomb);
      const blast = bomb ? (f.age < 0.55 ? 80 : 0) : f.age < 0.28 ? BLAST_R : 2.35;
      const fireSeen = this.state !== "play" || this.sphereInView(f.pos.x, f.pos.y + (bomb ? 4 : 0.8), f.pos.z, bomb ? 28 : 5.2);
      f.group.visible = fireSeen;
      if (fireSeen) {
        for (const p of f.sprites) {
          const k = p.base * (0.82 + Math.sin(f.age * 11 + p.phase) * 0.22);
          p.s.scale.set(k, k * (bomb ? 1.45 : 1.25), 1);
          p.s.position.y = (bomb ? 0.6 : 0.2) + Math.abs(Math.sin(f.age * 8 + p.phase)) * (bomb ? 4.2 : 0.85);
          p.s.material.opacity = Math.min(1, f.life / (bomb ? 1.6 : 2.2)) * 0.95;
        }
        if (f.shock) {
          const k = 3 + f.age * 42;
          f.shock.scale.setScalar(k);
          f.shock.material.opacity = Math.max(0, 0.72 - f.age * 1.15);
        }
      }
      if (this.state === "play" && blast > 0) this.blastKill(f.pos, blast, f.team);
      if (f.life <= 0) {
        this.scene.remove(f.group);
        for (const p of f.sprites) p.s.material?.dispose();
        f.shock?.geometry?.dispose();
        f.shock?.material?.dispose();
        this.fires.splice(i, 1);
      }
    }
  }

  makeGrenade() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a4a32 })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.012, 6, 10),
      new THREE.MeshLambertMaterial({ color: 0x8a8f7a })
    );
    ring.position.y = 0.06;
    ring.rotation.x = Math.PI / 2;
    g.add(body, ring);
    return g;
  }

  throwGrenade() {
    if (this.state !== "play" || this.out || this.grenades <= 0 || this.bombBusy) return;
    this.grenades = 0;
    this.syncHud();
    const dir = this.lookDir();
    const mesh = this.makeGrenade();
    mesh.position.copy(this.camera.position).addScaledVector(dir, 0.55);
    const vel = dir.multiplyScalar(17.5);
    vel.y += 3.8;
    this.scene.add(mesh);
    this.thrown.push({ mesh, vel, fuse: NADE_FUSE, team: this.playerTeam, age: 0 });
    this.audio.tone?.(220, 0.06, "triangle", 0.04);
  }

  botThrowGrenade(bot, aimPos) {
    if (!bot.grenades) return;
    bot.grenades = 0;
    const origin = bot.mesh.position.clone();
    origin.y += CHEST_Y;
    const dir = aimPos.clone().sub(origin);
    dir.y += 1.1 + origin.distanceTo(aimPos) * 0.08;
    dir.normalize();
    const mesh = this.makeGrenade();
    mesh.position.copy(origin).addScaledVector(dir, 0.4);
    const vel = dir.multiplyScalar(14);
    this.scene.add(mesh);
    this.thrown.push({ mesh, vel, fuse: NADE_FUSE, team: bot.team, age: 0 });
  }

  updateGrenades(dt) {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const g = this.thrown[i];
      g.age += dt;
      g.fuse -= dt;
      const prev = g.mesh.position.clone();
      g.vel.y -= 22 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += dt * 8;
      g.mesh.rotation.z += dt * 5;
      if (g.age > 0.12) {
        const surface = this.resolveSurface(prev, g.mesh.position);
        if (surface) {
          if (surface.object?.userData?.barrel && !surface.object.userData.exploded) {
            this.explodeAt(surface.point, g.team, surface.object);
            this.scene.remove(g.mesh);
            this.thrown.splice(i, 1);
            continue;
          }
          g.mesh.position.copy(surface.point).addScaledVector(surface.normal, 0.07);
          g.vel.reflect(surface.normal);
          g.vel.multiplyScalar(0.48);
          if (surface.normal.y > 0.55 && g.vel.y < 0) g.vel.y *= 0.25;
        }
      }
      if (g.fuse <= 0) {
        this.explodeAt(g.mesh.position.clone(), g.team);
        this.scene.remove(g.mesh);
        this.thrown.splice(i, 1);
      }
    }
  }

  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const prev = b.mesh.position.clone();
      b.vel.y -= BALL_GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.vel.lengthSq() > 0.0001) {
        b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.vel.clone().normalize());
      }
      b.life -= dt;
      const delta = b.mesh.position.clone().sub(prev);
      const dist = delta.length();
      if (dist <= 0.0001) {
        if (b.life <= 0) {
          this.scene.remove(b.mesh);
          this.balls.splice(i, 1);
        }
        continue;
      }

      let hitKind = null;

      if (b.team === "blue" || b.team === "red") {
        for (const bot of this.bots) {
          if (!bot.alive || bot.team === b.team) continue;
          if (this.ballHitsBot(prev, b.mesh.position, bot)) {
            const dead = this.paintBot(bot, b.mesh.position.clone(), delta.clone().normalize(), b.team, false, b.dmg);
            if (dead && this.netOnline) {
              if (bot.netId) this.net.sendHit(bot.netId);
              else if (bot.netI != null) this.net.sendHitBot(bot.netI);
            }
            hitKind = "bot";
            break;
          }
        }
      }
      if (b.team !== this.playerTeam && !this.out && hitKind !== "bot") {
        const playerBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight() * 0.5, this.pos.z),
          new THREE.Vector3(0.7 * BODY_K, this.eyeHeight(), 0.7 * BODY_K)
        );
        if (playerBox.containsPoint(b.mesh.position) || playerBox.containsPoint(prev)) {
          this.playerHit(b.mesh.position.clone(), delta.clone().normalize(), false, b.dmg);
          if (this.netOnline && this.net.myId) this.net.sendHit(this.net.myId);
          hitKind = "player";
        }
      }

      if (!hitKind) {
        const surface = this.resolveSurface(prev, b.mesh.position);
        if (surface) {
          if (surface.object?.userData?.barrel && !surface.object.userData.exploded) {
            this.explodeAt(surface.point, b.team, surface.object);
          } else {
            this.spawnDent(surface.point, surface.normal);
            this.audio.impact();
          }
          hitKind = "world";
        }
      }

      if (hitKind !== "bot" && hitKind !== "player") this.alertFromBall(b);

      if (hitKind || b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.material?.dispose();
        this.balls.splice(i, 1);
      }
    }
  }

  ballHitsBot(prev, curr, bot) {
    const origin = bot.mesh.position;
    const radius = 0.52 * BODY_K;
    const yMin = origin.y + 0.12 * BODY_K;
    const yMax = origin.y + COMMANDO_H;
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const p = prev.clone().lerp(curr, s / steps);
      const dx = p.x - origin.x;
      const dz = p.z - origin.z;
      if (dx * dx + dz * dz <= radius * radius && p.y >= yMin && p.y <= yMax) return true;
    }
    return false;
  }

  paintBot(bot, point, inbound, byTeam = "blue", fromNet = false, dmg = MAX_HP) {
    if (!bot.alive) return false;
    const hit = fromNet ? MAX_HP : Number.isFinite(dmg) ? dmg : MAX_HP;
    bot.hp = (bot.hp ?? MAX_HP) - hit;
    if (!fromNet && bot.hp > 0) {
      this.audio.hit();
      this.pingCombat(bot, point);
      bot.think = 0;
      bot.stuck = 0;
      bot.pushOut = Math.max(bot.pushOut || 0, 2.2);
      if (bot.mode === "hold" || bot.mode === "roam") bot.mode = "advance";
      return false;
    }
    bot.alive = false;
    bot.hp = 0;
    bot.fall = 0.001;
    bot.blood = false;
    bot.deathX = bot.mesh.position.x;
    bot.deathZ = bot.mesh.position.z;
    if (bot.team !== this.playerTeam && !fromNet) this.elims += 1;
    if (this.bombMode && this.bombCarrier === bot) this.dropBomb(bot.mesh.position);
    if (this.bombWorker === bot) {
      this.bombWorker = null;
      this.bombWork = 0;
      this.bombWorkKind = null;
    }
    this.syncHud();
    if (!this._bombDetonating) this.audio.elim();

    if (!this._bombDetonating) {
      const dir = inbound && inbound.lengthSq() > 0 ? inbound.clone().normalize() : new THREE.Vector3(0, 0, 1);
      const behind = this.resolveSurface(point.clone().addScaledVector(dir, -0.2), point.clone().addScaledVector(dir, 2.2));
      if (behind) this.spawnSplat(behind.point, behind.normal, BLOOD);
    }

    if (this.eventMode && bot.team === this.enemyTeam() && byTeam === this.playerTeam) {
      this.splitEventBot(bot);
      return true;
    }
    this.checkRound();
    return true;
  }

  eventPadOffset(i) {
    const a = i * 2.399963;
    const r = 0.95 + (i % 5) * 0.62;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  resetLiveBot(bot, x, z, y, fight) {
    bot.alive = true;
    bot.hp = MAX_HP;
    bot.fall = 0;
    bot.blood = false;
    bot.roofDeath = false;
    bot.vel.set(0, 0, 0);
    bot.stuck = 0;
    bot.grenades = 1;
    bot.mode = "advance";
    bot.think = 0.05 + Math.random() * 0.08;
    bot.cooldown = 0.08 + Math.random() * 0.12;
    bot.alert = 3.2;
    bot.walkAmt = 0;
    bot.runAmt = 0;
    bot.mesh.rotation.x = 0;
    bot.mesh.rotation.z = 0;
    const safe = this.safeBotPos(x, z, y);
    bot.mesh.position.set(safe.x, safe.y, safe.z);
    bot.deathX = safe.x;
    bot.deathZ = safe.z;
    bot.lastPos.copy(bot.mesh.position);
    bot.waypoint = this.nearestOpen(new THREE.Vector3(safe.x, safe.y, safe.z), bot.mesh.position);
    bot.hadLos = false;
    bot.reactIn = 0.05;
    bot.raiseAmt = 0.55;
    bot.plantAmt = 0;
    bot.noiseX = 0;
    bot.noiseY = 0;
    bot.seeGrace = 0;
    bot.hearCd = 0;
    bot.holdSpot = null;
    if (fight) {
      if (!bot.heardAt) bot.heardAt = fight.clone();
      else bot.heardAt.copy(fight);
      if (!bot.lastSeen) bot.lastSeen = fight.clone();
      else bot.lastSeen.copy(fight);
    }
    const shadow = bot.mesh.userData?.shadow;
    if (shadow) {
      shadow.material.opacity = 0.3;
      shadow.scale.setScalar(1);
    }
    this.animateWalk(bot.mesh, 0, 0, 0, 0);
  }

  armEventRush(bot, fight) {
    if (!bot) return;
    bot.mode = "advance";
    bot.think = 0.05 + Math.random() * 0.08;
    bot.cooldown = 0.08 + Math.random() * 0.12;
    bot.alert = 3.2;
    bot.reactIn = 0.05;
    bot.raiseAmt = Math.max(bot.raiseAmt || 0, 0.5);
    if (fight) {
      if (!bot.heardAt) bot.heardAt = fight.clone();
      else bot.heardAt.copy(fight);
      if (!bot.lastSeen) bot.lastSeen = fight.clone();
      else bot.lastSeen.copy(fight);
    }
  }

  splitEventBot(dead) {
    const alive = this.teamAlive(this.enemyTeam());
    const slots = Math.max(0, EVENT_CAP - alive);
    if (slots <= 0) {
      this.syncHud();
      return;
    }
    const pad = this.enemySpawn();
    const fight = new THREE.Vector3(dead.deathX, pad.y, dead.deathZ);
    const seed = this.bots.length;
    const o0 = this.eventPadOffset(seed);
    this.resetLiveBot(dead, pad.x + o0[0], pad.z + o0[1], pad.y, fight);
    if (slots >= 2) {
      const o1 = this.eventPadOffset(seed + 1);
      const extra = this.spawnBot(this.enemyTeam(), pad.x + o1[0], pad.z + o1[1], seed + 1, pad.y);
      this.armEventRush(extra, fight);
      extra.waypoint = this.pickWaypoint(extra, fight);
    }
    dead.waypoint = this.pickWaypoint(dead, fight);
    const swarm = this.teamAlive(this.enemyTeam());
    this.swarmPeak = Math.max(this.swarmPeak, swarm);
    this.syncHud();
  }

  playerHit(point, inbound = null, fromNet = false, dmg = MAX_HP) {
    if (this.out) return;
    if (!fromNet) {
      const hit = Number.isFinite(dmg) ? dmg : MAX_HP;
      this.hp = Math.max(0, (this.hp ?? MAX_HP) - hit);
      this.hitFlash = 1;
      this.audio.hit();
      $("hit-flash")?.classList.add("on");
      setTimeout(() => $("hit-flash")?.classList.remove("on"), 180);
      this.syncHud();
      if (this.hp > 0) return;
    }
    this.out = true;
    this.lives = 0;
    this.hp = 0;
    this.hitFlash = 1;
    this.spectateIdx = 0;
    this.spectating = !this.eventMode;
    this.spectateSnap = true;
    this.roofDying = false;
    this.roofCorpse = false;
    this.marker.visible = false;
    if (this.playerRig) this.playerRig.visible = false;
    if (this.bombMode && this.bombCarrier === "player") this.dropBomb(this.pos);
    if (this.bombWorker === "player") {
      this.bombWorker = null;
      this.bombWork = 0;
      this.bombWorkKind = null;
    }
    this.syncHud();
    this.audio.hit();
    if (inbound && inbound.lengthSq() > 0) {
      const dir = inbound.clone().normalize();
      const behind = this.resolveSurface(
        point.clone().addScaledVector(dir, -0.15),
        point.clone().addScaledVector(dir, 2.2)
      );
      if (behind) this.spawnSplat(behind.point, behind.normal, BLOOD);
    }
    $("hit-flash")?.classList.add("on");
    setTimeout(() => $("hit-flash")?.classList.remove("on"), 180);
    if (this.eventMode) {
      this.gameOver(false);
      return;
    }
    this.checkRound();
  }

  teamAlive(team) {
    const ai = this.bots.filter((b) => b.team === team && b.alive).length;
    return ai + (this.playerTeam === team && !this.out ? 1 : 0);
  }

  netTeamPresent(team) {
    if (this.playerTeam === team) return true;
    if ((this.net?.players || []).some((p) => p.team === team)) return true;
    return this.bots.some((b) => b.remote && b.team === team);
  }

  checkRound() {
    if (this.roundLock || this.state !== "play" || this._bombDetonating) return;
    if (this.eventMode) return;
    if (this.netOnline && !this.net?.isHost) return;
    const redIn = !this.netOnline || this.netTeamPresent("red");
    const blueIn = !this.netOnline || this.netTeamPresent("blue");
    if (this.netOnline && (!redIn || !blueIn)) {
      const present = redIn ? "red" : blueIn ? "blue" : null;
      if (present && this.teamAlive(present) <= 0) {
        this.roundLock = true;
        setTimeout(() => {
          if (this.state === "play" && this.netOnline) this.startRound();
        }, 1800);
      }
      return;
    }
    if (this.bombMode) {
      if (this.bombPlanted) {
        if (blueIn && this.teamAlive("blue") <= 0) this.endRound("red");
        return;
      }
      if (redIn && this.teamAlive("red") <= 0) this.endRound("blue");
      else if (blueIn && this.teamAlive("blue") <= 0) this.endRound("red");
      return;
    }
    if (redIn && this.teamAlive("red") <= 0) this.endRound("blue");
    else if (blueIn && this.teamAlive("blue") <= 0) this.endRound("red");
  }

  endRound(winner) {
    if (this.roundLock) return;
    if (this.netOnline && !this.net?.isHost) return;
    this.roundLock = true;
    this._bombDetonating = false;
    if (winner === "blue") this.blueScore += 1;
    else this.redScore += 1;
    this.syncHud();
    if (this.netOnline) this.net.sendRound(winner, this.blueScore, this.redScore);
    const plantWin =
      this.bombMode && winner === "red" && this._playerPlanted && this.playerTeam === "red" && !this.netOnline;
    if (this.blueScore >= TO_WIN || this.redScore >= TO_WIN) {
      setTimeout(() => {
        if (this.state === "play") this.gameOver((this.playerTeam === "blue" ? this.blueScore : this.redScore) >= TO_WIN);
      }, 1100);
      return;
    }
    if (plantWin && Math.random() < 0.5) this._pendingSideSwap = true;
    setTimeout(() => {
      if (this.state !== "play") return;
      if (this._pendingSideSwap) {
        this._pendingSideSwap = false;
        this.setPlayerTeam(this.enemyTeam());
        this.toast(this.playerTeam === "blue" ? "Sides swapped · Police" : "Sides swapped · Terrorist", 2.4);
      }
      this.startRound();
    }, 2200);
  }

  lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  smooth01(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / Math.max(0.0001, b - a)));
    return t * t * (3 - 2 * t);
  }

  animateWalk(rig, amt, phase, crouch = 0, run = 0, raise = 1, plant = 0) {
    if (!rig?.userData) return;
    const up = THREE.MathUtils.clamp(raise, 0, 1);
    const plantK = THREE.MathUtils.clamp(plant, 0, 1);
    if (!rig.userData.fpsView) {
      rig.userData.poseSkeleton?.(amt, phase, crouch, run, up, plantK);
      const gun = rig.userData.gun;
      if (gun && !rig.userData.poseSkeleton) {
        gun.rotation.set(
          THREE.MathUtils.lerp(0.82, 0.1, up) + plantK * 0.85,
          THREE.MathUtils.lerp(0.1, 0.05, up),
          THREE.MathUtils.lerp(0.16, 0.04, up)
        );
        gun.position.set(
          THREE.MathUtils.lerp(0.16, 0.1, up) * BODY_K,
          THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.58, 1.02, up), 0.22, plantK) * BODY_K,
          THREE.MathUtils.lerp(THREE.MathUtils.lerp(-0.18, -0.3, up), -0.42, plantK) * BODY_K
        );
        gun.visible = plantK < 0.88;
      }
    }
    const u = rig.userData.walkUniforms;
    if (u) {
      u.uWalk.value = amt * (1 - plantK * 0.9);
      u.uPhase.value = phase;
      if (u.uCrouch) u.uCrouch.value = Math.min(1, crouch + plantK * 0.82);
      if (u.uRun) u.uRun.value = run * (1 - plantK);
      if (u.uLookDown) u.uLookDown.value = plantK;
      if (u.uClipY && rig.userData.fpsClipY != null && rig.userData.fpsClipY >= 7) {
        u.uClipY.value = rig.userData.fpsClipY;
      }
    }
    const pose = rig.userData.pose;
    if (pose) {
      const fps = rig.userData.fpsClipY != null;
      const walkLean = fps ? 0.018 : 0.022;
      const runLean = fps ? 0.045 : 0.055;
      const low = fps ? 0 : 1 - up;
      pose.rotation.x = -(0.02 + THREE.MathUtils.lerp(walkLean, runLean, run) * amt) - low * 0.18 - plantK * 0.52;
    }
  }

  animateDeath(bot, dt) {
    if (bot.roofDeath) {
      this.animateRoofDeath(bot, dt);
      return;
    }
    bot.fall += dt;
    const t = bot.fall;
    const pos = bot.mesh.position;
    const gy = this.arena.groundAt?.(bot.deathX, bot.deathZ, pos.y) ?? 0;
    const kneel = this.smooth01(0, 0.4, t);
    const fall = this.smooth01(0.34, 1.05, t);
    if (this.sphereInView(pos.x, pos.y + 0.6, pos.z, 4.6)) {
      this.animateWalk(bot.mesh, 0, 0, kneel * (1 - fall * 0.7));
    }
    bot.mesh.rotation.y = bot.yaw;
    bot.mesh.rotation.x = -0.42 * kneel * (1 - fall) - 1.48 * fall;
    const fwd = 0.62 * fall;
    pos.x = bot.deathX - Math.sin(bot.yaw) * fwd;
    pos.z = bot.deathZ - Math.cos(bot.yaw) * fwd;
    pos.y = gy;
    if (bot.mesh.userData.shadow) {
      bot.mesh.userData.shadow.material.opacity = 0.14;
      bot.mesh.userData.shadow.scale.setScalar(1 + fall * 0.9);
    }
    if (!bot.blood && fall > 0.52) {
      bot.blood = true;
      this.spawnPuddle(
        pos.x - Math.sin(bot.yaw) * 0.7,
        pos.z - Math.cos(bot.yaw) * 0.7,
        gy
      );
    }
  }

  animateRoofDeath(actor, dt) {
    actor.fall += dt;
    const t = actor.fall;
    const mesh = actor.mesh;
    const pos = mesh.position;
    const gy = actor.deathY ?? this.arena.groundAt?.(actor.deathX, actor.deathZ, pos.y) ?? 0;
    const land = this.smooth01(0.12, 0.92, t);
    this.animateWalk(mesh, 0, 0, 0, 0);
    const pose = mesh.userData?.pose;
    if (pose) pose.rotation.x = 0;
    mesh.rotation.y = actor.yaw;
    mesh.rotation.x = 1.52 * land;
    const back = 0.52 * land;
    pos.x = actor.deathX + Math.sin(actor.yaw) * back;
    pos.z = actor.deathZ + Math.cos(actor.yaw) * back;
    pos.y = gy + (1 - land) * 0.06;
    if (mesh.userData.shadow) {
      mesh.userData.shadow.material.opacity = 0.12;
      mesh.userData.shadow.scale.setScalar(1 + land * 1.15);
    }
  }

  startPlayerRoofDeath() {
    if (this.out || this.roofDying) return;
    this.out = true;
    this.lives = 0;
    this.roofDying = true;
    this.roofCorpse = true;
    this.roofFall = 0;
    this.roofNoted = false;
    this.spectating = false;
    this.marker.visible = false;
    this.buttons.fire = false;
    if (this.bombMode && this.bombCarrier === "player") this.dropBomb(this.pos);
    if (this.bombWorker === "player") {
      this.bombWorker = null;
      this.bombWork = 0;
      this.bombWorkKind = null;
    }
    this.roofDeathX = this.pos.x;
    this.roofDeathZ = this.pos.z;
    this.roofDeathY = this.pos.y;
    this.roofYaw = this.walkYaw;
    if (this.playerRig) {
      this.playerRig.visible = true;
      this.playerRig.position.copy(this.pos);
      this.playerRig.rotation.set(0, this.walkYaw, 0);
      this.playerRig.userData.fpsClipY = 8;
      if (this.playerRig.userData.body) this.playerRig.userData.body.visible = true;
      const u = this.playerRig.userData.walkUniforms;
      if (u?.uClipY) u.uClipY.value = 8;
    }
    this._roofActor = {
      mesh: this.playerRig,
      fall: 0,
      deathX: this.roofDeathX,
      deathZ: this.roofDeathZ,
      deathY: this.roofDeathY,
      yaw: this.roofYaw,
    };
    this.audio.hit();
    this.syncHud();
  }

  updatePlayerRoofDeath(dt) {
    if (!this._roofActor || !this.playerRig) {
      this.finishPlayerRoofDeath();
      return;
    }
    this._roofActor.fall = this.roofFall;
    this.animateRoofDeath(this._roofActor, dt);
    this.roofFall = this._roofActor.fall;
    this.pos.copy(this.playerRig.position);
    this.applyRoofDeathCamera(dt);
    if (!this.roofNoted && this.roofFall > 1.05) {
      this.roofNoted = true;
      this.toast("don't try to go up there next time...", 4.2, true);
    }
    if (this.roofFall > 3.35) this.finishPlayerRoofDeath();
  }

  applyRoofDeathCamera(dt) {
    const p = this.playerRig.position;
    const yaw = this.roofYaw;
    const land = this.smooth01(0.12, 0.92, this.roofFall);
    const dist = 3.35 + land * 0.7;
    const height = 1.7 - land * 0.62;
    const desiredCam = new THREE.Vector3(
      p.x + Math.sin(yaw) * dist,
      p.y + height,
      p.z + Math.cos(yaw) * dist
    );
    const look = new THREE.Vector3(p.x, p.y + 0.58 - land * 0.22, p.z);
    if (this.roofFall < 0.06) {
      this.spectateCamPos.copy(desiredCam);
      this.spectateLook.copy(look);
    } else {
      const k = 1 - Math.exp(-5.4 * dt);
      this.spectateCamPos.lerp(desiredCam, k);
      this.spectateLook.lerp(look, k);
    }
    if (Math.abs(this.camera.fov - 68) > 0.1) {
      this.camera.fov = 68;
      this.camera.updateProjectionMatrix();
    }
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.spectateCamPos);
    this.camera.lookAt(this.spectateLook);
  }

  finishPlayerRoofDeath() {
    this.roofDying = false;
    this.roofCorpse = true;
    this.spectating = !this.eventMode;
    this.spectateSnap = true;
    this.spectateIdx = 0;
    if (this.eventMode) {
      this.gameOver(false);
      return;
    }
    this.checkRound();
  }

  killOnRoof(bot) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.hp = 0;
    bot.fall = 0.001;
    bot.blood = true;
    bot.roofDeath = true;
    bot.deathX = bot.mesh.position.x;
    bot.deathZ = bot.mesh.position.z;
    bot.deathY = bot.mesh.position.y;
    if (bot.team !== this.playerTeam) this.elims += 1;
    if (this.bombMode && this.bombCarrier === bot) this.dropBomb(bot.mesh.position);
    if (this.bombWorker === bot) {
      this.bombWorker = null;
      this.bombWork = 0;
      this.bombWorkKind = null;
    }
    this.syncHud();
    this.audio.elim();
    this.checkRound();
  }

  animateBot(bot, dt, moving, draw = true) {
    const speed = bot.vel.length();
    bot.walkAmt = THREE.MathUtils.damp(bot.walkAmt, moving ? 1 : 0, 18, dt);
    const runT = moving ? THREE.MathUtils.smoothstep(bot.maxSpeed * 0.58, bot.maxSpeed * 0.9, speed) : 0;
    bot.runAmt = THREE.MathUtils.damp(bot.runAmt, runT, 10, dt);
    const lookX = -Math.sin(bot.yaw);
    const lookZ = -Math.cos(bot.yaw);
    const along = bot.vel.x * lookX + bot.vel.z * lookZ;
    const sign = along < -0.12 ? -1 : 1;
    const cadence = moving ? stepCadence(speed, bot.runAmt) : 8;
    bot.walkPhase += dt * cadence * bot.walkAmt * sign;
    const plant = bot.plantAmt || 0;
    if (draw) {
      this.animateWalk(
        bot.mesh,
        bot.walkAmt * (1 - plant * 0.9),
        bot.walkPhase,
        plant * 0.72,
        bot.runAmt * (1 - plant),
        (bot.raiseAmt ?? 1) * (1 - plant * 0.85),
        plant
      );
    }
  }

  combatAim(bot, playerPos) {
    const foes = [];
    const enemy = bot.team === "red" ? "blue" : "red";
    const from = bot.mesh.position;
    const lookX = -Math.sin(bot.yaw);
    const lookZ = -Math.cos(bot.yaw);
    const fovCos = bot.alert > 0 ? (bot.fovCos ?? 0.45) * 0.82 : (bot.fovCos ?? 0.45);

    const addFoe = (x, y, z, isPlayer = false) => {
      const dx = x - from.x;
      const dz = z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 48 && !(this.eventMode && isPlayer)) return;
      const len = dist || 1;
      const ahead = (dx / len) * lookX + (dz / len) * lookZ;
      const inCone = ahead > fovCos || (dist < 2.6 && ahead > 0.12);
      if (!inCone) {
        if (isPlayer && dist < 3.1) {
          bot.alert = Math.max(bot.alert || 0, 1.5);
          if (!bot.heardAt) bot.heardAt = new THREE.Vector3(x, y, z);
          else if ((bot.hearCd || 0) <= 0) {
            bot.heardAt.set(x, y, z);
            bot.hearCd = 0.4;
          }
        }
        return;
      }
      this._losFrom.set(from.x, from.y + 1.5 * BODY_K, from.z);
      this._losTo.set(x, y, z);
      if (!this.hasLos(this._losFrom, this._losTo)) return;
      foes.push({ x, y, z, dist, seen: true, isPlayer });
    };

    if (bot.team !== this.playerTeam && !this.out) {
      addFoe(playerPos.x, playerPos.y, playerPos.z, true);
      const player = foes[0];
      if (player?.isPlayer && player.dist < 24 && (bot.lane % 3 !== 2 || player.dist < 10)) return player;
    }
    for (const other of this.bots) {
      if (!other.alive || other.team !== enemy) continue;
      addFoe(other.mesh.position.x, other.mesh.position.y + CHEST_Y, other.mesh.position.z);
    }
    if (!foes.length) return null;
    foes.sort((a, b) => a.dist - b.dist);
    const player = foes.find((f) => f.isPlayer);
    if (player && player.dist < 24 && (bot.lane % 3 !== 2 || player.dist < 10)) return player;
    return foes[bot.lane % Math.min(3, foes.length)];
  }

  chooseBotMode(bot, los, dist, engaged) {
    const roll = Math.random();
    if (this.bombMode && (!engaged || dist > 12 || this.bombCarrier === bot || this.bombPlanted)) {
      return "advance";
    }
    if (this.eventMode && bot.team === this.enemyTeam()) {
      if ((bot.pushOut || 0) > 0) return "advance";
      if (los && dist < 8) return roll > 0.35 ? "peek" : "strafe";
      if (los && dist < 16) return roll > 0.45 ? "strafe" : roll > 0.2 ? "peek" : "advance";
      if (!los && roll < 0.28) return "hold";
      return "advance";
    }
    if (!engaged) {
      if ((bot.pushOut || 0) > 0) {
        if (bot.personality === "flank") return "flank";
        if (bot.personality === "push") return "advance";
        return "roam";
      }
      if (bot.personality === "wander" && roll < 0.22) return "hold";
      if (bot.personality === "flank" && roll < 0.5) return "flank";
      if (bot.personality === "push" && roll < 0.38) return "advance";
      return "roam";
    }
    if (los && dist < 7) {
      if (bot.personality === "push") return roll > 0.28 ? "strafe" : "peek";
      return roll > 0.32 ? "peek" : "strafe";
    }
    if (los && dist < 16) {
      if (bot.personality === "flank") return roll > 0.4 ? "flank" : "strafe";
      if (bot.personality === "push") return roll > 0.42 ? "advance" : "strafe";
      return roll > 0.4 ? "peek" : roll > 0.16 ? "hold" : "strafe";
    }
    if (!los) {
      if (bot.personality === "flank") return roll < 0.6 ? "flank" : "advance";
      if (bot.personality === "push") return roll < 0.7 ? "advance" : "hold";
      return roll < 0.48 ? "hold" : "advance";
    }
    if (bot.personality === "flank") return roll < 0.58 ? "flank" : "advance";
    if (bot.personality === "push") return "advance";
    return roll < 0.4 ? "strafe" : "advance";
  }

  updateBots(dt) {
    const playerPos = this._playerAim;
    playerPos.set(this.pos.x, this.pos.y + this.eyeHeight() * 0.6, this.pos.z);
    for (const bot of this.bots) {
      if (!bot.alive) {
        this.animateDeath(bot, dt);
        continue;
      }
      if (bot.cine) continue;
      if (this.netOnline && !bot.remote) continue;
      if (bot.remote || bot.netPuppet) {
        this.applyNetBot(bot, dt);
        continue;
      }

      bot.pushOut = Math.max(0, (bot.pushOut || 0) - dt);
      if (bot.pushOut > 0 && (bot.mode === "hold" || bot.mode === "peek")) bot.mode = "roam";

      bot.cooldown -= dt;
      bot.think -= dt;
      bot.hearCd = Math.max(0, (bot.hearCd || 0) - dt);
      const pos = bot.mesh.position;
      const target = this.combatAim(bot, playerPos);
      const los = Boolean(target?.seen);
      bot.alert = Math.max(0, (bot.alert || 0) - dt);
      if (los) {
        const seenAt = new THREE.Vector3(target.x, target.y, target.z);
        bot.alert = Math.max(bot.alert, 5.2);
        if (!bot.lastSeen) bot.lastSeen = seenAt.clone();
        else bot.lastSeen.copy(seenAt);
        if (!bot.heardAt) bot.heardAt = seenAt.clone();
        else bot.heardAt.copy(seenAt);
        if (!bot.hadLos) {
          const fresh = (bot.seeGrace || 0) <= 0;
          const hot = (bot.alert || 0) > 0.35 || (bot.raiseAmt || 0) > 0.4;
          if (hot) {
            bot.reactIn = Math.min(bot.reactIn || 0, 0.08);
          } else {
            bot.reactIn = fresh ? bot.reactTime ?? 0.16 : Math.max(bot.reactIn || 0, 0.08);
            if (fresh) bot.raiseAmt = Math.min(bot.raiseAmt || 0, 0.22);
          }
          for (const other of this.bots) {
            if (other === bot || !other.alive || other.team !== bot.team) continue;
            const dx = other.mesh.position.x - pos.x;
            const dz = other.mesh.position.z - pos.z;
            if (dx * dx + dz * dz < 22 * 22) this.pingCombat(other, seenAt);
          }
        }
        bot.seeGrace = 0.45;
        if (bot.mode === "roam") bot.think = 0;
      } else {
        bot.seeGrace = Math.max(0, (bot.seeGrace || 0) - dt);
      }
      bot.reactIn = Math.max(0, (bot.reactIn || 0) - dt);
      const wantUp = los || (bot.seeGrace > 0 && (bot.raiseAmt || 0) > 0.35);
      bot.raiseAmt = THREE.MathUtils.damp(bot.raiseAmt || 0, wantUp ? 1 : 0, wantUp ? 11 : 8, dt);
      bot.hadLos = los;
      const inFight = los || bot.alert > 0 || (this.eventMode && bot.team === this.enemyTeam());
      const huntPos =
        los && target
          ? new THREE.Vector3(target.x, target.y, target.z)
          : bot.lastSeen ||
            bot.heardAt ||
            (this.eventMode && bot.team === this.enemyTeam() ? this.playerSpawn() : null);
      const dist = huntPos ? Math.hypot(huntPos.x - pos.x, huntPos.z - pos.z) : 40;

      if (this.bombMode) {
        this.tryBotBombPickup(bot);
        const working = this.botAtBombWork(bot, los, dist);
        bot.plantAmt = THREE.MathUtils.damp(bot.plantAmt || 0, working ? 1 : 0, 9, dt);
        if (working) {
          bot.vel.set(0, 0, 0);
          this.botBombWork(bot, dt);
          this.animateBot(bot, dt, false, this.sphereInView(pos.x, pos.y + 0.9, pos.z, 4.6));
          continue;
        }
      } else {
        bot.plantAmt = THREE.MathUtils.damp(bot.plantAmt || 0, 0, 9, dt);
      }

      bot.roamIn -= dt;
      if (bot.mode === "roam" && bot.roamTarget && Math.hypot(bot.roamTarget.x - pos.x, bot.roamTarget.z - pos.z) < 2.6) {
        bot.roamIn = 0;
      }
      if (!bot.roamTarget || (bot.roamIn <= 0 && bot.mode === "roam")) {
        bot.roamTarget = this.pickRoamTarget(bot);
        bot.roamIn = 5.2 + Math.random() * 5.8;
      }

      const goal = new THREE.Vector3();
      const px = bot.preferredX || 0;
      if (!inFight) {
        if (bot.mode === "hold") {
          if (!bot.holdSpot || bot.roamIn <= 0) {
            bot.holdSpot = this.pickHoldSpot(bot, this.enemySpawn());
            bot.roamIn = 2.8 + Math.random() * 3.5;
          }
          goal.copy(bot.holdSpot);
        } else {
          goal.copy(bot.roamTarget || pos);
        }
      } else if (!huntPos) {
        goal.copy(bot.roamTarget || pos);
      } else if (bot.mode === "hold") {
        if (!bot.holdSpot || bot.roamIn <= 0) {
          bot.holdSpot = this.pickHoldSpot(bot, huntPos);
          bot.roamIn = 1.6 + Math.random() * 2.2;
        }
        goal.copy(bot.holdSpot);
      } else if (bot.mode === "flank") {
        goal.set(huntPos.x + bot.strafe * (11 + bot.lane * 2.1), 0, huntPos.z + bot.strafe * 3.2);
      } else if (bot.mode === "retreat") {
        goal.set(
          px + bot.strafe * 5.5,
          0,
          bot.team === "blue" ? Math.min(this.arena.halfZ - 4, pos.z + 8) : Math.max(-this.arena.halfZ + 4, pos.z - 8)
        );
      } else if (bot.mode === "peek") {
        const close = dist < 6.5 ? -0.22 : 0.08;
        goal.set(
          pos.x + bot.strafe * 3.4 + (huntPos.x - pos.x) * close,
          0,
          pos.z + bot.strafe * 0.35 + (huntPos.z - pos.z) * close
        );
      } else if (!los || bot.mode === "roam" || bot.mode === "advance") {
        goal.set(huntPos.x, 0, huntPos.z);
      } else if (this.eventMode && bot.team === this.enemyTeam() && bot.mode === "strafe") {
        goal.set(huntPos.x, 0, huntPos.z);
      } else {
        goal.set(
          THREE.MathUtils.lerp(huntPos.x, px, 0.22),
          0,
          THREE.MathUtils.lerp(huntPos.z, bot.team === "blue" ? -6 : 6, 0.12)
        );
      }
      const bombObj = this.bombObjective(bot);
      if (bombObj && (!inFight || dist > 11 || this.bombCarrier === bot || this.bombPlanted || this.bombDropped)) {
        goal.copy(bombObj);
      }
      if (this.blocked(goal.x, goal.z, 0.9, pos.y + 0.9)) {
        const open = this.nearestOpen(goal, pos);
        goal.copy(open);
      }
      if (!bot.waypoint) bot.waypoint = this.pickWaypoint(bot, goal);
      const toWp = Math.hypot(bot.waypoint.x - pos.x, bot.waypoint.z - pos.z);
      if (bot.think <= 0 || toWp < 1.35) {
        bot.think = inFight ? 0.08 + Math.random() * 0.16 : 0.5 + Math.random() * 0.85;
        if (Math.random() > 0.42) bot.strafe *= -1;
        const prevMode = bot.mode;
        bot.mode = this.chooseBotMode(bot, los, dist, inFight);
        if (bot.mode === "hold") bot.think = 0.85 + Math.random() * 1.3;
        else if (bot.mode === "peek") bot.think = 0.16 + Math.random() * 0.22;
        if (bot.mode === "roam" && prevMode !== "roam") {
          bot.roamTarget = this.pickRoamTarget(bot);
          bot.roamIn = 5.2 + Math.random() * 5.8;
          bot.holdSpot = null;
        }
        if (bot.mode !== "hold") bot.holdSpot = prevMode === "hold" ? null : bot.holdSpot;
        bot.waypoint = this.pickWaypoint(bot, bot.mode === "roam" ? bot.roamTarget : goal);
      }

      if (bot.mode === "peek" || bot.mode === "strafe") {
        bot.peekT = (bot.peekT || 0) + dt;
        if (bot.peekT > (bot.mode === "peek" ? 0.26 : 0.52)) {
          bot.strafe *= -1;
          bot.peekT = 0;
        }
      }

      const want = new THREE.Vector3(bot.waypoint.x - pos.x, 0, bot.waypoint.z - pos.z);
      if (bot.mode === "strafe" || bot.mode === "peek") {
        const side = new THREE.Vector3(-want.z, 0, want.x);
        if (side.lengthSq() > 0.0001) {
          side.normalize().multiplyScalar(bot.strafe * (bot.mode === "peek" ? 1.55 : 0.82));
          want.add(side);
        }
      }
      if (bot.mode === "hold" && (bot.pushOut || 0) <= 0 && Math.hypot(goal.x - pos.x, goal.z - pos.z) < 1.6) {
        want.set(0, 0, 0);
      }
      const desired = this.steerDir(pos, want.lengthSq() > 0.01 ? want : new THREE.Vector3(0, 0, bot.team === "blue" ? -1 : 1));

      const err = bot.aimErr ?? 0.04;
      bot.noiseX += ((Math.random() - 0.5) * 2 - bot.noiseX) * Math.min(1, dt * 2.6);
      bot.noiseY += ((Math.random() - 0.5) * 2 - bot.noiseY) * Math.min(1, dt * 2.2);
      const fireAt = los && target ? huntPos : bot.lastSeen || huntPos;
      const tracking = Boolean(fireAt) && (los || bot.seeGrace > 0);
      let lookTarget;
      if (tracking) {
        lookTarget = fireAt.clone();
        if (bot.reactIn <= 0) {
          lookTarget.x += bot.noiseX * err * Math.min(18, dist);
          lookTarget.y += bot.noiseY * err * 7;
        }
      } else if (inFight && huntPos) {
        lookTarget = huntPos.clone();
        if (lookTarget.y < pos.y + 0.8) lookTarget.y = pos.y + CHEST_Y;
      } else {
        lookTarget = pos.clone().add(desired);
      }
      const turn = tracking ? (bot.reactIn > 0 ? 7.5 : bot.trackRate ?? 12) : inFight ? 10 : 7;
      bot.yaw = this.lerpAngle(
        bot.yaw,
        Math.atan2(-(lookTarget.x - pos.x), -(lookTarget.z - pos.z)),
        1 - Math.exp(-turn * dt)
      );
      bot.mesh.rotation.y = bot.yaw;

      const nearHold = (bot.pushOut || 0) <= 0 && bot.mode === "hold" && Math.hypot(goal.x - pos.x, goal.z - pos.z) < 1.8;
      const targetSpeed = nearHold
        ? bot.maxSpeed * 0.12
        : bot.mode === "peek"
          ? bot.maxSpeed * 0.55
          : bot.mode === "roam" && !inFight
            ? bot.maxSpeed * 0.7
            : bot.mode === "strafe"
              ? bot.maxSpeed * 0.96
              : bot.maxSpeed;
      const accel = 28;
      if (nearHold) {
        bot.vel.x *= Math.max(0, 1 - dt * 10);
        bot.vel.z *= Math.max(0, 1 - dt * 10);
      } else {
        bot.vel.x += desired.x * accel * dt;
        bot.vel.z += desired.z * accel * dt;
      }
      const max = targetSpeed;
      if (bot.vel.length() > max) bot.vel.setLength(max);

      const intended = pos.clone().addScaledVector(bot.vel, dt);
      const preBot = pos.clone();
      pos.addScaledVector(bot.vel, dt);
      this.collide(pos, BOT_R, BOT_H);
      if (this.arena?.meshNav) {
        const gyStep = this.arena.groundAt(pos.x, pos.z, pos.y, true);
        if (gyStep == null || gyStep < preBot.y - 1.45) {
          pos.x = preBot.x;
          pos.z = preBot.z;
        }
      }
      const pushx = pos.x - intended.x;
      const pushz = pos.z - intended.z;
      if (pushx * pushx + pushz * pushz > 1e-6) {
        const plen = Math.hypot(pushx, pushz) || 1;
        const nx = pushx / plen;
        const nz = pushz / plen;
        const vn = bot.vel.x * nx + bot.vel.z * nz;
        if (vn < 0) {
          bot.vel.x -= vn * nx;
          bot.vel.z -= vn * nz;
        }
      }
      for (const other of this.bots) {
        if (other === bot || !other.alive) continue;
        const ox = pos.x - other.mesh.position.x;
        const oz = pos.z - other.mesh.position.z;
        const gap = Math.hypot(ox, oz);
        if (gap < 0.0001) continue;
        const teammate = other.team === bot.team;
        const hard = teammate ? 6.4 : 1.35;
        const soft = teammate ? 13.5 : 2.6;
        const nx = ox / gap;
        const nz = oz / gap;
        if (gap < hard) {
          const push = hard - gap;
          pos.x += nx * push;
          pos.z += nz * push;
        } else if (gap < soft) {
          const push = (soft - gap) * (teammate ? 0.28 : 0.07) * Math.min(1, dt * 9);
          pos.x += nx * push;
          pos.z += nz * push;
        }
      }
      this.collide(pos, BOT_R, BOT_H);
      const gy = this.groundY(pos, BOT_R);
      if (gy == null || pos.y < this.mapMinY() - 0.8) {
        const safe = this.safeBotPos(preBot.x, preBot.z, preBot.y);
        pos.set(safe.x, safe.y, safe.z);
        bot.vel.set(0, 0, 0);
        bot.stuck += dt;
        bot.lastPos.copy(pos);
        if (bot.stuck > 0.16) {
          bot.stuck = 0;
          bot.think = 0;
          bot.pushOut = Math.max(bot.pushOut || 0, 2.5);
          bot.mode = "roam";
          bot.roamTarget = this.pickRoamTarget(bot);
          bot.waypoint = this.pickWaypoint(bot, bot.roamTarget);
          this.nudgeBotOut(bot);
        }
        continue;
      }
      const feetOnSurface = pos.y + 0.12 >= gy;
      pos.y = gy;
      if (
        feetOnSurface &&
        this.arena?.isRooftop?.(pos.x, pos.z, pos.y) &&
        !this.nearSpawnPad(pos.x, pos.z)
      ) {
        this.killOnRoof(bot);
        continue;
      }

      const moved = Math.hypot(pos.x - bot.lastPos.x, pos.z - bot.lastPos.z);
      if (want.length() > 0.35 && moved < 0.03) bot.stuck += dt;
      else bot.stuck = Math.max(0, bot.stuck - dt * 0.6);
      bot.lastPos.copy(pos);
      if (bot.stuck > 0.3) {
        bot.vel.x *= -0.55;
        bot.vel.z *= -0.55;
        bot.stuck = 0;
        bot.think = 0.06;
        bot.strafe *= -1;
        if (inFight) {
          bot.mode = "strafe";
          bot.waypoint = this.pickWaypoint(bot, goal);
        } else {
          bot.roamTarget = this.pickRoamTarget(bot);
          bot.roamIn = 4.5 + Math.random() * 4;
          bot.waypoint = this.pickWaypoint(bot, bot.roamTarget);
          bot.mode = "roam";
        }
        this.nudgeBotOut(bot);
      }

      const lookX = -Math.sin(bot.yaw);
      const lookZ = -Math.cos(bot.yaw);
      let aligned = 0;
      if (fireAt) {
        const tx = fireAt.x - pos.x;
        const tz = fireAt.z - pos.z;
        const tlen = Math.hypot(tx, tz) || 1;
        aligned = (tx / tlen) * lookX + (tz / tlen) * lookZ;
      }
      const onTarget = aligned > 0.96;
      const raised = (bot.raiseAmt || 0) > 0.68;
      const canShoot = bot.reactIn <= 0 && raised && tracking && dist < 38 && onTarget;
      if (bot.grenades && !this.netOnline && canShoot && los && dist > 7 && dist < 17 && bot.cooldown <= 0 && Math.random() < 0.14) {
        this.botThrowGrenade(bot, fireAt);
        bot.cooldown = 1.4;
      } else if (canShoot && bot.cooldown <= 0) {
        const weap = getWeapon(bot.weaponId || DEFAULT_WEAPON);
        bot.cooldown = weap.fire * (0.92 + Math.random() * 0.2);
        const gun = bot.mesh.userData.gun;
        const muzzle = new THREE.Vector3();
        if (gun?.userData?.muzzle) {
          muzzle.copy(gun.userData.muzzle);
          gun.localToWorld(muzzle);
        } else {
          muzzle.set(pos.x, pos.y + 1.38 * BODY_K, pos.z);
        }
        const aim = new THREE.Vector3(lookTarget.x, lookTarget.y, lookTarget.z).sub(muzzle);
        const spread = (0.016 + err * 0.55) * (0.5 + Math.min(1, dist / 26)) + bot.vel.length() * 0.0035;
        aim.x += (Math.random() - 0.5) * spread;
        aim.y += (Math.random() - 0.5) * spread * 0.75;
        aim.normalize();
        this.spawnTracer(muzzle, aim, bot.team, null, weap.dmg);
      }

      this.animateBot(
        bot,
        dt,
        bot.vel.length() > 0.22,
        (bot.pushOut || 0) > 0 || bot.vel.length() > 0.2 || this.sphereInView(pos.x, pos.y + 0.9, pos.z, 4.6)
      );
    }
    this.bots = this.bots.filter((b) => {
      if (b.remote || b.netI != null) return true;
      if (b.alive || b.fall <= 4.4) return true;
      if (b.mesh.parent) this.scene.remove(b.mesh);
      return false;
    });
  }

  refreshViewCull() {
    this.camera.updateMatrixWorld();
    this._projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);
    this.camera.getWorldPosition(this._camWorld);
    this.camera.getWorldDirection(this._camFwd);
    this._cullReady = true;
  }

  sphereInView(x, y, z, radius) {
    if (!this._cullReady) return true;
    const dx = x - this._camWorld.x;
    const dy = y - this._camWorld.y;
    const dz = z - this._camWorld.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < 36) return true;
    const ahead = dx * this._camFwd.x + dy * this._camFwd.y + dz * this._camFwd.z;
    if (ahead < -radius - 1.1) return false;
    this._cullSphere.center.set(x, y, z);
    this._cullSphere.radius = radius;
    return this._frustum.intersectsSphere(this._cullSphere);
  }

  applyVisualCull() {
    if (this.state !== "play") return;
    for (const bot of this.bots) {
      if (bot.cine) continue;
      if ((bot.pushOut || 0) > 0) {
        bot.mesh.visible = true;
        continue;
      }
      const p = bot.mesh.position;
      bot.mesh.visible = this.sphereInView(p.x, p.y + 0.9, p.z, 4.6);
    }
    if (this.arena?.barrels) {
      for (const b of this.arena.barrels) {
        if (!b.alive) {
          b.mesh.visible = false;
          continue;
        }
        b.mesh.visible = this.sphereInView(b.center.x, b.center.y, b.center.z, b.radius + 2.4);
      }
    }
    for (const g of this.thrown) {
      const p = g.mesh.position;
      g.mesh.visible = this.sphereInView(p.x, p.y, p.z, 1.8);
    }
    for (const b of this.balls) {
      const p = b.mesh.position;
      b.mesh.visible = this.sphereInView(p.x, p.y, p.z, 1.6);
    }
    for (const s of this.splats) {
      const p = s.position;
      s.visible = this.sphereInView(p.x, p.y, p.z, 1.4);
    }
    for (const d of this.dents) {
      const p = d.mesh.position;
      d.mesh.visible = this.sphereInView(p.x, p.y, p.z, 0.8);
    }
  }

  hasLos(from, to) {
    const ray = this._navRay;
    const dir = this._colDir;
    dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.25) return true;
    dir.multiplyScalar(1 / dist);
    ray.set(from, dir);
    ray.near = 0;
    ray.far = Math.max(0.1, dist - 0.4);
    const walls = this.arena?.nearbyWalls
      ? this.arena.nearbyWalls((from.x + to.x) * 0.5, (from.z + to.z) * 0.5, dist * 0.55 + 1.2)
      : this.arena.wallMeshes;
    return !ray.intersectObjects(walls, false)[0];
  }

  clearMenuShot() {
    const shot = this.menuShot;
    if (!shot) return;
    for (const tr of shot.tracers || []) {
      this.scene.remove(tr.mesh);
      tr.mesh.geometry?.dispose();
      tr.mesh.material?.dispose();
    }
    for (const flash of shot.flashes || []) {
      flash.removeFromParent();
      flash.traverse((obj) => {
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
    }
    if (shot.flash) {
      shot.flash.removeFromParent();
      shot.flash.traverse((obj) => {
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
    }
    if (shot.bomb && shot.bomb !== this.bombMesh) {
      shot.bomb.removeFromParent();
    }
    if (shot.light) this.scene.remove(shot.light);
    for (const bot of [shot.blueBot, shot.redBot]) {
      if (!bot) continue;
      if (bot.mesh.parent) this.scene.remove(bot.mesh);
      this.bots = this.bots.filter((b) => b !== bot);
    }
    this.menuShot = null;
  }

  setMenuStudio(on) {
    if (this.arena?.world) this.arena.world.visible = true;
    this.scene.background = this._playBg || new THREE.Color(0xb8c4a0);
    this.scene.fog = this._playFog ?? this.scene.fog;
    this.renderer.toneMappingExposure = on ? 1.18 : 1.28;
  }

  menuOpenScore(x, z, y) {
    let n = 0;
    const r = 2.2;
    const offs = [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
      [r, r],
      [r, -r],
      [-r, r],
      [-r, -r],
    ];
    for (const [dx, dz] of offs) {
      const gy = this.arena.groundAt?.(x + dx, z + dz, y);
      if (gy == null || this.onRoof(x + dx, z + dz, gy) || this.blocked(x + dx, z + dz, 0.4, gy)) continue;
      n++;
    }
    return n;
  }

  poseMenuBot(bot, yaw, walk = 0.1, crouch = 0) {
    bot.cine = true;
    bot.mode = "hold";
    bot.vel.set(0, 0, 0);
    bot.yaw = yaw;
    bot.mesh.rotation.y = yaw;
    bot.walkAmt = walk;
    bot.raiseAmt = 1;
    if (bot.mesh.userData.gun) bot.mesh.userData.gun.visible = true;
    this.animateWalk(bot.mesh, walk, bot.walkPhase, crouch, 0, 1, 0);
  }

  menuMuzzleWorld(bot, out) {
    const gun = bot?.mesh?.userData?.gun;
    const local = gun?.userData?.muzzle;
    if (gun && local) {
      gun.updateMatrixWorld(true);
      out.copy(local);
      gun.localToWorld(out);
      return out;
    }
    out.copy(bot.mesh.position);
    out.y += 1.18 * BODY_K;
    return out;
  }

  makeMenuFlash(color) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), mat));
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.38), mat.clone());
    streak.rotation.z = Math.PI * 0.5;
    g.add(streak);
    g.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 8, 8),
        new THREE.MeshBasicMaterial({
          color: 0xfff2d0,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    return g;
  }

  findMenuDuel() {
    if (this._menuDuel) return this._menuDuel;
    const wps = this.arena?.waypoints;
    if (!wps?.length) return null;
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
    const chest = 1.18 * BODY_K;
    let best = null;
    let bestScore = -Infinity;
    const step = Math.max(1, (wps.length / 55) | 0);
    for (let wi = 0; wi < wps.length; wi += step) {
      const blue = wps[wi];
      if (this.onRoof(blue.x, blue.z, blue.y)) continue;
      const openB = this.menuOpenScore(blue.x, blue.z, blue.y);
      if (openB < 4) continue;
      for (const [dx, dz] of dirs) {
        const span = 8.8;
        const rx = blue.x + dx * span;
        const rz = blue.z + dz * span;
        const ry = this.arena.groundAt?.(rx, rz, blue.y);
        if (ry == null || this.blocked(rx, rz, 0.45, ry) || this.onRoof(rx, rz, ry)) continue;
        const openR = this.menuOpenScore(rx, rz, ry);
        if (openR < 4) continue;
        this._losFrom.set(blue.x, blue.y + chest, blue.z);
        this._losTo.set(rx, ry + chest, rz);
        if (!this.hasLos(this._losFrom, this._losTo)) continue;
        const midX = (blue.x + rx) * 0.5;
        const midZ = (blue.z + rz) * 0.5;
        const midY = (blue.y + ry) * 0.5;
        const ax = rx - blue.x;
        const az = rz - blue.z;
        const alen = Math.hypot(ax, az) || 1;
        const nx = -az / alen;
        const nz = ax / alen;
        for (const side of [1, -1]) {
          const camDist = 9.6;
          const camX = midX + nx * side * camDist - (ax / alen) * 1.2;
          const camZ = midZ + nz * side * camDist - (az / alen) * 1.2;
          const cy = this.arena.groundAt?.(camX, camZ, midY);
          if (cy == null || this.blocked(camX, camZ, 0.5, cy) || this.onRoof(camX, camZ, cy)) continue;
          const cam = new THREE.Vector3(camX, cy + 1.52, camZ);
          const look = new THREE.Vector3(midX, midY + 1.08, midZ);
          this._losFrom.copy(cam);
          this._losTo.copy(look);
          if (!this.hasLos(this._losFrom, this._losTo)) continue;
          this._losTo.set(blue.x, blue.y + chest, blue.z);
          if (!this.hasLos(this._losFrom, this._losTo)) continue;
          this._losTo.set(rx, ry + chest, rz);
          if (!this.hasLos(this._losFrom, this._losTo)) continue;
          const centered = 1 / (1 + Math.hypot(midX, midZ) * 0.045);
          const score = (openB + openR) * 0.4 + centered * 8;
          if (score <= bestScore) continue;
          bestScore = score;
          best = {
            blue: new THREE.Vector3(blue.x, blue.y, blue.z),
            red: new THREE.Vector3(rx, ry, rz),
            cam,
            look,
            mid: new THREE.Vector3(midX, midY, midZ),
            axis: new THREE.Vector3(ax / alen, 0, az / alen),
            perp: new THREE.Vector3(nx * side, 0, nz * side),
            camDist,
            camY: cam.y,
          };
        }
      }
    }
    this._menuDuel = best;
    return best;
  }

  ensureMenuShot() {
    if (this.previewMap || !this.arena) return;
    this.clearMenuShot();
    this.setMenuStudio(true);
    for (const bot of this.bots) bot.mesh.visible = false;
    if (this.bombMesh) this.bombMesh.visible = false;

    let duel = this.findMenuDuel();
    if (!duel) {
      const blue = this.arena.spawnBlue.clone();
      const red = this.arena.spawnRed.clone();
      const span = blue.distanceTo(red);
      if (span > 11) red.lerp(blue, 1 - 9 / span);
      const mid = blue.clone().add(red).multiplyScalar(0.5);
      const axis = red.clone().sub(blue);
      axis.y = 0;
      if (axis.lengthSq() < 0.01) axis.set(1, 0, 0);
      else axis.normalize();
      const perp = new THREE.Vector3(-axis.z, 0, axis.x);
      const camDist = 9.6;
      const cam = mid.clone().addScaledVector(perp, camDist).addScaledVector(axis, -1.2);
      const gy = this.arena.groundAt(cam.x, cam.z, mid.y);
      cam.y = (gy ?? mid.y) + 1.52;
      duel = {
        blue,
        red,
        cam,
        look: mid.clone().setY(mid.y + 1.08),
        mid,
        axis,
        perp,
        camDist,
        camY: cam.y,
      };
    }

    const right = new THREE.Vector3(duel.perp.z, 0, -duel.perp.x);
    duel.look.addScaledVector(right, -2.2);
    duel.look.addScaledVector(duel.axis, 0.35);

    this.pos.copy(duel.mid);
    this.yaw = Math.atan2(-duel.perp.x, -duel.perp.z);
    this.pitch = -0.12;
    this.walkYaw = this.yaw;

    const blueBot = this.spawnBot("blue", duel.blue.x, duel.blue.z, 0, duel.blue.y);
    const redBot = this.spawnBot("red", duel.red.x, duel.red.z, 0, duel.red.y);
    blueBot.mesh.position.copy(duel.blue);
    redBot.mesh.position.copy(duel.red);
    this.poseMenuBot(
      blueBot,
      Math.atan2(-(duel.red.x - duel.blue.x), -(duel.red.z - duel.blue.z)),
      0.08,
      0.16
    );
    this.poseMenuBot(
      redBot,
      Math.atan2(-(duel.blue.x - duel.red.x), -(duel.blue.z - duel.red.z)),
      0.12,
      0.04
    );

    if (this.playerRig) this.playerRig.visible = false;
    if (this.marker) {
      this.marker.visible = false;
      this.camera.remove(this.marker);
    }

    const flashes = [];
    const blueFlash = this.makeMenuFlash(0x7ad4ff);
    const redFlash = this.makeMenuFlash(0xff7a3a);
    const blueGun = blueBot.mesh.userData.gun;
    const redGun = redBot.mesh.userData.gun;
    if (blueGun) {
      blueFlash.position.copy(blueGun.userData.muzzle || new THREE.Vector3(0, 0, -0.3));
      blueFlash.position.z -= 0.02;
      blueGun.add(blueFlash);
      flashes.push(blueFlash);
    }
    if (redGun) {
      redFlash.position.copy(redGun.userData.muzzle || new THREE.Vector3(0, 0, -0.3));
      redFlash.position.z -= 0.02;
      redGun.add(redFlash);
      flashes.push(redFlash);
    }

    const muzzleA = new THREE.Vector3();
    const muzzleB = new THREE.Vector3();
    this.menuMuzzleWorld(blueBot, muzzleA);
    this.menuMuzzleWorld(redBot, muzzleB);
    const dir = muzzleB.clone().sub(muzzleA);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    else dir.normalize();
    const tracers = [];
    const specs = [
      { u: 0.22, color: 0x66d0ff, fromBlue: true },
      { u: 0.48, color: 0x66d0ff, fromBlue: true },
      { u: 0.34, color: 0xff6a3a, fromBlue: false },
      { u: 0.62, color: 0xff6a3a, fromBlue: false },
    ];
    for (const spec of specs) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.01, 1.05, 6),
        new THREE.MeshBasicMaterial({ color: spec.color })
      );
      const a = spec.fromBlue ? muzzleA : muzzleB;
      const b = spec.fromBlue ? muzzleB : muzzleA;
      mesh.position.lerpVectors(a, b, spec.u);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().multiplyScalar(spec.fromBlue ? 1 : -1)
      );
      this.scene.add(mesh);
      tracers.push({ mesh, u: spec.u, fromBlue: spec.fromBlue });
    }

    this.muzzleLight.position.copy(muzzleA);
    this.muzzleLight.distance = 9;
    this.muzzleLight.intensity = 2.8;
    this.muzzleLight.color.set(0xffc48a);

    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(duel.cam);
    this.camera.lookAt(duel.look);

    this.menuShot = {
      ...duel,
      flashes,
      tracers,
      blueBot,
      redBot,
      _muzzleA: muzzleA,
      _muzzleB: muzzleB,
      _dir: dir,
    };
  }

  updateMenuCam(t, dt = 0.016) {
    if (this.previewMap) {
      if (Math.abs(this.camera.fov - 72) > 0.1) {
        this.camera.fov = 72;
        this.camera.updateProjectionMatrix();
      }
      if (!this.arena) return;
      const box = this.arena.worldBox || new THREE.Box3(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 8, 30));
      const c = box.getCenter(new THREE.Vector3());
      this.camera.up.set(0, 0, 1);
      this.camera.position.set(c.x, box.max.y + 38, c.z);
      this.camera.lookAt(c.x, 0, c.z);
      if (this.marker) this.camera.remove(this.marker);
      return;
    }

    if (!this.menuShot) this.ensureMenuShot();
    const shot = this.menuShot;
    if (!shot) {
      if (this.marker) this.camera.remove(this.marker);
      return;
    }

    if (Math.abs(this.camera.fov - 50) > 0.1) {
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }

    if (this.marker) {
      this.marker.visible = false;
      this.camera.remove(this.marker);
    }

    const orbit = Math.sin(t * 0.18) * 0.34;
    const truck = Math.sin(t * 0.14) * 0.8;
    const lift = Math.sin(t * 0.16) * 0.14;
    const cam = this._menuPos;
    cam.copy(shot.mid);
    cam.addScaledVector(shot.perp, shot.camDist);
    cam.addScaledVector(shot.axis, truck - 1.1);
    cam.x += shot.perp.z * orbit * 1.7;
    cam.z += -shot.perp.x * orbit * 1.7;
    cam.y = shot.camY + lift;
    const look = this._menuLook;
    look.copy(shot.look);
    look.y += Math.sin(t * 0.21) * 0.06;
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(cam);
    this.camera.lookAt(look);

    const blueBot = shot.blueBot;
    const redBot = shot.redBot;
    if (blueBot?.mesh) {
      blueBot.walkPhase += dt * 1.55;
      this.animateWalk(blueBot.mesh, 0.08, blueBot.walkPhase, 0.16, 0, 1, 0);
      blueBot.mesh.rotation.y = blueBot.yaw;
      if (blueBot.mesh.userData.gun) blueBot.mesh.userData.gun.visible = true;
    }
    if (redBot?.mesh) {
      redBot.walkPhase += dt * 1.7;
      this.animateWalk(redBot.mesh, 0.12, redBot.walkPhase, 0.04, 0, 1, 0);
      redBot.mesh.rotation.y = redBot.yaw;
      if (redBot.mesh.userData.gun) redBot.mesh.userData.gun.visible = true;
    }

    this.camera.updateMatrixWorld(true);
    const muzzleA = shot._muzzleA;
    const muzzleB = shot._muzzleB;
    this.menuMuzzleWorld(blueBot, muzzleA);
    this.menuMuzzleWorld(redBot, muzzleB);
    const dir = shot._dir;
    dir.copy(muzzleB).sub(muzzleA);
    if (dir.lengthSq() > 0.0001) dir.normalize();
    else dir.set(0, 0, -1);

    const pulseA = 0.55 + Math.sin(t * 34) * 0.45;
    const pulseB = 0.55 + Math.sin(t * 29 + 1.15) * 0.45;
    const pulses = [pulseA, pulseB];
    (shot.flashes || []).forEach((flash, i) => {
      const pulse = pulses[i] ?? pulseA;
      flash.visible = true;
      flash.scale.setScalar(0.75 + pulse * 0.5);
      flash.traverse((obj) => {
        if (obj.material?.opacity != null) obj.material.opacity = 0.4 + pulse * 0.55;
      });
    });
    this.muzzleLight.position.lerpVectors(muzzleA, muzzleB, 0.5);
    this.muzzleLight.position.y += 0.15;
    this.muzzleLight.intensity = 2.2 + pulseA * 1.6;
    this.muzzleLight.color.set(0xffc48a);
    if (shot.light) {
      shot.light.position.copy(shot.mid);
      shot.light.position.y += 2.2;
      shot.light.intensity = 2.1 + pulseA * 0.35;
    }

    for (const tr of shot.tracers || []) {
      tr.u += dt * 0.22;
      if (tr.u > 0.82) tr.u -= 0.6;
      const a = tr.fromBlue ? muzzleA : muzzleB;
      const b = tr.fromBlue ? muzzleB : muzzleA;
      tr.mesh.position.lerpVectors(a, b, tr.u);
      this._colDir.copy(dir).multiplyScalar(tr.fromBlue ? 1 : -1);
      tr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._colDir);
    }
  }

  tick() {
    if (document.hidden) {
      this.clock.getDelta();
      return;
    }
    if (!this.ready) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const dt = Math.min(0.033, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.state === "play") {
      this.muzzleLight.intensity = THREE.MathUtils.damp(this.muzzleLight.intensity, 0, 18, dt);
    }
    this.updateDents(dt);
    if (this.playerRig) {
      this.playerRig.visible = this.state === "play" && (!this.out || this.roofDying || this.roofCorpse);
    }

    if (this.state === "menu" || this.state === "over") {
      this.updateMenuCam(t, dt);
    } else if (this.state === "play") {
      if (this.out) this.camera.remove(this.marker);
      else if (!this.camera.children.includes(this.marker)) this.camera.add(this.marker);
      this.updatePlayer(dt);
      this.refreshViewCull();
      this.updateBots(dt);
      this.updateBomb(dt);
      this.updateBalls(dt);
      this.updateGrenades(dt);
      this.updateFires(dt);
      this.updateMatchTimer(dt);
      this.applyVisualCull();
      this._radarTick = (this._radarTick || 0) + 1;
      if (this._radarTick % 2 === 1) this.drawRadar(dt);
      if (this.netOnline && this.net?.online && !this.out) {
        const q = (n) => Math.round(n * 100) / 100;
        this.net.sendPose({
          x: q(this.pos.x),
          y: q(this.pos.y),
          z: q(this.pos.z),
          yaw: q(this.yaw),
          pitch: q(this.pitch),
          crouch: q(this.crouch || 0),
          walk: q(this.walkAmt || 0),
          run: q(this.runAmt || 0),
          alive: true,
          plant: q(this.plantAmt || 0),
          bots: this.net.isHost ? this.packNetBots() : undefined,
        });
      } else if (this.netOnline && this.net?.online) {
        this.net.sendPose({
          x: this.pos.x,
          y: this.pos.y,
          z: this.pos.z,
          yaw: this.yaw,
          pitch: this.pitch,
          crouch: this.crouch || 0,
          walk: 0,
          run: 0,
          alive: false,
          plant: 0,
          bots: this.net.isHost ? this.packNetBots() : undefined,
        });
      }
    } else if (this.state === "pause") {
      this.updateBalls(dt);
    }

    if (this._toastAt && t - this._toastAt > (this._toastHold || 1.5)) {
      const el = $("toast");
      if (el) {
        el.textContent = "";
        el.classList.remove("note");
      }
      this._toastAt = 0;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

