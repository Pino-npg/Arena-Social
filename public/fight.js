import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io();

// ---------- ELEMENTI ----------
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

// Online count
const onlineCountDisplay = document.createElement("div");
onlineCountDisplay.style.position = "absolute";
onlineCountDisplay.style.top = "10px";
onlineCountDisplay.style.left = "10px";
onlineCountDisplay.style.color = "gold";
onlineCountDisplay.style.fontSize = "1.2rem";
onlineCountDisplay.style.textShadow = "1px 1px 4px black";
document.body.appendChild(onlineCountDisplay);

// ---------- VARIABILI AUDIO ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;

const winnerMusic = new Audio();
winnerMusic.volume = 0.7;
let winnerMusicPending = null; // salva il vincitore se audio bloccato

// ---------- TRUCCO MOBILE ----------
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  audioUnlocked = true;

  // Parte musica battle
  musicBattle.play().catch(()=>{});

  // Se c'è una musica vincitore in attesa, la facciamo partire subito
  if (winnerMusicPending) {
    winnerMusic.src = `img/${winnerMusicPending}.mp3`;
    winnerMusic.play().catch(()=>{});
    winnerMusicPending = null;
  }
}

window.addEventListener("touchstart", unlockAudio, { once: true });
window.addEventListener("click", unlockAudio, { once: true });

// ---------- FUNZIONE PER SUONARE MUSICA VINCITORE ----------
function playWinnerMusic(winnerChar) {
  musicBattle.pause();

  if (!audioUnlocked) {
    // audio bloccato, memorizzo chi è il vincitore
    winnerMusicPending = winnerChar;
    return;
  }

  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

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
socket.emit("join1vs1", { nick, char });

// ---------- GESTIONE STUN ----------
let stunned = { p1: false, p2: false };

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => {
  onlineCountDisplay.textContent = `Online: ${count}`;
});

socket.on("waiting", msg => logEvent(msg, "dice"));
socket.on("gameStart", game => updateGame(game));
socket.on("1vs1Update", game => updateGame(game));

socket.on("gameOver", ({ winnerNick, winnerChar }) => {
  logEvent(`🏆 ${winnerNick} has won the battle!`, "win");
  playWinnerMusic(winnerChar);
});

// ---------- CHAT DINAMICA ----------
const chatMinHeight = 100; // altezza minima px
chatMessages.style.height = chatMinHeight + "px";

function appendChatMessage(msgText){
  const msg = document.createElement("div");
  msg.textContent = msgText;
  chatMessages.appendChild(msg);

  // Calcola altezza totale del contenuto
  const contentHeight = chatMessages.scrollHeight;
  const maxHeight = window.innerHeight * 0.6; // max 60% viewport

  if(contentHeight > chatMessages.clientHeight){
    chatMessages.style.height = Math.min(contentHeight, maxHeight) + "px";
  }

  // Scroll verso il messaggio più recente
  chatMessages.scrollTop = 0;
}

// ---------- SOCKET CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.value.trim() !== ""){
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});

socket.on("chatMessage", data => {
  appendChatMessage(`${data.nick}: ${data.text}`);
});

// ---------- FUNZIONI ----------
function updateGame(game) {
  player1Name.textContent = `${game.player1.nick} (${game.player1.char}) HP: ${game.player1.hp}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.char}) HP: ${game.player2.hp}`;

  player1HpBar.style.width = `${Math.max(game.player1.hp,0)}%`;
  player2HpBar.style.width = `${Math.max(game.player2.hp,0)}%`;

  if(game.player1.dice) handleDice(0, game);
  if(game.player2.dice) handleDice(1, game);

  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);
}

function handleDice(playerIndex, game) {
  const player = playerIndex === 0 ? game.player1 : game.player2;

  let finalDmg = player.dmg;
  let type = "damage";

  if ((playerIndex === 0 && stunned.p1) || (playerIndex === 1 && stunned.p2)) {
    finalDmg = Math.max(0, player.dice - 1);
    logEvent(`${player.nick} is stunned and only deals ${finalDmg} damage!`, "dice");
    if (playerIndex === 0) stunned.p1 = false; else stunned.p2 = false;
  } 
  else if (player.dice === 8) {
    type = "crit";
    logEvent(`${player.nick} CRIT! ${player.dmg} damage dealt ⚡`, type);
    if (playerIndex === 0) stunned.p2 = true; else stunned.p1 = true;
  } 
  else logEvent(`${player.nick} rolls ${player.dice} and deals ${finalDmg} damage!`, type);

  showDice(playerIndex, player.dice);
}

function logEvent(msg, type="normal") {
  const line = document.createElement("div");
  switch(type){
    case "crit": line.textContent = "⚡💥 " + msg; break;
    case "damage": line.textContent = "💥 " + msg; break;
    case "dice": line.textContent = "😵‍💫 " + msg; break;
    case "win": line.textContent = "🏆 " + msg; break;
    default: line.textContent = msg;
  }
  eventBox.appendChild(line);
  eventBox.scrollTop = eventBox.scrollHeight;
}

function showDice(playerIndex, value){
  const diceEl = playerIndex === 0 ? diceP1 : diceP2;
  diceEl.src = `img/dice${value}.png`;
  diceEl.style.width = "80px";
  diceEl.style.height = "80px";
}

function updateCharacterImage(player,index){
  let hp = player.hp;
  let src = `img/${player.char}`;
  if(hp<=0) src+='0';
  else if(hp<=20) src+='20';
  else if(hp<=40) src+='40';
  else if(hp<=60) src+='60';
  src+='.png';
  if(index===0) player1CharImg.src=src;
  else player2CharImg.src=src;
}

// ---------- FIX SCROLL MOBILE ----------
document.body.style.overflowY = "auto";