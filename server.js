import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 10000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ======================
// Stato globale
// ======================
let players = []; // { id, ws, nickname, champion, hp, stunned }
let gameStarted = false;

// ======================
// Utility
// ======================
function broadcast(data) {
  const msg = JSON.stringify(data);
  players.forEach(p => {
    if (p.ws.readyState === 1) p.ws.send(msg);
  });
}

function broadcastOnline() {
  broadcast({ type: "online", count: players.length });
}

function rollDice() { return Math.floor(Math.random() * 8) + 1; }

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ======================
// Battle logic
// ======================
async function startBattle() {
  if (players.length < 2 || gameStarted) return;
  gameStarted = true;

  const [p1, p2] = players;

  p1.hp = 80;
  p2.hp = 80;
  p1.stunned = false;
  p2.stunned = false;

  broadcast({
    type: "roomStarted",
    players: [
      { id: p1.id, nickname: p1.nickname, champion: p1.champion, hp: p1.hp },
      { id: p2.id, nickname: p2.nickname, champion: p2.champion, hp: p2.hp }
    ]
  });

  // Iniziativa
  const init1 = rollDice();
  const init2 = rollDice();
  let attacker = init1 >= init2 ? p1 : p2;
  let defender = attacker === p1 ? p2 : p1;

  broadcast({ type: "log", message: `🌀 ${attacker.nickname} inizia per primo!` });

  while(p1.hp > 0 && p2.hp > 0) {
    await delay(3000);

    let roll = rollDice();
    let dmg = roll;

    // Stun logica
    if(attacker.stunned){
      dmg = Math.max(0, dmg - 1);
      attacker.stunned = false;
      broadcast({ type:"log", message:`😵 ${attacker.nickname} è stordito e fa -1 danno` });
    }

    // Critico
    let critical = false;
    if(roll >= 8 && defender.hp > 0){
      critical = true;
      defender.stunned = true;
    }

    // Applica danno
    defender.hp -= dmg;
    if(defender.hp < 0) defender.hp = 0;

    broadcast({
      type: "turn",
      attackerId: attacker.id,
      defenderId: defender.id,
      attacker: attacker.nickname,
      defender: defender.nickname,
      roll,
      dmg,
      defenderHP: defender.hp,
      critical
    });

    [attacker, defender] = [defender, attacker];
  }

  await delay(2000);
  const winner = p1.hp > 0 ? p1.nickname : p2.nickname;
  broadcast({ type: "end", winner });

  gameStarted = false;
  players = [];
}

// ======================
// WebSocket
// ======================
wss.on("connection", ws => {
  const clientId = uuidv4();
  ws.clientId = clientId;

  ws.send(JSON.stringify({ type: "welcome", clientId }));

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    switch(data.type){
      case "setNickname":
        ws.nickname = data.nickname;
        break;

      case "setChampion":
        ws.champion = data.champion;

        if(!players.find(p => p.id === ws.clientId)){
          players.push({ id: ws.clientId, ws, nickname: ws.nickname, champion: ws.champion, hp: 80, stunned: false });
        }

        broadcastOnline();
        startBattle();
        break;

      case "chat":
        broadcast({ type: "chat", sender: data.sender, text: data.text });
        break;
    }
  });

  ws.on("close", () => {
    players = players.filter(p => p.ws !== ws);
    broadcastOnline();
    gameStarted = false;
  });
});

server.listen(PORT, () => console.log(`🚀 Server attivo su porta ${PORT}`));