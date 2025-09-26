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

// utility
function rollDice() { return Math.floor(Math.random() * 8) + 1; }

// tournament state
const tournament = {
  waiting: [],     // {id,nick,char}
  matches: {},     // { matchId: { id, players: [p1,p2], stage } }
  bracket: []      // finished matches { winner: {id,nick,char}, loser: {...}, stage, player1, player2 }
};

function broadcastWaiting() {
  const payload = {
    count: tournament.waiting.length,
    required: 8,
    players: tournament.waiting.slice(0) // shallow copy
  };
  io.of("/tournament").emit("waitingCount", payload);
}

// --- turn logic (per match) ---
function nextTurn(match, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  let damage = rollDice();
  let logMsg = "";

  if (attacker.stunned) {
    damage = Math.max(0, damage - 1);
    attacker.stunned = false;
    logMsg = `${attacker.nick} is stunned and only deals ${damage} damage 😵‍💫`;
  } else if (damage === 8) {
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Deals ${damage} damage ⚡💥`;
  } else {
    logMsg = `${attacker.nick} rolls ${damage} and deals ${damage} damage 💥`;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  const matchSnapshot = {
    id: match.id,
    stage: match.stage,
    player1: { ...match.players[0] },
    player2: { ...match.players[1] }
  };

  io.of("/tournament").emit("updateMatch", matchSnapshot);
  io.of("/tournament").emit("log", logMsg);

  // check end
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

    tournament.bracket.push({
      winner: { id: winner.id, nick: winner.nick, char: winner.char },
      loser: { id: loser.id, nick: loser.nick, char: loser.char },
      stage: match.stage,
      player1: match.players[0],
      player2: match.players[1]
    });

    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);
    delete tournament.matches[match.id];

    io.of("/tournament").emit("startTournament", Object.values(tournament.matches));

    checkNextStage();
    broadcastWaiting();
    return;
  }

  setTimeout(() => nextTurn(match, defenderIndex), 3000);
}

// --- start a match ---
function startMatch(p1, p2, stage) {
  const matchId = `${p1.id}#${p2.id}`;
  const players = [
    { ...p1, hp: 80, stunned: false, dice: 0 },
    { ...p2, hp: 80, stunned: false, dice: 0 }
  ];
  const match = { id: matchId, players, stage };
  tournament.matches[matchId] = match;

  // notify global clients: new active matches
  io.of("/tournament").emit("startTournament", Object.values(tournament.matches));

  // 🔥 notify all clients so everyone sees the match card
  io.of("/tournament").emit("startMatch", {
    id: matchId,
    player1: players[0],
    player2: players[1],
    stage
  });

  // notify participants individually (if still connected)
  players.forEach(p => {
    io.of("/tournament").to(p.id).emit("startMatch", {
      id: matchId,
      player1: p,
      player2: players.find(pl => pl.id !== p.id),
      stage
    });
  });

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(match, first), 1000);
}

// --- advance stages / pair winners ---
function checkNextStage() {
  const stages = ["quarter", "semi", "final"];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const prev = i === 0 ? null : stages[i - 1];

    const active = Object.values(tournament.matches).some(m => m.stage === stage);
    if (active) continue;

    let candidates = [];

    if (!prev) {
      if (tournament.waiting.length >= 8) {
        candidates = tournament.waiting.slice(0, 8);
      } else {
        return;
      }
    } else {
      candidates = tournament.bracket
        .filter(b => b.stage === prev)
        .map(b => ({ id: b.winner.id, nick: b.winner.nick, char: b.winner.char }))
        .filter(Boolean);
    }

    for (let j = 0; j < candidates.length; j += 2) {
      const p1 = candidates[j];
      const p2 = candidates[j + 1];
      if (p1 && p2) startMatch(p1, p2, stage);
    }

    if (stage === "final" && candidates.length === 1) {
      const champ = candidates[0];
      io.of("/tournament").emit("tournamentOver", { nick: champ.nick, char: champ.char });
      setTimeout(() => {
        tournament.waiting = [];
        tournament.matches = {};
        tournament.bracket = [];
        broadcastWaiting();
        io.of("/tournament").emit("startTournament", []);
      }, 2000);
      return;
    }
  }

  broadcastWaiting();
}

// --- namespace connection ---
const nsp = io.of("/tournament");

nsp.on("connection", socket => {
  socket.emit("waitingCount", { count: tournament.waiting.length, required: 8, players: tournament.waiting });
  socket.emit("startTournament", Object.values(tournament.matches));

  socket.on("joinTournament", ({ nick, char }) => {
    if (!nick || !char) return;
    if (tournament.waiting.find(p => p.id === socket.id)) return;
    tournament.waiting.push({ id: socket.id, nick, char });
    broadcastWaiting();
    nsp.to(socket.id).emit("waiting", `Waiting for 8 players...`);
    // 🔥 adesso parte anche con più di 8
    if (tournament.waiting.length >= 8) checkNextStage();
  });

  socket.on("chatMessage", text => {
    const nick = socket.nick || (tournament.waiting.find(p=>p.id===socket.id)?.nick) || "Anon";
    nsp.emit("chatMessage", { nick, text });
  });

  socket.on("disconnect", () => {
    tournament.waiting = tournament.waiting.filter(p => p.id !== socket.id);

    for (const matchId in tournament.matches) {
      const match = tournament.matches[matchId];
      const idx = match.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        nsp.to(other.id).emit("matchOver", {
          winnerNick: other.nick,
          winnerChar: other.char,
          stage: match.stage,
          player1: match.players[0],
          player2: match.players[1]
        });
        tournament.bracket.push({
          winner: { id: other.id, nick: other.nick, char: other.char },
          loser: { id: socket.id },
          stage: match.stage,
          player1: match.players[0],
          player2: match.players[1]
        });
        delete tournament.matches[matchId];
        break;
      }
    }

    broadcastWaiting();
    checkNextStage();
  });
});

httpServer.listen(PORT, () => console.log(`Tournament server attivo su http://localhost:${PORT}`));