import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io("/tournament");

// ---------- RESET LOCALSTORAGE ----------
localStorage.removeItem("selectedNick");
localStorage.removeItem("selectedChar");

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

// ---------- STATE ----------
let matchUI = {};
let currentStage = "waiting";
let waitingContainer = null;
let stunned = { p1:false, p2:false };

// ---------- AUDIO ----------
const musicQuarter = "img/5.mp3";
const musicSemi = "img/6.mp3";
const musicFinal = "img/7.mp3";

const musicBattle = new Audio(musicQuarter);
musicBattle.loop = true;
musicBattle.volume = 0.5;

let winnerMusic = new Audio();
winnerMusic.loop = false;
winnerMusic.volume = 0.7;

// ---------- AUDIO UNLOCK ----------
function unlockAudio() {
  musicBattle.play().catch(()=>{});
  winnerMusic.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once:true });
window.addEventListener("touchstart", unlockAudio, { once:true });

// ---------- FULLSCREEN ----------
fullscreenBtn.addEventListener("click", async () => {
  const container = document.getElementById("game-container");
  if(!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- OVERLAY ----------
trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key==="Enter" && e.target.value.trim()!==""){
    socket.emit("chatMessage", e.target.value);
    e.target.value="";
  }
});
socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));

function addChatMessage(txt) {
  const d=document.createElement("div");
  d.textContent=txt;
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addEventMessage(txt){
  const d=document.createElement("div");
  d.textContent=txt;
  eventBox.appendChild(d);
  eventBox.scrollTop=eventBox.scrollHeight;
}

// ---------- HELPERS ----------
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]); }
function clearMatchesUI(){ Object.keys(matchUI).forEach(id=>{ const el=document.getElementById(`match-${id}`); if(el) el.remove(); }); matchUI={}; }

function getCharImage(char,hp=100){
  if(!char) return "img/unknown.png";
  let suffix="";
  if(hp<=0) suffix='0';
  else if(hp<=20) suffix='20';
  else if(hp<=40) suffix='40';
  else if(hp<=60) suffix='60';
  return `img/${char.replace(/\s/g,'')}${suffix}.png`;
}

// ---------- JOIN TOURNAMENT ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if(nick && char){
  socket.emit("joinTournament",{ nick,char });
  renderWaiting(0,8,[]);
} else battleArea.innerHTML="<h2>Error: Missing nickname or character. Return to home page.</h2>";

// ---------- WAITING ----------
socket.on("waitingCount", ({ count, required, players }) => {
  if(currentStage==="waiting") renderWaiting(count, required, players);
});

function renderWaiting(count,required,players){
  if(waitingContainer) waitingContainer.remove();
  waitingContainer=document.createElement("div");
  waitingContainer.className="waiting-container";

  const title=document.createElement("h2");
  title.textContent=`Waiting for players... (${count}/${required})`;
  waitingContainer.appendChild(title);

  const ul=document.createElement("ul");
  players.forEach(p=>{
    const li=document.createElement("li");
    const img=document.createElement("img");
    img.src=getCharImage(p.char);
    img.alt=p.char??"unknown";
    img.width=32; img.height=32;
    img.onerror=()=>{ img.src="img/unknown.png"; };
    li.appendChild(img);
    li.appendChild(document.createTextNode(` ${p.nick} (${p.char})`));
    ul.appendChild(li);
  });

  waitingContainer.appendChild(ul);
  battleArea.prepend(waitingContainer);
}

// ---------- STAGES & MUSIC ----------
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
  title.textContent=stage==="quarter"?"⚔️ Quarter-finals":stage==="semi"?"🔥 Semi-finals":"👑 Final!";
  battleArea.prepend(title);
}

function setMusic(src){
  if(!src) return;
  const wasPlaying = !musicBattle.paused;
  musicBattle.src=src;
  if(wasPlaying) musicBattle.play().catch(()=>{});
}

// ---------- MATCHES ----------
function makePlayerCard(player){
  const div=document.createElement("div");
  div.className="player";
  const label=document.createElement("div");
  label.className="player-label";
  label.textContent=`${player.nick} (${player.char}) HP: ${player.hp??0}`;
  const img=document.createElement("img");
  img.className="char-img";
  img.src=getCharImage(player.char,player.hp);
  img.onerror=()=>{ img.src="img/unknown.png"; };
  const hpBar=document.createElement("div"); hpBar.className="hp-bar";
  const hp=document.createElement("div"); hp.className="hp"; hp.style.width=Math.max(0,player.hp??0)+"%";
  hpBar.appendChild(hp);
  const dice=document.createElement("img"); dice.className="dice"; dice.src="img/dice1.png";
  div.appendChild(label); div.appendChild(img); div.appendChild(hpBar); div.appendChild(dice);
  return { div,label,charImg:img,hp,dice };
}

function renderMatchCard(match){
  if(!match?.id) return;
  if(matchUI[match.id]) { handleDamage(match); return; }
  const container=document.createElement("div");
  container.className="match-container";
  container.id=`match-${match.id}`;
  const stageLabel=document.createElement("h3");
  stageLabel.textContent=`${match.stage.toUpperCase()} - ${match.id}`;
  container.appendChild(stageLabel);
  const p1 = makePlayerCard(match.player1||{ nick:"??", char:"??", hp:0 });
  const p2 = makePlayerCard(match.player2||{ nick:"??", char:"??", hp:0 });
  container.appendChild(p1.div); container.appendChild(p2.div);
  battleArea.appendChild(container);
  matchUI[match.id]={ p1, p2 };
}

// ---------- DAMAGE ----------
function handleDamage(match){
  if(!match?.id || !matchUI[match.id]) return;
  const refs=matchUI[match.id];
  ["player1","player2"].forEach((key,i)=>{
    const player=match[key]; if(!player) return;
    const ref=i===0? refs.p1 : refs.p2;
    let dmg=player.dmg??0;
    const diceDisplay=player.dice??1;
    if((i===0 && stunned.p1)||(i===1 && stunned.p2)){
      dmg=Math.max(0,dmg-1);
      addEventMessage(`${player.nick} is stunned! Deals only ${dmg} damage 😵‍💫`);
      if(i===0) stunned.p1=false; else stunned.p2=false;
    } else if(player.dice===8){
      addEventMessage(`${player.nick} CRIT! ${dmg} damage ⚡💥`);
      if(i===0) stunned.p2=true; else stunned.p1=true;
    } else addEventMessage(`${player.nick} rolls ${diceDisplay} and deals ${dmg} damage 💥`);
    ref.label.textContent=`${player.nick} (${player.char}) HP: ${player.hp}`;
    ref.hp.style.width=Math.max(0,player.hp)+"%";
    ref.charImg.src=getCharImage(player.char,player.hp);
    ref.dice.src=`img/dice${diceDisplay}.png`;
  });
}

socket.on("updateMatch", match=>handleDamage(match));

// ---------- WINNER ----------
function showWinnerChar(char){
  if(!char) return;
  const winnerImg=document.createElement("img");
  winnerImg.src=`img/${char}.webp`;
  winnerImg.onerror=()=>{ winnerImg.src=`img/${char}.png`; };
  Object.assign(winnerImg.style,{
    position:"fixed", top:0, left:0, width:"100%", height:"100%",
    objectFit:"contain", zIndex:9999, backgroundColor:"black"
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

// ---------- SOCKET EVENTS ----------
socket.on("startTournament", matches=>{
  if(waitingContainer){ waitingContainer.remove(); waitingContainer=null; }
  clearMatchesUI();
  currentStage=matches[0]?.stage||"quarter";
  setStage(currentStage);
  matches.forEach(m=>renderMatchCard(m));
});

socket.on("startMatch", match=>{
  if(match.stage) setStage(match.stage);
  renderMatchCard(match);
});

socket.on("matchOver", ({ winnerNick, winnerChar, stage })=>{
  addEventMessage(`🏆 ${winnerNick??"??"} won the match (${stage})!`);
  if(stage==="final") playWinnerMusic(winnerChar);
});

socket.on("tournamentOver", ({ nick, char })=>{
  addEventMessage(`🎉 ${nick??"??"} won the tournament!`);
  showWinnerChar(char);
  playWinnerMusic(char);
  setTimeout(()=> battleArea.innerHTML="<h2>Waiting for new tournament...</h2>",2500);
});

socket.on("log", msg => addEventMessage(msg));
socket.on("tournamentState", bracket => renderBracket(bracket));

function renderBracket(bracket){
  bracketContainer.innerHTML="";
  if(currentStage==="final"){
    const table=document.createElement("table");
    table.style.width="100%"; table.style.borderCollapse="collapse";
    const head=document.createElement("tr");
    head.innerHTML="<th>Player 1</th><th>Player 2</th><th>Winner</th><th>Stage</th>";
    table.appendChild(head);
    bracket.forEach(m=>{
      const row=document.createElement("tr");
      row.innerHTML=`<td>${m.player1?.nick||"??"}</td>
                     <td>${m.player2?.nick||"??"}</td>
                     <td>${m.winner?.nick||"??"}</td>
                     <td>${m.stage}</td>`;
      table.appendChild(row);
    });
    bracketContainer.appendChild(table);
  } else bracket.forEach(m=>{
    const div=document.createElement("div");
    div.className="bracket-row";
    const p1=m.player1?.nick??"??";
    const p2=m.player2?.nick??"??";
    const winner=m.winner?` - Winner: ${escapeHtml(m.winner.nick)}`:"";
    div.textContent=`${p1} vs ${p2} (${m.stage})${winner}`;
    if(m.winner) div.style.color="#FFD700";
    bracketContainer.appendChild(div);
  });
}

document.body.style.overflowY="auto";