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
  bracket: []      // bracket entries (Q1..Q4, S1..S2, F)
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

// build bracket: Q1,Q2 -> S1 ; Q3,Q4 -> S2 ; S1,S2 -> F
function generateBracket(players8) {
  tournament.bracket = [
    { id: "Q1", stage: "quarter", player1: players8[0] ?? null, player2: players8[1] ?? null, next: "S1", winner: null },
    { id: "Q2", stage: "quarter", player1: players8[2] ?? null, player2: players8[3] ?? null, next: "S1", winner: null },
    { id: "Q3", stage: "quarter", player1: players8[4] ?? null, player2: players8[5] ?? null, next: "S2", winner: null },
    { id: "Q4", stage: "quarter", player1: players8[6] ?? null, player2: players8[7] ?? null, next: "S2", winner: null },
    { id: "S1", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "S2", stage: "semi", player1: null, player2: null, next: "F", winner: null },
    { id: "F",  stage: "final", player1: null, player2: null, next: null, winner: null }
  ];
  emitBracket();
}

// advance winner inside bracket and start next matches only when both sides are ready
function advanceWinner(bracketMatchId, winnerObj) {
  const brMatch = tournament.bracket.find(m => m.id === bracketMatchId);
  if (!brMatch) return;
  brMatch.winner = { id: winnerObj.id, nick: winnerObj.nick, char: winnerObj.char };

  // place winner into next match (player1 then player2)
  if (brMatch.next) {
    const next = tournament.bracket.find(m => m.id === brMatch.next);
    if (next) {
      if (!next.player1) next.player1 = { id: winnerObj.id, nick: winnerObj.nick, char: winnerObj.char };
      else if (!next.player2) next.player2 = { id: winnerObj.id, nick: winnerObj.nick, char: winnerObj.char };

      // start next match only when both player1 and player2 present
      if (next.player1 && next.player2) {
        // start match using bracket id as matchId so it's traceable (e.g. "S1")
        startMatch(next.player1, next.player2, next.stage, next.id);
      }
    }
  }

  emitBracket();

  // if final decided
  if (brMatch.id === "F" && brMatch.winner) {
    io.of("/tournament").emit("tournamentOver", { nick: brMatch.winner.nick, char: brMatch.winner.char });
    // reset after short delay
    setTimeout(() => {
      tournament.waiting = [];
      tournament.matches = {};
      tournament.bracket = [];
      broadcastWaiting();
      io.of("/tournament").emit("startTournament", []);
      emitBracket();
    }, 2500);
  }
}

// match turn logic (shared)
function nextTurn(match, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  let damage = rollDice();
  let logMsg = "";

  if (attacker.stunned) {
    damage = Math.max(0, damage - 1);
    attacker.stunned = false;
    logMsg = `${attacker.nick} is stunned and deals only ${damage} damage 😵‍💫`;
  } else if (damage === 8) {
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Deals ${damage} damage ⚡💥`;
  } else {
    logMsg = `${attacker.nick} rolls ${damage} and deals ${damage} damage 💥`;
  }

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  // emit update & log
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

    // emit matchOver with clear data
    io.of("/tournament").emit("matchOver", {
      winnerNick: winner.nick,
      winnerChar: winner.char,
      stage: match.stage,
      player1: match.players[0],
      player2: match.players[1]
    });

    // if match.id is a bracket id (like "Q1","S1") we advance that bracket entry
    const bracketEntry = tournament.bracket.find(b => b.id === match.id);
    if (bracketEntry) {
      advanceWinner(bracketEntry.id, { id: winner.id, nick: winner.nick, char: winner.char });
    } else {
      // fallback: try to find by players combination
      const found = tournament.bracket.find(b =>
        (b.player1 && b.player2) &&
        ((b.player1.id === match.players[0].id && b.player2.id === match.players[1].id) ||
         (b.player1.id === match.players[1].id && b.player2.id === match.players[0].id))
      );
      if (found) advanceWinner(found.id, { id: winner.id, nick: winner.nick, char: winner.char });
    }

    // remove loser from waiting (winner proceeds)
    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);

    // delete active match
    delete tournament.matches[match.id];

    // update clients
    io.of("/tournament").emit("startTournament", Object.values(tournament.matches));
    broadcastWaiting();
    emitBracket();
    return;
  }

  // next turn
  setTimeout(() => nextTurn(match, defenderIndex), 3000);
}

// start a match (p1,p2 are {id,nick,char})
function startMatch(p1, p2, stage, matchIdOverride = null) {
  if (!p1 || !p2) return; // waiting for opponent
  const matchId = matchIdOverride || `${p1.id}#${p2.id}`;
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

// namespace
const nsp = io.of("/tournament");
nsp.on("connection", socket => {
  // immediately send state
  socket.emit("waitingCount", { count: tournament.waiting.length, required: 8, players: tournament.waiting });
  socket.emit("startTournament", Object.values(tournament.matches));
  socket.emit("tournamentState", tournament.bracket);

  socket.on("joinTournament", ({ nick, char }) => {
    if (!nick || !char) return;
    if (tournament.waiting.find(p => p.id === socket.id)) return;

    const player = { id: socket.id, nick, char };
    tournament.waiting.push(player);
    broadcastWaiting();

    // when first time we gathered 8 players, generate bracket & start quarter matches
    if (tournament.waiting.length >= 8 && tournament.bracket.length === 0) {
      const first8 = tournament.waiting.slice(0, 8);
      generateBracket(first8);
      // start all quarter matches (use bracket ids Q1..Q4)
      tournament.bracket.filter(m => m.stage === "quarter").forEach(m => {
        startMatch(m.player1, m.player2, m.stage, m.id);
      });
    }
  });

  socket.on("chatMessage", text => {
    const sNick = tournament.waiting.find(p => p.id === socket.id)?.nick || "Anon";
    nsp.emit("chatMessage", { nick: sNick, text });
  });

  // handle disconnects (if in active match grant win to other)
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
        // advance bracket if possible
        const br = tournament.bracket.find(b => b.id === match.id);
        if (br) {
          advanceWinner(br.id, { id: other.id, nick: other.nick, char: other.char });
        } else {
          // fallback
          advanceWinner(match.id, { id: other.id, nick: other.nick, char: other.char });
        }
        delete tournament.matches[matchId];
        break;
      }
    }

    broadcastWaiting();
    emitBracket();
  });
});

httpServer.listen(PORT, () => console.log(`Tournament server attivo su http://localhost:${PORT}`));