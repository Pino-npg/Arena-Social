import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

// --- CONFIGURAZIONE SERVER ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" } // Permette connessioni da qualsiasi origine
});

const PORT = process.env.PORT || 10000;

// --- CARTELLA PUBBLICA ---
app.use(express.static("public"));
// Rotta per la pagina 1vs1
app.get("/1vs1.html", (req, res) => {
  res.sendFile(new URL("public/1vs1.html", import.meta.url).pathname);
});

// --- SOCKET.IO ---

let onlineCount = 0;
let waitingPlayer = null;
const games = {};

// Genera danno casuale 1-8
function rollDice() {
  return Math.floor(Math.random() * 8) + 1;
}

// Gestisce il turno di un giocatore
async function nextTurn(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  // Stun
  let damage = rollDice();
  if (defender.stunned) {
    damage = Math.max(1, damage - 1);
    defender.stunned = false;
  }

  // Critico
  if (damage === 8) defender.stunned = true;

  // Aggiorna HP
  defender.hp = Math.max(0, defender.hp - damage);

  // Aggiorna giocatori
  [attacker, defender].forEach(p => {
    let suffix = "60";
    if (p.hp <= 0) suffix = "0";
    else if (p.hp <= 20) suffix = "20";
    else if (p.hp <= 40) suffix = "40";
    io.to(p.id).emit("updateCharImg", { img: `img/${p.char}${suffix}.png`, player: p.id });
  });

  // Aggiorna dati e log
  io.to(attacker.id).emit("1vs1Update", { player1: attacker, player2: defender });
  io.to(defender.id).emit("1vs1Update", { player1: attacker, player2: defender });

  const msg = `${attacker.nick} hits ${defender.nick} for ${damage} damage${damage===8?" (CRITIC)":"!"}`;
  io.to(attacker.id).emit("log", msg);
  io.to(defender.id).emit("log", msg);

  // Controlla vincitore
  if (defender.hp === 0) {
    io.to(attacker.id).emit("gameOver", { winner: attacker.nick });
    io.to(defender.id).emit("gameOver", { winner: attacker.nick });
    delete games[game.id];
    return;
  }

  // Turno successivo dopo 3 secondi
  setTimeout(() => nextTurn(game, defenderIndex), 3000);
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // ---------- CONTATORE ONLINE ----------
  onlineCount++;
  io.emit("onlineCount", onlineCount);

  socket.on("disconnect", () => {
    onlineCount--;
    io.emit("onlineCount", onlineCount);

    // Rimuove il giocatore in attesa
    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
  });

  // ---------- HOME: NICKNAME ----------
  socket.on("setNickname", (nick) => {
    socket.nick = nick;
  });

  // ---------- 1VS1 ----------
  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = nick;
    socket.char = char;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      // Crea partita
      const gameId = socket.id + "#" + waitingPlayer.id;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, dice: 0 },
        { id: socket.id, nick: nick, char: char, hp: 80, stunned: false, dice: 0 }
      ];
      games[gameId] = { id: gameId, players };

      io.to(waitingPlayer.id).emit("gameStart", { player1: players[0], player2: players[1] });
      io.to(socket.id).emit("gameStart", { player1: players[0], player2: players[1] });

      // Turno iniziale
      const first = Math.floor(Math.random() * 2);
      setTimeout(() => nextTurn(games[gameId], first), 1000);

      waitingPlayer = null;
    }
  });
});

// --- AVVIO SERVER ---
httpServer.listen(PORT, () => {
  console.log(`Server unificato attivo su http://localhost:${PORT}`);
});