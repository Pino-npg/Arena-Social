import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io();

// ---------- ELEMENTI ----------
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

// ---------- ONLINE & HOME ----------
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

// ---------- INIZIO PARTITA ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
socket.emit("join1vs1", { nick, char }, roomId => {
  socket.roomId = roomId;
});

// ---------- GESTIONE STUN ----------
let stunned = { p1: false, p2: false };

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => onlineCountDisplay.textContent = `Online: ${count}`);
socket.on("waiting", msg => addEventMessageSingle("system", msg));

socket.on("gameStart", (roomId, game) => {
  socket.roomId = roomId;
  updateGame(game);
});

socket.on("1vs1Update", (roomId, game) => {
  if (roomId === socket.roomId) updateGame(game);
});

socket.on("gameOver", (roomId, { winnerNick, winnerChar }) => {
  if (roomId === socket.roomId) {
    // Forza sempre il messaggio del vincitore
    addEventMessageWinner(`🏆 ${winnerNick} has won the battle!`);
    playWinnerMusic(winnerChar);
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
  if (data.roomId === socket.roomId) {
    addChatMessage(`${data.nick}: ${data.text}`);
  }
});

// ---------- FUNZIONI ----------
function updateGame(game) {
  const maxHp = 80;
  const hp1 = Math.min(game.player1.hp, maxHp);
  const hp2 = Math.min(game.player2.hp, maxHp);

  player1Name.textContent = `${game.player1.nick} (${game.player1.char}) HP: ${hp1}/${maxHp}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.char}) HP: ${hp2}/${maxHp}`;

  // --- HP BAR WIDTH ---
  const hpPercent1 = (hp1 / maxHp) * 100;
  const hpPercent2 = (hp2 / maxHp) * 100;

  player1HpBar.style.width = `${hpPercent1}%`;
  player2HpBar.style.width = `${hpPercent2}%`;

  // --- HP BAR COLOR DYNAMIC ---
  player1HpBar.style.background = getHpColor(hpPercent1);
  player2HpBar.style.background = getHpColor(hpPercent2);

  if(game.player1.dice) handleDice(0, game);
  if(game.player2.dice) handleDice(1, game);

  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);
}

// --- Funzione colore dinamico ---
function getHpColor(percent) {
  if (percent > 60) {
    return "linear-gradient(90deg, green, lime)";
  } else if (percent > 30) {
    return "linear-gradient(90deg, yellow, orange)";
  } else {
    return "linear-gradient(90deg, red, darkred)";
  }
}

function handleDice(playerIndex, game) {
  const player = playerIndex === 0 ? game.player1 : game.player2;
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponent = opponentIndex === 0 ? game.player1 : game.player2;

  let finalDmg = player.dice;

  // Se il player è stunnato → danno ridotto di 1
  const isPlayerStunned = (playerIndex === 0 && stunned.p1) || (playerIndex === 1 && stunned.p2);
  if (isPlayerStunned) {
    finalDmg = Math.max(0, player.dice - 1);
    addEventMessageSingle(player.nick, `${player.nick} is stunned and only deals ${finalDmg} damage 😵‍💫`);
    if (playerIndex === 0) stunned.p1 = false;
    else stunned.p2 = false;
  } 
  // Se il player fa CRIT → stunna l’avversario
  else if (player.dice === 8) {
    addEventMessageSingle(player.nick, `${player.nick} CRIT! ${player.dice} damage dealt ⚡💥`);
    if (playerIndex === 0) stunned.p2 = true;
    else stunned.p1 = true;
  } 
  else {
    addEventMessageSingle(player.nick, `${player.nick} rolls ${player.dice} and deals ${finalDmg} damage 💥`);
  }

  showDice(playerIndex, player.dice);
}


function showDice(playerIndex, value){
  const diceEl = playerIndex === 0 ? diceP1 : diceP2;
  diceEl.src = `img/dice${value}.png`;
  diceEl.style.width = "80px";
  diceEl.style.height = "80px";
}
// 🎲 Effetto roll per i dadi
function rollDiceEffect(playerId) {
  const dice = document.getElementById(`dice-${playerId}`);
  if (!dice) return;

  dice.classList.add("rolling");

  setTimeout(() => {
    dice.classList.remove("rolling");
    const roll = Math.floor(Math.random() * 6) + 1;
    dice.src = `img/dice${roll}.png`;
  }, 1000);
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

// ---------- DOPPI EVENTI PER SINGOLO GIOCATORE ----------
const lastEventMessagesPerPlayer = {};
function addEventMessageSingle(playerNick, text) {
  if (lastEventMessagesPerPlayer[playerNick] === text) return;
  lastEventMessagesPerPlayer[playerNick] = text;

  const msg = document.createElement("div");
  msg.textContent = text;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

// ---------- MESSAGGIO VINCITORE (FORZATO) ----------
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

// ---------- AUDIO VINCITORE ----------
function playWinnerMusic(winnerChar) {
  // stoppa musica battaglia
  musicBattle.pause();
  musicBattle.currentTime = 0;

  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(err => console.log("⚠️ Audio non avviato automaticamente:", err));
}

// ---------- FIX SCROLL MOBILE ----------
document.body.style.overflowY = "auto";