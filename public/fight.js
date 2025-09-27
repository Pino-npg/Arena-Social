import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const socket = io();

// ---------- ELEMENTI ----------
const player1Box = document.getElementById("player1");
const player2Box = document.getElementById("player2");

const player1Name = document.getElementById("player1-nick");
const player2Name = document.getElementById("player2-nick");

const player1HpBar = document.getElementById("player1-hp");
const player2HpBar = document.getElementById("player2-hp");

const player1CharImg = document.getElementById("player1-char");
const player2CharImg = document.getElementById("player2-char");

const diceP1 = document.getElementById("dice-p1");
const diceP2 = document.getElementById("dice-p2");

const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventBox = document.getElementById("event-messages");

// Online count
const onlineCountDisplay = document.createElement("div");
onlineCountDisplay.style.position = "absolute";
onlineCountDisplay.style.top = "10px";
onlineCountDisplay.style.left = "10px";
onlineCountDisplay.style.color = "gold";
onlineCountDisplay.style.fontSize = "1.2rem";
onlineCountDisplay.style.textShadow = "1px 1px 4px black";
document.body.appendChild(onlineCountDisplay);

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true;
musicBattle.volume = 0.5;

let winnerMusic = new Audio();
winnerMusic.loop = false;
winnerMusic.volume = 0.7;

function unlockAudio() {
  if (musicBattle.paused) musicBattle.play().catch(()=>{});
  if (winnerMusic.paused) winnerMusic.play().catch(()=>{});
}

window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("touchstart", unlockAudio, { once: true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");
fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- INIZIO PARTITA ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");
socket.emit("join1vs1", { nick, char });

// ---------- GESTIONE STUN ----------
let stunned = { p1: false, p2: false };

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => {
  onlineCountDisplay.textContent = `Online: ${count}`;
});

socket.on("waiting", msg => addEventMessage(msg));

socket.on("gameStart", game => updateGame(game));
socket.on("1vs1Update", game => updateGame(game));

socket.on("gameOver", ({ winnerNick, winnerChar }) => {
  addEventMessage(`🏆 ${winnerNick} has won the battle!`);
  playWinnerMusic(winnerChar);
  gameOverFlag = true; // partita finita
  // ⚡ chat rimane attiva
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.value.trim() !== "") {
    // Invia sempre messaggio anche se gameOver
    socket.emit("chatMessage", e.target.value);
    e.target.value = "";
  }
});

socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));

// ---------- FUNZIONI ----------
function updateGame(game) {
  player1Name.textContent = `${game.player1.nick} (${game.player1.char}) HP: ${game.player1.hp}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.char}) HP: ${game.player2.hp}`;

  player1HpBar.style.width = `${Math.max(game.player1.hp,0)}%`;
  player2HpBar.style.width = `${Math.max(game.player2.hp,0)}%`;

  if(game.player1.dice) handleDice(0, game);
  if(game.player2.dice) handleDice(1, game);

  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);
}

// ---------- Damage handling ----------
function handleDamage(match){
  if(!match?.id || !matchUI[match.id]) return;
  if(matchUI[match.id].processed) return; // evita doppio processamento
  matchUI[match.id].processed = true;
  const refs = matchUI[match.id];

  ["player1","player2"].forEach((key,i)=>{
    const player = match[key];
    const ref = i===0 ? refs.p1 : refs.p2;
    if(!player) return;

    const dmg = player.dmg ?? 0;
    const diceDisplay = player.dice ?? 1;

    if((i===0 && stunned.p1) || (i===1 && stunned.p2)){
      addEventMessage(`${player.nick} is stunned! Rolled ${diceDisplay} → deals ${dmg} 😵‍💫`);
      if(i===0) stunned.p1=false; else stunned.p2=false;
    } 
    else if(diceDisplay === 8){
      addEventMessage(`${player.nick} CRIT! Rolled 8 → ${dmg} damage ⚡💥`);
      if(i===0) stunned.p2=true; else stunned.p1=true;
    } 
    else {
      addEventMessage(`${player.nick} rolls ${diceDisplay} and deals ${dmg} 💥`);
    }

    // Aggiorna UI correttamente
    ref.label.textContent=`${player.nick} (${player.char}) HP: ${player.hp}`;
    ref.hp.style.width=Math.max(0,player.hp)+"%";
    ref.charImg.src = getCharImage(player.char, player.hp);
    ref.dice.src = `img/dice${diceDisplay}.png`;
  });
}

socket.on("updateMatch", match => handleDamage(match));

  showDice(playerIndex, player.dice);


function showDice(playerIndex, value){
  const diceEl = playerIndex === 0 ? diceP1 : diceP2;
  diceEl.src = `img/dice${value}.png`;
  diceEl.style.width = "80px";
  diceEl.style.height = "80px";
}

function updateCharacterImage(player,index){
  let hp = player.hp;
  let src = `img/${player.char}`;
  if(hp<=0) src+='0';
  else if(hp<=20) src+='20';
  else if(hp<=40) src+='40';
  else if(hp<=60) src+='60';
  src+='.png';
  if(index===0) player1CharImg.src=src;
  else player2CharImg.src=src;
}

function addChatMessage(text) {
  const msg = document.createElement("div");
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addEventMessage(text) {
  const msg = document.createElement("div");
  msg.textContent = text;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

function playWinnerMusic(winnerChar) {
  musicBattle.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(err => console.log("⚠️ Audio non avviato automaticamente:", err));
}

// ---------- FIX SCROLL MOBILE ----------
document.body.style.overflowY = "auto";