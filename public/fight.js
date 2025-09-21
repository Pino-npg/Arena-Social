import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io(); // server principale

// ---------- ELEMENTI ----------
const player1Name = document.getElementById("player1-nick");
const player2Name = document.getElementById("player2-nick");
const player1CharImg = document.getElementById("player1-char");
const player2CharImg = document.getElementById("player2-char");
const player1HpBar = document.getElementById("player1-hp");
const player2HpBar = document.getElementById("player2-hp");
const logP1 = document.getElementById("log-p1");
const logP2 = document.getElementById("log-p2");
const diceP1 = document.getElementById("dice-p1");
const diceP2 = document.getElementById("dice-p2");

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;
window.addEventListener("click", () => { if (musicBattle.paused) musicBattle.play(); }, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try { if (container.requestFullscreen) await container.requestFullscreen(); } catch(e) { console.log(e); }
  } else { if (document.exitFullscreen) await document.exitFullscreen(); }
});

// ---------- INIZIO PARTITA ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");

socket.emit("join1vs1", { nick, char });

// ---------- EVENTI ----------
socket.on("gameStart", (game) => updateGame(game));
socket.on("1vs1Update", (game) => updateGame(game));
socket.on("gameOver", ({ winner }) => {
  alert(`Winner: ${winner}`);
  const winMusic = new Audio(`img/${winner}.mp3`);
  winMusic.play();
});

// ---------- FUNZIONE UPDATE ----------
function updateGame(game) {
  // Aggiorna nickname e HP
  player1Name.textContent = `${game.player1.nick} (${game.player1.hp} HP)`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.hp} HP)`;

  player1HpBar.style.width = `${game.player1.hp}%`;
  player2HpBar.style.width = `${game.player2.hp}%`;

  // Aggiorna immagini
  player1CharImg.src = `img/${game.player1.char}${getHpImg(game.player1.hp)}.png`;
  player2CharImg.src = `img/${game.player2.char}${getHpImg(game.player2.hp)}.png`;

  // Mostra dado
  diceP1.src = `img/dice${game.player1.dice || 1}.png`;
  diceP2.src = `img/dice${game.player2.dice || 1}.png`;

  // Log
  logP1.textContent = `Last attack: ${game.player1.dice || 0}`;
  logP2.textContent = `Last attack: ${game.player2.dice || 0}`;
}

// ---------- HELPER ----------
function getHpImg(hp) {
  if (hp <= 0) return '0';
  if (hp <= 20) return '20';
  if (hp <= 40) return '40';
  if (hp <= 60) return '60';
  return ''; // 100%
}