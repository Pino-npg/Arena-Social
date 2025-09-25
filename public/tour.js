import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

document.addEventListener("DOMContentLoaded", () => {
  const socket = io("https://fight-game-server-1.onrender.com/tournament");

  // ---------- ELEMENTI ----------
  const battleArea = document.getElementById("battle-area");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const eventBox = document.getElementById("event-messages");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const trophyBtn = document.getElementById("trophy-btn");
  const overlay = document.getElementById("tournament-overlay");
  const bracket = document.getElementById("bracket");
  const closeOverlayBtn = document.getElementById("close-overlay");

  let tournamentBracket = [];
  let currentStage = "quarters"; // quarters → semis → final
  let stageMatches = [];
  let winnerMusicAudio = new Audio();
  winnerMusicAudio.loop = false;
  winnerMusicAudio.volume = 0.7;
  let musicAudio = new Audio();
  musicAudio.loop = true;
  musicAudio.volume = 0.5;

  const nick = localStorage.getItem("selectedNick");
  const char = localStorage.getItem("selectedChar");
  if(!nick || !char) { alert("Nickname o character non selezionati!"); return; }
  socket.emit("joinTournament", {nick, char});

  // ---------- FULLSCREEN ----------
  fullscreenBtn.addEventListener("click", async () => {
    const container = document.getElementById("game-container");
    if(!document.fullscreenElement) await container.requestFullscreen();
    else await document.exitFullscreen();
  });

  // ---------- TROPHY OVERLAY ----------
  trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
  closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

  // ---------- CHAT ----------
  chatInput.addEventListener("keydown", e => {
    if(e.key==="Enter" && e.target.value.trim()!=="") {
      socket.emit("chatMessage", e.target.value);
      e.target.value="";
    }
  });
  socket.on("chatMessage", data => addChatMessage(`${data.nick}: ${data.text}`));
  function addChatMessage(text){
    const msg = document.createElement("div");
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ---------- EVENTI ----------
  function addEventMessage(text){
    const msg = document.createElement("div");
    msg.textContent = text;
    eventBox.appendChild(msg);
    eventBox.scrollTop = eventBox.scrollHeight;
  }

  function showEventEffect(playerDiv, text){
    const span = document.createElement("span");
    span.textContent = text;
    span.classList.add("event-effect");
    playerDiv.appendChild(span);
    setTimeout(()=>span.remove(),1000);
  }

  // ---------- MATCH RENDER ----------
  function renderMatches(matches){
    battleArea.innerHTML="";
    stageMatches = matches;
    matches.forEach(match=>{
      const container = document.createElement("div");
      container.classList.add("match-container");
      container.appendChild(createPlayerDiv(match.player1));
      container.appendChild(createPlayerDiv(match.player2));
      battleArea.appendChild(container);
    });
  }

  function createPlayerDiv(player){
    const div = document.createElement("div");
    div.classList.add("player");
    div.innerHTML = `
      <div class="player-label">${player.nick} (${player.char}) HP: ${player.hp}</div>
      <img class="char-img" src="${getCharImage(player)}" alt="${player.nick}">
      <div class="hp-bar"><div class="hp" style="width:${player.hp}%"></div></div>
      <img class="dice" src="img/dice1.png">
    `;
    return div;
  }

  function getCharImage(player){
    let src = `img/${player.char}`;
    if(player.hp<=0) src+='0';
    else if(player.hp<=20) src+='20';
    else if(player.hp<=40) src+='40';
    else if(player.hp<=60) src+='60';
    src+='.png';
    return src;
  }

  // ---------- LOG E HP CON CRITICI ----------
  socket.on("log", msg=>{
    addEventMessage(msg);

    battleArea.querySelectorAll(".match-container").forEach(container=>{
      container.querySelectorAll(".player").forEach(div=>{
        const diceImg = div.querySelector(".dice");
        const hpDiv = div.querySelector(".hp");
        const playerLabel = div.querySelector(".player-label").textContent;
        const playerNick = playerLabel.split(" ")[0];
        const charName = playerLabel.match(/\((.*?)\)/)[1];

        if(msg.includes(playerNick)){
          const diceVal = parseInt(msg.match(/rolls (\d+)/)?.[1] || 1);
          const isCrit = /CRIT/.test(msg);

          diceImg.src = `img/dice${diceVal}.png`;
          diceImg.style.width="80px"; diceImg.style.height="80px";

          const dmg = parseInt(msg.match(/deals (\d+)/)?.[1] || 0);
          const currentHP = parseInt(hpDiv.style.width);
          const newHP = Math.max(0,currentHP-dmg);
          animateHP(hpDiv,currentHP,newHP);

          if(isCrit) showEventEffect(div,"⚡💥");
          else showEventEffect(div,"💥");

          const charImg = div.querySelector(".char-img");
          charImg.src = getCharImage({char:charName,hp:newHP});
          div.querySelector(".player-label").textContent = `${playerNick} (${charName}) HP: ${newHP}`;
        }
      });
    });
  });

  function animateHP(hpDiv,from,to){
    const step = from>to?-1:1;
    let val = from;
    const interval = setInterval(()=>{
      if(val===to){ clearInterval(interval); return; }
      val+=step;
      hpDiv.style.width = val+"%";
    },30);
  }

  // ---------- MATCH OVER ----------
  socket.on("matchOver", data=>{
    addEventMessage(`🏆 ${data.winner} won the match!`);
    tournamentBracket.push({...data, stage:currentStage});
    updateBracketDisplay();

    // Musica vincitore solo fino a fine fase
    winnerMusicAudio.src = `img/${data.winnerChar}.mp3`;
    winnerMusicAudio.play().catch(()=>{});

    const finishedMatches = tournamentBracket.filter(m=>m.stage===currentStage).length;
    if(finishedMatches === stageMatches.length){
      winnerMusicAudio.pause();
      advanceStage();
    }
  });

  function advanceStage(){
    if(currentStage==="quarters"){ currentStage="semis"; }
    else if(currentStage==="semis"){ currentStage="final"; }
    else if(currentStage==="final"){
      currentStage="ended";
      const finalWinner = tournamentBracket.find(m=>m.stage==="final")?.winner;
      if(finalWinner){
        addEventMessage(`🏆 ${finalWinner} is the Champion!`);
        document.body.style.backgroundImage=`url("img/${finalWinner}.webp")`;
        winnerMusicAudio.loop=true; 
        winnerMusicAudio.play().catch(()=>{});
      }
    }
    if(currentStage!=="ended") socket.emit("nextStage", currentStage);
  }

  function updateBracketDisplay(){
    bracket.innerHTML="";
    tournamentBracket.forEach(m=>{
      bracket.innerHTML += `${m.player1.nick} vs ${m.player2.nick} → Winner: ${m.winner}<br>`;
    });
  }

  // ---------- STAGE UPDATE ----------
  socket.on("updateStage", matches=>{
    renderMatches(matches);
  });

  document.body.style.overflowY="auto";
});