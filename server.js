// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// static
app.use(express.static("public"));

// --- Utilities ---
const CHOICES = ["water", "wood", "fire"];
const BEATS = { water: "fire", wood: "water", fire: "wood" };

const games = {};
let waitingPlayer = null;
const lastGames = {}; // store last game for disconnected player

function rollDice() { return Math.floor(Math.random() * 8) + 1; }

// ------------------- 1vs1 -------------------
function startRound1vs1(gameId) {
  const game = games[gameId];
  if (!game) return;
  const [p0, p1] = game.players;

  p0.choice = null;
  p1.choice = null;
  game.choices = {};

  game.roundTimer = 10;
  io.to(gameId).emit("roundStart", { gameId, timer: game.roundTimer });

  if (game.roundTimeout) clearTimeout(game.roundTimeout);
  game.roundTimeout = setTimeout(() => evaluateRound1vs1(gameId), game.roundTimer * 1000);
}

function evaluateRound1vs1(gameId) {
  const game = games[gameId];
  if (!game) return;
  const [p0, p1] = game.players;
  const c0 = game.choices[p0.id] || null;
  const c1 = game.choices[p1.id] || null;
  const events = [];

  function applyDamage(target, dmg, reason) {
    const prev = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    target.lastDamage = dmg;
    events.push(`${target.nick} takes ${dmg} damage (${reason}). HP ${prev} -> ${target.hp}`);
  }

  const choice0 = CHOICES.includes(c0) && !p0.stunned ? c0 : null;
  const choice1 = CHOICES.includes(c1) && !p1.stunned ? c1 : null;

  if (!choice0 && !choice1) {
    applyDamage(p0, rollDice(), "no choice (both)");
    applyDamage(p1, rollDice(), "no choice (both)");
  } else if (choice0 && !choice1) {
    applyDamage(p1, rollDice(), `no choice vs ${choice0}`);
  } else if (!choice0 && choice1) {
    applyDamage(p0, rollDice(), `no choice vs ${choice1}`);
  } else if (choice0 === choice1) {
    events.push(`Both chose ${choice0}. No damage.`);
  } else if (BEATS[choice0] === choice1) {
    const dmg = rollDice();
    applyDamage(p1, dmg, `${p0.nick} (${choice0}) beats ${choice1}`);
    if (dmg === 8) { p1.stunned = true; events.push(`${p1.nick} stunned by CRIT!`); }
  } else if (BEATS[choice1] === choice0) {
    const dmg = rollDice();
    applyDamage(p0, dmg, `${p1.nick} (${choice1}) beats ${choice0}`);
    if (dmg === 8) { p0.stunned = true; events.push(`${p0.nick} stunned by CRIT!`); }
  }

  io.to(gameId).emit("1vs1Update", { gameId, player1: p0, player2: p1, lastEvents: events });
  events.forEach(e => io.to(gameId).emit("log", `[system] ${e}`));
  io.to(gameId).emit("log", `[result] ${p0.nick} chose: ${choice0 || "NONE"}`);
  io.to(gameId).emit("log", `[result] ${p1.nick} chose: ${choice1 || "NONE"}`);

  if (p0.hp <= 0 && p1.hp <= 0) {
    io.to(gameId).emit("gameOver", gameId, { draw: true });
    delete games[gameId];
    return;
  } else if (p0.hp <= 0 || p1.hp <= 0) {
    const winner = p0.hp > 0 ? p0 : p1;
    game.players.forEach(p => io.to(p.id).emit("gameOver", gameId, { winnerNick: winner.nick, winnerChar: winner.char }));
    delete games[gameId];
    return;
  }

  setTimeout(() => startRound1vs1(gameId), 1000);
}

// --- 1vs1 socket ---
io.on("connection", socket => {
  // aggiorna contatore online reale
  io.emit("onlineCount", io.sockets.sockets.size);

  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = nick || `Anon-${socket.id.slice(0,4)}`;
    socket.char = char || "unknown";

    // se non c’è alcun waiting player, rimane null
    if (waitingPlayer && !io.sockets.sockets.has(waitingPlayer.id)) waitingPlayer = null;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
      return; // non crea giochi finché non arriva un altro giocatore
    }

    // solo se c’è un giocatore reale in attesa
    if (waitingPlayer.id !== socket.id) {
      const gameId = `${waitingPlayer.id}_${socket.id}`;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, lastDamage: 0 },
        { id: socket.id, nick: socket.nick, char: socket.char, hp: 80, stunned: false, lastDamage: 0 }
      ];
      games[gameId] = { id: gameId, players, choices: {} };

      players.forEach(p => {
        const s = io.sockets.sockets.get(p.id);
        if (s) s.join(gameId);
      });

      // invia gameStart personalizzato
      players.forEach(p => {
        const me = players.find(x => x.id === p.id);
        const opp = players.find(x => x.id !== p.id);
        io.to(p.id).emit("gameStart", gameId, { me, opp });
      });

      startRound1vs1(gameId);
      waitingPlayer = null;
    }
  });

  socket.on("disconnect", () => {
    if (waitingPlayer?.id === socket.id) waitingPlayer = null;

    // aggiorna contatore online reale
    io.emit("onlineCount", io.sockets.sockets.size);

    // gestisci se era in game
    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        if (other) {
          io.to(other.id).emit("gameOver", gameId, { winnerNick: other.nick, winnerChar: other.char });
        }
        clearTimeout(game.roundTimeout);
        delete games[gameId];
        break;
      }
    }
  });
});

// ------------------- TOURNAMENT -------------------
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
    if (next.player1 && next.player2) startMatch(tournamentId, next.player1, next.player2, next.stage, next.id);
  }

  delete t.matches[matchId];
  emitBracket(tournamentId);

  if (brMatch.id === "F" && brMatch.winner) {
    nsp.to(tournamentId).emit("tournamentOver", { nick: brMatch.winner.nick, char: brMatch.winner.char });
    setTimeout(() => delete tournaments[tournamentId], 5000);
  }
}

function startMatch(tId, p1, p2, stage, matchId) {
  const t = tournaments[tId];
  if (!t || !p1 || !p2) return;
  const players = [
    { ...p1, hp: 80, stunned: false, lastDamage: 0 },
    { ...p2, hp: 80, stunned: false, lastDamage: 0 }
  ];
  t.matches[matchId] = { id: matchId, players, stage, choices: {} };

  nsp.to(tId).emit("startMatch", { id: matchId, player1: players[0], player2: players[1], stage });
  setTimeout(() => startTournamentRound(tId, matchId), 1000);
}

function startTournamentRound(tId, matchId) {
  const t = tournaments[tId];
  const match = t?.matches[matchId];
  if (!match) return;

  match.choices = { [match.players[0].id]: null, [match.players[1].id]: null };
  match.roundTimer = 10;
  nsp.to(tId).emit("roundStart", { matchId, timer: match.roundTimer });
  if (match.roundTimeout) clearTimeout(match.roundTimeout);
  match.roundTimeout = setTimeout(() => evaluateTournamentRound(tId, matchId), match.roundTimer * 1000);
}

function evaluateTournamentRound(tId, matchId) {
  const t = tournaments[tId];
  const match = t?.matches[matchId];
  if (!match) return;

  const [p0, p1] = match.players;
  const c0 = match.choices[p0.id];
  const c1 = match.choices[p1.id];

  function applyDamage(target, dmg, reason) {
    const prev = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    target.lastDamage = dmg;
    nsp.to(tId).emit("log", `${target.nick} takes ${dmg} damage (${reason}). HP ${prev} -> ${target.hp}`);
  }

  const p0CannotChoose = !!p0.stunned;
  const p1CannotChoose = !!p1.stunned;
  if (p0CannotChoose) p0.stunned = false;
  if (p1CannotChoose) p1.stunned = false;

  const choice0 = (CHOICES.includes(c0) && !p0CannotChoose) ? c0 : null;
  const choice1 = (CHOICES.includes(c1) && !p1CannotChoose) ? c1 : null;

  if (!choice0 && !choice1) { applyDamage(p0, rollDice(), "no choice (both)"); applyDamage(p1, rollDice(), "no choice (both)"); }
  else if (choice0 && !choice1) applyDamage(p1, rollDice(), `no choice (vs ${choice0})`);
  else if (!choice0 && choice1) applyDamage(p0, rollDice(), `no choice (vs ${choice1})`);
  else if (choice0 === choice1) { applyDamage(p0, rollDice(), "same choice"); applyDamage(p1, rollDice(), "same choice"); }
  else if (BEATS[choice0] === choice1) { const dmg = rollDice(); applyDamage(p1, dmg, `${p0.nick} beats ${choice1}`); if(dmg===8){p1.stunned=true;nsp.to(tId).emit("log",`${p1.nick} stunned by CRIT!`);} }
  else if (BEATS[choice1] === choice0) { const dmg = rollDice(); applyDamage(p0, dmg, `${p1.nick} beats ${choice0}`); if(dmg===8){p0.stunned=true;nsp.to(tId).emit("log",`${p0.nick} stunned by CRIT!`);} }

  nsp.to(tId).emit("updateMatch", { id: match.id, stage: match.stage, player1: p0, player2: p1 });

  if (p0.hp <=0 || p1.hp <=0) {
    const winner = p0.hp>0?p0:p1;
    nsp.to(tId).emit("matchOver",{winnerNick:winner.nick,winnerChar:winner.char,stage:match.stage,player1:p0,player2:p1});
    advanceWinner(tId,match.id,winner);
    return;
  }

  setTimeout(() => startTournamentRound(tId, match.id), 1000);
}

// ------------------- TOURNAMENT SOCKET -------------------
nsp.on("connection", socket => {
  let currentTournament = null;

  socket.on("setNickname", nick => { socket.nick = nick || `Anon-${socket.id.slice(0,4)}`; socket.emit("nickConfirmed", socket.nick); });

  socket.on("joinTournament", ({ nick, char }) => {
    if (!nick || !char) return;
    socket.nick = nick;
    let tId = Object.keys(tournaments).find(id => tournaments[id].waiting.length < 8);
    if (!tId) tId = createTournament();
    currentTournament = tId;
    const t = tournaments[tId];
    if (t.waiting.find(p => p.id === socket.id)) return;
    t.waiting.push({id:socket.id,nick:socket.nick,char});
    socket.join(tId);
    broadcastWaiting(tId);

    if (t.waiting.length===8 && t.bracket.length===0){
      const first8 = t.waiting.slice(0,8);
      nsp.to(tId).emit("waitingStart",{players:first8.map(p=>p.nick),total:8});
      generateBracket(first8,t);
      t.bracket.filter(m=>m.stage==="quarter").forEach(m=>startMatch(tId,m.player1,m.player2,m.stage,m.id));
    }
  });

  socket.on("selectChoiceTournament", ({ tournamentId, matchId, choice }) => {
    const t = tournaments[tournamentId];
    if (!t) return;
    const match = t.matches[matchId];
    if (!match || !CHOICES.includes(choice)) return;
    if(match.choices[socket.id]==null && match.players.find(p=>p.id===socket.id&&!p.stunned)){
      match.choices[socket.id] = choice;
      nsp.to(tournamentId).emit("log", `${socket.nick} chose ${choice}`);
    }
  });

  socket.on("chatMessage", text => {
    const tId = currentTournament;
    if(!tId) return;
    nsp.to(tId).emit("chatMessage",{nick:socket.nick||"Anon",text});
  });

  socket.on("disconnect", () => {
    const tId = currentTournament;
    if(!tId) return;
    const t = tournaments[tId];
    if(!t) return;
    t.waiting = t.waiting.filter(p=>p.id!==socket.id);
    for(const matchId in t.matches){
      const match = t.matches[matchId];
      const idx = match.players.findIndex(p=>p.id===socket.id);
      if(idx!==-1){
        const other = match.players.find(p=>p.id!==socket.id);
        nsp.to(tId).emit("matchOver",{winnerNick:other.nick,winnerChar:other.char,stage:match.stage,player1:match.players[0],player2:match.players[1]});
        advanceWinner(tId,match.id,other);
        break;
      }
    }
    broadcastWaiting(tId);
  });
});

// ---------- SERVER ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));