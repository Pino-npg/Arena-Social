// server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Stato globale
let clients = [];
let gameState = {
  players: [],
  started: false
};

wss.on("connection", ws => {
  console.log("✅ Nuovo client connesso");
  clients.push(ws);
  broadcastOnline();

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    switch(data.type){
      case "start":
        if(gameState.players.length < 2){
          const playerIndex = gameState.players.length;
          gameState.players.push({
            ws,
            id: Date.now() + Math.random(), // clientId temporaneo
            character: data.character,
            hp: 80,
          });
          ws.send(JSON.stringify({ type:"assignIndex", index:playerIndex }));

          if(gameState.players.length === 2 && !gameState.started){
            gameState.started = true;
            startBattle();
          }
        }
        break;

      case "chat":
        sendToAll({ type:"chat", text:data.text, sender:data.sender });
        break;
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnesso");
    clients = clients.filter(c => c!==ws);
    gameState.players = gameState.players.filter(p => p.ws!==ws);
    gameState.started = false;
    broadcastOnline();
  });
});

function broadcastOnline(){
  const msg = JSON.stringify({ type:"online", count:clients.length });
  clients.forEach(ws=>{ if(ws.readyState===1) ws.send(msg) });
}

function sendToAll(data){
  const msg = JSON.stringify(data);
  clients.forEach(ws=>{ if(ws.readyState===1) ws.send(msg) });
}

// --- Battaglia ---
async function startBattle(){
  if(gameState.players.length<2) return;
  const [p1,p2] = gameState.players;

  sendToAll({ type:"init", players:[
    { character:p1.character, hp:p1.hp },
    { character:p2.character, hp:p2.hp }
  ]});

  let attacker = p1, defender = p2;

  while(p1.hp>0 && p2.hp>0){
    await delay(2000);
    const roll = Math.floor(Math.random()*8)+1;
    defender.hp -= roll;
    if(defender.hp<0) defender.hp=0;

    sendToAll({
      type:"turn",
      attacker: attacker.character,
      defender: defender.character,
      roll,
      dmg: roll,
      defenderHP: defender.hp,
    });

    [attacker, defender] = [defender, attacker];
  }

  const winner = p1.hp>0?p1.character:p2.character;
  sendToAll({ type:"end", winner });

  gameState.started = false;
  gameState.players = [];
}

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));