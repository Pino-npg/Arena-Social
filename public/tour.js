import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// ---------- Socket ----------
const socket = io("/tournament");

// ---------- DOM elements ----------
let battleArea, chatMessages, chatInput, eventBox;
let fullscreenBtn, trophyBtn, overlay, bracketContainer, closeOverlayBtn;

// ---------- State ----------
let matchUI = {};
let currentStage = "waiting";
let waitingContainer = null;
let stunned = { p1: false, p2: false };
let renderedMatchesByStage = { quarter: new Set(), semi: new Set(), final: new Set() };
const lastEventMessagesPerPlayer = {};

// ---------- Music ----------
const musicQuarter = "img/5.mp3";    
const musicSemi    = "img/6.mp3"; 
const musicFinal   = "img/7.mp3";

const musicBattle = new Audio();
musicBattle.loop = true;
musicBattle.volume = 0.5;

const winnerMusic = new Audio();
winnerMusic.loop = false;
winnerMusic.volume = 0.7;

// ---------- Audio unlock ----------
function unlockAudio() {
  if (musicBattle.paused) musicBattle.play().catch(() => {});
  if (winnerMusic.paused) winnerMusic.play().catch(() => {});
}
window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true });

// ---------- Helpers ----------
function escapeHtml(s) { 
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]); 
}
function getCharImage(char, hp = 100) {
  if (!char) return "img/unknown.png";
  let suffix = "";
  if (hp <= 0) suffix = '0';
  else if (hp <= 20) suffix = '20';
  else if (hp <= 40) suffix = '40';
  else if (hp <= 60) suffix = '60';
  return `img/${char.replace(/\s/g,'')}${suffix}.png`;
}

// ---------- DOMContentLoaded ----------
document.addEventListener("DOMContentLoaded", () => {
  document.body.style.overflowY = "auto";

  // Elementi DOM
  battleArea       = document.getElementById("battle-area");
  chatMessages     = document.getElementById("chat-messages");
  chatInput        = document.getElementById("chat-input");
  eventBox         = document.getElementById("event-messages");
  fullscreenBtn    = document.getElementById("fullscreen-btn");
  trophyBtn        = document.getElementById("tournament-overlay-btn") || document.getElementById("trophy-btn");
  overlay          = document.getElementById("tournament-overlay");
  bracketContainer = document.getElementById("bracket");
  closeOverlayBtn  = document.getElementById("close-overlay");

  // … resto del codice DOMContentLoaded …
});

// ---------- Join tournament ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if(nick && char){
  socket.emit("joinTournament", { nick, char });
  renderWaiting(0,8,[]);
} else {
  if(battleArea) battleArea.innerHTML = "<h2>Error: Missing nickname or character. Return to home page.</h2>";
}

// ---------- Waiting ----------
socket.on("waitingCount", ({ count, required, players }) => {
  if(currentStage==="waiting") renderWaiting(count, required, players);
});

function renderWaiting(count, required, players){
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
  if(battleArea) battleArea.prepend(waitingContainer);
}

// ---------- Stage ----------
function setStage(stage){
  if(stage===currentStage) return;
  currentStage = stage;

  // --- Rimuovi vecchi match ---
  if(stage==="semi"){
    renderedMatchesByStage.quarter.forEach(id=>{
      const el=document.getElementById(`match-${id}`);
      if(el) el.remove();
      delete matchUI[id];
    });
    renderedMatchesByStage.quarter.clear();
  } else if(stage==="final"){
    renderedMatchesByStage.semi.forEach(id=>{
      const el=document.getElementById(`match-${id}`);
      if(el) el.remove();
      delete matchUI[id];
    });
    renderedMatchesByStage.semi.clear();
  }

  // --- Titolo ---
  const old = battleArea.querySelector(".stage-title");
  if(old) old.remove();

  const title = document.createElement("h2");
  title.className = "stage-title";
  title.textContent = stage==="quarter" ? "⚔️ Quarter-finals" :
                      stage==="semi"    ? "🔥 Semi-finals" :
                      "👑 Final!";
  battleArea.prepend(title);

  // --- Musica ---
  if(stage==="quarter") setMusic(musicQuarter);
  else if(stage==="semi") setMusic(musicSemi);
  else if(stage==="final") setMusic(musicFinal);
}

function setMusic(src){
  if(!src) return;
  musicBattle.pause();
  musicBattle.src = src;
  musicBattle.load();
  musicBattle.volume = 0.5;
  musicBattle.loop = true;
  musicBattle.play().catch(()=>{});
}
// ---------- Matches ----------
function makePlayerCard(player){
  const div = document.createElement("div");
  div.className="player";

  const label = document.createElement("div");
  label.className="player-label";
  label.textContent=`${player.nick} (${player.char}) HP: ${player.hp??0}`;

  const img = document.createElement("img");
  img.className="char-img";
  img.src = getCharImage(player.char, player.hp);
  img.onerror = () => { img.src="img/unknown.png"; };

  const hpBar = document.createElement("div");
  hpBar.className="hp-bar";
  const hp = document.createElement("div");
  hp.className="hp";
  hp.style.width = Math.max(0, player.hp??0)+"%";
  hpBar.appendChild(hp);

  const dice = document.createElement("img");
  dice.className="dice";
  dice.src="img/dice1.png";

  div.appendChild(label);
  div.appendChild(img);
  div.appendChild(hpBar);
  div.appendChild(dice);

  return { div, label, charImg: img, hp, dice };
}

function renderMatchCard(match){
  if(!match?.id) return;
  if(matchUI[match.id]) { updateMatchUI(match); return; }

  const container = document.createElement("div");
  container.className="match-container";
  container.id=`match-${match.id}`;

  const stageLabel = document.createElement("h3");

  // Solo Q / S / F
  let stageShort = match.stage === "quarter" ? "Q" :
                   match.stage === "semi"    ? "S" :
                   "F";
  stageLabel.textContent = stageShort;
  container.appendChild(stageLabel);

  const p1 = makePlayerCard(match.player1??{nick:"??",char:"unknown",hp:0});
  const p2 = makePlayerCard(match.player2??{nick:"??",char:"unknown",hp:0});

  container.appendChild(p1.div);
  container.appendChild(p2.div);
  if(battleArea) battleArea.appendChild(container);

  matchUI[match.id]={ p1, p2 };
  renderedMatchesByStage[match.stage]?.add(match.id);
}

// ---------- Damage handling ----------
function handleDamage(match){
  if(!match?.id || !matchUI[match.id]) return;
  const refs = matchUI[match.id];

  ["player1","player2"].forEach((key,i)=>{
    const player = match[key];
    const ref = i===0 ? refs.p1 : refs.p2;
    if(!player) return;

    const diceDisplay = (player.roll ?? player.dice ?? 1);
    const dmg = (player.dmg ?? player.dice ?? 0);

    if((i===0 && stunned.p1) || (i===1 && stunned.p2)){
      addEventMessageSingle(player.nick, `${player.nick} is stunned! Rolled ${diceDisplay} → deals only ${dmg} 😵‍💫`);
      if(i===0) stunned.p1=false; else stunned.p2=false;
    }
    else if(player.roll===8 || player.dice===8){
      addEventMessageSingle(player.nick, `${player.nick} CRIT! Rolled ${diceDisplay} → deals ${dmg} ⚡💥`);
    }
    else addEventMessageSingle(player.nick, `${player.nick} rolls ${diceDisplay} and deals ${dmg} 💥`);

    const hpVal = Math.max(0,player.hp??0);
    const hpPercent = Math.round((hpVal/80)*100);
    ref.label.textContent = `${player.nick} (${player.char}) HP: ${hpVal}`;
    ref.hp.style.width = hpPercent+"%";
    ref.charImg.src = getCharImage(player.char,player.hp);
    ref.dice.src=`img/dice${diceDisplay}.png`;
  });
}

// ---------- Chat events ----------
socket.on("chatMessage", data => {
  if(chatMessages) {
    const div = document.createElement("div");
    div.textContent = `${data.nick}: ${data.text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

socket.on("log", msg => addEventMessage(msg));

// ---------- Winner ----------
function showWinnerChar(char){
  if(!char) return;
  const winnerImg = document.createElement("img");
  winnerImg.src=`img/${char}.webp`;
  winnerImg.onerror=()=>{ winnerImg.src=`img/${char}.png`; };
  Object.assign(winnerImg.style,{
    position:"fixed", top:"0", left:"0", width:"100%", height:"100%",
    objectFit:"contain", zIndex:"9999", backgroundColor:"black"
  });
  document.body.appendChild(winnerImg);
  winnerImg.addEventListener("click",()=>winnerImg.remove());
}

function playWinnerMusic(winnerChar){
  if(!winnerChar) return;
  musicBattle.pause();
  winnerMusic.src=`img/${winnerChar}.mp3`;
  winnerMusic.currentTime=0;
  winnerMusic.play().catch(()=>{});
}
