// =======================
// Fight 1vs1 - WebSocket Ottimizzato
// =======================

// Recupera nickname e campione
const playerName = localStorage.getItem("nickname") || "Player";
const champion = localStorage.getItem("champion") || "Beast";

// Recupera clientId salvato se c'è
let clientId = localStorage.getItem("clientId");

// Aggiorna DOM iniziale
document.getElementById("p1-name").textContent = playerName;
document.getElementById("p1-champion").src = `img/${champion}.png`;

// Stato iniziale
let myHP = 80;
let enemyHP = 80;

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

  // Aggiorna immagini
  if (myHP <= 0) myChampionImg.src = `img/${champion}0.png`;
  else if (myHP <= 20) myChampionImg.src = `img/${champion}20.png`;
  else if (myHP <= 40) myChampionImg.src = `img/${champion}40.png`;
  else if (myHP <= 60) myChampionImg.src = `img/${champion}60.png`;
  else myChampionImg.src = `img/${champion}.png`;

  const enemyName = enemyNameEl.textContent || "Enemy";
  if (enemyHP <= 0) enemyChampionImg.src = `img/${enemyName}0.png`;
  else if (enemyHP <= 20) enemyChampionImg.src = `img/${enemyName}20.png`;
  else if (enemyHP <= 40) enemyChampionImg.src = `img/${enemyName}40.png`;
  else if (enemyHP <= 60) enemyChampionImg.src = `img/${enemyName}60.png`;
  else enemyChampionImg.src = `img/${enemyName}.png`;
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
    if(clientId) ws.send(JSON.stringify({ type: "rejoinRoom", clientId }));
    // Imposta nickname
    ws.send(JSON.stringify({ type: "setNickname", nickname: playerName }));
  });

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);

    switch(msg.type) {
      case "welcome":
        clientId = msg.clientId;
        localStorage.setItem("clientId", clientId);
        break;

      case "online":
        if(onlineCounter) onlineCounter.textContent = msg.count;
        break;

      case "roomStarted":
        const me = msg.players.find(p => p.id === clientId);
        const enemy = msg.players.find(p => p.id !== clientId);
        myHP = me.hp || 80;
        enemyHP = enemy.hp || 80;
        enemyNameEl.textContent = enemy.nickname;
        enemyChampionImg.src = `img/${enemy.champion}.png`;
        updateHP();
        addLog("🌀 Inizio combattimento!");
        break;

      case "turn":
        if(msg.defenderId === clientId) myHP = msg.defenderHP;
        else enemyHP = msg.defenderHP;

        let logMsg = `🎲 ${msg.attacker} tira ${msg.roll} → ${msg.dmg} danni!`;
        addLog(logMsg);
        updateHP();
        break;

      case "end":
        addLog(`🏆 ${msg.winner} ha vinto!`);
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

  ws.addEventListener("error", (err) => console.error("WebSocket error:", err));
}

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