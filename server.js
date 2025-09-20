// server.js
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 10000 });
let clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);

  // Invia contatore aggiornato a tutti
  broadcast({ type: 'online', count: clients.length });

  ws.on('message', (message) => {
    const msg = JSON.parse(message);

    // Puoi gestire nickname, champion, chat ecc. qui
    if (msg.type === 'setNickname') {
      ws.nickname = msg.nickname;
    }

    if (msg.type === 'chat') {
      broadcast({ type: 'chat', sender: ws.nickname, text: msg.text });
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c !== ws);
    broadcast({ type: 'online', count: clients.length });
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(c => {
    if (c.readyState === c.OPEN) c.send(msg);
  });
}

console.log('WebSocket server running on ws://localhost:10000');