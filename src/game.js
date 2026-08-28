import * as THREE from "three";
import { AudioEngine } from "./audio.js";
import { buildArena, COMMANDO_H, createBomb, createFighter, createMarker, loadGameAssets, TEAM } from "./arena.js";
import { dentTexture, fireTexture, puddleTexture, splatTexture } from "./textures.js";

const AMMO_MAX = 200;
const TO_WIN = 5;
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
const MAX_SPLATS = 420;
const MAX_BALLS = 48;
const MAX_DENTS = 80;
const DENT_LIFE = 10;
const BLOOD = 0xb41c1c;
const EVENT_START = 4;
const EVENT_CAP = 40;
const BLAST_R = 3.4;
const FIRE_LIFE = 3;
const NADE_FUSE = 2.1;
const BOMB_FUSE = 40;
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

    this.blueScore = 0;
    this.redScore = 0;
    this.roundLock = false;
    this.lives = 1;
    this.elims = 0;
    this.ammo = AMMO_MAX;
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
    this._bombDetonating = false;
    this.playerTeam = "blue";
    this.swarmPeak = 0;
    this.grenades = 1;
    this.fires = [];
    this.thrown = [];
    this.explodeWait = [];
    this._fireTex = null;

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
  }

  async init() {
    await loadGameAssets();
    this.arena = buildArena(this.scene);
    this.bakeRadar();
    this.marker = createMarker();
    this.camera.add(this.marker);
    this.scene.add(this.camera);
    this.bombMesh = createBomb();
    this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);
    this.playerRig = createFighter(this.playerTeam, true);
    this.scene.add(this.playerRig);
    this._playerClipY = this.playerRig.userData?.fpsClipY ?? this.playerRig.userData?.walkUniforms?.uClipY?.value ?? 1.12;
    this.pos.copy(this.arena.spawnBlue);
    this.resetMatch(false);
    this.ready = true;
    this.loading = false;
    const play = $("play");
    if (play) play.disabled = false;
    const eventBtn = $("event");
    if (eventBtn) eventBtn.disabled = false;
    const bombBtn = $("bomb");
    if (bombBtn) bombBtn.disabled = false;
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
      s.material?.map?.dispose();
      s.material?.dispose();
    }
    this.splats.length = 0;
    for (const d of this.dents) {
      this.scene.remove(d.mesh);
      d.mesh.material?.map?.dispose();
      d.mesh.material?.dispose();
    }
    this.dents.length = 0;

    this.blueScore = 0;
    this.redScore = 0;
    this.roundLock = false;
    this.lives = 1;
    this.elims = 0;
    this.wave = 1;
    this.swarmPeak = 0;
    this.ammo = AMMO_MAX;
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

  enemySpawn() {
    return this.playerTeam === "red" ? this.arena.spawnBlue : this.arena.spawnRed;
  }

  assignPlayerTeam() {
    const forced = this._bootParams?.get("team");
    this.playerTeam = forced === "red" || forced === "blue" ? forced : Math.random() < 0.5 ? "blue" : "red";
    if (this.playerRig) this.scene.remove(this.playerRig);
    this.playerRig = createFighter(this.playerTeam, true);
    this.scene.add(this.playerRig);
    this._playerClipY = this.playerRig.userData?.fpsClipY ?? 1.12 * BODY_K;
  }

  startRound(playing = this.state === "play") {
    this.roundLock = false;
    this.clearMenuShot();
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
    this.ammo = AMMO_MAX;
    this.grenades = 1;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.velY = 0;
    this.clearFires();
    this.resetBarrels();
    if (!this.pos) this.pos = this.playerSpawn().clone();
    else this.pos.copy(this.playerSpawn());
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

    const pickAround = (origin, count, skipSelf = false) => {
      const sorted = [...this.arena.waypoints].sort(
        (a, b) => a.distanceToSquared(origin) - b.distanceToSquared(origin)
      );
      const spots = [];
      for (const w of sorted) {
        if (this.onRoof(w.x, w.z, w.y)) continue;
        if (skipSelf && w.distanceToSquared(origin) < 0.36) continue;
        if (spots.some((s) => s.distanceToSquared(w) < 16)) continue;
        spots.push(w);
        if (spots.length >= count) break;
      }
      const fb = this.safeBotPos(origin.x, origin.z, origin.y);
      const fallback = new THREE.Vector3(fb.x, fb.y, fb.z);
      while (spots.length < count) spots.push(fallback);
      return spots;
    };
    if (this.eventMode) {
      const enemy = this.enemyTeam();
      pickAround(this.enemySpawn(), EVENT_START).forEach((w, i) => this.spawnBot(enemy, w.x, w.z, i, w.y));
      this.swarmPeak = Math.max(this.swarmPeak, this.teamAlive(enemy));
    } else {
      const redN = this.playerTeam === "red" ? 4 : 5;
      const blueN = this.playerTeam === "blue" ? 4 : 5;
      pickAround(this.arena.spawnRed, redN, this.playerTeam === "red").forEach((w, i) => this.spawnBot("red", w.x, w.z, i, w.y));
      pickAround(this.arena.spawnBlue, blueN, this.playerTeam === "blue").forEach((w, i) => this.spawnBot("blue", w.x, w.z, i, w.y));
    }
    for (const bot of this.bots) {
      bot.roamTarget = this.pickRoamTarget(bot);
      bot.roamIn = 5 + Math.random() * 5.5;
      bot.waypoint = this.pickWaypoint(bot, bot.roamTarget);
    }
    if (this.eventMode) {
      const rush = this.playerSpawn();
      const enemy = this.enemyTeam();
      for (const bot of this.bots) {
        if (bot.team !== enemy) continue;
        this.armEventRush(bot, rush);
        bot.waypoint = this.pickWaypoint(bot, rush);
      }
    }
    this.setupBombRound(playing);
    this.syncHud();
  }

  spawnBot(team, x, z, lane = 0, y = null) {
    const color = team === "blue" ? TEAM.blue : TEAM.red;
    const mesh = createFighter(color);
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
      hp: 1,
      yaw: Math.atan2(px, pz),
      vel: new THREE.Vector3(),
      walkPhase: Math.random() * Math.PI * 2,
      walkAmt: 0,
      runAmt: 0,
      cooldown: 0.08 + Math.random() * 0.16,
      think: 0.04 + Math.random() * 0.16,
      maxSpeed: 10.8 + Math.random() * 1.1,
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
      reactTime: 0.1 + Math.random() * 0.1,
      fovCos: 0.4 + Math.random() * 0.16,
      aimErr: 0.02 + Math.random() * 0.028,
      trackRate: 16 + Math.random() * 6,
      noiseX: 0,
      noiseY: 0,
      seeGrace: 0,
      hearCd: 0,
      holdSpot: null,
      peekT: Math.random() * 0.4,
      plantAmt: 0,
    });
    return this.bots[this.bots.length - 1];
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
    this.bombSiteId = Math.random() < 0.5 ? "A" : "B";
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
    if (this.playerTeam === "red") this.giveBomb("player");
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

  dropBomb(pos) {
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

  plantBomb(pos) {
    if (!this.bombMode || this.bombPlanted || this.roundLock) return;
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
  }

  defuseBomb() {
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
    this.endRound("blue");
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
    if (prompt) {
      const kind = this.state === "play" ? this.bombInteractKind() : null;
      if (kind === "plant") {
        const site = this.plantSiteAt(this.pos.x, this.pos.z);
        prompt.textContent = `Hold E — Plant ${site?.id || this.bombSiteId || ""}`;
      } else if (kind === "defuse") prompt.textContent = "Hold E — Defuse";
      else if (this.bombMode && this.bombDropped && this.playerTeam === "red" && !this.out) prompt.textContent = "Pick up the bomb";
      else prompt.textContent = "";
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
      this.start();
    });
    $("event")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.eventMode = true;
      this.bombMode = false;
      this.start();
    });
    $("bomb")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.eventMode = false;
      this.bombMode = true;
      this.start();
    });
    $("resume").addEventListener("click", (e) => {
      e.preventDefault();
      this.start();
    });
    $("again").addEventListener("click", (e) => {
      e.preventDefault();
      this.start(true);
    });
    $("pause").addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      this.start();
    });

    this._bootParams = new URLSearchParams(location.search);
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

  start(reset = false) {
    if (!this.ready) return;
    try {
      this.audio.unlock();
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
      $("over-kicker").textContent = "";
      $("over-title").textContent = "Defeat";
      $("over-copy").textContent = "";
    } else {
      $("over-kicker").textContent = this.bombMode ? "Bomb" : "";
      $("over-title").textContent = won ? "Victory" : "Defeat";
      $("over-copy").textContent = `${this.blueScore} – ${this.redScore}`;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    this.ensureMenuShot();
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
    if (this.state !== "play" || this.reloading > 0 || this.ammo >= AMMO_MAX || this.out) return;
    this.reloading = 1.6;
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
    const blueTotal = this.eventMode ? (this.playerTeam === "blue" ? 1 : Math.max(blueN, 1)) : 5;
    const redTotal = this.eventMode ? (this.playerTeam === "red" ? 1 : Math.max(redN, 1)) : 5;
    this.setPips("blue-pips", blueN, blueTotal);
    this.setPips("red-pips", redN, redTotal);
    if ($("score-blue")) $("score-blue").textContent = this.blueScore;
    if ($("score-red")) $("score-red").textContent = this.redScore;
    if ($("ammo")) $("ammo").textContent = this.ammo;
    if ($("nades")) {
      $("nades").textContent = this.grenades ? "1" : "0";
      $("nades").classList.toggle("off", this.grenades <= 0);
    }
    this.syncBombHud();
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
      const solids = this.arena.nearbyWalls?.(pos.x, pos.z, radius + 0.8) || this.arena.wallMeshes;
      if (!solids.length) {
        const box = this.arena.worldBox;
        const m = 0.6;
        pos.x = Math.max(box.min.x + m, Math.min(box.max.x - m, pos.x));
        pos.z = Math.max(box.min.z + m, Math.min(box.max.z - m, pos.z));
        return;
      }
      const ray = this._navRay;
      const origin = this._colOrigin;
      const dir = this._colDir;
      const n = this._colN;
      const head = Math.max(1.12 * BODY_K, height - 0.08);
      const heights = height > 1.05 * BODY_K ? [0.48 * BODY_K, head] : [0.48 * BODY_K];
      for (const h of heights) {
        const y = pos.y + h;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          dir.set(Math.cos(a), 0, Math.sin(a));
          origin.set(pos.x, y, pos.z);
          ray.set(origin, dir);
          ray.near = 0;
          ray.far = radius + 0.12;
          const hit = ray.intersectObjects(solids, false)[0];
          if (!hit || hit.object.userData.exploded) continue;
          const wb = hit.object.userData?.worldBox;
          if (wb && wb.min.y > y + 0.14) continue;
          if (hit.face) {
            n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
            if (n.y > 0.42) continue;
            if (n.y > 0.28 && hit.point.y <= pos.y + 0.55) continue;
            n.y = 0;
            if (n.lengthSq() < 0.0001) n.copy(dir).negate();
            else n.normalize();
          } else {
            n.copy(dir).negate();
          }
          const push = radius + 0.04 - hit.distance;
          if (push > 0) {
            pos.x += n.x * push;
            pos.z += n.z * push;
          }
        }
      }
      const box = this.arena.worldBox;
      const m = 0.6;
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
    pos.x = Math.max(-this.arena.halfX + 0.85, Math.min(this.arena.halfX - 0.85, pos.x));
    pos.z = Math.max(-this.arena.halfZ + 0.85, Math.min(this.arena.halfZ - 0.85, pos.z));
  }

  blocked(x, z, radius = 0.7, y = 0.9) {
    return this.arena.blockedXZ(x, z, radius, y);
  }

  onRoof(x, z, y) {
    const fn = this.arena?.isRoofAt || this.arena?.isRooftop;
    return Boolean(fn?.(x, z, y));
  }

  safeBotPos(x, z, y = null) {
    const hint = Number.isFinite(y) ? y : 0.12;
    const dropped = this.arena.dropOffRoof?.(x, z, hint);
    const gy = dropped ?? this.arena.groundAt?.(x, z, hint) ?? (Number.isFinite(y) ? y : 0);
    if (!this.onRoof(x, z, gy)) return { x, z, y: gy };
    const open = this.nearestOpen(new THREE.Vector3(x, gy, z), new THREE.Vector3(x, gy, z));
    return { x: open.x, z: open.z, y: open.y };
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
      if (toBot > 14) continue;
      const linger = keepMoving && toBot < 2.4 ? 22 : 0;
      const open = this.clearPath(px, pz, w.x, w.z, 0.5, py + 0.9);
      const here = Math.hypot(goal.x - px, goal.z - pz);
      const progress = here - toGoal;
      const score =
        -toGoal * 0.18 -
        toBot * 0.12 -
        crowd * 4.4 -
        linger +
        progress * 3.2 +
        (open ? 18 : -110) +
        Math.random() * 12;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best ? best.clone() : this.nearestOpen(goal, bot.mesh.position);
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
    for (const w of pool) {
      const distSelf = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (distSelf < 3.5) continue;
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
    return pool[Math.floor(Math.random() * pool.length)].clone();
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
      if (y == null) return this._lastGroundY ?? pos.y;
      if (y > pos.y + 0.58) return this._lastGroundY ?? pos.y;
      this._lastGroundY = y;
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
    const fov = THREE.MathUtils.lerp(72, 52, this.ads);
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
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    if (this.playerRig) {
      this.playerRig.position.copy(this.pos);
      this.playerRig.rotation.y = this.walkYaw;
      this.playerRig.visible = !this.out || this.roofDying || this.roofCorpse;
      const body = this.playerRig.userData.body;
      if (body && this.playerRig.userData.fpsView) {
        body.visible = Boolean(this.roofDying || this.roofCorpse);
      }
      this.applyPlayerClip();
    }
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
    return this.bots.filter((b) => b.alive && b.team === this.playerTeam);
  }

  notePossessKey(e) {
    if (this.state !== "play" || !this.out || !this.spectating || this.roofDying || this.eventMode) {
      this._possessBuf = "";
      return;
    }
    const ch = e.key?.length === 1 ? e.key.toLowerCase() : "";
    if (!/[a-z]/.test(ch)) return;
    const now = performance.now();
    if (now - this._possessAt > 2000) this._possessBuf = "";
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
    if (this.state !== "play" || !this.out || !this.spectating || this.eventMode) return;
    const bot = this.spectateTargets()[this.spectateIdx];
    if (!bot?.alive || !bot.mesh) return;

    const hadBomb = this.bombMode && this.bombCarrier === bot;
    if (this.bombWorker === bot) {
      this.bombWorker = null;
      this.bombWork = 0;
      this.bombWorkKind = null;
    }
    this.pos.copy(bot.mesh.position);
    this.yaw = bot.yaw ?? 0;
    if (hadBomb) this.giveBomb("player");

    this.scene.remove(bot.mesh);
    this.bots = this.bots.filter((b) => b !== bot);
    this.walkYaw = this.yaw;
    this.pitch = 0;
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
    this.ammo = AMMO_MAX;
    this.grenades = 1;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.crouch = 0;
    this.ads = 0;
    this.plantAmt = 0;
    this.recoil = 0;
    this.hitFlash = 0;
    this.bombBusy = false;
    this.walkPhase = 0;
    this.walkAmt = 0;
    this.runAmt = 0;
    this.buttons.fire = false;
    this.buttons.aim = false;

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
      if (body && this.playerRig.userData.fpsView) body.visible = false;
    }

    if (Math.abs(this.camera.fov - 72) > 0.1) {
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
    }
    this.camera.up.set(0, 1, 0);
    this.syncHud();
    this.applyCamera(0, 0);
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
        desiredCam.copy(closest.point).addScaledVector(ray.ray.direction, -0.4);
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
    if (xhair) xhair.style.opacity = String(0.78 * (1 - this.ads * 0.92));
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
    if (this.arena?.meshNav && this.arena.groundAt(this.pos.x, this.pos.z, this.pos.y, true) == null) {
      this.pos.x = preMove.x - wish.x;
      this.pos.z = preMove.z - wish.z;
      this.collide(this.pos, RADIUS, this.eyeHeight());
    }

    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;
    const gy = this.groundY(this.pos, RADIUS);
    const feetOnSurface = this.pos.y + 0.12 >= gy;
    if (wasGrounded && this.velY <= 1.2 && gy != null && gy <= this.pos.y + 0.58 && gy >= this.pos.y - 0.28) {
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
    const ceil = this.arena.ceilingAt?.(this.pos.x, this.pos.z, this.pos.y + 0.2, 2.4);
    if (ceil != null) {
      const maxY = ceil - this.eyeHeight() - 0.12;
      if (this.pos.y > maxY) {
        this.pos.y = Math.max(gy, maxY);
        if (this.velY > 0) this.velY = 0;
      }
    }
    if (
      this.onGround &&
      feetOnSurface &&
      this.arena?.isRooftop?.(this.pos.x, this.pos.z, this.pos.y)
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
    const cadence = moving ? THREE.MathUtils.lerp(9.4, 15.4, this.runAmt) : 8;
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
    const hipX = 0.32 + bobX * 0.4 + gunStrafe;
    const hipY = -0.26 - this.recoil + gunLift;
    const hipZ = -0.5 + this.recoil * 0.8 + gunSurge;
    const adsX = 0.012;
    const adsY = -0.15 - this.recoil * 0.45;
    const adsZ = -0.4 + this.recoil * 0.35;
    this.marker.position.set(
      THREE.MathUtils.lerp(hipX, adsX, this.ads),
      THREE.MathUtils.lerp(hipY, adsY, this.ads),
      THREE.MathUtils.lerp(hipZ, adsZ, this.ads)
    );
    this.marker.rotation.set(
      THREE.MathUtils.lerp(0.06 + this.recoil * 2.2 + gunPitch, 0.01 + this.recoil * 0.6, this.ads),
      THREE.MathUtils.lerp(0.16, 0.0, this.ads),
      THREE.MathUtils.lerp(0.03 + gunRoll, 0.0, this.ads)
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
        this.ammo = AMMO_MAX;
        this.toast("");
        this.syncHud();
      }
    }

    this.fireCooldown -= dt;
    if (this.buttons.fire && !this.bombBusy) this.tryFire();
  }

  tryFire() {
    if (this.out || this.reloading > 0 || this.fireCooldown > 0 || this.bombBusy) return;
    if (this.ammo <= 0) {
      this.audio.empty();
      this.fireCooldown = 0.18;
      this.toast("Reload");
      return;
    }
    this.ammo -= 1;
    this.fireCooldown = FIRE_RATE;
    this.recoil = 0.045;
    this.audio.shoot();
    this.syncHud();

    const dir = this.lookDir();
    const origin = this.camera.position.clone().addScaledVector(dir, 0.28);
    this.spawnTracer(origin, dir, this.playerTeam);
    const muzzle = this.marker.userData.muzzle.clone();
    this.marker.localToWorld(muzzle);
    this.muzzleLight.position.copy(muzzle);
    this.muzzleLight.intensity = 6.5;
  }

  spawnTracer(origin, dir, team) {
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
    this.balls.push({
      mesh,
      vel,
      team,
      life: 1.15,
    });
    this.alertFromShot(origin, team);
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
        // Prefer a red canister when a batched wall collider sits a few cm in front of it.
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
      old.material?.map?.dispose();
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
      old.material?.map?.dispose();
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
      old.mesh.material?.map?.dispose();
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
        d.mesh.material?.map?.dispose();
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
    const light = new THREE.PointLight(0xff5a18, bomb ? 48 : 10, bomb ? 72 : 14);
    light.position.y = bomb ? 2.4 : 0.6;
    group.add(light);
    const sprites = [];
    const tex = this.fireTex();
    const count = bomb ? 36 : 11;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
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
        new THREE.SphereGeometry(1, 18, 14),
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
      light,
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
      const flick = 0.75 + Math.sin(f.age * 17) * 0.2;
      f.light.intensity = bomb
        ? (f.age < 0.28 ? 90 : 28 * (f.life / 2.4)) * flick
        : (f.age < 0.2 ? 14 : 5.5 * (f.life / FIRE_LIFE)) * flick;
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
      new THREE.MeshStandardMaterial({ color: 0x3a4a32, roughness: 0.55, metalness: 0.35 })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.012, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a8f7a, roughness: 0.4, metalness: 0.6 })
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
            this.paintBot(bot, b.mesh.position.clone(), delta.clone().normalize(), b.team);
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
          this.playerHit(b.mesh.position.clone(), delta.clone().normalize());
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

  paintBot(bot, point, inbound, byTeam = "blue") {
    if (!bot.alive) return;
    bot.alive = false;
    bot.hp = 0;
    bot.fall = 0.001;
    bot.blood = false;
    bot.deathX = bot.mesh.position.x;
    bot.deathZ = bot.mesh.position.z;
    if (bot.team !== this.playerTeam) this.elims += 1;
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
      return;
    }
    this.checkRound();
  }

  eventPadOffset(i) {
    const a = i * 2.399963;
    const r = 0.95 + (i % 5) * 0.62;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  resetLiveBot(bot, x, z, y, fight) {
    bot.alive = true;
    bot.hp = 1;
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

  playerHit(point, inbound = null) {
    if (this.out) return;
    this.out = true;
    this.lives = 0;
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

  checkRound() {
    if (this.roundLock || this.state !== "play" || this._bombDetonating) return;
    if (this.eventMode) return;
    if (this.bombMode) {
      if (this.bombPlanted) {
        if (this.teamAlive("blue") <= 0) this.endRound("red");
        return;
      }
      if (this.teamAlive("red") <= 0) this.endRound("blue");
      else if (this.teamAlive("blue") <= 0) this.endRound("red");
      return;
    }
    if (this.teamAlive("red") <= 0) this.endRound("blue");
    else if (this.teamAlive("blue") <= 0) this.endRound("red");
  }

  endRound(winner) {
    if (this.roundLock) return;
    this.roundLock = true;
    this._bombDetonating = false;
    if (winner === "blue") this.blueScore += 1;
    else this.redScore += 1;
    this.syncHud();
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
      const walkLean = fps ? 0.035 : 0.05;
      const runLean = fps ? 0.1 : 0.2;
      const low = fps ? 0 : 1 - up;
      pose.rotation.x = -(0.03 + THREE.MathUtils.lerp(walkLean, runLean, run) * amt) - low * 0.18 - plantK * 0.52;
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
    const cadence = moving ? THREE.MathUtils.lerp(9.2, 15.2, bot.runAmt) : 8;
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
      if (los && dist < 8) return roll > 0.35 ? "peek" : "strafe";
      if (los && dist < 16) return roll > 0.45 ? "strafe" : roll > 0.2 ? "peek" : "advance";
      return "advance";
    }
    if (!engaged) {
      if (bot.personality === "wander" && roll < 0.2) return "hold";
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
          goal.copy(bot.roamTarget);
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
      if (bot.mode === "hold" && Math.hypot(goal.x - pos.x, goal.z - pos.z) < 1.6) {
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
      const turn = tracking ? (bot.reactIn > 0 ? 14 : bot.trackRate ?? 16) : inFight ? 12 : 7;
      bot.yaw = this.lerpAngle(
        bot.yaw,
        Math.atan2(-(lookTarget.x - pos.x), -(lookTarget.z - pos.z)),
        1 - Math.exp(-turn * dt)
      );
      bot.mesh.rotation.y = bot.yaw;

      const nearHold = bot.mode === "hold" && Math.hypot(goal.x - pos.x, goal.z - pos.z) < 1.8;
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
      bot.vel.x += desired.x * accel * dt;
      bot.vel.z += desired.z * accel * dt;
      const max = targetSpeed;
      if (bot.vel.length() > max) bot.vel.setLength(max);

      const intended = pos.clone().addScaledVector(bot.vel, dt);
      const preBot = pos.clone();
      pos.addScaledVector(bot.vel, dt);
      this.collide(pos, BOT_R, BOT_H);
      if (this.arena?.meshNav && this.arena.groundAt(pos.x, pos.z, pos.y, true) == null) {
        pos.x = preBot.x;
        pos.z = preBot.z;
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
      const feetOnSurface = pos.y + 0.12 >= gy;
      pos.y = gy;
      if (feetOnSurface && this.arena?.isRooftop?.(pos.x, pos.z, pos.y)) {
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
      const canShoot = bot.reactIn <= 0 && raised && tracking && los && dist < 38 && onTarget;
      if (bot.grenades && canShoot && los && dist > 7 && dist < 17 && bot.cooldown <= 0 && Math.random() < 0.14) {
        this.botThrowGrenade(bot, fireAt);
        bot.cooldown = 1.4;
      } else if (canShoot && bot.cooldown <= 0) {
        bot.cooldown = 0.15 + Math.random() * 0.14;
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
        this.spawnTracer(muzzle, aim, bot.team);
      }

      this.animateBot(bot, dt, bot.vel.length() > 0.22, this.sphereInView(pos.x, pos.y + 0.9, pos.z, 4.6));
    }
    this.bots = this.bots.filter((b) => {
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
    if (shot.flash) {
      shot.flash.removeFromParent();
      shot.flash.traverse((obj) => {
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
    }
    if (shot.redBot) {
      if (shot.redBot.mesh.parent) this.scene.remove(shot.redBot.mesh);
      this.bots = this.bots.filter((b) => b !== shot.redBot);
    }
    this.menuShot = null;
  }

  findMenuPeek() {
    const wps = this.arena?.waypoints;
    if (!wps?.length) return null;
    const blocked = (x, z, y) => this.arena.blockedXZ(x, z, 0.4, y);
    const ground = (x, z, y) => this.arena.groundAt(x, z, y);
    const dirs = [
      { fx: 0, fz: -1, lx: -1, lz: 0 },
      { fx: 1, fz: 0, lx: 0, lz: -1 },
      { fx: 0, fz: 1, lx: 1, lz: 0 },
      { fx: -1, fz: 0, lx: 0, lz: 1 },
    ];
    let best = null;
    let bestScore = -Infinity;
    const step = Math.max(1, (wps.length / 180) | 0);
    const chest = 1.22 * BODY_K;
    for (let wi = 0; wi < wps.length; wi += step) {
      const wp = wps[wi];
      for (const d of dirs) {
        const sides = [
          { sx: d.lx, sz: d.lz, peek: 0.68 },
          { sx: -d.lx, sz: -d.lz, peek: -0.68 },
        ];
        for (const side of sides) {
          if (!blocked(wp.x + side.sx * 1.05, wp.z + side.sz * 1.05, wp.y)) continue;
          if (blocked(wp.x + d.fx * 1.25, wp.z + d.fz * 1.25, wp.y)) continue;
          const aroundX = wp.x + d.fx * 1.8 + side.sx * 8.6;
          const aroundZ = wp.z + d.fz * 1.8 + side.sz * 8.6;
          const ry = ground(aroundX, aroundZ, wp.y);
          if (ry == null || blocked(aroundX, aroundZ, ry)) continue;
          const camX = wp.x + d.fx * 0.28 - side.sx * 0.18;
          const camZ = wp.z + d.fz * 0.28 - side.sz * 0.18;
          const cy = ground(camX, camZ, wp.y);
          if (cy == null || blocked(camX, camZ, cy)) continue;
          const from = new THREE.Vector3(camX, cy + chest, camZ);
          const to = new THREE.Vector3(aroundX, ry + chest, aroundZ);
          if (!this.hasLos(from, to)) continue;
          const dist = from.distanceTo(to);
          if (dist < 7.4 || dist > 16.5) continue;
          const centered = 1 / (1 + Math.hypot(wp.x, wp.z) * 0.05);
          const score = dist * 0.1 + centered * 10;
          if (score <= bestScore) continue;
          bestScore = score;
          best = {
            cam: new THREE.Vector3(camX, cy, camZ),
            red: new THREE.Vector3(aroundX, ry, aroundZ),
          };
        }
      }
    }
    return best;
  }

  ensureMenuShot() {
    if (this.previewMap || !this.arena || !this.marker) return;
    this.clearMenuShot();
    for (const bot of this.bots) bot.mesh.visible = false;

    let peek = this.findMenuPeek();
    if (!peek) {
      const cam = this.arena.spawnBlue.clone();
      const red = this.arena.spawnRed.clone();
      peek = { cam, red };
    }

    const aim = peek.red.clone();
    aim.y += 1.22 * BODY_K;
    const lookDx = aim.x - peek.cam.x;
    const lookDy = aim.y - (peek.cam.y + EYE);
    const lookDz = aim.z - peek.cam.z;
    this.pos.copy(peek.cam);
    this.yaw = Math.atan2(-lookDx, -lookDz);
    this.pitch = Math.atan2(lookDy, Math.hypot(lookDx, lookDz));
    this.walkYaw = this.yaw;

    const redBot = this.spawnBot("red", peek.red.x, peek.red.z, 0, peek.red.y);
    redBot.cine = true;
    redBot.mode = "hold";
    redBot.vel.set(0, 0, 0);
    redBot.yaw = Math.atan2(-(peek.cam.x - peek.red.x), -(peek.cam.z - peek.red.z));
    redBot.mesh.rotation.y = redBot.yaw;
    redBot.walkAmt = 0.45;
    this.animateWalk(redBot.mesh, 0.45, 1.2, 0, 0);

    if (this.playerRig) this.playerRig.visible = false;
    if (!this.camera.children.includes(this.marker)) this.camera.add(this.marker);
    this.marker.visible = true;
    this.marker.position.set(0.24, -0.22, -0.46);
    this.marker.rotation.set(0.1, 0.12, 0.03);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe566,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const flash = new THREE.Group();
    flash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), flashMat));
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.55), flashMat.clone());
    streak.rotation.z = Math.PI * 0.5;
    flash.add(streak);
    flash.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({
          color: 0xfff6b8,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    const muzzleLocal = this.marker.userData.muzzle?.clone() || new THREE.Vector3(0, 0, -0.35);
    flash.position.copy(muzzleLocal);
    flash.position.z -= 0.03;
    this.marker.add(flash);

    this.camera.up.set(0, 1, 0);
    this.camera.position.set(peek.cam.x, peek.cam.y + EYE, peek.cam.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.updateMatrixWorld(true);
    this.marker.updateMatrixWorld(true);

    const muzzleWorld = muzzleLocal.clone();
    this.marker.localToWorld(muzzleWorld);
    const dir = aim.clone().sub(muzzleWorld);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    else dir.normalize();

    const tracers = [];
    for (const u of [0.28, 0.46, 0.64]) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.008, 0.95, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe070 })
      );
      mesh.position.lerpVectors(muzzleWorld, aim, u);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.scene.add(mesh);
      tracers.push({ mesh, u });
    }

    this.muzzleLight.position.copy(muzzleWorld);
    this.muzzleLight.distance = 7;
    this.muzzleLight.intensity = 7.5;
    this.muzzleLight.color.set(0xffe566);

    this.menuShot = {
      cam: peek.cam,
      red: peek.red,
      yaw: this.yaw,
      pitch: this.pitch,
      flash,
      tracers,
      redBot,
      muzzle: muzzleLocal,
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

    if (Math.abs(this.camera.fov - 64) > 0.1) {
      this.camera.fov = 64;
      this.camera.updateProjectionMatrix();
    }

    const sway = Math.sin(t * 0.7) * 0.012;
    const bob = Math.sin(t * 1.15) * 0.008;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(shot.cam.x, shot.cam.y + EYE + bob, shot.cam.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(shot.yaw + sway * 0.35);
    this.camera.rotateX(shot.pitch + sway * 0.15);
    if (!this.camera.children.includes(this.marker)) this.camera.add(this.marker);
    this.marker.visible = true;
    const kick = 0.04 + Math.sin(t * 38) * 0.014;
    this.marker.position.set(0.24, -0.22 - kick * 0.4, -0.46 + kick * 0.25);
    this.marker.rotation.set(0.1 + kick * 1.6, 0.12, 0.03);

    const pulse = 0.72 + Math.sin(t * 42) * 0.28;
    if (shot.flash) {
      shot.flash.visible = true;
      shot.flash.scale.setScalar(0.9 + pulse * 0.5);
      shot.flash.traverse((obj) => {
        if (obj.material?.opacity != null) obj.material.opacity = 0.55 + pulse * 0.45;
      });
    }
    this.camera.updateMatrixWorld(true);
    this.marker.updateMatrixWorld(true);
    const muzzleWorld = (this.marker.userData.muzzle || shot.muzzle).clone();
    this.marker.localToWorld(muzzleWorld);
    this.muzzleLight.position.copy(muzzleWorld);
    this.muzzleLight.intensity = 5.8 + pulse * 3.4;
    this.muzzleLight.color.set(0xffe566);

    const aim = shot.red.clone();
    aim.y += 1.22 * BODY_K;
    const dir = aim.clone().sub(muzzleWorld);
    if (dir.lengthSq() > 0.0001) dir.normalize();
    else dir.set(0, 0, -1);
    for (const tr of shot.tracers) {
      tr.u += dt * 0.18;
      if (tr.u > 0.78) tr.u -= 0.54;
      tr.mesh.position.lerpVectors(muzzleWorld, aim, tr.u);
      tr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }

    if (shot.redBot?.alive) {
      shot.redBot.walkPhase += dt * 4.8;
      this.animateWalk(shot.redBot.mesh, 0.48, shot.redBot.walkPhase, 0, 0);
      shot.redBot.mesh.rotation.y = shot.redBot.yaw;
    }
  }

  tick() {
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
      this.applyVisualCull();
      this.drawRadar(dt);
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

