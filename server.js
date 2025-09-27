// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

// ------------------- STATIC -------------------
app.use(express.static("public"));

app.get("/1vs1.html", (req, res) => {
  res.sendFile(new URL("public/1vs1.html", import.meta.url).pathname);
});
app.get("/tour.html", (req, res) => {
  res.sendFile(new URL("public/tour.html", import.meta.url).pathname);
});
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

  let damage = rollDice();
  if (attacker.stunned) {
    damage = Math.max(1, damage - 1);
    attacker.stunned = false;
  }
  if (damage === 8) defender.stunned = true;

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  for (const p of game.players) {
    const me = game.players.find(pl => pl.id === p.id);
    const opp = game.players.find(pl => pl.id !== p.id);
    io.to(p.id).emit("1vs1Update", { player1: me, player2: opp });
    io.to(p.id).emit("log", `${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
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
   TOURNAMENT MODE
=================================================== */
const tournament = { waiting: [], matches: {}, bracket: [] };

function broadcastWaiting() {
  nsp.emit("waitingCount", {
    count: tournament.waiting.length,
    required: 8,
    players: tournament.waiting.slice()
  });
}

function emitBracket() {
  nsp.emit("tournamentState", tournament.bracket);
}

function generateBracket(players8) {
  tournament.bracket = [
    { id: "Q1", stage: "quarter", player1: players8[0], player2: players8[1], next: "S1", winner: null },
    { id: "Q2", stage: "quarter", player1: players8[2], player2: players8[3], next: "S1", winner: null },
    { id: "Q3", stage: "quarter", player1: players8[4], player2: players8[5], next: "S2", winner: null },
    { id: "Q4", stage: "quarter", player1: players8[6], player2: players8[7], next: "S2", winner: null },
    { id: "S1", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "S2", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "F", stage: "final", player1: null, player2: null, next: null, winner: null }
  ];
  emitBracket();
}

function advanceWinner(matchId, winnerObj) {
  const brMatch = tournament.bracket.find(m => m.id === matchId);
  if (!brMatch) return;

  brMatch.winner = { id: winnerObj.id, nick: winnerObj.nick, char: winnerObj.char };

  if (brMatch.next) {
    const next = tournament.bracket.find(m => m.id === brMatch.next);
    if (next) {
      if (!next.player1) next.player1 = brMatch.winner;
      else if (!next.player2) next.player2 = brMatch.winner;

      if (next.player1 && next.player2) {
        startMatch(next.player1, next.player2, next.stage, next.id);
      }
    }
  }

  emitBracket();

  if (brMatch.id === "F" && brMatch.winner) {
    nsp.emit("tournamentOver", {
      nick: brMatch.winner.nick,
      char: brMatch.winner.char
    });

    setTimeout(() => resetTournament(), 5000);
  }
}

function resetTournament() {
  tournament.waiting = [];
  tournament.matches = {};
  tournament.bracket = [];
  broadcastWaiting();
  nsp.emit("startTournament", []);
  emitBracket();
}

function nextTurn(match, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  let damage = rollDice();
  let logMsg = "";

  if (attacker.stunned) {
    damage = Math.max(0, damage - 1);
    attacker.stunned = false;
    logMsg = `${attacker.nick} is stunned and deals only ${damage} 😵‍💫`;
  } else if (damage === 8) {
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Deals ${damage} ⚡💥`;
  } else {
    logMsg = `${attacker.nick} rolls ${damage} and deals ${damage} 💥`;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  nsp.emit("updateMatch", {
    id: match.id,
    stage: match.stage,
    player1: { ...match.players[0] },
    player2: { ...match.players[1] }
  });
  nsp.emit("log", logMsg);

  if (defender.hp <= 0) {
    const winner = attacker;
    const loser = defender;

    nsp.emit("matchOver", {
      winnerNick: winner.nick,
      winnerChar: winner.char,
      stage: match.stage,
      player1: match.players[0],
      player2: match.players[1]
    });

    advanceWinner(match.id, winner);
    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);
    delete tournament.matches[match.id];

    nsp.emit("startTournament", Object.values(tournament.matches));
    broadcastWaiting();
    emitBracket();
    return;
  }

  setTimeout(() => nextTurn(match, defenderIndex), 3000);
}

function startMatch(p1, p2, stage, matchId) {
  if (!p1 || !p2) return;
  const players = [
    { ...p1, hp: 80, stunned: false, dice: 0 },
    { ...p2, hp: 80, stunned: false, dice: 0 }
  ];
  const match = { id: matchId, players, stage };
  tournament.matches[matchId] = match;

  nsp.emit("startTournament", Object.values(tournament.matches));
  nsp.emit("startMatch", { id: matchId, player1: players[0], player2: players[1], stage });

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(match, first), 1000);
}

const nsp = io.of("/tournament");
nsp.on("connection", socket => {
  socket.emit("waitingCount", { count: tournament.waiting.length, required: 8, players: tournament.waiting });
  socket.emit("startTournament", Object.values(tournament.matches));
  socket.emit("tournamentState", tournament.bracket);

  socket.on("joinTournament", ({ nick, char }) => {
    if (!nick || !char) return;
    if (tournament.waiting.find(p => p.id === socket.id)) return;

    const player = { id: socket.id, nick, char };
    tournament.waiting.push(player);
    broadcastWaiting();

    if (tournament.waiting.length === 8 && tournament.bracket.length === 0) {
      const first8 = tournament.waiting.slice(0, 8);
      nsp.emit("waitingStart", { players: first8.map(p => p.nick), total: 8 });

      generateBracket(first8);
      tournament.bracket.filter(m => m.stage === "quarter").forEach(m => {
        startMatch(m.player1, m.player2, m.stage, m.id);
      });
    }
  });

  socket.on("chatMessage", text => {
    const sNick = tournament.waiting.find(p => p.id === socket.id)?.nick || "Anon";
    nsp.emit("chatMessage", { nick: sNick, text });
  });

  socket.on("disconnect", () => {
    tournament.waiting = tournament.waiting.filter(p => p.id !== socket.id);
    for (const matchId in tournament.matches) {
      const match = tournament.matches[matchId];
      const idx = match.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        nsp.emit("matchOver", {
          winnerNick: other.nick,
          winnerChar: other.char,
          stage: match.stage,
          player1: match.players[0],
          player2: match.players[1]
        });
        advanceWinner(match.id, other);
        delete tournament.matches[matchId];
        break;
      }
    }
    broadcastWaiting();
    emitBracket();
  });
});

/* ===================================================
   SERVER LISTEN
=================================================== */
httpServer.listen(PORT, () => console.log(`Server unico attivo su http://localhost:${PORT}`));