// server.js (Lobby / Hall)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// serve static files (public folder)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// simple HTTP endpoint to inspect rooms (debug)
app.get("/api/rooms", (req, res) => {
  res.json(Array.from(rooms.values()));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- In memory state ---
const clients = new Map(); // clientId => { ws, nickname, roomId }
const rooms = new Map();   // roomId => { id, type, players: [clientId], status, target }

// helper: create a room
function createRoom(type, opts = {}) {
  const id = randomUUID();
  const room = {
    id,
    type,                       // '1v1' | 't4' | 't8'
    players: [],                // clientIds
    status: "waiting",          // 'waiting' | 'running'
    createdAt: Date.now(),
    target: opts.target || null // optional target URL (e.g. '/fight.html' or external)
  };
  rooms.set(id, room);
  return room;
}

// Initialize some persistent lobby slots: one 1v1, one t4, one t8
createRoom("1v1", { target: "/fight.html" });
createRoom("t4", { target: "/tournament4.html" });
createRoom("t8", { target: "/tournament8.html" });

// Broadcast helpers
function send(ws, obj) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(obj));
}
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const { ws } of clients.values()) {
    if (ws.readyState === 1) ws.send(s);
  }
}
function broadcastRooms() {
  const payload = { type: "rooms", rooms: Array.from(rooms.values()).map(r => ({
    id: r.id, type: r.type, playersCount: r.players.length, status: r.status, target: r.target
  }))};
  broadcast(payload);
}
function broadcastOnline() {
  broadcast({ type: "online", count: clients.size });
}

// utility: find client entry by ws
function clientByWs(ws) {
  for (const [id, c] of clients.entries()) if (c.ws === ws) return { id, ...c };
  return null;
}

// join room logic
function joinRoom(clientId, roomId) {
  const client = clients.get(clientId);
  const room = rooms.get(roomId);
  if (!client || !room) {
    send(client.ws, { type: "error", message: "Room or client not found" });
    return;
  }
  if (room.status !== "waiting") {
    send(client.ws, { type: "error", message: "Room already running" });
    return;
  }

  const maxPlayers = room.type === "1v1" ? 2 : (room.type === "t4" ? 4 : 8);
  if (room.players.length >= maxPlayers) {
    send(client.ws, { type: "error", message: "Room is full" });
    return;
  }

  // leave previous room if any
  if (client.roomId) leaveRoom(clientId);

  room.players.push(clientId);
  client.roomId = room.id;

  // notify room players about new membership
  const playersInfo = room.players.map(id => ({ id, nickname: clients.get(id).nickname }));
  for (const pid of room.players) {
    const c = clients.get(pid);
    if (c && c.ws.readyState === 1) {
      send(c.ws, { type: "roomJoined", roomId: room.id, roomType: room.type, players: playersInfo });
    }
  }

  broadcastRooms();

  // auto-start if full for tournaments / 1v1
  if (room.players.length === maxPlayers) {
    room.status = "running";
    // inform players that room started and provide target (client decides how to open it)
    const startPayload = {
      type: "roomStarted",
      roomId: room.id,
      roomType: room.type,
      target: room.target,
      players: playersInfo
    };
    for (const pid of room.players) {
      const c = clients.get(pid);
      if (c && c.ws.readyState === 1) send(c.ws, startPayload);
    }

    // create a new empty slot of same type (so lobby always shows an open slot)
    createRoom(room.type, { target: room.target });
    broadcastRooms();
  }
}

// leave room logic
function leaveRoom(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) {
    client.roomId = null;
    return;
  }
  room.players = room.players.filter(id => id !== clientId);
  client.roomId = null;

  // if room is empty and it was a user-created non-template room, delete it.
  // We'll keep template rooms (type t4/t8/1v1) — here we delete only if createdAt is recent AND no players
  if (room.players.length === 0 && room.status === "waiting") {
    // keep template rooms — detect templates by checking createdAt older than some threshold?
    // For simplicity: if there are more than one room of same type waiting and this one is empty, delete it.
    const sameTypeWaiting = Array.from(rooms.values()).filter(r => r.type === room.type && r.status === "waiting");
    if (sameTypeWaiting.length > 1) rooms.delete(room.id);
  } else {
    // notify remaining players
    const playersInfo = room.players.map(id => ({ id, nickname: clients.get(id).nickname }));
    for (const pid of room.players) {
      const c = clients.get(pid);
      if (c && c.ws.readyState === 1) send(c.ws, { type: "roomUpdated", roomId: room.id, players: playersInfo });
    }
  }

  broadcastRooms();
}

// WebSocket connection
wss.on("connection", (ws) => {
  const clientId = randomUUID();
  clients.set(clientId, { ws, nickname: "Anon", roomId: null });

  // welcome + clientId
  send(ws, { type: "welcome", clientId });
  // send current rooms and online
  send(ws, { type: "rooms", rooms: Array.from(rooms.values()).map(r => ({
    id: r.id, type: r.type, playersCount: r.players.length, status: r.status, target: r.target
  })) });
  broadcastOnline();

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch (e) { send(ws, { type: "error", message: "invalid json" }); return; }

    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const { id: clientId } = clientEntry;

    switch (data.type) {
      case "setNickname":
        clients.get(clientId).nickname = String(data.nickname || "").slice(0, 32);
        broadcastRooms();
        break;

      case "createRoom":
        {
          const type = data.roomType || "1v1";
          const target = data.target || (type === "1v1" ? "/fight.html" : type === "t4" ? "/tournament4.html" : "/tournament8.html");
          const r = createRoom(type, { target });
          // auto join creator (optional)
          joinRoom(clientId, r.id);
          broadcastRooms();
        }
        break;

      case "joinRoom":
        joinRoom(clientId, data.roomId);
        break;

      case "leaveRoom":
        leaveRoom(clientId);
        break;

      case "getRooms":
        send(ws, { type: "rooms", rooms: Array.from(rooms.values()).map(r => ({
          id: r.id, type: r.type, playersCount: r.players.length, status: r.status, target: r.target
        })) });
        break;

      case "ping":
        send(ws, { type: "pong" });
        break;

      default:
        // unknown type: just ignore or echo for debug
        send(ws, { type: "error", message: "unknown message type" });
    }
  });

  ws.on("close", () => {
    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const clientId = clientEntry.id;
    // remove from room if in one
    leaveRoom(clientId);
    clients.delete(clientId);
    broadcastOnline();
    broadcastRooms();
  });
});

// start HTTP + WS
server.listen(PORT, () => console.log(`Lobby server running on port ${PORT}`));