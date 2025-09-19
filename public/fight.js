// --- WEBSOCKET ---
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}`);

// --- PLAYER STATO ---
let currentPlayer = {
  index: null,
  mode: null,
  character: 'Beast',
  nickname: '',
  hp: 30,
  bonusHP: 0,
  bonusDamage: 0,
  bonusInitiative: 0
};

let players = [
  { name: "Player 1", hp: 30, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 },
  { name: "Player 2", hp: 30, character: 'Beast', bonusHP: 0, bonusDamage: 0, bonusInitiative: 0 }
];

// --- TORNEI ---
let tournament4 = { players: [], semi: [], final: null, winner: null };
let tournament8 = { players: [], quarter: [], semi: [], final: null, winner: null };

// --- ELEMENTI DOM ---
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');
const logEl = document.getElementById('log');
const onlineCounter = document.getElementById('onlineCounter');
const player1Img = document.getElementById('player1-character');
const player2Img = document.getElementById('player2-character');
const tournament4Board = document.getElementById('tournament4Board'); 
const tournament8Board = document.getElementById('tournament8Board');
const nicknameInput = document.getElementById('nicknameInput');

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
    updateLargeImage();

    ws.send(JSON.stringify({
      type:'character',
      name:currentPlayer.character,
      playerIndex: currentPlayer.index
    }));
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

  if(msg.type === "online") onlineCounter.innerText = `Online: ${msg.count}`;
  if(msg.type === "assignIndex") {
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
  if(msg.type === "turn"){
    const atkIndex = msg.attackerIndex;
    const defIndex = msg.defenderIndex;
    showDice(atkIndex, msg.roll);
    players[defIndex].hp = msg.defenderHP;
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical ? ' (CRIT!)' : ''}. HP left: ${msg.defenderHP}\n`;
    updateCharacterImage(players[defIndex], defIndex);
    updatePlayersUI();
  }
  if(msg.type === "end"){
    logEl.textContent += `🏆 Winner: ${msg.winner}!\n`;
    playWinnerMusic(msg.winner);
    handleTournamentWinner(msg.winner);
  }
  if(msg.type === "character"){
    players[msg.playerIndex].character = msg.name;
    updateLargeImage();
    updatePlayersUI();
  }
  if(msg.type === "log") logEl.textContent += msg.message + "\n";
};

// --- NICKNAME INPUT ---
nicknameInput.addEventListener('input', () => {
  currentPlayer.nickname = nicknameInput.value.trim();
  updatePlayersUI();
});

// --- TORNEO LOGICA ---
function handleTournamentWinner(winnerChar){
  if(currentPlayer.mode !== "demo") return;

  if(tournament4.players.length < 4){
    tournament4.players.push({name: winnerChar});
    updateTournamentBoard(4);
    if(tournament4.players.length === 4) runTournament4();
  }

  if(tournament8.players.length < 8){
    tournament8.players.push({name: winnerChar});
    updateTournamentBoard(8);
    if(tournament8.players.length === 8) runTournament8();
  }
}

function updateTournamentBoard(size){
  const board = size === 4 ? tournament4Board : tournament8Board;
  board.innerHTML = "";
  const list = size === 4 ? tournament4.players : tournament8.players;
  list.forEach((p,i) => {
    const div = document.createElement('div');
    div.className = "tournament-player";
    div.innerText = p.name;
    board.appendChild(div);
  });
}

// --- TORNEO 0-4 ---
async function runTournament4(){
  for(let i=0;i<2;i++){
    await simulateMatch(tournament4.players[i*2], tournament4.players[i*2+1]);
    await delay(5000);
  }
  await simulateMatch(tournament4.players[0], tournament4.players[1]);
  tournament4.winner = tournament4.players[0].name;
  showFinalWinner(tournament4.winner);
}

// --- TORNEO 0-8 ---
async function runTournament8(){
  for(let i=0;i<4;i++){
    await simulateMatch(tournament8.players[i*2], tournament8.players[i*2+1]);
    await delay(5000);
  }
  for(let i=0;i<2;i++){
    await simulateMatch(tournament8.players[i*2], tournament8.players[i*2+1]);
    await delay(5000);
  }
  await simulateMatch(tournament8.players[0], tournament8.players[1]);
  tournament8.winner = tournament8.players[0].name;
  showFinalWinner(tournament8.winner);
}

// --- SIMULAZIONE MATCH ---
async function simulateMatch(p1,p2){
  logEl.textContent += `⚔️ ${p1.name} VS ${p2.name}\n`;
  await delay(2000);
  let winner = Math.random() > 0.5 ? p1.name : p2.name;
  logEl.textContent += `🏆 Winner: ${winner}\n`;
  playWinnerMusic(winner);
  p1.name = winner;
}

// --- MOSTRA VINCITORE ---
function showFinalWinner(winner){
  const fullScreenImg = document.createElement('img');
  fullScreenImg.src = `img/${winner}W.webp`;
  fullScreenImg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;';
  document.body.appendChild(fullScreenImg);
}

// --- UPDATE UI ---
function updatePlayersUI(){
  const playerBoxes = document.querySelectorAll('.player');
  players.forEach((p,i)=>{
    playerBoxes[i].querySelector('.hp').innerText = p.hp;
    const maxHP = 30 + p.bonusHP;
    playerBoxes[i].querySelector('.bar').style.width = (p.hp/maxHP*100)+'%';
    playerBoxes[i].querySelector('.player-label').innerText = (i===currentPlayer.index ? (currentPlayer.nickname||"YOU") : "ENEMY");
    const smallImg = playerBoxes[i].querySelector('.player-pic');
    if(smallImg) smallImg.src = getCharacterImage(p);
    updateLargeImage();
  });
}

function updateLargeImage(){
  if(currentPlayer.index===0) player1Img.src=`img/${currentPlayer.character}.png`;
  else player2Img.src=`img/${currentPlayer.character}.png`;
}

function getCharacterImage(player){
  let hp = player.hp;
  let src = `img/${player.character}`;
  if(hp<=0) src+='0';
  else if(hp<=8) src+='8';
  else if(hp<=15) src+='15';
  else if(hp<=22) src+='22';
  return src+'.png';
}

// --- DADI ---
function rollDice(){ return Math.floor(Math.random()*8)+1; }
function showDice(playerIndex,value){ document.querySelectorAll('.dice')[playerIndex].src=`img/dice${value}.png`; }
function updateCharacterImage(player,index){ const src=getCharacterImage(player); if(index===0) player1Img.src=src; else player2Img.src=src; }

// --- RULES TOGGLE ---
const rulesBtn = document.getElementById("rulesBtn");
const rulesOverlay = document.getElementById("rulesOverlay");
rulesBtn.addEventListener("click",()=>{ rulesOverlay.style.display="flex"; });
rulesOverlay.addEventListener("click",()=>{ rulesOverlay.style.display="none"; });

// --- UTILITY ---
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }