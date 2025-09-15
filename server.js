import { WebSocketServer } from 'ws';
import http from 'http';

// --- HTTP server per servire fight.html e risorse ---
import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // metti fight.html, style.css, img/ dentro public/

const server = http.createServer(app);
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// --- WebSocket Server ---
const wss = new WebSocketServer({ server });

let clients = [];
let players = [
  { character: 'Beast', hp: 20, bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 },
  { character: 'Beast', hp: 20, bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 }
];

wss.on('connection', (ws) => {
  const playerIndex = clients.length;
  clients.push(ws);

  console.log(`Player connected: ${playerIndex}`);
  sendOnlineCount();

  // Invia ready con playerIndex
  ws.send(JSON.stringify({ type: 'ready', playerIndex }));

  // Invia init ai due client se almeno 2 connessi
  if (clients.length >= 2) {
    broadcast({ type: 'init', players });
  }

  ws.on('message', (message) => {
    const msg = JSON.parse(message.toString());

    switch(msg.type){
      case 'start':
        // Imposta personaggio scelto
        players[playerIndex].character = msg.character || 'Beast';
        broadcast({ type: 'init', players });
        break;

      case 'character':
        // Aggiorna personaggio e invia a tutti tranne chi ha inviato
        players[msg.playerIndex].character = msg.name;
        broadcast(msg, ws);
        break;

      case 'turn':
        // Aggiorna HP del defender
        const defIdx = players.findIndex(p => p.character === msg.defender);
        if(defIdx !== -1){
          players[defIdx].hp = msg.defenderHP;
        }
        broadcast(msg);
        break;
    }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${playerIndex}`);
    clients = clients.filter(c => c !== ws);
    sendOnlineCount();
  });
});

// --- Helper Functions ---
function broadcast(msg, excludeWs = null){
  const data = JSON.stringify(msg);
  clients.forEach(client => {
    if(client !== excludeWs && client.readyState === 1){
      client.send(data);
    }
  });
}

function sendOnlineCount(){
  const msg = JSON.stringify({ type: 'online', count: clients.length });
  clients.forEach(client => {
    if(client.readyState === 1) client.send(msg);
  });
}