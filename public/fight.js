// --- WEBSOCKET ---
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}`);

// --- PLAYER STATO ---
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

// --- ELEMENTI DOM ---
const startBtn = document.getElementById('startBattleBtn');
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
  bgMusic.src = "img/battle.mp3";
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

  if (msg.type === "online") {
    onlineCounter.innerText = `Online: ${msg.count}`;
  }

  if (msg.type === "assignIndex") {
    currentPlayer.index = msg.index;
    console.log("🎮 Sei Player", msg.index + 1);
  }

  if (msg.type === "init") {
    // init fornisce l'array ordered [player0, player1]
    players[0].character = msg.players[0].character;
    players[0].hp = msg.players[0].hp;
    players[1].character = msg.players[1].character;
    players[1].hp = msg.players[1].hp;
    updatePlayersUI();
    startBtn.disabled = false;
  }

  if (msg.type === "turn") {
    // usa gli indici inviati dal server per aggiornare i giusti slot (fix per personaggi uguali)
    const atkIndex = msg.attackerIndex;
    const defIndex = msg.defenderIndex;

    // aggiorna hp del difensore
    players[defIndex].hp = msg.defenderHP;

    // mostra il dado dell'attaccante
    showDice(atkIndex, msg.dmg);

    // log
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical ? ' (CRIT!)' : ''}. HP left: ${msg.defenderHP}\n`;

    // aggiorna immagine per il difensore in base ai suoi HP
    updateCharacterImage(players[defIndex], defIndex);
    updatePlayersUI();
  }

  if (msg.type === "end") {
    logEl.textContent += `🏆 Winner: ${msg.winner}!\n`;
    startBtn.disabled = false;
    // opzionale: suona musica vincitore
    playWinnerMusic(msg.winner);
  }

  if (msg.type === "character") {
    // server manda playerIndex, name
    players[msg.playerIndex].character = msg.name;
    // aggiorna immagine grande e piccola
    if (msg.playerIndex === 0) player1Img.src = `img/${msg.name}.png`;
    else player2Img.src = `img/${msg.name}.png`;
    updatePlayersUI();
  }

  if (msg.type === "log") {
    logEl.textContent += msg.message + "\n";
  }
};

// --- UPDATE UI ---
function updatePlayersUI(){
  players.forEach((p,i)=>{
    document.querySelectorAll('.hp')[i].innerText = p.hp;
    document.querySelectorAll('.bar')[i].style.width = (p.hp/(20+p.bonusHP)*100)+'%';

    // Aggiorna immagine accanto al riquadro vita
    if(i===0) player1Img.src = `img/${p.character}.png`;
    else player2Img.src = `img/${p.character}.png`;
  });
}

// --- DADI ---
function rollDice(){ return Math.floor(Math.random()*8)+1; }
function showDice(playerIndex,value){ document.querySelectorAll('.dice')[playerIndex].src = `img/dice${value}.png`; }

// --- IMMAGINE PER HP ---
function updateCharacterImage(player,index){
  let hp = player.hp;
  let charName = player.character;
  let src = charName;
  if(hp<=0) src+= '0';
  else if(hp<=5) src+='5';
  else if(hp<=10) src+='10';
  else if(hp<=15) src+='15';
  src+= '.png';

  if(index===0) player1Img.src = src;
  else player2Img.src = src;
}

// --- LOCAL START BATTLE ---
startBtn.onclick = ()=>{
  logEl.textContent = "⚔️ Battle started...\n";
  startBtn.disabled = true;
  playBattleMusic();
};
