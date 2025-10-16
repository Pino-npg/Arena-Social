// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

// ------------------- STATIC -------------------
app.use(express.static("public"));
app.get("/1vs1.html", (req, res) => res.sendFile(new URL("public/1vs1.html", import.meta.url).pathname));
app.get("/tour.html", (req, res) => res.sendFile(new URL("public/tour.html", import.meta.url).pathname));
app.get("/", (req, res) => res.send("Fight server attivo!"));

// ------------------- UTILS -------------------
const rollDice = () => Math.floor(Math.random() * 8) + 1;
const usedNicks = new Map();

function assignUniqueNick(nick) {
  if (!nick || nick.trim() === "") return "Anon";
  const base = nick.trim();
  let finalNick = base;
  if (usedNicks.has(base)) {
    const count = usedNicks.get(base) + 1;
    usedNicks.set(base, count);
    finalNick = `${base}#${count}`;
  } else {
    usedNicks.set(base, 1);
  }
  return finalNick;
}

function releaseNick(nick) {
  if (!nick) return;
  const base = nick.split("#")[0];
  if (usedNicks.has(base)) {
    let count = usedNicks.get(base) - 1;
    if (count <= 0) usedNicks.delete(base);
    else usedNicks.set(base, count);
  }
}

// ------------------- 1VS1 -------------------
const games = {};
let waitingPlayer = null;
const lastGames = {};

// ------------------- TOURNIAMENT -------------------
const tournaments = {};
const nsp = io.of("/tournament");

// ------------------- TURN HANDLER UNIFICATO -------------------
function handleTurn({ attacker, defender, room, isTournament = false, match = null, tournamentId = null, nextFn }) {
  // --- gestione stun ---
  if (attacker.stunned) {
    attacker.stunned = false;
    const logMsg = `${attacker.nick} is stunned and skips the turn 😵‍💫`;

    if (isTournament) {
      nsp.to(tournamentId).emit("log", logMsg);
      nsp.to(tournamentId).emit("updateMatch", { id: match.id, stage: match.stage, player1: match.players[0], player2: match.players[1] });
    } else {
      io.to(room).emit("log", logMsg);
      match.players.forEach(p => {
        const me = match.players.find(pl => pl.id === p.id);
        const opp = match.players.find(pl => pl.id !== p.id);
        io.to(p.id).emit("1vs1Update", room, { player1: me, player2: opp });
      });
    }

    setTimeout(() => nextFn(attacker === match?.players[0] ? 1 : 0), 3000);
    return;
  }

  const realRoll = rollDice();
  let damage = realRoll;
  let logMsg = "";

  if (realRoll === 8) {
    defender.hp = Math.max(0, defender.hp - damage);
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Rolled ${realRoll} → deals ${damage} ⚡💥 (enemy stunned!)`;
  } else {
    defender.hp = Math.max(0, defender.hp - damage);
    logMsg = `${attacker.nick} rolls ${realRoll} and deals ${damage} 💥`;
  }

  attacker.roll = realRoll;
  attacker.dmg = damage;

  if (isTournament) {
    nsp.to(tournamentId).emit("log", logMsg);
    nsp.to(tournamentId).emit("updateMatch", { id: match.id, stage: match.stage, player1: match.players[0], player2: match.players[1] });

    if (defender.hp <= 0) {
      const winner = attacker;
      nsp.to(tournamentId).emit("matchOver", { winnerNick: winner.nick, winnerChar: winner.char, stage: match.stage, player1: match.players[0], player2: match.players[1] });
      advanceWinner(tournamentId, match.id, winner);
      return;
    }
  } else {
    io.to(room).emit("log", logMsg);
    match.players.forEach(p => {
      const me = match.players.find(pl => pl.id === p.id);
      const opp = match.players.find(pl => pl.id !== p.id);
      io.to(p.id).emit("1vs1Update", room, { player1: me, player2: opp });
    });

    if (defender.hp === 0) {
      match.players.forEach(p => {
        io.to(p.id).emit("gameOver", room, { winnerNick: attacker.nick, winnerChar: attacker.char });
      });
      lastGames[room] = match;
      delete games[room];
      return;
    }
  }

  setTimeout(() => nextFn(attacker === match?.players[0] ? 1 : 0), 3000);
}

// ------------------- 1VS1 LOGIC -------------------
function nextTurn1vs1(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];
  handleTurn({ attacker, defender, room: game.id, nextFn: (nextIdx) => nextTurn1vs1(game, defenderIndex), match: game });
}

// ------------------- TOURNAMENT LOGIC -------------------
function nextTurn(match, tournamentId, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];
  handleTurn({ attacker, defender, isTournament: true, match, tournamentId, nextFn: (nextIdx) => nextTurn(match, tournamentId, defenderIndex) });
}

// ------------------- 1VS1 SOCKET -------------------
io.on("connection", socket => {
  io.emit("onlineCount", io.engine.clientsCount);

  socket.on("setNickname", nick => {
    socket.nick = assignUniqueNick(nick);
    socket.emit("nickConfirmed", socket.nick);
  });

  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = assignUniqueNick(nick);
    socket.char = char;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      const gameId = socket.id + "#" + waitingPlayer.id;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, dice: 0 },
        { id: socket.id, nick: socket.nick, char, hp: 80, stunned: false, dice: 0 }
      ];
      games[gameId] = { id: gameId, players };

      players.forEach(p => {
        io.sockets.sockets.get(p.id)?.join(gameId);
        const opp = players.find(pl => pl.id !== p.id);
        io.to(p.id).emit("gameStart", gameId, { player1: p, player2: opp });
      });

      const first = Math.floor(Math.random() * 2);
      setTimeout(() => nextTurn1vs1(games[gameId], first), 1000);
      waitingPlayer = null;
    }
  });

  socket.on("chatMessage", data => {
    const { roomId, text } = data;
    let game = Object.values(games).find(g => g.id === roomId) || lastGames[roomId];
    if (!game) return;

    game.players.forEach(p => {
      io.to(p.id).emit("chatMessage", { nick: socket.nick, text, roomId });
    });
  });

  socket.on("disconnect", () => {
    releaseNick(socket.nick);
    io.emit("onlineCount", io.engine.clientsCount);

    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;

    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        if (other) io.to(other.id).emit("gameOver", gameId, { winnerNick: other.nick, winnerChar: other.char });
        lastGames[game.id] = game;
        delete games[gameId];
        break;
      }
    }
  });
});

// ------------------- TOURNAMENT SOCKET -------------------
nsp.on("connection", socket => {
  nsp.emit("onlineCount", nsp.sockets.size);
  let currentTournament = null;

  socket.on("setNickname", nick => {
    socket.nick = assignUniqueNick(nick);
    socket.emit("nickConfirmed", socket.nick);
  });

  socket.on("joinTournament", ({ nick, char }) => {
    if (!nick || !char) return;
    const finalNick = assignUniqueNick(nick);
    socket.nick = finalNick;

    let tId = Object.keys(tournaments).find(id => tournaments[id].waiting.length < 8);
    if (!tId) tId = createTournament();
    currentTournament = tId;

    const t = tournaments[tId];
    if (t.waiting.find(p => p.id === socket.id)) return;

    const player = { id: socket.id, nick: finalNick, char };
    t.waiting.push(player);
    socket.join(tId);
    broadcastWaiting(tId);

    if (t.waiting.length === 8 && t.bracket.length === 0) {
      const first8 = t.waiting.slice(0, 8);
      nsp.to(tId).emit("waitingStart", { players: first8.map(p => p.nick), total: 8 });
      generateBracket(first8, t);
      t.bracket.filter(m => m.stage === "quarter").forEach(m => startMatch(tId, m.player1, m.player2, m.stage, m.id));
    }
  });

  socket.on("chatMessage", text => {
    const tId = currentTournament;
    if (!tId) return;
    nsp.to(tId).emit("chatMessage", { nick: socket.nick || "Anon", text });
  });

  socket.on("disconnect", () => {
    releaseNick(socket.nick);
    const tId = currentTournament;
    if (!tId) return;
    const t = tournaments[tId];
    if (!t) return;

    t.waiting = t.waiting.filter(p => p.id !== socket.id);

    for (const matchId in t.matches) {
      const match = t.matches[matchId];
      const idx = match.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        if (other) nsp.to(tId).emit("matchOver", { winnerNick: other.nick, winnerChar: other.char, stage: match.stage, player1: match.players[0], player2: match.players[1] });
        advanceWinner(tId, match.id, other);
        break;
      }
    }
    broadcastWaiting(tId);
    emitBracket(tId);
    nsp.emit("onlineCount", nsp.sockets.size);
  });
});

// ------------------- SERVER LISTEN -------------------
httpServer.listen(PORT, () => console.log(`Server unico attivo su http://localhost:${PORT}`));