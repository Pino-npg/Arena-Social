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
          bonusInitiative: data.mode==="wallet"?1:0,
          stunned: false   // 👉 nuovo flag per lo stordimento
        });

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

// --- Logica battaglia (aggiornata) ---
async function startBattle(){
  const [p1, p2] = gameState.players;
  if(!p1 || !p2) return;

  // applica bonus vita iniziali
  p1.hp += p1.bonusHP;
  p2.hp += p2.bonusHP;

  sendToAll({ type:"init", players: [
    { character: p1.character, hp: p1.hp },
    { character: p2.character, hp: p2.hp }
  ]});

  const init1 = rollDice() + p1.bonusInitiative;
  const init2 = rollDice() + p2.bonusInitiative;
  let attacker = init1 >= init2 ? p1 : p2;
  let defender = attacker === p1 ? p2 : p1;

  sendToAll({ type:"log", message:`🌀 ${attacker.character} starts first!` });

  // inizializza lo stato stordito
  p1.stunned = false;
  p2.stunned = false;

  while(p1.hp > 0 && p2.hp > 0){
    await delay(1500);

    const roll = rollDice();
    let dmg = roll + attacker.bonusDamage;
    let critical = false;

    // se l'attaccante è stordito applica -1 al danno (min 0) e resetta lo stato
    if(attacker.stunned){
      dmg = Math.max(0, dmg - 1);
      attacker.stunned = false;
      sendToAll({ type:"log", message: `😵 ${attacker.character} is stunned and deals -1 damage this turn.` });
    }

    // applica danno
    defender.hp -= dmg;
    if(defender.hp < 0) defender.hp = 0;

    // calcola indici (assicurati di prendere gli indici reali dalla array)
    const attackerIndex = gameState.players.indexOf(attacker);
    const defenderIndex = gameState.players.indexOf(defender);

    // se il roll è un 8 o più -> critico -> stordisci il difensore
    if(roll >= 8 && defender.hp > 0){
      critical = true;
      defender.stunned = true;
      // nota: lo stordimento sarà applicato al turno in cui quel player attacca
    }

    // invia il turno con indici e flag critico
    sendToAll({
      type: "turn",
      attackerIndex,
      defenderIndex,
      attacker: attacker.character,
      defender: defender.character,
      dmg,
      defenderHP: defender.hp,
      critical
    });

    // scambia i ruoli
    [attacker, defender] = [defender, attacker];
  }

  await delay(1000);
  const winner = p1.hp > 0 ? p1.character : p2.character;
  sendToAll({ type: "end", winner });

  // reset
  gameState.started = false;
  gameState.players = [];
}

function rollDice(){ return Math.floor(Math.random()*8)+1; }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

server.listen(PORT, ()=>console.log(`🚀 Server attivo su porta ${PORT}`));