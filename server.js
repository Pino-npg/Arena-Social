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
let gameState = { players: [], started: false };

// --- WebSocket ---
wss.on("connection", ws => {
  console.log("✅ Nuovo client connesso");
  clients.push(ws);
  broadcastOnline();

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if(data.type === "start" && !gameState.started) {
      // Aggiungi giocatore se non presente
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

      if(gameState.players.length === 2) {
        gameState.started = true;
        startBattle();
      }
    }

    // Cambia personaggio
    if(data.type==="character"){
      const player = gameState.players[data.playerIndex];
      if(player) {
        player.character = data.name;
        sendToAll({ type:"character", name:data.name, playerIndex:data.playerIndex });
      }
    }
  });

  ws.on("close", ()=>{
    console.log("❌ Client disconnesso");
    clients = clients.filter(c=>c!==ws);
    gameState.players = gameState.players.filter(p=>p.ws!==ws);
    gameState.started=false;
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
  const [p1, p2] = gameState.players;

  // HP iniziale con bonus
  p1.hp += p1.bonusHP;
  p2.hp += p2.bonusHP;

  // Invia stato iniziale
  sendToAll({ type:"init", players:[
    {character:p1.character, hp:p1.hp},
    {character:p2.character, hp:p2.hp}
  ]});

  // Determina iniziativa
  const init1 = rollDice() + p1.bonusInitiative;
  const init2 = rollDice() + p2.bonusInitiative;
  let attacker = init1>=init2?p1:p2;
  let defender = attacker===p1?p2:p1;

  sendToAll({ type:"log", message:`🌀 ${attacker.character} inizia per primo!` });

  let turn=1;
  while(p1.hp>0 && p2.hp>0){
    await delay(1500);

    let roll = rollDice();
    // critico: se 8 aggiunge +1
    const critical = roll===8 ? 1 : 0;
    const dmg = roll + critical + attacker.bonusDamage;

    defender.hp -= dmg;
    if(defender.hp<0) defender.hp=0;

    sendToAll({ type:"turn", attacker:attacker.character, defender:defender.character, dmg, defenderHP:defender.hp });

    [attacker, defender] = [defender, attacker];
    turn++;
  }

  await delay(1000);
  const winner = p1.hp>0?p1.character:p2.character;
  sendToAll({ type:"end", winner });

  // Reset
  gameState.started=false;
  gameState.players=[];
}

function rollDice(){ return Math.floor(Math.random()*8)+1; }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));