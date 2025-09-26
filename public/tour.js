import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io("/tournament"); // usa lo stesso origin; in deploy punta a fight-game-server.onrender.com

// elementi UI
const battleArea = document.getElementById("battle-area");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const trophyBtn = document.getElementById("trophy-btn");
const overlay = document.getElementById("tournament-overlay");
const bracket = document.getElementById("bracket");
const closeOverlayBtn = document.getElementById("close-overlay");

const matchUI = {}; // map matchId -> { p1, p2 }

// music
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true; musicBattle.volume = 0.5;
let winnerMusic = new Audio(); winnerMusic.volume = 0.7;

// unlock audio on first interaction
function unlockAudio(){ musicBattle.play().catch(()=>{}); winnerMusic.play().catch(()=>{}); }
window.addEventListener("click", unlockAudio, { once:true });
window.addEventListener("touchstart", unlockAudio, { once:true });

// fullscreen
fullscreenBtn.addEventListener("click", async ()=>{
  const container = document.getElementById("game-container");
  if(!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// overlay
trophyBtn.addEventListener("click", ()=> overlay.classList.remove("hidden"));
closeOverlayBtn.addEventListener("click", ()=> overlay.classList.add("hidden"));

// chat
chatInput.addEventListener("keydown", e=>{
  if(e.key==="Enter" && e.target.value.trim()!==""){
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});
socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));
function addChatMessage(txt){ const d=document.createElement("div"); d.textContent=txt; chatMessages.appendChild(d); chatMessages.scrollTop=chatMessages.scrollHeight; }

// events box
function addEventMessage(txt){ const d=document.createElement("div"); d.textContent=txt; eventBox.appendChild(d); eventBox.scrollTop=eventBox.scrollHeight; }

// waiting list
socket.on("waitingCount", ({count, required, players})=>{
  if(count < required){
    battleArea.innerHTML = `
      <div class="waiting-container">
        <h2>In attesa di giocatori... (${count}/${required})</h2>
        <ul>${players.map(p => `<li>${escapeHtml(p.nick)} (${escapeHtml(p.char)})</li>`).join("")}</ul>
      </div>
    `;
  } else {
    // if there are active matches, server will send startTournament; but clear waiting UI
    if(Object.keys(matchUI).length === 0) battleArea.innerHTML = `<h2>Preparazione quarti...</h2>`;
  }
});

// startTournament = server tells all currently active matches
socket.on("startTournament", matches => {
  // matches is array of match objects
  // clear waiting text
  if(!matches || matches.length === 0){
    battleArea.innerHTML = `<h2>In attesa di torneo...</h2>`;
    return;
  }
  // render matches array (may be multiple)
  battleArea.innerHTML = "";
  matches.forEach(match => renderMatchCard(match));
});

// updateMatch (turn updates)
socket.on("updateMatch", match => {
  // match: { id, stage, player1, player2 }
  updateMatchUI(match);
});

// logs and matchOver
socket.on("log", msg => addEventMessage(msg));
socket.on("matchOver", ({ winnerNick, winnerChar })=>{
  addEventMessage(`🏆 ${winnerNick} ha vinto il match!`);
  playWinnerMusic(winnerChar);
});
socket.on("tournamentOver", ({ nick, char })=>{
  addEventMessage(`🎉 ${nick} ha vinto il torneo!`);
  playWinnerMusic(char);
  setTimeout(()=> battleArea.innerHTML = "<h2>In attesa nuovo torneo...</h2>", 2000);
});

// helper: render a single match card (and store refs)
function renderMatchCard(match){
  if(matchUI[match.id]) return; // already exists

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

function makePlayerCard(player){
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
  hp.style.width = Math.max(0,player.hp) + "%";
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

function updateMatchUI(match){
  const ui = matchUI[match.id];
  // If UI for match doesn't exist, create it (server might send update after start)
  if(!ui){
    renderMatchCard(match);
  }
  const refs = matchUI[match.id];
  // update p1
  refs.p1.label.textContent = `${match.player1.nick} (${match.player1.char}) HP: ${match.player1.hp}`;
  refs.p1.hp.style.width = Math.max(0,match.player1.hp) + "%";
  refs.p1.charImg.src = getCharImage(match.player1);
  if(match.player1.dice) { refs.p1.dice.src = `img/dice${match.player1.dice}.png`; refs.p1.dice.style.width="80px"; refs.p1.dice.style.height="80px"; }

  // update p2
  refs.p2.label.textContent = `${match.player2.nick} (${match.player2.char}) HP: ${match.player2.hp}`;
  refs.p2.hp.style.width = Math.max(0,match.player2.hp) + "%";
  refs.p2.charImg.src = getCharImage(match.player2);
  if(match.player2.dice) { refs.p2.dice.src = `img/dice${match.player2.dice}.png`; refs.p2.dice.style.width="80px"; refs.p2.dice.style.height="80px"; }
}

function getCharImage(player){
  let src = `img/${player.char}`;
  if(player.hp <= 0) src += "0";
  else if(player.hp <= 20) src += "20";
  else if(player.hp <= 40) src += "40";
  else if(player.hp <= 60) src += "60";
  src += ".png";
  return src;
}

function playWinnerMusic(winnerChar){
  musicBattle.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

// small helper: escape HTML in waiting list
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ensure scroll/overflow ok on mobile
document.body.style.overflowY = "auto";