import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const PORT = 10001; // server 1vs1
let waitingPlayer = null;
const games = {};

function rollDice() {
  return Math.floor(Math.random() * 8) + 1; // 1-8
}

// gestisce il turno di un giocatore
async function nextTurn(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  // gestisci stun
  let damage = rollDice();
  if (defender.stunned) {
    damage = Math.max(1, damage - 1);
    defender.stunned = false;
  }

  // critico
  if (damage === 8) defender.stunned = true;

  // aggiorna HP
  defender.hp = Math.max(0, defender.hp - damage);

  // invia aggiornamenti
  io.to(attacker.id).emit("updateHP", {
    self: attacker.hp,
    opponent: defender.hp,
    dice: damage,
    opponentStunned: defender.stunned
  });
  io.to(defender.id).emit("updateHP", {
    self: defender.hp,
    opponent: attacker.hp,
    dice: damage,
    opponentStunned: defender.stunned
  });

  // log
  const msg = `${attacker.nick} hits ${defender.nick} for ${damage} damage${damage===8?" (CRITIC)":"!"}`;
  io.to(attacker.id).emit("log", msg);
  io.to(defender.id).emit("log", msg);

  // aggiorna immagini in base a HP
  [attacker, defender].forEach(p => {
    let suffix = "60";
    if (p.hp <= 0) suffix = "0";
    else if (p.hp <= 20) suffix = "20";
    else if (p.hp <= 40) suffix = "40";
    io.to(p.id).emit("updateCharImg", { img: `img/${p.char}${suffix}.png`, player: p.id });
  });

  // check vincitore
  if (defender.hp === 0) {
    io.to(attacker.id).emit("gameOver", { winner: attacker.nick });
    io.to(defender.id).emit("gameOver", { winner: attacker.nick });
    delete games[game.id];
    return;
  }

  // pausa 3 secondi e turno successivo
  setTimeout(() => nextTurn(game, defenderIndex), 3000);
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = nick;
    socket.char = char;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      // crea partita
      const gameId = socket.id + "#" + waitingPlayer.id;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false },
        { id: socket.id, nick, char, hp: 80, stunned: false }
      ];
      games[gameId] = { id: gameId, players };
      io.to(waitingPlayer.id).emit("gameStart", { self: players[0], opponent: players[1] });
      io.to(socket.id).emit("gameStart", { self: players[1], opponent: players[0] });

      // decide chi inizia (iniziativa)
      const first = Math.floor(Math.random() * 2);
      setTimeout(() => nextTurn(games[gameId], first), 1000);
      waitingPlayer = null;
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
  });
});

httpServer.listen(PORT, () => console.log(`1vs1 server running on port ${PORT}`));