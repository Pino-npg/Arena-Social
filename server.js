import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files (index.html, fight.html, img, public)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname)); // per fight.html nella root

// HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

// Stato globale
let clients = [];
let gameState = {
  players: [],
  started: false
};

// --- Connessione WebSocket ---
wss.on("connection", (ws) => {
  console.log("✅ Nuovo client connesso");
  clients.push(ws);
  broadcastOnline();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // Join o start
    if(data.type === "start" && !gameState.started){
      if(gameState.players.length < 2){
        gameState.players.push({
          ws,
          mode: data.mode,
          character: data.character,
          hp: 20,
          bonusHP: data.mode==="wallet"?2:0,
          bonusDamage: data.mode==="wallet"?1:0,
          bonusInitiative: data.mode==="wallet"?1:0
        });
      }

      // Assegna index
      const playerIndex = gameState.players.findIndex(p => p.ws === ws);
      ws.send(JSON.stringify({ type:"ready", playerIndex }));

      if(gameState.players.length === 2){
        gameState.started = true;
        startBattle();
      }
    }

    // Cambio personaggio
    if(data.type === "character"){
      const p = gameState.players[data.playerIndex];
      if(p) p.character = data.name;
      broadcastToAll({ type:"character", playerIndex: data.playerIndex, name: data.name });
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    clients = clients.filter(c => c !== ws);
    gameState.players = gameState.players.filter(p => p.ws !== ws);
    gameState.started = false;
    broadcastOnline();
  });
});

// --- Broadcast ---
function broadcastOnline(){
  const msg = JSON.stringify({ type:"online", count:clients.length });
  clients.forEach(ws => { if(ws.readyState===1) ws.send(msg); });
}

function broadcastToAll(data){
  const msg = JSON.stringify(data);
  clients.forEach(ws => { if(ws.readyState===1) ws.send(msg); });
}

// --- Battaglia ---
async function startBattle(){
  const [p1, p2] = gameState.players;

  // HP iniziali con bonus
  p1.hp += p1.bonusHP;
  p2.hp += p2.bonusHP;

  // Invia stato iniziale
  broadcastToAll({
    type:"init",
    players: [
      {character: p1.character, hp: p1.hp},
      {character: p2.character, hp: p2.hp}
    ]
  });

  // Iniziativa
  let init1 = rollDice() + p1.bonusInitiative;
  let init2 = rollDice() + p2.bonusInitiative;
  let attacker = init1 >= init2 ? p1 : p2;
  let defender = attacker === p1 ? p2 : p1;
  broadcastToAll({ type:"log", message:`🌀 ${attacker.character} inizia per primo!` });

  let turn = 1;
  while(p1.hp > 0 && p2.hp > 0){
    await delay(1500);

    let roll = rollDice();
    let critical = roll === 8; // critico se dado 8
    let dmg = roll + attacker.bonusDamage;
    if(critical) dmg += 1; // +1 dmg critico
    defender.hp -= dmg;
    if(defender.hp < 0) defender.hp = 0;

    // -1 HP per critico avversario
    if(critical){
      let altPlayer = attacker === p1 ? p2 : p1;
      altPlayer.hp -= 1;
      if(altPlayer.hp < 0) altPlayer.hp = 0;
    }

    broadcastToAll({
      type:"turn",
      attacker: attacker.character,
      defender: defender.character,
      dmg,
      defenderHP: defender.hp,
      critical
    });

    [attacker, defender] = [defender, attacker];
    turn++;
  }

  await delay(1000);
  const winner = p1.hp > 0 ? p1.character : p2.character;
  broadcastToAll({ type:"end", winner });

  gameState.started = false;
  gameState.players = [];
}

// --- Helpers ---
function rollDice(){ return Math.floor(Math.random() * 8) + 1; }
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

// --- Start server ---
server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));