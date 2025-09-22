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

let onlineCount = 0;
let waitingPlayer = null;
const games = {};

function rollDice() { return Math.floor(Math.random() * 8) + 1; }

async function nextTurn(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  let damage = rollDice();
  if (defender.stunned) {
    damage = Math.max(1, damage - 1);
    defender.stunned = false;
  }

  if (damage === 8) defender.stunned = true;
  defender.hp = Math.max(0, defender.hp - damage);

  // Salva il dado lanciato e danno
  attacker.dice = damage;
  attacker.dmg = damage;
  defender.dice = 0;
  defender.dmg = 0;

  // Emissione update a entrambi i giocatori
  for (const p of game.players) {
    const p1 = game.players.find(pl => pl.id === p.id);
    const p2 = game.players.find(pl => pl.id !== p.id);
    io.to(p.id).emit("1vs1Update", { player1: p1, player2: p2 });
    io.to(p.id).emit("log", `${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
  }

  // Controllo vincitore
  if (defender.hp === 0) {
    for (const p of game.players) {
      io.to(p.id).emit("gameOver", { winnerNick: attacker.nick, winnerChar: attacker.char });
    }
    delete games[game.id];
    return;
  }

  // Prossimo turno dopo 3s
  setTimeout(() => nextTurn(game, defenderIndex), 3000);
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);
  onlineCount++;
  io.emit("onlineCount", onlineCount);

  socket.on("disconnect", () => {
    onlineCount--;
    io.emit("onlineCount", onlineCount);
    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
  });

  socket.on("setNickname", nick => { socket.nick = nick; });

  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = nick;
    socket.char = char;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      const gameId = socket.id + "#" + waitingPlayer.id;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, dice: 0, dmg: 0 },
        { id: socket.id, nick: nick, char: char, hp: 80, stunned: false, dice: 0, dmg: 0 }
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

  // Chat tra giocatori
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