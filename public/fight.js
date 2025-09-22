import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io();

// ---------- ELEMENTI ----------
const player1Name = document.getElementById("player1-nick");
const player2Name = document.getElementById("player2-nick");
const player1CharImg = document.getElementById("player1-char");
const player2CharImg = document.getElementById("player2-char");
const player1HpBar = document.getElementById("player1-hp");
const player2HpBar = document.getElementById("player2-hp");
const diceP1 = document.getElementById("dice-p1");
const diceP2 = document.getElementById("dice-p2");

// Chat e storico eventi
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;
window.addEventListener("click", () => { 
  if (musicBattle.paused) musicBattle.play(); 
}, { once: true });

let winnerMusic = new Audio();

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");
fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try { await container.requestFullscreen(); } catch(e) { console.log(e); }
  } else { await document.exitFullscreen(); }
});

// ---------- INIZIO PARTITA ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
socket.emit("join1vs1", { nick, char });

// ---------- EVENTI ----------
socket.on("gameStart", game => updateGame(game));
socket.on("1vs1Update", game => updateGame(game));
socket.on("gameOver", ({ winnerChar, winnerNick }) => {
  logEvent(`🏆 ${winnerNick} has won the battle!`);
  playWinnerMusic(winnerChar);
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.value.trim() !== "") {
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});

// Riceve chat dall’altro giocatore
socket.on("chatMessage", data => {
  const msg = document.createElement("div");
  msg.textContent = `${data.nick}: ${data.text}`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ---------- FUNZIONE UPDATE ----------
function updateGame(game) {
  // Nickname
  player1Name.textContent = game.player1.nick;
  player2Name.textContent = game.player2.nick;

  // Barre HP
  player1HpBar.style.width = `${Math.max(game.player1.hp, 0)}%`;
  player2HpBar.style.width = `${Math.max(game.player2.hp, 0)}%`;

  // Immagini personaggi in base a HP
  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);

  // Dadi reali
  if(game.player1.dice) showDice(0, game.player1.dice);
  if(game.player2.dice) showDice(1, game.player2.dice);

  // Log eventi
  if(game.player1.dice) logEvent(`${game.player1.nick} rolls ${game.player1.dice} and deals ${game.player1.dmg} damage!`);
  if(game.player2.dice) logEvent(`${game.player2.nick} rolls ${game.player2.dice} and deals ${game.player2.dmg} damage!`);
}

// ---------- DADI ----------
function showDice(playerIndex, value) {
  const diceEl = playerIndex === 0 ? diceP1 : diceP2;
  diceEl.src = `img/dice${value}.png`;
}

// ---------- IMMAGINI IN BASE A HP ----------
function updateCharacterImage(player, index) {
  let hp = player.hp;
  let src = `img/${player.char}`;
  if(hp <= 0) src += '0';
  else if(hp <= 20) src += '20';
  else if(hp <= 40) src += '40';
  else if(hp <= 60) src += '60';
  src += '.png';

  if(index === 0) player1CharImg.src = src;
  else player2CharImg.src = src;
}

// ---------- LOG EVENTI ----------
function logEvent(msg) {
  const line = document.createElement("div");
  line.textContent = msg;
  eventBox.appendChild(line);
  eventBox.scrollTop = eventBox.scrollHeight;
}

// ---------- MUSICA VINCITORE ----------
function playWinnerMusic(winnerChar) {
  musicBattle.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}