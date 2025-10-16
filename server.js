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

const usedNicks = new Map(); // base -> count
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

// ------------------- 1VS1 MODE -------------------
const games = {};
let waitingPlayer = null;
const lastGames = {};

async function nextTurn1vs1(game, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = game.players[attackerIndex];
  const defender = game.players[defenderIndex];

  // Tiro del dado
  const realRoll = rollDice();
  let damage = realRoll;
  let logMsg = "";

  // Gestione stun e critico
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

  // Aggiornamento HP
  defender.hp = Math.max(0, Math.min(defender.hp - damage, 80));
  attacker.hp = Math.min(attacker.hp, 80);
  attacker.dice = damage;

  // Aggiorna stato per ciascun player
  for (const p of game.players) {
    const me = game.players.find(pl => pl.id === p.id);
    const opp = game.players.find(pl => pl.id !== p.id);
    io.to(p.id).emit("1vs1Update", game.id, { player1: me, player2: opp });
  }

  // Invia log **una sola volta** alla stanza
  io.to(game.id).emit("log", logMsg);

  // Controlla vittoria
  if (defender.hp === 0) {
    for (const p of game.players) {
      io.to(p.id).emit("gameOver", game.id, { winnerNick: attacker.nick, winnerChar: attacker.char });
      lastGames[p.id] = game;
    }
    delete games[game.id];
    return;
  }

  // Passa il turno
  setTimeout(() => nextTurn1vs1(game, defenderIndex), 3000);
}

// ------------------- SOCKET.IO CONNECTION -------------------
io.on("connection", socket => {
  // Online count
  io.emit("onlineCount", io.engine.clientsCount);

  // ------------------- NICKNAME -------------------
  socket.on("setNickname", nick => {
    const finalNick = assignUniqueNick(nick);
    socket.nick = finalNick;
    socket.emit("nickConfirmed", finalNick);
  });

  // ------------------- 1VS1 -------------------
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
  
      // inserimento in stanza
      for (const p of players) {
        io.sockets.sockets.get(p.id)?.join(gameId);
        const opp = players.find(pl => pl.id !== p.id);
        io.to(p.id).emit("gameStart", gameId, { player1: p, player2: opp });  // <-- passa gameId
      }
  
      const first = Math.floor(Math.random() * 2);
      setTimeout(() => nextTurn1vs1(games[gameId], first), 1000);
      waitingPlayer = null;
    }
  });

  socket.on("chatMessage", data => {
    const { roomId, text } = data;
    let game = Object.values(games).find(g => g.id === roomId);
    if (!game) game = lastGames[roomId];
    if (!game) return;

    for (const p of game.players) {
      io.to(p.id).emit("chatMessage", { nick: socket.nick, text, roomId });
    }
});

  // ------------------- DISCONNECT -------------------
  socket.on("disconnect", () => {
    releaseNick(socket.nick);
    io.emit("onlineCount", io.engine.clientsCount);

    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;

    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        io.to(other.id).emit("gameOver", gameId, { winnerNick: other.nick, winnerChar: other.char });  // aggiungi gameId
        lastGames[other.id] = game;
        delete games[gameId];
        break;
      }
    }
  });
});

// ------------------- TOURNAMENT MODE -------------------
const tournaments = {};
const nsp = io.of("/tournament");

function createTournament() {
  const id = uuidv4();
  tournaments[id] = { id, waiting: [], matches: {}, bracket: [] };
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

// ---------- Turni di battaglia ----------
function nextTurn(match, tournamentId, attackerIndex) {
  const defenderIndex = attackerIndex === 0 ? 1 : 0;
  const attacker = match.players[attackerIndex];
  const defender = match.players[defenderIndex];

  const realRoll = rollDice();
  let damage = realRoll;
  let logMsg = "";

  if (attacker.stunned) {
    // penalità al danno inflitto
    damage = Math.max(0, damage - 1);
    attacker.stunned = false;
    logMsg = `${attacker.nick} is stunned! Rolled ${realRoll} → deals only ${damage} 😵‍💫`;
  } else if (realRoll === 8) {
    // critico
    defender.stunned = true;
    logMsg = `${attacker.nick} CRIT! Rolled ${realRoll} → deals ${damage} ⚡💥`;
  } else {
    logMsg = `${attacker.nick} rolls ${realRoll} and deals ${damage} 💥`;
  }

  defender.hp = Math.max(0, defender.hp - damage);

  attacker.roll = realRoll; // valore reale
  attacker.dmg = damage;    // danno applicato

  nsp.to(tournamentId).emit("updateMatch", {
    id: match.id,
    stage: match.stage,
    player1: match.players[0],
    player2: match.players[1]
  });

  nsp.to(tournamentId).emit("log", logMsg);

  if (defender.hp <= 0) {
    const winner = attacker;
    nsp.to(tournamentId).emit("matchOver", {
      winnerNick: winner.nick,
      winnerChar: winner.char,
      stage: match.stage,
      player1: match.players[0],
      player2: match.players[1]
    });
    advanceWinner(tournamentId, match.id, winner);
    return;
  }

  setTimeout(() => nextTurn(match, tournamentId, defenderIndex), 3000);
}

function startMatch(tournamentId, p1, p2, stage, matchId) {
  const t = tournaments[tournamentId];
  if (!t) return;

  // placeholder se player null
  p1 = p1 || { nick:"??", char:"unknown", id:null };
  p2 = p2 || { nick:"??", char:"unknown", id:null };

  const players = [
    { ...p1, hp: 80, stunned: false, roll: 1, dmg: 0 },
    { ...p2, hp: 80, stunned: false, roll: 1, dmg: 0 }
  ];

  const match = { id: matchId, players, stage };
  t.matches[matchId] = match;

  // invia subito ai client lo stato iniziale del match
  nsp.to(tournamentId).emit("startTournament", Object.values(t.matches));
  nsp.to(tournamentId).emit("startMatch", { 
    id: match.id, 
    player1: players[0], 
    player2: players[1], 
    stage 
  });

  // forza il client a renderizzare subito l'HP e il dado
  nsp.to(tournamentId).emit("updateMatch", {
    id: match.id,
    stage: match.stage,
    player1: match.players[0],
    player2: match.players[1]
  });

  const first = Math.floor(Math.random() * 2);
  setTimeout(() => nextTurn(match, tournamentId, first), 1000);
}

// ------------------- TOURNAMENT NAMESPACE -------------------
nsp.on("connection", socket => {
  // invia subito il numero di client connessi nella namespace tournament
  nsp.emit("onlineCount", nsp.sockets.size);

  let currentTournament = null;

  socket.on("setNickname", nick => {
    const finalNick = assignUniqueNick(nick);
    socket.nick = finalNick;
    socket.emit("nickConfirmed", finalNick);
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
        nsp.to(tId).emit("matchOver", { winnerNick: other.nick, winnerChar: other.char, stage: match.stage, player1: match.players[0], player2: match.players[1] });
        advanceWinner(tId, match.id, other);
        break;
      }
    }
    broadcastWaiting(tId);
    emitBracket(tId);

    // aggiorna il numero di client connessi dopo il disconnect
    nsp.emit("onlineCount", nsp.sockets.size);
  });
});

// ------------------- SERVER LISTEN -------------------
httpServer.listen(PORT, () => console.log(`Server unico attivo su http://localhost:${PORT}`));