import http from 'http';
import { WebSocketServer } from 'ws';

// --- CREAZIONE SERVER HTTP + WS ---
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Fight Game WebSocket Server');
});

const wss = new WebSocketServer({ server });

let onlineCount = 0;
let players = []; // Client connessi

// --- TORNEI DEMO ---
let tournament4 = { players: [], semi: [], final: null, winner: null };
let tournament8 = { players: [], quarter: [], semi: [], final: null, winner: null };

wss.on('connection', (ws) => {
  // Assegna un index al nuovo client
  const playerIndex = players.length;
  players.push(ws);
  onlineCount++;

  console.log(`Player connected: ${playerIndex}, online: ${onlineCount}`);

  // Invia index al client
  ws.send(JSON.stringify({ type: 'assignIndex', index: playerIndex }));

  // Invia numero online a tutti
  broadcast({ type: 'online', count: onlineCount });

  // Ping/Pong per mantenere la connessione viva
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  // Gestione messaggi dal client
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      switch(msg.type){
        case 'start':
          console.log(`Player ${playerIndex} starts ${msg.mode} with ${msg.character}`);
          break;

        case 'character':
          console.log(`Player ${msg.playerIndex} selected ${msg.name}`);
          broadcast(msg);
          break;

        case 'turn':
        case 'log':
        case 'end':
          broadcast(msg);
          break;

        default:
          console.log('Unknown message:', msg);
      }
    } catch(e){
      console.error('Error parsing message:', e);
    }
  });

  // Disconnessione client
  ws.on('close', () => {
    onlineCount--;
    players = players.filter(p => p !== ws);
    broadcast({ type: 'online', count: onlineCount });
    console.log(`Player disconnected, online: ${onlineCount}`);
  });
});

// --- BROADCAST ---
function broadcast(data){
  const str = JSON.stringify(data);
  players.forEach(p => {
    if(p.readyState === p.OPEN) p.send(str);
  });
}

// --- PING/PONG --- mantiene WS alive
setInterval(() => {
  players.forEach(ws => {
    if(ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// --- AVVIO SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});