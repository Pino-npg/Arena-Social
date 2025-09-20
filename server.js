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

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// --- In-memory state ---
const clients = new Map(); // clientId => { ws, nickname, roomId, champion }
const rooms = new Map();   // roomId => { id, type, players: [clientId], status, fightState, fightInterval, target }

// Helpers
function send(ws, obj) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const client of clients.values()) {
    if (client.ws?.readyState === 1) client.ws.send(s);
  }
}

// Conteggio online
function broadcastOnline() {
  const count = Array.from(clients.values()).filter(c => c.ws?.readyState === 1).length;
  broadcast({ type: "online", count });
}

// Stanze
function broadcastRooms() {
  const payload = {
    type: "rooms",
    rooms: Array.from(rooms.values()).map(r => ({
      id: r.id,
      type: r.type,
      playersCount: r.players.length,
      status: r.status,
      target: r.target
    }))
  };
  broadcast(payload);
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

  if (room.players.includes(clientId)) return; // già dentro

  const maxPlayers = room.type === "1v1" ? 2 : room.type === "t4" ? 4 : 8;
  if (room.players.length >= maxPlayers) {
    send(client.ws, { type: "error", message: "Room piena" });
    return;
  }

  if (client.roomId) leaveRoom(clientId);

  room.players.push(clientId);
  client.roomId = room.id;

  broadcastRoomUpdate(room);

  if (room.players.length === maxPlayers) startFight(room);
}

function leaveRoom(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;

  const room = rooms.get(client.roomId);
  if (!room) { client.roomId = null; return; }

  room.players = room.players.filter(id => id !== clientId);
  client.roomId = null;

  if (room.players.length === 0 && room.status === "waiting") rooms.delete(room.id);
  else broadcastRoomUpdate(room);
}

function broadcastRoomUpdate(room) {
  const playersInfo = room.players.map(id => {
    const c = clients.get(id);
    return { id, nickname: c.nickname, champion: c.champion };
  });

  for (const pid of room.players) {
    const c = clients.get(pid);
    if (c.ws?.readyState === 1) send(c.ws, { type: "roomUpdated", roomId: room.id, players: playersInfo, status: room.status });
  }

  broadcastRooms();
}

// --- Fight logic ---
function startFight(room) {
  room.status = "running";

  const playersInfo = room.players.map(id => {
    const c = clients.get(id);
    return { id, nickname: c.nickname, champion: c.champion, hp: 80 };
  });

  room.fightState = {
    players: playersInfo.map(p => ({ ...p })),
    turn: 0
  };

  // Invia init
  for (const pid of room.players) {
    const c = clients.get(pid);
    if (c.ws?.readyState === 1) send(c.ws, { type: "init", players: room.fightState.players, myState: room.fightState.players.find(p => p.id === pid), enemy: room.fightState.players.find(p => p.id !== pid) });
  }

  // Interval automatico
  room.fightInterval = setInterval(() => {
    const fs = room.fightState;
    const attackerIdx = fs.turn % 2;
    const defenderIdx = (fs.turn + 1) % 2;
    const attacker = fs.players[attackerIdx];
    const defender = fs.players[defenderIdx];

    if (attacker.hp <= 0 || defender.hp <= 0) {
      const winner = attacker.hp > 0 ? attacker.nickname : defender.nickname;
      for (const pid of room.players) {
        const c = clients.get(pid);
        if (c.ws?.readyState === 1) send(c.ws, { type: "end", winner });
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
      if (c.ws?.readyState === 1) send(c.ws, {
        type: "turn",
        attacker: attacker.nickname,
        defender: defender.nickname,
        defenderId: defender.id,
        defenderHP: defender.hp,
        roll,
        dmg
      });
    }

    fs.turn++;
  }, 2000);
}

// --- Persistent lobby ---
function createRoom(type, target) {
  const id = randomUUID();
  rooms.set(id, { id, type, players: [], status: "waiting", fightState: null, fightInterval: null, target });
}

createRoom("1v1", "/fight.html");
createRoom("t4", "/tournament4.html");
createRoom("t8", "/tournament8.html");

// --- WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  const clientId = randomUUID();
  clients.set(clientId, { ws, nickname: "Anon", roomId: null, champion: "Beast" });

  send(ws, { type: "welcome", clientId });
  broadcastOnline();
  broadcastRooms();

  ws.on("message", msgRaw => {
    let data;
    try { data = JSON.parse(msgRaw); } catch { return; }

    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const { id } = clientEntry;
    const client = clients.get(id);

    switch (data.type) {
      case "setNickname":
        client.nickname = data.nickname?.slice(0,32) || "Anon";
        broadcastRooms();
        break;

      case "setChampion":
        client.champion = data.champion || "Beast";
        break;

      case "joinRoom":
        joinRoom(id, data.roomId);
        break;

      case "leaveRoom":
        leaveRoom(id);
        break;

      case "rejoinRoom":
        if (client.roomId) {
          const room = rooms.get(client.roomId);
          if (room?.fightState) {
            const myState = room.fightState.players.find(p => p.id === id);
            const enemy = room.fightState.players.find(p => p.id !== id);
            send(ws, { type: "init", players: room.fightState.players, myState, enemy });
          }
        }
        break;

      case "chat":
        for (const c of clients.values()) {
          if (c.ws?.readyState === 1) send(c.ws, { type: "chat", sender: data.sender, text: data.text });
        }
        break;
    }
  });

  ws.on("close", () => {
    const clientEntry = clientByWs(ws);
    if (!clientEntry) return;
    const client = clients.get(clientEntry.id);
    client.ws = null; // offline
    broadcastOnline();
  });
});

// --- Avvio server ---
server.listen(PORT, () => console.log(`Lobby server running on port ${PORT}`));