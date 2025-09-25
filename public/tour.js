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
  const bracketDiv = document.getElementById("bracket");
  const closeOverlayBtn = document.getElementById("close-overlay");

  // ---------- WAITING MESSAGE ----------
  const waitingDiv = document.createElement("div");
  waitingDiv.id = "waiting-msg";
  waitingDiv.style.textAlign = "center";
  waitingDiv.style.margin = "10px 0";
  battleArea.before(waitingDiv);

  // ---------- FULLSCREEN ----------
  fullscreenBtn.addEventListener("click", async () => {
    const container = document.getElementById("game-container");
    if (!document.fullscreenElement) await container.requestFullscreen();
    else await document.exitFullscreen();
  });

  // ---------- TROPHY OVERLAY ----------
  trophyBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
  closeOverlayBtn.addEventListener("click", () => overlay.classList.add("hidden"));

  // ---------- MUSICA ----------
  const stageMusic = {5:"img/5.mp3",6:"img/6.mp3",7:"img/7.mp3"};
  let battleMusic = new Audio(); battleMusic.loop = true; battleMusic.volume = 0.5;
  let winnerMusic = new Audio(); winnerMusic.loop = false; winnerMusic.volume = 0.7;
  let activeWinnerMusic = false;

  function playStageMusic(stage){
    if(stageMusic[stage]){
      battleMusic.src = stageMusic[stage];
      battleMusic.play().catch(()=>{});
    }
  }

  function playWinnerMusicLoop(char){
    winnerMusic.src = `img/${char}.mp3`;
    winnerMusic.loop = true;
    winnerMusic.play().catch(()=>{});
  }

  function stopWinnerMusic(){
    winnerMusic.pause();
    winnerMusic.currentTime = 0;
    activeWinnerMusic = false;
  }

  // ---------- JOIN ----------
  const nick = localStorage.getItem("selectedNick");
  const char = localStorage.getItem("selectedChar");
  if(!nick || !char){ alert("Nickname o character non selezionati!"); }
  else { socket.emit("joinTournament", {nick, char}); }

  // ---------- WAITING COUNT ----------
  socket.on("waitingCount", data => {
    waitingDiv.textContent = data.count < data.required 
      ? `Waiting for ${data.count}/${data.required} players...` 
      : "";
  });

  // ---------- CHAT ----------
  chatInput.addEventListener("keydown", e => {
    if(e.key==="Enter" && e.target.value.trim()!==""){
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

  // ---------- TOURNAMENT STATE ----------
  let tournamentBracket = [];
  let stageMatchesCount = {quarter:0, semi:0, final:0};
  let stageMatchesFinished = {quarter:0, semi:0, final:0};

  // ---------- MATCH & BRACKET ----------
  socket.on("matchStart", data => updateMatches([data]));
  socket.on("updateMatch", data => updateMatches([data]));

  function updateMatches(matches){
    battleArea.innerHTML = "";
    matches.forEach(match=>{
      const container = document.createElement("div");
      container.classList.add("match-container");

      const p1Div = createPlayerDiv(match.player1);
      const p2Div = createPlayerDiv(match.player2);

      container.appendChild(p1Div);
      container.appendChild(p2Div);
      battleArea.appendChild(container);

      if(match.stage) playStageMusic(match.stage);

      // Conta quante partite ci sono in questo stage
      if(stageMatchesCount[match.stage]===0) stageMatchesCount[match.stage]=1;
      else stageMatchesCount[match.stage]++;
    });
    updateBracketDisplay();
  }

  function createPlayerDiv(player){
    const div = document.createElement("div");
    div.classList.add("player");
    div.innerHTML = `
      <div class="player-label">${player.nick} (${player.char}) HP: ${player.hp}</div>
      <img class="char-img" src="img/${player.char}.webp" alt="${player.nick}">
      <div class="hp-bar"><div class="hp" style="width:${player.hp}%"></div></div>
      <img class="dice" src="img/dice1.png">
    `;
    return div;
  }

  // ---------- LOG & HP ----------
  socket.on("log", msg=>{
    addEventMessage(msg);

    battleArea.querySelectorAll(".match-container").forEach(container=>{
      container.querySelectorAll(".player").forEach(div=>{
        const diceImg = div.querySelector(".dice");
        const hpDiv = div.querySelector(".hp");
        const playerNick = div.querySelector(".player-label").textContent.split(" ")[0];

        if(msg.includes(playerNick)){
          const diceVal = msg.match(/rolls (\d+)/)?.[1] || 1;
          diceImg.src = `img/dice${diceVal}.png`;
          diceImg.style.width = "80px";
          diceImg.style.height = "80px";

          const dmg = parseInt(msg.match(/deals (\d+)/)?.[1] || 0);
          let currentHP = parseInt(hpDiv.style.width);
          if(isNaN(currentHP)) currentHP = 80; // default
          const newHP = Math.max(0, currentHP - dmg);
          animateHP(hpDiv, currentHP, newHP);

          showEventEffect(div, diceVal==8?"⚡":"💥");
        }
      });
    });
  });

  function animateHP(hpDiv, from, to){
    const step = from>to?-1:1;
    let val=from;
    const interval = setInterval(()=>{
      if(val===to){ clearInterval(interval); return; }
      val+=step;
      hpDiv.style.width=val+"%";
    },30);
  }

  // ---------- MATCH/TORNEO FINITI ----------
  socket.on("matchOver", data=>{
    addEventMessage(`🏆 ${data.winner} won the match!`);

    tournamentBracket.push({
      player1: data.player1.nick, 
      player2: data.player2.nick, 
      winner: data.winner,
      stage: data.stage
    });

    // Controlla se tutte le partite di questo stage sono finite
    stageMatchesFinished[data.stage] = (stageMatchesFinished[data.stage]||0)+1;
    if(stageMatchesFinished[data.stage] < stageMatchesCount[data.stage]){
      // suona musica vincitore solo fino alla fine del turno
      if(!activeWinnerMusic){
        winnerMusic.src = `img/${data.winner}.mp3`;
        winnerMusic.loop=false;
        winnerMusic.play().catch(()=>{});
        activeWinnerMusic=true;
      }
    } else {
      stopWinnerMusic();
    }

    updateBracketDisplay();
  });

  socket.on("tournamentOver", winner=>{
    addEventMessage(`🏆 ${winner.nick} won the Tournament!`);
    battleArea.innerHTML="";
    document.body.style.backgroundImage=`url("img/${winner.char}.webp")`;
    playWinnerMusicLoop(winner.char);
    waitingDiv.textContent="";
  });

  function updateBracketDisplay(){
    bracketDiv.innerHTML="";
    tournamentBracket.forEach(m=>{
      const row = document.createElement("div");
      row.textContent = `[${m.stage?.toUpperCase()||""}] ${m.player1} vs ${m.player2} → Winner: ${m.winner}`;
      bracketDiv.appendChild(row);
    });
  }

  document.body.style.overflowY="auto";
});