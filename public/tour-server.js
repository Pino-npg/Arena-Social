// tour-server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Porta dedicata al torneo
const PORT = process.env.PORT || 10001;

// --- Static ---
app.use(express.static("public"));
app.get("/tour.html", (req, res) => {
  res.sendFile(new URL("public/tour.html", import.meta.url).pathname);
});
app.get("/", (req, res) => {
  res.send("Tournament server attivo!");
});

// --- Utility dado ---
function rollDice() {
  return Math.floor(Math.random() * 8) + 1;
}

// --- Struttura torneo ---
const tournament = {
  waiting: [],
  matches: {},
  bracket: [] // { winner, loser, stage }
};

// --- Gestione turni ---
function nextTurn(match, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  let damage = rollDice();
  if (attacker.stunned) {
    damage = Math.max(1, damage - 1);
    attacker.stunned = false;
  }
  if (damage === 8) defender.stunned = true;

  defender.hp = Math.max(0, defender.hp - damage);
  attacker.dice = damage;

  for (const p of match.players) {
    const me = match.players.find(pl => pl.id === p.id);
    const opp = match.players.find(pl => pl.id !== p.id);
    io.of("/tournament").to(p.id).emit("updateMatch", { player1: me, player2: opp, stage: match.stage });
    io.of("/tournament").to(p.id).emit("log", `${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
  }

  if (defender.hp === 0) {
    const winner = attacker;
    const loser = defender;

    for (const p of match.players) {
      io.of("/tournament").to(p.id).emit("matchOver", { winner: winner.nick, stage: match.stage });
    }

    tournament.bracket.push({ winner: winner.nick, loser: loser.nick, stage: match.stage });

    // sostituisci entry in waiting
    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);
    // winner resta in waiting per fasi successive

    delete tournament.matches[match.id];
    checkNextStage();
    return;
  }

  setTimeout(() => nextTurn(match, defenderIndex), 3000);
}

// --- Avvio match ---
function startMatch(p1, p2, stage) {
  const matchId = p1.id + "#" + p2.id;
  const players = [
    { ...p1, hp: 80, stunned: false, dice: 0 },
    { ...p2, hp: 80, stunned: false, dice: 0 }
  ];
  tournament.matches[matchId] = { id: matchId, players, stage };

  for (const p of players) {
    const other = players.find(pl => pl.id !== p.id);
    io.of("/tournament").to(p.id).emit("matchStart", { player1: p, player2: other, stage });
  }

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(tournament.matches[matchId], first), 1000);
}

// --- Controllo avanzamento ---
function checkNextStage() {
  const stages = ["quarter", "semi", "final"];
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const stage = stages[i];

    const active = Object.values(tournament.matches).some(m => m.stage === stage);
    if (!active) {
      const winners = tournament.bracket.filter(b => b.stage === prev).map(b => b.winner);
      if (winners.length >= 2) {
        for (let j = 0; j < winners.length; j += 2) {
          const p1 = tournament.waiting.find(p => p.nick === winners[j]);
          const p2 = tournament.waiting.find(p => p.nick === winners[j + 1]);
          if (p1 && p2) startMatch(p1, p2, stage);
        }
      }

      // se finale già giocata → vincitore assoluto
      if (stage === "final" && winners.length === 1) {
        const champion = winners[0];
        io.of("/tournament").emit("tournamentOver", { nick: champion });
        resetTournament();
      }
    }
  }
}

// --- Reset dopo un torneo ---
function resetTournament() {
  tournament.waiting = [];
  tournament.matches = {};
  tournament.bracket = [];
}

// --- Namespace torneo ---
const nspTournament = io.of("/tournament");
nspTournament.on("connection", socket => {
  socket.on("joinTournament", ({ nick, char }) => {
    socket.nick = nick;
    socket.char = char;
    tournament.waiting.push({ id: socket.id, nick, char });

    nspTournament.to(socket.id).emit("waiting", "Waiting for 8 players...");

    if (tournament.waiting.length === 8) {
      for (let i = 0; i < 8; i += 2) {
        startMatch(tournament.waiting[i], tournament.waiting[i + 1], "quarti");
      }
    }
  });

  socket.on("chatMessage", text => {
    const msg = { nick: socket.nick, text };
    nspTournament.emit("chatMessage", msg);
  });

  socket.on("disconnect", () => {
    tournament.waiting = tournament.waiting.filter(p => p.id !== socket.id);
    for (const matchId in tournament.matches) {
      const match = tournament.matches[matchId];
      const index = match.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        nspTournament.to(other.id).emit("matchOver", { winner: other.nick, stage: match.stage });
        tournament.bracket.push({ winner: other.nick, loser: socket.nick, stage: match.stage });
        delete tournament.matches[matchId];
        checkNextStage();
      }
    }
  });
});

// --- Start server ---
httpServer.listen(PORT, () => {
  console.log(`Tournament server attivo su http://localhost:${PORT}`);
});