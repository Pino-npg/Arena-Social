import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

let clients = [];
let players = [{}, {}]; // due giocatori per la partita

// WebSocket connection
wss.on('connection', ws => {
  clients.push(ws);

  // Aggiorna contatore online
  broadcast({ type: 'online', count: clients.length });

  ws.on('message', message => {
    const msg = JSON.parse(message.toString());

    if(msg.type==='start'){
      // assegna index al giocatore
      const idx = players[0].ws===ws ? 0 : players[1].ws===ws ? 1 : (players[0].ws?1:0);
      players[idx] = { ws, character: msg.character, hp:20 };
      
      ws.send(JSON.stringify({ type:'ready', playerIndex: idx }));
      broadcast({ type:'init', players: players.map(p=>({ character:p.character, hp:p.hp })) });
    }

    if(msg.type==='character'){
      const idx = msg.playerIndex;
      if(players[idx]) players[idx].character=msg.name;
      broadcast({ type:'character', name: msg.name, playerIndex: idx });
    }
  });

  ws.on('close', ()=>{
    clients = clients.filter(c=>c!==ws);
    broadcast({ type:'online', count: clients.length });
  });
});

function broadcast(msg){
  const data = JSON.stringify(msg);
  clients.forEach(c=>{
    if(c.readyState===c.OPEN) c.send(data);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));