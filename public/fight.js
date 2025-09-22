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

// Chat e storico
const chatMessages = document.getElementById("chat-messages") || null;
const chatInput = document.getElementById("chat-input") || null;
const eventBox = document.getElementById("event-messages") || null;

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;
window.addEventListener("click", () => {
  if (musicBattle.paused) musicBattle.play();
}, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");

if(fullscreenBtn){
  fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      try { await container.requestFullscreen(); } catch(e) { console.log(e); }
    } else { await document.exitFullscreen(); }
  });
}

// ---------- INIZIO PARTITA ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");

socket.emit("join1vs1", { nick, char });

// ---------- EVENTI ----------
socket.on("gameStart", game => updateGame(game));
socket.on("1vs1Update", game => updateGame(game));
socket.on("gameOver", ({ winner }) => {
  logEvent(`🎉 ${winner} ha vinto la battaglia!`);
  const winMusic = new Audio(`img/${winner}.mp3`);
  winMusic.play();
});

// ---------- FUNZIONE UPDATE ----------
function updateGame(game) {
  // Aggiorna nickname + nome campione + HP
  if(player1Name) player1Name.textContent = `${game.player1.nick} (${game.player1.hp} HP) - ${game.player1.char}`;
  if(player2Name) player2Name.textContent = `${game.player2.nick} (${game.player2.hp} HP) - ${game.player2.char}`;

  // Aggiorna immagini personaggi fissi
  if(player1CharImg) player1CharImg.src = `img/${game.player1.char}.png`;
  if(player2CharImg) player2CharImg.src = `img/${game.player2.char}.png`;

  // Mostra dado reale
  if(diceP1 && game.player1.dice) diceP1.src = `img/dice${game.player1.dice}.png`;
  if(diceP2 && game.player2.dice) diceP2.src = `img/dice${game.player2.dice}.png`;

  // Calcolo danno effettivo con eventuale malus
  const dmgP1 = game.player1.dice - (game.player1.stunned ? 1 : 0);
  const dmgP2 = game.player2.dice - (game.player2.stunned ? 1 : 0);

  // Aggiorna barre vita
  if(player1HpBar) player1HpBar.style.width = `${Math.max(game.player1.hp - dmgP2, 0)}%`;
  if(player2HpBar) player2HpBar.style.width = `${Math.max(game.player2.hp - dmgP1, 0)}%`;

  // Aggiorna storico eventi
  if(game.player1.dice) logEvent(`${game.player1.nick} lancia ${game.player1.dice} e infligge ${dmgP1} danni!`);
  if(game.player2.dice) logEvent(`${game.player2.nick} lancia ${game.player2.dice} e infligge ${dmgP2} danni!`);
}

// ---------- CHAT ----------
if(chatInput){
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.value.trim() !== "") {
      if(chatMessages){
        const msg = document.createElement("div");
        msg.textContent = `Tu: ${e.target.value}`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      e.target.value = "";
    }
  });
}

// ---------- HELPER ----------
function logEvent(msg){
  if(!eventBox) return;
  const line = document.createElement("div");
  line.textContent = msg;
  eventBox.appendChild(line);
  eventBox.scrollTop = eventBox.scrollHeight;
}