// tour.js
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io("https://fight-game-server.onrender.com/tournament");

// ---------- ELEMENTI ----------
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracket = document.getElementById("bracket");
const closeOverlayBtn = document.getElementById("close-overlay");

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;

let winnerMusic = new Audio();
winnerMusic.loop = false;
winnerMusic.volume = 0.7;

function unlockAudio() {
  if (musicBattle.paused) musicBattle.play().catch(()=>{});
  if (winnerMusic.paused) winnerMusic.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true });

// ---------- FULLSCREEN ----------
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- TROPHY OVERLAY ----------
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim() !== "") {
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});

socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));

function addChatMessage(text) {
  const msg = document.createElement("div");
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------- EVENTI ----------
function addEventMessage(text) {
  const msg = document.createElement("div");
  msg.textContent = text;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

// ---------- GESTIONE TORNEO ----------

// Lista giocatori in attesa
socket.on("waitingCount", ({ count, required, players }) => {
  battleArea.innerHTML = `
    <h2>In attesa di giocatori... (${count}/${required})</h2>
    <ul>${players.map(p => `<li>${p.nick} (${p.char})</li>`).join("")}</ul>
  `;
});

// Quando ci sono 8 → partono i quarti
socket.on("startTournament", matches => {
  renderMatches(matches);
});

// Aggiornamento stato match (hp, dadi, immagini)
socket.on("updateMatch", match => {
  updateMatch(match);
});

// Log
socket.on("log", msg => addEventMessage(msg));

// Fine match
socket.on("matchOver", ({ winnerNick, winnerChar }) => {
  addEventMessage(`🏆 ${winnerNick} ha vinto il match!`);
  playWinnerMusic(winnerChar);
});

// ---------- FUNZIONI ----------
function renderMatches(matches) {
  battleArea.innerHTML = ""; // reset
  matches.forEach(match => {
    const container = document.createElement("div");
    container.classList.add("match-container");

    container.id = `match-${match.id}`;

    const p1 = createPlayerDiv(match.player1, "p1");
    const p2 = createPlayerDiv(match.player2, "p2");

    container.appendChild(p1.div);
    container.appendChild(p2.div);

    battleArea.appendChild(container);

    // salvo refs per update
    matchUI[match.id] = { p1, p2 };
  });
}

function createPlayerDiv(player, side) {
  const div = document.createElement("div");
  div.classList.add("player");

  const label = document.createElement("div");
  label.classList.add("player-label");
  label.textContent = `${player.nick} (${player.char}) HP: ${player.hp}`;

  const charImg = document.createElement("img");
  charImg.classList.add("char-img");
  charImg.src = getCharImage(player);

  const hpBar = document.createElement("div");
  hpBar.classList.add("hp-bar");
  const hp = document.createElement("div");
  hp.classList.add("hp");
  hp.style.width = player.hp + "%";
  hpBar.appendChild(hp);

  const dice = document.createElement("img");
  dice.classList.add("dice");
  dice.src = "img/dice1.png";

  div.appendChild(label);
  div.appendChild(charImg);
  div.appendChild(hpBar);
  div.appendChild(dice);

  return { div, label, charImg, hp, dice };
}

// Mappa dei match attivi
const matchUI = {};

function updateMatch(match) {
  const ui = matchUI[match.id];
  if (!ui) return;

  // Aggiorna player1
  updatePlayerUI(ui.p1, match.player1);

  // Aggiorna player2
  updatePlayerUI(ui.p2, match.player2);
}

function updatePlayerUI(uiPlayer, player) {
  uiPlayer.label.textContent = `${player.nick} (${player.char}) HP: ${player.hp}`;
  uiPlayer.hp.style.width = player.hp + "%";
  uiPlayer.charImg.src = getCharImage(player);

  if (player.dice) uiPlayer.dice.src = `img/dice${player.dice}.png`;
}

function getCharImage(player) {
  let src = `img/${player.char}`;
  if (player.hp <= 0) src += "0";
  else if (player.hp <= 20) src += "20";
  else if (player.hp <= 40) src += "40";
  else if (player.hp <= 60) src += "60";
  src += ".png";
  return src;
}

function playWinnerMusic(winnerChar) {
  musicBattle.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(err => console.log("⚠️ Audio non avviato automaticamente:", err));
}

document.body.style.overflowY = "auto";