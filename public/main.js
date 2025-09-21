const nicknameInput = document.getElementById("nickname");
const confirmBtn = document.getElementById("confirm-nick");
const chars = document.querySelectorAll(".char");
const mode1 = document.getElementById("mode-1vs1");
const mode2 = document.getElementById("mode-tournament");

let nickConfirmed = false;
let selectedChar = null;

// Conferma nickname
confirmBtn.onclick = () => {
  if(nicknameInput.value.trim() !== ""){
    nickConfirmed = true;
    confirmBtn.disabled = true;
    nicknameInput.disabled = true;
    alert("Nickname confirmed!");
  }
};

// Selezione personaggio
chars.forEach(c=>{
  c.onclick = ()=>{
    if(!nickConfirmed) return;
    chars.forEach(el=>el.classList.remove("selected"));
    c.classList.add("selected");
    selectedChar = c.dataset.char;
    mode1.disabled = false;
    mode2.disabled = false;
  };
});

// Rules popup
document.getElementById("rules-btn").onclick = ()=>{
  document.getElementById("rules-popup").classList.remove("hidden");
};
document.getElementById("close-rules").onclick = ()=>{
  document.getElementById("rules-popup").classList.add("hidden");
};

// Music toggle
const music = new Audio("img/8.mp3");
music.loop = true;
document.getElementById("music-toggle").onclick = ()=>{
  if(music.paused) music.play();
  else music.pause();
};

// Fullscreen + orientamento mobile
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");

fullscreenBtn.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    try {
      if (container.requestFullscreen) await container.requestFullscreen();
      else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
      else if (container.msRequestFullscreen) await container.msRequestFullscreen();

      // MOBILE: forza landscape
      if(window.innerWidth < 900 && screen.orientation && screen.orientation.lock){
        try { await screen.orientation.lock('landscape'); }
        catch(e){ console.log("Lock landscape non supportato."); }
      }
    } catch(err){
      alert("Fullscreen non supportato su questo dispositivo.");
    }
  } else {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();

    // MOBILE: sblocca orientamento
    if(window.innerWidth < 900 && screen.orientation && screen.orientation.unlock){
      screen.orientation.unlock();
    }
  }
});