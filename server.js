import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files dalla cartella "public"
app.use(express.static(path.join(__dirname, "public")));

// Crea server HTTP condiviso per Express e WS
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

// Stato globale
let clients = [];
let gameState = {
  players: [],
  started: false
};

// --- GESTIONE CONNESSIONI ---
wss.on("connection", ws => {
  console.log("✅ Nuovo client connesso");
  clients.push(ws);

  // Invia contatore online
  broadcast({ type: "online", count: clients.length });

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    // Start partita 1vs1
    if (data.type === "start" && gameState.players.length < 2) {
      const playerIndex = gameState.players.length;
      gameState.players.push({
        ws,
        mode: data.mode,
        character: data.character,
        hp: 80,
        bonusHP: data.mode === "wallet" ? 2 : 0,
        bonusDamage: data.mode === "wallet" ? 1 : 0,
        bonusInitiative: data.mode === "wallet" ? 1 : 0,
        stunned: false
      });

      ws.send(JSON.stringify({ type: "assignIndex", index: playerIndex }));

      if (gameState.players.length === 2 && !gameState.started) {
        gameState.started = true;
        startBattle();
      }
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    clients = clients.filter(c => c !== ws);
    gameState.players = gameState.players.filter(p => p.ws !== ws);
    gameState.started = false;
    broadcast({ type: "online", count: clients.length });
  });
});

// --- FUNZIONI UTILI ---
function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  });
}

function rollDice() {
  return Math.floor(Math.random() * 8) + 1;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- LOGICA BATTAGLIA ---
async function startBattle() {
  const [p1, p2] = gameState.players;
  if (!p1 || !p2) return;

  // Aggiunge bonus vita iniziale
  p1.hp += p1.bonusHP;
  p2.hp += p2.bonusHP;

  broadcast({
    type: "init",
    players: [
      { character: p1.character, hp: p1.hp },
      { character: p2.character, hp: p2.hp }
    ]
  });

  let attacker = rollDice() + p1.bonusInitiative >= rollDice() + p2.bonusInitiative ? p1 : p2;
  let defender = attacker === p1 ? p2 : p1;

  broadcast({ type: "log", message: `🌀 ${attacker.character} starts first!` });

  p1.stunned = false;
  p2.stunned = false;

  while (p1.hp > 0 && p2.hp > 0) {
    await delay(2000);

    let roll = rollDice();
    let dmg = roll + attacker.bonusDamage;
    let critical = false;

    if (attacker.stunned) {
      dmg = Math.max(0, dmg - 1);
      attacker.stunned = false;
      broadcast({ type: "log", message: `😵 ${attacker.character} is stunned, -1 damage` });
    }

    if (roll === 8 && defender.hp > 0) {
      critical = true;
      defender.stunned = true;
    }

    defender.hp -= dmg;
    if (defender.hp < 0) defender.hp = 0;

    const attackerIndex = gameState.players.indexOf(attacker);
    const defenderIndex = gameState.players.indexOf(defender);

    broadcast({
      type: "turn",
      attackerIndex,
      defenderIndex,
      attacker: attacker.character,
      defender: defender.character,
      roll,
      dmg,
      defenderHP: defender.hp,
      critical
    });

    [attacker, defender] = [defender, attacker];
  }

  await delay(2000);
  const winner = p1.hp > 0 ? p1.character : p2.character;
  broadcast({ type: "end", winner });

  gameState.started = false;
  gameState.players = [];
}

// Avvia server
server.listen(PORT, () => console.log(`🚀 Server attivo su http://localhost:${PORT}`));