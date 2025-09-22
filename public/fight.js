const game = {
  player1: { nick: "Player1", char: "Beast", hp: 100, dice: 1, stunned: false },
  player2: { nick: "Player2", char: "Clown", hp: 100, dice: 1, stunned: false },
  turn: 1
};

// Elementi
const hp1 = document.getElementById("hp1");
const hp2 = document.getElementById("hp2");
const diceP1 = document.getElementById("dice-p1");
const diceP2 = document.getElementById("dice-p2");
const eventBox = document.getElementById("event-messages");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

function updateUI() {
  hp1.style.width = game.player1.hp + "%";
  hp2.style.width = game.player2.hp + "%";

  diceP1.src = `img/dice${game.player1.dice}.png`;
  diceP2.src = `img/dice${game.player2.dice}.png`;
}

function logEvent(text) {
  const p = document.createElement("p");
  p.textContent = text;
  eventBox.appendChild(p);
  eventBox.scrollTop = eventBox.scrollHeight;
}

function attack(attacker, defender, dice) {
  if (attacker.stunned) {
    logEvent(`${attacker.nick} è stordito e infligge -1 danno!`);
    defender.hp -= 1;
    attacker.stunned = false;
  } else {
    defender.hp -= dice;
    logEvent(`${attacker.nick} attacca e infligge ${dice} danni a ${defender.nick}`);
    if (dice === 8) {
      defender.stunned = true;
      logEvent(`${defender.nick} è stordito!`);
    }
  }
  if (defender.hp < 0) defender.hp = 0;
}

function nextTurn() {
  const attacker = game.turn === 1 ? game.player1 : game.player2;
  const defender = game.turn === 1 ? game.player2 : game.player1;

  const diceRoll = Math.floor(Math.random() * 8) + 1;
  attacker.dice = diceRoll;

  attack(attacker, defender, diceRoll);
  updateUI();

  if (defender.hp <= 0) {
    logEvent(`${attacker.nick} vince la sfida!`);
    return;
  }

  game.turn = game.turn === 1 ? 2 : 1;
  setTimeout(nextTurn, 2000);
}

// Chat
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && chatInput.value.trim() !== "") {
    const msg = document.createElement("p");
    msg.textContent = `Tu: ${chatInput.value}`;
    chatMessages.appendChild(msg);
    chatInput.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

// Fullscreen
document.getElementById("fullscreen-btn").addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

updateUI();
setTimeout(nextTurn, 2000);