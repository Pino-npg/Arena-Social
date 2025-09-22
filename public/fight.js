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
  // Aggiorna nickname + nome campione + HP
  player1Name.textContent = `${game.player1.nick} (${game.player1.hp} HP) - ${game.player1.char}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.hp} HP) - ${game.player2.char}`;

  // Aggiorna immagini personaggi (fissi)
  player1CharImg.src = `img/${game.player1.char}.png`;
  player2CharImg.src = `img/${game.player2.char}.png`;

  // Mostra dado reale
  if (game.player1.dice) diceP1.src = `img/dice${game.player1.dice}.png`;
  if (game.player2.dice) diceP2.src = `img/dice${game.player2.dice}.png`;

  // Calcolo danno effettivo con eventuale malus (-1 se stordito)
  const dmgP1 = game.player1.dice - (game.player1.stunned ? 1 : 0);
  const dmgP2 = game.player2.dice - (game.player2.stunned ? 1 : 0);

  // Aggiorna barre vita dopo danno effettivo
  player1HpBar.style.width = `${Math.max(game.player1.hp - dmgP2, 0)}%`;
  player2HpBar.style.width = `${Math.max(game.player2.hp - dmgP1, 0)}%`;

  // Aggiorna log eventi con danno effettivo
  if (game.player1.dice) logEvent(`${game.player1.nick} lancia ${game.player1.dice} e infligge ${dmgP1} danni!`);
  if (game.player2.dice) logEvent(`${game.player2.nick} lancia ${game.player2.dice} e infligge ${dmgP2} danni!`);

  // Mini log sotto i player
  logP1.textContent = `Last attack: ${dmgP1}`;
  logP2.textContent = `Last attack: ${dmgP2}`;
}

// ---------- HELPER ----------
function logEvent(msg) {
  const box = document.getElementById("event-messages");
  const line = document.createElement("div");
  line.textContent = msg;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}