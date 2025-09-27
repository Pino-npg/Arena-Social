// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

// static
app.use(express.static("public"));
app.get("/tour.html", (req, res) => {
  res.sendFile(new URL("public/tour.html", import.meta.url).pathname);
});
app.get("/", (req, res) => res.send("Tournament server attivo!"));

// util
const rollDice = () => Math.floor(Math.random() * 8) + 1;

// state
const tournament = {
  waiting: [],     // {id,nick,char}
  matches: {},     // matchId -> match object
  bracket: []      // bracket entries
};

function broadcastWaiting() {
  io.of("/tournament").emit("waitingCount", {
    count: tournament.waiting.length,
    required: 8,
    players: tournament.waiting.slice()
  });
}

function emitBracket() {
  io.of("/tournament").emit("tournamentState", tournament.bracket);
}

// build bracket
function generateBracket(players8) {
  tournament.bracket = [
    { id: "Q1", stage: "quarter", player1: players8[0], player2: players8[1], next: "S1", winner: null },
    { id: "Q2", stage: "quarter", player1: players8[2], player2: players8[3], next: "S1", winner: null },
    { id: "Q3", stage: "quarter", player1: players8[4], player2: players8[5], next: "S2", winner: null },
    { id: "Q4", stage: "quarter", player1: players8[6], player2: players8[7], next: "S2", winner: null },
    { id: "S1", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "S2", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "F",  stage: "final", player1: null, player2: null, next: null, winner: null }
  ];
  emitBracket();
}

// --- LOGICA AVANZAMENTO ---
function advanceWinner(matchId, winnerObj) {
  const brMatch = tournament.bracket.find(m => m.id === matchId);
  if (!brMatch) return;

  brMatch.winner = { id: winnerObj.id, nick: winnerObj.nick, char: winnerObj.char };

  if (brMatch.next) {
    const next = tournament.bracket.find(m => m.id === brMatch.next);
    if (next) {
      if (!next.player1) next.player1 = brMatch.winner;
      else if (!next.player2) next.player2 = brMatch.winner;

      // SOLO se entrambe pronte → start
      if (next.player1 && next.player2) {
        startMatch(next.player1, next.player2, next.stage, next.id);
      }
    }
  }

  emitBracket();

  // finale conclusa
  if (brMatch.id === "F" && brMatch.winner) {
    io.of("/tournament").emit("tournamentOver", {
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
  io.of("/tournament").emit("startTournament", []);
  emitBracket();
}

// --- MATCH LOGIC ---
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

  io.of("/tournament").emit("updateMatch", {
    id: match.id,
    stage: match.stage,
    player1: { ...match.players[0] },
    player2: { ...match.players[1] }
  });
  io.of("/tournament").emit("log", logMsg);

  if (defender.hp <= 0) {
    const winner = attacker;
    const loser = defender;

    io.of("/tournament").emit("matchOver", {
      winnerNick: winner.nick,
      winnerChar: winner.char,
      stage: match.stage,
      player1: match.players[0],
      player2: match.players[1]
    });

    advanceWinner(match.id, winner);
    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);
    delete tournament.matches[match.id];

    io.of("/tournament").emit("startTournament", Object.values(tournament.matches));
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

  io.of("/tournament").emit("startTournament", Object.values(tournament.matches));
  io.of("/tournament").emit("startMatch", { id: matchId, player1: players[0], player2: players[1], stage });

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(match, first), 1000);
}

// --- SOCKET.IO ---
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
      io.of("/tournament").emit("waitingStart", { players: first8.map(p => p.nick), total: 8 });

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

httpServer.listen(PORT, () => console.log(`Tournament server attivo su http://localhost:${PORT}`));