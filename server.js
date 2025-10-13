// server.js (AGGIORNATO: supporto scelte a round per 1vs1 e torneo)
// ... (mantieni le parti iniziali identiche) ...
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.get("/1vs1.html", (req, res) => res.sendFile(new URL("public/1vs1.html", import.meta.url).pathname));
app.get("/tour.html", (req, res) => res.sendFile(new URL("public/tour.html", import.meta.url).pathname));
app.get("/", (req, res) => res.send("Fight server attivo!"));

// UTILS
const rollDice = () => Math.floor(Math.random() * 8) + 1;

const usedNicks = new Map();
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
const games = {};          // gameId -> game
let waitingPlayer = null;
const lastGames = {};

// choices possible
const CHOICES = ["water","wood","fire"];
// beats map: key beats value
const BEATS = { water: "fire", wood: "water", fire: "wood" };

function startRound1vs1(gameId) {
  const game = games[gameId];
  if (!game) return;

  // prepare choices slot and timer
  game.choices = { [game.players[0].id]: null, [game.players[1].id]: null };
  // if player stunned, we mark they cannot choose (handled in evaluation)
  game.roundTimer = 10; // seconds

  // notify both clients round started + timer and state
  io.to(gameId).emit("roundStart", { gameId, timer: game.roundTimer, players: game.players.map(p => ({ id:p.id, nick:p.nick })) });

  // countdown and evaluate after 10s
  game.roundTimeout && clearTimeout(game.roundTimeout);
  game.roundTimeout = setTimeout(() => {
    evaluateRound1vs1(gameId);
  }, game.roundTimer * 1000);
}

function evaluateRound1vs1(gameId) {
  const game = games[gameId];
  if (!game) return;
  const p0 = game.players[0];
  const p1 = game.players[1];
  const c0 = game.choices[p0.id]; // maybe null
  const c1 = game.choices[p1.id];

  // Helper to apply damage and send update/log
  function applyDamage(targetPlayer, dmg, reason) {
    const prevHp = targetPlayer.hp;
    targetPlayer.hp = Math.max(0, targetPlayer.hp - dmg);
    io.to(gameId).emit("log", `${targetPlayer.nick} takes ${dmg} damage (${reason}). HP ${prevHp} -> ${targetPlayer.hp}`);
    // mark dice/dmg for clients (so they can show dice image)
    targetPlayer.lastDamage = dmg;
  }

  // Evaluate stunned: if player.stunned true => cannot choose this round (treated as no-choice)
  const p0CannotChoose = !!p0.stunned;
  const p1CannotChoose = !!p1.stunned;

  // If stunned, consume stun now (they miss this round)
  if (p0CannotChoose) p0.stunned = false;
  if (p1CannotChoose) p1.stunned = false;

  // Normalize choices: ensure valid or null
  const choice0 = (CHOICES.includes(c0) && !p0CannotChoose) ? c0 : null;
  const choice1 = (CHOICES.includes(c1) && !p1CannotChoose) ? c1 : null;

  // CASES
  if (!choice0 && !choice1) {
    // both didn't choose -> both take 1d8
    const d0 = rollDice();
    const d1 = rollDice();
    applyDamage(p0, d0, "no choice (both)");
    applyDamage(p1, d1, "no choice (both)");
  } else if (choice0 && !choice1) {
    // p1 didn't choose -> p1 takes 1d8
    const d = rollDice();
    applyDamage(p1, d, `no choice (vs ${choice0})`);
  } else if (!choice0 && choice1) {
    const d = rollDice();
    applyDamage(p0, d, `no choice (vs ${choice1})`);
  } else {
    // both chose something
    if (choice0 === choice1) {
      // same choice -> both take 1d8
      const d0 = rollDice();
      const d1 = rollDice();
      applyDamage(p0, d0, "same choice");
      applyDamage(p1, d1, "same choice");
    } else {
      // check winner via BEATS
      if (BEATS[choice0] === choice1) {
        // p0 beats p1
        const dmg = rollDice();
        applyDamage(p1, dmg, `${p0.nick} (${choice0}) beats ${choice1}`);
        // if crit (8) => p1 stunned next round
        if (dmg === 8) {
          p1.stunned = true;
          io.to(gameId).emit("log", `${p1.nick} is stunned by CRIT! Will miss next round.`);
        }
      } else if (BEATS[choice1] === choice0) {
        // p1 beats p0
        const dmg = rollDice();
        applyDamage(p0, dmg, `${p1.nick} (${choice1}) beats ${choice0}`);
        if (dmg === 8) {
          p0.stunned = true;
          io.to(gameId).emit("log", `${p0.nick} is stunned by CRIT! Will miss next round.`);
        }
      } else {
        // defensive fallback (shouldn't happen) -> both take 1d8
        const d0 = rollDice();
        const d1 = rollDice();
        applyDamage(p0, d0, "fallback");
        applyDamage(p1, d1, "fallback");
      }
    }
  }

  // send update to players (both get updated players)
  io.to(gameId).emit("1vs1Update", gameId, { player1: game.players[0], player2: game.players[1] });

  // check victory
  if (p0.hp <= 0 || p1.hp <= 0) {
    const winner = p0.hp > 0 ? p0 : p1;
    for (const p of game.players) {
      io.to(p.id).emit("gameOver", gameId, { winnerNick: winner.nick, winnerChar: winner.char });
      lastGames[p.id] = game;
    }
    // cleanup
    clearTimeout(game.roundTimeout);
    delete games[gameId];
    return;
  }

  // prepare next round after short delay (1s)
  setTimeout(() => startRound1vs1(gameId), 1000);
}

// socket handlers for players selecting choice (1vs1)
io.on("connection", socket => {
  // online count
  io.emit("onlineCount", io.engine.clientsCount);

  // setNickname handler (same as before)
  socket.on("setNickname", nick => {
    const finalNick = assignUniqueNick(nick);
    socket.nick = finalNick;
    socket.emit("nickConfirmed", finalNick);
  });

  socket.on("join1vs1", ({ nick, char }) => {
    socket.nick = assignUniqueNick(nick);
    socket.char = char;

    if (!waitingPlayer) {
      waitingPlayer = socket;
      socket.emit("waiting", "Waiting for opponent...");
    } else {
      const gameId = socket.id + "#" + waitingPlayer.id;
      const players = [
        { id: waitingPlayer.id, nick: waitingPlayer.nick, char: waitingPlayer.char, hp: 80, stunned: false, lastDamage: 0 },
        { id: socket.id, nick: socket.nick, char, hp: 80, stunned: false, lastDamage: 0 }
      ];
      games[gameId] = { id: gameId, players };

      for (const p of players) {
        io.sockets.sockets.get(p.id)?.join(gameId);
        const opp = players.find(pl => pl.id !== p.id);
        // send initial game start state
        io.to(p.id).emit("gameStart", gameId, { player1: p, player2: opp });
      }

      // start first round
      setTimeout(() => startRound1vs1(gameId), 1000);
      waitingPlayer = null;
    }
  });

  // Player sends their choice in 1vs1
  // payload: { gameId, choice } where choice is 'water'|'wood'|'fire'
  socket.on("selectChoice", ({ gameId, choice }) => {
    const game = games[gameId];
    if (!game) return;
    if (!CHOICES.includes(choice)) return;
    // only accept choice if player in game and hasn't been set and wasn't stunned
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    // if player was stunned at the start of round (we flagged and it's been cleared only on evaluate), ignore set
    // we check location in game.choices: if round not started, ignore
    if (!game.choices) return;
    // only set if not already set
    if (game.choices[socket.id] == null) {
      // If they were stunned we should have marked inability earlier (we store stunned on player property)
      if (player.stunned) {
        // cannot choose this round; ignore
        return;
      }
      game.choices[socket.id] = choice;
      // optional feedback
      io.to(gameId).emit("log", `${player.nick} chose ${choice}`);
      // immediate update to other player that choice arrived (no sensitive reveal)
      // no revealing opponent choice
    }
  });

  // chatMessage existing handler (unchanged)
  socket.on("chatMessage", data => {
    const { roomId, text } = data;
    let game = Object.values(games).find(g => g.id === roomId);
    if (!game) game = lastGames[roomId];
    if (!game) return;

    for (const p of game.players) {
      io.to(p.id).emit("chatMessage", { nick: socket.nick, text, roomId });
    }
  });

  // disconnect handling (unchanged logic but ensure waitingPlayer cleared)
  socket.on("disconnect", () => {
    releaseNick(socket.nick);
    io.emit("onlineCount", io.engine.clientsCount);

    if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;

    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const other = game.players.find(p => p.id !== socket.id);
        io.to(other.id).emit("gameOver", gameId, { winnerNick: other.nick, winnerChar: other.char });
        lastGames[other.id] = game;
        // cleanup
        clearTimeout(game.roundTimeout);
        delete games[gameId];
        break;
      }
    }
  });
});

// ------------------- TOURNAMENT MODE (aggiornato per usare round-based choices) -------------------
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

// For tournament we reuse same round/evaluate logic but adapted for namespace
function startTournamentRound(tId, matchId) {
  const t = tournaments[tId];
  if (!t) return;
  const match = t.matches[matchId];
  if (!match) return;

  // set choices map and timer
  match.choices = { [match.players[0].id]: null, [match.players[1].id]: null };
  match.roundTimer = 10;
  nsp.to(tId).emit("roundStart", { matchId: match.id, timer: match.roundTimer });

  match.roundTimeout && clearTimeout(match.roundTimeout);
  match.roundTimeout = setTimeout(() => evaluateTournamentRound(tId, matchId), match.roundTimer * 1000);
}
function evaluateTournamentRound(tId, matchId) {
  const t = tournaments[tId];
  if (!t) return;
  const match = t.matches[matchId];
  if (!match) return;
  const p0 = match.players[0];
  const p1 = match.players[1];
  const c0 = match.choices[p0.id];
  const c1 = match.choices[p1.id];

  function applyDamage(target, dmg, reason) {
    const prev = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    nsp.to(tId).emit("log", `${target.nick} takes ${dmg} damage (${reason}). HP ${prev} -> ${target.hp}`);
    target.lastDamage = dmg;
  }

  const p0CannotChoose = !!p0.stunned;
  const p1CannotChoose = !!p1.stunned;
  if (p0CannotChoose) p0.stunned = false;
  if (p1CannotChoose) p1.stunned = false;

  const choice0 = (CHOICES.includes(c0) && !p0CannotChoose) ? c0 : null;
  const choice1 = (CHOICES.includes(c1) && !p1CannotChoose) ? c1 : null;

  if (!choice0 && !choice1) {
    const d0 = rollDice();
    const d1 = rollDice();
    applyDamage(p0, d0, "no choice (both)");
    applyDamage(p1, d1, "no choice (both)");
  } else if (choice0 && !choice1) {
    const d = rollDice();
    applyDamage(p1, d, `no choice (vs ${choice0})`);
  } else if (!choice0 && choice1) {
    const d = rollDice();
    applyDamage(p0, d, `no choice (vs ${choice1})`);
  } else {
    if (choice0 === choice1) {
      const d0 = rollDice();
      const d1 = rollDice();
      applyDamage(p0, d0, "same choice");
      applyDamage(p1, d1, "same choice");
    } else {
      if (BEATS[choice0] === choice1) {
        const dmg = rollDice();
        applyDamage(p1, dmg, `${p0.nick} (${choice0}) beats ${choice1}`);
        if (dmg === 8) { p1.stunned = true; nsp.to(tId).emit("log", `${p1.nick} stunned by CRIT!`); }
      } else if (BEATS[choice1] === choice0) {
        const dmg = rollDice();
        applyDamage(p0, dmg, `${p1.nick} (${choice1}) beats ${choice0}`);
        if (dmg === 8) { p0.stunned = true; nsp.to(tId).emit("log", `${p0.nick} stunned by CRIT!`); }
      } else {
        const d0 = rollDice();
        const d1 = rollDice();
        applyDamage(p0, d0, "fallback");
        applyDamage(p1, d1, "fallback");
      }
    }
  }

  // emit updateMatch for clients
  nsp.to(tId).emit("updateMatch", {
    id: match.id,
    stage: match.stage,
    player1: match.players[0],
    player2: match.players[1]
  });

  // check winner
  if (p0.hp <= 0 || p1.hp <= 0) {
    const winner = p0.hp > 0 ? p0 : p1;
    nsp.to(tId).emit("matchOver", {
      winnerNick: winner.nick,
      winnerChar: winner.char,
      stage: match.stage,
      player1: match.players[0],
      player2: match.players[1]
    });
    advanceWinner(tId, match.id, winner);
    return;
  }

  // next round after short delay
  setTimeout(() => startTournamentRound(tId, match.id), 1000);
}

// modify startMatch for tournament to initialize (we already emitted updateMatch earlier)
function startMatch(tournamentId, p1, p2, stage, matchId) {
  const t = tournaments[tournamentId];
  if (!t || !p1 || !p2) return;

  // placeholders if necessary
  p1 = p1 || { nick:"??", char:"unknown", id:null };
  p2 = p2 || { nick:"??", char:"unknown", id:null };

  const players = [
    { ...p1, hp: 80, stunned: false, roll: 1, dmg: 0 },
    { ...p2, hp: 80, stunned: false, roll: 1, dmg: 0 }
  ];
  const match = { id: matchId, players, stage };
  t.matches[matchId] = match;

  nsp.to(tournamentId).emit("startTournament", Object.values(t.matches));
  nsp.to(tournamentId).emit("startMatch", { id: match.id, player1: players[0], player2: players[1], stage });

  // force an initial update so clients show HP/dice immediately
  nsp.to(tournamentId).emit("updateMatch", {
    id: match.id,
    stage: match.stage,
    player1: match.players[0],
    player2: match.players[1]
  });

  // start round-based flow
  setTimeout(() => startTournamentRound(tournamentId, match.id), 1000);
}

// Tournament namespace handlers
nsp.on("connection", socket => {
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

  // tournament clients send choices via 'selectChoiceTournament'
  // payload: { tournamentId, matchId, choice }
  socket.on("selectChoiceTournament", ({ tournamentId, matchId, choice }) => {
    const t = tournaments[tournamentId];
    if (!t) return;
    const match = t.matches[matchId];
    if (!match) return;
    if (!CHOICES.includes(choice)) return;
    // only set if not already set and if player is in match
    if (match.choices && match.choices[socket.id] == null && match.players.find(p => p.id === socket.id && !p.stunned)) {
      match.choices[socket.id] = choice;
      nsp.to(tournamentId).emit("log", `${socket.nick} chose ${choice}`);
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
    nsp.emit("onlineCount", nsp.sockets.size);
  });
});

// Start server
httpServer.listen(PORT, () => console.log(`Server attivo su http://localhost:${PORT}`));