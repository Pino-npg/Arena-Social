const playerName = localStorage.getItem("nickname") || "Player";
const champion = localStorage.getItem("champion") || "Beast";
let clientId = localStorage.getItem("clientId");

const myHPText = document.getElementById("p1-hp");
const enemyHPText = document.getElementById("p2-hp");
const myHPBar = document.getElementById("p1-bar");
const enemyHPBar = document.getElementById("p2-bar");
const enemyNameEl = document.getElementById("p2-name");
const myChampionImg = document.getElementById("p1-champion");
const enemyChampionImg = document.getElementById("p2-champion");
const log = document.getElementById("log");
const onlineCounter = document.getElementById("onlineCounter");
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");

let myHP = 80;
let enemyHP = 80;
let enemyName = "Opponent";
let enemyChampion = "";

function addLog(msg){
  log.innerHTML += `<div>${msg}</div>`;
  log.scrollTop = log.scrollHeight;
}

function updateHP(){
  myHPText.textContent = myHP;
  enemyHPText.textContent = enemyHP;
  myHPBar.style.width = `${(myHP/80)*100}%`;
  enemyHPBar.style.width = `${(enemyHP/80)*100}%`;
}

let ws;
function connectWS(){
  ws = new WebSocket("ws://localhost:10000");

  ws.addEventListener("open", ()=>{
    addLog("🔌 Connesso al server");

    if(clientId) ws.send(JSON.stringify({ type:"rejoinRoom", clientId }));

    ws.send(JSON.stringify({ type:"setNickname", nickname: playerName }));
    ws.send(JSON.stringify({ type:"setChampion", champion }));
  });

  ws.addEventListener("message", e=>{
    const msg = JSON.parse(e.data);

    switch(msg.type){
      case "welcome":
        clientId = msg.clientId;
        localStorage.setItem("clientId", clientId);
        break;

      case "online":
        onlineCounter.textContent = msg.count;
        break;

      case "roomStarted":
        const me = msg.players.find(p=>p.id===clientId);
        const enemy = msg.players.find(p=>p.id!==clientId);
        if(!me || !enemy) return;

        myHP = me.hp;
        enemyHP = enemy.hp;
        enemyName = enemy.nickname;
        enemyChampion = enemy.champion;

        enemyNameEl.textContent = enemyName;
        enemyChampionImg.src = `img/${enemyChampion}.png`;
        updateHP();
        addLog("🌀 Inizio combattimento!");
        break;

      case "turn":
        if(msg.defenderId===clientId) myHP = msg.defenderHP;
        else enemyHP = msg.defenderHP;
        addLog(`🎲 ${msg.attacker} tira ${msg.roll} → ${msg.dmg} danni!${msg.critical?' ⚡ Critico!':''}`);
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

  ws.addEventListener("close", ()=>{
    addLog("❌ Connessione persa. Riconnessione in 3s...");
    setTimeout(connectWS,3000);
  });

  ws.addEventListener("error", err => console.error("WebSocket error:", err));
}

connectWS();

chatInput.addEventListener("keypress", e=>{
  if(e.key==="Enter" && chatInput.value.trim()){
    const text = chatInput.value.trim();
    if(ws && ws.readyState===WebSocket.OPEN){
      ws.send(JSON.stringify({ type:"chat", sender: playerName, text }));
      chatInput.value="";
    }
  }
});