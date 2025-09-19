import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clients = [];
let gameState = { players: [], started: false };

wss.on("connection", ws => {
  console.log("✅ Nuovo client connesso");
  clients.push(ws);
  broadcastOnline();

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if(data.type === "join" && gameState.players.length < 2){
      const playerIndex = gameState.players.length;
      gameState.players.push({
        ws,
        name: data.name,
        character: data.champion,
        hp: 80,
        stunned: false
      });

      ws.send(JSON.stringify({ type: "assignIndex", index: playerIndex }));

      if(gameState.players.length === 2 && !gameState.started){
        gameState.started = true;
        startBattle();
      }
    }

    if(data.type === "chat"){
      const msgData = { type:"chat", sender: data.sender, text: data.text };
      clients.forEach(c => { if(c.readyState===1) c.send(JSON.stringify(msgData)) });
    }
  });

  ws.on("close", () => {
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
  clients.forEach(ws => { if(ws.readyState===1) ws.send(msg) });
}

async function startBattle(){
  const [p1, p2] = gameState.players;
  if(!p1 || !p2) return;

  broadcastOnline();

  let attacker = Math.random() >= 0.5 ? p1 : p2;
  let defender = attacker === p1 ? p2 : p1;

  sendToAll({ type:"init", players:[
    { character: p1.character, hp: p1.hp },
    { character: p2.character, hp: p2.hp }
  ]});

  sendToAll({ type:"log", message:`🌀 ${attacker.name} inizia per primo!` });

  p1.stunned = false;
  p2.stunned = false;

  while(p1.hp > 0 && p2.hp > 0){
    await delay(3000);

    const roll = Math.floor(Math.random()*8)+1;
    let dmg = roll;

    if(attacker.stunned){
      dmg = Math.max(0, dmg-1);
      attacker.stunned = false;
      sendToAll({ type:"log", message:`😵 ${attacker.name} era stordito: -1 al danno` });
    }

    if(roll === 8 && defender.hp>0){
      defender.stunned = true;
    }

    defender.hp -= dmg;
    if(defender.hp<0) defender.hp=0;

    sendToAll({
      type:"turn",
      attacker: attacker.name,
      defender: defender.name,
      roll,
      dmg,
      defenderHP: defender.hp,
      critical: roll===8
    });

    [attacker, defender] = [defender, attacker];
  }

  await delay(2000);
  const winner = p1.hp>0?p1.name:p2.name;
  sendToAll({ type:"end", winner });

  gameState.started = false;
  gameState.players = [];
}

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));