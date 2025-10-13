import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";
const socket = io("/tournament");

// ---------- DOM ----------
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracketContainer = document.getElementById("bracket");
const closeOverlayBtn = document.getElementById("close-overlay");
const timerEl = document.getElementById("turn-timer");

let countdownInterval;

// ---------- Stato ----------
let matchUI = {};
let currentStage = "waiting";
let waitingContainer = null;
let stageCounters = { quarter: 0, semi: 0, final: 0 };
let renderedMatchesByStage = {
  quarter: new Set(),
  semi: new Set(),
  final: new Set()
};
const matchStates = {}; // { matchId: { stunned: { p1:false,p2:false } } }

// ---------- Audio ----------
const musicQuarter = "img/5.mp3";
const musicSemi = "img/6.mp3";
const musicFinal = "img/7.mp3";

const musicBattle = new Audio(musicQuarter);
musicBattle.loop = true;
musicBattle.volume = 0.5;

let winnerMusic = new Audio();
winnerMusic.loop = false;
winnerMusic.volume = 0.7;

function unlockAudio() {
  if (musicBattle.paused) musicBattle.play().catch(() => {});
  if (winnerMusic.paused) winnerMusic.play().catch(() => {});
}
window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true });

// ---------- Fullscreen ----------
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- Overlay ----------
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// ---------- Chat ----------
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

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));
}
function clearMatchesUI() {
  Object.keys(matchUI).forEach(id => {
    const el = document.getElementById(`match-${id}`);
    if (el) el.remove();
  });
  matchUI = {};
}

// ---------- Character ----------
function getCharImage(char, hp = 100) {
  if (!char) return "img/unknown.png";
  let suffix = "";
  if (hp <= 0) suffix = "0";
  else if (hp <= 20) suffix = "20";
  else if (hp <= 40) suffix = "40";
  else if (hp <= 60) suffix = "60";
  return `img/${char.replace(/\s/g, "")}${suffix}.png`;
}

// ---------- Player Join ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if (nick && char) {
  socket.emit("joinTournament", { nick, char });
  renderWaiting(0, 8, []);
} else {
  battleArea.innerHTML =
    "<h2>Error: Missing nickname or character. Return to home page.</h2>";
}

// ---------- Waiting ----------
socket.on("waitingCount", ({ count, required, players }) => {
  if (currentStage === "waiting") renderWaiting(count, required, players);
});
function renderWaiting(count, required, players) {
  if (waitingContainer) waitingContainer.remove();

  waitingContainer = document.createElement("div");
  waitingContainer.className = "waiting-container";

  const title = document.createElement("h2");
  title.textContent = `Waiting for players... (${count}/${required})`;
  waitingContainer.appendChild(title);

  const ul = document.createElement("ul");
  players.forEach(p => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = getCharImage(p.char);
    img.alt = p.char ?? "unknown";
    img.width = 32;
    img.height = 32;
    img.onerror = () => {
      img.src = "img/unknown.png";
    };
    li.appendChild(img);
    li.appendChild(document.createTextNode(` ${p.nick} (${p.char})`));
    ul.appendChild(li);
  });
  waitingContainer.appendChild(ul);
  battleArea.prepend(waitingContainer);
}

// ---------- Stage ----------
function setStage(stage) {
  if (stage === currentStage) return;
  currentStage = stage;

  if (stage === "quarter") setMusic(musicQuarter);
  else if (stage === "semi") setMusic(musicSemi);
  else if (stage === "final") setMusic(musicFinal);

  const old = battleArea.querySelector(".stage-title");
  if (old) old.remove();
  const title = document.createElement("h2");
  title.className = "stage-title";
  title.textContent =
    stage === "quarter"
      ? "⚔️ Quarter-finals"
      : stage === "semi"
      ? "🔥 Semi-finals"
      : "👑 Final!";
  battleArea.prepend(title);
}
function setMusic(src) {
  if (!src) return;
  const wasPlaying = !musicBattle.paused;
  musicBattle.src = src;
  if (wasPlaying) musicBattle.play().catch(() => {});
}

// ---------- Match UI ----------
function makePlayer(p) {
  const div = document.createElement("div");
  div.className = "player";

  const label = document.createElement("div");
  label.className = "player-label";
  label.textContent = `${p.nick || "??"} (${p.char || "unknown"}) HP: ${
    p.hp ?? 0
  }`;

  const img = document.createElement("img");
  img.className = "char-img";
  img.src = getCharImage(p.char, p.hp);
  img.onerror = () => {
    img.src = "img/unknown.png";
  };

  const hpBar = document.createElement("div");
  hpBar.className = "hp-bar";
  const hp = document.createElement("div");
  hp.className = "hp";
  hp.style.width = Math.max(0, p.hp ?? 0) + "%";
  hpBar.appendChild(hp);

  const dice = document.createElement("img");
  dice.className = "dice";
  dice.src = `img/dice${p.roll || 1}.png`;

  div.append(label, img, hpBar, dice);
  return { div, label, charImg: img, hp, dice };
}

function renderMatchCard(match) {
  if (!match?.id) return;
  if (matchUI[match.id]) {
    handleDamage(match);
    return;
  }

  const container = document.createElement("div");
  container.className = "match-container";
  container.id = `match-${match.id}`;

  stageCounters[match.stage] = (stageCounters[match.stage] || 0) + 1;
  const shortLabel =
    match.stage === "quarter"
      ? "Q"
      : match.stage === "semi"
      ? "S"
      : "F";
  const stageLabel = document.createElement("h3");
  stageLabel.textContent = shortLabel;
  container.appendChild(stageLabel);

  const p1 = makePlayer(match.player1 ?? { nick: "??", char: "unknown", hp: 80 });
  const p2 = makePlayer(match.player2 ?? { nick: "??", char: "unknown", hp: 80 });

  container.append(p1.div, p2.div);
  battleArea.appendChild(container);

  matchUI[match.id] = { p1, p2 };
  renderedMatchesByStage[match.stage]?.add(match.id);
  matchStates[match.id] = { stunned: { p1: false, p2: false } };
}

// ---------- HP/Damage ----------
function handleDamage(match) {
  if (!match?.id || !matchUI[match.id]) return;
  const refs = matchUI[match.id];

  ["player1", "player2"].forEach((key, i) => {
    const player = match[key];
    const ref = i === 0 ? refs.p1 : refs.p2;
    if (!player) return;

    const hpVal = Math.max(0, player.hp ?? 0);
    const hpPercent = Math.round((hpVal / 80) * 100);
    ref.label.textContent = `${player.nick || "??"} (${player.char}) HP: ${hpVal}`;
    ref.hp.style.width = hpPercent + "%";
    if (hpPercent > 60)
      ref.hp.style.background = "linear-gradient(90deg, green, lime)";
    else if (hpPercent > 30)
      ref.hp.style.background = "linear-gradient(90deg, yellow, orange)";
    else ref.hp.style.background = "linear-gradient(90deg, red, darkred)";

    ref.charImg.src = getCharImage(player.char, player.hp);
    ref.dice.src = `img/dice${player.roll ?? 1}.png`;
  });
}

// ---------- Timer ----------
function startCountdown(seconds = 10) {
  clearInterval(countdownInterval);
  let time = seconds;
  timerEl.textContent = time;
  timerEl.style.display = "block";
  countdownInterval = setInterval(() => {
    time--;
    timerEl.textContent = time;
    if (time <= 0) {
      clearInterval(countdownInterval);
      timerEl.textContent = "0";
    }
  }, 1000);
}

// ---------- Winner ----------
function showWinnerChar(char) {
  if (!char) return;
  const winnerImg = document.createElement("img");
  winnerImg.src = `img/${char}.webp`;
  winnerImg.onerror = () => {
    winnerImg.src = `img/${char}.png`;
  };
  Object.assign(winnerImg.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    zIndex: "9999",
    backgroundColor: "black"
  });
  document.body.appendChild(winnerImg);
  winnerImg.addEventListener("click", () => winnerImg.remove());
}

function playWinnerMusic(char) {
  if (!char) return;
  musicBattle.pause();
  winnerMusic.src = `img/${char}.mp3`;
  winnerMusic.currentTime = 0;
  winnerMusic.play().catch(() => {});
}

// ---------- Socket events ----------
socket.on("startTournament", matches => {
  if (waitingContainer) {
    waitingContainer.remove();
    waitingContainer = null;
  }
  clearMatchesUI();
  currentStage = matches[0]?.stage || "quarter";
  setStage(currentStage);
  matches.forEach(m => renderMatchCard(m));
});

socket.on("startMatch", match => {
  if (match.stage) setStage(match.stage);
  renderMatchCard(match);
  startCountdown(10);
});

socket.on("updateMatch", match => {
  renderMatchCard(match);
  handleDamage(match);
});

socket.on("matchOver", ({ winnerNick, winnerChar, stage, matchId }) => {
  addEventMessage(`🏆 ${winnerNick} won the match (${stage})!`);
  if (stage === "final") playWinnerMusic(winnerChar);
  const el = document.getElementById(`match-${matchId}`);
  if (el) el.remove();
  delete matchUI[matchId];
});

socket.on("tournamentOver", ({ nick, char }) => {
  addEventMessage(`🎉 ${nick} won the tournament!`);
  showWinnerChar(char);
  playWinnerMusic(char);
  setTimeout(
    () => (battleArea.innerHTML = "<h2>Waiting for new tournament...</h2>"),
    2500
  );
});

socket.on("log", msg => addEventMessage(msg));
socket.on("tournamentState", bracket => renderBracket(bracket));

// ---------- Bracket ----------
function renderBracket(bracket) {
  bracketContainer.innerHTML = "";
  bracket.forEach(m => {
    const div = document.createElement("div");
    div.className = "bracket-row";
    const p1 = m.player1?.nick ?? "??";
    const p2 = m.player2?.nick ?? "??";
    const winner = m.winner ? ` - Winner: ${escapeHtml(m.winner.nick)}` : "";
    div.textContent = `${p1} vs ${p2} (${m.stage})${winner}`;
    if (m.winner) div.style.color = "#FFD700";
    bracketContainer.appendChild(div);
  });
}