// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// --- Percorsi ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Express ---
const app = express();
const PORT = process.env.PORT || 10000;

// Static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Debug endpoint
app.get("/api/rooms", (req, res) => {
  res.json(Array.from(rooms.values()));
});

// --- HTTP server + WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- In-memory state ---
const clients = new Map(); // clientId => { ws, nickname, roomId, champion }
const rooms = new Map();   // roomId => { id, type, players: [clientId], status, fightState, fightInterval, target }

// --- Helpers ---
function createRoom(type, opts = {}) {
  const id = randomUUID();
  const room = {
    id,
    type,
    players: [],
    status: "waiting",
    target: opts.target || null,
    fightState: null,
    fightInterval: null,
  };
  rooms.set(id, room);
  return room;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const { ws } of clients.values()) {
    if (ws?.readyState === 1) ws.send(s);
  }
}

function broadcastRooms() {
  const payload = {
    type: "rooms",
    rooms: Array.from(rooms.values()).map(r => ({
      id: r.id,
      type: r.type,
      playersCount: r.players.length,
      status: r.status,
      target: r.target,
    }))
  };
  broadcast(payload);
}

function broadcastOnline() {
  broadcast({ type: "online", count: clients.size });
}

function clientByWs(ws) {
  for (const [id, c] of clients.entries()) if (c.ws === ws) return { id, ...c };
  return null;
}

// --- Room management ---
function joinRoom(clientId, roomId) {
  const client = clients.get(clientId);
  const room = rooms.get(roomId);
  if (!client || !room) return;

  if (room.status !== "waiting") {
    send(client.ws, { type: "error", message: "Room already running" });
    return;
  }

  const maxPlayers = room.type === "1v1" ? 2 : (room.type === "t4" ? 4 : 8);
  if (room.players.length >= maxPlayers) {
    send(client.ws, { type: "error", message: "Room is full" });
    return;
  }

  if (client.roomId) leaveRoom(clientId);

  room.players.push(clientId);
  client.roomId = room.id;

  const playersInfo = room.players.map(id => ({
    id,
    nickname: clients.get(id).nickname,
    champion: clients.get(id).champion || "Beast"
  }));

  for (const pid of room.players) {
    const c = clients.get(pid);
    if (c?.ws?.readyState === 1) send(c.ws, { type: "roomJoined", roomId: room.id, roomType: room.type, players: playersInfo });
  }

  broadcastRooms();

  if (room.players.length === maxPlayers) {
    room.status = "running";
    const startPayload = {
      type: "roomStarted",
      roomId: room.id,
      roomType: room.type,
      target: room.target,
      players: playersInfo
    };
    for (const pid of room.players) send(clients.get(pid).ws, startPayload);

    if (room.type === "1v1") startFight(room);

    createRoom(room.type, { target: room.target });
    broadcastRooms();
  }
}

function leaveRoom(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;

  const room = rooms.get(client.roomId);
  if (!room) { client.roomId = null; return; }

  room.players = room.players.filter(id => id !== clientId);
  client.roomId = null;

  if (room.players.length === 0 && room.status === "waiting") {
    const sameTypeWaiting = Array.from(rooms.values()).filter(r => r.type === room.type && r.status === "waiting");
    if (sameTypeWaiting.length > 1) rooms.delete(room.id);
  } else {
    const playersInfo = room.players.map(id => ({ id, nickname: clients.get(id).nickname, champion: clients.get(id).champion || "Beast" }));
    for (const pid of room.players) {
      const c = clients.get(pid);
      if (c?.ws?.readyState === 1) send(c.ws, { type: "roomUpdated", roomId: room.id, players: playersInfo });
    }
  }

  broadcastRooms();
}

// --- Fight logic 1v1 automatic ---
function startFight(room) {
  if (room.type !== "1v1" || room.status !== "running") return;
  const [p1Id, p2Id] = room.players;
  const p1 = clients.get(p1Id);
  const p2 = clients.get(p2Id);

  const fightState = {
    players: [
      { id: p1Id, nickname: p1.nickname, champion: p1.champion || "Beast", hp: 80 },
      { id: p2Id, nickname: p2.nickname, champion: p2.champion || "Beast", hp: 80 }
    ],
    turn: 0
  };
  room.fightState = fightState;

  // Invia stato iniziale
  for (const pid of room.players) {
    const c = clients.get(pid);
    if (c?.ws?.readyState === 1) send(c.ws, { type: "init", players: fightState.players });
  }

  // Logica combattimento automatico
  room.fightInterval = setInterval(() => {
    const attackerIdx = fightState.turn % 2;
    const defenderIdx = (fightState.turn + 1) % 2;
    const attacker = fightState.players[attackerIdx];
    const defender = fightState.players[defenderIdx];

    if (attacker.hp <= 0 || defender.hp <= 0) {
      const winner = attacker.hp > 0 ? attacker.nickname : defender.nickname;
      for (const pid of room.players) {
        const c = clients.get(pid);
        if (c?.ws?.readyState === 1) send(c.ws, { type: "end", winner });
      }
      clearInterval(room.fightInterval);
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    const dmg = roll * 2;
    defender.hp -= dmg;
    defender.hp = Math.max(0, defender.hp);

    for (const pid of room.players) {
      const c = clients.get(pid);
      if (c?.ws?.readyState === 1) {
        send(c.ws, {
          type: "turn",
          attacker: attacker.nickname,
          defender: defender.nickname,
          defenderHP: defender.hp,
          roll,
          dmg
        });
      }
    }

    fightState.turn++;
  }, 2000);
}

// --- Persistent lobby ---
createRoom("1v1", { target: "/fight.html" });
createRoom("t4", { target: "/tournament4.html" });
createRoom("t8", { target: "/tournament8.html" });

// --- WebSocket connection ---
wss.on("connection", (ws) => {
  const clientId = randomUUID();
  clients.set(clientId, { ws, nickname: "Anon", roomId: null, champion: "Beast" });

  // Invio welcome e stanze
  send(ws, { type: "welcome", clientId });
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
    const client = clients.get(clientId);

    switch (data.type) {
      case "setNickname":
        client.nickname = String(data.nickname || "").slice(0, 32);
        broadcastRooms();
        break;

      case "setChampion":
        client.champion = String(data.champion || "Beast");
        broadcastRooms();
        break;

      case "joinRoom":
        joinRoom(clientId, data.roomId);
        break;

      case "leaveRoom":
        leaveRoom(clientId);
        break;

      case "rejoinRoom":
        if (client.roomId) {
          const room = rooms.get(client.roomId);
          if (room?.fightState) {
            const myState = room.fightState.players.find(p => p.id === clientId);
            const enemy = room.fightState.players.find(p => p.id !== clientId);
            send(ws, {
              type: "init",
              players: room.fightState.players,
              myState,
              enemy
            });
          }
        }
        break;

      case "chat":
        for (const c of clients.values()) {
          if (c.ws?.readyState === 1) send(c.ws, { type: "chat", sender: data.sender, text: data.text });
        }
        break;

      case "ping":
        send(ws, { type: "pong" });
        break;
    }
  });

  ws.on("close", () => {
    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const clientId = clientEntry.id;
    const client = clients.get(clientId);
    client.ws = null; // offline
    broadcastOnline();
    broadcastRooms();
  });
});

// --- Avvio server ---
server.listen(PORT, () => console.log(`Lobby server running on port ${PORT}`));