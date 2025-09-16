import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public")); // metti qui index.html, fight.js, img/, ecc.

let players = []; // array dei client con bonus e personaggio

// --- UTILI ---
function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(str);
  });
}

function sendTurn() {
  if(players.length < 2) return;

  // semplice esempio: attacco random
  const attackerIndex = Math.floor(Math.random()*2);
  const defenderIndex = 1 - attackerIndex;

  const attacker = players[attackerIndex];
  const defender = players[defenderIndex];

  // calcolo danno base + bonus
  const dmg = Math.floor(Math.random()*8) + 1 + attacker.bonusDamage;
  defender.hp -= dmg;
  if(defender.hp < 0) defender.hp = 0;

  broadcast({
    type: "turn",
    attackerIndex,
    defenderIndex,
    attacker: attacker.character,
    defender: defender.character,
    dmg,
    defenderHP: defender.hp,
    critical: dmg >= 8
  });

  // controlla vittoria
  if(defender.hp <= 0) {
    broadcast({ type: "end", winner: attacker.character });
  }
}

// --- WEBSOCKET ---
wss.on("connection", ws => {
  const playerIndex = players.length;
  const playerData = { ws, index: playerIndex, mode: null, character: null, hp: 20, bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 };
  players.push(playerData);

  ws.send(JSON.stringify({ type: "assignIndex", index: playerIndex }));
  broadcast({ type: "online", count: players.length });

  ws.on("message", msgStr => {
    const msg = JSON.parse(msgStr);

    if(msg.type === "start"){
      playerData.mode = msg.mode;
      playerData.character = msg.character;
      if(msg.bonuses){
        playerData.bonusHP = msg.bonuses.HP || 0;
        playerData.bonusDamage = msg.bonuses.Damage || 0;
        playerData.bonusInitiative = msg.bonuses.Initiative || 0;
      }

      // Invia inizializzazione
      broadcast({
        type: "init",
        players: players.map(p => ({
          character: p.character,
          hp: p.hp + p.bonusHP
        }))
      });

      // se due giocatori pronti, manda il primo turno
      if(players.length === 2 && players.every(p => p.mode)) sendTurn();
    }

    if(msg.type === "character"){
      playerData.character = msg.name;
      broadcast({
        type: "character",
        playerIndex: playerIndex,
        name: msg.name
      });
    }
  });

  ws.on("close", () => {
    players = players.filter(p => p.ws !== ws);
    broadcast({ type: "online", count: players.length });
  });
});

// --- EXPRESS SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));