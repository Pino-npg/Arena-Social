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

let clients = [];
let waitingPlayers = [];

wss.on("connection", ws => {
  clients.push(ws);
  broadcastOnline();

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if(data.type==="join"){
      ws.playerData = { name: data.name, champion: data.champion, hp: 80, stunned:false };
      waitingPlayers.push(ws);

      if(waitingPlayers.length >= 2){
        const p1 = waitingPlayers.shift();
        const p2 = waitingPlayers.shift();
        startBattle(p1, p2);
      }
    }

    if(data.type==="chat"){
      const msgData = { type:"chat", sender: data.sender, text: data.text };
      clients.forEach(c => { if(c.readyState===1) c.send(JSON.stringify(msgData)) });
    }
  });

  ws.on("close", () => {
    clients = clients.filter(c=>c!==ws);
    waitingPlayers = waitingPlayers.filter(c=>c!==ws);
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

async function startBattle(ws1, ws2){
  const p1 = ws1.playerData;
  const p2 = ws2.playerData;

  let attacker = Math.random() >= 0.5 ? p1 : p2;
  let defender = attacker === p1 ? p2 : p1;

  // invio dati iniziali
  sendToAll({ type:"init", players:[{character:p1.champion,hp:p1.hp},{character:p2.champion,hp:p2.hp}] });
  sendToAll({ type:"log", message:`🌀 ${attacker.name} inizia per primo!` });

  while(p1.hp>0 && p2.hp>0){
    await delay(2000);
    let roll = Math.floor(Math.random()*8)+1;
    let dmg = roll;

    if(attacker.stunned){
      dmg = Math.max(0,dmg-1);
      attacker.stunned = false;
      sendToAll({ type:"log", message:`😵 ${attacker.name} era stordito: -1 al danno` });
    }

    if(roll===8 && defender.hp>0) defender.stunned = true;

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
  const winner = p1.hp>0 ? p1.name : p2.name;
  sendToAll({ type:"end", winner });
}

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));