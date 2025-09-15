import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public")); // cartella con fight.html, fight.js, style.css, img

// Stato del gioco
let players = [
  { ws: null, character: "Beast", hp: 20 },
  { ws: null, character: "Beast", hp: 20 }
];

// --- Funzione broadcast ---
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// --- Gestione connessioni ---
wss.on("connection", (ws) => {
  console.log("Nuovo giocatore connesso");

  // Aggiorna numero online
  broadcast({ type: "online", count: wss.clients.size });

  // Assegna playerIndex se disponibile
  let playerIndex = players.findIndex(p => p.ws === null);
  if (playerIndex !== -1) {
    players[playerIndex].ws = ws;
    ws.send(JSON.stringify({ type: "ready", playerIndex }));
  }

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // --- Selezione modalità ---
    if (data.type === "start") {
      if (players[data.playerIndex]) {
        players[data.playerIndex].character = data.character;
        players[data.playerIndex].hp = 20;
      }
      broadcast({ type: "init", players: players.map(p => ({ character: p.character, hp: p.hp })) });
    }

    // --- Selezione personaggio ---
    if (data.type === "character") {
      if (players[data.playerIndex]) {
        players[data.playerIndex].character = data.name;
        broadcast({ type: "character", name: data.name, playerIndex: data.playerIndex });
      }
    }

    // --- Turno di attacco ---
    if (data.type === "attack") {
      const attacker = players[data.attacker];
      const defender = players[1 - data.attacker];

      if (!attacker || !defender) return;

      // Danno casuale 1-8
      let dmg = Math.floor(Math.random() * 8) + 1;
      let critical = false;

      // 1 su 6 possibilità di critico
      if (Math.random() < 1/6) {
        critical = true;
        dmg += 2;
      }

      defender.hp -= dmg;
      if (defender.hp < 0) defender.hp = 0;

      broadcast({
        type: "turn",
        attacker: attacker.character,
        defender: defender.character,
        dmg,
        critical,
        defenderHP: defender.hp
      });

      // Controlla se partita finita
      if (defender.hp <= 0) {
        broadcast({ type: "end", winner: attacker.character });
        resetGame();
      }
    }
  });

  ws.on("close", () => {
    console.log("Giocatore disconnesso");
    if (playerIndex !== -1) players[playerIndex].ws = null;
    broadcast({ type: "online", count: wss.clients.size });
  });
});

// --- Reset partita ---
function resetGame() {
  players = [
    { ws: players[0].ws, character: "Beast", hp: 20 },
    { ws: players[1].ws, character: "Beast", hp: 20 }
  ];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server attivo su porta ${PORT}`));