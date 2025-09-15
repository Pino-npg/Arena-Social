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
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Stato globale della partita
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
    
    if(data.type === "start" && !gameState.started) {
      if(gameState.players.length < 2){
        const playerIndex = gameState.players.length;
        gameState.players.push({
          ws,
          mode: data.mode,
          character: data.character,
          hp: 20,
          bonusHP: data.mode==="wallet"?2:0,
          bonusDamage: data.mode==="wallet"?1:0,
          bonusInitiative: data.mode==="wallet"?1:0
        });

        // 👉 comunica al client il suo indice
        ws.send(JSON.stringify({ type: "assignIndex", index: playerIndex }));
      }

      if(gameState.players.length === 2) {
        gameState.started = true;
        startBattle();
      }
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

// --- Logica battaglia ---
async function startBattle(){
  const [p1, p2] = gameState.players;

  p1.hp += p1.bonusHP;
  p2.hp += p2.bonusHP;

  sendToAll({ type:"init", players: [
    {character:p1.character, hp:p1.hp},
    {character:p2.character, hp:p2.hp}
  ]});

  const init1 = rollDice() + p1.bonusInitiative;
  const init2 = rollDice() + p2.bonusInitiative;
  let attacker = init1>=init2?p1:p2;
  let defender = attacker===p1?p2:p1;

  sendToAll({ type:"log", message:`🌀 ${attacker.character} inizia per primo!`});

  while(p1.hp>0 && p2.hp>0){
    await delay(1500);

    const roll = rollDice();
    const dmg = roll + attacker.bonusDamage;

    defender.hp -= dmg;
    if(defender.hp<0) defender.hp=0;

    sendToAll({ type:"turn", attacker:attacker.character, defender:defender.character, dmg, defenderHP:defender.hp });

    [attacker, defender] = [defender, attacker];
  }

  await delay(1000);
  const winner = p1.hp>0?p1.character:p2.character;
  sendToAll({ type:"end", winner });
  gameState.started=false;
  gameState.players=[];
}

function rollDice(){ return Math.floor(Math.random()*8)+1; }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));