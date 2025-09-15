import { WebSocket } from "ws"; // se usi Node lato server, lato client non serve

// Connessione WebSocket
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}`);

// Stato locale giocatore
let currentPlayer = {
  index: null,
  mode: null,
  character: 'Beast',
  hp: 20,
  bonusHP: 0,
  bonusDamage: 0,
  bonusInitiative: 0,
  stunned: 0
};

let players = [
  { name: "Player 1", hp: 20, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0, stunned: 0 },
  { name: "Player 2", hp: 20, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0, stunned: 0 }
];

// Elementi UI
const startBtn = document.getElementById('startBattleBtn');
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');
const logEl = document.getElementById('log');
const bgMusic = new Audio();
bgMusic.loop = true;
const winnerMusic = new Audio();

// --- Musica ---
function playBattleMusic(){ bgMusic.src = "img/battle.mp3"; bgMusic.play().catch(()=>{}); }
function playWinnerMusic(winnerChar){ bgMusic.pause(); winnerMusic.src = `img/${winnerChar}.mp3`; winnerMusic.play().catch(()=>{}); }

// --- Character Selection ---
characterSelection.querySelectorAll('img').forEach(img=>{
  img.addEventListener('click',()=>{
    characterSelection.querySelectorAll('img').forEach(i=>i.classList.remove('selected'));
    img.classList.add('selected');
    currentPlayer.character = img.dataset.name;

    if(currentPlayer.index !== null){
      ws.send(JSON.stringify({ type:'character', name:currentPlayer.character, playerIndex: currentPlayer.index }));
    }
  });
});

// --- Mode Selection ---
walletBtn.onclick = ()=>chooseMode('wallet');
demoBtn.onclick = ()=>chooseMode('demo');

function chooseMode(mode){
  currentPlayer.mode = mode;
  walletBtn.disabled = true;
  demoBtn.disabled = true;

  ws.send(JSON.stringify({ type:'ready', mode: currentPlayer.mode, character: currentPlayer.character }));
}

// --- Start Battle solo quando cliccato ---
startBtn.onclick = ()=>{
  ws.send(JSON.stringify({ type:'startBattle' }));
  startBtn.disabled = true;
  playBattleMusic();
};

// --- WebSocket ---
ws.onmessage = (event)=>{
  const msg = JSON.parse(event.data);

  if(msg.type === "online"){
    document.getElementById('onlineCounter').innerText = `Online: ${msg.count}`;
  }

  if(msg.type === "assignIndex"){
    currentPlayer.index = msg.index;
    console.log("🎮 Sei il Player", msg.index+1);
  }

  if(msg.type === "init"){
    players[0].character = msg.players[0].character;
    players[0].hp = msg.players[0].hp;
    players[1].character = msg.players[1].character;
    players[1].hp = msg.players[1].hp;
    updatePlayersUI();
  }

  if(msg.type === "turn"){
    const atkIndex = players.findIndex(p=>p.character===msg.attacker);
    const defIndex = players.findIndex(p=>p.character===msg.defender);

    players[defIndex].hp = msg.defenderHP;

    // Mostra dice
    showDice(atkIndex,msg.dmg);

    // Log colpo critico
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical?' (CRIT!)':''}. HP left: ${msg.defenderHP}\n`;

    // Aggiorna immagini in base a HP
    updateCharacterImage(players[defIndex], defIndex);
    updatePlayersUI();
  }

  if(msg.type === "end"){
    logEl.textContent += `🏆 Winner: ${msg.winner}!\n`;
    playWinnerMusic(msg.winner);
    startBtn.disabled = false;
  }

  if(msg.type === "character" && msg.playerIndex !== currentPlayer.index){
    players[msg.playerIndex].character = msg.name;
    updatePlayersUI();
  }
};

// --- UI Helper ---
function updatePlayersUI(){
  players.forEach((p,i)=>{
    document.querySelectorAll('.hp')[i].innerText = p.hp;
    document.querySelectorAll('.bar')[i].style.width = (p.hp/(20+p.bonusHP)*100)+'%';
    const imgEl = document.querySelector(`#player${i+1} img.character`);
    imgEl.src = `img/${p.character}.png`;
  });
}

function showDice(playerIndex,value){
  document.querySelectorAll('.dice')[playerIndex].src = `img/dice${value}.png`;
}

function updateCharacterImage(player,index){
  let hp = player.hp;
  let charName = player.character;
  let img = document.querySelector(`#player${index+1} img.character`);

  if(hp<=0) img.src = `img/${charName}0.png`;
  else if(hp<=5) img.src = `img/${charName}5.png`;
  else if(hp<=10) img.src = `img/${charName}10.png`;
  else if(hp<=15) img.src = `img/${charName}15.png`;
  else img.src = `img/${charName}.png`;
}

function rollDice(){ return Math.floor(Math.random()*8)+1; }