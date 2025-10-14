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

// utils / game data
const CHOICES = ["water","wood","fire"];
const BEATS = { water: "fire", wood: "water", fire: "wood" };

const games = {};
let waitingPlayer = null;
const lastGames = {};

function rollDice() { return Math.floor(Math.random()*8) + 1; }

// start a round: players have 10s to choose; after 10s + 3s show results
function startRound1vs1(gameId) {
  const game = games[gameId];
  if (!game) return;

  game.choices = { [game.players[0].id]: null, [game.players[1].id]: null };
  game.roundTimer = 10;

  // inform players round started
  io.to(gameId).emit("roundStart", { gameId, timer: game.roundTimer });

  // clear old timeout
  if (game.roundTimeout) clearTimeout(game.roundTimeout);
  // evaluate after (10 + 3) seconds — 10s for choosing, 3s results-phase delay
  game.roundTimeout = setTimeout(() => evaluateRound1vs1(gameId), (game.roundTimer + 3) * 1000);
}

function evaluateRound1vs1(gameId) {
  const game = games[gameId];
  if (!game) return;
  const [p0, p1] = game.players;
  const c0 = game.choices[p0.id];
  const c1 = game.choices[p1.id];

  const events = [];

  function applyDamage(target, dmg, reason) {
    const prev = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    target.lastDamage = dmg;
    events.push(`${target.nick} takes ${dmg} damage (${reason}). HP ${prev} -> ${target.hp}`);
  }

  // compute choices (null if not chosen or stunned)
  const choice0 = (CHOICES.includes(c0) && !p0.stunned) ? c0 : null;
  const choice1 = (CHOICES.includes(c1) && !p1.stunned) ? c1 : null;

  // logic: as you requested
  if (!choice0 && !choice1) {
    applyDamage(p0, rollDice(), "no choice (both)");
    applyDamage(p1, rollDice(), "no choice (both)");
  } else if (choice0 && !choice1) {
    applyDamage(p1, rollDice(), `no choice vs ${choice0}`);
  } else if (!choice0 && choice1) {
    applyDamage(p0, rollDice(), `no choice vs ${choice1}`);
  } else if (choice0 === choice1) {
    // same choice -> no damage
    events.push(`Both chose ${choice0}. No damage.`);
  } else if (BEATS[choice0] === choice1) {
    const dmg = rollDice();
    applyDamage(p1, dmg, `${p0.nick} (${choice0}) beats ${choice1}`);
    if (dmg === 8) { p1.stunned = true; events.push(`${p1.nick} stunned by CRIT!`); }
  } else if (BEATS[choice1] === choice0) {
    const dmg = rollDice();
    applyDamage(p0, dmg, `${p1.nick} (${choice1}) beats ${choice0}`);
    if (dmg === 8) { p0.stunned = true; events.push(`${p0.nick} stunned by CRIT!`); }
  } else {
    // fallback (should not happen)
    applyDamage(p0, rollDice(), "fallback");
    applyDamage(p1, rollDice(), "fallback");
  }

  // send results to each player **after** 3s results-phase (clients will show dice & choices then)
  setTimeout(() => {
    // send personalized update: 'me' and 'opp'
    for (const p of game.players) {
      const me = game.players.find(x => x.id === p.id);
      const opp = game.players.find(x => x.id !== p.id);
      io.to(p.id).emit("1vs1Update", gameId, {
        me: { ...me, choice: game.choices[me.id] ?? null },
        opp: { ...opp, choice: game.choices[opp.id] ?? null }
      });
    }

    // emit events/logs now (only at reveal)
    events.forEach(e => io.to(gameId).emit("log", e));

    // persist last game so chat still works after end
    if (p0.hp <= 0 && p1.hp <= 0) {
      // draw
      game.players.forEach(p => lastGames[p.id] = game);
      io.to(gameId).emit("gameOver", gameId, { winnerNick: null, winnerChar: null, draw: true });
      delete games[gameId];
      return;
    } else if (p0.hp <= 0 || p1.hp <= 0) {
      const winner = p0.hp > 0 ? p0 : p1;
      game.players.forEach(p => lastGames[p.id] = game);
      // send personalized gameOver so each client sees winner
      for (const p of game.players) {
        io.to(p.id).emit("gameOver", gameId, { winnerNick: winner.nick, winnerChar: winner.char });
      }
      delete games[gameId];
      return;
    } else {
      // prepare next round (server handles the timing)
      // clear choices for next round
      game.choices = { [p0.id]: null, [p1.id]: null };
      startRound1vs1(gameId);
    }
  }, 0); // already waited 3s before calling evaluateRound; results-phase is immediate here
}

// ---------------- SOCKET ----------------
io.on("connection", socket => {
  // broadcast online count
  io.emit("onlineCount", io.engine.clientsCount);

  // set nickname (optional)
  socket.on("setNickname", nick => {
    socket.nick = nick;
    socket.emit("nickConfirmed", nick);
  });

  // join 1vs1 request
  socket.on("join1vs1", ({ nick, char }) => {
    // assign
    socket.nick = nick || socket.nick || `Anon-${socket.id.slice(0,4)}`;
    socket.char = char || socket.char || "unknown";

    // avoid client double-joining same socket
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      socket.emit("waiting", "Waiting for opponent...");
      return;
    }

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      // create game id without '#'
      const gameId = `${waitingPlayer.id}_${socket.id}`;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, lastDamage: 0, choice: null },
        { id: socket.id, nick: socket.nick, char: socket.char, hp: 80, stunned: false, lastDamage: 0, choice: null }
      ];
      games[gameId] = { id: gameId, players };

      // join game room for both sockets
      players.forEach(p => {
        const s = io.sockets.sockets.get(p.id);
        if (s) s.join(gameId);
      });

      // send personalized gameStart to each player (so each client knows which one is "me")
      for (const p of players) {
        const me = players.find(x => x.id === p.id);
        const opp = players.find(x => x.id !== p.id);
        io.to(p.id).emit("gameStart", gameId, { me: me, opp: opp });
      }

      // start first round
      startRound1vs1(gameId);
      waitingPlayer = null;
    }
  });

  // player choice
  socket.on("selectChoice", ({ gameId, choice }) => {
    const game = games[gameId];
    if (!game || !CHOICES.includes(choice)) return;
    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.stunned) return;

    // accept only if not already chosen
    if (!player.choice) {
      player.choice = choice;
      game.choices[socket.id] = choice;

      // Only tell the chooser that they chose — do NOT broadcast to room (no cheating)
      socket.emit("choiceAck", { choice });
      // Do NOT send opponent choice here.
    }
  });

  // chat
  socket.on("chatMessage", data => {
    const { roomId, text } = data || {};
    // try to send to game players if valid
    let game = Object.values(games).find(g => g.id === roomId) || lastGames[roomId];
    if (game) {
      game.players.forEach(p => io.to(p.id).emit("chatMessage", { nick: socket.nick, text, roomId }));
    } else {
      // fallback: broadcast globally
      io.emit("chatMessage", { nick: socket.nick || "Anon", text, roomId: "global" });
    }
  });

  socket.on("disconnect", () => {
    io.emit("onlineCount", io.engine.clientsCount);

    if (waitingPlayer?.id === socket.id) waitingPlayer = null;

    // if was in a game, declare opponent winner
    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        // persist lastGame for other
        lastGames[other.id] = game;
        io.to(other.id).emit("gameOver", gameId, { winnerNick: other.nick, winnerChar: other.char });
        clearTimeout(game.roundTimeout);
        delete games[gameId];
        break;
      }
    }
  });
});



// ------------------- TOURNAMENT NAMESPACE -------------------
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
  t.matches[matchId] = { id: matchId, players, stage };

  nsp.to(tId).emit("startMatch", { id: matchId, player1: players[0], player2: players[1], stage });
  nsp.to(tId).emit("updateMatch", { id: matchId, stage, player1: players[0], player2: players[1] });
  setTimeout(() => startTournamentRound(tId, matchId), 1000);
}

function startTournamentRound(tId, matchId) {
  const t = tournaments[tId];
  const match = t?.matches[matchId];
  if (!match) return;
  match.choices = { [match.players[0].id]: null, [match.players[1].id]: null };
  match.roundTimer = 10;
  nsp.to(tId).emit("roundStart", { matchId, timer: match.roundTimer });
  match.roundTimeout && clearTimeout(match.roundTimeout);
  match.roundTimeout = setTimeout(() => evaluateTournamentRound(tId, matchId), match.roundTimer*1000);
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
  else if (BEATS[choice0] === choice1) { const dmg=rollDice(); applyDamage(p1,dmg,`${p0.nick} beats ${choice1}`); if(dmg===8){p1.stunned=true;nsp.to(tId).emit("log",`${p1.nick} stunned by CRIT!`);} }
  else if (BEATS[choice1] === choice0) { const dmg=rollDice(); applyDamage(p0,dmg,`${p1.nick} beats ${choice0}`); if(dmg===8){p0.stunned=true;nsp.to(tId).emit("log",`${p0.nick} stunned by CRIT!`);} }
  else { applyDamage(p0,rollDice(),"fallback"); applyDamage(p1,rollDice(),"fallback"); }

  nsp.to(tId).emit("updateMatch", { id: match.id, stage: match.stage, player1: p0, player2: p1 });

  if (p0.hp <=0 || p1.hp<=0) { const winner=p0.hp>0?p0:p1; nsp.to(tId).emit("matchOver",{winnerNick:winner.nick,winnerChar:winner.char,stage:match.stage,player1:p0,player2:p1}); advanceWinner(tId,match.id,winner); return; }

  setTimeout(()=>startTournamentRound(tId,match.id),1000);
}

// ------------------- TOURNAMENT SOCKET -------------------
nsp.on("connection", socket => {
  nsp.emit("onlineCount", nsp.sockets.size);
  let currentTournament=null;

  socket.on("setNickname", nick => { socket.nick = assignUniqueNick(nick); socket.emit("nickConfirmed", socket.nick); });

  socket.on("joinTournament", ({ nick,char }) => {
    if(!nick||!char) return;
    socket.nick = assignUniqueNick(nick);
    let tId=Object.keys(tournaments).find(id=>tournaments[id].waiting.length<8);
    if(!tId) tId=createTournament();
    currentTournament=tId;
    const t=tournaments[tId];
    if(t.waiting.find(p=>p.id===socket.id)) return;
    t.waiting.push({id:socket.id,nick:socket.nick,char});
    socket.join(tId);
    broadcastWaiting(tId);

    if(t.waiting.length===8 && t.bracket.length===0){
      const first8=t.waiting.slice(0,8);
      nsp.to(tId).emit("waitingStart",{players:first8.map(p=>p.nick),total:8});
      generateBracket(first8,t);
      t.bracket.filter(m=>m.stage==="quarter").forEach(m=>startMatch(tId,m.player1,m.player2,m.stage,m.id));
    }
  });

  socket.on("selectChoiceTournament",({tournamentId,matchId,choice})=>{
    const t=tournaments[tournamentId];
    if(!t) return;
    const match=t.matches[matchId];
    if(!match||!CHOICES.includes(choice)) return;
    if(match.choices && match.choices[socket.id]==null && match.players.find(p=>p.id===socket.id&&!p.stunned)){
      match.choices[socket.id]=choice;
      nsp.to(tournamentId).emit("log",`${socket.nick} chose ${choice}`);
    }
  });

  socket.on("chatMessage", text => {
    const tId=currentTournament;
    if(!tId) return;
    nsp.to(tId).emit("chatMessage",{nick:socket.nick||"Anon",text});
  });

  socket.on("disconnect", () => {
    releaseNick(socket.nick);
    const tId=currentTournament;
    if(!tId) return;
    const t=tournaments[tId];
    if(!t) return;
    t.waiting=t.waiting.filter(p=>p.id!==socket.id);
    for(const matchId in t.matches){
      const match=t.matches[matchId];
      const idx=match.players.findIndex(p=>p.id===socket.id);
      if(idx!==-1){
        const other=match.players.find(p=>p.id!==socket.id);
        nsp.to(tId).emit("matchOver",{winnerNick:other.nick,winnerChar:other.char,stage:match.stage,player1:match.players[0],player2:match.players[1]});
        advanceWinner(tId,match.id,other);
        break;
      }
    }
    broadcastWaiting(tId);
    emitBracket(tId);
    nsp.emit("onlineCount", nsp.sockets.size);
  });
});

// ---------- SERVER ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));