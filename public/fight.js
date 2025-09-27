//fight.js
// --- WEBSOCKET ---
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}`);

// --- PLAYER STATO ---
let currentPlayer = {
  index: null,
  mode: null,
  character: 'Beast',
  hp: 80,
  bonusHP: 0,
  bonusDamage: 0,
  bonusInitiative: 0
};

let players = [
  { name: "Player 1", hp: 80, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 },
  { name: "Player 2", hp: 80, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 }
];

// --- ELEMENTI DOM ---
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');
const logEl = document.getElementById('log');
const onlineCounter = document.getElementById('onlineCounter');

// Immagini grandi ai lati dei riquadri vita
const player1Img = document.getElementById('player1-character');
const player2Img = document.getElementById('player2-character');

// --- AUDIO ---
let bgMusic = new Audio();
bgMusic.loop = true;
let winnerMusic = new Audio();

// --- SELEZIONE PERSONAGGI ---
characterSelection.querySelectorAll('img').forEach(img => {
  img.addEventListener('click', () => {
    characterSelection.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    currentPlayer.character = img.dataset.name;

    // Aggiorna immagine grande subito
    if(currentPlayer.index !== null){
      if(currentPlayer.index === 0) player1Img.src = `img/${currentPlayer.character}.png`;
      else player2Img.src = `img/${currentPlayer.character}.png`;

      ws.send(JSON.stringify({
        type:'character',
        name:currentPlayer.character,
        playerIndex: currentPlayer.index
      }));
    }
  });
});

// --- SCELTA MODALITÀ ---
walletBtn.onclick = () => chooseMode('wallet');
demoBtn.onclick = () => chooseMode('demo');

function chooseMode(mode){
  currentPlayer.mode = mode;
  walletBtn.disabled = true;
  demoBtn.disabled = true;

  ws.send(JSON.stringify({
    type:'start',
    mode: currentPlayer.mode,
    character: currentPlayer.character
  }));

  playBattleMusic();
}

// --- MUSICA ---
function playBattleMusic(){
  bgMusic.src = "img/4.mp3";
  bgMusic.play().catch(()=>{});
}

function playWinnerMusic(winnerChar){
  bgMusic.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

// --- WEBSOCKET MESSAGE ---
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if(msg.type === "online"){
    onlineCounter.innerText = `Online: ${msg.count}`;
  }

  if(msg.type === "assignIndex"){
    currentPlayer.index = msg.index;
    console.log("🎮 Sei Player", msg.index + 1);
  }

  if(msg.type === "init"){
    players[0].character = msg.players[0].character;
    players[0].hp = msg.players[0].hp;
    players[1].character = msg.players[1].character;
    players[1].hp = msg.players[1].hp;
    updatePlayersUI();
  }

  if (msg.type === "turn") {
    const atkIndex = msg.attackerIndex;
    const defIndex = msg.defenderIndex;
  
    // mostra il dado reale
    showDice(atkIndex, msg.roll);
  
    // log e hp usano il dmg corretto
    players[defIndex].hp = msg.defenderHP;
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical ? ' (CRIT!)' : ''}. HP left: ${msg.defenderHP}\n`;
  
    updateCharacterImage(players[defIndex], defIndex);
    updatePlayersUI();
  }

  if(msg.type === "end"){
    logEl.textContent += `🏆 Winner: ${msg.winner}!\n`;
    playWinnerMusic(msg.winner);
  }

  if(msg.type === "character"){
    players[msg.playerIndex].character = msg.name;
    if(msg.playerIndex === 0) player1Img.src = `img/${msg.name}.png`;
    else player2Img.src = `img/${msg.name}.png`;
    updatePlayersUI();
  }

  if(msg.type === "log"){
    logEl.textContent += msg.message + "\n";
  }
};

// --- UPDATE UI ---
function updatePlayersUI(){
  const playerBoxes = document.querySelectorAll('.player');

  players.forEach((p, i) => {
    // aggiorna HP
    playerBoxes[i].querySelector('.hp').innerText = p.hp;

    // aggiorna barra HP
    const maxHP = 30 + p.bonusHP;
    playerBoxes[i].querySelector('.bar').style.width = (p.hp / maxHP * 80) + '%';

    // aggiorna label YOU / ENEMY
    playerBoxes[i].querySelector('.player-label').innerText = (i === currentPlayer.index) ? "YOU" : "ENEMY";

    // aggiorna immagine grande
    if(i === 0) player1Img.src = getCharacterImage(p);
    else player2Img.src = getCharacterImage(p);

    // aggiorna immagine piccola nel box
    const smallImg = playerBoxes[i].querySelector('.player-pic');
    if(smallImg) smallImg.src = getCharacterImage(p);
  });
}

// --- CALCOLO IMMAGINE IN BASE A HP ---
function getCharacterImage(player){
  let hp = player.hp;
  let src = `img/${player.character}`;

  if(hp <= 0) src += '0';
  else if(hp<=20) suffix='20';
  else if(hp<=40) suffix='40';
  else if(hp<=60) suffix='60';

  src += '.png';
  return src;
}

// --- DADI ---
function rollDice(){ return Math.floor(Math.random()*8)+1; }
function showDice(playerIndex,value){ document.querySelectorAll('.dice')[playerIndex].src = `img/dice${value}.png`; }

// --- IMMAGINE PER HP ---
function updateCharacterImage(player,index){
  const src = getCharacterImage(player);
  if(index === 0) player1Img.src = src;
  else player2Img.src = src;
}

// --- RULES TOGGLE ---
const rulesBtn = document.getElementById("rulesBtn");
const rulesOverlay = document.getElementById("rulesOverlay");

rulesBtn.addEventListener("click", () => {
  rulesOverlay.style.display = "flex";
});

// clic ovunque sull’overlay per chiudere
rulesOverlay.addEventListener("click", () => {
  rulesOverlay.style.display = "none";
});