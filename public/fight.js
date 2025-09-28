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

// ---------- ONLINE COUNT ----------
const onlineCountDisplay = document.createElement("div");
onlineCountDisplay.style.cssText = "position:absolute;top:10px;left:10px;color:gold;font-size:1.2rem;text-shadow:1px 1px 4px black;";
document.body.appendChild(onlineCountDisplay);

// ---------- MUSICA ----------
const musicBattle = new Audio("img/9.mp3");
musicBattle.loop = true; musicBattle.volume = 0.5;
let winnerMusic = new Audio(); winnerMusic.loop = false; winnerMusic.volume = 0.7;

// ---------- AUDIO UNLOCK ----------
function unlockAudio() {
  musicBattle.play().catch(()=>{});
  winnerMusic.play().catch(()=>{});
}
window.addEventListener("click", unlockAudio, { once:true });
window.addEventListener("touchstart", unlockAudio, { once:true });

// ---------- FULLSCREEN ----------
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");
fullscreenBtn.addEventListener("click", async () => {
  if(!document.fullscreenElement) await container.requestFullscreen();
  else await document.exitFullscreen();
});

// ---------- INIZIO PARTITA ----------
let nick = localStorage.getItem("selectedNick");
let char = localStorage.getItem("selectedChar");

// Se mancano, richiedi all’utente di reinserire nickname e personaggio
if(!nick || !char){
  nick = prompt("Inserisci il tuo Nickname:");
  char = prompt("Inserisci il nome del personaggio (senza spazi):");
  if(!nick || !char){
    alert("Nickname o personaggio non selezionati. Torna alla home.");
    window.location.href = "/";
  } else {
    localStorage.setItem("selectedNick", nick);
    localStorage.setItem("selectedChar", char);
  }
}

console.log("✅ 1vs1 joining with:", nick, char);
socket.emit("join1vs1", { nick, char });

// ---------- STUN ----------
let stunned = { p1:false, p2:false };

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => { onlineCountDisplay.textContent = `Online: ${count}`; });
socket.on("waiting", msg => addEventMessage(msg));
socket.on("gameStart", game => updateGame(game));
socket.on("1vs1Update", game => updateGame(game));
socket.on("gameOver", ({ winnerNick, winnerChar }) => {
  addEventMessage(`🏆 ${winnerNick} has won the battle!`);
  playWinnerMusic(winnerChar);
  gameOverFlag = true;
});

// ---------- CHAT ----------
chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.value.trim()!==""){
    socket.emit("chatMessage", e.target.value);
    e.target.value="";
  }
});
socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));

// ---------- FUNZIONI ----------
function updateGame(game){
  player1Name.textContent = `${game.player1.nick} (${game.player1.char}) HP: ${game.player1.hp}`;
  player2Name.textContent = `${game.player2.nick} (${game.player2.char}) HP: ${game.player2.hp}`;
  player1HpBar.style.width = `${Math.max(game.player1.hp,0)}%`;
  player2HpBar.style.width = `${Math.max(game.player2.hp,0)}%`;
  if(game.player1.dice) handleDice(0, game);
  if(game.player2.dice) handleDice(1, game);
  updateCharacterImage(game.player1, 0);
  updateCharacterImage(game.player2, 1);
}

function handleDice(playerIndex, game){
  const player = playerIndex===0 ? game.player1 : game.player2;
  let finalDmg = player.dmg;
  if((playerIndex===0 && stunned.p1) || (playerIndex===1 && stunned.p2)){
    finalDmg = Math.max(0, player.dice-1);
    addEventMessage(`${player.nick} is stunned and only deals ${finalDmg} damage 😵‍💫`);
    if(playerIndex===0) stunned.p1=false; else stunned.p2=false;
  } else if(player.dice===8){
    addEventMessage(`${player.nick} CRIT! ${player.dmg} damage ⚡💥`);
    if(playerIndex===0) stunned.p2=true; else stunned.p1=true;
  } else addEventMessage(`${player.nick} rolls ${player.dice} and deals ${finalDmg} damage 💥`);
  showDice(playerIndex, player.dice);
}

function showDice(playerIndex, value){
  const diceEl = playerIndex===0 ? diceP1 : diceP2;
  diceEl.src = `img/dice${value}.png`;
  diceEl.style.cssText="width:80px;height:80px;";
}

function updateCharacterImage(player,index){
  let hp=player.hp; let src=`img/${player.char}`;
  if(hp<=0) src+='0'; else if(hp<=20) src+='20'; else if(hp<=40) src+='40'; else if(hp<=60) src+='60';
  src+='.png';
  if(index===0) player1CharImg.src=src; else player2CharImg.src=src;
}

function addChatMessage(txt){
  const msg=document.createElement("div"); msg.textContent=txt;
  chatMessages.appendChild(msg); chatMessages.scrollTop=chatMessages.scrollHeight;
}

function addEventMessage(txt){
  const msg=document.createElement("div"); msg.textContent=txt;
  eventBox.appendChild(msg); eventBox.scrollTop=eventBox.scrollHeight;
}

function playWinnerMusic(winnerChar){
  musicBattle.pause();
  winnerMusic.src=`img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

document.body.style.overflowY="auto";