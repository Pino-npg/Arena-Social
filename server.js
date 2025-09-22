import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.get("/1vs1.html", (req, res) => {
  res.sendFile(new URL("public/1vs1.html", import.meta.url).pathname);
});

const games = {};
let waitingPlayer = null;

function rollDice() {
  return Math.floor(Math.random() * 8) + 1; // 1–8
}

async function nextTurn(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  let dice = rollDice();
  let damage = dice;

  // --- Se attacker è stunnato ---
  if (attacker.stunned) {
    damage = Math.max(0, dice - 1); // infligge dado - 1
    attacker.stunned = false; // effetto stun consumato
    attacker.stunnedLastTurn = true;
  } else {
    attacker.stunnedLastTurn = false;
    // --- Se critico ---
    if (dice === 8) {
      damage = dice * 2;          // critico = doppio danno
      defender.stunned = true;    // l’avversario viene stunnato
    }
  }

  // Applica danno
  defender.hp = Math.max(0, defender.hp - damage);

  // Aggiorna info
  attacker.dice = dice;
  attacker.dmg = damage;
  defender.dice = 0;
  defender.dmg = 0;

  // Aggiornamento a entrambi i player
  for (const p of game.players) {
    const p1 = game.players.find(pl => pl.id === p.id);
    const p2 = game.players.find(pl => pl.id !== p.id);
    io.to(p.id).emit("1vs1Update", { player1: p1, player2: p2 });
  }

  // Fine partita
  if (defender.hp === 0) {
    for (const p of game.players) {
      io.to(p.id).emit("gameOver", { winnerNick: attacker.nick, winnerChar: attacker.char });
    }
    delete games[game.id];
    return;
  }

  // Prossimo turno
  setTimeout(() => nextTurn(game, defenderIndex), 3000);
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  // Conta online
  io.emit("onlineCount", io.engine.clientsCount);

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    io.emit("onlineCount", io.engine.clientsCount);

    // Se era in attesa
    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;

    // Se era in una partita
    for (const gameId in games) {
      const game = games[gameId];
      const index = game.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        io.to(other.id).emit("gameOver", { winnerNick: other.nick, winnerChar: other.char });
        delete games[gameId];
        break;
      }
    }
  });

  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = nick;
    socket.char = char;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      const gameId = socket.id + "#" + waitingPlayer.id;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, stunnedLastTurn: false, dice: 0, dmg: 0 },
        { id: socket.id, nick: nick, char: char, hp: 80, stunned: false, stunnedLastTurn: false, dice: 0, dmg: 0 }
      ];

      games[gameId] = { id: gameId, players };
      for (const p of players) {
        const other = players.find(pl => pl.id !== p.id);
        io.to(p.id).emit("gameStart", { player1: p, player2: other });
      }

      const first = Math.floor(Math.random() * 2);
      setTimeout(() => nextTurn(games[gameId], first), 1000);
      waitingPlayer = null;
    }
  });

  socket.on("chatMessage", text => {
    const game = Object.values(games).find(g => g.players.some(p => p.id === socket.id));
    if (!game) return;
    const sender = game.players.find(p => p.id === socket.id);
    for (const p of game.players) {
      io.to(p.id).emit("chatMessage", { nick: sender.nick, text });
    }
  });
});

httpServer.listen(PORT, () => console.log(`Server attivo su http://localhost:${PORT}`));