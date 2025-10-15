import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";
const socket = io("/tournament");

// ---------- DOM elements ----------
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracketContainer = document.getElementById("bracket");
const closeOverlayBtn = document.getElementById("close-overlay");

document.addEventListener("DOMContentLoaded", () => {
  const onlineCountEl = document.getElementById("online-count");
  const homeBtn = document.getElementById("home-btn");

  socket.on("onlineCount", count => {
    onlineCountEl.textContent = `Online: ${count}`;
  });

  homeBtn.addEventListener("click", () => {
    window.location.href = "https://fight-game-server.onrender.com/";
  });
});

// ---------- State ----------
let matchUI = {};
let currentStage = "waiting";
let waitingContainer = null;
const matchStates = {}; // { matchId: { stunned: { p1: false, p2: false } } }
let stageCounters = { quarter:0, semi:0, final:0 }; // contatori etichette

// Tiene traccia dei match renderizzati per fase
let renderedMatchesByStage = {
  quarter: new Set(),
  semi: new Set(),
  final: new Set()
};

// ---------- Music ----------
const musicQuarter = "img/5.mp3";    
const musicSemi    = "img/6.mp3"; 
const musicFinal   = "img/7.mp3";

const musicBattle = new Audio(musicQuarter);
musicBattle.loop = true;
musicBattle.volume = 0.5;

let winnerMusic = new Audio();
winnerMusic.loop = false;
winnerMusic.volume = 0.7;

// ---------- Audio unlock ----------
function unlockAudio() {
  if (musicBattle.paused) musicBattle.play().catch(()=>{});
  if (winnerMusic.paused) winnerMusic.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once:true });
window.addEventListener("touchstart", unlockAudio, { once:true });

// ---------- Fullscreen toggle ----------
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- Overlay toggle ----------
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// ---------- Chat ----------
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

// ---------- Helpers ----------
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]); }
function createFragment(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
function clearMatchesUI(){ Object.keys(matchUI).forEach(id=>{ const el=document.getElementById(`match-${id}`); if(el) el.remove(); }); matchUI={}; }

// ---------- Character image helper ----------
function getCharImage(char,hp=100){
  if(!char) return "img/unknown.png";
  let suffix = "";
  if(hp<=0) suffix='0';
  else if(hp<=20) suffix='20';
  else if(hp<=40) suffix='40';
  else if(hp<=60) suffix='60';
  return `img/${char.replace(/\s/g,'')}${suffix}.png`;
}

// ---------- Join tournament ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if (nick && char) {
  socket.emit("joinTournament", { nick, char });
  renderWaiting(0, 8, []); 
} else {
  battleArea.innerHTML = "<h2>Error: Missing nickname or character. Return to home page.</h2>";
}

// ---------- Waiting ----------
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
    img.src = getCharImage(p.char);
    img.alt = p.char ?? "unknown";
    img.width = 32;
    img.height = 32;
    img.onerror = () => { img.src = "img/unknown.png"; };
    li.appendChild(img);
    li.appendChild(document.createTextNode(` ${p.nick} (${p.char})`));
    ul.appendChild(li);
  });

  waitingContainer.appendChild(ul);
  battleArea.prepend(waitingContainer);
}

// ---------- Tournament stages ----------
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

// ---------- Matches ----------
function makePlayerCard(player){
  const p = player || { nick:"??", char:"unknown", hp:0, roll:0, dmg:0 };
  const div = document.createElement("div");
  div.className = "player";

  const label = document.createElement("div");
  label.className = "player-label";
  label.textContent = `${p.nick || "??"} (${p.char || "unknown"}) HP: ${p.hp ?? 0}`;

  const img = document.createElement("img");
  img.className = "char-img";
  img.src = getCharImage(p.char || "unknown", p.hp ?? 0);
  img.onerror = () => { img.src = "img/unknown.png"; };

  const hpBar = document.createElement("div");
  hpBar.className = "hp-bar";
  const hpEl = document.createElement("div");
  hpEl.className = "hp";
  hpEl.style.width = Math.max(0, p.hp ?? 0) + "%";
  hpBar.appendChild(hpEl);

  const dice = document.createElement("img");
  dice.className = "dice";
  dice.src = `img/dice${p.roll ?? 1}.png`;

  div.appendChild(label);
  div.appendChild(img);
  div.appendChild(hpBar);
  div.appendChild(dice);

  return { div, label, charImg: img, hp: hpEl, dice };
}

// ---------- Render match card ----------
function renderMatchCard(match){
  if(!match?.id) return;

  // aggiorna se già renderizzato
  if(matchUI[match.id]){
    handleDamage(match); // aggiorna HP/dado
    return;
  }

  const container = document.createElement("div");
  container.className = "match-container";
  container.id = `match-${match.id}`;

  // contatore fase
  stageCounters[match.stage] = (stageCounters[match.stage] || 0) + 1;
  let shortLabel = match.stage==="quarter" ? `Q` :
                   match.stage==="semi"    ? `S` :
                   match.stage==="final"   ? `F` : match.stage.toUpperCase();

  const stageLabel = document.createElement("h3");
  stageLabel.textContent = `${shortLabel}`;
  container.appendChild(stageLabel);

  // funzione interna per creare player card
  function makePlayer(p){
    const div=document.createElement("div");
    div.className="player";

    const label=document.createElement("div");
    label.className="player-label";
    label.textContent = `${p.nick || "??"} (${p.char || "unknown"}) HP: ${p.hp ?? 0}`;

    const img=document.createElement("img");
    img.className="char-img";
    img.src = getCharImage(p.char, p.hp);
    img.onerror = () => { img.src = "img/unknown.png"; };

    const hpBar=document.createElement("div");
    hpBar.className="hp-bar";
    const hp=document.createElement("div");
    hp.className="hp";
    hp.style.width = Math.max(0, p.hp ?? 0) + "%";
    hpBar.appendChild(hp);

    const dice=document.createElement("img");
    dice.className="dice";
    dice.src = `img/dice${p.roll || 1}.png`;

    div.appendChild(label);
    div.appendChild(img);
    div.appendChild(hpBar);
    div.appendChild(dice);

    return { div, label, charImg: img, hp, dice };
  }

  const p1 = makePlayer(match.player1 ?? { nick:"??", char:"unknown", hp:80, roll:1 });
  const p2 = makePlayer(match.player2 ?? { nick:"??", char:"unknown", hp:80, roll:1 });

  container.appendChild(p1.div);
  container.appendChild(p2.div);
  battleArea.appendChild(container);

  matchUI[match.id] = { p1, p2 };
  renderedMatchesByStage[match.stage]?.add(match.id);

  // pulizia fase precedente
  if(match.stage==="semi" && renderedMatchesByStage.semi.size===2) clearStage("quarter");
  if(match.stage==="final") clearStage("semi");
}

function clearStage(stage){
  const setKey = stage.toLowerCase();
  renderedMatchesByStage[setKey]?.forEach(matchId => {
    const el = document.getElementById(`match-${matchId}`);
    if(el) el.remove();
    delete matchUI[matchId];
  });
  renderedMatchesByStage[setKey]?.clear();
}

  // Handle Damage
  function handleDamage(match){
    if(!match?.id || !matchUI[match.id]) return;
    const refs = matchUI[match.id];
  
    ["player1","player2"].forEach((key,i)=>{
      const player = match[key];
      const ref = i===0 ? refs.p1 : refs.p2;
      if(!player) return;
  
      // Calcola HP in percentuale
      const hpVal = Math.max(0, player.hp ?? 0);
      const hpPercent = Math.round((hpVal / 80) * 100);
  
      // Aggiorna label e barre HP
      ref.label.textContent = `${player.nick || "??"} (${player.char || "unknown"}) HP: ${hpVal}`;
      ref.hp.style.width = hpPercent + "%";
      // --- Aggiorna barra HP con colore dinamico ---
ref.hp.style.width = hpPercent + "%";

if(hpPercent > 60){
  ref.hp.style.background = "linear-gradient(90deg, green, lime)";
} else if(hpPercent > 30){
  ref.hp.style.background = "linear-gradient(90deg, yellow, orange)";
} else {
  ref.hp.style.background = "linear-gradient(90deg, red, darkred)";
}
  
      // Aggiorna immagine personaggio
      ref.charImg.src = getCharImage(player.char, player.hp);
      ref.charImg.onerror = () => { ref.charImg.src = "img/unknown.png"; };
  
      // Aggiorna dado
      const diceVal = player.roll ?? 1;
      ref.dice.src = `img/dice${diceVal}.png`;
    });
  }

// ---------- Winner ----------
function showWinnerChar(char){
  if(!char) return;
  const winnerImg = document.createElement("img");
  winnerImg.src = `img/${char}.webp`;
  winnerImg.onerror = () => { winnerImg.src = "img/${char}.png"; };
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

function playWinnerMusic(winnerChar){
  if(!winnerChar) return;
  musicBattle.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.currentTime = 0;
  winnerMusic.play().catch(()=>{});
}

// ---------- Socket events ----------
socket.on("startTournament", matches => {
  if(waitingContainer) { waitingContainer.remove(); waitingContainer=null; }
  clearMatchesUI();
  currentStage = matches[0]?.stage || "quarter";
  setStage(currentStage);
  matches.forEach(m => renderMatchCard(m));
});

socket.on("startMatch", match => {
  if(match.stage) setStage(match.stage);
  renderMatchCard(match);
});

socket.on("updateMatch", match => {
  renderMatchCard(match); // aggiorna o crea

  if (!matchUI[match.id]) return;

  // Se abbiamo già elaborato questo turno, salta
  if (matchUI[match.id].lastTurn === match.turn) return;

  // Salva il turno corrente
  matchUI[match.id].lastTurn = match.turn;

  // reset filtro messaggi per questo match/turno
  function startNewTurn(matchId){
    lastEventMessagesPerPlayer[matchId] = {};
    if(matchStates[matchId]) {
      matchStates[matchId].stunned = { p1:false, p2:false };
    }
  }
  handleDamage(match);
});

socket.on("matchOver", ({ winnerNick, winnerChar, stage, matchId }) => {
  addEventMessage(`🏆 ${winnerNick ?? "??"} won the match (${stage})!`);
  if(stage==="final") playWinnerMusic(winnerChar);

  if(matchId && matchUI[matchId]){
    const el = document.getElementById(`match-${matchId}`);
    if(el) el.remove();
    delete matchUI[matchId];
  }
});

socket.on("tournamentOver", ({ nick, char }) => {
  addEventMessage(`🎉 ${nick ?? "??"} won the tournament!`);
  showWinnerChar(char);
  playWinnerMusic(char);
  setTimeout(()=> battleArea.innerHTML = "<h2>Waiting for new tournament...</h2>", 2500);
});

socket.on("log", msg => addEventMessage(msg));
socket.on("tournamentState", bracket => renderBracket(bracket));

function renderBracket(bracket){
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
}

document.body.style.overflowY="auto";

