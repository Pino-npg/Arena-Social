import { pinoRank } from './pinoRank.js';
import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.8.3/dist/ethers.min.js';

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
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');
const logEl = document.getElementById('log');
const onlineCounter = document.getElementById('onlineCounter');
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

async function chooseMode(mode){
  currentPlayer.mode = mode;
  walletBtn.disabled = true;
  demoBtn.disabled = true;

  if(mode === "wallet"){
    try{
      const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const bonuses = await getWalletBonuses(account);

      currentPlayer.bonusHP = bonuses.hp;
      currentPlayer.bonusDamage = bonuses.damage;
      currentPlayer.bonusInitiative = bonuses.initiative;

      console.log("🎁 Bonus dal wallet:", bonuses);
    } catch(err){
      console.error(err);
      alert("Errore nel leggere il wallet. Modalità Demo attivata.");
      currentPlayer.mode = "demo";
    }
  }

  ws.send(JSON.stringify({
    type:'start',
    mode: currentPlayer.mode,
    character: currentPlayer.character,
    bonusHP: currentPlayer.bonusHP,
    bonusDamage: currentPlayer.bonusDamage,
    bonusInitiative: currentPlayer.bonusInitiative
  }));

  playBattleMusic();
}

// --- OTTIENI BONUS DAL WALLET ---
async function getWalletBonuses(walletAddress) {
  const bonus = { hp: 0, damage: 0, initiative: 0 };
  const provider = new ethers.BrowserProvider(window.ethereum);

  const pinoContract = new ethers.Contract(
    "0xcc32A25fF920D7A1227AFdA15187e031E8b5Fed2",
    ["function balanceOf(address owner) view returns (uint256)",
     "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"],
    provider
  );

  const yumiContract = new ethers.Contract(
    "0x95f58e17fdA667283Cb44a09Ba45951fa0D3a38E",
    ["function balanceOf(address owner) view returns (uint256)"],
    provider
  );

  const balance = await pinoContract.balanceOf(walletAddress);
  for(let i=0; i<balance; i++){
    const tokenId = await pinoContract.tokenOfOwnerByIndex(walletAddress, i);
    if(pinoRank[tokenId]){
      bonus.hp += pinoRank[tokenId].bonusHP;
      bonus.damage += pinoRank[tokenId].bonusDamage;
      bonus.initiative += pinoRank[tokenId].bonusInitiative;
    }
  }

  const yumiBalance = await yumiContract.balanceOf(walletAddress);
  if(yumiBalance > 0){
    bonus.hp += 2; // tutti i YUMI danno +2 Vita
  }

  return bonus;
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
  if(msg.type === "assignIndex") currentPlayer.index = msg.index;
  if(msg.type === "init"){
    players[0].character = msg.players[0].character; players[0].hp = msg.players[0].hp;
    players[1].character = msg.players[1].character; players[1].hp = msg.players[1].hp;
    updatePlayersUI();
  }
  if(msg.type === "turn"){
    showDice(msg.attackerIndex, msg.roll);
    players[msg.defenderIndex].hp = msg.defenderHP;
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical ? ' (CRIT!)' : ''}. HP left: ${msg.defenderHP}\n`;
    updateCharacterImage(players[msg.defenderIndex], msg.defenderIndex);
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
  if(msg.type === "log") logEl.textContent += msg.message + "\n";
};

// --- UPDATE UI ---
function updatePlayersUI(){
  const playerBoxes = document.querySelectorAll('.player');

  players.forEach((p, i) => {
    playerBoxes[i].querySelector('.hp').innerText = p.hp;
    const maxHP = 20 + p.bonusHP;
    playerBoxes[i].querySelector('.bar').style.width = (p.hp / maxHP * 100) + '%';
    playerBoxes[i].querySelector('.player-label').innerText = (i === currentPlayer.index) ? "YOU" : "ENEMY";
    if(i === 0) player1Img.src = getCharacterImage(p);
    else player2Img.src = getCharacterImage(p);
    const smallImg = playerBoxes[i].querySelector('.player-pic');
    if(smallImg) smallImg.src = getCharacterImage(p);
  });
}

// --- CALCOLO IMMAGINE IN BASE A HP ---
function getCharacterImage(player){
  let hp = player.hp;
  let src = `img/${player.character}`;
  if(hp <= 0) src += '0';
  else if(hp <= 5) src += '5';
  else if(hp <= 10) src += '10';
  else if(hp <= 15) src += '15';
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