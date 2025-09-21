import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// ---------- CONNESSIONE ----------
const socket = io(); // server 1vs1

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

window.addEventListener("click", () => {
  if (musicBattle.paused) musicBattle.play();
}, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try { 
      if (container.requestFullscreen) await container.requestFullscreen();
      else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
      if (screen.orientation?.lock) await screen.orientation.lock("landscape").catch(()=>{});
    } catch(e) { console.log(e); }
  } else {
    if (document.exitFullscreen) await document.exitFullscreen();
  }
});

// ---------- INIZIO PARTITA ----------
let nick = localStorage.getItem("selectedNick");
let char = localStorage.getItem("selectedChar");

socket.emit("join1vs1", { nick, char }); // join al server 1vs1

// ---------- FUNZIONE UTILE ----------
function getHpImg(hp) {
  if (hp <= 0) return '0';
  if (hp <= 20) return '20';
  if (hp <= 40) return '40';
  if (hp <= 60) return '60';
  return ''; // 100%
}

function updatePlayer(playerData, hpBar, charImg, diceImg, logDiv) {
  hpBar.style.width = `${playerData.hp}%`;
  charImg.src = `img/${playerData.char}${getHpImg(playerData.hp)}.png`;
  diceImg.src = `img/dice${playerData.dice || 1}.png`;
  logDiv.textContent = `Last attack: ${playerData.dice || 0}`;
  // Nome + HP
  if (hpBar === player1HpBar) player1Name.textContent = `${playerData.nick} (${playerData.hp} HP)`;
  else player2Name.textContent = `${playerData.nick} (${playerData.hp} HP)`;
}

// ---------- EVENTI SERVER ----------
socket.on("gameStart", (game) => {
  updatePlayer(game.player1, player1HpBar, player1CharImg, diceP1, logP1);
  updatePlayer(game.player2, player2HpBar, player2CharImg, diceP2, logP2);
});

socket.on("updateHP", (data) => {
  updatePlayer(data.self, player1HpBar, player1CharImg, diceP1, logP1);
  updatePlayer(data.opponent, player2HpBar, player2CharImg, diceP2, logP2);
});

socket.on("log", ({ player, dice }) => {
  if (player === 1) logP1.textContent = `Last attack: ${dice}`;
  else logP2.textContent = `Last attack: ${dice}`;
});

socket.on("gameOver", ({ winner }) => {
  alert(`Winner: ${winner.nick}`);
  const winMusic = new Audio(`img/${winner.char}.mp3`);
  winMusic.play();
});