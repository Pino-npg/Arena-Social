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
const homeBtn = document.getElementById("homeBtn");

homeBtn.addEventListener("click", () => {
  window.location.href = "https://fight-game-server.onrender.com/";
});

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
socket.emit("join1vs1", { nick, char }, roomId => {
  socket.roomId = roomId;
});

// ---------- STATO ----------
let stunned = { p1: false, p2: false };
let isMyTurn = false;
let timer = 10;
let countdownInterval = null;
let currentGame = null;

// ---------- TIMER CENTRALE ----------
const timerContainer = document.createElement("div");
timerContainer.id = "timer-container";
timerContainer.textContent = "10";
document.getElementById("battle-area").appendChild(timerContainer);

// ---------- PULSANTI ELEMENTI DENTRO PLAYER ----------
function createChoiceButtons(playerBox, playerId) {
  const container = document.createElement("div");
  container.className = "choice-buttons";
  container.id = `choice-buttons-${playerId}`;
  container.innerHTML = `
    <button class="choice-btn water">💧</button>
    <button class="choice-btn wood">🌿</button>
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
Object.entries(buttonsMap).forEach(([player, btns]) => {
  Object.entries(btns).forEach(([choice, btn]) => {
    btn.addEventListener("click", () => {
      if (!isMyTurn || stunnedMe()) return;
      sendChoice(choice);
      disableButtons(player);
    });
  });
});

function stunnedMe() {
  return nick === currentGame?.player1?.nick ? stunned.p1 : stunned.p2;
}

function sendChoice(choice) {
  if (!socket.roomId) return;
  socket.emit("playerChoice", { roomId: socket.roomId, choice });
  addEventMessageSingle(nick, `You chose ${choice.toUpperCase()}`);
}

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => onlineCountDisplay.textContent = `Online: ${count}`);
socket.on("waiting", msg => addEventMessageSingle("system", msg));

socket.on("gameStart", (roomId, game) => {
  socket.roomId = roomId;
  currentGame = game;
  updateGame(game);
});

socket.on("1vs1Update", (roomId, game) => {
  if (roomId === socket.roomId) {
    currentGame = game;
    updateGame(game);
  }
});

socket.on("gameOver", (roomId, { winnerNick, winnerChar }) => {
  if (roomId === socket.roomId) {
    addEventMessageWinner(`🏆 ${winnerNick} has won the battle!`);
    playWinnerMusic(winnerChar);
    stopTimer();
    disableButtons("p1");
    disableButtons("p2");
  }
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.value.trim() !== "" && socket.roomId) {
    socket.emit("chatMessage", { roomId: socket.roomId, text: e.target.value });
    e.target.value = "";
  }
});

socket.on("chatMessage", data => {
  if (data.roomId === socket.roomId) addChatMessage(`${data.nick}: ${data.text}`);
});

// ---------- AGGIORNAMENTO GAME ----------
function updateGame(game) {
  const maxHp = 80;
  const hp1 = Math.min(game.player1.hp, maxHp);
  const hp2 = Math.min(game.player2.hp, maxHp);

  player1Name.textContent = `${game.player1.nick} (${game.player1.char}) HP: ${hp1}/${maxHp}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.char}) HP: ${hp2}/${maxHp}`;

  player1HpBar.style.width = `${(hp1 / maxHp) * 100}%`;
  player2HpBar.style.width = `${(hp2 / maxHp) * 100}%`;

  player1HpBar.style.background = getHpColor(hp1 / maxHp * 100);
  player2HpBar.style.background = getHpColor(hp2 / maxHp * 100);

  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);

  // Aggiorna dado animato
  rollDiceAnimation(diceP1, game.player1.roll ?? 1);
  rollDiceAnimation(diceP2, game.player2.roll ?? 1);

  // Eventi
  if(game.lastAction) addEventMessageSingle(game.lastAction.player, game.lastAction.text);

  handleTurn(game);
}

function getHpColor(percent) {
  if (percent > 60) return "linear-gradient(90deg, green, lime)";
  if (percent > 30) return "linear-gradient(90deg, yellow, orange)";
  return "linear-gradient(90deg, red, darkred)";
}

function updateCharacterImage(player,index){
  let hp = Math.min(player.hp, 80);
  let src = `img/${player.char}`;
  if(hp<=0) src+='0';
  else if(hp<=20) src+='20';
  else if(hp<=40) src+='40';
  else if(hp<=60) src+='60';
  src+='.png';
  if(index===0) player1CharImg.src=src;
  else player2CharImg.src=src;
}

// ---------- TURNI ----------
function handleTurn(game) {
  const myNick = nick;
  const turn = game.turn;
  const myIsP1 = (myNick === game.player1.nick);

  isMyTurn = (turn === myNick);
  
  if (isMyTurn && !stunnedMe()) {
    addEventMessageSingle("system", `Your turn! Choose element.`);
    enableButtons(myIsP1 ? "p1" : "p2");
    startTimer();
  } else {
    disableButtons("p1");
    disableButtons("p2");
    stopTimer();
  }
}

// ---------- TIMER ----------
function startTimer(seconds = 10) {
  timer = seconds;
  timerContainer.textContent = timer;
  stopTimer();
  countdownInterval = setInterval(() => {
    timer--;
    timerContainer.textContent = timer;
    if (timer <= 0) {
      stopTimer();
      disableButtons("p1");
      disableButtons("p2");
      socket.emit("playerTimeout", { roomId: socket.roomId });
    }
  }, 1000);
}

function stopTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

// ---------- ABILITAZIONE / DISABILITAZIONE PULSANTI ----------
function enableButtons(player) {
  const btns = buttonsMap[player];
  if(!btns) return;
  Object.values(btns).forEach(btn => {
    btn.disabled = false;
    btn.classList.remove("disabled");
  });
  document.getElementById(`choice-buttons-${player}`).classList.add("active");
}

function disableButtons(player) {
  if(player){
    const btns = buttonsMap[player];
    if(!btns) return;
    Object.values(btns).forEach(btn => {
      btn.disabled = true;
      btn.classList.add("disabled");
    });
    document.getElementById(`choice-buttons-${player}`).classList.remove("active");
  } else {
    // se non specificato disabilita entrambi
    disableButtons("p1");
    disableButtons("p2");
  }
}

// ---------- DADO ANIMATO ----------
function rollDiceAnimation(el, finalRoll) {
  let count = 0;
  const interval = setInterval(() => {
    count++;
    el.src = `img/dice${Math.ceil(Math.random()*6)}.png`;
    if(count>=10) {
      clearInterval(interval);
      el.src = `img/dice${finalRoll}.png`;
    }
  }, 50);
}

// ---------- EVENTI ----------
const lastEventMessagesPerPlayer = {};
function addEventMessageSingle(playerNick, text) {
  if (lastEventMessagesPerPlayer[playerNick] === text) return;
  lastEventMessagesPerPlayer[playerNick] = text;
  const msg = document.createElement("div");
  msg.textContent = text;
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

document.body.style.overflowY = "auto";