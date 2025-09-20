import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 10000 });
let clients = [];

// Stato della stanza 1vs1
let room = { players: [null, null] }; // array di 2 slot

wss.on('connection', (ws) => {
  ws.id = clients.length; // id univoco
  clients.push(ws);

  // Invia contatore online a tutti
  broadcast({ type: 'online', count: clients.length });

  console.log(`Nuovo client connesso. Totale online: ${clients.length}`);

  ws.on('message', (message) => {
    const msg = JSON.parse(message);

    // === SET NICKNAME ===
    if(msg.type === 'setNickname') {
      ws.nickname = msg.nickname;
    }

    // === START / MODALITÀ ===
    if(msg.type === 'start'){
      ws.mode = msg.mode;
      ws.character = msg.character;

      // Assegna il giocatore a room[0] o room[1]
      if(!room.players[0]) {
        room.players[0] = ws;
        ws.index = 0;
      } else if(!room.players[1] && room.players[0] !== ws) {
        room.players[1] = ws;
        ws.index = 1;
      }

      // Se la stanza ha 2 giocatori, invia init a entrambi
      if(room.players[0] && room.players[1]) {
        const p0 = room.players[0];
        const p1 = room.players[1];

        [p0, p1].forEach((player, i) => {
          player.send(JSON.stringify({
            type: 'assignIndex',
            index: i
          }));

          player.send(JSON.stringify({
            type: 'init',
            players: [
              { nickname: p0.nickname, character: p0.character, hp: 80 },
              { nickname: p1.nickname, character: p1.character, hp: 80 }
            ]
          }));
        });
      }
    }

    // === TURN ===
    if(msg.type === 'turn'){
      const { attackerIndex, defenderIndex, dmg, defenderHP, critical } = msg;

      broadcast({
        type: 'turn',
        attackerIndex,
        defenderIndex,
        dmg,
        defenderHP,
        critical,
        attacker: room.players[attackerIndex].nickname,
        defender: room.players[defenderIndex].nickname
      });
    }

    // === CHAT ===
    if(msg.type === 'chat'){
      broadcast({ type: 'chat', sender: ws.nickname, text: msg.text });
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c !== ws);

    // Rimuovi dalla room
    if(room.players[0] === ws) room.players[0] = null;
    if(room.players[1] === ws) room.players[1] = null;

    broadcast({ type: 'online', count: clients.length });
    console.log(`Client disconnesso. Totale online: ${clients.length}`);
  });
});

// === BROADCAST A TUTTI I CLIENT ===
function broadcast(data){
  const msg = JSON.stringify(data);
  clients.forEach(c => { if(c.readyState === c.OPEN) c.send(msg); });
}

console.log('WebSocket server running on ws://localhost:10000');