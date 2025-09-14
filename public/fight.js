const ws = new WebSocket(`ws://${location.host}`);
let currentPlayer = { index: null, mode: null, character: 'Beast', hp: 20, bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 };
let players = [
  { name:"Player 1", hp:20, character:'Beast', bonusHP:0, bonusDamage:0, bonusInitiative:0 },
  { name:"Player 2", hp:20, character:'Beast', bonusHP:0, bonusDamage:0, bonusInitiative:0 }
];

const startBtn = document.getElementById('startBattleBtn');
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');

// --- Character Selection ---
characterSelection.querySelectorAll('img').forEach(img => {
  img.addEventListener('click', () => {
    characterSelection.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
    img.classList.add('selected');
    currentPlayer.character = img.dataset.name;
    if(currentPlayer.index!==null) {
      document.querySelector(`#player${currentPlayer.index+1} img.character`).src = `img/${currentPlayer.character}.png`;
      ws.send(JSON.stringify({type:'character', name:currentPlayer.character, playerIndex: currentPlayer.index}));
    }
  });
});

// --- Mode Selection ---
walletBtn.onclick = () => chooseMode('wallet');
demoBtn.onclick = () => chooseMode('demo');

function chooseMode(mode) {
  currentPlayer.mode = mode;
  walletBtn.disabled = true;
  demoBtn.disabled = true;
  ws.send(JSON.stringify({type:'join', mode:mode}));
}

// --- WebSocket Messages ---
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if(msg.type==="online") {
    document.getElementById('onlineCounter').innerText = `Online: ${msg.count}`;
  }
  if(msg.type==="ready") {
    currentPlayer.index = msg.playerIndex;
    startBtn.disabled = false;
    updatePlayersUI();
  }
  if(msg.type==="character") {
    players[msg.playerIndex].character = msg.name;
    document.querySelector(`#player${msg.playerIndex+1} img.character`).src = `img/${msg.name}.png`;
  }
};

// --- Update Player UI ---
function updatePlayersUI() {
  players.forEach((p,i)=>{
    document.querySelectorAll('.hp')[i].innerText = p.hp;
    document.querySelectorAll('.bar')[i].style.width = (p.hp/(20+p.bonusHP)*100)+'%';
    document.querySelector(`#player${i+1} img.character`).src = `img/${p.character}.png`;
  });
}

// --- Dice Roll Helper ---
function rollDice(){ return Math.floor(Math.random()*8)+1; }
function showDice(playerIndex,value){ document.querySelectorAll('.dice')[playerIndex].src=`img/dice${value}.png`; }

// --- Battle ---
startBtn.onclick = async () => {
  startBtn.disabled = true;
  const logEl = document.getElementById('log');
  logEl.textContent = '';

  let attacker=players[0], defender=players[1];
  let turn=1;

  while(players[0].hp>0 && players[1].hp>0){
    await new Promise(r=>setTimeout(r,1500));
    const roll = rollDice();
    const atkIndex = attacker===players[0]?0:1;
    showDice(atkIndex,roll);

    let dmg = roll + attacker.bonusDamage;
    defender.hp -= dmg; if(defender.hp<0) defender.hp=0;
    logEl.textContent += `🔴 Turn ${turn}: ${attacker.name} deals ${dmg} to ${defender.name}. HP left: ${defender.hp}\n`;

    updateCharacterImage(defender, atkIndex===0?1:0);
    updatePlayersUI();
    if(defender.hp<=0) break;
    [attacker,defender]=[defender,attacker];
    turn++;
  }

  const winner = players[0].hp>0?players[0].name:players[1].name;
  logEl.textContent += `🏆 Winner: ${winner}!\n`;
};

// --- Change character image by HP ---
function updateCharacterImage(player,index){
  let hp = player.hp;
  let charName = player.character;
  let img = document.querySelector(`#player${index+1} img.character`);
  if(hp<=0) img.src=`img/${charName}0.png`;
  else if(hp<=5) img.src=`img/${charName}5.png`;
  else if(hp<=10) img.src=`img/${charName}10.png`;
  else if(hp<=15) img.src=`img/${charName}15.png`;
  else img.src=`img/${charName}.png`;
}