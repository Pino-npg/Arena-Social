// fight.js
const socket = io();

// Elementi
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const eventMessages = document.getElementById("event-messages");

const diceP1 = document.getElementById("dice-p1");
const diceP2 = document.getElementById("dice-p2");
const hp1 = document.getElementById("player1-hp");
const hp2 = document.getElementById("player2-hp");
const hpText1 = document.getElementById("player1-hp-text");
const hpText2 = document.getElementById("player2-hp-text");
const nick1 = document.getElementById("player1-nick");
const nick2 = document.getElementById("player2-nick");
const name1 = document.getElementById("player1-name");
const name2 = document.getElementById("player2-name");

// ---------------- CHAT ----------------
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter" && chatInput.value.trim() !== "") {
    socket.emit("chat", chatInput.value.trim());
    chatInput.value = "";
  }
});

socket.on("chat", msg => {
  const div = document.createElement("div");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ---------------- GAME ----------------
socket.on("gameState", game => {
  updateUI(game);
});

// Aggiorna interfaccia
function updateUI(game) {
  // Nomi e HP
  nick1.textContent = game.player1.nick;
  nick2.textContent = game.player2.nick;
  name1.textContent = game.player1.name;
  name2.textContent = game.player2.name;

  hpText1.textContent = game.player1.hp;
  hpText2.textContent = game.player2.hp;
  hp1.style.width = game.player1.hp + "%";
  hp2.style.width = game.player2.hp + "%";

  // Dadi
  showDice(0, game.player1.dice);
  showDice(1, game.player2.dice);

  // Eventi
  logDiceEvent(game.player1);
  logDiceEvent(game.player2);

  // Vittoria
  if (game.winner) {
    logEvent(`🏆 ${game.winner} wins the fight!`, "win");
    playVictoryMusic();
  }
}

// Mostra dado
function showDice(playerIndex, value) {
  const diceImg = `img/dice${value}.png`;
  if (playerIndex === 0) {
    diceP1.src = diceImg;
  } else {
    diceP2.src = diceImg;
  }
}

// Scrive eventi dadi
function logDiceEvent(player) {
  if (!player.dice) return;

  if (player.stunnedLastTurn) {
    logEvent(`😵 ${player.nick} è stordito e infligge solo ${player.dmg} danni.`, "stun");
  } else if (player.dice === 8) {
    logEvent(`⚡ ${player.nick} fa un COLPO CRITICO! Infligge ${player.dmg} danni!`, "crit");
  } else {
    logEvent(`🎲 ${player.nick} tira ${player.dice} e infligge ${player.dmg} danni.`, "damage");
  }
}

// Scrive evento nello storico
function logEvent(text, type) {
  const div = document.createElement("div");
  div.className = "event " + type;
  div.textContent = text;
  eventMessages.appendChild(div);
  eventMessages.scrollTop = eventMessages.scrollHeight;
}

// Musica vittoria
function playVictoryMusic() {
  const audio = new Audio("sounds/victory.mp3");
  audio.play();
}