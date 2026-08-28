import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const ON_RENDER = Boolean(process.env.RENDER);
const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = process.env.STATIC_DIR
  ? process.env.STATIC_DIR
  : existsSync(join(DIR, "..", "dist"))
    ? join(DIR, "..", "dist")
    : null;
const STATIC_BASE = (process.env.STATIC_BASE !== undefined ? process.env.STATIC_BASE : ON_RENDER ? "" : "").replace(
  /\/$/,
  ""
);
const NET_TICK_MS = 1000 / 30;
const MAX_PLAYERS = 10;
const TEAM_CAP = 5;
const NAME_MAX = 16;

/** @typedef {{ id: string, name: string, team: "blue" | "red", ws: import("ws").WebSocket, room: string, alive: boolean, lastPoseAt: number, lastShootAt: number, pose: object }} Client */
/** @typedef {{ name: string, password: string, maxPlayers: number, mode: "classic" | "bomb", hostId: string, phase: "lobby" | "play" | "over", site: "A" | "B", carrierId: string, blueScore: number, redScore: number, bots: object[], clients: Map<string, Client> }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
};

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, except) {
  const raw = JSON.stringify(msg);
  for (const c of room.clients.values()) {
    if (except && c.id === except) continue;
    if (c.ws.readyState === 1) c.ws.send(raw);
  }
}

function sanitizeName(raw) {
  const cleaned = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} _]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return cleaned || "PLAYER";
}

function sanitizeRoomName(raw) {
  return (
    String(raw || "arena")
      .replace(/[^\w\- ]/g, "")
      .trim()
      .slice(0, 24) || "arena"
  );
}

function sanitizePassword(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 32);
}

function num(v, lo, hi, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function roomPlayers(room) {
  return [...room.clients.values()].map((c) => ({
    id: c.id,
    name: c.name,
    team: c.team,
    alive: c.alive,
  }));
}

function countTeam(room, team) {
  let n = 0;
  for (const c of room.clients.values()) if (c.team === team) n += 1;
  return n;
}

function roomOpen(room) {
  if (room.password) return false;
  if (room.phase === "over") return false;
  if (room.clients.size >= room.maxPlayers) return false;
  if (countTeam(room, "blue") >= TEAM_CAP && countTeam(room, "red") >= TEAM_CAP) return false;
  return true;
}

function findOpenRoom() {
  const open = [];
  for (const room of rooms.values()) {
    if (roomOpen(room)) open.push(room);
  }
  open.sort((a, b) => b.clients.size - a.clients.size);
  return open[0] || null;
}

function createMatchRoom() {
  let n = 1;
  while (rooms.has(`M${n}`)) n += 1;
  const room = {
    name: `M${n}`,
    password: "",
    maxPlayers: MAX_PLAYERS,
    mode: "classic",
    hostId: "",
    phase: "lobby",
    site: "A",
    carrierId: "",
    blueScore: 0,
    redScore: 0,
    bots: [],
    clients: new Map(),
  };
  rooms.set(room.name, room);
  return room;
}

function pickTeam(room, wanted) {
  const want = wanted === "red" || wanted === "blue" ? wanted : "";
  const blue = countTeam(room, "blue");
  const red = countTeam(room, "red");
  if (want === "blue" && blue < TEAM_CAP) return "blue";
  if (want === "red" && red < TEAM_CAP) return "red";
  if (blue < TEAM_CAP && red < TEAM_CAP) return blue <= red ? "blue" : "red";
  if (blue < TEAM_CAP) return "blue";
  if (red < TEAM_CAP) return "red";
  return "";
}

function lobbySnapshot(room) {
  return {
    t: "lobby",
    players: roomPlayers(room),
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    mode: room.mode,
    phase: room.phase,
  };
}

function beginPayload(room) {
  return {
    t: "begin",
    at: Date.now() + 200,
    mode: room.mode,
    site: room.site,
    carrierId: room.carrierId,
    players: roomPlayers(room),
    blueScore: room.blueScore,
    redScore: room.redScore,
    hostId: room.hostId,
  };
}

function pickCarrier(room) {
  const reds = [...room.clients.values()].filter((c) => c.team === "red");
  return reds[0]?.id || "";
}

function resetRound(room) {
  room.site = Math.random() < 0.5 ? "A" : "B";
  room.carrierId = pickCarrier(room);
  for (const c of room.clients.values()) c.alive = true;
  room.bots = [];
}

function sendStaticFile(res, filePath) {
  try {
    const data = readFileSync(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=60" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function tryServeStatic(urlPath, res) {
  if (!DIST_DIR) return false;
  let path = urlPath.split("?")[0] || "/";
  if (STATIC_BASE) {
    if (path === STATIC_BASE || path.startsWith(`${STATIC_BASE}/`)) {
      path = path.slice(STATIC_BASE.length) || "/";
    } else if (path === "/" || path === "") {
      res.writeHead(302, { Location: `${STATIC_BASE}/` });
      res.end();
      return true;
    } else {
      return false;
    }
  }
  if (path === "/" || path.endsWith("/")) path = `${path.replace(/\/$/, "")}/index.html`;
  const rel = normalize(path)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^\//, "");
  const filePath = join(DIST_DIR, rel || "index.html");
  if (!filePath.startsWith(DIST_DIR)) return false;
  if (existsSync(filePath) && statSync(filePath).isFile()) return sendStaticFile(res, filePath);
  const index = join(DIST_DIR, "index.html");
  if (existsSync(index) && !rel.includes(".")) return sendStaticFile(res, index);
  return false;
}

/**
 * @param {import("ws").WebSocket} ws
 * @param {object} msg
 * @param {Room} room
 */
function admitToRoom(ws, msg, room) {
  const name = sanitizeName(msg.name);
  const team = pickTeam(room, msg.team);
  if (!team) {
    send(ws, { t: "error", error: "both teams are full" });
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    return null;
  }

  const id = Math.random().toString(36).slice(2, 10);
  /** @type {Client} */
  const client = {
    id,
    name,
    team,
    ws,
    room: room.name,
    alive: true,
    lastPoseAt: 0,
    lastShootAt: 0,
    pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, walk: 0, run: 0, plant: 0, raise: 1 },
  };
  room.clients.set(id, client);
  if (!room.hostId || !room.clients.has(room.hostId)) room.hostId = id;

  send(ws, {
    t: "welcome",
    id,
    room: room.name,
    hostId: room.hostId,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    phase: room.phase === "lobby" ? "play" : room.phase,
    players: roomPlayers(room),
  });
  broadcast(room, lobbySnapshot(room));
  broadcast(room, { t: "notice", text: `${name} joined ${team === "blue" ? "Police" : "Terrorists"}` }, id);

  if (room.phase === "lobby") {
    room.phase = "play";
    room.blueScore = 0;
    room.redScore = 0;
    resetRound(room);
    broadcast(room, beginPayload(room));
    console.log(`[start] ${room.name} auto (${room.clients.size}p)`);
  } else if (room.phase === "play") {
    send(ws, beginPayload(room));
  }

  console.log(`[join] ${room.name} ${name} ${team} (${room.clients.size}p)`);
  return client;
}

function matchmake(ws, msg) {
  let room = findOpenRoom();
  if (!room) room = createMatchRoom();
  return admitToRoom(ws, msg, room);
}

/**
 * @param {import("ws").WebSocket} ws
 * @param {object} msg
 * @param {"create" | "join"} mode
 */
function admitClient(ws, msg, mode) {
  const roomName = sanitizeRoomName(msg.room);
  const password = sanitizePassword(msg.password);
  /** @type {Room | undefined} */
  let room = rooms.get(roomName);

  if (mode === "create") {
    if (room && room.clients.size > 0) {
      send(ws, { t: "error", error: "room already exists — join it or pick another code" });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return null;
    }
    const modeName = msg.mode === "bomb" ? "bomb" : "classic";
    room = {
      name: roomName,
      password,
      maxPlayers: Math.max(2, Math.min(MAX_PLAYERS, Math.round(Number(msg.maxPlayers)) || MAX_PLAYERS)),
      mode: modeName,
      hostId: "",
      phase: "lobby",
      site: "A",
      carrierId: "",
      blueScore: 0,
      redScore: 0,
      bots: [],
      clients: new Map(),
    };
    rooms.set(roomName, room);
  } else {
    if (!room || room.clients.size === 0) {
      send(ws, { t: "error", error: "room not found" });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return null;
    }
    if (password !== room.password) {
      send(ws, { t: "error", error: "wrong password" });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return null;
    }
    if (room.clients.size >= room.maxPlayers) {
      send(ws, { t: "error", error: `room full (max ${room.maxPlayers})` });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  return admitToRoom(ws, msg, room);
}

function dropClient(client) {
  if (!client) return;
  const room = rooms.get(client.room);
  if (!room) return;
  room.clients.delete(client.id);
  if (room.clients.size === 0) {
    rooms.delete(room.name);
    console.log(`[empty] ${room.name}`);
    return;
  }
  if (room.hostId === client.id) {
    room.hostId = room.clients.keys().next().value;
  }
  broadcast(room, { t: "leave", id: client.id, hostId: room.hostId, name: client.name });
  broadcast(room, lobbySnapshot(room));
  broadcast(room, { t: "notice", text: `${client.name} left` });
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz" || url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(), rooms: rooms.size }));
    return;
  }

  if (url.pathname === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        rooms: [...rooms.values()].map((room) => ({
          room: room.name,
          players: room.clients.size,
          phase: room.phase,
          mode: room.mode,
          maxPlayers: room.maxPlayers,
        })),
      })
    );
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (tryServeStatic(url.pathname, res)) return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  ws._socket?.setNoDelay?.(true);
  /** @type {Client | null} */
  let client = null;

  ws.on("message", (data) => {
    if (data.length > 32_768) {
      send(ws, { t: "error", error: "message too large" });
      return;
    }
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      send(ws, { t: "error", error: "bad json" });
      return;
    }

    if (msg.t === "ping") {
      send(ws, { t: "pong", n: msg.n });
      return;
    }

    if (msg.t === "match") {
      if (client) return;
      client = matchmake(ws, msg);
      return;
    }

    if (msg.t === "create" || msg.t === "join") {
      if (client) return;
      client = admitClient(ws, msg, msg.t === "create" ? "create" : "join");
      return;
    }

    if (!client) {
      send(ws, { t: "error", error: "join first" });
      return;
    }

    const room = rooms.get(client.room);
    if (!room) {
      send(ws, { t: "error", error: "room gone" });
      return;
    }

    if (msg.t === "start") {
      if (client.id !== room.hostId) {
        send(ws, { t: "error", error: "only the host can start" });
        return;
      }
      if (room.phase !== "lobby" && room.phase !== "over") return;
      room.phase = "play";
      room.blueScore = 0;
      room.redScore = 0;
      resetRound(room);
      broadcast(room, beginPayload(room));
      console.log(`[start] ${room.name} ${room.mode} (${room.clients.size}p)`);
      return;
    }

    if (msg.t === "pose") {
      if (room.phase !== "play") return;
      const now = Date.now();
      if (now - client.lastPoseAt < NET_TICK_MS * 0.5) return;
      client.lastPoseAt = now;
      const p = client.pose;
      p.x = num(msg.x, -400, 400);
      p.y = num(msg.y, -40, 80);
      p.z = num(msg.z, -400, 400);
      p.yaw = num(msg.yaw, -20, 20);
      p.pitch = num(msg.pitch, -2, 2);
      p.crouch = num(msg.crouch, 0, 1);
      p.walk = num(msg.walk, 0, 1);
      p.run = num(msg.run, 0, 1);
      p.plant = num(msg.plant, 0, 1);
      p.raise = num(msg.raise, 0, 1, 1);
      if (client.id === room.hostId && Array.isArray(msg.bots)) {
        room.bots = msg.bots.slice(0, 10).map((b) => ({
          i: Math.max(0, Math.min(20, b.i | 0)),
          team: b.team === "red" ? "red" : "blue",
          x: num(b.x, -400, 400),
          y: num(b.y, -40, 80),
          z: num(b.z, -400, 400),
          yaw: num(b.yaw, -20, 20),
          walk: num(b.walk, 0, 1),
          run: num(b.run, 0, 1),
          alive: b.alive !== false,
          raise: num(b.raise, 0, 1, 1),
          plant: num(b.plant, 0, 1),
        }));
      }
      return;
    }

    if (msg.t === "shoot") {
      if (room.phase !== "play" || !client.alive) return;
      const now = Date.now();
      if (now - client.lastShootAt < 8) return;
      client.lastShootAt = now;
      broadcast(
        room,
        {
          t: "shot",
          id: client.id,
          team: msg.team === "red" || msg.team === "blue" ? msg.team : client.team,
          ox: num(msg.ox, -400, 400),
          oy: num(msg.oy, -40, 80),
          oz: num(msg.oz, -400, 400),
          dx: num(msg.dx, -2, 2),
          dy: num(msg.dy, -2, 2),
          dz: num(msg.dz, -2, 2),
          dmg: num(msg.dmg, 1, 200, 20),
        },
        client.id
      );
      return;
    }

    if (msg.t === "hit") {
      if (room.phase !== "play") return;
      const target = room.clients.get(String(msg.targetId || ""));
      if (!target || !target.alive) return;
      if (target.team === client.team && target.id !== client.id) return;
      target.alive = false;
      broadcast(room, { t: "kill", id: target.id, by: client.id, name: target.name, byName: client.name });
      return;
    }

    if (msg.t === "hitBot") {
      if (room.phase !== "play") return;
      const i = msg.i | 0;
      broadcast(room, { t: "botKill", i, by: client.id, byName: client.name }, client.id);
      return;
    }

    if (msg.t === "plant") {
      if (room.phase !== "play" || room.mode !== "bomb") return;
      broadcast(room, {
        t: "planted",
        x: num(msg.x, -400, 400),
        y: num(msg.y, -40, 80),
        z: num(msg.z, -400, 400),
        site: msg.site === "B" ? "B" : "A",
        by: client.id,
      });
      return;
    }

    if (msg.t === "defuse") {
      if (room.phase !== "play" || room.mode !== "bomb") return;
      broadcast(room, { t: "defused", by: client.id });
      return;
    }

    if (msg.t === "drop") {
      if (room.phase !== "play" || room.mode !== "bomb") return;
      broadcast(room, {
        t: "dropped",
        x: num(msg.x, -400, 400),
        y: num(msg.y, -40, 80),
        z: num(msg.z, -400, 400),
        by: client.id,
      });
      return;
    }

    if (msg.t === "round") {
      if (client.id !== room.hostId || room.phase !== "play") return;
      const winner = msg.winner === "red" ? "red" : "blue";
      room.blueScore = Math.max(0, Math.min(20, msg.blueScore | 0));
      room.redScore = Math.max(0, Math.min(20, msg.redScore | 0));
      resetRound(room);
      broadcast(room, {
        t: "round",
        winner,
        blueScore: room.blueScore,
        redScore: room.redScore,
        site: room.site,
        carrierId: room.carrierId,
        players: roomPlayers(room),
      });
      return;
    }

    if (msg.t === "over") {
      if (client.id !== room.hostId) return;
      room.phase = "over";
      broadcast(room, {
        t: "over",
        winner: msg.winner === "red" ? "red" : "blue",
        blueScore: room.blueScore,
        redScore: room.redScore,
      });
      return;
    }
  });

  ws.on("close", () => dropClient(client));
  ws.on("error", () => dropClient(client));
});

setInterval(() => {
  const at = Date.now();
  for (const room of rooms.values()) {
    if (room.phase !== "play") continue;
    const players = [...room.clients.values()].map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      x: c.pose.x,
      y: c.pose.y,
      z: c.pose.z,
      yaw: c.pose.yaw,
      pitch: c.pose.pitch,
      crouch: c.pose.crouch,
      walk: c.pose.walk,
      run: c.pose.run,
      plant: c.pose.plant,
      raise: c.pose.raise,
      alive: c.alive,
    }));
    broadcast(room, { t: "state", at, players, bots: room.bots });
  }
}, NET_TICK_MS).unref();

httpServer.listen(PORT, HOST, () => {
  console.log(`Paintfield http://${HOST}:${PORT} (WS${DIST_DIR ? ` + static ${STATIC_BASE || "/"}` : ""})`);
});
