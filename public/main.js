const nicknameInput = document.getElementById("nickname");
const confirmBtn = document.getElementById("confirm-nick");
const chars = document.querySelectorAll(".char");
const mode1 = document.getElementById("mode-1vs1");
const mode2 = document.getElementById("mode-tournament");

// Music autoplay
const music = new Audio("img/8.mp3");
music.loop = true;
music.play().catch(()=>{}); // evita errori se autoplay bloccato

// Nickname
let nickConfirmed = false;
let selectedChar = null;
confirmBtn.onclick = () => {
  if(nicknameInput.value.trim() !== ""){
    nickConfirmed = true;
    confirmBtn.disabled = true;
    nicknameInput.disabled = true;
    alert("Nickname confirmed!");
  }
};

// Personaggi
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
document.getElementById("music-toggle").onclick = ()=>{
  if(music.paused) music.play();
  else music.pause();
};

// Fullscreen ottimizzato mobile con fallback
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container = document.getElementById("game-container");
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

fullscreenBtn.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      // Provo fullscreen
      if (container.requestFullscreen) await container.requestFullscreen();
      else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
      else if (container.msRequestFullscreen) await container.msRequestFullscreen();

      // Lock orientamento landscape su mobile
      if (isMobile && screen.orientation && screen.orientation.lock) {
        try { 
          await screen.orientation.lock("landscape"); 
        } catch(e) { console.warn("Orientamento non supportato"); }
      }

      // Fallback per visualizzazione completa su mobile
      if(isMobile) {
        container.style.width = "100vw";
        container.style.height = "100vw"; // usa larghezza come altezza per adattare orizzontalmente
        container.style.overflow = "auto";
      }

    } else {
      // Esco dal fullscreen
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();

      // Unlock orientamento su mobile
      if (isMobile && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();

      // Ripristino dimensioni container
      container.style.width = "100vw";
      container.style.height = "100vh";
      container.style.overflow = "hidden";
    }
  } catch(e) {
    console.warn("Fullscreen/Orientamento non supportato", e);
    // Fallback automatico se tutto fallisce
    if(isMobile){
      container.style.width = "100vw";
      container.style.height = "100vw";
      container.style.overflow = "auto";
    }
  }
});