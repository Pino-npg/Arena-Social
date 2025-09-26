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

function rollDice() {
  return Math.floor(Math.random() * 8) + 1;
}

//
// ------------------- 1VS1 -------------------
//
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

// Namespace default (1vs1)
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

//
// ------------------- TORNEO -------------------
//
const tournament = { waiting: [], matches: {}, bracket: [] };

function nextTurnTournament(match, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  let damage = rollDice();
  if (attacker.stunned) { damage = Math.max(1, damage - 1); attacker.stunned = false; }
  if (damage === 8) defender.stunned = true;

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  match.players.forEach(p => {
    const me = match.players.find(pl => pl.id === p.id);
    const opp = match.players.find(pl => pl.id !== p.id);
    nspTournament.to(p.id).emit("updateMatch", { player1: me, player2: opp, stage: match.stage });
    nspTournament.to(p.id).emit("log", `${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
  });

  if (defender.hp === 0) {
    const winner = attacker, loser = defender;
    match.players.forEach(p => {
      nspTournament.to(p.id).emit("matchOver", { winner: winner.nick, stage: match.stage, player1: match.players[0], player2: match.players[1] });
    });
    tournament.bracket.push({ winner: winner.nick, loser: loser.nick, stage: match.stage });
    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);
    delete tournament.matches[match.id];
    checkNextStage();
    return;
  }

  setTimeout(() => nextTurnTournament(match, defenderIndex), 3000);
}

function startMatch(p1, p2, stage) {
  const matchId = p1.id + "#" + p2.id;
  const players = [
    { ...p1, hp: 80, stunned: false, dice: 0 },
    { ...p2, hp: 80, stunned: false, dice: 0 }
  ];
  tournament.matches[matchId] = { id: matchId, players, stage };
  players.forEach(p => {
    const opp = players.find(pl => pl.id !== p.id);
    nspTournament.to(p.id).emit("matchStart", { player1: p, player2: opp, stage });
  });
  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurnTournament(tournament.matches[matchId], first), 1000);
}

function checkNextStage() {
  const stages = ["quarter", "semi", "final"];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const prev = i === 0 ? null : stages[i - 1];
    const active = Object.values(tournament.matches).some(m => m.stage === stage);
    if (active) continue;

    let candidates;
    if (!prev) {
      if (tournament.waiting.length >= 8) candidates = tournament.waiting.slice(0, 8);
      else return;
    } else {
      candidates = tournament.bracket.filter(b => b.stage === prev)
        .map(b => tournament.waiting.find(p => p.nick === b.winner))
        .filter(Boolean);
    }

    for (let j = 0; j < candidates.length; j += 2) {
      if (candidates[j] && candidates[j + 1]) startMatch(candidates[j], candidates[j + 1], stage);
    }

    if (stage === "final" && candidates.length === 1) {
      const champ = candidates[0];
      nspTournament.emit("tournamentOver", { nick: champ.nick, char: champ.char });
      tournament.waiting = [];
      tournament.matches = {};
      tournament.bracket = [];
    }
  }
}

const nspTournament = io.of("/tournament");
nspTournament.on("connection", socket => {
  function updateWaiting() {
    nspTournament.emit("waitingCount", { count: tournament.waiting.length, required: 8 });
  }

  socket.on("joinTournament", ({ nick, char }) => {
    if (tournament.waiting.find(p => p.id === socket.id)) return;
    socket.nick = nick; socket.char = char;
    tournament.waiting.push({ id: socket.id, nick, char });
    updateWaiting();
    nspTournament.to(socket.id).emit("waiting", "Waiting for 8 players...");
    if (tournament.waiting.length === 8) checkNextStage();
  });

  socket.on("chatMessage", text => {
    nspTournament.emit("chatMessage", { nick: socket.nick, text });
  });

  socket.on("disconnect", () => {
    tournament.waiting = tournament.waiting.filter(p => p.id !== socket.id);
    updateWaiting();
    for (const matchId in tournament.matches) {
      const match = tournament.matches[matchId];
      const idx = match.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        nspTournament.to(other.id).emit("matchOver", { winner: other.nick, stage: match.stage });
        tournament.bracket.push({ winner: other.nick, loser: socket.nick, stage: match.stage });
        delete tournament.matches[matchId];
        checkNextStage();
      }
    }
  });
});

// ------------------- SERVER -------------------
httpServer.listen(PORT, () => console.log(`Server attivo su http://localhost:${PORT}`));