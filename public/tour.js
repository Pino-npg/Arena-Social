import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

document.addEventListener("DOMContentLoaded", () => {
  // ---------- SOCKET.IO ----------
  const socket = io("https://fight-game-server-1.onrender.com/tournament");
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

  console.log("Tour JS loaded and DOM ready ✅");

  // ---------- WAITING MESSAGE ----------
  const waitingDiv = document.createElement("div");
  waitingDiv.id = "waiting-msg";
  waitingDiv.style.textAlign = "center";
  waitingDiv.style.margin = "10px 0";
  battleArea.before(waitingDiv);

  // ---------- FULLSCREEN ----------
  fullscreenBtn.addEventListener("click", async () => {
    const container = document.getElementById("game-container");
    if (!document.fullscreenElement) await container.requestFullscreen();
    else await document.exitFullscreen();
  });

  // ---------- TROPHY OVERLAY ----------
  trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
  closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

  // 🔽 … qui sotto resta uguale tutto il codice chat, eventi, match, bracket …
});
// ---------- MUSICA ----------
const music = {5:"img/5.mp3",6:"img/6.mp3",7:"img/7.mp3"};
let musicAudio = new Audio();
musicAudio.loop = true; 
musicAudio.volume = 0.5;
function playMusic(stage){ 
  if(music[stage]){ 
    musicAudio.src = music[stage]; 
    musicAudio.play().catch(()=>{}); 
  }
}

// ---------- JOIN ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
if(!nick || !char){
  alert("Nickname o character non selezionati!");
} else {
  console.log(`Joining tournament with: ${nick} (${char})`);
  socket.emit("joinTournament", {nick, char});
}

// ---------- WAITING COUNT ----------
socket.on("waitingCount", data => {
  console.log("Waiting count update:", data.count, "/", data.required); // DEBUG
  waitingDiv.textContent = data.count < data.required 
    ? `Waiting for ${data.count}/${data.required} players...` 
    : "";
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key==="Enter" && e.target.value.trim()!==""){
    socket.emit("chatMessage", e.target.value);
    e.target.value="";
  }
});
socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));
function addChatMessage(text){
  const msg = document.createElement("div");
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------- EVENTI ----------
function addEventMessage(text){
  const msg = document.createElement("div");
  msg.textContent = text;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}
function showEventEffect(playerDiv, text){
  const span = document.createElement("span");
  span.textContent = text;
  span.classList.add("event-effect");
  playerDiv.appendChild(span);
  setTimeout(()=>span.remove(),1000);
}

// ---------- MATCH & BRACKET ----------
let tournamentBracket = [];

socket.on("matchStart", data => updateMatch([data]));
socket.on("updateMatch", data => updateMatch([data]));

function updateMatch(matches){
  battleArea.innerHTML = "";
  matches.forEach(match => {
    const container = document.createElement("div");
    container.classList.add("match-container");

    const p1Div = createPlayerDiv(match.player1);
    const p2Div = createPlayerDiv(match.player2);

    container.appendChild(p1Div);
    container.appendChild(p2Div);
    battleArea.appendChild(container);

    if(match.stage) playMusic(match.stage);
  });
  updateBracketDisplay();
}

function createPlayerDiv(player){
  const div = document.createElement("div");
  div.classList.add("player");
  div.innerHTML = `
    <div class="player-label">${player.nick} (${player.char})</div>
    <img class="char-img" src="img/${player.char}.webp" alt="${player.nick}">
    <div class="hp-bar"><div class="hp" style="width:${player.hp}%"></div></div>
    <img class="dice" src="img/dice1.png">
  `;
  return div;
}

// ---------- LOG & HP ----------
socket.on("log", msg => {
  addEventMessage(msg);

  battleArea.querySelectorAll(".match-container").forEach(container=>{
    container.querySelectorAll(".player").forEach(div=>{
      const diceImg = div.querySelector(".dice");
      const hpDiv = div.querySelector(".hp");
      const playerNick = div.querySelector(".player-label").textContent.split(" ")[0];

      if(msg.includes(playerNick)){
        const diceVal = msg.match(/rolls (\d+)/)?.[1] || 1;
        diceImg.src = `img/dice${diceVal}.png`;
        diceImg.style.width = "80px";
        diceImg.style.height = "80px";

        const dmg = parseInt(msg.match(/deals (\d+)/)?.[1] || 0);
        const currentHP = parseInt(hpDiv.style.width);
        const newHP = Math.max(0, currentHP - dmg);
        animateHP(hpDiv, currentHP, newHP);

        showEventEffect(div, "💥");
      }
    });
  });
});

function animateHP(hpDiv, from, to){
  const step = from>to?-1:1;
  let val = from;
  const interval = setInterval(()=>{
    if(val===to){ clearInterval(interval); return; }
    val += step;
    hpDiv.style.width = val + "%";
  },30);
}

// ---------- BRACKET DISPLAY ----------
function updateBracketDisplay(){
  bracket.innerHTML="";
  tournamentBracket.forEach(m=>{
    const row = document.createElement("div");
    row.textContent = `${m.player1} vs ${m.player2} → Winner: ${m.winner}`;
    bracket.appendChild(row);
  });
}

// ---------- MATCH/TORNEO FINITI ----------
socket.on("matchOver", data=>{
  console.log("Match over event:", data); // DEBUG
  addEventMessage(`🏆 ${data.winner} won the match!`);
  tournamentBracket.push({player1:data.player1.nick, player2:data.player2.nick, winner:data.winner});
  updateBracketDisplay();
});
socket.on("tournamentOver", winner=>{
  console.log("Tournament over:", winner); // DEBUG
  addEventMessage(`🏆 ${winner.nick} won the Tournament!`);
  document.body.style.backgroundImage=`url("img/${winner.char}.webp")`;
  musicAudio.pause();
  waitingDiv.textContent="";
});

// ---------- MOBILE SCROLL FIX ----------
document.body.style.overflowY="auto";