import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

// --- Static ---
app.use(express.static("public"));
app.get("/tour.html", (req, res) => {
  res.sendFile(new URL("public/tour.html", import.meta.url).pathname);
});
app.get("/", (req, res) => res.send("Tournament server attivo!"));

// --- Dado ---
function rollDice() { return Math.floor(Math.random() * 8) + 1; }

// --- Torneo ---
const tournament = {
  waiting: [],
  matches: {},
  bracket: []
};

// --- Turno ---
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

  match.players.forEach(p => {
    const me = p;
    const opp = match.players.find(pl => pl.id !== p.id);
    io.of("/tournament").to(p.id).emit("updateMatch", { ...match, id: match.id, player1: me, player2: opp });
    io.of("/tournament").to(p.id).emit("log", logMsg);
  });

  if (defender.hp <= 0) {
    const winner = attacker;
    const loser = defender;

    match.players.forEach(p => {
      io.of("/tournament").to(p.id).emit("matchOver", { 
        winnerNick: winner.nick, 
        winnerChar: winner.char, 
        stage: match.stage, 
        player1: match.players[0], 
        player2: match.players[1] 
      });
    });

    tournament.bracket.push({ winner: winner, loser: loser, stage: match.stage, player1: match.players[0], player2: match.players[1] });
    tournament.waiting = tournament.waiting.filter(p => p.id !== loser.id);
    delete tournament.matches[match.id];

    checkNextStage();
    return;
  }

  setTimeout(() => nextTurn(match, defenderIndex), 3000);
}

// --- Avvia match ---
function startMatch(p1, p2, stage) {
  const matchId = p1.id + "#" + p2.id;
  const players = [
    { ...p1, hp: 80, stunned: false, dice: 0 },
    { ...p2, hp: 80, stunned: false, dice: 0 }
  ];
  tournament.matches[matchId] = { id: matchId, players, stage };

  // Invia matchStart a entrambi i giocatori
  players.forEach(p => {
    const other = players.find(pl => pl.id !== p.id);
    io.of("/tournament").to(p.id).emit("startMatch", { player1: p, player2: other, stage });
  });

  // Aggiorna il client globale con tutti i match attivi
  io.of("/tournament").emit("startTournament", Object.values(tournament.matches));

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(tournament.matches[matchId], first), 1000);
}

// --- Avanza fasi ---
function checkNextStage() {
  const stages = ["quarter", "semi", "final"];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const prevStage = i === 0 ? null : stages[i - 1];

    const activeMatches = Object.values(tournament.matches).some(m => m.stage === stage);
    if (activeMatches) continue;

    let candidates = [];

    if (!prevStage) {
      if (tournament.waiting.length >= 8) candidates = tournament.waiting.slice(0, 8);
      else return;
    } else {
      // Prendi i vincitori della fase precedente
      candidates = tournament.bracket
        .filter(b => b.stage === prevStage)
        .map(b => b.winner)
        .filter(Boolean);
    }

    for (let j = 0; j < candidates.length; j += 2) {
      const p1 = candidates[j];
      const p2 = candidates[j + 1];
      if (p1 && p2) startMatch(p1, p2, stage);
    }

    // Finale
    if (stage === "final" && candidates.length === 1) {
      const champ = candidates[0];
      io.of("/tournament").emit("tournamentOver", { nick: champ.nick, char: champ.char });
      resetTournament();
    }
  }

  // Aggiorna sempre il waiting count
  nspTournament.emit("waitingCount", {
    count: tournament.waiting.length,
    required: 8,
    players: tournament.waiting
  });
}

// --- Reset torneo ---
function resetTournament() {
  tournament.waiting = [];
  tournament.matches = {};
  tournament.bracket = [];
}

// --- Namespace torneo ---
const nspTournament = io.of("/tournament");

nspTournament.on("connection", socket => {

  function updateWaitingCount() {
    nspTournament.emit("waitingCount", {
      count: tournament.waiting.length,
      required: 8,
      players: tournament.waiting
    });
  }

  socket.on("joinTournament", ({ nick, char }) => {
    if (tournament.waiting.find(p => p.id === socket.id)) return;

    tournament.waiting.push({ id: socket.id, nick, char });
    updateWaitingCount();
    nspTournament.to(socket.id).emit("waiting", `Waiting for 8 players...`);

    if (tournament.waiting.length === 8) checkNextStage();
  });

  socket.on("chatMessage", text => {
    nspTournament.emit("chatMessage", { nick: socket.nick || "Anon", text });
  });

  socket.on("disconnect", () => {
    tournament.waiting = tournament.waiting.filter(p => p.id !== socket.id);
    updateWaitingCount();

    for (const matchId in tournament.matches) {
      const match = tournament.matches[matchId];
      const idx = match.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        nspTournament.to(other.id).emit("matchOver", { 
          winnerNick: other.nick, 
          winnerChar: other.char,
          stage: match.stage,
          player1: match.players[0],
          player2: match.players[1]
        });
        tournament.bracket.push({ winner: other, loser: { id: socket.id }, stage: match.stage, player1: match.players[0], player2: match.players[1] });
        delete tournament.matches[matchId];
        checkNextStage();
      }
    }
  });

});

httpServer.listen(PORT, () => console.log(`Tournament server attivo su http://localhost:${PORT}`));