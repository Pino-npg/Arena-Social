// server_parallel_tournaments.js
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

const rollDice = () => Math.floor(Math.random() * 8) + 1;

/* ===================================================
   1VS1 MODE
=================================================== */
const games = {};
let waitingPlayer = null;
const lastGames = {};

async function nextTurn1vs1(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  const realRoll = rollDice();
  let damage = realRoll;
  let logMsg = "";

  if (attacker.stunned) {
    damage = Math.max(1, damage - 1);
    attacker.stunned = false;
    logMsg = `${attacker.nick} is stunned! Rolled ${realRoll} → deals only ${damage} 😵‍💫`;
  } else if (realRoll === 8) {
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Rolled ${realRoll} → deals ${damage} ⚡💥`;
  } else {
    logMsg = `${attacker.nick} rolls ${realRoll} and deals ${damage} 💥`;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  for (const p of game.players) {
    const me = game.players.find(pl => pl.id === p.id);
    const opp = game.players.find(pl => pl.id !== p.id);
    io.to(p.id).emit("1vs1Update", { player1: me, player2: opp });
    io.to(p.id).emit("log", logMsg);
  }

  if (defender.hp === 0) {
    for (const p of game.players) {
      io.to(p.id).emit("gameOver", { winnerNick: attacker.nick, winnerChar: attacker.char });
      lastGames[p.id] = game;
    }
    delete games[game.id];
    return;
  }

  setTimeout(() => nextTurn1vs1(game, defenderIndex), 3000);
}

io.on("connection", socket => {
  io.emit("onlineCount", io.engine.clientsCount);

  socket.on("disconnect", () => {
    io.emit("onlineCount", io.engine.clientsCount);
    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;

    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        io.to(other.id).emit("gameOver", { winnerNick: other.nick, winnerChar: other.char });
        lastGames[other.id] = game;
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
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, dice: 0 },
        { id: socket.id, nick, char, hp: 80, stunned: false, dice: 0 }
      ];
      games[gameId] = { id: gameId, players };
      for (const p of players) {
        const opp = players.find(pl => pl.id !== p.id);
        io.to(p.id).emit("gameStart", { player1: p, player2: opp });
      }
      const first = Math.floor(Math.random() * 2);
      setTimeout(() => nextTurn1vs1(games[gameId], first), 1000);
      waitingPlayer = null;
    }
  });

  socket.on("chatMessage", text => {
    let game = Object.values(games).find(g => g.players.some(p => p.id === socket.id));
    if (!game) game = lastGames[socket.id];
    if (!game) return;
    for (const p of game.players) {
      io.to(p.id).emit("chatMessage", { nick: socket.nick, text });
    }
  });
});

/* ===================================================
   PARALLEL TOURNAMENT MODE
=================================================== */
const tournaments = {};
const nsp = io.of("/tournament");

function createTournament() {
  const id = uuidv4();
  tournaments[id] = { waiting: [], matches: {}, bracket: [] };
  return id;
}

function broadcastWaiting(tournamentId) {
  const t = tournaments[tournamentId];
  if (!t) return;
  nsp.to(tournamentId).emit("waitingCount", { count: t.waiting.length, required: 8, players: t.waiting });
}

function emitBracket(tournamentId) {
  const t = tournaments[tournamentId];
  if (!t) return;
  nsp.to(tournamentId).emit("tournamentState", t.bracket);
}

function generateBracket(players8, t) {
  t.bracket = [
    { id: "Q1", stage: "quarter", player1: players8[0], player2: players8[1], next: "S1", winner: null },
    { id: "Q2", stage: "quarter", player1: players8[2], player2: players8[3], next: "S1", winner: null },
    { id: "Q3", stage: "quarter", player1: players8[4], player2: players8[5], next: "S2", winner: null },
    { id: "Q4", stage: "quarter", player1: players8[6], player2: players8[7], next: "S2", winner: null },
    { id: "S1", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "S2", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "F", stage: "final", player1: null, player2: null, next: null, winner: null }
  ];
  emitBracket(t.id);
}

function advanceWinner(tournamentId, matchId, winnerObj) {
  const t = tournaments[tournamentId];
  if (!t) return;
  const brMatch = t.bracket.find(m => m.id === matchId);
  if (!brMatch) return;

  brMatch.winner = { id: winnerObj.id, nick: winnerObj.nick, char: winnerObj.char };

  if (brMatch.next) {
    const next = t.bracket.find(m => m.id === brMatch.next);
    if (!next) return;
    if (!next.player1) next.player1 = brMatch.winner;
    else if (!next.player2) next.player2 = brMatch.winner;

    if (next.player1 && next.player2) {
      startMatch(tournamentId, next.player1, next.player2, next.stage, next.id);
    }
  }

  // Rimuovo il match finito
  delete t.matches[matchId];

  emitBracket(tournamentId);

  if (brMatch.id === "F" && brMatch.winner) {
    nsp.to(tournamentId).emit("tournamentOver", { nick: brMatch.winner.nick, char: brMatch.winner.char });
    setTimeout(() => resetTournament(tournamentId), 5000);
  }
}

function resetTournament(tournamentId) {
  delete tournaments[tournamentId];
}

function nextTurn(match, tournamentId, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  const realRoll = rollDice();
  let damage = realRoll;
  let logMsg = "";

  if (attacker.stunned) {
    damage = Math.max(0, damage - 1);
    attacker.stunned = false;
    logMsg = `${attacker.nick} is stunned! Rolled ${realRoll} → deals only ${damage} 😵‍💫`;
  } else if (realRoll === 8) {
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Rolled ${realRoll} → deals ${damage} ⚡💥`;
  } else {
    logMsg = `${attacker.nick} rolls ${realRoll} and deals ${damage} 💥`;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  nsp.to(tournamentId).emit("updateMatch", { id: match.id, stage: match.stage, player1: match.players[0], player2: match.players[1] });
  nsp.to(tournamentId).emit("log", logMsg);

  if (defender.hp <= 0) {
    const winner = attacker;
    nsp.to(tournamentId).emit("matchOver", { winnerNick: winner.nick, winnerChar: winner.char, stage: match.stage, player1: match.players[0], player2: match.players[1] });
    advanceWinner(tournamentId, match.id, winner);
    return;
  }

  setTimeout(() => nextTurn(match, tournamentId, defenderIndex), 3000);
}

function startMatch(tournamentId, p1, p2, stage, matchId) {
  const t = tournaments[tournamentId];
  if (!t || !p1 || !p2) return;
  const players = [{ ...p1, hp: 80, stunned: false, dice: 0 }, { ...p2, hp: 80, stunned: false, dice: 0 }];
  const match = { id: matchId, players, stage };
  t.matches[matchId] = match;

  nsp.to(tournamentId).emit("startTournament", Object.values(t.matches));
  nsp.to(tournamentId).emit("startMatch", { id: matchId, player1: players[0], player2: players[1], stage });

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(match, tournamentId, first), 1000);
}

nsp.on("connection", socket => {
  let currentTournament = null;

  socket.on("joinTournament", ({ nick, char }) => {
    if (!nick || !char) return;

    let tId = Object.keys(tournaments).find(id => tournaments[id].waiting.length < 8);
    if (!tId) tId = createTournament();

    currentTournament = tId;
    const t = tournaments[tId];
    if (t.waiting.find(p => p.id === socket.id)) return;

    const player = { id: socket.id, nick, char };
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
        nsp.to(tId).emit("matchOver", { winnerNick: other.nick, winnerChar: other.char, stage: match.stage, player1: match.players[0], player2: match.players[1] });
        advanceWinner(tId, match.id, other);
        break;
      }
    }
    broadcastWaiting(tId);
    emitBracket(tId);
  });
});

/* ===================================================
   SERVER LISTEN
=================================================== */
httpServer.listen(PORT, () => console.log(`Server unico attivo su http://localhost:${PORT}`));
