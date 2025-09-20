document.addEventListener("DOMContentLoaded", () => {
  // --- MUSICA ---
  const bgMusic = new Audio("img/1.mp3");
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.play().catch(()=>{
    document.body.addEventListener("click", ()=> bgMusic.play(), { once:true });
  });

  // --- MUTE BUTTON ---
  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", ()=>{
    if(bgMusic.paused){
      bgMusic.play();
      muteBtn.textContent = "🔊";
    } else {
      bgMusic.pause();
      muteBtn.textContent = "🔇";
    }
  });

  // --- NICKNAME ---
  const nicknameInput = document.getElementById("nicknameInput");
  const nicknameBtn = document.getElementById("nicknameBtn");
  nicknameBtn.addEventListener("click", ()=>{
    const nick = nicknameInput.value.trim();
    if(!nick) return alert("Insert nickname!");
    localStorage.setItem("nickname", nick);
    alert(`Nickname saved: ${nick}`);
  });

  // --- CAMPIONI ---
  const champs = document.querySelectorAll(".champ");
  let selectedChampion = null;
  champs.forEach(champ=>{
    champ.addEventListener("click", ()=>{
      champs.forEach(c=>c.classList.remove("selected"));
      champ.classList.add("selected");
      selectedChampion = champ.dataset.name;
      localStorage.setItem("champion", selectedChampion);
    });
  });

  // --- MODALITÀ ---
  document.getElementById("btn1v1").onclick = ()=>{
    const nick = localStorage.getItem("nickname");
    const champ = localStorage.getItem("champion");
    if(!nick) return alert("Insert a nickname!");
    if(!champ) return alert("Select a champion!");
    window.location.href = "fight.html";
  };
  document.getElementById("btnTournament").onclick = ()=> alert("Repo torneo...");
});