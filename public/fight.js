// =======================
// Fight 1vs1 - WebSocket
// =======================

// Recupera nickname e campione
const playerName = localStorage.getItem("nickname") || "Player";
const champion = localStorage.getItem("champion") || "Beast";

document.getElementById("p1-name").textContent = playerName;
document.getElementById("p1-champion").src = `img/${champion}.png`;

// Stato iniziale
let myHP = 80;
let enemyHP = 80;
let myStunned = false;

// Elementi DOM
const myHPBar = document.getElementById("p1-bar");
const enemyHPBar = document.getElementById("p2-bar");
const myHPText = document.getElementById("p1-hp");
const enemyHPText = document.getElementById("p2-hp");
const enemyNameEl = document.getElementById("p2-name");
const myChampionImg = document.getElementById("p1-champion");
const enemyChampionImg = document.getElementById("p2-champion");
const log = document.getElementById("log");
const diceBtn = document.getElementById("rollDice"); // estetico, non funzionale

// Chat
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");

// Aggiorna barre HP e immagini in base a soglie
function updateHP() {
  myHPText.textContent = myHP;
  myHPBar.style.width = `${(myHP / 80) * 100}%`;
  enemyHPText.textContent = enemyHP;
  enemyHPBar.style.width = `${(enemyHP / 80) * 100}%`;

  // Player
  if (myHP <= 0) myChampionImg.src = `img/${champion}0.png`;
  else if (myHP <= 20) myChampionImg.src = `img/${champion}20.png`;
  else if (myHP <= 40) myChampionImg.src = `img/${champion}40.png`;
  else if (myHP <= 60) myChampionImg.src = `img/${champion}60.png`;
  else myChampionImg.src = `img/${champion}.png`;

  // Nemico
  const enemyName = enemyNameEl.textContent;
  if (enemyHP <= 0) enemyChampionImg.src = `img/${enemyName}0.png`;
  else if (enemyHP <= 20) enemyChampionImg.src = `img/${enemyName}20.png`;
  else if (enemyHP <= 40) enemyChampionImg.src = `img/${enemyName}40.png`;
  else if (enemyHP <= 60) enemyChampionImg.src = `img/${enemyName}60.png`;
  else enemyChampionImg.src = `img/${enemyName}.png`;
}
updateHP();

// =======================
// WS connection
// =======================
const ws = new WebSocket("ws://localhost:10000");

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "join", name: playerName, champion }));
});

// Ricezione messaggi
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);

  switch(msg.type){
    case "online":
      document.getElementById("onlineCounter").textContent = msg.count;
      break;

    case "init":
      enemyNameEl.textContent = msg.players[1].character;
      enemyChampionImg.src = `img/${msg.players[1].character}.png`;
      myHP = msg.players[0].hp;
      enemyHP = msg.players[1].hp;
      updateHP();
      log.textContent += `🌀 Inizio combattimento!\n`;
      break;

    case "turn":
      if(msg.attacker === playerName) break; // mio turno già gestito dal server
      myHP = msg.defenderHP;
      myStunned = msg.critical;
      let logMsg = `🎲 ${msg.attacker} tira ${msg.roll} → ${msg.dmg} danni!`;
      if(msg.critical) logMsg += ` 😵 ${playerName} stordito!`;
      log.textContent += logMsg + "\n";
      updateHP();
      if(myHP<=0) diceBtn.disabled=true;
      break;

    case "end":
      const winnerEmoji = msg.winner===playerName?"🏆":"💀";
      log.textContent += `${winnerEmoji} ${msg.winner} ha vinto!\n`;
      diceBtn.disabled = true;
      break;

    case "chat":
      chatLog.textContent += msg.sender+": "+msg.text+"\n";
      chatLog.scrollTop = chatLog.scrollHeight;
      break;
  }
});

// =======================
// Chat
// =======================
chatInput.addEventListener("keypress", (e) => {
  if(e.key === "Enter" && chatInput.value.trim()){
    const text = chatInput.value.trim();
    ws.send(JSON.stringify({ type: "chat", text, sender: playerName }));
    chatInput.value = "";
  }
});