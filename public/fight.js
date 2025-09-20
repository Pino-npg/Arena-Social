// --- WEBSOCKET ---
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.hostname}:${location.port}`);

// --- PLAYER STATO ---
let currentPlayer = { index: null, mode: null, character: 'Beast', hp: 80 };
let players = [
  { name: "Player 1", hp: 80, character: 'Beast' },
  { name: "Player 2", hp: 80, character: 'Beast' }
];

// --- ELEMENTI DOM ---
const onlineCounter = document.getElementById('onlineCounter');
const logEl = document.getElementById('log');
const playerImgs = [
  document.getElementById('player1-character'),
  document.getElementById('player2-character')
];

// --- SELEZIONE MODALITÀ ---
document.getElementById('demoBtn').onclick = () => chooseMode('demo');
document.getElementById('walletBtn').onclick = () => chooseMode('wallet');

function chooseMode(mode){
  currentPlayer.mode = mode;
  ws.send(JSON.stringify({
    type:'start',
    mode: currentPlayer.mode,
    character: currentPlayer.character
  }));
  playBattleMusic();
}

// --- AUDIO ---
let bgMusic = new Audio("img/battle.mp3"); 
bgMusic.loop = true; 
bgMusic.play().catch(()=>{});
let winnerMusic = new Audio();

function playWinnerMusic(winnerChar){
  bgMusic.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

// --- WEBSOCKET ---
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  switch(msg.type){
    case "online":
      onlineCounter.innerText = `Online: ${msg.count}`;
      break;

    case "assignIndex":
      currentPlayer.index = msg.index;
      console.log("Sei Player", currentPlayer.index + 1);
      break;

    case "init":
      players = msg.players;
      updatePlayersUI();
      break;

    case "turn":
      players[msg.defenderIndex].hp = msg.defenderHP;
      logEl.textContent += `${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical ? ' (CRIT!)' : ''}\n`;
      updatePlayersUI();
      break;

    case "end":
      logEl.textContent += `🏆 Winner: ${msg.winner}\n`;
      playWinnerMusic(msg.winner);
      break;

    case "character":
      players[msg.playerIndex].character = msg.name;
      playerImgs[msg.playerIndex].src = `img/${msg.name}.png`;
      updatePlayersUI();
      break;

    case "log":
      logEl.textContent += msg.message + "\n";
      break;
  }
};

// --- UPDATE UI ---
function updatePlayersUI(){
  players.forEach((p,i)=>{
    document.querySelectorAll('.hp')[i].innerText = p.hp;
    const maxHP = 80; // puoi aggiungere bonus se vuoi
    document.querySelectorAll('.bar')[i].style.width = (p.hp/maxHP*100)+'%';
    document.querySelectorAll('.player-label')[i].innerText = (i===currentPlayer.index)?'YOU':'ENEMY';
    playerImgs[i].src = `img/${p.character}.png`;
  });
}