import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io();

// ---------- ELEMENTI BASE ----------
const player1Box = document.getElementById("player1");
const player2Box = document.getElementById("player2");
const player1Name = document.getElementById("player1-nick");
const player2Name = document.getElementById("player2-nick");
const player1HpBar = document.getElementById("player1-hp");
const player2HpBar = document.getElementById("player2-hp");
const player1CharImg = document.getElementById("player1-char");
const player2CharImg = document.getElementById("player2-char");
const diceP1 = document.getElementById("dice-p1");
const diceP2 = document.getElementById("dice-p2");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const onlineCountDisplay = document.getElementById("onlineCount");
const homeBtn = document.getElementById("homeBtn"); // si abbina al tuo HTML

homeBtn.addEventListener("click", () => window.location.href = "/");

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;

let winnerMusic = new Audio();
winnerMusic.loop = true;
winnerMusic.volume = 0.7;

function unlockAudio() {
  if (musicBattle.paused) musicBattle.play().catch(()=>{});
  if (winnerMusic.paused) winnerMusic.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");
fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- GIOCATORE ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if (nick && char) socket.emit("join1vs1", { nick, char });

// ---------- STATO ----------
let currentGame = null;
let timer = 10;
let countdownInterval = null;
let roundFinished = false;
// localSide: server sends to each client a payload where `player1` is that client.
// We'll assume the client maps server's player1 => local player DOM (player1).
let localSide = "p1";

// ---------- TIMER CENTRALE ----------
const timerContainer = document.createElement("div");
timerContainer.id = "timer-container";
timerContainer.textContent = timer;
document.getElementById("battle-area").appendChild(timerContainer);

// ---------- PULSANTI ELEMENTI ----------
function createChoiceButtons(playerBox, playerId) {
  const container = document.createElement("div");
  container.className = "choice-buttons";
  container.id = `choice-buttons-${playerId}`;
  container.innerHTML = `
    <button class="choice-btn water">💧</button>
    <button class="choice-btn wood">🪵</button>
    <button class="choice-btn fire">🔥</button>
  `;
  playerBox.appendChild(container);
  return {
    water: container.querySelector(".water"),
    wood: container.querySelector(".wood"),
    fire: container.querySelector(".fire")
  };
}

const buttonsMap = {
  p1: createChoiceButtons(player1Box, "p1"),
  p2: createChoiceButtons(player2Box, "p2")
};

// ---------- CLICK PULSANTI ----------
// IMPORTANT: only allow local player (mapped as player1 by server) to actually send choices.
// Buttons for opponent remain but are disabled for local client.
Object.entries(buttonsMap).forEach(([player, btns]) => {
  Object.entries(btns).forEach(([choice, btn]) => {
    btn.addEventListener("click", () => {
      if (roundFinished || stunnedMe()) return;
      // Only allow sending if this button belongs to localSide
      if (player !== localSide) return;
      sendChoice(choice);
      disableButtons(player);
    });
  });
});

function stunnedMe() {
  if (!currentGame) return false;
  // server sets `player1` to the client that receives gameStart, so this mapping is safe:
  return nick === currentGame.player1.nick ? !!currentGame.player1.stunned : !!currentGame.player2.stunned;
}

function sendChoice(choice) {
  if (!currentGame) return;
  socket.emit("selectChoice", { gameId: currentGame.id, choice });
  addEventMessageSingle("you", `You chose ${choice.toUpperCase()}`);
}

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => { onlineCountDisplay.textContent = `Online: ${count}`; });

// messaggi di sistema
socket.on("waiting", msg => addEventMessageSingle("system", msg));
socket.on("log", msg => addEventMessageSingle("system", msg));

// partita iniziata
socket.on("gameStart", (gameId, game) => {
  // server sends for each client: player1 = that client, player2 = opponent
  currentGame = game;
  localSide = "p1";
  timer = 10;
  roundFinished = false;
  startTurn();
  updateGame(game, false);
});

// inizio round (server stabilisce durata scelta: tipicamente 10s)
socket.on("roundStart", ({ gameId, timer: t }) => {
  timer = t;
  roundFinished = false;
  timerContainer.textContent = timer;
  startTurn();
  updateGame(currentGame, false);
});

// aggiornamento risultati: il server invia qui anche 'choice' e 'lastDamage' dentro i player
socket.on("1vs1Update", (gameId, gameWithRolls) => {
  currentGame = gameWithRolls;
  roundFinished = true;
  // mostrare risultati (scelte + danni) — server invia scelte e lastDamage
  updateGame(gameWithRolls, true);
});

// partita finita
socket.on("gameOver", (gameId, { winnerNick, winnerChar, draw }) => {
  if (draw) {
    addEventMessageWinner(`🤝 Draw! Both players have fallen.`);
  } else {
    addEventMessageWinner(`🏆 ${winnerNick} has won the battle!`);
    playWinnerMusic(winnerChar);
  }
  stopTimer();
  // keep currentGame so chat still works (server should accept roomId fallback)
  disableButtons("p1");
  disableButtons("p2");
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim() !== "") {
    // send roomId = currentGame.id when available, otherwise fallback to socket.id (helps server find lastGames)
    const roomId = currentGame?.id || socket.id;
    socket.emit("chatMessage", { roomId, text: e.target.value, playerId: socket.id });
    e.target.value = "";
  }
});

socket.on("chatMessage", data => {
  // show all chat messages for our room (server emits only relevant ones)
  // don't require currentGame to exist, server may send messages after game end
  addChatMessage(`${data.nick}: ${data.text}`);
});

// ---------- AGGIORNAMENTO GAME ----------
function updateGame(game, revealChoices) {
  const maxHp = 80;
  const hp1 = Math.min(game.player1.hp ?? 0, maxHp);
  const hp2 = Math.min(game.player2.hp ?? 0, maxHp);

  player1Name.textContent = `${game.player1.nick} (${game.player1.char}) HP: ${hp1}/${maxHp}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.char}) HP: ${hp2}/${maxHp}`;
  player1HpBar.style.width = `${(hp1 / maxHp) * 100}%`;
  player2HpBar.style.width = `${(hp2 / maxHp) * 100}%`;
  player1HpBar.style.background = getHpColor((hp1 / maxHp) * 100);
  player2HpBar.style.background = getHpColor((hp2 / maxHp) * 100);

  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);

  if (revealChoices) {
    // MOSTRO risultati: dadi con valore lastDamage e scrivo evento scelte (solo qui)
    rollDiceAnimation(diceP1, game.player1.lastDamage || 1);
    rollDiceAnimation(diceP2, game.player2.lastDamage || 1);

    // show choices in event box (server will log damages/stuns separately)
    const choice1 = game.player1.choice ? game.player1.choice.toUpperCase() : "NONE";
    const choice2 = game.player2.choice ? game.player2.choice.toUpperCase() : "NONE";
    addEventMessageSingle("result", `${game.player1.nick} chose: ${choice1}`);
    addEventMessageSingle("result", `${game.player2.nick} chose: ${choice2}`);

    // during reveal phase buttons must stay disabled
    disableButtons("p1");
    disableButtons("p2");
  } else {
    // fase scelta: dadi neutri e solo il player locale può cliccare
    rollDiceAnimation(diceP1, 1);
    rollDiceAnimation(diceP2, 1);

    // enable only local player's buttons (server maps local to player1)
    if (localSide === "p1") {
      enableButtons("p1");
      disableButtons("p2");
    } else {
      enableButtons("p2");
      disableButtons("p1");
    }
  }
}

// ---------- SUPPORTO ----------
function getHpColor(percent) {
  if (percent > 60) return "linear-gradient(90deg, green, lime)";
  if (percent > 30) return "linear-gradient(90deg, yellow, orange)";
  return "linear-gradient(90deg, red, darkred)";
}

function updateCharacterImage(player, index) {
  let hp = Math.min(player.hp ?? 0, 80);
  let src = `img/${player.char}`;
  if (hp <= 0) src += '0';
  else if (hp <= 20) src += '20';
  else if (hp <= 40) src += '40';
  else if (hp <= 60) src += '60';
  src += '.png';
  if (index === 0) player1CharImg.src = src;
  else player2CharImg.src = src;
}

function rollDiceAnimation(el, finalRoll) {
  let count = 0;
  const interval = setInterval(() => {
    count++;
    el.src = `img/dice${Math.ceil(Math.random() * 6)}.png`;
    if (count >= 10) {
      clearInterval(interval);
      el.src = `img/dice${finalRoll}.png`;
    }
  }, 50);
}

// ---------- TURNI ----------
function startTurn() {
  roundFinished = false;
  timer = 10;
  timerContainer.textContent = timer;

  // enable only local player's buttons (server always maps client as player1 in gameStart)
  if (localSide === "p1") {
    enableButtons("p1");
    disableButtons("p2");
  } else {
    enableButtons("p2");
    disableButtons("p1");
  }

  stopTimer();
  countdownInterval = setInterval(() => {
    timer--;
    timerContainer.textContent = timer;
    if (timer <= 0) {
      stopTimer();
      // do nothing special here — server will evaluate after timer + reveal delay
    }
  }, 1000);
}

// ---------- TIMER STOP ----------
function stopTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

// ---------- PULSANTI ----------
function enableButtons(player) {
  const btns = buttonsMap[player];
  if (!btns) return;
  // Only enable if this is the local player's side
  if (player !== localSide) {
    Object.values(btns).forEach(b => { b.disabled = true; b.classList.add("disabled"); });
    return;
  }
  Object.values(btns).forEach(btn => { btn.disabled = false; btn.classList.remove("disabled"); });
  const el = document.getElementById(`choice-buttons-${player}`);
  if (el) el.classList.add("active");
}

function disableButtons(player) {
  const btns = buttonsMap[player];
  if (!btns) return;
  Object.values(btns).forEach(btn => { btn.disabled = true; btn.classList.add("disabled"); });
  const el = document.getElementById(`choice-buttons-${player}`);
  if (el) el.classList.remove("active");
}

// ---------- EVENTI ----------
function addEventMessageSingle(playerNick, text) {
  const msg = document.createElement("div");
  msg.textContent = `[${playerNick}] ${text}`;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

function addEventMessageWinner(text) {
  const msg = document.createElement("div");
  msg.textContent = text;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

// ---------- CHAT ----------
function addChatMessage(text) {
  const msg = document.createElement("div");
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------- MUSICA VINCITORE ----------
function playWinnerMusic(winnerChar) {
  musicBattle.pause();
  musicBattle.currentTime = 0;
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

// ---------- PING PRESENZA ----------
setInterval(() => {
  socket.emit("stillHere");
}, 5000);

document.body.style.overflowY = "auto";