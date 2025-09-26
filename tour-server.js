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
  waiting: [],       // giocatori in attesa
  matches: {},       // match correnti {id: {players, stage}}
  bracket: []        // match finiti {winner, loser, stage, player1, player2}
};

// --- Turno ---
function nextTurn(match, attackerIndex) {
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
    io.of("/tournament").to(p.id).emit("updateMatch", { player1: me, player2: opp, stage: match.stage });
    io.of("/tournament").to(p.id).emit("log", `${attacker.nick} rolls ${damage} and deals ${damage} damage!`);
  });

  if (defender.hp === 0) {
    const winner = attacker;
    const loser = defender;

    match.players.forEach(p => {
      io.of("/tournament").to(p.id).emit("matchOver", { winner: winner.nick, stage: match.stage, player1: match.players[0], player2: match.players[1] });
    });

    tournament.bracket.push({ winner: winner.nick, loser: loser.nick, stage: match.stage, player1: match.players[0], player2: match.players[1] });

    // rimuovi il loser da waiting, winner resta per fasi successive
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

  players.forEach(p => {
    const other = players.find(pl => pl.id !== p.id);
    io.of("/tournament").to(p.id).emit("matchStart", { player1: p, player2: other, stage });
  });

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(tournament.matches[matchId], first), 1000);
}

// --- Avanza fasi ---
function checkNextStage() {
  const stages = ["quarter", "semi", "final"];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const prevStage = i === 0 ? null : stages[i - 1];

    const active = Object.values(tournament.matches).some(m => m.stage === stage);
    if (active) continue; // match in corso → salta

    let candidates;
    if (!prevStage) {
      // quarti: i primi 8 in waiting
      if (tournament.waiting.length >= 8) candidates = tournament.waiting.slice(0, 8);
      else return; // aspetta che arrivino 8 giocatori
    } else {
      // fasi successive: vincitori precedenti
      candidates = tournament.bracket.filter(b => b.stage === prevStage)
        .map(b => tournament.waiting.find(p => p.nick === b.winner))
        .filter(Boolean);
    }

    // Avvia match a coppie
    for (let j = 0; j < candidates.length; j += 2) {
      const p1 = candidates[j];
      const p2 = candidates[j + 1];
      if (p1 && p2) startMatch(p1, p2, stage);
    }

    // Se finale e solo 1 vincitore → torneo finito
    if (stage === "final" && candidates.length === 1) {
      const champ = candidates[0];
      io.of("/tournament").emit("tournamentOver", { nick: champ.nick, char: champ.char });
      resetTournament();
    }
  }
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
    nspTournament.emit("waitingCount", { count: tournament.waiting.length, required: 8 });
  }

  socket.on("joinTournament", ({ nick, char }) => {
    if (tournament.waiting.find(p => p.id === socket.id)) return;

    socket.nick = nick;
    socket.char = char;
    tournament.waiting.push({ id: socket.id, nick, char });

    updateWaitingCount();

    nspTournament.to(socket.id).emit("waiting", `Waiting for 8 players...`);

    // Avvia quarti se ci sono 8 giocatori
    if (tournament.waiting.length === 8) checkNextStage();
  });

  socket.on("chatMessage", text => {
    nspTournament.emit("chatMessage", { nick: socket.nick, text });
  });

  socket.on("disconnect", () => {
    tournament.waiting = tournament.waiting.filter(p => p.id !== socket.id);
    updateWaitingCount();

    // Se il giocatore era in match → l'altro vince
    for (const matchId in tournament.matches) {
      const match = tournament.matches[matchId];
      const index = match.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const other = match.players.find(p => p.id !== socket.id);
        nspTournament.to(other.id).emit("matchOver", { winner: other.nick, stage: match.stage, player1: match.players[0], player2: match.players[1] });
        tournament.bracket.push({ winner: other.nick, loser: socket.nick, stage: match.stage, player1: match.players[0], player2: match.players[1] });
        delete tournament.matches[matchId];
        checkNextStage();
      }
    }
  });

});

httpServer.listen(PORT, () => console.log(`Tournament server attivo su http://localhost:${PORT}`));