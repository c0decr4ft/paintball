import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { AudioEngine } from "./audio.js";
import { buildArena, createFighter, createMarker, TEAM } from "./arena.js";
import { splatTexture } from "./textures.js";

const AMMO_MAX = 200;
const TO_WIN = 5;
const EYE = 1.62;
const RADIUS = 0.38;
const BOT_R = 0.42;
const GRAVITY = 26;
const BALL_SPEED = 42;
const BALL_GRAVITY = 9;
const FIRE_RATE = 0.085;
const MAX_SPLATS = 900;
const MAX_BALLS = 48;

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = new AudioEngine();
    this.state = "menu";
    this.keys = new Set();
    this.buttons = { fire: false };
    this.yaw = 0;
    this.pitch = -0.12;
    this.clock = new THREE.Clock();
    this.locked = false;
    this.mouseDown = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 220);
    this.camera.position.set(18, 14, 32);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    this.scene.environmentIntensity = 0.55;

    this.arena = buildArena(this.scene);
    this.splats = [];
    this.balls = [];
    this.bots = [];
    this.muzzleLight = new THREE.PointLight(0x9fe7ff, 0, 4);
    this.scene.add(this.muzzleLight);

    this.marker = createMarker();
    this.camera.add(this.marker);
    this.scene.add(this.camera);

    this.playerRig = createFighter(TEAM.blue, true);
    this.scene.add(this.playerRig);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.55, 0.82);
    this.composer.addPass(bloom);
    this.composer.addPass(new SMAAPass(innerWidth, innerHeight));
    this.composer.addPass(new OutputPass());

    this.pos = this.arena.spawnBlue.clone();
    this.blueScore = 0;
    this.redScore = 0;
    this.roundLock = false;
    this.lives = 1;
    this.elims = 0;
    this.ammo = AMMO_MAX;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.out = false;
    this.spectateIdx = -1;
    this.spectating = false;
    this.velY = 0;
    this.onGround = true;
    this.crouch = 0;
    this.bob = 0;
    this.recoil = 0;
    this.spectateIdx = -1;
    this.spectating = false;

    this.bind();
    this.resize();
    this.resetMatch(false);
    this.previewMap = new URLSearchParams(location.search).has("preview");
    if (this.previewMap) {
      $("menu").hidden = true;
      $("hud").hidden = true;
    }
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

    this.blueScore = 0;
    this.redScore = 0;
    this.roundLock = false;
    this.lives = 1;
    this.elims = 0;
    this.wave = 1;
    this.ammo = AMMO_MAX;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.hitFlash = 0;
    this.respawnTimer = 0;
    this.out = false;
    this.spectateIdx = -1;
    this.spectating = false;
    this.velY = 0;
    this.onGround = true;
    this.crouch = 0;
    this.bob = 0;
    this.recoil = 0;
    this.startRound();
    this.syncHud();
    $("status").textContent = playing ? `${this.blueScore} – ${this.redScore} · first to ${TO_WIN}` : "";
    $("feed").innerHTML = "";
  }

  startRound() {
    this.roundLock = false;
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls.length = 0;
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots.length = 0;

    this.out = false;
    this.spectateIdx = -1;
    this.spectating = false;
    this.marker.visible = true;
    this.lives = 1;
    this.ammo = AMMO_MAX;
    this.reloading = 0;
    this.fireCooldown = 0;
    this.velY = 0;
    if (!this.pos) this.pos = this.arena.spawnBlue.clone();
    else this.pos.copy(this.arena.spawnBlue);
    this.yaw = Math.atan2(-(0 - this.pos.x), -(0 - this.pos.z));
    this.pitch = 0;

    const redSpots = [
      [26.2, -22.4],
      [28.4, -24.2],
      [24.0, -24.8],
      [29.0, -21.0],
      [25.2, -21.2],
    ];
    const blueSpots = [
      [-24.6, 19.4],
      [-20.4, 21.8],
      [-25.2, 17.6],
      [-19.8, 18.4],
    ];
    redSpots.forEach(([x, z], i) => this.spawnBot("red", x, z, i));
    blueSpots.forEach(([x, z], i) => this.spawnBot("blue", x, z, i));
    this.syncHud();
    if (this.state === "play") $("status").textContent = `${this.blueScore} – ${this.redScore} · first to ${TO_WIN}`;
  }

  spawnBot(team, x, z, lane = 0) {
    const color = team === "blue" ? TEAM.blue : TEAM.red;
    const mesh = createFighter(color);
    const px = x;
    const pz = z;
    mesh.position.set(px, 0, pz);
    this.scene.add(mesh);
    const laneCount = team === "red" ? 5 : 4;
    const laneX = -18 + (lane + 0.5) * (36 / laneCount);
    this.bots.push({
      mesh,
      team,
      lane,
      laneX,
      alive: true,
      hp: 1,
      yaw: Math.atan2(0 - px, 0 - pz),
      vel: new THREE.Vector3(),
      walkPhase: Math.random() * Math.PI * 2,
      walkAmt: 0,
      cooldown: 0.4 + Math.random(),
      think: Math.random() * 0.4,
      maxSpeed: 4.6 + Math.random() * 1.2,
      strafe: lane % 2 === 0 ? 1 : -1,
      mode: "advance",
      fall: 0,
      waypoint: this.nearestOpen(new THREE.Vector3(laneX, 0, team === "blue" ? 10 : -10), mesh.position),
      stuck: 0,
      lastPos: mesh.position.clone(),
    });
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
      if (e.code === "Escape" && this.state === "play") this.pause();
      if (e.code === "Space" && this.state === "play" && this.out) this.cycleSpectate();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clearInput();
    });

    addEventListener("mousedown", (e) => {
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
      if (e.button !== 0) return;
      this.mouseDown = false;
      this.buttons.fire = false;
    });
    addEventListener("mousemove", (e) => this.onMouse(e));
    document.addEventListener("pointerlockchange", () => this.onPointerLock());
    document.addEventListener("pointerlockerror", () => {
      $("status").textContent = "Click and drag to look";
    });

    $("play").addEventListener("click", (e) => {
      e.preventDefault();
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

    const params = new URLSearchParams(location.search);
    if (params.has("play") || params.has("demo")) {
      queueMicrotask(() => {
        this.start();
        if (params.has("demo")) {
          this.pos.set(0, 0, 23);
          this.yaw = 0;
          this.pitch = -0.12;
          for (let i = 0; i < 12; i++) {
            setTimeout(() => this.tryFire(), 400 + i * 100);
          }
        }
      });
    }
  }

  clearInput() {
    this.keys.clear();
    this.buttons.fire = false;
    this.mouseDown = false;
  }

  onPointerLock() {
    this.locked = Boolean(document.pointerLockElement);
    if (this.locked) {
      $("status").textContent = this.out ? $("status").textContent : "Live";
      return;
    }
    this.buttons.fire = false;
    if (this.state === "play") $("status").textContent = "Click to look around";
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
      if ($("status")) $("status").textContent = "Start failed — refresh";
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
    $("over-kicker").textContent = won ? "Blue wins the match" : "Red wins the match";
    $("over-title").textContent = won ? "BLUE" : "RED";
    $("over-copy").textContent = won
      ? `First to ${TO_WIN}. Final ${this.blueScore}–${this.redScore}. You painted ${this.elims}.`
      : `First to ${TO_WIN}. Final ${this.blueScore}–${this.redScore}. You painted ${this.elims}.`;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onMouse(e) {
    if (this.state !== "play") return;
    if (!this.locked && !this.mouseDown) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch -= e.movementY * 0.0022;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  reload() {
    if (this.state !== "play" || this.reloading > 0 || this.ammo >= AMMO_MAX || this.out) return;
    this.reloading = 1.6;
    this.audio.reload();
    $("status").textContent = "Reloading hopper";
  }

  feed(text) {
    const b = document.createElement("b");
    b.textContent = text;
    $("feed").prepend(b);
    while ($("feed").children.length > 5) $("feed").lastChild.remove();
  }

  syncHud() {
    $("elims").textContent = this.elims;
    const blueAi = this.bots.filter((b) => b.team === "blue" && b.alive).length;
    const redAi = this.bots.filter((b) => b.team === "red" && b.alive).length;
    if ($("blue-left")) $("blue-left").textContent = blueAi + (this.out ? 0 : 1);
    if ($("red-left")) $("red-left").textContent = redAi;
    if ($("score-blue")) $("score-blue").textContent = this.blueScore;
    if ($("score-red")) $("score-red").textContent = this.redScore;
    $("ammo").textContent = this.ammo;
  }

  eyeHeight() {
    return THREE.MathUtils.lerp(EYE, 1.05, this.crouch);
  }

  collide(pos, radius, height) {
    const yMin = pos.y + 0.08;
    const yMax = pos.y + height;
    for (const c of this.arena.colliders) {
      const box = c.box;
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

  blocked(x, z, radius = 0.7) {
    return this.arena.blockedXZ(x, z, radius);
  }

  clearPath(ax, az, bx, bz, radius = 0.52) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return !this.blocked(ax, az, radius);
    const steps = Math.max(2, Math.ceil(dist / 0.4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked(ax + dx * t, az + dz * t, radius)) return false;
    }
    return true;
  }

  nearestOpen(target, from = null) {
    let best = null;
    let bestD = 1e9;
    for (const w of this.arena.waypoints) {
      if (this.blocked(w.x, w.z, 0.85)) continue;
      if (from && !this.clearPath(from.x, from.z, w.x, w.z, 0.5)) continue;
      const d = (w.x - target.x) ** 2 + (w.z - target.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) return best.clone();
    bestD = 1e9;
    for (const w of this.arena.waypoints) {
      const d = (w.x - target.x) ** 2 + (w.z - target.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best ? best.clone() : target.clone();
  }

  pickWaypoint(bot, goal) {
    const taken = [];
    for (const other of this.bots) {
      if (other === bot || !other.alive || !other.waypoint) continue;
      taken.push(other.waypoint);
    }
    let best = null;
    let bestScore = -1e9;
    const px = bot.mesh.position.x;
    const pz = bot.mesh.position.z;
    for (const w of this.arena.waypoints) {
      if (this.blocked(w.x, w.z, 0.85)) continue;
      if (!this.clearPath(px, pz, w.x, w.z, 0.52)) continue;
      let crowded = false;
      for (const o of taken) {
        if ((o.x - w.x) ** 2 + (o.z - w.z) ** 2 < 7) {
          crowded = true;
          break;
        }
      }
      const toGoal = Math.hypot(w.x - goal.x, w.z - goal.z);
      const toBot = Math.hypot(w.x - px, w.z - pz);
      let score = -toGoal * 0.65 - toBot * 0.28 - Math.abs(w.x - bot.laneX) * 0.4 + Math.random() * 2;
      if (crowded) score -= 9;
      if (toBot < 1.15) score -= 5;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best ? best.clone() : this.nearestOpen(goal, bot.mesh.position);
  }

  steerDir(from, want) {
    const len = Math.hypot(want.x, want.z) || 1;
    const nx = want.x / len;
    const nz = want.z / len;
    const base = Math.atan2(nx, nz);
    const tries = [0, 0.4, -0.4, 0.9, -0.9, 1.45, -1.45, 2.15, -2.15, Math.PI];
    let best = null;
    for (const a of tries) {
      const ang = base + a;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      if (this.blocked(from.x + dx * 1.6, from.z + dz * 1.6, 0.55)) continue;
      const score = dx * nx + dz * nz - Math.abs(a) * 0.12;
      if (!best || score > best.s) best = { dx, dz, s: score };
    }
    if (!best) return new THREE.Vector3(-nx, 0, -nz);
    return new THREE.Vector3(best.dx, 0, best.dz);
  }

  groundY(pos, radius) {
    let gy = 0;
    for (const c of this.arena.colliders) {
      const box = c.box;
      if (
        pos.x + radius > box.min.x &&
        pos.x - radius < box.max.x &&
        pos.z + radius > box.min.z &&
        pos.z - radius < box.max.z
      ) {
        if (pos.y >= box.max.y - 0.35 && pos.y <= box.max.y + 0.55) {
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
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(this.pos.x + bobX, this.pos.y + this.eyeHeight() + bobY, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.playerRig.position.copy(this.pos);
    this.playerRig.rotation.y = this.yaw;
  }

  spectateTargets() {
    const alive = this.bots.filter((b) => b.alive);
    return [
      ...alive.filter((b) => b.team === "blue"),
      ...alive.filter((b) => b.team === "red"),
    ];
  }

  cycleSpectate() {
    const targets = this.spectateTargets();
    if (!targets.length) {
      this.spectating = false;
      this.spectateIdx = -1;
      $("status").textContent = "Wiped · no one left to watch";
      return;
    }
    this.spectating = true;
    this.spectateIdx = (this.spectateIdx + 1) % targets.length;
    const bot = targets[this.spectateIdx];
    $("status").textContent = `Spectating ${bot.team === "blue" ? "BLUE" : "RED"} · Space next`;
  }

  applySpectateCamera() {
    const targets = this.spectateTargets();
    if (!targets.length) {
      this.spectating = false;
      this.marker.visible = false;
      this.applyCamera();
      return;
    }
    if (!this.spectating || this.spectateIdx < 0) {
      this.spectating = true;
      this.spectateIdx = 0;
    }
    this.spectateIdx %= targets.length;
    const bot = targets[this.spectateIdx];
    this.marker.visible = false;
    const eye = new THREE.Vector3(0, 1.55, 0.12);
    bot.mesh.localToWorld(eye);
    const look = new THREE.Vector3(0, 1.4, -5);
    bot.mesh.localToWorld(look);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(eye);
    this.camera.lookAt(look);
  }

  updatePlayer(dt) {
    if (this.out) {
      if (!this.roundLock) {
        if (!this.spectating) {
          $("status").textContent = "Wiped · Space to spectate";
        } else {
          const targets = this.spectateTargets();
          const bot = targets[this.spectateIdx];
          if (bot) {
            $("status").textContent = `Spectating ${bot.team === "blue" ? "BLUE" : "RED"} · Space next`;
          }
        }
      }
      this.marker.visible = false;
      if (this.spectating) this.applySpectateCamera();
      else this.applyCamera();
      return;
    }

    this.marker.visible = true;
    this.crouch = THREE.MathUtils.damp(this.crouch, this.keys.has("KeyC") ? 1 : 0, 12, dt);
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = (this.keys.has("KeyC") ? 3.2 : sprint ? 11.5 : 7.2) * (this.onGround ? 1 : 0.85);

    const f = this.forward();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) wish.add(f);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) wish.sub(f);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) wish.add(r);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) wish.sub(r);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * dt);

    this.pos.add(wish);
    this.collide(this.pos, RADIUS, this.eyeHeight());

    this.velY -= GRAVITY * dt;
    this.pos.y += this.velY * dt;
    const gy = this.groundY(this.pos, RADIUS);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.keys.has("Space") && this.onGround && this.crouch < 0.4) {
      this.velY = 8.2;
      this.onGround = false;
    }

    const moving = wish.lengthSq() > 0 && this.onGround;
    this.bob += dt * (moving ? (sprint ? 14 : 10) : 2);
    const bobY = moving ? Math.sin(this.bob) * 0.035 : 0;
    const bobX = moving ? Math.cos(this.bob * 0.5) * 0.02 : 0;

    this.applyCamera(bobX, bobY);

    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 14, dt);
    this.marker.position.set(0.34 + bobX * 0.4, -0.28 - this.recoil, -0.52 + this.recoil * 0.8);
    this.marker.rotation.set(0.06 + this.recoil * 2.2, 0.18, 0.03);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = AMMO_MAX;
        $("status").textContent = "Hopper full";
        this.syncHud();
      }
    }

    this.fireCooldown -= dt;
    if (this.buttons.fire) this.tryFire();
  }

  tryFire() {
    if (this.out || this.reloading > 0 || this.fireCooldown > 0) return;
    if (this.ammo <= 0) {
      this.audio.empty();
      this.fireCooldown = 0.18;
      $("status").textContent = "Empty · R reload";
      return;
    }
    this.ammo -= 1;
    this.fireCooldown = FIRE_RATE;
    this.recoil = 0.045;
    this.audio.shoot();
    this.syncHud();

    const origin = new THREE.Vector3();
    const muzzle = this.marker.userData.muzzle.clone();
    this.marker.localToWorld(origin.copy(muzzle));
    const dir = this.lookDir();
    dir.x += (Math.random() - 0.5) * 0.02;
    dir.y += (Math.random() - 0.5) * 0.016;
    dir.normalize();
    this.spawnBall(origin, dir, TEAM.blue, "blue");
    this.muzzleLight.position.copy(origin);
    this.muzzleLight.intensity = 3.5;
  }

  spawnBall(origin, dir, color, team) {
    if (this.balls.length >= MAX_BALLS) {
      const old = this.balls.shift();
      this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 })
    );
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.balls.push({
      mesh,
      vel: dir.clone().multiplyScalar(BALL_SPEED),
      color,
      team,
      life: 2.4,
    });
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

  spawnSplat(point, normal, color, parent = null) {
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
    const size = 0.85 + Math.random() * 0.55;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.rotateZ(Math.random() * Math.PI);

    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(mesh.position.copy(point).addScaledVector(n, 0.03));
      const worldQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const parentQ = new THREE.Quaternion();
      parent.getWorldQuaternion(parentQ);
      mesh.quaternion.copy(parentQ.clone().invert().multiply(worldQ));
      mesh.rotateZ(Math.random() * Math.PI);
      parent.add(mesh);
    } else {
      mesh.position.copy(point).addScaledVector(n, 0.028);
      this.scene.add(mesh);
      this.splats.push(mesh);
    }

    while (this.splats.length > MAX_SPLATS) {
      const old = this.splats.shift();
      this.scene.remove(old);
      old.material?.map?.dispose();
      old.material?.dispose();
    }
    return mesh;
  }

  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const prev = b.mesh.position.clone();
      b.vel.y -= BALL_GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
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
      if (b.team === "red" && !this.out && hitKind !== "bot") {
        const playerBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight() * 0.5, this.pos.z),
          new THREE.Vector3(0.7, this.eyeHeight(), 0.7)
        );
        if (playerBox.containsPoint(b.mesh.position) || playerBox.containsPoint(prev)) {
          this.playerHit(b.mesh.position.clone(), delta.clone().normalize());
          hitKind = "player";
        }
      }

      if (!hitKind) {
        const surface = this.resolveSurface(prev, b.mesh.position);
        if (surface) {
          this.spawnSplat(surface.point, surface.normal, b.color);
          this.audio.splat();
          hitKind = "world";
        }
      }

      if (hitKind || b.life <= 0) {
        this.scene.remove(b.mesh);
        this.balls.splice(i, 1);
      }
    }
  }

  ballHitsBot(prev, curr, bot) {
    const origin = bot.mesh.position;
    const radius = 0.52;
    const yMin = origin.y + 0.12;
    const yMax = origin.y + 1.82;
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
    const paint = byTeam === "blue" ? TEAM.blue : TEAM.red;
    if (bot.team === "red") {
      this.elims += 1;
      this.feed(byTeam === "blue" ? "Red wiped" : "Red down");
    } else {
      this.feed("Blue teammate wiped");
    }
    this.syncHud();
    this.audio.elim();

    // Stick paint on the player kit, not floating in world space
    const local = new THREE.Vector3(0, 1.15, 0.24);
    bot.mesh.localToWorld(local);
    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(bot.mesh.quaternion);
    this.spawnSplat(local, outward, paint, bot.mesh);

    // Also leave a mark on the nearest wall/ground behind them
    const dir = inbound && inbound.lengthSq() > 0 ? inbound.clone().normalize() : outward.clone();
    const behind = this.resolveSurface(point.clone().addScaledVector(dir, -0.2), point.clone().addScaledVector(dir, 1.4));
    if (behind) this.spawnSplat(behind.point, behind.normal, paint);

    bot.mesh.traverse((c) => {
      if (c.material && c.material.color && !c.material.map) {
        c.material = c.material.clone();
        c.material.color.lerp(new THREE.Color(paint), 0.4);
      }
    });

    this.checkRound();
  }

  playerHit(point, inbound = null) {
    this.out = true;
    this.lives = 0;
    this.hitFlash = 1;
    this.spectateIdx = -1;
    this.spectating = false;
    this.marker.visible = false;
    this.syncHud();
    this.audio.hit();
    this.feed("You got painted · Space to spectate");
    // Ground mark at your feet — never a floating blob in your face
    this.spawnSplat(new THREE.Vector3(this.pos.x, 0.03, this.pos.z), new THREE.Vector3(0, 1, 0), TEAM.red);
    if (inbound && inbound.lengthSq() > 0) {
      const dir = inbound.clone().normalize();
      const behind = this.resolveSurface(
        point.clone().addScaledVector(dir, -0.15),
        point.clone().addScaledVector(dir, 1.6)
      );
      if (behind) this.spawnSplat(behind.point, behind.normal, TEAM.red);
    }
    $("hit-flash").classList.add("on");
    setTimeout(() => $("hit-flash").classList.remove("on"), 180);
    this.checkRound();
  }

  teamAlive(team) {
    const ai = this.bots.filter((b) => b.team === team && b.alive).length;
    return team === "blue" ? ai + (this.out ? 0 : 1) : ai;
  }

  checkRound() {
    if (this.roundLock || this.state !== "play") return;
    if (this.teamAlive("red") <= 0) this.endRound("blue");
    else if (this.teamAlive("blue") <= 0) this.endRound("red");
  }

  endRound(winner) {
    this.roundLock = true;
    if (winner === "blue") this.blueScore += 1;
    else this.redScore += 1;
    this.syncHud();
    this.feed(winner === "blue" ? "Blue takes the round" : "Red takes the round");
    $("status").textContent = `${this.blueScore} – ${this.redScore} · first to ${TO_WIN}`;
    if (this.blueScore >= TO_WIN || this.redScore >= TO_WIN) {
      setTimeout(() => {
        if (this.state === "play") this.gameOver(this.blueScore >= TO_WIN);
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

  animateBot(bot, dt, moving, aiming) {
    const u = bot.mesh.userData;
    const t = this.clock.elapsedTime;
    const speed = bot.vel.length();
    bot.walkAmt = THREE.MathUtils.damp(bot.walkAmt, moving ? 1 : 0, 18, dt);
    const amt = bot.walkAmt;
    bot.walkPhase += dt * (6.2 + speed * 2.4);
    const s = Math.sin(bot.walkPhase);
    const c = Math.cos(bot.walkPhase);
    const breathe = Math.sin(t * 2.1 + bot.walkPhase) * 0.012 * (1 - amt);
    u.hips.position.y = 0.94 + Math.abs(s) * 0.07 * amt + breathe;
    u.hips.rotation.z = c * 0.06 * amt;
    const swing = 1.2 * amt;
    u.leftThigh.rotation.x = s * swing;
    u.rightThigh.rotation.x = -s * swing;
    u.leftShin.rotation.x = (0.15 + Math.max(0, -s) * 1.05) * amt;
    u.rightShin.rotation.x = (0.15 + Math.max(0, s) * 1.05) * amt;
    u.leftArm.rotation.x = -s * 0.85 * amt;
    u.leftArm.rotation.z = 0.14;
    u.rightArm.rotation.z = -0.1;
    u.rightArm.rotation.x = aiming ? -0.55 : s * 0.45 * amt - 0.22;
    u.torso.rotation.y = s * 0.12 * amt;
    u.torso.rotation.x = aiming ? 0.08 : 0.04 * amt;
    u.head.rotation.x = aiming ? -0.08 : -0.04;
  }

  combatAim(bot, playerPos) {
    const foes = [];
    const enemy = bot.team === "red" ? "blue" : "red";
    if (bot.team === "red" && !this.out) {
      foes.push({
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
        dist: bot.mesh.position.distanceTo(playerPos),
      });
    }
    for (const other of this.bots) {
      if (!other.alive || other.team !== enemy) continue;
      foes.push({
        x: other.mesh.position.x,
        y: other.mesh.position.y + 1.35,
        z: other.mesh.position.z,
        dist: bot.mesh.position.distanceTo(other.mesh.position),
      });
    }
    if (!foes.length) return null;
    foes.sort((a, b) => a.dist - b.dist);
    return foes[Math.min(bot.lane % foes.length, foes.length - 1)];
  }

  updateBots(dt) {
    const playerPos = this.pos.clone();
    playerPos.y += this.eyeHeight() * 0.6;
    for (const bot of this.bots) {
      if (!bot.alive) {
        bot.fall += dt;
        bot.mesh.rotation.x = THREE.MathUtils.damp(bot.mesh.rotation.x, 1.25, 5, dt);
        bot.mesh.position.y = THREE.MathUtils.damp(bot.mesh.position.y, 0.12, 4, dt);
        if (bot.mesh.userData.shadow) bot.mesh.userData.shadow.material.opacity = 0.08;
        if (bot.fall > 2.1 && bot.mesh.parent) this.scene.remove(bot.mesh);
        continue;
      }

      bot.cooldown -= dt;
      bot.think -= dt;
      const pos = bot.mesh.position;
      const target = this.combatAim(bot, playerPos);
      const aimPos = target
        ? new THREE.Vector3(target.x, target.y, target.z)
        : new THREE.Vector3(bot.laneX, 1.2, bot.team === "blue" ? -14 : 14);
      const dist = Math.hypot(aimPos.x - pos.x, aimPos.z - pos.z);
      const los = Boolean(target) && this.hasLos(pos.clone().setY(1.5), aimPos);

      const goal = new THREE.Vector3(THREE.MathUtils.lerp(aimPos.x, bot.laneX, 0.5), 0, aimPos.z);
      if (bot.mode === "roam") goal.set(bot.laneX + bot.strafe * 5, 0, bot.team === "blue" ? pos.z - 10 : pos.z + 10);
      else if (bot.mode === "retreat") goal.set(bot.laneX, 0, bot.team === "blue" ? Math.min(22, pos.z + 8) : Math.max(-22, pos.z - 8));
      if (this.blocked(goal.x, goal.z, 0.9)) {
        const open = this.nearestOpen(goal, pos);
        goal.copy(open);
      }

      if (!bot.waypoint || this.blocked(bot.waypoint.x, bot.waypoint.z, 0.8)) {
        bot.waypoint = this.pickWaypoint(bot, goal);
      }
      const toWp = Math.hypot(bot.waypoint.x - pos.x, bot.waypoint.z - pos.z);
      if (bot.think <= 0 || toWp < 1.35) {
        bot.think = 0.4 + Math.random() * 0.75;
        bot.strafe *= Math.random() > 0.55 ? -1 : 1;
        if (los && dist < 8) bot.mode = Math.random() > 0.4 ? "peek" : "retreat";
        else if (los && dist < 16) bot.mode = Math.random() > 0.45 ? "strafe" : "advance";
        else if (!los) bot.mode = "advance";
        else bot.mode = Math.random() > 0.65 ? "roam" : "advance";
        bot.waypoint = this.pickWaypoint(bot, goal);
      }

      const want = new THREE.Vector3(bot.waypoint.x - pos.x, 0, bot.waypoint.z - pos.z);
      if (bot.mode === "strafe" || bot.mode === "peek") {
        const side = new THREE.Vector3(-want.z, 0, want.x);
        if (side.lengthSq() > 0.0001) {
          side.normalize().multiplyScalar(bot.strafe * (bot.mode === "peek" ? 1.3 : 0.75));
          want.add(side);
        }
      }
      const desired = this.steerDir(pos, want.lengthSq() > 0.01 ? want : new THREE.Vector3(0, 0, bot.team === "blue" ? -1 : 1));

      const aiming = Boolean(target) && los && dist < 32;
      const lookTarget = aiming ? aimPos : pos.clone().add(desired);
      bot.yaw = this.lerpAngle(bot.yaw, Math.atan2(lookTarget.x - pos.x, lookTarget.z - pos.z), 1 - Math.exp(-7 * dt));
      bot.mesh.rotation.y = bot.yaw;

      const targetSpeed = bot.mode === "peek" ? bot.maxSpeed * 0.45 : bot.mode === "strafe" ? bot.maxSpeed * 0.82 : bot.maxSpeed;
      const accel = 16;
      bot.vel.x += desired.x * accel * dt;
      bot.vel.z += desired.z * accel * dt;
      const max = aiming && dist < 14 ? targetSpeed * 0.72 : targetSpeed;
      if (bot.vel.length() > max) bot.vel.setLength(max);

      const intended = pos.clone().addScaledVector(bot.vel, dt);
      pos.addScaledVector(bot.vel, dt);
      this.collide(pos, BOT_R, 1.7);
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
        const minGap = other.team === bot.team ? 2.25 : 1.05;
        const gap = pos.distanceTo(other.mesh.position);
        if (gap < minGap && gap > 0.0001) {
          pos.add(pos.clone().sub(other.mesh.position).setY(0).normalize().multiplyScalar(minGap - gap));
        }
      }
      this.collide(pos, BOT_R, 1.7);
      pos.y = 0;

      const moved = Math.hypot(pos.x - bot.lastPos.x, pos.z - bot.lastPos.z);
      if (want.length() > 0.35 && moved < 0.03) bot.stuck += dt;
      else bot.stuck = Math.max(0, bot.stuck - dt * 0.6);
      bot.lastPos.copy(pos);
      if (bot.stuck > 0.3) {
        bot.vel.x *= -0.55;
        bot.vel.z *= -0.55;
        bot.waypoint = this.nearestOpen(
          new THREE.Vector3(pos.x + (Math.random() - 0.5) * 14, 0, pos.z + (Math.random() - 0.5) * 14),
          pos
        );
        bot.stuck = 0;
        bot.think = 0.12;
        bot.strafe *= -1;
        bot.mode = "roam";
      }

      if (aiming && bot.cooldown <= 0 && dist < 32) {
        bot.cooldown = 0.38 + Math.random() * 0.55;
        const muzzle = new THREE.Vector3(pos.x, 1.38, pos.z);
        const aim = new THREE.Vector3(aimPos.x, aimPos.y, aimPos.z).sub(muzzle);
        aim.x += (Math.random() - 0.5) * 0.08;
        aim.y += (Math.random() - 0.5) * 0.05;
        aim.normalize();
        muzzle.addScaledVector(aim, 0.55);
        this.spawnBall(muzzle, aim, bot.team === "blue" ? TEAM.blue : TEAM.red, bot.team);
      }

      this.animateBot(bot, dt, bot.vel.length() > 0.22, aiming);
    }
  }

  hasLos(from, to) {
    const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to) - 0.4);
    for (const c of this.arena.colliders) {
      if (ray.intersectObject(c.mesh, true)[0]) return false;
    }
    return true;
  }

  updateMenuCam(t) {
    if (this.previewMap) {
      this.camera.up.set(0, 0, 1);
      this.camera.position.set(0, 78, 0);
      this.camera.lookAt(0, 0, 0);
      this.camera.remove(this.marker);
      return;
    }
    const r = 42;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(Math.sin(t * 0.1) * r, 28 + Math.sin(t * 0.18) * 3, Math.cos(t * 0.1) * r);
    this.camera.lookAt(0, 0.4, 0);
    this.camera.remove(this.marker);
  }

  tick() {
    const dt = Math.min(0.033, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.muzzleLight.intensity = THREE.MathUtils.damp(this.muzzleLight.intensity, 0, 18, dt);

    if (this.state === "menu" || this.state === "over") {
      if (!this.camera.children.includes(this.marker)) {
        /* keep cinematic */
      } else {
        this.camera.remove(this.marker);
      }
      this.updateMenuCam(t);
      this.updateBalls(dt);
      for (const bot of this.bots) {
        if (bot.alive) this.animateBot(bot, dt, false, false);
      }
    } else if (this.state === "play") {
      if (!this.camera.children.includes(this.marker)) this.camera.add(this.marker);
      this.updatePlayer(dt);
      this.updateBots(dt);
      this.updateBalls(dt);
    } else if (this.state === "pause") {
      this.updateBalls(dt);
    }

    this.composer.render();
  }
}
