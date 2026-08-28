export const NET_TICK_MS = 1000 / 30;
export const MAX_PLAYERS = 10;
export const DEFAULT_CLOUD_WS = "wss://paintfield.onrender.com";

let loadedWs = "";

function envString(key) {
  const env = import.meta.env || {};
  return String(env[key] || "").trim();
}

export async function loadOnlineConfig() {
  if (envString("VITE_WS_URL")) {
    loadedWs = envString("VITE_WS_URL").replace(/\/$/, "");
    return loadedWs;
  }
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  try {
    const res = await fetch(`${base}online.json`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      loadedWs = String(data.wsUrl || data.ws || "").replace(/\/$/, "");
    }
  } catch {
    /* local fallbacks still apply */
  }
  return loadedWs;
}

function sameOriginWs() {
  if (typeof location === "undefined") return null;
  const host = location.hostname || "";
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  if (/\.github\.io$/i.test(host)) return null;
  const ws = location.protocol === "https:" ? "wss:" : "ws:";
  return `${ws}//${location.host}`;
}

function resolveWsUrl() {
  const hosted = loadedWs || envString("VITE_WS_URL").replace(/\/$/, "");
  const local =
    typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
  const direct = local ? `${proto}://${location.hostname}:8787` : null;
  const proxied = local ? `${proto}://${location.host}/ws` : null;
  if (local) {
    const fromEnv = envString("VITE_WS_URL").replace(/\/$/, "");
    if (fromEnv) return { url: fromEnv, fallback: proxied };
    return { url: direct, fallback: proxied && proxied !== direct ? proxied : null };
  }
  const same = sameOriginWs();
  if (hosted) return { url: hosted, fallback: null };
  if (same) return { url: same, fallback: null };
  if (DEFAULT_CLOUD_WS) return { url: DEFAULT_CLOUD_WS, fallback: null };
  return { url: null, fallback: null };
}

function randomRoom() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}

export class NetClient {
  constructor(handlers) {
    this.handlers = handlers;
    this.ws = null;
    this.myId = "";
    this.room = "";
    this.hostId = "";
    this.mode = "classic";
    this.maxPlayers = MAX_PLAYERS;
    this.phase = "";
    this.players = [];
    this.connected = false;
    this.latency = 0;
    this.connGen = 0;
    this.pingTimer = null;
    this.pingAt = 0;
    this.lastPoseAt = 0;
  }

  get online() {
    return this.connected && Boolean(this.myId);
  }

  get isHost() {
    return this.online && this.myId === this.hostId;
  }

  createRoom(opts) {
    this.connect({ ...opts, action: "create", room: opts.room || randomRoom() });
  }

  joinRoom(opts) {
    this.connect({ ...opts, action: "join" });
  }

  quickPlay(opts) {
    this.connect({ ...opts, action: "match" });
  }

  connect(opts) {
    this.disconnect();
    const { url, fallback } = resolveWsUrl();
    if (!url) {
      this.handlers.onStatus?.("Server not configured — run npm run dev:online or deploy to Render");
      this.handlers.onError?.("no websocket url");
      return;
    }
    const gen = ++this.connGen;
      this.handlers.onStatus?.(opts.action === "match" ? "Finding match…" : opts.action === "create" ? "Creating room…" : "Joining room…");
    this.openSocket(url, opts, fallback, gen);
  }

  openSocket(url, opts, fallback, gen) {
    if (gen !== this.connGen) return;
    const ws = new WebSocket(url);
    this.ws = ws;
    let settled = false;

    ws.onopen = () => {
      if (gen !== this.connGen || this.ws !== ws) {
        ws.close();
        return;
      }
      settled = true;
      this.connected = true;
      const payload =
        opts.action === "match"
          ? { t: "match", name: opts.name, team: opts.team || "" }
          : opts.action === "create"
            ? {
                t: "create",
                name: opts.name,
                room: opts.room,
                password: opts.password || "",
                maxPlayers: opts.maxPlayers || MAX_PLAYERS,
                mode: opts.mode === "bomb" ? "bomb" : "classic",
                team: opts.team || "",
              }
            : {
                t: "join",
                name: opts.name,
                room: opts.room,
                password: opts.password || "",
                team: opts.team || "",
              };
      ws.send(JSON.stringify(payload));
      this.pingAt = performance.now();
      ws.send(JSON.stringify({ t: "ping", n: this.pingAt }));
      this.startPing(ws, gen);
    };

    ws.onmessage = (ev) => {
      if (gen !== this.connGen || this.ws !== ws) return;
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.handle(msg);
    };

    ws.onclose = () => {
      if (gen !== this.connGen) return;
      if (!settled && fallback) {
        this.openSocket(fallback, opts, null, gen);
        return;
      }
      this.connected = false;
      this.stopPing();
      this.handlers.onStatus?.("Disconnected");
      this.handlers.onDisconnect?.();
    };

    ws.onerror = () => {
      if (gen !== this.connGen) return;
      if (!settled && fallback) return;
      this.handlers.onStatus?.("Could not reach the game server");
    };
  }

  startPing(ws, gen) {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (gen !== this.connGen || this.ws !== ws || ws.readyState !== 1) return;
      this.pingAt = performance.now();
      ws.send(JSON.stringify({ t: "ping", n: this.pingAt }));
    }, 2000);
  }

  stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  handle(msg) {
    if (msg.t === "pong") {
      this.latency = Math.max(0, Math.round(performance.now() - Number(msg.n || this.pingAt)));
      this.handlers.onPing?.(this.latency);
      return;
    }
    if (msg.t === "error") {
      this.handlers.onError?.(msg.error || "error");
      this.handlers.onStatus?.(msg.error || "error");
      return;
    }
    if (msg.t === "welcome") {
      this.myId = msg.id;
      this.room = msg.room;
      this.hostId = msg.hostId;
      this.mode = msg.mode;
      this.maxPlayers = msg.maxPlayers;
      this.phase = msg.phase;
      this.players = msg.players || [];
      this.handlers.onWelcome?.(msg);
      this.handlers.onLobby?.(msg);
      return;
    }
    if (msg.t === "lobby") {
      this.hostId = msg.hostId || this.hostId;
      this.mode = msg.mode || this.mode;
      this.phase = msg.phase || this.phase;
      this.players = msg.players || this.players;
      this.handlers.onLobby?.(msg);
      return;
    }
    if (msg.t === "notice") {
      this.handlers.onNotice?.(msg.text);
      return;
    }
    if (msg.t === "leave") {
      this.hostId = msg.hostId || this.hostId;
      this.players = this.players.filter((p) => p.id !== msg.id);
      this.handlers.onLeave?.(msg);
      return;
    }
    if (msg.t === "begin") {
      this.phase = "play";
      this.hostId = msg.hostId || this.hostId;
      this.mode = msg.mode || this.mode;
      this.players = msg.players || this.players;
      this.handlers.onBegin?.(msg);
      return;
    }
    if (msg.t === "state") {
      this.handlers.onState?.(msg);
      return;
    }
    if (msg.t === "shot") {
      this.handlers.onShot?.(msg);
      return;
    }
    if (msg.t === "kill") {
      this.handlers.onKill?.(msg);
      return;
    }
    if (msg.t === "botKill") {
      this.handlers.onBotKill?.(msg);
      return;
    }
    if (msg.t === "planted") {
      this.handlers.onPlanted?.(msg);
      return;
    }
    if (msg.t === "defused") {
      this.handlers.onDefused?.(msg);
      return;
    }
    if (msg.t === "dropped") {
      this.handlers.onDropped?.(msg);
      return;
    }
    if (msg.t === "round") {
      this.players = msg.players || this.players;
      this.handlers.onRound?.(msg);
      return;
    }
    if (msg.t === "over") {
      this.phase = "over";
      this.handlers.onOver?.(msg);
    }
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  sendStart() {
    this.send({ t: "start" });
  }

  sendPose(pose) {
    const now = performance.now();
    if (now - this.lastPoseAt < NET_TICK_MS * 0.85) return;
    this.lastPoseAt = now;
    this.send({ t: "pose", ...pose });
  }

  sendShoot(ox, oy, oz, dx, dy, dz, team, dmg) {
    this.send({ t: "shoot", ox, oy, oz, dx, dy, dz, team, dmg });
  }

  sendHit(targetId) {
    this.send({ t: "hit", targetId });
  }

  sendHitBot(i) {
    this.send({ t: "hitBot", i });
  }

  sendPlant(x, y, z, site) {
    this.send({ t: "plant", x, y, z, site });
  }

  sendDefuse() {
    this.send({ t: "defuse" });
  }

  sendDrop(x, y, z) {
    this.send({ t: "drop", x, y, z });
  }

  sendRound(winner, blueScore, redScore) {
    this.send({ t: "round", winner, blueScore, redScore });
  }

  sendOver(winner) {
    this.send({ t: "over", winner });
  }

  disconnect() {
    this.connGen += 1;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    this.myId = "";
    this.room = "";
    this.hostId = "";
    this.phase = "";
    this.players = [];
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export { randomRoom };
