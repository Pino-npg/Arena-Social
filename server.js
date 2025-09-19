import http from 'http';
import { WebSocketServer } from 'ws';

// --- CREAZIONE SERVER HTTP + WS ---
const server = http.createServer();
const wss = new WebSocketServer({ server });

let onlineCount = 0;
let players = []; // Array per tenere traccia dei client con index

// --- TORNEI DEMO ---
let tournament4 = { players: [], semi: [], final: null, winner: null };
let tournament8 = { players: [], quarter: [], semi: [], final: null, winner: null };

wss.on('connection', (ws) => {
  // Assegna un index al nuovo client
  const playerIndex = players.length;
  players.push(ws);
  onlineCount++;

  // Invia index al client
  ws.send(JSON.stringify({ type: 'assignIndex', index: playerIndex }));

  // Invia numero online a tutti
  broadcast({ type: 'online', count: onlineCount });

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      switch(msg.type){
        case 'start':
          // Il giocatore ha scelto modalità e personaggio
          console.log(`Player ${playerIndex} starts ${msg.mode} with ${msg.character}`);
          break;

        case 'character':
          // Aggiorna personaggio del giocatore
          console.log(`Player ${msg.playerIndex} selected ${msg.name}`);
          broadcast(msg);
          break;

        case 'turn':
        case 'log':
        case 'end':
          // Inoltra i messaggi a tutti
          broadcast(msg);
          break;

        default:
          console.log('Unknown message:', msg);
      }

    } catch(e){
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    onlineCount--;
    players = players.filter(p => p !== ws);
    broadcast({ type: 'online', count: onlineCount });
    console.log('Player disconnected, online:', onlineCount);
  });
});

// Funzione per inviare messaggi a tutti i client
function broadcast(data){
  const str = JSON.stringify(data);
  players.forEach(p => {
    if(p.readyState === p.OPEN) p.send(str);
  });
}

// Server HTTP + WS su porta 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});