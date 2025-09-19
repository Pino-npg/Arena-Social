// =======================
// Fight 1vs1 - WebSocket Ottimizzato
// =======================

// Recupera nickname e campione
const playerName = localStorage.getItem("nickname") || "Player";
const champion = localStorage.getItem("champion") || "Beast";

// Aggiorna DOM iniziale
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
const diceBtn = document.getElementById("rollDice");

// Chat
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");

// Online counter
const onlineCounter = document.getElementById("onlineCounter");

// =======================
// Funzioni Utility
// =======================

// Aggiunge messaggi al log
function addLog(msg) {
  log.innerHTML += `<div>${msg}</div>`;
  log.scrollTop = log.scrollHeight;
}

// Aggiorna HP e immagini
function updateHP() {
  // HP testuali
  myHPText.textContent = myHP;
  enemyHPText.textContent = enemyHP;

  // Barre HP
  myHPBar.style.width = `${(myHP / 80) * 100}%`;
  enemyHPBar.style.width = `${(enemyHP / 80) * 100}%`;

  // Aggiorna immagini player
  if (myHP <= 0) myChampionImg.src = `img/${champion}0.png`;
  else if (myHP <= 20) myChampionImg.src = `img/${champion}20.png`;
  else if (myHP <= 40) myChampionImg.src = `img/${champion}40.png`;
  else if (myHP <= 60) myChampionImg.src = `img/${champion}60.png`;
  else myChampionImg.src = `img/${champion}.png`;

  // Aggiorna immagini nemico
  const enemyName = enemyNameEl.textContent || "Enemy";
  if (enemyHP <= 0) enemyChampionImg.src = `img/${enemyName}0.png`;
  else if (enemyHP <= 20) enemyChampionImg.src = `img/${enemyName}20.png`;
  else if (enemyHP <= 40) enemyChampionImg.src = `img/${enemyName}40.png`;
  else if (enemyHP <= 60) enemyChampionImg.src = `img/${enemyName}60.png`;
  else enemyChampionImg.src = `img/${enemyName}.png`;
}

// Disabilita il pulsante dadi (combattimento automatico)
diceBtn.disabled = true;

// =======================
// WebSocket
// =======================
let ws;

function connectWS() {
  ws = new WebSocket("ws://localhost:10000");

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", name: playerName, champion }));
    addLog("🔌 Connessione al server stabilita");
  });

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    switch(msg.type) {
      case "online":
        if(onlineCounter) onlineCounter.textContent = msg.count;
        break;

      case "init":
        enemyNameEl.textContent = msg.players[1]?.character || "Enemy";
        enemyChampionImg.src = `img/${enemyNameEl.textContent}.png`;
        myHP = msg.players[0]?.hp || 80;
        enemyHP = msg.players[1]?.hp || 80;
        updateHP();
        addLog("🌀 Inizio combattimento!");
        break;

      case "turn":
        if(msg.attacker === playerName) break; // mio turno già gestito
        myHP = msg.defenderHP;
        myStunned = msg.critical;
        let logMsg = `🎲 ${msg.attacker} tira ${msg.roll} → ${msg.dmg} danni!`;
        if(msg.critical) logMsg += ` 😵 ${playerName} stordito!`;
        addLog(logMsg);
        updateHP();
        break;

      case "end":
        const winnerEmoji = msg.winner === playerName ? "🏆" : "💀";
        addLog(`${winnerEmoji} ${msg.winner} ha vinto!`);
        diceBtn.disabled = true;
        break;

      case "chat":
        chatLog.innerHTML += `<div><strong>${msg.sender}:</strong> ${msg.text}</div>`;
        chatLog.scrollTop = chatLog.scrollHeight;
        break;
    }
  });

  ws.addEventListener("close", () => {
    addLog("❌ Connessione persa. Riconnessione in 3s...");
    setTimeout(connectWS, 3000);
  });

  ws.addEventListener("error", (err) => {
    console.error("WebSocket error:", err);
  });
}

// Avvia connessione
connectWS();

// =======================
// Chat
// =======================
chatInput.addEventListener("keypress", (e) => {
  if(e.key === "Enter" && chatInput.value.trim()) {
    const text = chatInput.value.trim();
    if(ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "chat", text, sender: playerName }));
      chatInput.value = "";
    }
  }
});