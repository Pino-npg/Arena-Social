// =======================
// Fight 1vs1 - WebSocket Ottimizzato
// =======================

const playerName = localStorage.getItem("nickname") || "Player";
const champion = localStorage.getItem("champion") || "Beast";
let clientId = localStorage.getItem("clientId");

// Aggiorna DOM iniziale
document.getElementById("p1-name").textContent = playerName;
document.getElementById("p1-champion").src = `img/${champion}.png`;

// Stato iniziale
let myHP = 80;
let enemyHP = 80;
let enemyName = "Opponent";
let enemyChampion = "";

// Elementi DOM
const myHPBar = document.getElementById("p1-bar");
const enemyHPBar = document.getElementById("p2-bar");
const myHPText = document.getElementById("p1-hp");
const enemyHPText = document.getElementById("p2-hp");
const enemyNameEl = document.getElementById("p2-name");
const myChampionImg = document.getElementById("p1-champion");
const enemyChampionImg = document.getElementById("p2-champion");
const log = document.getElementById("log");

// Chat
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");

// Online counter
const onlineCounter = document.getElementById("onlineCounter");

// =======================
// Funzioni Utility
// =======================
function addLog(msg) {
  log.innerHTML += `<div>${msg}</div>`;
  log.scrollTop = log.scrollHeight;
}

function updateHP() {
  myHPText.textContent = myHP;
  enemyHPText.textContent = enemyHP;

  myHPBar.style.width = `${(myHP / 80) * 100}%`;
  enemyHPBar.style.width = `${(enemyHP / 80) * 100}%`;
}

// =======================
// WebSocket
// =======================
let ws;

function connectWS() {
  ws = new WebSocket("ws://localhost:10000");

  ws.addEventListener("open", () => {
    addLog("🔌 Connessione al server stabilita");

    // Invia clientId se esiste
    if (clientId) ws.send(JSON.stringify({ type: "rejoinRoom", clientId }));

    // Imposta nickname
    ws.send(JSON.stringify({ type: "setNickname", nickname: playerName }));

    // Invia START subito con campione e modalità
    ws.send(JSON.stringify({ type: "start", character: champion, mode: "normal" }));
  });

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);

    switch(msg.type) {
      case "welcome":
        clientId = msg.clientId;
        localStorage.setItem("clientId", clientId);
        break;

      case "online":
        if (onlineCounter) onlineCounter.textContent = msg.count;
        break;

      case "init":
        handleInit(msg);
        break;

      case "turn":
        const isDefender = msg.defenderIndex === 0; // assumi p1=0
        if (isDefender) myHP = msg.defenderHP;
        else enemyHP = msg.defenderHP;
        addLog(`🎲 ${msg.attacker} tira ${msg.roll} → ${msg.dmg} danni!`);
        updateHP();
        break;

      case "end":
        addLog(`🏆 ${msg.winner} ha vinto!`);
        break;

      case "chat":
        chatLog.innerHTML += `<div><strong>${msg.sender}:</strong> ${msg.text}</div>`;
        chatLog.scrollTop = chatLog.scrollHeight;
        break;

      case "log":
        addLog(msg.message);
        break;

      case "assignIndex":
        // Il server conferma il playerIndex
        break;
    }
  });

  ws.addEventListener("close", () => {
    addLog("❌ Connessione persa. Riconnessione in 3s...");
    setTimeout(connectWS, 3000);
  });

  ws.addEventListener("error", (err) => console.error("WebSocket error:", err));
}

connectWS();

// =======================
// Handlers
// =======================
function handleInit(msg) {
  if (!msg.players) return;

  const me = msg.players[0];
  const enemy = msg.players[1];

  if (!me || !enemy) return;

  myHP = me.hp || 80;
  enemyHP = enemy.hp || 80;
  enemyName = enemy.character;
  enemyChampion = enemy.character;

  enemyNameEl.textContent = enemyName;
  enemyChampionImg.src = `img/${enemyChampion}.png`;

  addLog("🌀 Inizio combattimento!");
  updateHP();
}

// =======================
// Chat
// =======================
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && chatInput.value.trim()) {
    const text = chatInput.value.trim();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "chat", text, sender: playerName }));
      chatInput.value = "";
    }
  }
});