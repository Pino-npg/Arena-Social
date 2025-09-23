import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// ---------- SOCKET.IO ----------
const socket = io("http://localhost:10001/tournament");

// ---------- ELEMENTI ----------
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracket = document.getElementById("bracket");
document.getElementById("close-overlay").addEventListener("click", ()=> overlay.classList.add("hidden"));

// ---------- MESSAGGIO WAITING ----------
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

if (!nick || !char) {
  alert("Nickname o character non selezionati!");
} else {
  socket.emit("joinTournament",{nick,char});
}

// ---------- WAITING COUNT ----------
socket.on("waitingCount", data => {
  if (data.count < data.required) {
    waitingDiv.textContent = `Waiting for ${data.count}/${data.required} players...`;
  } else {
    waitingDiv.textContent = "";
  }
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.value.trim() !== ""){
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
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
  setTimeout(() => span.remove(), 1000);
}

// ---------- AGGIORNAMENTO MATCH ----------
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
  updateBracket();
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

// ---------- DADI ANIMATI & HP ----------
socket.on("log", msg => {
  addEventMessage(msg);

  const matchDivs = battleArea.querySelectorAll(".match-container");
  matchDivs.forEach(container => {
    const pDivs = container.querySelectorAll(".player");
    pDivs.forEach(div => {
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
  const step = from > to ? -1 : 1;
  let val = from;
  const interval = setInterval(()=>{
    if(val === to){ clearInterval(interval); return; }
    val += step;
    hpDiv.style.width = val + "%";
  }, 30);
}

// ---------- BRACKET ----------
const tournamentBracket = []; // array per memorizzare i match completati

function updateBracketDisplay(matches){
  bracket.innerHTML = "";
  
  // Prima mostra i match completati
  tournamentBracket.forEach(m => {
    const row = document.createElement("div");
    if(m.winner){
      row.textContent = `${m.player1} ${m.winner === m.player1 ? "🏆" : ""} vs ${m.player2} ${m.winner === m.player2 ? "🏆" : ""}`;
    } else {
      row.textContent = `${m.player1} vs ${m.player2}`;
    }
    bracket.appendChild(row);
  });

  // Poi aggiunge i match in corso
  matches.forEach(m => {
    const row = document.createElement("div");
    row.textContent = `${m.player1.nick} vs ${m.player2.nick}`;
    bracket.appendChild(row);
  });
}

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

  updateBracketDisplay(matches);
}

// ---------- MATCH & TOURNAMENT FINITI ----------
socket.on("matchOver", data => {
  addEventMessage(`🏆 ${data.winner} won the match!`);
  // salva match completato per il bracket
  tournamentBracket.push({ player1: data.player1, player2: data.player2, winner: data.winner });
  updateBracketDisplay([]);
});

socket.on("tournamentOver", winner => {
  addEventMessage(`🏆 ${winner.nick} won the Tournament!`);
  document.body.style.backgroundImage = `url("img/${winner.char}.webp")`;
  musicAudio.pause();
  waitingDiv.textContent = "";
});

// ---------- TROPHY BTN ----------
trophyBtn.addEventListener("click", ()=> overlay.classList.remove("hidden"));

// ---------- MOBILE SCROLL FIX ----------
document.body.style.overflowY = "auto";