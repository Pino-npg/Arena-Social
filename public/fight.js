const ws = new WebSocket(`ws://${location.host}`);

let currentPlayer = {
  index: null,
  mode: null,
  character: 'Beast',
  hp: 20,
  bonusHP: 0,
  bonusDamage: 0,
  bonusInitiative: 0
};

let players = [
  { name: "Player 1", hp: 20, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 },
  { name: "Player 2", hp: 20, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 }
];

const startBtn = document.getElementById('startBattleBtn');
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');
const logEl = document.getElementById('log');
const onlineCounter = document.getElementById('onlineCounter');

const player1Img = document.getElementById('player1-character');
const player2Img = document.getElementById('player2-character');

// musica
let bgMusic = new Audio();
bgMusic.loop = true;
let winnerMusic = new Audio();

// --- Character Selection ---
characterSelection.querySelectorAll('img').forEach(img => {
  img.addEventListener('click', () => {
    characterSelection.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    currentPlayer.character = img.dataset.name;

    if(currentPlayer.index !== null){
      ws.send(JSON.stringify({
        type:'character',
        name:currentPlayer.character,
        playerIndex: currentPlayer.index
      }));
    }

    // Aggiorna immagini grandi ai lati subito
    if(currentPlayer.index === 0) player1Img.src = `img/${currentPlayer.character}.png`;
    else if(currentPlayer.index === 1) player2Img.src = `img/${currentPlayer.character}.png`;
  });
});

// --- Mode Selection ---
walletBtn.disabled = false;
demoBtn.disabled = false;

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

// --- Musica ---
function playBattleMusic(){
  bgMusic.src = "img/battle.mp3";
  bgMusic.play().catch(()=>{});
}

function playWinnerMusic(winnerChar){
  bgMusic.pause();
  winnerMusic.src = `img/${winnerChar}.mp3`;
  winnerMusic.play().catch(()=>{});
}

// --- WebSocket Messages ---
ws.onmessage = (event)=>{
  const msg = JSON.parse(event.data);

  if(msg.type === "online"){
    onlineCounter.innerText = `Online: ${msg.count}`;
  }

  if(msg.type === "ready"){
    currentPlayer.index = msg.playerIndex;
  }

  if(msg.type === "init"){
    players[0].character = msg.players[0].character;
    players[0].hp = msg.players[0].hp;
    players[1].character = msg.players[1].character;
    players[1].hp = msg.players[1].hp;
    updatePlayersUI();
    startBtn.disabled = false;
  }

  if(msg.type === "turn"){
    const atkIndex = players.findIndex(p => p.character === msg.attacker);
    const defIndex = players.findIndex(p => p.character === msg.defender);

    players[defIndex].hp = msg.defenderHP;
    showDice(atkIndex, msg.dmg);
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical ? ' (CRIT!)' : ''}. HP left: ${msg.defenderHP}\n`;

    updateCharacterImage(players[defIndex], defIndex);
    updatePlayersUI();
  }

  if(msg.type === "end"){
    logEl.textContent += `🏆 Winner: ${msg.winner}!\n`;
    startBtn.disabled = false;
    playWinnerMusic(msg.winner);
  }

  if(msg.type === "character" && msg.playerIndex !== currentPlayer.index){
    players[msg.playerIndex].character = msg.name;
    updatePlayersUI();
  }
};

// --- Update UI ---
function updatePlayersUI(){
  players.forEach((p,i)=>{
    document.querySelectorAll('.hp')[i].innerText = p.hp;
    document.querySelectorAll('.bar')[i].style.width = (p.hp/(20+p.bonusHP)*100)+'%';
    const imgEl = document.querySelector(`#player${i+1} img.character`);
    imgEl.src = `img/${p.character}.png`;

    // personaggi grandi ai lati
    if(i===0) player1Img.src = imgEl.src;
    if(i===1) player2Img.src = imgEl.src;
  });
}

// --- Dice ---
function rollDice(){ return Math.floor(Math.random()*8)+1; }
function showDice(playerIndex,value){ document.querySelectorAll('.dice')[playerIndex].src = `img/dice${value}.png`; }

// --- Update Character Image by HP ---
function updateCharacterImage(player,index){
  let hp = player.hp;
  let charName = player.character;
  let state = '';
  if(hp<=0) state='0';
  else if(hp<=5) state='5';
  else if(hp<=10) state='10';
  else if(hp<=15) state='15';

  const src = state ? `img/${charName}${state}.png` : `img/${charName}.png`;
  document.querySelector(`#player${index+1} img.character`).src = src;
  if(index===0) player1Img.src = src;
  else player2Img.src = src;
}

// --- Local start battle ---
startBtn.onclick = ()=>{
  logEl.textContent = "⚔️ Battle started...\n";
  startBtn.disabled = true;
  playBattleMusic();
};