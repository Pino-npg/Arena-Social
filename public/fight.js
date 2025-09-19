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
let enemyStunned = false;

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

// Aggiorna barre HP e immagini in base a soglie
function updateHP(){
  myHPText.textContent = myHP;
  myHPBar.style.width = `${(myHP/80)*100}%`;
  enemyHPText.textContent = enemyHP;
  enemyHPBar.style.width = `${(enemyHP/80)*100}%`;

  // Cambia immagine se HP < 40 o < 15
  if(myHP <= 15) myChampionImg.src = `img/${champion}_crit.png`;
  else if(myHP <= 40) myChampionImg.src = `img/${champion}_damaged.png`;
  else myChampionImg.src = `img/${champion}.png`;

  if(enemyHP <= 15) enemyChampionImg.src = `img/${enemyNameEl.textContent}_crit.png`;
  else if(enemyHP <= 40) enemyChampionImg.src = `img/${enemyNameEl.textContent}_damaged.png`;
  else enemyChampionImg.src = `img/${enemyNameEl.textContent}.png`;
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
      if(msg.attacker === playerName) break; // mio turno già gestito localmente
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
// Funzione turno
// =======================
diceBtn.addEventListener("click", () => {
  let roll = Math.floor(Math.random()*8)+1;
  let dmg = roll;

  if(myStunned){
    dmg = Math.max(0,dmg-1);
    myStunned=false;
    log.textContent += `${playerName} era stordito: -1 al danno!\n`;
  }

  let logMsg = `🎲 ${playerName} tira ${roll} → ${dmg} danni!`;

  if(roll===8){
    enemyStunned = true;
    logMsg += ` 😵 ${enemyNameEl.textContent} stordito!`;
  }

  enemyHP -= dmg;
  if(enemyHP<0) enemyHP=0;
  updateHP();
  log.textContent += logMsg + "\n";

  ws.send(JSON.stringify({
    type:"attack",
    roll,
    dmg,
    enemyHP,
    enemyStunned,
    log: logMsg
  }));

  if(enemyHP <= 0) {
    log.textContent += `🏆 ${playerName} VINCE!\n`;
    diceBtn.disabled = true;
  }
});

// =======================
// Chat
// =======================
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");

chatInput.addEventListener("keypress", (e) => {
  if(e.key === "Enter" && chatInput.value.trim()) {
    const text = chatInput.value.trim();
    ws.send(JSON.stringify({ type: "chat", text, sender: playerName }));
    chatInput.value = "";
  }
});