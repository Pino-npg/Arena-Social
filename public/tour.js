// --- tour.js (client) completo ---
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";
const socket = io("/tournament");

// --- DOM elements ---
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracketContainer = document.getElementById("bracket");
const closeOverlayBtn = document.getElementById("close-overlay");

// --- State ---
let matchUI = {};
let currentStage = "waiting";
let waitingContainer = null;

// --- Music ---
const musicQuarter = "img/5.mp3";    
const musicSemi    = "img/6.mp3"; 
const musicFinal   = "img/7.mp3";

const musicBattle = new Audio(musicQuarter);
musicBattle.loop = true;
musicBattle.volume = 0.5;

// --- Audio unlock ---
function unlockAudio() {
  musicBattle.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once:true });
window.addEventListener("touchstart", unlockAudio, { once:true });

// --- Fullscreen toggle ---
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// --- Overlay toggle ---
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// --- Chat ---
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

// --- Join tournament ---
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if (nick && char) {
  socket.emit("joinTournament", { nick, char });
} else {
  battleArea.innerHTML = "<h2>Error: Missing nickname or character. Return to home page.</h2>";
}

// --- Waiting ---
socket.on("waitingCount", ({ count, required, players }) => {
  if(currentStage==="waiting") renderWaiting(count, required, players);
});

function renderWaiting(count, required, players) {
  if(waitingContainer) waitingContainer.remove();

  waitingContainer = document.createElement("div");
  waitingContainer.className = "waiting-container";

  const title = document.createElement("h2");
  title.textContent = `Waiting for players... (${count}/${required})`;
  waitingContainer.appendChild(title);

  const ul = document.createElement("ul");
  players.forEach(p => {
    const li = document.createElement("li");

    const img = document.createElement("img");
    img.src = p.char ? `img/${p.char}.png` : "img/unknown.png";
    img.alt = p.char;
    img.width = 32;
    img.height = 32;
    img.onerror = () => { img.src = "img/unknown.png"; };
    li.appendChild(img);

    const text = document.createTextNode(` ${p.nick} (${p.char})`);
    li.appendChild(text);

    ul.appendChild(li);
  });

  waitingContainer.appendChild(ul);
  battleArea.prepend(waitingContainer);
}

// --- Start Tournament ---
socket.on("startTournament", matches => {
  // sparisce il waiting
  if(waitingContainer) {
    waitingContainer.remove();
    waitingContainer = null;
  }

  clearMatchesUI();
  currentStage = matches[0]?.stage || "quarter";
  setStage(currentStage);
  matches.forEach(m => renderMatchCard(m));
});

// --- Start / Update Match ---
socket.on("startMatch", match => {
  if(match.stage) setStage(match.stage);
  renderMatchCard(match);
});

socket.on("updateMatch", match => updateMatchUI(match));

// --- Logs ---
socket.on("log", msg => addEventMessage(msg));

// --- Match Over ---
socket.on("matchOver", ({ winnerNick, winnerChar, stage }) => {
  addEventMessage(`🏆 ${winnerNick ?? "??"} won the match (${stage})!`);
  if(stage==="final") playWinnerMusic(winnerChar);
});

// --- Tournament Over ---
socket.on("tournamentOver", ({ nick, char }) => {
  addEventMessage(`🎉 ${nick ?? "??"} won the tournament!`);
  showWinnerChar(char);
  playWinnerMusic(char);
  setTimeout(()=> battleArea.innerHTML = "<h2>Waiting for new tournament...</h2>", 2500);
});

// --- Bracket ---
socket.on("tournamentState", bracket => {
  bracketContainer.innerHTML = "";
  if(currentStage==="final"){
    const table = document.createElement("table");
    table.style.width="100%";
    table.style.borderCollapse="collapse";
    const head = document.createElement("tr");
    head.innerHTML="<th>Player 1</th><th>Player 2</th><th>Winner</th><th>Stage</th>";
    table.appendChild(head);
    bracket.forEach(m=>{
      const row = document.createElement("tr");
      row.innerHTML = `<td>${m.player1?.nick||"??"}</td>
                       <td>${m.player2?.nick||"??"}</td>
                       <td>${m.winner?.nick||"??"}</td>
                       <td>${m.stage}</td>`;
      table.appendChild(row);
    });
    bracketContainer.appendChild(table);
  } else {
    bracket.forEach(m=>{
      const div = document.createElement("div");
      div.className = "bracket-row";
      const p1 = m.player1?.nick ?? "??";
      const p2 = m.player2?.nick ?? "??";
      const winner = m.winner ? ` - Winner: ${escapeHtml(m.winner.nick)}` : "";
      div.textContent = `${p1} vs ${p2} (${m.stage})${winner}`;
      if(m.winner) div.style.color = "#FFD700";
      bracketContainer.appendChild(div);
    });
  }
});

// --- UI helpers ---
function setStage(stage){
  if(stage===currentStage) return;
  currentStage=stage;

  if(stage==="quarter") setMusic(musicQuarter);
  else if(stage==="semi") setMusic(musicSemi);
  else if(stage==="final") setMusic(musicFinal);

  const old=battleArea.querySelector(".stage-title");
  if(old) old.remove();
  const title=document.createElement("h2");
  title.className="stage-title";
  title.textContent = stage==="quarter"?"⚔️ Quarter-finals":stage==="semi"?"🔥 Semi-finals":"👑 Final!";
  battleArea.prepend(title);
}

function setMusic(src){
  if(!src) return;
  const wasPlaying = !musicBattle.paused;
  musicBattle.src=src;
  if(wasPlaying) musicBattle.play().catch(()=>{});
}

// --- Matches ---
function renderMatchCard(match){
  if(!match?.id) return;
  if(matchUI[match.id]) { updateMatchUI(match); return; }
  const container=document.createElement("div");
  container.className="match-container";
  container.id=`match-${match.id}`;

  const stageLabel=document.createElement("h3");
  stageLabel.textContent=`${match.stage.toUpperCase()} - ${match.id}`;
  container.appendChild(stageLabel);

  const p1 = makePlayerCard(match.player1 || { nick:"??", char:"??", hp:0 });
  const p2 = makePlayerCard(match.player2 || { nick:"??", char:"??", hp:0 });

  container.appendChild(p1.div);
  container.appendChild(p2.div);
  battleArea.appendChild(container);

  matchUI[match.id] = { p1, p2 };
}

function makePlayerCard(player){
  const div=document.createElement("div");
  div.className="player";

  const label=document.createElement("div");
  label.className="player-label";
  label.textContent=`${player.nick} (${player.char}) HP: ${player.hp ?? 0}`;

  const img=document.createElement("img");
  img.className="char-img";
  img.src = player.char ? `img/${player.char}.png` : "img/unknown.png";
  img.onerror = () => { img.src = "img/unknown.png"; };

  const hpBar=document.createElement("div");
  hpBar.className="hp-bar";
  const hp=document.createElement("div");
  hp.className="hp";
  hp.style.width=Math.max(0,player.hp??0)+"%";
  hpBar.appendChild(hp);

  const dice=document.createElement("img");
  dice.className="dice";
  dice.src="img/dice1.png";

  div.appendChild(label);
  div.appendChild(img);
  div.appendChild(hpBar);
  div.appendChild(dice);

  return { div,label,charImg:img,hp,dice };
}

function updateMatchUI(match){
  if(!match || !match.id) return;
  if(!matchUI[match.id]) renderMatchCard(match);
  const refs=matchUI[match.id];
  if(!refs) return;

  refs.p1.label.textContent=`${match.player1.nick} (${match.player1.char}) HP: ${match.player1.hp}`;
  refs.p1.hp.style.width=Math.max(0,match.player1.hp)+"%";
  if(match.p1?.dice) refs.p1.dice.src=`img/dice${match.player1.dice}.png`;
  if(refs.p1.charImg) refs.p1.charImg.onerror = () => { refs.p1.charImg.src = "img/unknown.png"; };

  refs.p2.label.textContent=`${match.player2.nick} (${match.player2.char}) HP: ${match.player2.hp}`;
  refs.p2.hp.style.width=Math.max(0,match.player2.hp)+"%";
  if(match.player2?.dice) refs.p2.dice.src=`img/dice${match.player2.dice}.png`;
  if(refs.p2.charImg) refs.p2.charImg.onerror = () => { refs.p2.charImg.src = "img/unknown.png"; };
}

// --- Winner fullscreen ---
function showWinnerChar(char){
  if(!char) return;
  const winnerImg = document.createElement("img");
  winnerImg.src = `img/${char}.webp`;
  winnerImg.onerror = () => { winnerImg.src = `img/${char}.png`; };
  winnerImg.style.position = "fixed";
  winnerImg.style.top = "0";
  winnerImg.style.left = "0";
  winnerImg.style.width = "100%";
  winnerImg.style.height = "100%";
  winnerImg.style.objectFit = "contain";
  winnerImg.style.zIndex = "9999";
  winnerImg.style.backgroundColor = "black";
  document.body.appendChild(winnerImg);
  winnerImg.addEventListener("click", () => winnerImg.remove());
}

// --- Winner music ---
function playWinnerMusic(winnerChar){
  if(!winnerChar) return;
  musicBattle.pause();
  const audio = new Audio(`img/${winnerChar}.mp3`);
  audio.volume = 0.7;
  audio.play().catch(()=>{});
}

// --- Helpers ---
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]); }
function createFragment(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
function clearMatchesUI(){ Object.keys(matchUI).forEach(id=>{ const el=document.getElementById(`match-${id}`); if(el) el.remove(); }); matchUI={}; }

document.body.style.overflowY="auto";