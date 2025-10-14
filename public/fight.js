// fight.js (client)
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
const onlineCountDisplay = document.getElementById("onlineCount");
const homeBtn = document.getElementById("homeBtn");

// ---------- MUSIC ----------
const battleMusic = new Audio("audio/battle.mp3");
battleMusic.loop = true;
battleMusic.volume = 0.3;
const victoryMusic = new Audio("audio/victory.mp3");
victoryMusic.volume = 0.5;

// ---------- HOME BUTTON ----------
homeBtn.addEventListener("click", () => window.location.href = "/");

// ---------- GIOCATORE ----------
const nick = localStorage.getItem("selectedNick");
const char = localStorage.getItem("selectedChar");

// Guard: evita join multipli
let joined1v1 = false;
function tryJoin1v1() {
  if (!joined1v1 && nick && char) {
    socket.emit("join1vs1", { nick, char });
    joined1v1 = true;
  }
}
tryJoin1v1();

// ---------- STATO ----------
let currentGame = null; // { id, me, opp }
let timer = 10;
let countdownInterval = null;
let inRevealPhase = false;

// timer container
const timerContainer = document.createElement("div");
timerContainer.id = "timer-container";
timerContainer.textContent = timer;
document.getElementById("battle-area").appendChild(timerContainer);

// ---------- CREATE BUTTONS ----------
function createChoiceButtons(playerBox, playerId) {
  const container = document.createElement("div");
  container.className = "choice-buttons";
  container.id = `choice-buttons-${playerId}`;
  container.innerHTML = `
    <button class="choice-btn water">💧</button>
    <button class="choice-btn wood">🪵</button>
    <button class="choice-btn fire">🔥</button>
  `;
  playerBox.appendChild(container);
  return {
    water: container.querySelector(".water"),
    wood: container.querySelector(".wood"),
    fire: container.querySelector(".fire")
  };
}
const buttonsMap = { p1: createChoiceButtons(player1Box,"p1"), p2: createChoiceButtons(player2Box,"p2") };

// click handlers
Object.entries(buttonsMap).forEach(([player, btns]) => {
  Object.entries(btns).forEach(([choice, btn]) => {
    btn.addEventListener("click", () => {
      if (inRevealPhase) return;
      if (!currentGame) return;
      if (stunnedMe()) return;
      socket.emit("selectChoice", { gameId: currentGame.id, choice });
      addEventMessageSingle("you", `You chose ${choice.toUpperCase()}`);
      disableButtons("p1"); disableButtons("p2");
    });
  });
});

function stunnedMe() {
  return !!currentGame?.me?.stunned;
}

// ---------- SOCKET EVENTS ----------
socket.on("onlineCount", count => {
  onlineCountDisplay.textContent = `Online: ${count}`;
  tryJoin1v1();
});

socket.on("waiting", msg => addEventMessageSingle("system", msg));
socket.on("log", msg => addEventMessageSingle("system", msg));

socket.on("gameStart", (gameId, payload) => {
  currentGame = { id: gameId, me: payload.me, opp: payload.opp };
  inRevealPhase = false;
  timer = 10;
  timerContainer.textContent = timer;
  updateGameFromPerspective(currentGame, false);
  startTurnTimer(10);
  battleMusic.play().catch(()=>{}); // autoplay try
});

socket.on("roundStart", ({ gameId, timer: t }) => {
  if (!currentGame || currentGame.id !== gameId) return;
  inRevealPhase = false;
  timer = t;
  timerContainer.textContent = timer;
  updateGameFromPerspective(currentGame, false);
  startTurnTimer(t);
});

socket.on("1vs1Update", (gameId, payload) => {
  if (!currentGame || currentGame.id !== gameId) return;
  currentGame.me = payload.me;
  currentGame.opp = payload.opp;
  inRevealPhase = true;
  updateGameFromPerspective(currentGame, true);
});

socket.on("gameOver", (gameId, data) => {
  inRevealPhase = true;
  if (data?.draw) addEventMessageWinner("🏳️ Draw!");
  else addEventMessageWinner(`🏆 ${data.winnerNick} has won the battle!`);
  disableButtons("p1"); disableButtons("p2");
  battleMusic.pause();
  battleMusic.currentTime = 0;
  victoryMusic.play().catch(()=>{});
});

socket.on("choiceAck", ({ choice }) => addEventMessageSingle("system", `Choice confirmed: ${choice.toUpperCase()}`));

chatInput.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const text = e.target.value.trim();
  if (!text) return;
  const roomId = currentGame?.id || "global";
  socket.emit("chatMessage", { roomId, text });
  e.target.value = "";
});
socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));

// ---------- UI UPDATE ----------
function updateGameFromPerspective(game, revealChoices) {
  if (!game) return;
  const maxHp = 80;
  const hpMe = Math.min(game.me.hp ?? 0, maxHp);
  const hpOpp = Math.min(game.opp.hp ?? 0, maxHp);

  player1Name.textContent = `${game.me.nick} (${game.me.char}) HP: ${hpMe}/${maxHp}`;
  player2Name.textContent = `${game.opp.nick} (${game.opp.char}) HP: ${hpOpp}/${maxHp}`;

  player1HpBar.style.transition = "width 0.5s ease-in-out";
  player2HpBar.style.transition = "width 0.5s ease-in-out";
  player1HpBar.style.width = `${(hpMe / maxHp) * 100}%`;
  player2HpBar.style.width = `${(hpOpp / maxHp) * 100}%`;
  player1HpBar.style.background = getHpColor((hpMe / maxHp) * 100);
  player2HpBar.style.background = getHpColor((hpOpp / maxHp) * 100);

  player1CharImg.src = getCharImage(game.me.char, game.me.hp);
  player2CharImg.src = getCharImage(game.opp.char, game.opp.hp);

  if (revealChoices) {
    rollDiceAnimation(diceP1, game.me.lastDamage || 1);
    rollDiceAnimation(diceP2, game.opp.lastDamage || 1);
    addEventMessageSingle("result", `${game.me.nick} chose: ${game.me.choice ?? "NONE"}`);
    addEventMessageSingle("result", `${game.opp.nick} chose: ${game.opp.choice ?? "NONE"}`);
    disableButtons("p1"); disableButtons("p2");
  } else {
    rollDiceAnimation(diceP1, 1);
    rollDiceAnimation(diceP2, 1);
    if (!stunnedMe()) enableButtons("p1");
    disableButtons("p2");
  }
}

// ---------- HELPERS ----------
function getCharImage(char, hp=100) {
  if (!char) return "img/unknown.png";
  let suffix = hp<=0?"0":hp<=20?"20":hp<=40?"40":hp<=60?"60":"";
  return `img/${char.replace(/\s/g,"")}${suffix}.png`;
}

function rollDiceAnimation(el, finalRoll) {
  let count = 0;
  const totalFrames = 15;
  const interval = setInterval(()=>{
    count++;
    const rand = Math.ceil(Math.random()*6);
    el.style.transform = `rotate(${Math.random()*40-20}deg)`;
    el.src = `img/dice${rand}.png`;
    if(count>=totalFrames){
      clearInterval(interval);
      el.src = `img/dice${finalRoll}.png`;
      el.style.transform = "rotate(0deg)";
    }
  },40);
}

function enableButtons(player){
  const btns = buttonsMap[player];
  if(!btns) return;
  Object.values(btns).forEach(btn=>{btn.disabled=false; btn.classList.remove("disabled");});
  document.getElementById(`choice-buttons-${player}`).classList.add("active");
}

function disableButtons(player){
  const btns = buttonsMap[player];
  if(!btns) return;
  Object.values(btns).forEach(btn=>{btn.disabled=true; btn.classList.add("disabled");});
  document.getElementById(`choice-buttons-${player}`).classList.remove("active");
}

function startTurnTimer(seconds=10){
  if(countdownInterval) clearInterval(countdownInterval);
  let t=seconds;
  timerContainer.textContent=t;
  countdownInterval = setInterval(()=>{
    t--;
    timerContainer.textContent=t;
    if(t<=0){clearInterval(countdownInterval); countdownInterval=null;}
  },1000);
}

function addEventMessageSingle(playerNick,text){
  const msg = document.createElement("div");
  msg.textContent = `[${playerNick}] ${text}`;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

function addEventMessageWinner(text){
  const msg = document.createElement("div");
  msg.textContent = text;
  eventBox.appendChild(msg);
  eventBox.scrollTop = eventBox.scrollHeight;
}

function addChatMessage(text){
  const msg = document.createElement("div");
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getHpColor(percent){
  if(percent>60) return "linear-gradient(90deg, green, lime)";
  if(percent>30) return "linear-gradient(90deg, yellow, orange)";
  return "linear-gradient(90deg, red, darkred)";
}

document.body.style.overflowY = "auto";