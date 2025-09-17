// fight.js
import { pinoRank } from './pinoRank.js'; // mapping tokenId -> bonus
import { ethers } from "https://cdn.ethers.io/lib/ethers-6.6.0.esm.min.js"; // ethers v6 in browser

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
      const targetImg = currentPlayer.index === 0 ? player1Img : player2Img;
      targetImg.src = `img/${currentPlayer.character}.png`;

      ws.send(JSON.stringify({
        type:'character',
        name: currentPlayer.character,
        playerIndex: currentPlayer.index
      }));
    }
  });
});

// --- SCELTA MODALITÀ ---

// Demo senza bonus
demoBtn.onclick = () => chooseMode('demo');

// Wallet con bonus NFT
walletBtn.onclick = async () => {
  if(!window.ethereum){
    alert("Wallet not found!");
    return;
  }
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    console.log("Wallet connected:", address);

    // Simulazione token posseduti (sostituire con query reale)
    const userTokens = [1,2,5,502]; // tokenId posseduti
    let bonusHP=0, bonusDamage=0, bonusInitiative=0;

    userTokens.forEach(id => {
      const b = pinoRank[id];
      if(b){
        bonusHP += b.bonusHP;
        bonusDamage += b.bonusDamage;
        bonusInitiative += b.bonusInitiative;
      }
    });

    currentPlayer.bonusHP = bonusHP;
    currentPlayer.bonusDamage = bonusDamage;
    currentPlayer.bonusInitiative = bonusInitiative;

    console.log("Bonuses applied:", bonusHP, bonusDamage, bonusInitiative);

    chooseMode('wallet');

  } catch(err){
    console.error(err);
    alert("Wallet connection failed");
  }
};

// --- AVVIO PARTITA ---
function chooseMode(mode){
  currentPlayer.mode = mode;
  walletBtn.disabled = true;
  demoBtn.disabled = true;

  ws.send(JSON.stringify({
    type:'start',
    mode: currentPlayer.mode,
    character: currentPlayer.character,
    bonuses: {
      HP: currentPlayer.bonusHP,
      Damage: currentPlayer.bonusDamage,
      Initiative: currentPlayer.bonusInitiative
    }
  }));

  playBattleMusic();
}

// --- MUSICA ---
function playBattleMusic(){ bgMusic.src="img/battle.mp3"; bgMusic.play().catch(()=>{}); }
function playWinnerMusic(winnerChar){ bgMusic.pause(); winnerMusic.src=`img/${winnerChar}.mp3`; winnerMusic.play().catch(()=>{}); }

// --- WEBSOCKET MESSAGE ---
ws.onmessage = (event)=>{
  const msg = JSON.parse(event.data);

  if(msg.type==="online") onlineCounter.innerText = `Online: ${msg.count}`;
  if(msg.type==="assignIndex") currentPlayer.index = msg.index;

  if(msg.type==="init"){
    players[0].character = msg.players[0].character;
    players[0].hp = msg.players[0].hp;
    players[1].character = msg.players[1].character;
    players[1].hp = msg.players[1].hp;
    updatePlayersUI();
  }

  if(msg.type==="turn"){
    const atkIndex = msg.attackerIndex;
    const defIndex = msg.defenderIndex;
    showDice(atkIndex,msg.roll);
    players[defIndex].hp = msg.defenderHP;
    logEl.textContent += `🔴 ${msg.attacker} deals ${msg.dmg} to ${msg.defender}${msg.critical?' (CRIT!)':''}. HP left: ${msg.defenderHP}\n`;
    updateCharacterImage(players[defIndex],defIndex);
    updatePlayersUI();
  }

  if(msg.type==="end"){
    logEl.textContent += `🏆 Winner: ${msg.winner}!\n`;
    playWinnerMusic(msg.winner);
  }

  if(msg.type==="character"){
    players[msg.playerIndex].character = msg.name;
    const targetImg = msg.playerIndex===0?player1Img:player2Img;
    targetImg.src=`img/${msg.name}.png`;
    updatePlayersUI();
  }

  if(msg.type==="log") logEl.textContent += msg.message + "\n";
};

// --- UPDATE UI ---
function updatePlayersUI(){
  const playerBoxes = document.querySelectorAll('.player');
  players.forEach((p,i)=>{
    playerBoxes[i].querySelector('.hp').innerText = p.hp;
    const maxHP = 20 + p.bonusHP;
    playerBoxes[i].querySelector('.bar').style.width = (p.hp/maxHP*100)+'%';
    playerBoxes[i].querySelector('.player-label').innerText = i===currentPlayer.index?'YOU':'ENEMY';
    const targetImg = i===0?player1Img:player2Img;
    targetImg.src = getCharacterImage(p);
    const smallImg = playerBoxes[i].querySelector('.player-pic');
    if(smallImg) smallImg.src = getCharacterImage(p);
  });
}

// --- CALCOLO IMMAGINE IN BASE A HP ---
function getCharacterImage(player){
  let hp = player.hp;
  let src = `img/${player.character}`;
  if(hp<=0) src+='0';
  else if(hp<=5) src+='5';
  else if(hp<=10) src+='10';
  else if(hp<=15) src+='15';
  src+='.png';
  return src;
}

// --- DADI ---
function rollDice(){ return Math.floor(Math.random()*8)+1; }
function showDice(playerIndex,value){ document.querySelectorAll('.dice')[playerIndex].src=`img/dice${value}.png`; }

// --- RULES TOGGLE ---
const rulesBtn = document.getElementById("rulesBtn");
const rulesOverlay = document.getElementById("rulesOverlay");
rulesBtn.addEventListener("click",()=>rulesOverlay.style.display="flex");
rulesOverlay.addEventListener("click",()=>rulesOverlay.style.display="none");