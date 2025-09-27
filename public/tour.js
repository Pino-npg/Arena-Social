// tour.js (client)
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";
const socket = io("/tournament");

// UI elements
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracketContainer = document.getElementById("bracket"); // inside overlay
const closeOverlayBtn = document.getElementById("close-overlay");

let matchUI = {}; // matchId -> { p1, p2 }
let currentStage = "waiting";

// Music
const musicQuarter = "img/5.mp3";    // quarters
const musicSemi    = "img/6.mp3"; // optional, add file
const musicFinal   = "img/7.mp3";// optional, add file

const musicBattle = new Audio(musicQuarter);
musicBattle.loop = true;
musicBattle.volume = 0.5;
let winnerMusic = new Audio();
winnerMusic.volume = 0.7;

function unlockAudio() {
  musicBattle.play().catch(()=>{});
  winnerMusic.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once:true });
window.addEventListener("touchstart", unlockAudio, { once:true });

// fullscreen
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// overlay
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// chat
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim() !== "") {
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});
socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));
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

// join values saved from home
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if (nick && char) {
  socket.emit("joinTournament", { nick, char });
} else {
  battleArea.innerHTML = "<h2>Error: Missing nickname or character. Return to home page.</h2>";
}

// show waiting (always keep it updated)
socket.on("waitingCount", ({ count, required, players }) => {
  renderWaiting(count, required, players);
});
function renderWaiting(count, required, players) {
  // only show waiting box while tournament hasn't started (but show players list always at top)
  const existing = battleArea.querySelector(".waiting-container");
  const html = `
    <div class="waiting-container">
      <h2>Waiting for players... (${count}/${required})</h2>
      <ul>
        ${players.map(p => `<li>${escapeHtml(p.nick)} (${escapeHtml(p.char)})</li>`).join("")}
      </ul>
    </div>
  `;
  if (existing) existing.outerHTML = html;
  else battleArea.prepend(createFragment(html));
}

// startTournament: list of matches active
socket.on("startTournament", matches => {
  // clear UI matches and recreate from active matches
  clearMatchesUI();
  if (!matches || matches.length === 0) {
    battleArea.innerHTML = "<h2>Waiting for tournament...</h2>";
    return;
  }
  // stage comes from matches[0] usually
  const stage = matches[0]?.stage || "quarter";
  setStage(stage);
  matches.forEach(m => renderMatchCard(m));
});

// start single match
socket.on("startMatch", match => {
  if (match.stage) setStage(match.stage);
  renderMatchCard(match);
});

// update match
socket.on("updateMatch", match => updateMatchUI(match));

// logs
socket.on("log", msg => addEventMessage(msg));

// matchOver
socket.on("matchOver", ({ winnerNick, winnerChar, stage }) => {
  const nickText = winnerNick ?? "???";
  const charText = winnerChar ?? "???";
  addEventMessage(`🏆 ${nickText} won the match (${stage})!`);
  playWinnerMusic(charText);
  // remove finished match UI after a short delay to keep screen tidy
  setTimeout(() => {
    // find match id in UI by stage players (some matches use bracket id)
    Object.keys(matchUI).forEach(id => {
      const refs = matchUI[id];
      if (!refs) return;
      const labels = [refs.p1.label.textContent, refs.p2.label.textContent].join("|");
      if (labels.includes(winnerNick)) {
        // keep winner visible but remove container when bracket advances (server will emit startTournament)
      }
    });
  }, 1500);
});

// tournament over
socket.on("tournamentOver", ({ nick, char }) => {
  addEventMessage(`🎉 ${nick ?? "??"} won the tournament!`);
  playWinnerMusic(char ?? "??");
  setTimeout(()=> battleArea.innerHTML = "<h2>Waiting for new tournament...</h2>", 2500);
});

// bracket / trophy update
socket.on("tournamentState", bracket => {
  // show bracket inside bracketContainer (not overlay root)
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
  // also ensure overlay visible if requested by user via trophy button
});

// --- UI helpers ---
function setStage(stage) {
  if (stage === currentStage) return;
  currentStage = stage;

  // set music by stage
  if (stage === "quarter") { setMusic(musicQuarter); }
  else if (stage === "semi") { setMusic(musicSemi); }
  else if (stage === "final") { setMusic(musicFinal); }

  const old = battleArea.querySelector(".stage-title");
  if (old) old.remove();
  const title = document.createElement("h2");
  title.className = "stage-title";
  title.textContent = stage === "quarter" ? "⚔️ Quarter-finals" : stage === "semi" ? "🔥 Semi-finals" : "👑 Final!";
  battleArea.prepend(title);
}

function setMusic(src) {
  if (!src) return;
  const wasPlaying = !musicBattle.paused;
  musicBattle.src = src;
  if (wasPlaying) musicBattle.play().catch(()=>{});
}

function renderMatchCard(match) {
  if (!match?.id) return;
  if (matchUI[match.id]) {
    // update existing
    updateMatchUI(match);
    return;
  }
  // create UI
  const container = document.createElement("div");
  container.className = "match-container";
  container.id = `match-${match.id}`;

  const p1 = makePlayerCard(match.player1 || { nick: "??", char: "??", hp: 0 });
  const p2 = makePlayerCard(match.player2 || { nick: "??", char: "??", hp: 0 });

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
  label.textContent = `${player.nick} (${player.char}) HP: ${player.hp ?? 0}`;

  const img = document.createElement("img");
  img.className = "char-img";
  img.src = getCharImage(player);

  const hpBar = document.createElement("div");
  hpBar.className = "hp-bar";
  const hp = document.createElement("div");
  hp.className = "hp";
  hp.style.width = Math.max(0, player.hp ?? 0) + "%";
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
  if (!match || !match.id) return;
  if (!matchUI[match.id]) renderMatchCard(match);
  const refs = matchUI[match.id];
  if (!refs) return;
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
  const base = player?.char ? `img/${player.char}` : `img/??`;
  const hp = player?.hp ?? 0;
  let suffix = "";
  if (hp <= 0) suffix = "0";
  else if (hp <= 20) suffix = "20";
  else if (hp <= 40) suffix = "40";
  else if (hp <= 60) suffix = "60";
  return `${base}${suffix}.png`;
}

function playWinnerMusic(winnerChar) {
  musicBattle.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

// helpers
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}
function createFragment(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function clearMatchesUI() {
  Object.keys(matchUI).forEach(id => {
    const el = document.getElementById(`match-${id}`);
    if (el) el.remove();
  });
  matchUI = {};
}

document.body.style.overflowY = "auto";