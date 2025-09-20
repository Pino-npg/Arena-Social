// server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// =======================
// Stato globale
// =======================
let clients = []; // tutti i ws con clientId e nickname
let gameState = {
  players: [], // array di player { clientId, ws, nickname, character, hp, bonus... }
  started: false
};

// =======================
// Helper
// =======================
function broadcastOnline() {
  const msg = JSON.stringify({ type: "online", count:clients.length });
  clients.forEach(c => { if(c.ws.readyState===1) c.ws.send(msg) });
}

function sendToAll(data) {
  const msg = JSON.stringify(data);
  clients.forEach(c => { if(c.ws.readyState===1) c.ws.send(msg) });
}

function rollDice(){ return Math.floor(Math.random()*8)+1; }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

// Trova giocatore per clientId
function getPlayer(clientId){
  return gameState.players.find(p => p.clientId===clientId);
}

// =======================
// Gestione connessione
// =======================
wss.on("connection", ws => {
  console.log("✅ Nuovo client connesso");

  let clientId = null;
  let nickname = "Anon";
  
  // Salva ws temporaneamente in clients
  clients.push({ ws, clientId, nickname });

  broadcastOnline();

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    switch(data.type){

      // Rejoin o nuovo client
      case "join":
        if(data.clientId){
          clientId = data.clientId;
          nickname = data.nickname || "Anon";

          // aggiorna ws se era disconnesso
          const existing = clients.find(c => c.clientId===clientId);
          if(existing){
            existing.ws = ws;
            existing.nickname = nickname;
          } else {
            clients.push({ ws, clientId, nickname });
          }
          ws.send(JSON.stringify({ type:"clientId", clientId }));
        } else {
          clientId = randomUUID();
          nickname = data.nickname || "Anon";
          clients.push({ ws, clientId, nickname });
          ws.send(JSON.stringify({ type:"clientId", clientId }));
        }
        broadcastOnline();
        break;

      // Inizio partita 1v1
      case "start":
        if(!clientId) return;

        // Evita doppioni
        if(getPlayer(clientId)) return;

        const newPlayer = {
          clientId,
          ws,
          nickname: data.nickname || "Anon",
          character: data.character || "Beast",
          hp: 80 + (data.mode==="wallet"?2:0),
          bonusDamage: data.mode==="wallet"?1:0,
          bonusInitiative: data.mode==="wallet"?1:0,
          stunned: false
        };
        gameState.players.push(newPlayer);

        const playerIndex = gameState.players.indexOf(newPlayer);
        ws.send(JSON.stringify({ type:"assignIndex", index:playerIndex }));

        if(gameState.players.length===2 && !gameState.started){
          gameState.started = true;
          startBattle();
        }
        break;

      // Chat
      case "chat":
        if(!data.text || !nickname) return;
        sendToAll({ type:"chat", sender: nickname, text: data.text });
        break;
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");

    clients = clients.filter(c => c.ws!==ws);

    // Rimuovi dal gameState se stava giocando
    gameState.players = gameState.players.filter(p => p.ws!==ws);

    gameState.started = false;

    broadcastOnline();
  });
});

// =======================
// Logica Battaglia 1v1
// =======================
async function startBattle(){
  const [p1, p2] = gameState.players;
  if(!p1 || !p2) return;

  // Tiro d'iniziativa
  const init1 = rollDice() + p1.bonusInitiative;
  const init2 = rollDice() + p2.bonusInitiative;
  let attacker = init1 >= init2 ? p1 : p2;
  let defender = attacker===p1 ? p2 : p1;

  sendToAll({ type:"init", players: [
    { clientId: p1.clientId, nickname: p1.nickname, character: p1.character, hp: p1.hp },
    { clientId: p2.clientId, nickname: p2.nickname, character: p2.character, hp: p2.hp }
  ]});

  sendToAll({ type:"log", message:`🌀 ${attacker.character} starts first!` });

  p1.stunned = false;
  p2.stunned = false;

  while(p1.hp>0 && p2.hp>0){
    await delay(3000);

    const roll = rollDice();
    let dmg = roll + attacker.bonusDamage;
    let critical = false;

    // STUN
    if(attacker.stunned){
      dmg = Math.max(0, dmg-1);
      attacker.stunned = false;
      sendToAll({ type:"log", message:`😵 ${attacker.character} is stunned and deals -1 damage this turn.` });
    }

    // CRIT
    if(roll >= 8 && defender.hp>0){
      critical = true;
      defender.stunned = true;
    }

    defender.hp -= dmg;
    if(defender.hp<0) defender.hp=0;

    const attackerIndex = gameState.players.indexOf(attacker);
    const defenderIndex = gameState.players.indexOf(defender);

    sendToAll({
      type:"turn",
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

  await delay(3000);
  const winner = p1.hp>0 ? p1.character : p2.character;
  sendToAll({ type:"end", winner });

  gameState.started = false;
  gameState.players = [];
}

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));