// fight.js
import { pinoRank } from './pinoRank.js';
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.9.0/dist/ethers.min.js";

// --- ELEMENTI DOM ---
const walletBtn = document.getElementById('walletBtn');
const demoBtn = document.getElementById('demoBtn');
const characterSelection = document.getElementById('characterSelection');
const logEl = document.getElementById('log');
const onlineCounter = document.getElementById('onlineCounter');

let currentPlayer = {
  index: null,
  mode: null,
  character: 'Beast',
  hp: 20,
  bonusHP: 0,
  bonusDamage: 0,
  bonusInitiative: 0
};

// --- WEBSOCKET ---
const protocol = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${location.host}`);

// --- SELEZIONE PERSONAGGI ---
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
  });
});

// --- PULSANTI MODALITÀ ---
walletBtn.onclick = async () => chooseMode('wallet');
demoBtn.onclick = () => chooseMode('demo');

// --- FUNZIONE SCELTA MODALITÀ ---
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
    bonuses: {
      HP: currentPlayer.bonusHP,
      Damage: currentPlayer.bonusDamage,
      Initiative: currentPlayer.bonusInitiative
    }
  }));
}

// --- OTTIENI BONUS DAL WALLET ---
async function getWalletBonuses(walletAddress){
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
  for(let i=0;i<balance;i++){
    const tokenId = await pinoContract.tokenOfOwnerByIndex(walletAddress,i);
    if(pinoRank[tokenId]){
      bonus.hp += pinoRank[tokenId].bonusHP;
      bonus.damage += pinoRank[tokenId].bonusDamage;
      bonus.initiative += pinoRank[tokenId].bonusInitiative;
    }
  }

  const yumiBalance = await yumiContract.balanceOf(walletAddress);
  if(yumiBalance > 0) bonus.hp += 2; // tutti i YUMI danno +2 Vita

  return bonus;
}

// --- WEBSOCKET MESSAGE ---
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if(msg.type === "online") onlineCounter.innerText = `Online: ${msg.count}`;
  if(msg.type === "assignIndex") currentPlayer.index = msg.index;
  if(msg.type === "character") {
    console.log("Aggiornato personaggio:", msg.name);
  }
  if(msg.type === "log") logEl.textContent += msg.message + "\n";
};