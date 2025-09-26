import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io("/tournament");

// UI
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const closeOverlayBtn = document.getElementById("close-overlay");

const matchUI = {}; // matchId -> { p1, p2 }
let currentStage = "waiting";

// Musica
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;
let winnerMusic = new Audio();
winnerMusic.volume = 0.7;

function unlockAudio() {
  musicBattle.play().catch(() => {});
  winnerMusic.play().catch(() => {});
}
window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true });

// Fullscreen
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// Overlay trophy
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// Chat
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim() !== "") {
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});
socket.on("chatMessage", data =>
  addChatMessage(`${data.nick}: ${data.text}`)
);

function addChatMessage(txt) {
  const d = document.createElement("div");
  d.textContent = txt;
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addEventMessage(txt) {
  const d = document.createElement("div");
  d.textContent = txt;
  eventBox.appendChild(d);
  eventBox.scrollTop = eventBox.scrollHeight;
}

// Join torneo
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if (nick && char) {
  socket.emit("joinTournament", { nick, char });
} else {
  battleArea.innerHTML =
    "<h2>Error: Missing nickname or character. Return to home page.</h2>";
}

// Waiting iniziale
socket.on("waitingCount", ({ count, required, players }) => {
  if (currentStage !== "waiting") return;
  if (count < required) {
    battleArea.innerHTML = `
      <div class="waiting-container">
        <h2>Waiting for players... (${count}/${required})</h2>
        <ul>
          ${players.map(p => `<li>${escapeHtml(p.nick)} (${escapeHtml(p.char)})</li>`).join("")}
        </ul>
      </div>
    `;
  }
});

// Tournament events
socket.on("startTournament", matches => {
  if (!matches || matches.length === 0) {
    battleArea.innerHTML = "<h2>Waiting for tournament...</h2>";
    return;
  }
  currentStage = matches[0]?.stage || "quarter";
  battleArea.innerHTML = "";
  setStage(currentStage);
  matches.forEach(renderMatchCard);
});

socket.on("startMatch", match => {
  setStage(match.stage);
  renderMatchCard(match);
});

socket.on("updateMatch", match => {
  updateMatchUI(match);
});

socket.on("log", msg => addEventMessage(msg));

socket.on("matchOver", ({ winnerNick, winnerChar, stage }) => {
  const nickText = winnerNick ?? "???";
  const charText = winnerChar ?? "???";
  addEventMessage(`🏆 ${nickText} won the match (${stage})!`);
  playWinnerMusic(charText);
});

socket.on("tournamentOver", ({ nick, char }) => {
  const nickText = nick ?? "???";
  const charText = char ?? "???";
  addEventMessage(`🎉 ${nickText} won the tournament!`);
  playWinnerMusic(charText);
  setTimeout(() => (battleArea.innerHTML = "<h2>Waiting for new tournament...</h2>"), 3000);
});

// Nuovo evento per tabellone
socket.on("tournamentState", matches => {
  overlay.innerHTML = "<h2>🏆 Tournament Bracket</h2>";
  matches.forEach(match => {
    const div = document.createElement("div");
    div.textContent = `${match.player1?.nick ?? "??"} vs ${match.player2?.nick ?? "??"} (${match.stage})`;
    overlay.appendChild(div);
  });
});

// --- UI helpers ---
function setStage(stage) {
  if (stage === currentStage) return;
  currentStage = stage;

  const oldTitle = battleArea.querySelector(".stage-title");
  if (oldTitle) battleArea.removeChild(oldTitle);

  const title = document.createElement("h2");
  title.className = "stage-title";
  if (stage === "quarter") title.textContent = "⚔️ Quarter-finals";
  if (stage === "semi") title.textContent = "🔥 Semi-finals";
  if (stage === "final") title.textContent = "👑 Final!";
  battleArea.prepend(title);
}

function renderMatchCard(match) {
  if (matchUI[match.id]) return;
  const container = document.createElement("div");
  container.className = "match-container";
  container.id = `match-${match.id}`;
  const p1 = makePlayerCard(match.player1);
  const p2 = makePlayerCard(match.player2);
  container.appendChild(p1.div);
  container.appendChild(p2.div);
  battleArea.appendChild(container);
  matchUI[match.id] = { p1, p2 };
}

function makePlayerCard(player) {
  const div = document.createElement("div");
  div.className = "player";
  const label = document.createElement("div");
  label.className = "player-label";
  label.textContent = `${player.nick} (${player.char}) HP: ${player.hp}`;
  const img = document.createElement("img");
  img.className = "char-img";
  img.src = getCharImage(player);
  const hpBar = document.createElement("div");
  hpBar.className = "hp-bar";
  const hp = document.createElement("div");
  hp.className = "hp";
  hp.style.width = Math.max(0, player.hp) + "%";
  hpBar.appendChild(hp);
  const dice = document.createElement("img");
  dice.className = "dice";
  dice.src = "img/dice1.png";
  div.appendChild(label);
  div.appendChild(img);
  div.appendChild(hpBar);
  div.appendChild(dice);
  return { div, label, charImg: img, hp, dice };
}

function updateMatchUI(match) {
  if (!matchUI[match.id]) renderMatchCard(match);
  const refs = matchUI[match.id];
  refs.p1.label.textContent = `${match.player1.nick} (${match.player1.char}) HP: ${match.player1.hp}`;
  refs.p1.hp.style.width = Math.max(0, match.player1.hp) + "%";
  refs.p1.charImg.src = getCharImage(match.player1);
  if (match.player1.dice) refs.p1.dice.src = `img/dice${match.player1.dice}.png`;
  refs.p2.label.textContent = `${match.player2.nick} (${match.player2.char}) HP: ${match.player2.hp}`;
  refs.p2.hp.style.width = Math.max(0, match.player2.hp) + "%";
  refs.p2.charImg.src = getCharImage(match.player2);
  if (match.player2.dice) refs.p2.dice.src = `img/dice${match.player2.dice}.png`;
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
  winnerMusic.play().catch(() => {});
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

document.body.style.overflowY = "auto";