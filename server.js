import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

// =======================
// Setup percorso
// =======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files dalla cartella public
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// =======================
// Stato globale
// =======================
let clients = [];
let gameState = {
  players: [],
  started: false
};

// =======================
// Funzioni helper
// =======================
function broadcast(msg){
  const data = JSON.stringify(msg);
  clients.forEach(ws=>{
    if(ws.readyState===1) ws.send(data);
  });
}

function broadcastOnline(){
  broadcast({ type:"online", count: clients.length });
}

function rollDice(){ return Math.floor(Math.random()*8)+1; }
function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

// =======================
// Gestione connessione
// =======================
wss.on("connection", ws=>{
  console.log("✅ Nuovo client connesso");
  clients.push(ws);
  broadcastOnline();

  // ID semplice per esempio (timestamp + random)
  ws.clientId = Date.now() + "-" + Math.floor(Math.random()*1000);

  ws.on("message", msg=>{
    const data = JSON.parse(msg);

    switch(data.type){
      case "setNickname":
        ws.nickname = data.nickname;
        break;

      case "setChampion":
        ws.champion = data.champion;
        break;

      case "rejoinRoom":
        ws.clientId = data.clientId;
        break;

      case "chat":
        broadcast({ type:"chat", sender:data.sender, text:data.text });
        break;
    }

    // Aggiungi ai giocatori se 1vs1
    if(gameState.players.length<2 && ws.nickname && ws.champion){
      if(!gameState.players.find(p=>p.ws===ws)){
        gameState.players.push({
          ws,
          id: ws.clientId,
          nickname: ws.nickname,
          champion: ws.champion,
          hp: 80
        });
      }
    }

    if(gameState.players.length===2 && !gameState.started){
      gameState.started = true;
      startBattle();
    }
  });

  ws.on("close", ()=>{
    console.log("❌ Client disconnesso");
    clients = clients.filter(c=>c!==ws);
    gameState.players = gameState.players.filter(p=>p.ws!==ws);
    gameState.started = false;
    broadcastOnline();
  });

  // Invia messaggio di benvenuto
  ws.send(JSON.stringify({ type:"welcome", clientId: ws.clientId }));
});

// =======================
// Logica battaglia
// =======================
async function startBattle(){
  const [p1, p2] = gameState.players;
  if(!p1 || !p2) return;

  broadcast({
    type:"roomStarted",
    players: [
      { id: p1.id, nickname: p1.nickname, champion: p1.champion, hp: p1.hp },
      { id: p2.id, nickname: p2.nickname, champion: p2.champion, hp: p2.hp }
    ]
  });

  let attacker = p1;
  let defender = p2;

  while(p1.hp>0 && p2.hp>0){
    await delay(2000);
    const roll = rollDice();
    const dmg = roll;
    defender.hp -= dmg;
    if(defender.hp<0) defender.hp=0;

    broadcast({
      type:"turn",
      attackerId: attacker.id,
      defenderId: defender.id,
      attacker: attacker.nickname,
      defender: defender.nickname,
      roll,
      dmg,
      defenderHP: defender.hp
    });

    [attacker, defender] = [defender, attacker];
  }

  const winner = p1.hp>0 ? p1.nickname : p2.nickname;
  broadcast({ type:"end", winner });

  gameState.started=false;
  gameState.players=[];
}

// =======================
// Avvio server
// =======================
server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));